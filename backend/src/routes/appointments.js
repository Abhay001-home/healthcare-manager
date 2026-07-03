const router      = require('express').Router();
const { body, validationResult } = require('express-validator');
const mongoose    = require('mongoose');
const Appointment = require('../models/Appointment');
const Doctor      = require('../models/Doctor');
const User        = require('../models/User');
const MedicationReminder = require('../models/MedicationReminder');
const { authenticate, requireRole } = require('../middleware/auth');
const { generatePreVisitSummary, generatePostVisitSummary } = require('../services/llm');
const {
  sendEmail, bookingConfirmationEmail, doctorBookingEmail,
  cancellationEmail, postVisitEmail,
} = require('../services/email');
const { createCalendarEvent, deleteCalendarEvent } = require('../services/calendar');
const logger = require('../config/logger');

const HOLD_SECONDS = Number(process.env.SLOT_HOLD_SECONDS) || 120;

/* ── POST /api/appointments/hold ─────────────────────────────────────────── */
router.post('/hold',
  authenticate, requireRole('patient'),
  [body('doctor_id').notEmpty(), body('appt_date').notEmpty(), body('appt_time').matches(/^\d{2}:\d{2}$/)],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { doctor_id, appt_date, appt_time } = req.body;

      // Check leave
      const doc = await Doctor.findById(doctor_id).select('leaves').lean();
      if (doc?.leaves?.some((l) => l.leave_date === appt_date)) {
        return res.status(409).json({ error: 'Doctor is on leave this day.' });
      }

      const holdExpires = new Date(Date.now() + HOLD_SECONDS * 1000);
      try {
        const appt = await Appointment.create({
          patient_id: req.user._id,
          doctor_id,
          appt_date,
          appt_time,
          status: 'held',
          hold_expires_at: holdExpires,
        });
        return res.status(201).json({ hold_id: appt._id, expires_at: holdExpires });
      } catch (err) {
        if (err.code === 11000) {
          return res.status(409).json({ error: 'This slot was just booked. Please choose another time.' });
        }
        throw err;
      }
    } catch (err) { next(err); }
  }
);

