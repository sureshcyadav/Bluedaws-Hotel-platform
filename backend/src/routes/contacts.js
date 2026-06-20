const router = require('express').Router();
const { contactRules, handleValidationErrors } = require('../middleware/validate');
const { createContact } = require('../controllers/contactController');

// POST /api/contacts
router.post('/', contactRules, handleValidationErrors, createContact);

module.exports = router;
