const { pool }      = require('../config/db');
const { VALID_ROOMS } = require('../middleware/validate');

// ── Generate booking reference ───────────────────────────────────────
function generateRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'BDW-';
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

// ── POST /api/bookings ───────────────────────────────────────────────
async function createBooking(req, res) {
  const {
    checkin_date, checkout_date,
    adults, children = 0,
    room_code, payment_method,
    guest_first_name, guest_last_name,
    guest_email, guest_phone, guest_country,
    special_requests = null,
  } = req.body;

  const room  = VALID_ROOMS[room_code.toLowerCase()];
  const ci    = new Date(checkin_date);
  const co    = new Date(checkout_date);
  const nights = Math.round((co - ci) / 86400000);
  const total  = nights * room.price;

  // Generate a unique reference
  let ref;
  let attempts = 0;
  do {
    ref = generateRef();
    attempts++;
    const [rows] = await pool.query('SELECT id FROM bookings WHERE ref = ?', [ref]);
    if (rows.length === 0) break;
    if (attempts > 10) return res.status(500).json({ success: false, message: 'Could not generate unique reference. Please try again.' });
  } while (true);

  const sql = `
    INSERT INTO bookings (
      ref,
      guest_first_name, guest_last_name, guest_email, guest_phone, guest_country,
      room_code, room_name, room_floor, room_bed, price_per_night,
      checkin_date, checkout_date, nights,
      adults, children,
      total_amount, payment_method, special_requests,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `;

  const values = [
    ref,
    guest_first_name.trim(), guest_last_name.trim(), guest_email.trim(), guest_phone.trim(), guest_country.trim(),
    room_code.toLowerCase(), room.name, room.floor, room.bed, room.price,
    checkin_date, checkout_date, nights,
    Number(adults), Number(children),
    total, payment_method, special_requests || null,
  ];

  try {
    const [result] = await pool.query(sql, values);

    return res.status(201).json({
      success: true,
      message: 'Booking received. We will confirm within 2 hours.',
      data: {
        id:               result.insertId,
        ref,
        guest_name:       `${guest_first_name.trim()} ${guest_last_name.trim()}`,
        guest_email:      guest_email.trim(),
        room:             `${room.name} (${room_code.toUpperCase()})`,
        checkin_date,
        checkout_date,
        nights,
        total_amount:     total,
        payment_method,
        status:           'pending',
      },
    });
  } catch (err) {
    console.error('[createBooking] DB error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save booking. Please try again.' });
  }
}

// ── GET /api/bookings/:ref ───────────────────────────────────────────
async function getBookingByRef(req, res) {
  const { ref } = req.params;

  if (!ref || !/^BDW-[A-Z0-9]{6}$/.test(ref.toUpperCase())) {
    return res.status(400).json({ success: false, message: 'Invalid booking reference format.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, ref, guest_first_name, guest_last_name, guest_email, room_code, room_name, checkin_date, checkout_date, nights, total_amount, payment_method, status, created_at FROM bookings WHERE ref = ?',
      [ref.toUpperCase()]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: `No booking found with reference ${ref.toUpperCase()}.` });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[getBookingByRef] DB error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/bookings ─ (admin — list all) ───────────────────────────
async function listBookings(req, res) {
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const offset = (page - 1) * limit;
  const status = req.query.status || null;

  try {
    const where  = status ? 'WHERE status = ?' : '';
    const params = status ? [status, limit, offset] : [limit, offset];

    const [rows]  = await pool.query(
      `SELECT id, ref, guest_first_name, guest_last_name, guest_email, guest_phone,
              room_code, room_name, checkin_date, checkout_date, nights,
              adults, children, total_amount, payment_method, status, created_at
       FROM bookings ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM bookings ${where}`,
      status ? [status] : []
    );

    return res.json({
      success: true,
      data:  rows,
      meta:  { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[listBookings] DB error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { createBooking, getBookingByRef, listBookings };
