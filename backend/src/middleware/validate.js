const { body, validationResult } = require('express-validator');

// Physical room definitions — used by admin for walk-in bookings and room allocation
const VALID_ROOMS = {
  d6:  { name: 'Single Room',       floor: 'Third Floor',   bed: '1 Single Bed',                   max: 1, price: 85  },
  c3:  { name: 'Twin Room',         floor: 'Second Floor',  bed: '2 Single Beds',                  max: 2, price: 110 },
  d3:  { name: 'Twin Room',         floor: 'Third Floor',   bed: '2 Single Beds',                  max: 2, price: 110 },
  b6:  { name: 'Triple Room',       floor: 'First Floor',   bed: '1 Bunk + 1 Single',              max: 3, price: 135 },
  c6:  { name: 'Triple Room',       floor: 'Second Floor',  bed: '1 Bunk + 1 Single',              max: 3, price: 135 },
  b8:  { name: 'Double + Single',   floor: 'First Floor',   bed: '1 Double + 1 Single',            max: 3, price: 145 },
  b7:  { name: 'Family Room',       floor: 'First Floor',   bed: '1 Double + 2 Single',            max: 4, price: 160 },
  e2:  { name: 'Family Room',       floor: 'Fourth Floor',  bed: '1 Double + 2 Single',            max: 4, price: 160 },
  e3:  { name: 'Family Room',       floor: 'Fourth Floor',  bed: '1 Double + 2 Single',            max: 4, price: 160 },
  b2:  { name: 'Large Family Room', floor: 'First Floor',   bed: '1 Double + 1 Single + 1 Bunk',  max: 5, price: 195 },
  b4:  { name: 'Large Family Room', floor: 'First Floor',   bed: '1 Double + 1 Single + 1 Bunk',  max: 5, price: 195 },
  b5:  { name: 'Group Room',        floor: 'First Floor',   bed: '3 Bunk Beds',                    max: 6, price: 225 },
  c1:  { name: 'Group Room',        floor: 'Second Floor',  bed: '3 Bunk Beds',                    max: 6, price: 225 },
  c4:  { name: 'Group Room',        floor: 'Second Floor',  bed: '3 Bunk Beds',                    max: 6, price: 225 },
  d1:  { name: 'Group Room',        floor: 'Third Floor',   bed: '3 Bunk Beds',                    max: 6, price: 225 },
  d2:  { name: 'Group Room',        floor: 'Third Floor',   bed: '3 Bunk Beds',                    max: 6, price: 225 },
  d5:  { name: 'Group Room',        floor: 'Third Floor',   bed: '3 Bunk Beds',                    max: 6, price: 225 },
  b3:  { name: 'Group Room',        floor: 'First Floor',   bed: '1 Double + 2 Single + 1 Bunk',  max: 6, price: 235 },
  c5:  { name: 'Group Room',        floor: 'Second Floor',  bed: '2 Bunk + 2 Single',              max: 6, price: 235 },
  d4:  { name: 'Group Room',        floor: 'Third Floor',   bed: '2 Bunk + 2 Single',              max: 6, price: 235 },
  z6:  { name: 'Large Group Room',  floor: 'Basement',      bed: '3 Bunk + 1 Single',              max: 7, price: 275 },
  c2:  { name: 'Large Group Room',  floor: 'Second Floor',  bed: '3 Bunk + 1 Single',              max: 7, price: 275 },
};

// Room types for guest-facing bookings — guests pick a type, admin allocates specific room later
const ROOM_TYPES = {
  single:        { label: 'Single Room',             max: 1, priceKey: 'price_d6',  codes: ['d6'],                           bed: '1 Single Bed'                   },
  twin:          { label: 'Twin Room',               max: 2, priceKey: 'price_c3',  codes: ['c3', 'd3'],                    bed: '2 Single Beds'                  },
  triple:        { label: 'Triple Room',             max: 3, priceKey: 'price_b6',  codes: ['b6', 'c6'],                    bed: '1 Bunk + 1 Single'              },
  double_single: { label: 'Double + Single Room',    max: 3, priceKey: 'price_b8',  codes: ['b8'],                          bed: '1 Double + 1 Single'            },
  family:        { label: 'Family Room',             max: 4, priceKey: 'price_b7',  codes: ['b7', 'e2', 'e3'],              bed: '1 Double + 2 Single'            },
  large_family:  { label: 'Large Family Room',       max: 5, priceKey: 'price_b2',  codes: ['b2', 'b4'],                    bed: '1 Double + 1 Single + 1 Bunk'  },
  group_6:       { label: 'Group Room (6 Beds)',     max: 6, priceKey: 'price_b5',  codes: ['b5','c1','c4','d1','d2','d5'], bed: '3 Bunk Beds (6 Beds)'           },
  group_mixed:   { label: 'Group Room (Mixed Beds)', max: 6, priceKey: 'price_b3',  codes: ['b3', 'c5', 'd4'],              bed: '1 Double + 2 Single + 1 Bunk'  },
  large_group:   { label: 'Large Group Room',        max: 7, priceKey: 'price_z6',  codes: ['z6', 'c2'],                   bed: '3 Bunk + 1 Single (7 Beds)'    },
};

