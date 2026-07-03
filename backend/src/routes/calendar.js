const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { getAuthUrl, handleOAuthCallback } = require('../services/calendar');
const Doctor  = require('../models/Doctor');
const User    = require('../models/User');
const logger  = require('../config/logger');

router.get('/auth-url', authenticate, (req, res) => {
  const url = getAuthUrl(req.user._id);
  return res.json({ url });
});

router.get('/oauth/callback', async (req, res, next) => {
  try {
    const { code, state: userId } = req.query;
    if (!code || !userId) return res.status(400).send('Missing code or state.');
    const user = await User.findById(userId).select('role').lean();
    if (!user) return res.status(400).send('User not found.');
    await handleOAuthCallback(code, userId, user.role);
    logger.info('Google Calendar connected', { userId });
    const redirect = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/calendar-connected`;
    return res.redirect(redirect);
  } catch (err) { next(err); }
});

router.get('/status', authenticate, async (req, res, next) => {
  try {
    let hasTokens = false;
    if (req.user.role === 'doctor') {
      const doc = await Doctor.findById(req.user._id).select('calendar_tokens').lean();
      hasTokens = !!doc?.calendar_tokens;
    }
    return res.json({ connected: hasTokens });
  } catch (err) { next(err); }
});

module.exports = router;
