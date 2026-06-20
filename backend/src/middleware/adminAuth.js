const jwt = require('jsonwebtoken');

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }
  try {
    jwt.verify(auth.slice(7), process.env.ADMIN_PASSWORD || 'changeme');
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }
}

module.exports = adminAuth;
