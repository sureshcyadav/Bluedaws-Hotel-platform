const router = require('express').Router();
const { bookingRules, handleValidationErrors } = require('../middleware/validate');
const { createBooking, checkAvailability, getBookingByRef, listBookings } = require('../controllers/bookingController');

// GET /api/bookings/availability — must be before /:ref to avoid matching "availability" as a ref
router.get('/availability', checkAvailability);

// POST /api/bookings — create a new booking
router.post('/', bookingRules, handleValidationErrors, createBooking);

// GET /api/bookings — list all bookings (admin)
router.get('/', listBookings);

// GET /api/bookings/:ref — get booking by reference
router.get('/:ref', getBookingByRef);

module.exports = router;
