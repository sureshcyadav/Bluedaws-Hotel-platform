const express  = require('express');
const { pool } = require('../config/db');
const router   = express.Router();
const { settingsLimiter } = require('../middleware/rateLimits');

// GET /api/settings — public JSON endpoint
router.get('/', settingsLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const data = {};
    rows.forEach(r => { data[r.key] = r.value; });
    res.set('Cache-Control', 'no-store');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/prices.js — returns a JS snippet that sets window.__BDW_PRICES__
// Loaded via <script> tag so no CORS or CORP needed
router.get('/prices.js', settingsLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'price_%'");
    const prices = {};
    rows.forEach(r => { prices[r.key] = r.value; });
    res.set('Content-Type', 'application/javascript; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    const snippet = `(function(){var p=${JSON.stringify(prices)};window.__BDW_PRICES__=p;if(typeof window.applyBDWPrices==='function')window.applyBDWPrices(p);})();`;
    res.send(snippet);
  } catch (err) {
    res.status(500).send('/* prices unavailable */');
  }
});

module.exports = router;
