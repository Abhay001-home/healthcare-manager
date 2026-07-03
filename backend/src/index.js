require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const { connectDB } = require('./config/db');
const logger     = require('./config/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { startJobs } = require('./jobs/scheduler');

// ── Eagerly load all Mongoose models so indexes are created on startup ──
require('./models/User');
require('./models/Patient');
require('./models/Doctor');
require('./models/Appointment');
require('./models/EmailLog');
require('./models/MedicationReminder');

// ── Routes ──────────────────────────────────────────────────────────────────
const authRoutes        = require('./routes/auth');
const doctorRoutes      = require('./routes/doctors');
const appointmentRoutes = require('./routes/appointments');
const adminRoutes       = require('./routes/admin');
const calendarRoutes    = require('./routes/calendar');

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({
  origin: (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map((s) => s.trim()),
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Global rate limiter
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }));
// Auth limiter
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use('/api/auth',         authRoutes);
app.use('/api/doctors',      doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/calendar',     calendarRoutes);

app.use(notFound);
app.use(errorHandler);

// Connect DB first, then start server
connectDB().then(() => {
  app.listen(PORT, () => {
    logger.info(`🏥  Healthcare API → http://localhost:${PORT}`);
    logger.info(`   DB: MongoDB | Env: ${process.env.NODE_ENV || 'development'}`);
    startJobs();
  });
});

module.exports = app;
