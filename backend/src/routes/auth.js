const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User    = require('../models/User');
const Patient = require('../models/Patient');
const Doctor  = require('../models/Doctor');
const { authenticate } = require('../middleware/auth');
const logger  = require('../config/logger');

const signToken = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

/* ── POST /api/auth/register ─────────────────────────────────────────────── */
router.post('/register',
  [
    body('name').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['patient', 'doctor', 'admin']),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { name, email, password, role, specialisation, working_start, working_end, slot_duration } = req.body;

      const existing = await User.findOne({ email });
      if (existing) return res.status(409).json({ error: 'Email already registered.' });

      const password_hash = await bcrypt.hash(password, 12);
      const user = await User.create({ name, email, password_hash, role });

      if (role === 'patient') {
        await Patient.create({ _id: user._id });
      } else if (role === 'doctor') {
        await Doctor.create({
          _id: user._id,
          specialisation: specialisation || 'General',
          working_start:  working_start  || '09:00',
          working_end:    working_end    || '17:00',
          slot_duration:  Number(slot_duration) || 20,
        });
      }

      logger.info('New user registered', { id: user._id, role });
      return res.status(201).json({
        token: signToken(user._id),
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      });
    } catch (err) { next(err); }
  }
);

/* ── POST /api/auth/login ────────────────────────────────────────────────── */
router.post('/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

      logger.info('User logged in', { id: user._id, role: user.role });
      return res.json({
        token: signToken(user._id),
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      });
    } catch (err) { next(err); }
  }
);

/* ── GET /api/auth/me ────────────────────────────────────────────────────── */
router.get('/me', authenticate, (req, res) => {
  const { _id, name, email, role } = req.user;
  return res.json({ id: _id, name, email, role });
});

module.exports = router;
