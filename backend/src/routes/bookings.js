const router = require('express').Router();
const { bookingRules, handleValidationErrors } = require('../middleware/validate');
const { createBooking, getBookingByRef, listBookings } = require('../controllers/bookingController');

// POST /api/bookings — create a new booking
router.post('/', bookingRules, handleValidationErrors, createBooking);

// GET /api/bookings — list all bookings (admin)
router.get('/', listBookings);

// GET /api/bookings/:ref — get booking by reference
router.get('/:ref', getBookingByRef);

module.exports = router;
