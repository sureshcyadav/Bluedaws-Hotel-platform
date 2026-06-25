const rateLimit = require('express-rate-limit');

// ── Safe IP extractor ─────────────────────────────────────────────────────────
// Reads the RIGHTMOST entry of X-Forwarded-For, which Render's load balancer
// always appends and which cannot be spoofed by a client sending fake headers.
// Without this, an attacker who sends "X-Forwarded-For: fake-ip" on every
// request would appear to come from a different IP each time, bypassing all
// rate limits entirely.
function realIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const last = xff.split(',').pop().trim();
    if (last) return last;
  }
  return req.ip || req.socket.remoteAddress || '0.0.0.0';
}

function makeLimit({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    keyGenerator:    realIp,
    message:         { success: false, message },
  });
}

// ── Per-endpoint limits ───────────────────────────────────────────────────────

// Global safety net — any endpoint not covered by a tighter limit
const globalLimiter = makeLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      300,
  message:  'Too many requests. Please slow down.',
});

// Admin login — very tight to prevent brute-force password attacks
const loginLimiter = makeLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      5,
  message:  'Too many login attempts. Please wait 15 minutes and try again.',
});

// Booking creation — prevent spam bookings
const bookingCreateLimiter = makeLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max:      10,
  message:  'Too many booking attempts. Please try again in an hour.',
});

// Booking reference lookup — prevent brute-force ref enumeration
const bookingLookupLimiter = makeLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      20,
  message:  'Too many lookup attempts. Please try again later.',
});

// Availability checks — prevent bulk date-range scraping
const availabilityLimiter = makeLimit({
  windowMs: 60 * 1000, // 1 min
  max:      60,
  message:  'Too many availability requests. Please slow down.',
});

// Contact form submissions — prevent spam enquiries and email quota abuse
const contactLimiter = makeLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      5,
  message:  'Too many messages sent. Please wait 15 minutes before trying again.',
});

// Settings / prices — prevent DB hammering
const settingsLimiter = makeLimit({
  windowMs: 60 * 1000, // 1 min
  max:      60,
  message:  'Too many requests. Please slow down.',
});

module.exports = {
  globalLimiter,
  loginLimiter,
  bookingCreateLimiter,
  bookingLookupLimiter,
  availabilityLimiter,
  contactLimiter,
  settingsLimiter,
};
