require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const bcrypt  = require('bcryptjs');
const { connectDB, mongoose } = require('../config/db');
const User    = require('../models/User');
const Doctor  = require('../models/Doctor');
const Patient = require('../models/Patient');
const logger  = require('../config/logger');

const HASH = (p) => bcrypt.hashSync(p, 10);

async function seed() {
  await connectDB();
  try {
    // ── Admin ──────────────────────────────────────────────────────────────
    await User.findOneAndUpdate(
      { email: 'admin@clinic.test' },
      { name: 'Clinic Admin', email: 'admin@clinic.test', password_hash: HASH('admin123'), role: 'admin' },
      { upsert: true, new: true }
    );

    // ── Doctors ────────────────────────────────────────────────────────────
    const doctorSeeds = [
      { name: 'Dr. Meera Anand', email: 'meera@clinic.test', spec: 'General Physician', start: '09:00', end: '13:00', slot: 20 },
      { name: 'Dr. Rahul Sen',   email: 'rahul@clinic.test', spec: 'Cardiology',         start: '14:00', end: '17:00', slot: 30 },
      { name: 'Dr. Priya Nair',  email: 'priya@clinic.test', spec: 'Dermatology',        start: '10:00', end: '12:30', slot: 15 },
    ];

    for (const d of doctorSeeds) {
      const user = await User.findOneAndUpdate(
        { email: d.email },
        { name: d.name, email: d.email, password_hash: HASH('doctor123'), role: 'doctor' },
        { upsert: true, new: true }
      );
      await Doctor.findByIdAndUpdate(
        user._id,
        { _id: user._id, specialisation: d.spec, working_start: d.start, working_end: d.end, slot_duration: d.slot },
        { upsert: true }
      );
    }

    // ── Patients ───────────────────────────────────────────────────────────
    const patientSeeds = [
      { name: 'Aman Gupta',  email: 'aman@mail.test', phone: '+91 98100 00001' },
      { name: 'Sana Kapoor', email: 'sana@mail.test', phone: '+91 98100 00002' },
    ];

    for (const p of patientSeeds) {
      const user = await User.findOneAndUpdate(
        { email: p.email },
        { name: p.name, email: p.email, password_hash: HASH('patient123'), role: 'patient' },
        { upsert: true, new: true }
      );
      await Patient.findByIdAndUpdate(
        user._id,
        { _id: user._id, phone: p.phone },
        { upsert: true }
      );
    }

    logger.info(`
✅  Seed complete. Demo credentials:
    Patient  → aman@mail.test   / patient123
    Patient  → sana@mail.test   / patient123
    Doctor   → meera@clinic.test / doctor123
    Doctor   → rahul@clinic.test / doctor123
    Admin    → admin@clinic.test  / admin123
`);
  } catch (err) {
    logger.error('Seed failed', { err: err.message });
  } finally {
    await mongoose.disconnect();
  }
}

seed();
