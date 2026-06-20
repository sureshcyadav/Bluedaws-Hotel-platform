const { pool }       = require('../config/db');
const { VALID_ROOMS } = require('../middleware/validate');

function generateRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'BDW-';
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

// POST /api/bookings
async function createBooking(req, res) {
  const {
    checkin_date, checkout_date,
    adults, children = 0,
    room_code, payment_method,
    guest_first_name, guest_last_name,
    guest_email, guest_phone, guest_country,
    special_requests = null,
  } = req.body;

  const room   = VALID_ROOMS[room_code.toLowerCase()];
  const nights = Math.round((new Date(checkout_date) - new Date(checkin_date)) / 86400000);
  const total  = nights * room.price;

  // Collision-safe reference
  let ref;
  for (let i = 0; i < 10; i++) {
    ref = generateRef();
    const { rows } = await pool.query('SELECT id FROM bookings WHERE ref = $1', [ref]);
    if (rows.length === 0) break;
    if (i === 9) return res.status(500).json({ success: false, message: 'Could not generate unique reference. Try again.' });
  }

  const sql = `
    INSERT INTO bookings (
      ref,
      guest_first_name, guest_last_name, guest_email, guest_phone, guest_country,
      room_code, room_name, room_floor, room_bed, price_per_night,
      checkin_date, checkout_date, nights,
      adults, children,
      total_amount, payment_method, special_requests, status
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14,
      $15, $16,
      $17, $18, $19, 'pending'
    ) RETURNING id, ref, created_at
  `;

  const values = [
    ref,
    guest_first_name.trim(), guest_last_name.trim(),
    guest_email.trim(), guest_phone.trim(), guest_country.trim(),
    room_code.toLowerCase(), room.name, room.floor, room.bed, room.price,
    checkin_date, checkout_date, nights,
    Number(adults), Number(children),
    total, payment_method, special_requests || null,
  ];

  try {
    const { rows } = await pool.query(sql, values);
    const saved = rows[0];

    return res.status(201).json({
      success: true,
      message: 'Booking received. We will confirm within 2 hours.',
      data: {
        id:           saved.id,
        ref:          saved.ref,
        guest_name:   `${guest_first_name.trim()} ${guest_last_name.trim()}`,
        guest_email:  guest_email.trim(),
        room:         `${room.name} (${room_code.toUpperCase()})`,
        checkin_date,
        checkout_date,
        nights,
        total_amount:   total,
        payment_method,
        status:         'pending',
        created_at:     saved.created_at,
      },
    });
  } catch (err) {
    console.error('[createBooking]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save booking. Please try again.' });
  }
}

// GET /api/bookings/:ref
async function getBookingByRef(req, res) {
  const ref = req.params.ref.toUpperCase();
  if (!/^BDW-[A-Z0-9]{6}$/.test(ref)) {
    return res.status(400).json({ success: false, message: 'Invalid booking reference format.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, ref, guest_first_name, guest_last_name, guest_email,
              room_code, room_name, checkin_date, checkout_date, nights,
              total_amount, payment_method, status, created_at
       FROM bookings WHERE ref = $1`,
      [ref]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: `No booking found with reference ${ref}.` });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[getBookingByRef]', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// GET /api/bookings
async function listBookings(req, res) {
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(50, Number(req.query.limit) || 20);
  const offset = (page - 1) * limit;
  const status = req.query.status || null;

  try {
    const where  = status ? 'WHERE status = $1' : '';
    const params = status ? [status, limit, offset] : [limit, offset];
    const limitIdx  = status ? '$2' : '$1';
    const offsetIdx = status ? '$3' : '$2';

    const { rows } = await pool.query(
      `SELECT id, ref, guest_first_name, guest_last_name, guest_email, guest_phone,
              room_code, room_name, checkin_date, checkout_date, nights,
              adults, children, total_amount, payment_method, status, created_at
       FROM bookings ${where}
       ORDER BY created_at DESC
       LIMIT ${limitIdx} OFFSET ${offsetIdx}`,
      params
    );

    const countParams = status ? [status] : [];
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM bookings ${where}`, countParams
    );

    return res.json({
      success: true,
      data:  rows,
      meta:  { page, limit, total: countRows[0].total, pages: Math.ceil(countRows[0].total / limit) },
    });
  } catch (err) {
    console.error('[listBookings]', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { createBooking, getBookingByRef, listBookings };
