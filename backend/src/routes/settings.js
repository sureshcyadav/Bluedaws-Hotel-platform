const express  = require('express');
const { pool } = require('../config/db');
const router   = express.Router();

// GET /api/settings — public, used by frontend to fetch dynamic prices
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const data = {};
    rows.forEach(r => { data[r.key] = r.value; });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
