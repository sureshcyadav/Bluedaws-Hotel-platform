const jwt    = require('jsonwebtoken');
const { pool } = require('../config/db');

function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET environment variable is not set.');
  return s;
}

async function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }

  let payload;
  try {
    payload = jwt.verify(auth.slice(7), jwtSecret());
  } catch (err) {
    if (err.message.includes('JWT_SECRET')) {
      console.error('[adminAuth]', err.message);
      return res.status(500).json({ success: false, message: 'Server misconfiguration.' });
    }
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }

  // Tokens issued before the session-tracking upgrade won't have a jti claim.
  // Reject them so old stolen tokens can never be used after the upgrade.
  if (!payload.jti) {
    return res.status(401).json({ success: false, message: 'Session invalid. Please log in again.' });
  }

  // Verify this specific token ID still exists in the DB (not revoked by logout/revoke-all).
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM admin_sessions WHERE jti=$1 AND expires_at > NOW()',
      [payload.jti]
    );
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Session revoked. Please log in again.' });
    }
  } catch (dbErr) {
    console.error('[adminAuth] session check failed:', dbErr.message);
    return res.status(500).json({ success: false, message: 'Server error during authentication.' });
  }

  next();
}

module.exports = { adminAuth, jwtSecret };
