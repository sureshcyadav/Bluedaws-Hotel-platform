const router = require('express').Router();
const { contactRules, handleValidationErrors } = require('../middleware/validate');
const { createContact } = require('../controllers/contactController');
const { contactLimiter } = require('../middleware/rateLimits');

// POST /api/contacts
router.post('/', contactLimiter, contactRules, handleValidationErrors, createContact);

module.exports = router;
