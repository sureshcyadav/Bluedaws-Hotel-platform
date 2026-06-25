const router    = require('express').Router();
const rateLimit = require('express-rate-limit');
const { bookingRules, handleValidationErrors } = require('../middleware/validate');
const { createBooking, checkAvailability, checkAvailabilityBatch, getBookingByRef } = require('../controllers/bookingController');

// Rate limiter for booking creation — prevent spam bookings
const bookingCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many booking attempts. Please try again in an hour.' },
});

// Rate limiter for booking lookup — prevent brute-force ref enumeration
const bookingLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many lookup attempts. Please try again later.' },
});

// GET /api/bookings/availability/batch — must be before /availability and /:ref
router.get('/availability/batch', checkAvailabilityBatch);

// GET /api/bookings/availability
router.get('/availability', checkAvailability);

// POST /api/bookings — create a new booking
router.post('/', bookingCreateLimiter, bookingRules, handleValidationErrors, createBooking);

// GET /api/bookings/:ref — guest booking lookup (rate-limited, no auth required)
router.get('/:ref', bookingLookupLimiter, getBookingByRef);

// NOTE: GET / (list all bookings) is intentionally removed — only available
// to authenticated admins via GET /api/admin/bookings

module.exports = router;
