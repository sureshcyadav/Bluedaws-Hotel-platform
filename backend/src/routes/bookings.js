const router = require('express').Router();
const { bookingRules, handleValidationErrors } = require('../middleware/validate');
const { createBooking, checkAvailability, checkAvailabilityBatch, getBookingByRef } = require('../controllers/bookingController');
const { bookingCreateLimiter, bookingLookupLimiter, availabilityLimiter } = require('../middleware/rateLimits');

// GET /api/bookings/availability/batch — must be before /availability and /:ref
router.get('/availability/batch', availabilityLimiter, checkAvailabilityBatch);

// GET /api/bookings/availability
router.get('/availability', availabilityLimiter, checkAvailability);

// POST /api/bookings — create a new booking
router.post('/', bookingCreateLimiter, (req, _res, next) => {
  console.log('[POST /bookings] body:', JSON.stringify(req.body));
  next();
}, bookingRules, handleValidationErrors, createBooking);

// GET /api/bookings/:ref — guest booking lookup (rate-limited, no auth required)
router.get('/:ref', bookingLookupLimiter, getBookingByRef);

// NOTE: GET / (list all bookings) is intentionally removed — only available
// to authenticated admins via GET /api/admin/bookings

module.exports = router;
