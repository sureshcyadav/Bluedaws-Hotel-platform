const express   = require('express');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { pool }  = require('../config/db');
const adminAuth = require('../middleware/adminAuth');
const { VALID_ROOMS } = require('../middleware/validate');
const { sendBookingConfirmedEmail, sendContactReplyEmail } = require('../utils/mailer');

const router = express.Router();
const secret = () => process.env.ADMIN_PASSWORD || 'changeme';

// ── Startup: add new columns & tables if missing ───────────────────────────
;(async () => {
  try {
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_notes      TEXT`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at   TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_out_at  TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_id_type    VARCHAR(50)`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_id_number  VARCHAR(100)`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_dob        DATE`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_nationality VARCHAR(100)`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status   VARCHAR(20) DEFAULT 'unpaid'`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS amount_paid      NUMERIC(10,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_mode     VARCHAR(50)`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_note     TEXT`);
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
    const today      = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';
    const in7Days    = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const [b, c, arr, dep, house, monthRev, upcoming] = await Promise.all([
      // Summary counts + all-time revenue
      pool.query(`
        SELECT
          COUNT(*)::int                                                        AS total,
          COUNT(*) FILTER (WHERE status='pending')::int                        AS pending,
          COUNT(*) FILTER (WHERE status='confirmed')::int                      AS confirmed,
          COUNT(*) FILTER (WHERE status='cancelled')::int                      AS cancelled,
          COALESCE(SUM(total_amount) FILTER (WHERE status != 'cancelled'), 0)  AS revenue
        FROM bookings
      `),
      // Contact counts
      pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status='unread')::int AS unread
        FROM contacts
      `),
      // Arriving today
      pool.query(`
        SELECT id, guest_first_name, guest_last_name, room_code, room_name, checked_in_at, status
        FROM bookings
        WHERE checkin_date=$1 AND status!='cancelled'
        ORDER BY created_at DESC
      `, [today]),
      // Departing today (in-house, checkout today, not yet checked out)
      pool.query(`
        SELECT id, guest_first_name, guest_last_name, room_code, room_name, checked_in_at, checked_out_at
        FROM bookings
        WHERE checkout_date=$1 AND checked_in_at IS NOT NULL AND checked_out_at IS NULL AND status!='cancelled'
        ORDER BY checked_in_at
      `, [today]),
      // Currently in house
      pool.query(`
        SELECT COUNT(*)::int AS count
        FROM bookings
        WHERE checked_in_at IS NOT NULL AND checked_out_at IS NULL AND status!='cancelled'
      `),
      // This month's revenue (bookings with checkin this month)
      pool.query(`
        SELECT COALESCE(SUM(total_amount), 0) AS revenue
        FROM bookings
        WHERE status!='cancelled' AND checkin_date >= $1 AND checkin_date <= $2
      `, [monthStart, today]),
      // Upcoming next 7 days (excluding today)
      pool.query(`
        SELECT id, guest_first_name, guest_last_name, room_code, room_name,
               checkin_date, checkout_date, adults, children, status
        FROM bookings
        WHERE checkin_date > $1 AND checkin_date <= $2 AND status!='cancelled'
        ORDER BY checkin_date, created_at
        LIMIT 15
      `, [today, in7Days]),
    ]);

    res.json({
      success:       true,
      bookings:      b.rows[0],
      contacts:      c.rows[0],
      today: {
        arrivals:   arr.rows,
        departures: dep.rows,
        in_house:   Number(house.rows[0].count),
      },
      month_revenue: monthRev.rows[0].revenue,
      upcoming:      upcoming.rows,
    });
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
    const { rows } = await pool.query('SELECT value FROM settings WHERE key=$1', ['price_' + room_code.toLowerCase()]);
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
    const { rows, rowCount } = await pool.query(
      `UPDATE bookings SET status=$1 WHERE id=$2
       RETURNING ref, guest_first_name, guest_last_name, guest_email, guest_phone, guest_country,
                 room_code, room_name, checkin_date, checkout_date, nights, adults, children,
                 total_amount, payment_method, special_requests`,
      [status, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Booking not found.' });
    res.json({ success: true });

    if (status === 'confirmed') {
      const b = rows[0];
      const guestStr = `${b.adults} Adult${b.adults !== 1 ? 's' : ''}${b.children > 0 ? `, ${b.children} Child${b.children !== 1 ? 'ren' : ''}` : ''}`;
      setImmediate(() => {
        sendBookingConfirmedEmail({
          ref:       b.ref,
          guest:     { firstName: b.guest_first_name, lastName: b.guest_last_name, email: b.guest_email, phone: b.guest_phone, country: b.guest_country },
          roomLabel: `${b.room_name} (${b.room_code.toUpperCase()})`,
          checkin:   b.checkin_date.toISOString().slice(0, 10),
          checkout:  b.checkout_date.toISOString().slice(0, 10),
          nights:    String(b.nights),
          guests:    guestStr,
          total:     Number(b.total_amount).toLocaleString(),
          payment:   b.payment_method,
          requests:  b.special_requests || '',
        }).catch(err => console.error('[mailer] Failed to send confirmation email:', err.message));
      });
    }
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/admin/bookings/:id/send-confirmation — resend confirmation email to guest
router.post('/bookings/:id/send-confirmation', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ref, guest_first_name, guest_last_name, guest_email, guest_phone, guest_country,
              room_code, room_name, checkin_date, checkout_date, nights, adults, children,
              total_amount, payment_method, special_requests FROM bookings WHERE id=$1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Booking not found.' });
    const b = rows[0];
    const guestStr = `${b.adults} Adult${b.adults !== 1 ? 's' : ''}${b.children > 0 ? `, ${b.children} Child${b.children !== 1 ? 'ren' : ''}` : ''}`;
    await sendBookingConfirmedEmail({
      ref:       b.ref,
      guest:     { firstName: b.guest_first_name, lastName: b.guest_last_name, email: b.guest_email, phone: b.guest_phone, country: b.guest_country },
      roomLabel: `${b.room_name} (${b.room_code.toUpperCase()})`,
      checkin:   b.checkin_date.toISOString().slice(0, 10),
      checkout:  b.checkout_date.toISOString().slice(0, 10),
      nights:    String(b.nights),
      guests:    guestStr,
      total:     Number(b.total_amount).toLocaleString(),
      payment:   b.payment_method,
      requests:  b.special_requests || '',
    });
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

// PATCH /api/admin/bookings/:id/checkin  — also clears checked_out_at so re-checkin works
router.patch('/bookings/:id/checkin', adminAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE bookings SET checked_in_at=NOW(), checked_out_at=NULL, status='confirmed' WHERE id=$1 AND status!='cancelled'`,
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
      `UPDATE bookings SET checked_out_at=NOW(), checked_in_at=COALESCE(checked_in_at, NOW()) WHERE id=$1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Booking not found.' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/admin/bookings/:id/undo-checkin — resets to "not arrived" (clears both timestamps)
router.patch('/bookings/:id/undo-checkin', adminAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE bookings SET checked_in_at=NULL, checked_out_at=NULL WHERE id=$1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Booking not found.' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/admin/bookings/:id/guest — save guest identity, notes + payment info
router.patch('/bookings/:id/guest', adminAuth, async (req, res) => {
  const {
    guest_id_type, guest_id_number, guest_dob, guest_nationality,
    admin_notes, special_requests,
    payment_status, amount_paid, payment_mode, payment_note,
  } = req.body || {};
  try {
    const { rowCount } = await pool.query(`
      UPDATE bookings SET
        guest_id_type     = $1,
        guest_id_number   = $2,
        guest_dob         = $3,
        guest_nationality = $4,
        admin_notes       = $5,
        special_requests  = $6,
        payment_status    = COALESCE($7, payment_status),
        amount_paid       = COALESCE($8, amount_paid),
        payment_mode      = $9,
        payment_note      = $10
      WHERE id = $11
    `, [
      guest_id_type     || null,
      guest_id_number   || null,
      guest_dob         || null,
      guest_nationality || null,
      admin_notes       || null,
      special_requests  || null,
      payment_status    || null,
      amount_paid != null ? Number(amount_paid) : null,
      payment_mode      || null,
      payment_note      || null,
      req.params.id,
    ]);
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

// POST /api/admin/contacts/:id/reply — send reply email and mark as replied
router.post('/contacts/:id/reply', adminAuth, async (req, res) => {
  const { message: replyText } = req.body || {};
  if (!replyText || !replyText.trim())
    return res.status(400).json({ success: false, message: 'Reply message is required.' });
  try {
    const { rows } = await pool.query(
      'SELECT first_name, last_name, email, subject, message FROM contacts WHERE id=$1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Contact not found.' });
    const c = rows[0];
    await sendContactReplyEmail({
      to:              c.email,
      firstName:       c.first_name,
      subject:         c.subject,
      originalMessage: c.message,
      replyText:       replyText.trim(),
    });
    await pool.query('UPDATE contacts SET status=$1 WHERE id=$2', ['replied', req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[reply]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
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
    const [monthly, rooms, payments, summary, nations, statusBreak] = await Promise.all([
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
          COUNT(*)::int                                                                                    AS total_bookings,
          COUNT(*) FILTER (WHERE status='confirmed')::int                                                  AS confirmed,
          COUNT(*) FILTER (WHERE status='pending')::int                                                    AS pending,
          COUNT(*) FILTER (WHERE status='cancelled')::int                                                  AS cancelled,
          COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL AND checked_out_at IS NULL)::int               AS in_house_now,
          COALESCE(SUM(total_amount)  FILTER (WHERE status!='cancelled'), 0)                              AS total_revenue,
          COALESCE(AVG(total_amount)  FILTER (WHERE status!='cancelled'), 0)::numeric(10,2)               AS avg_booking_value,
          COALESCE(AVG(nights)        FILTER (WHERE status!='cancelled'), 0)::numeric(5,1)                AS avg_nights,
          COALESCE(SUM(amount_paid),  0)                                                                  AS total_collected,
          COALESCE(SUM(total_amount - COALESCE(amount_paid,0))
            FILTER (WHERE status='confirmed' AND payment_status != 'paid'), 0)                            AS outstanding,
          COUNT(*) FILTER (WHERE checkin_date >= DATE_TRUNC('month', NOW()) AND status!='cancelled')::int AS this_month_bookings,
          COALESCE(SUM(total_amount) FILTER (WHERE checkin_date >= DATE_TRUNC('month', NOW()) AND status!='cancelled'), 0) AS this_month_revenue
        FROM bookings
      `),
      pool.query(`
        SELECT guest_country AS country, COUNT(*)::int AS count
        FROM bookings
        WHERE status != 'cancelled'
          AND guest_country IS NOT NULL AND guest_country <> ''
        GROUP BY guest_country ORDER BY count DESC LIMIT 10
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status='confirmed' AND checked_in_at IS NULL)::int   AS confirmed_pending_checkin,
          COUNT(*) FILTER (WHERE status='pending')::int                                AS awaiting_confirmation,
          COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL AND checked_out_at IS NULL)::int AS in_house,
          COUNT(*) FILTER (WHERE checked_out_at IS NOT NULL)::int                     AS checked_out,
          COUNT(*) FILTER (WHERE status='cancelled')::int                              AS cancelled
        FROM bookings
      `),
    ]);

    res.json({
      success: true,
      data: {
        monthly:     monthly.rows,
        rooms:       rooms.rows,
        payments:    payments.rows,
        summary:     summary.rows[0],
        nations:     nations.rows,
        status_break: statusBreak.rows[0],
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/admin/eod  — End of Day report data
router.get('/eod', adminAuth, async (req, res) => {
  try {
    const [summary, arrivals, departures, inHouse, newBk, cancels] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE checkin_date  = CURRENT_DATE AND status != 'cancelled')::int AS arrivals_today,
          COUNT(*) FILTER (WHERE checkout_date = CURRENT_DATE AND status != 'cancelled')::int AS departures_today,
          COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL AND checked_out_at IS NULL)::int   AS in_house_count,
          COUNT(*) FILTER (WHERE DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE)::int     AS new_bookings_today,
          COUNT(*) FILTER (WHERE DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE AND status = 'cancelled')::int AS cancellations_today,
          COALESCE(SUM(total_amount) FILTER (WHERE DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE AND status!='cancelled'), 0) AS new_revenue_today,
          COALESCE(SUM(amount_paid)  FILTER (WHERE DATE(updated_at AT TIME ZONE 'UTC') = CURRENT_DATE), 0)                        AS payments_today,
          COALESCE(SUM(total_amount - COALESCE(amount_paid,0)) FILTER (WHERE status='confirmed' AND payment_status!='paid'), 0)   AS outstanding
        FROM bookings
      `),
      pool.query(`
        SELECT ref, guest_first_name, guest_last_name, room_code, room_name,
               nights, total_amount, amount_paid, payment_status, payment_method, status, checked_in_at, special_requests
        FROM bookings
        WHERE checkin_date = CURRENT_DATE AND status != 'cancelled'
        ORDER BY guest_last_name
      `),
      pool.query(`
        SELECT ref, guest_first_name, guest_last_name, room_code, room_name,
               nights, total_amount, amount_paid, payment_status, checked_out_at
        FROM bookings
        WHERE checkout_date = CURRENT_DATE AND status != 'cancelled'
        ORDER BY guest_last_name
      `),
      pool.query(`
        SELECT ref, guest_first_name, guest_last_name, room_code, room_name,
               checkin_date, checkout_date, nights, total_amount, amount_paid, payment_status
        FROM bookings
        WHERE checked_in_at IS NOT NULL AND checked_out_at IS NULL AND status != 'cancelled'
        ORDER BY checkout_date, guest_last_name
      `),
      pool.query(`
        SELECT ref, guest_first_name, guest_last_name, room_code, room_name,
               checkin_date, checkout_date, total_amount, status, payment_method
        FROM bookings
        WHERE DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE
        ORDER BY created_at DESC
      `),
      pool.query(`
        SELECT ref, guest_first_name, guest_last_name, room_code, room_name, total_amount
        FROM bookings
        WHERE DATE(updated_at AT TIME ZONE 'UTC') = CURRENT_DATE AND status = 'cancelled'
        ORDER BY updated_at DESC
      `),
    ]);

    res.json({
      success: true,
      data: {
        generated_at:  new Date().toISOString(),
        summary:       summary.rows[0],
        arrivals:      arrivals.rows,
        departures:    departures.rows,
        in_house:      inHouse.rows,
        new_bookings:  newBk.rows,
        cancellations: cancels.rows,
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
