const router = require('express').Router();
const Doctor = require('../models/Doctor');
const User   = require('../models/User');
const Appointment = require('../models/Appointment');
const { authenticate, requireRole } = require('../middleware/auth');

function generateSlots(start, end, duration) {
  const slots = [];
  let [h, m] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  while (h * 60 + m + duration <= eh * 60 + em) {
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    const t = h * 60 + m + duration;
    h = Math.floor(t / 60); m = t % 60;
  }
  return slots;
}

/* ── GET /api/doctors ────────────────────────────────────────────────────── */
router.get('/', async (req, res, next) => {
  try {
    const { specialisation } = req.query;
    const filter = specialisation ? { specialisation: { $regex: specialisation, $options: 'i' } } : {};
    const doctors = await Doctor.find(filter).populate('_id', 'name email').lean();
    const result = doctors.map(({ _id: u, ...d }) => ({
      id: u._id, name: u.name, email: u.email,
      specialisation: d.specialisation, qualification: d.qualification,
      working_start: d.working_start, working_end: d.working_end, slot_duration: d.slot_duration,
    }));
    return res.json(result);
  } catch (err) { next(err); }
});

/* ── GET /api/doctors/specialisations ───────────────────────────────────── */
router.get('/specialisations', async (_req, res, next) => {
  try {
    const specs = await Doctor.distinct('specialisation');
    return res.json(specs.sort());
  } catch (err) { next(err); }
});

/* ── GET /api/doctors/:id ────────────────────────────────────────────────── */
router.get('/:id', async (req, res, next) => {
  try {
    const doc  = await Doctor.findById(req.params.id).lean();
    const user = await User.findById(req.params.id).select('name email').lean();
    if (!doc || !user) return res.status(404).json({ error: 'Doctor not found.' });
    return res.json({
      id: user._id, name: user.name, email: user.email,
      specialisation: doc.specialisation, qualification: doc.qualification,
      working_start: doc.working_start, working_end: doc.working_end, slot_duration: doc.slot_duration,
    });
  } catch (err) { next(err); }
});

/* ── GET /api/doctors/:id/availability?date=YYYY-MM-DD ──────────────────── */
router.get('/:id/availability', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

    const doc = await Doctor.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Doctor not found.' });

    const onLeave = doc.leaves?.some((l) => l.leave_date === date);
    if (onLeave) return res.json({ available: false, reason: 'Doctor on leave', slots: [] });

    const allSlots = generateSlots(doc.working_start, doc.working_end, doc.slot_duration);

    const booked = await Appointment.find({
      doctor_id: req.params.id,
      appt_date: date,
      status: { $nin: ['cancelled', 'no_show'] },
    }).select('appt_time').lean();
    const bookedTimes = new Set(booked.map((b) => b.appt_time));

    return res.json({
      available: true,
      slots: allSlots.map((t) => ({ time: t, available: !bookedTimes.has(t) })),
    });
  } catch (err) { next(err); }
});

/* ── PUT /api/doctors/:id ────────────────────────────────────────────────── */
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const isSelf  = req.user._id.toString() === req.params.id;
    if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Forbidden.' });

    const { specialisation, qualification, working_start, working_end, slot_duration, name } = req.body;
    if (name) await User.findByIdAndUpdate(req.params.id, { name });
    await Doctor.findByIdAndUpdate(req.params.id, {
      ...(specialisation  && { specialisation }),
      ...(qualification   && { qualification }),
      ...(working_start   && { working_start }),
      ...(working_end     && { working_end }),
      ...(slot_duration   && { slot_duration: Number(slot_duration) }),
    });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── GET /api/doctors/:id/leaves ─────────────────────────────────────────── */
router.get('/:id/leaves', async (req, res, next) => {
  try {
    const doc = await Doctor.findById(req.params.id).select('leaves').lean();
    return res.json(doc?.leaves || []);
  } catch (err) { next(err); }
});

module.exports = router;