/* ── POST /api/appointments/confirm ──────────────────────────────────────── */
router.post('/confirm',
  authenticate, requireRole('patient'),
  [
    body('hold_id').notEmpty(),
    body('symptom_text').trim().notEmpty(),
    body('duration_days').isInt({ min: 0 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { hold_id, symptom_text, duration_days } = req.body;

      const appt = await Appointment.findOne({ _id: hold_id, patient_id: req.user._id });
      if (!appt) return res.status(404).json({ error: 'Hold not found.' });
      if (appt.status !== 'held') return res.status(409).json({ error: `Slot is already ${appt.status}.` });
      if (appt.hold_expires_at < new Date()) {
        await Appointment.findByIdAndUpdate(hold_id, { status: 'cancelled' });
        return res.status(409).json({ error: 'Hold expired. Please select the slot again.' });
      }

      // Confirm + save symptom form atomically
      await Appointment.findByIdAndUpdate(hold_id, {
        status: 'confirmed',
        hold_expires_at: null,
        symptom_form: { symptom_text, duration_days, submitted_at: new Date() },
      });

      // Load related data for emails/calendar
      const doctor    = await Doctor.findById(appt.doctor_id).lean();
      const doctorUser = await User.findById(appt.doctor_id).select('name email').lean();
      const patient   = await User.findById(req.user._id).select('name email').lean();
      const dateStr   = appt.appt_date;
      const timeStr   = appt.appt_time;

      // Fire-and-forget side effects
      Promise.allSettled([
        generatePreVisitSummary(hold_id, symptom_text, Number(duration_days)),
        sendEmail({ ...bookingConfirmationEmail({ to: patient.email, patientName: patient.name, doctorName: doctorUser.name, specialisation: doctor.specialisation, date: dateStr, time: timeStr }), appointmentId: hold_id, emailType: 'booking_confirmation' }),
        sendEmail({ ...doctorBookingEmail({ to: doctorUser.email, doctorName: doctorUser.name, patientName: patient.name, date: dateStr, time: timeStr }), appointmentId: hold_id, emailType: 'booking_confirmation' }),
        (async () => {
          const id = await createCalendarEvent({ userId: req.user._id, role: 'patient', title: `Appointment with ${doctorUser.name}`, date: dateStr, time: timeStr, durationMinutes: doctor.slot_duration, description: `Meridian Clinic — ${doctor.specialisation}` });
          if (id) await Appointment.findByIdAndUpdate(hold_id, { patient_cal_event_id: id });
        })(),
        (async () => {
          const id = await createCalendarEvent({ userId: appt.doctor_id, role: 'doctor', title: `Patient: ${patient.name}`, date: dateStr, time: timeStr, durationMinutes: doctor.slot_duration, description: 'Meridian Clinic appointment' });
          if (id) await Appointment.findByIdAndUpdate(hold_id, { doctor_cal_event_id: id });
        })(),
      ]).then((results) => results.forEach((r, i) => r.status === 'rejected' && logger.warn('Side-effect failed', { i, err: r.reason?.message })));

      logger.info('Appointment confirmed', { id: hold_id, patientId: req.user._id });
      return res.json({ appointment_id: hold_id, status: 'confirmed' });
    } catch (err) { next(err); }
  }
);

/* ── GET /api/appointments ───────────────────────────────────────────────── */
router.get('/', authenticate, async (req, res, next) => {
  try {
    let query;

    if (req.user.role === 'patient') {
      query = Appointment.find({ patient_id: req.user._id, status: { $ne: 'held' } })
        .populate('doctor_id', 'name email')
        .lean();
    } else if (req.user.role === 'doctor') {
      query = Appointment.find({ doctor_id: req.user._id, status: { $ne: 'held' } })
        .populate('patient_id', 'name email')
        .lean();
    } else {
      // admin sees all
      query = Appointment.find({ status: { $ne: 'held' } })
        .populate('patient_id', 'name email')
        .populate('doctor_id', 'name email')
        .lean();
    }

    const appts = await query;

    // Flatten into a predictable shape for the frontend
    const result = appts.map((a) => {
      const base = {
        id: a._id,
        appt_date: a.appt_date,
        appt_time: a.appt_time,
        status: a.status,
        symptom_text:  a.symptom_form?.symptom_text,
        duration_days: a.symptom_form?.duration_days,
        urgency_level:       a.pre_visit_summary?.urgency_level,
        chief_complaint:     a.pre_visit_summary?.chief_complaint,
        suggested_questions: a.pre_visit_summary?.suggested_questions,
        patient_summary:     a.post_visit_summary?.patient_summary,
        medication_schedule: a.post_visit_summary?.medication_schedule,
        follow_up_advice:    a.post_visit_summary?.follow_up_advice,
      };
      if (req.user.role === 'patient') {
        base.doctor_name    = a.doctor_id?.name;
        base.doctor_email   = a.doctor_id?.email;
      } else if (req.user.role === 'doctor') {
        base.patient_name   = a.patient_id?.name;
        base.patient_email  = a.patient_id?.email;
        base.doctor_notes   = a.visit_notes?.notes;
      } else {
        base.patient_name   = a.patient_id?.name;
        base.doctor_name    = a.doctor_id?.name;
      }
      return base;
    });

    return res.json(result);
  } catch (err) { next(err); }
});

/* ── GET /api/appointments/:id ───────────────────────────────────────────── */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const appt = await Appointment.findById(req.params.id)
      .populate('patient_id', 'name email')
      .populate('doctor_id', 'name email')
      .lean();
    if (!appt) return res.status(404).json({ error: 'Not found.' });
    const doc = await Doctor.findById(appt.doctor_id).select('specialisation slot_duration').lean();
    return res.json({
      id: appt._id, appt_date: appt.appt_date, appt_time: appt.appt_time, status: appt.status,
      patient_name:  appt.patient_id?.name, patient_email: appt.patient_id?.email,
      doctor_name:   appt.doctor_id?.name,  doctor_email:  appt.doctor_id?.email,
      specialisation: doc?.specialisation,  slot_duration: doc?.slot_duration,
      symptom_text:  appt.symptom_form?.symptom_text,
      duration_days: appt.symptom_form?.duration_days,
      doctor_notes:  appt.visit_notes?.notes,
      prescriptions: appt.prescriptions,
      urgency_level:       appt.pre_visit_summary?.urgency_level,
      chief_complaint:     appt.pre_visit_summary?.chief_complaint,
      suggested_questions: appt.pre_visit_summary?.suggested_questions,
      patient_summary:     appt.post_visit_summary?.patient_summary,
      medication_schedule: appt.post_visit_summary?.medication_schedule,
      follow_up_advice:    appt.post_visit_summary?.follow_up_advice,
    });
  } catch (err) { next(err); }
});

