const { pool }        = require('../config/db');
const { ROOM_TYPES }  = require('../middleware/validate');
const { sendBookingEmails } = require('../utils/mailer');

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

// POST /api/bookings — create a new booking by room type (specific room allocated by admin later)
async function createBooking(req, res) {
  const {
    checkin_date, checkout_date,
    adults, children = 0,
    room_type, payment_method,
    guest_first_name, guest_last_name,
    guest_email, guest_phone, guest_country,
    special_requests = null,
  } = req.body;

  const typeInfo = ROOM_TYPES[room_type];
  const nights   = Math.round((new Date(checkout_date) - new Date(checkin_date)) / 86400000);

  // Fetch the price for this room type from admin settings; fall back to hardcoded
  let pricePerNight = 0;
  try {
    const { rows: priceRow } = await pool.query(
      'SELECT value FROM settings WHERE key = $1',
      [typeInfo.priceKey]
    );
    if (priceRow.length > 0) {
      const dbPrice = parseFloat(priceRow[0].value);
      if (!isNaN(dbPrice) && dbPrice > 0) pricePerNight = dbPrice;
    }
  } catch (_) { /* use type's hardcoded fallback price */ }

  // Fallback hardcoded prices by type if settings not seeded yet
  if (!pricePerNight) {
    const fallbacks = { single: 85, twin: 110, triple: 135, double_single: 145,
      family: 160, large_family: 195, group_6: 225, group_mixed: 235, large_group: 275 };
    pricePerNight = fallbacks[room_type] || 100;
  }

  const total = nights * pricePerNight;
  const roomCapacity = typeInfo.codes.length;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Acquire an advisory lock per room_type so concurrent bookings are serialized,
    // preventing the race condition where two requests both see available capacity.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [room_type]);

    // Count how many bookings of this type overlap with the requested dates
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM bookings
       WHERE room_type     = $1
         AND status       != 'cancelled'
         AND checkin_date  < $3
         AND checkout_date > $2`,
      [room_type, checkin_date, checkout_date]
    );

    if (countRows[0].cnt >= roomCapacity) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `All ${typeInfo.label} rooms are fully booked for those dates. Please choose different dates or a different room type.`,
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
        room_code, room_name, room_floor, room_bed, room_type, price_per_night,
        checkin_date, checkout_date, nights,
        adults, children,
        total_amount, payment_method, special_requests, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15,
        $16, $17,
        $18, $19, $20, 'pending'
      ) RETURNING id, ref, created_at
    `;

    const values = [
      ref,
      guest_first_name.trim(), guest_last_name.trim(),
      guest_email.trim(), guest_phone.trim(), guest_country.trim(),
      room_type,          // room_code stored as type key; allocated_room_code set by admin later
      typeInfo.label,     // room_name = type label
      null,               // room_floor = null (not known until allocated)
      typeInfo.bed,       // room_bed = type bed description
      room_type,          // room_type column
      pricePerNight,
      checkin_date, checkout_date, nights,
      Number(adults), Number(children),
      total, payment_method, special_requests || null,
    ];

    const { rows } = await client.query(sql, values);
    const saved = rows[0];

    await client.query('COMMIT');

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
        roomLabel:    typeInfo.label,
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
        room:         typeInfo.label,
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

// GET /api/bookings/availability?room_type=twin&checkin_date=2026-07-01&checkout_date=2026-07-05
async function checkAvailability(req, res) {
  const { room_type, checkin_date, checkout_date } = req.query;

  if (!room_type || !checkin_date || !checkout_date) {
    return res.status(400).json({ success: false, message: 'room_type, checkin_date, and checkout_date are required.' });
  }
  const typeInfo = ROOM_TYPES[room_type];
  if (!typeInfo) {
    return res.status(400).json({ success: false, message: 'Invalid room type.' });
  }
  if (!isValidBookingDate(checkin_date) || !isValidBookingDate(checkout_date)) {
    return res.status(400).json({ success: false, message: 'Invalid or out-of-range date.' });
  }
  if (checkout_date <= checkin_date) {
    return res.status(400).json({ success: false, message: 'Check-out must be after check-in.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM bookings
       WHERE room_type     = $1
         AND status       != 'cancelled'
         AND checkin_date  < $3
         AND checkout_date > $2`,
      [room_type, checkin_date, checkout_date]
    );

    const available = rows[0].cnt < typeInfo.codes.length;
    return res.json({ success: true, available, available_count: typeInfo.codes.length - rows[0].cnt });
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
              room_name, checkin_date, checkout_date, nights,
              total_amount, payment_method, status, created_at
       FROM bookings WHERE ref = $1`,
      [ref]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: `No booking found with reference ${ref}.` });
    }
    const b = rows[0];
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
              room_type, room_name, checkin_date, checkout_date, nights,
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
// Returns room types that are fully booked (all rooms of that type taken) for the given dates.
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
      `SELECT room_type, COUNT(*)::int AS cnt
       FROM bookings
       WHERE room_type    != ''
         AND status       != 'cancelled'
         AND checkin_date  < $2
         AND checkout_date > $1
       GROUP BY room_type`,
      [checkin_date, checkout_date]
    );

    const bookedTypes = [];
    for (const row of rows) {
      const typeInfo = ROOM_TYPES[row.room_type];
      if (typeInfo && row.cnt >= typeInfo.codes.length) {
        bookedTypes.push(row.room_type);
      }
    }

    return res.json({ success: true, booked_types: bookedTypes });
  } catch (err) {
    console.error('[checkAvailabilityBatch]', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { createBooking, checkAvailability, checkAvailabilityBatch, getBookingByRef, listBookings };
