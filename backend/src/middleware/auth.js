const jwt  = require('jsonwebtoken');
const User = require('../models/User');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided.' });

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(payload.sub).select('-password_hash');
    if (!user) return res.status(401).json({ error: 'Account not found.' });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) return res.status(403).json({ error: `Access restricted to: ${roles.join(', ')}.` });
    next();
  };
}

module.exports = { authenticate, requireRole };
