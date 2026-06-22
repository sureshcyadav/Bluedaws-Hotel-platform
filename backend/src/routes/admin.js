const express    = require('express');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const { pool }   = require('../config/db');
const adminAuth  = require('../middleware/adminAuth');

const router = express.Router();
const secret = () => process.env.ADMIN_PASSWORD || 'changeme';

// 5 failed attempts per IP per 15 minutes, then locked out
const loginLimiter = rateLimit({
  windowMs:               15 * 60 * 1000,
  max:                    5,
  skipSuccessfulRequests: true,   // correct logins don't burn the quota
  standardHeaders:        'draft-7',
  legacyHeaders:          false,
  message: { success: false, message: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

// POST /api/admin/login
router.post('/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ success: false, message: 'Admin password not configured on server.' });
  }
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Incorrect password.' });
  }
  const token = jwt.sign({ admin: true }, secret(), { expiresIn: '24h' });
  res.json({ success: true, token });
});

// GET /api/admin/stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [b, c] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int                                             AS total,
          COUNT(*) FILTER (WHERE status='pending')::int            AS pending,
          COUNT(*) FILTER (WHERE status='confirmed')::int          AS confirmed,
          COUNT(*) FILTER (WHERE status='cancelled')::int          AS cancelled,
          COALESCE(SUM(total_amount) FILTER (WHERE status != 'cancelled'), 0) AS revenue
        FROM bookings
      `),
      pool.query(`
        SELECT
          COUNT(*)::int                                   AS total,
          COUNT(*) FILTER (WHERE status='unread')::int    AS unread
        FROM contacts
      `),
    ]);
    res.json({ success: true, bookings: b.rows[0], contacts: c.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/bookings
router.get('/bookings', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM bookings ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/bookings/:id/status
router.patch('/bookings/:id/status', adminAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }
  try {
    const { rowCount } = await pool.query(
      'UPDATE bookings SET status=$1 WHERE id=$2', [status, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Booking not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/contacts
router.get('/contacts', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/contacts/:id/status
router.patch('/contacts/:id/status', adminAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!['unread', 'read', 'replied'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }
  try {
    const { rowCount } = await pool.query(
      'UPDATE contacts SET status=$1 WHERE id=$2', [status, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Contact not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/content
router.get('/content', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM settings ORDER BY category, key');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/content/:key
router.patch('/content/:key', adminAuth, async (req, res) => {
  const { value } = req.body || {};
  if (value === undefined) return res.status(400).json({ success: false, message: 'Value required.' });
  try {
    const { rowCount } = await pool.query(
      'UPDATE settings SET value=$1, updated_at=NOW() WHERE key=$2',
      [String(value), req.params.key]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Setting not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
