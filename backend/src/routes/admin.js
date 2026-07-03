const router      = require('express').Router();
const bcrypt      = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User        = require('../models/User');
const Doctor      = require('../models/Doctor');
const Patient     = require('../models/Patient');
const Appointment = require('../models/Appointment');
const EmailLog    = require('../models/EmailLog');
const MedicationReminder = require('../models/MedicationReminder');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendEmail, leaveNotificationEmail } = require('../services/email');
const { deleteCalendarEvent } = require('../services/calendar');
const logger = require('../config/logger');

router.use(authenticate, requireRole('admin'));

/* ── GET /api/admin/stats ────────────────────────────────────────────────── */
router.get('/stats', async (_req, res, next) => {
  try {
    const [confirmedCount, completedCount, cancelledCount, patientCount, doctorCount, emailSent, emailFailed, emailQueued] = await Promise.all([
      Appointment.countDocuments({ status: 'confirmed' }),
      Appointment.countDocuments({ status: 'completed' }),
      Appointment.countDocuments({ status: 'cancelled' }),
      Patient.countDocuments(),
      Doctor.countDocuments(),
      EmailLog.countDocuments({ status: 'sent' }),
      EmailLog.countDocuments({ status: 'failed' }),
      EmailLog.countDocuments({ status: 'queued' }),
    ]);
    return res.json({
      appointments: { confirmed: confirmedCount, completed: completedCount, cancelled: cancelledCount },
      patients: { total: patientCount },
      doctors:  { total: doctorCount },
      emails:   { sent: emailSent, failed: emailFailed, queued: emailQueued },
    });
  } catch (err) { next(err); }
});

/* ── GET /api/admin/doctors ──────────────────────────────────────────────── */
router.get('/doctors', async (_req, res, next) => {
  try {
    const doctors = await Doctor.find().populate('_id', 'name email createdAt').lean();
    return res.json(doctors.map(({ _id: u, ...d }) => ({
      id: u._id, name: u.name, email: u.email, created_at: u.createdAt,
      specialisation: d.specialisation, qualification: d.qualification,
      working_start: d.working_start, working_end: d.working_end, slot_duration: d.slot_duration,
    })));
  } catch (err) { next(err); }
});

/* ── POST /api/admin/doctors ─────────────────────────────────────────────── */
router.post('/doctors',
  [body('name').trim().notEmpty(), body('email').isEmail().normalizeEmail(), body('password').isLength({ min: 6 }), body('specialisation').notEmpty()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { name, email, password, specialisation, qualification, working_start, working_end, slot_duration } = req.body;
      const existing = await User.findOne({ email });
      if (existing) return res.status(409).json({ error: 'Email already in use.' });

      const hash = await bcrypt.hash(password, 12);
      const user = await User.create({ name, email, password_hash: hash, role: 'doctor' });
      await Doctor.create({
        _id: user._id, specialisation, qualification: qualification || null,
        working_start: working_start || '09:00', working_end: working_end || '17:00',
        slot_duration: Number(slot_duration) || 20,
      });
      logger.info('Admin created doctor', { id: user._id, name });
      return res.status(201).json({ id: user._id });
    } catch (err) { next(err); }
  }
);

/* ── PUT /api/admin/doctors/:id ──────────────────────────────────────────── */
router.put('/doctors/:id', async (req, res, next) => {
  try {
    const { name, specialisation, qualification, working_start, working_end, slot_duration } = req.body;
    if (name) await User.findByIdAndUpdate(req.params.id, { name });
    await Doctor.findByIdAndUpdate(req.params.id, {
      ...(specialisation && { specialisation }),
      ...(qualification  && { qualification }),
      ...(working_start  && { working_start }),
      ...(working_end    && { working_end }),
      ...(slot_duration  && { slot_duration: Number(slot_duration) }),
    });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── POST /api/admin/doctors/:id/leave ───────────────────────────────────── */
router.post('/doctors/:id/leave', async (req, res, next) => {
  try {
    const { leave_date, reason } = req.body;
    if (!leave_date) return res.status(400).json({ error: 'leave_date required (YYYY-MM-DD)' });

    // Add leave (avoid duplicate)
    await Doctor.findByIdAndUpdate(req.params.id, {
      $addToSet: { leaves: { leave_date, reason: reason || null } },
    });

    // Find and cancel all confirmed / held appointments on that date
    const affected = await Appointment.find({
      doctor_id: req.params.id,
      appt_date: leave_date,
      status: { $in: ['confirmed', 'held'] },
    }).populate('patient_id', 'name email').populate('doctor_id', 'name email');

    let cancelledCount = 0;
    for (const appt of affected) {
      await Appointment.findByIdAndUpdate(appt._id, { status: 'cancelled' });
      cancelledCount++;
      sendEmail({
        ...leaveNotificationEmail({ to: appt.patient_id.email, patientName: appt.patient_id.name, doctorName: appt.doctor_id.name, date: leave_date }),
        appointmentId: appt._id, emailType: 'cancellation',
      }).catch(() => {});
      deleteCalendarEvent({ userId: appt.patient_id._id, role: 'patient', eventId: appt.patient_cal_event_id }).catch(() => {});
      deleteCalendarEvent({ userId: appt.doctor_id._id,  role: 'doctor',  eventId: appt.doctor_cal_event_id  }).catch(() => {});
    }

    logger.info('Doctor leave set', { doctorId: req.params.id, date: leave_date, affected: cancelledCount });
    return res.json({ ok: true, affected_bookings: cancelledCount });
  } catch (err) { next(err); }
});

/* ── DELETE /api/admin/doctors/:id/leave/:date ───────────────────────────── */
router.delete('/doctors/:id/leave/:date', async (req, res, next) => {
  try {
    await Doctor.findByIdAndUpdate(req.params.id, {
      $pull: { leaves: { leave_date: req.params.date } },
    });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── GET /api/admin/email-log ────────────────────────────────────────────── */
router.get('/email-log', async (req, res, next) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const filter = status ? { status } : {};
    const rows = await EmailLog.find(filter).sort({ createdAt: -1 }).skip(Number(offset)).limit(Number(limit)).lean();
    return res.json(rows.map((r) => ({ ...r, id: r._id })));
  } catch (err) { next(err); }
});

/* ── GET /api/admin/reminders ────────────────────────────────────────────── */
router.get('/reminders', async (_req, res, next) => {
  try {
    const rows = await MedicationReminder.find()
      .populate('patient_id', 'name email')
      .sort({ remind_date: -1 })
      .limit(100)
      .lean();
    return res.json(rows.map((r) => ({
      id: r._id,
      drug_name: r.drug_name, dosage: r.dosage, frequency: r.frequency,
      remind_date: r.remind_date, sent: r.sent, sent_at: r.sent_at,
      patient_name:  r.patient_id?.name,
      patient_email: r.patient_id?.email,
    })));
  } catch (err) { next(err); }
});

/* ── GET /api/admin/patients ─────────────────────────────────────────────── */
router.get('/patients', async (_req, res, next) => {
  try {
    const patients = await Patient.find().populate('_id', 'name email createdAt').lean();
    return res.json(patients.map(({ _id: u, ...p }) => ({
      id: u._id, name: u.name, email: u.email, created_at: u.createdAt,
      phone: p.phone, blood_group: p.blood_group,
    })));
  } catch (err) { next(err); }
});

module.exports = router;
