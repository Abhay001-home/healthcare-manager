const { google } = require('googleapis');
const crypto     = require('crypto');
const Doctor     = require('../models/Doctor');
const Patient    = require('../models/Patient');
const logger     = require('../config/logger');

function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

const ENC_KEY = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || '0'.repeat(64), 'hex');

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY, iv);
  return iv.toString('hex') + ':' + Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('hex');
}

function decrypt(enc) {
  const [ivHex, dataHex] = enc.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENC_KEY, Buffer.from(ivHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

function getAuthUrl(userId) {
  return makeOAuthClient().generateAuthUrl({
    access_type: 'offline', prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state: userId.toString(),
  });
}

async function handleOAuthCallback(code, userId, role) {
  const { tokens } = await makeOAuthClient().getToken(code);
  const encrypted  = encrypt(JSON.stringify(tokens));
  if (role === 'doctor') {
    await Doctor.findByIdAndUpdate(userId, { calendar_tokens: encrypted });
  } else {
    await Patient.findByIdAndUpdate(userId, { calendar_tokens: encrypted }).catch(() => {});
  }
  logger.info('Google OAuth tokens stored', { userId, role });
  return tokens;
}

async function getCalendarClient(userId, role) {
  let doc = role === 'doctor'
    ? await Doctor.findById(userId).select('calendar_tokens')
    : await Patient.findById(userId).select('calendar_tokens').catch(() => null);

  if (!doc?.calendar_tokens) return null;

  const tokens = JSON.parse(decrypt(doc.calendar_tokens));
  const oauth2Client = makeOAuthClient();
  oauth2Client.setCredentials(tokens);
  oauth2Client.on('tokens', async (newTokens) => {
    Object.assign(tokens, newTokens);
    const enc = encrypt(JSON.stringify(tokens));
    if (role === 'doctor') await Doctor.findByIdAndUpdate(userId, { calendar_tokens: enc }).catch(() => {});
  });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

async function createCalendarEvent({ userId, role, title, date, time, durationMinutes, description }) {
  try {
    const cal = await getCalendarClient(userId, role);
    if (!cal) return null;
    const start = new Date(`${date}T${time}`);
    const end   = new Date(start.getTime() + durationMinutes * 60000);
    const res = await cal.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title, description,
        start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
        end:   { dateTime: end.toISOString(),   timeZone: 'Asia/Kolkata' },
        reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 1440 }, { method: 'popup', minutes: 30 }] },
      },
    });
    logger.info('Calendar event created', { userId, eventId: res.data.id });
    return res.data.id;
  } catch (err) {
    logger.error('Calendar create failed', { userId, err: err.message });
    return null;
  }
}

async function updateCalendarEvent({ userId, role, eventId, date, time, durationMinutes }) {
  try {
    const cal = await getCalendarClient(userId, role);
    if (!cal || !eventId) return;
    const start = new Date(`${date}T${time}`);
    const end   = new Date(start.getTime() + durationMinutes * 60000);
    await cal.events.patch({
      calendarId: 'primary', eventId,
      requestBody: {
        start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
        end:   { dateTime: end.toISOString(),   timeZone: 'Asia/Kolkata' },
      },
    });
  } catch (err) { logger.error('Calendar update failed', { userId, eventId, err: err.message }); }
}

async function deleteCalendarEvent({ userId, role, eventId }) {
  try {
    const cal = await getCalendarClient(userId, role);
    if (!cal || !eventId) return;
    await cal.events.delete({ calendarId: 'primary', eventId });
  } catch (err) { logger.error('Calendar delete failed', { userId, eventId, err: err.message }); }
}

module.exports = { getAuthUrl, handleOAuthCallback, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent };
