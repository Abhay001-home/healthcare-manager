const nodemailer = require('nodemailer');
const EmailLog   = require('../models/EmailLog');
const logger     = require('../config/logger');

/* ── Transport ──────────────────────────────────────────────────────────── */
let transporter;
if (process.env.SENDGRID_API_KEY) {
  transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net', port: 587,
    auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
  });
  logger.info('Email transport: SendGrid');
} else {
  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  logger.info('Email transport: SMTP', { host: process.env.SMTP_HOST });
}

const FROM = process.env.MAIL_FROM || '"Meridian Clinic" <noreply@clinic.test>';

/* ── Core send + log ────────────────────────────────────────────────────── */
async function sendEmail({ to, subject, html, text, appointmentId = null, emailType = null }) {
  const log = await EmailLog.create({
    to_email: to, subject,
    body_text: text || '', body_html: html || '',
    appointment_id: appointmentId, email_type: emailType,
    status: 'queued',
  });

  try {
    await transporter.sendMail({ from: FROM, to, subject, html, text });
    await EmailLog.findByIdAndUpdate(log._id, {
      status: 'sent', attempts: 1, last_attempted: new Date(),
    });
    logger.info('Email sent', { to, subject });
    return { ok: true, logId: log._id };
  } catch (err) {
    await EmailLog.findByIdAndUpdate(log._id, {
      status: 'failed', attempts: 1,
      last_attempted: new Date(), error_message: err.message,
    });
    logger.error('Email failed', { to, subject, err: err.message });
    return { ok: false, logId: log._id, error: err.message };
  }
}

/* ── Retry job (called by scheduler) ───────────────────────────────────── */
async function retryFailedEmails() {
  const failed = await EmailLog.find({ status: 'failed', attempts: { $lt: 3 } }).limit(10);
  for (const row of failed) {
    try {
      await transporter.sendMail({ from: FROM, to: row.to_email, subject: row.subject, html: row.body_html, text: row.body_text });
      await EmailLog.findByIdAndUpdate(row._id, { status: 'sent', $inc: { attempts: 1 }, last_attempted: new Date() });
      logger.info('Retry email sent', { id: row._id });
    } catch (err) {
      await EmailLog.findByIdAndUpdate(row._id, { $inc: { attempts: 1 }, last_attempted: new Date(), error_message: err.message });
    }
  }
}

/* ── Typed email builders ───────────────────────────────────────────────── */
function bookingConfirmationEmail({ to, patientName, doctorName, specialisation, date, time }) {
  return {
    to, subject: 'Your appointment is confirmed — Meridian Clinic',
    html: `<p>Hi ${patientName},</p><p>Your appointment is confirmed:</p>
      <ul><li><strong>Doctor:</strong> ${doctorName} (${specialisation})</li>
      <li><strong>Date:</strong> ${date}</li><li><strong>Time:</strong> ${time}</li></ul>
      <p>A Google Calendar invite has been sent to your email.</p><p>Meridian Clinic</p>`,
  };
}

function doctorBookingEmail({ to, doctorName, patientName, date, time }) {
  return {
    to, subject: `New appointment: ${patientName} on ${date} at ${time}`,
    html: `<p>Hi ${doctorName},</p><p>New appointment:</p>
      <ul><li><strong>Patient:</strong> ${patientName}</li>
      <li><strong>Date:</strong> ${date}</li><li><strong>Time:</strong> ${time}</li></ul>
      <p>Pre-visit symptom notes are available in the doctor portal.</p><p>Meridian Clinic</p>`,
  };
}

function cancellationEmail({ to, recipientName, doctorName, date, time }) {
  return {
    to, subject: 'Appointment cancelled — Meridian Clinic',
    html: `<p>Hi ${recipientName},</p>
      <p>Your appointment with ${doctorName} on <strong>${date} at ${time}</strong> has been cancelled.</p>
      <p>Please book a new appointment if you still need to be seen.</p><p>Meridian Clinic</p>`,
  };
}

function postVisitEmail({ to, patientName, summary, medicationSchedule, followUpAdvice }) {
  const medList = medicationSchedule?.length
    ? `<ul>${medicationSchedule.map((m) => `<li><strong>${m.drug}:</strong> ${m.instructions}</li>`).join('')}</ul>`
    : '<p>No medications prescribed.</p>';
  return {
    to, subject: 'Your visit summary — Meridian Clinic',
    html: `<p>Hi ${patientName},</p><p>${summary}</p>
      <h3>Medication Schedule</h3>${medList}
      <p><strong>Next steps:</strong> ${followUpAdvice}</p><p>Meridian Clinic</p>`,
    text: `${summary}\n\n${followUpAdvice}`,
  };
}

function medicationReminderEmail({ to, patientName, drug, dosage, frequency }) {
  return {
    to, subject: `Medication reminder: ${drug} — Meridian Clinic`,
    html: `<p>Hi ${patientName}, this is your daily reminder:</p>
      <p><strong>${drug}</strong>${dosage ? ` (${dosage})` : ''} — ${frequency}</p><p>Meridian Clinic</p>`,
  };
}

function leaveNotificationEmail({ to, patientName, doctorName, date }) {
  return {
    to, subject: 'Appointment cancelled — Doctor on leave',
    html: `<p>Hi ${patientName},</p>
      <p>Your appointment with ${doctorName} on <strong>${date}</strong> has been cancelled because the doctor is on leave that day.</p>
      <p>Please book with another available doctor or reschedule.</p><p>Meridian Clinic</p>`,
  };
}

module.exports = {
  sendEmail, retryFailedEmails,
  bookingConfirmationEmail, doctorBookingEmail, cancellationEmail,
  postVisitEmail, medicationReminderEmail, leaveNotificationEmail,
};