// Reverse map: room_code → room_type key (used by walk-in booking to auto-set room_type)
const ROOM_CODE_TO_TYPE = {};
Object.entries(ROOM_TYPES).forEach(([typeKey, t]) => {
  t.codes.forEach(code => { ROOM_CODE_TO_TYPE[code] = typeKey; });
});

const VALID_PAYMENTS = ['card', 'bank', 'payathotel'];

// ── Booking validation rules ────────────────────────────────────────
const bookingRules = [
  body('checkin_date')
    .notEmpty().withMessage('Check-in date is required.')
    .custom(val => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val) || isNaN(Date.parse(val + 'T12:00:00')))
        throw new Error('Check-in date must be a valid date (YYYY-MM-DD).');
      // String comparison avoids Render UTC-7 timezone offset bugs
      const todayStr = new Date().toISOString().slice(0, 10);
      if (val < todayStr) throw new Error('Check-in date cannot be in the past.');
      return true;
    }),

  body('checkout_date')
    .notEmpty().withMessage('Check-out date is required.')
    .custom((val, { req }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val) || isNaN(Date.parse(val + 'T12:00:00')))
        throw new Error('Check-out date must be a valid date (YYYY-MM-DD).');
      if (val <= (req.body.checkin_date || '')) {
        throw new Error('Check-out must be after check-in.');
      }
      return true;
    }),

  body('adults')
    .notEmpty().withMessage('Number of adults is required.')
    .isInt({ min: 1, max: 7 }).withMessage('Adults must be between 1 and 7.'),

  body('children')
    .optional()
    .isInt({ min: 0, max: 3 }).withMessage('Children must be between 0 and 3.'),

  body('room_type')
    .notEmpty().withMessage('Room type is required.')
    .custom((val, { req }) => {
      const roomType = ROOM_TYPES[val];
      if (!roomType) throw new Error('Invalid room type.');
      const adults   = Number(req.body.adults)   || 1;
      const children = Number(req.body.children) || 0;
      if (adults + children > roomType.max) {
        throw new Error(`${roomType.label} fits up to ${roomType.max} guest(s). You have ${adults + children}.`);
      }
      return true;
    }),

  body('payment_method')
    .notEmpty().withMessage('Payment method is required.')
    .isIn(VALID_PAYMENTS).withMessage(`Payment method must be one of: ${VALID_PAYMENTS.join(', ')}.`),

  body('guest_first_name')
    .trim().notEmpty().withMessage('First name is required.')
    .isLength({ max: 100 }).withMessage('First name too long.'),

  body('guest_last_name')
    .trim().notEmpty().withMessage('Last name is required.')
    .isLength({ max: 100 }).withMessage('Last name too long.'),

  body('guest_email')
    .trim().notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),

  body('guest_phone')
    .trim().notEmpty().withMessage('Phone number is required.')
    .isLength({ min: 7, max: 50 }).withMessage('Phone number must be 7–50 characters.'),

  body('guest_country')
    .trim().notEmpty().withMessage('Country of residence is required.')
    .isLength({ max: 100 }).withMessage('Country name too long.'),

  body('special_requests')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Special requests must be under 1000 characters.'),
];

// ── Contact validation rules ────────────────────────────────────────
const contactRules = [
  body('first_name').trim().notEmpty().withMessage('First name is required.').isLength({ max: 100 }),
  body('last_name').trim().notEmpty().withMessage('Last name is required.').isLength({ max: 100 }),
  body('email').trim().notEmpty().withMessage('Email is required.').isEmail().withMessage('Valid email required.').normalizeEmail(),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('subject').trim().notEmpty().withMessage('Subject is required.').isLength({ max: 100 }),
  body('message').trim().notEmpty().withMessage('Message is required.').isLength({ max: 2000 }).withMessage('Message must be under 2000 characters.'),
];

// ── Error collector middleware ───────────────────────────────────────
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errs = errors.array().map(e => ({ field: e.path, message: e.msg }));
    console.error('[validation] failed:', JSON.stringify(errs));
    return res.status(422).json({
      success: false,
      message: errs.map(e => e.message).join(' · '),
      errors:  errs,
    });
  }
  next();
}

module.exports = { bookingRules, contactRules, handleValidationErrors, VALID_ROOMS, ROOM_TYPES, ROOM_CODE_TO_TYPE };
