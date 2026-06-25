const jwt = require('jsonwebtoken');

function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET environment variable is not set.');
  return s;
}

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }
  try {
    jwt.verify(auth.slice(7), jwtSecret());
    next();
  } catch (err) {
    if (err.message.includes('JWT_SECRET')) {
      console.error('[adminAuth]', err.message);
      return res.status(500).json({ success: false, message: 'Server misconfiguration.' });
    }
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }
}

module.exports = { adminAuth, jwtSecret };
