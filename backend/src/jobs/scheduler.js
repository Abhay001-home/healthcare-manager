const cron               = require('node-cron');
const Appointment        = require('../models/Appointment');
const MedicationReminder = require('../models/MedicationReminder');
const User               = require('../models/User');
const { sendEmail, medicationReminderEmail, retryFailedEmails } = require('../services/email');
const logger = require('../config/logger');

/* ── JOB 1: Medication reminders (daily) ────────────────────────────────── */
async function dispatchMedicationReminders() {
  logger.info('Running medication reminder job');
  try {
    const today     = new Date().toISOString().slice(0, 10);
    const reminders = await MedicationReminder.find({ remind_date: today, sent: false })
      .populate('patient_id', 'name email').lean();

    logger.info(`Found ${reminders.length} pending reminders`);
    for (const r of reminders) {
      const result = await sendEmail({
        ...medicationReminderEmail({
          to: r.patient_id.email, patientName: r.patient_id.name,
          drug: r.drug_name, dosage: r.dosage, frequency: r.frequency,
        }),
        emailType: 'medication_reminder',
      });
      if (result.ok) {
        await MedicationReminder.findByIdAndUpdate(r._id, { sent: true, sent_at: new Date() });
      }
    }
  } catch (err) { logger.error('Medication reminder job crashed', { err: err.message }); }
}

/* ── JOB 2: Email retry (every 15 min) ─────────────────────────────────── */
async function emailRetryJob() {
  logger.debug('Running email retry job');
  await retryFailedEmails().catch((err) => logger.error('Email retry job crashed', { err: err.message }));
}

/* ── JOB 3: Slot hold expiry cleanup (every 2 min) ─────────────────────── */
async function releaseExpiredHolds() {
  try {
    const result = await Appointment.updateMany(
      { status: 'held', hold_expires_at: { $lt: new Date() } },
      { status: 'cancelled' }
    );
    if (result.modifiedCount > 0) {
      logger.info(`Released ${result.modifiedCount} expired slot holds`);
    }
  } catch (err) { logger.error('Hold release job crashed', { err: err.message }); }
}

/* ── Register jobs ──────────────────────────────────────────────────────── */
function startJobs() {
  const reminderCron = process.env.REMINDER_CRON || '0 8 * * *';
  cron.schedule(reminderCron, dispatchMedicationReminders, { timezone: 'Asia/Kolkata' });
  logger.info(`Medication reminder job: ${reminderCron}`);

  cron.schedule('*/15 * * * *', emailRetryJob);
  logger.info('Email retry job: every 15 minutes');

  cron.schedule('*/2 * * * *', releaseExpiredHolds);
  logger.info('Slot hold cleanup: every 2 minutes');
}

module.exports = { startJobs, dispatchMedicationReminders };