/* ── DELETE /api/appointments/:id  (cancel) ─────────────────────────────── */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const appt = await Appointment.findById(req.params.id)
      .populate('patient_id', 'name email')
      .populate('doctor_id', 'name email');
    if (!appt) return res.status(404).json({ error: 'Not found.' });

    const canCancel = req.user.role === 'admin' ||
      req.user._id.equals(appt.patient_id._id) ||
      req.user._id.equals(appt.doctor_id._id);
    if (!canCancel) return res.status(403).json({ error: 'Forbidden.' });
    if (appt.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled.' });

    await Appointment.findByIdAndUpdate(req.params.id, { status: 'cancelled' });

    Promise.allSettled([
      sendEmail({ ...cancellationEmail({ to: appt.patient_id.email, recipientName: appt.patient_id.name, doctorName: appt.doctor_id.name, date: appt.appt_date, time: appt.appt_time }), appointmentId: appt._id, emailType: 'cancellation' }),
      sendEmail({ ...cancellationEmail({ to: appt.doctor_id.email,  recipientName: appt.doctor_id.name,  doctorName: appt.doctor_id.name, date: appt.appt_date, time: appt.appt_time }), appointmentId: appt._id, emailType: 'cancellation' }),
      deleteCalendarEvent({ userId: appt.patient_id._id, role: 'patient', eventId: appt.patient_cal_event_id }),
      deleteCalendarEvent({ userId: appt.doctor_id._id,  role: 'doctor',  eventId: appt.doctor_cal_event_id  }),
    ]).then((rs) => rs.forEach((r, i) => r.status === 'rejected' && logger.warn('Cancel side-effect failed', { i, err: r.reason?.message })));

    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── POST /api/appointments/:id/pre-visit-summary ───────────────────────── */
router.post('/:id/pre-visit-summary', authenticate, requireRole('doctor', 'admin'), async (req, res, next) => {
  try {
    const appt = await Appointment.findById(req.params.id).select('symptom_form').lean();
    if (!appt?.symptom_form) return res.status(400).json({ error: 'No symptom form submitted.' });
    const summary = await generatePreVisitSummary(req.params.id, appt.symptom_form.symptom_text, appt.symptom_form.duration_days);
    return res.json(summary);
  } catch (err) { next(err); }
});

/* ── POST /api/appointments/:id/post-visit ──────────────────────────────── */
router.post('/:id/post-visit',
  authenticate, requireRole('doctor'),
  [body('notes').trim().notEmpty(), body('prescriptions').isArray()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { notes, prescriptions = [] } = req.body;
      const appt = await Appointment.findById(req.params.id)
        .populate('patient_id', 'name email');
      if (!appt) return res.status(404).json({ error: 'Not found.' });
      if (!appt.doctor_id.equals(req.user._id)) return res.status(403).json({ error: 'Forbidden.' });
      if (appt.status === 'cancelled') return res.status(400).json({ error: 'Cannot add notes to a cancelled appointment.' });

      const validRx = prescriptions.filter((p) => p.drug_name?.trim());

      // Update appointment with notes, prescriptions, completed status
      await Appointment.findByIdAndUpdate(req.params.id, {
        visit_notes:  { notes, submitted_at: new Date() },
        prescriptions: validRx,
        status: 'completed',
      });

      // Schedule medication reminders (one per drug per day of course)
      const today = new Date();
      const reminders = [];
      for (const rx of validRx) {
        for (let day = 0; day < (rx.duration_days || 1); day++) {
          const d = new Date(today);
          d.setDate(d.getDate() + day);
          reminders.push({
            appointment_id: appt._id,
            patient_id:     appt.patient_id._id,
            remind_date:    d.toISOString().slice(0, 10),
            drug_name:      rx.drug_name,
            dosage:         rx.dosage,
            frequency:      rx.frequency || 'Once daily',
          });
        }
      }
      if (reminders.length) await MedicationReminder.insertMany(reminders, { ordered: false }).catch(() => {});

      // AI post-visit summary + email
      const summary = await generatePostVisitSummary(req.params.id, notes, validRx);

      sendEmail({
        ...postVisitEmail({
          to: appt.patient_id.email, patientName: appt.patient_id.name,
          summary: summary.patient_summary,
          medicationSchedule: summary.medication_schedule,
          followUpAdvice: summary.follow_up_advice,
        }),
        appointmentId: appt._id, emailType: 'post_visit',
      }).catch((e) => logger.warn('Post-visit email failed', { err: e.message }));

      return res.json({ ok: true, summary });
    } catch (err) { next(err); }
  }
);

module.exports = router;
