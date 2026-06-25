const { pool }          = require('../config/db');
const { VALID_ROOMS }   = require('../middleware/validate');
const { sendBookingEmails } = require('../utils/mailer');

// Validates YYYY-MM-DD format and restricts to a sensible booking horizon
// so extreme values (year 0001 or 9999) cannot trigger unbounded table scans.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidBookingDate(s) {
  if (!DATE_RE.test(s) || isNaN(Date.parse(s))) return false;
  return s >= '2020-01-01' && s <= '2035-12-31';
}

function generateRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'BDW-';
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

// POST /api/bookings — create a new booking (with double-booking protection)
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

  // Fetch the current price from admin settings; fall back to hardcoded if missing
  let pricePerNight = room.price;
  try {
    const { rows: priceRow } = await pool.query(
      'SELECT value FROM settings WHERE key = $1',
      ['price_' + room_code.toLowerCase()]
    );
    if (priceRow.length > 0) {
      const dbPrice = parseFloat(priceRow[0].value);
      if (!isNaN(dbPrice) && dbPrice > 0) pricePerNight = dbPrice;
    }
  } catch (_) { /* use hardcoded fallback */ }

  const total = nights * pricePerNight;

  // Use a transaction + FOR UPDATE lock so two simultaneous requests
  // for the same room cannot both pass the availability check.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Overlap condition: new stay overlaps any existing stay when
    //   existing.checkin  < new.checkout  AND
    //   existing.checkout > new.checkin
    const { rows: conflicts } = await client.query(
      `SELECT id FROM bookings
       WHERE room_code     = $1
         AND status       != 'cancelled'
         AND checkin_date  < $3
         AND checkout_date > $2
       FOR UPDATE`,
      [room_code.toLowerCase(), checkin_date, checkout_date]
    );

    if (conflicts.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `Room ${room_code.toUpperCase()} is already booked for those dates. Please choose different dates or another room.`,
      });
    }

    // Collision-safe reference
    let ref;
    for (let i = 0; i < 10; i++) {
      ref = generateRef();
      const { rows } = await client.query('SELECT id FROM bookings WHERE ref = $1', [ref]);
      if (rows.length === 0) break;
      if (i === 9) {
        await client.query('ROLLBACK');
        return res.status(500).json({ success: false, message: 'Could not generate unique reference. Try again.' });
      }
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
      room_code.toLowerCase(), room.name, room.floor, room.bed, pricePerNight,
      checkin_date, checkout_date, nights,
      Number(adults), Number(children),
      total, payment_method, special_requests || null,
    ];

    const { rows } = await client.query(sql, values);
    const saved = rows[0];

    await client.query('COMMIT');

    // Send emails in background — non-blocking so response goes out immediately
    const guestStr = `${Number(adults)} Adult${Number(adults) !== 1 ? 's' : ''}${Number(children) > 0 ? `, ${Number(children)} Child${Number(children) !== 1 ? 'ren' : ''}` : ''}`;
    setImmediate(() => {
      sendBookingEmails({
        ref,
        guest: {
          firstName: guest_first_name.trim(),
          lastName:  guest_last_name.trim(),
          email:     guest_email.trim(),
          phone:     guest_phone.trim(),
          country:   guest_country.trim(),
        },
        roomLabel:    `${room.name} (${room_code.toUpperCase()})`,
        checkin:      checkin_date,
        checkout:     checkout_date,
        nights:       String(nights),
        guests:       guestStr,
        total:        total.toLocaleString(),
        payment:      payment_method,
        requests:     special_requests || '',
        dateReceived: new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' }),
      }).catch(err => console.error('[mailer] Failed to send booking emails:', err.message));
    });

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
    await client.query('ROLLBACK');
    console.error('[createBooking]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save booking. Please try again.' });
  } finally {
    client.release();
  }
}

// GET /api/bookings/availability?room_code=c3&checkin_date=2026-07-01&checkout_date=2026-07-05
async function checkAvailability(req, res) {
  const { room_code, checkin_date, checkout_date } = req.query;

  if (!room_code || !checkin_date || !checkout_date) {
    return res.status(400).json({ success: false, message: 'room_code, checkin_date, and checkout_date are required.' });
  }
  if (!VALID_ROOMS[room_code.toLowerCase()]) {
    return res.status(400).json({ success: false, message: 'Invalid room code.' });
  }
  if (!isValidBookingDate(checkin_date) || !isValidBookingDate(checkout_date)) {
    return res.status(400).json({ success: false, message: 'Invalid or out-of-range date.' });
  }
  if (checkout_date <= checkin_date) {
    return res.status(400).json({ success: false, message: 'Check-out must be after check-in.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id FROM bookings
       WHERE room_code     = $1
         AND status       != 'cancelled'
         AND checkin_date  < $3
         AND checkout_date > $2`,
      [room_code.toLowerCase(), checkin_date, checkout_date]
    );

    return res.json({ success: true, available: rows.length === 0 });
  } catch (err) {
    console.error('[checkAvailability]', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
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
      `SELECT ref, guest_first_name, guest_last_name, guest_email,
              room_code, room_name, checkin_date, checkout_date, nights,
              total_amount, payment_method, status, created_at
       FROM bookings WHERE ref = $1`,
      [ref]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: `No booking found with reference ${ref}.` });
    }
    const b = rows[0];
    // Mask email — show only first char and domain (e.g. s***@gmail.com)
    const [user, domain] = b.guest_email.split('@');
    b.guest_email = user[0] + '***@' + domain;
    return res.json({ success: true, data: b });
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

// GET /api/bookings/availability/batch?checkin_date=2026-07-01&checkout_date=2026-07-05
// Returns all room codes that have an overlapping confirmed booking — one DB query.
async function checkAvailabilityBatch(req, res) {
  const { checkin_date, checkout_date } = req.query;
  if (!checkin_date || !checkout_date) {
    return res.status(400).json({ success: false, message: 'checkin_date and checkout_date are required.' });
  }
  if (!isValidBookingDate(checkin_date) || !isValidBookingDate(checkout_date)) {
    return res.status(400).json({ success: false, message: 'Invalid or out-of-range date.' });
  }
  if (checkout_date <= checkin_date) {
    return res.status(400).json({ success: false, message: 'Check-out must be after check-in.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT room_code FROM bookings
       WHERE status        != 'cancelled'
         AND checkin_date   < $2
         AND checkout_date  > $1`,
      [checkin_date, checkout_date]
    );
    return res.json({ success: true, booked: rows.map(r => r.room_code) });
  } catch (err) {
    console.error('[checkAvailabilityBatch]', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { createBooking, checkAvailability, checkAvailabilityBatch, getBookingByRef, listBookings };
