const express   = require('express');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { pool }  = require('../config/db');
const adminAuth = require('../middleware/adminAuth');
const { VALID_ROOMS } = require('../middleware/validate');

const router = express.Router();
const secret = () => process.env.ADMIN_PASSWORD || 'changeme';

// ── Startup: add new columns & tables if missing ───────────────────────────
;(async () => {
  try {
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_notes TEXT`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at  TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_blocks (
        id         SERIAL PRIMARY KEY,
        room_code  VARCHAR(10) NOT NULL,
        start_date DATE NOT NULL,
        end_date   DATE NOT NULL,
        reason     TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✓ Admin: schema up to date');
  } catch (e) {
    console.error('[admin/migration]', e.message);
  }
})();

// ── Rate limiter for login ────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5, skipSuccessfulRequests: true,
  standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

// ── Helper: generate unique booking ref ───────────────────────────────────
async function makeRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 10; i++) {
    let ref = 'BDW-';
    for (let j = 0; j < 6; j++) ref += chars[Math.floor(Math.random() * chars.length)];
    const { rows } = await pool.query('SELECT id FROM bookings WHERE ref=$1', [ref]);
    if (!rows.length) return ref;
  }
  throw new Error('Could not generate unique ref');
}

// POST /api/admin/login
router.post('/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!process.env.ADMIN_PASSWORD)
    return res.status(500).json({ success: false, message: 'Admin password not configured on server.' });
  if (password !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ success: false, message: 'Incorrect password.' });
  const token = jwt.sign({ admin: true }, secret(), { expiresIn: '24h' });
  res.json({ success: true, token });
});

// GET /api/admin/stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [b, c] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int                                                        AS total,
          COUNT(*) FILTER (WHERE status='pending')::int                        AS pending,
          COUNT(*) FILTER (WHERE status='confirmed')::int                      AS confirmed,
          COUNT(*) FILTER (WHERE status='cancelled')::int                      AS cancelled,
          COALESCE(SUM(total_amount) FILTER (WHERE status != 'cancelled'), 0)  AS revenue
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

// POST /api/admin/bookings — walk-in booking (confirmed immediately)
router.post('/bookings', adminAuth, async (req, res) => {
  const {
    checkin_date, checkout_date,
    adults = 1, children = 0,
    room_code, payment_method = 'payathotel',
    guest_first_name, guest_last_name,
    guest_email, guest_phone, guest_country = 'United Kingdom',
    special_requests = null,
    admin_notes = null,
  } = req.body || {};

  if (!room_code || !checkin_date || !checkout_date || !guest_first_name || !guest_last_name || !guest_email || !guest_phone)
    return res.status(400).json({ success: false, message: 'Missing required fields.' });

  const room = VALID_ROOMS[room_code.toLowerCase()];
  if (!room) return res.status(400).json({ success: false, message: 'Invalid room code.' });

  const nights = Math.round((new Date(checkout_date) - new Date(checkin_date)) / 86400000);
  if (nights < 1) return res.status(400).json({ success: false, message: 'Check-out must be after check-in.' });

  let pricePerNight = room.price;
  try {
    const { rows } = await pool.query('SELECT value FROM settings WHERE key=$1', ['room_' + room_code.toLowerCase() + '_price']);
    if (rows.length) { const p = parseFloat(rows[0].value); if (!isNaN(p) && p > 0) pricePerNight = p; }
  } catch (_) {}

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: conflicts } = await client.query(
      `SELECT id FROM bookings WHERE room_code=$1 AND status!='cancelled' AND checkin_date<$3 AND checkout_date>$2 FOR UPDATE`,
      [room_code.toLowerCase(), checkin_date, checkout_date]
    );
    if (conflicts.length) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: `Room ${room_code.toUpperCase()} is already booked for those dates.` }); }

    const ref = await makeRef();
    const { rows } = await client.query(`
      INSERT INTO bookings (
        ref, guest_first_name, guest_last_name, guest_email, guest_phone, guest_country,
        room_code, room_name, room_floor, room_bed, price_per_night,
        checkin_date, checkout_date, nights, adults, children,
        total_amount, payment_method, special_requests, admin_notes, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'confirmed')
      RETURNING id, ref, created_at
    `, [
      ref, guest_first_name.trim(), guest_last_name.trim(),
      guest_email.trim(), guest_phone.trim(), guest_country.trim(),
      room_code.toLowerCase(), room.name, room.floor, room.bed, pricePerNight,
      checkin_date, checkout_date, nights, Number(adults), Number(children),
      nights * pricePerNight, payment_method, special_requests || null, admin_notes || null,
    ]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/admin/bookings/:id/status
router.patch('/bookings/:id/status', adminAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'confirmed', 'cancelled'].includes(status))
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  try {
    const { rowCount } = await pool.query('UPDATE bookings SET status=$1 WHERE id=$2', [status, req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Booking not found.' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/admin/bookings/:id/notes — update admin notes + special requests
router.patch('/bookings/:id/notes', adminAuth, async (req, res) => {
  const { admin_notes, special_requests } = req.body || {};
  try {
    const { rowCount } = await pool.query(
      `UPDATE bookings SET
        admin_notes      = CASE WHEN $1::text IS NOT NULL THEN $1 ELSE admin_notes END,
        special_requests = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE special_requests END
       WHERE id=$3`,
      [admin_notes ?? null, special_requests ?? null, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Booking not found.' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/admin/bookings/:id/checkin
router.patch('/bookings/:id/checkin', adminAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE bookings SET checked_in_at=NOW(), status='confirmed' WHERE id=$1 AND status!='cancelled'`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Booking not found or cancelled.' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/admin/bookings/:id/checkout
router.patch('/bookings/:id/checkout', adminAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE bookings SET checked_out_at=NOW() WHERE id=$1`, [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Booking not found.' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/admin/contacts
router.get('/contacts', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/admin/contacts/:id/status
router.patch('/contacts/:id/status', adminAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!['unread', 'read', 'replied'].includes(status))
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  try {
    const { rowCount } = await pool.query('UPDATE contacts SET status=$1 WHERE id=$2', [status, req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Contact not found.' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/admin/content
router.get('/content', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM settings ORDER BY category, key');
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/admin/content/:key
router.patch('/content/:key', adminAuth, async (req, res) => {
  const { value } = req.body || {};
  if (value === undefined) return res.status(400).json({ success: false, message: 'Value required.' });
  try {
    const { rowCount } = await pool.query(
      'UPDATE settings SET value=$1, updated_at=NOW() WHERE key=$2', [String(value), req.params.key]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Setting not found.' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/admin/blocks
router.get('/blocks', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM room_blocks ORDER BY start_date ASC');
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/admin/blocks
router.post('/blocks', adminAuth, async (req, res) => {
  const { room_code, start_date, end_date, reason } = req.body || {};
  if (!room_code || !start_date || !end_date)
    return res.status(400).json({ success: false, message: 'room_code, start_date and end_date are required.' });
  if (new Date(end_date) <= new Date(start_date))
    return res.status(400).json({ success: false, message: 'end_date must be after start_date.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO room_blocks (room_code, start_date, end_date, reason) VALUES ($1,$2,$3,$4) RETURNING *`,
      [room_code.toLowerCase(), start_date, end_date, reason || null]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/admin/blocks/:id
router.delete('/blocks/:id', adminAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM room_blocks WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Block not found.' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/admin/guests
router.get('/guests', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        guest_email, guest_first_name, guest_last_name, guest_phone, guest_country,
        COUNT(*)::int                                                               AS bookings_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status!='cancelled'), 0)           AS total_spent,
        MAX(created_at)                                                             AS last_booking,
        ARRAY_AGG(ref ORDER BY created_at DESC)                                    AS refs
      FROM bookings
      GROUP BY guest_email, guest_first_name, guest_last_name, guest_phone, guest_country
      ORDER BY last_booking DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/admin/analytics
router.get('/analytics', adminAuth, async (req, res) => {
  try {
    const [monthly, rooms, payments, summary] = await Promise.all([
      pool.query(`
        SELECT
          TO_CHAR(checkin_date, 'YYYY-MM') AS month,
          TO_CHAR(checkin_date, 'Mon YY')  AS label,
          COUNT(*)::int                    AS bookings,
          COALESCE(SUM(total_amount), 0)   AS revenue
        FROM bookings
        WHERE status!='cancelled'
          AND checkin_date >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'
        GROUP BY month, label ORDER BY month ASC
      `),
      pool.query(`
        SELECT room_code, room_name, COUNT(*)::int AS bookings,
               COALESCE(SUM(total_amount),0) AS revenue
        FROM bookings WHERE status!='cancelled'
        GROUP BY room_code, room_name ORDER BY bookings DESC LIMIT 10
      `),
      pool.query(`
        SELECT payment_method, COUNT(*)::int AS count
        FROM bookings WHERE status!='cancelled'
        GROUP BY payment_method ORDER BY count DESC
      `),
      pool.query(`
        SELECT
          COUNT(*)::int                                                                             AS total_bookings,
          COUNT(*) FILTER (WHERE status='confirmed')::int                                           AS confirmed,
          COUNT(*) FILTER (WHERE status='pending')::int                                             AS pending,
          COALESCE(SUM(total_amount)     FILTER (WHERE status!='cancelled'), 0)                    AS total_revenue,
          COALESCE(AVG(total_amount)     FILTER (WHERE status!='cancelled'), 0)::numeric(10,2)     AS avg_booking_value,
          COALESCE(AVG(nights)           FILTER (WHERE status!='cancelled'), 0)::numeric(5,1)      AS avg_nights,
          COUNT(*) FILTER (WHERE checkin_date >= DATE_TRUNC('month', NOW()) AND status!='cancelled')::int AS this_month_bookings,
          COALESCE(SUM(total_amount) FILTER (WHERE checkin_date >= DATE_TRUNC('month', NOW()) AND status!='cancelled'), 0) AS this_month_revenue
        FROM bookings
      `),
    ]);
    res.json({ success: true, data: { monthly: monthly.rows, rooms: rooms.rows, payments: payments.rows, summary: summary.rows[0] } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
