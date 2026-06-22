const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');

const bookingRoutes  = require('./routes/bookings');
const contactRoutes  = require('./routes/contacts');
const adminRoutes    = require('./routes/admin');
const settingsRoutes = require('./routes/settings');

const app = express();

// Trust the first proxy hop (Render's load balancer) so rate limiters
// and logs see the real client IP from X-Forwarded-For, not the proxy IP.
app.set('trust proxy', 1);

// ── Security headers ────────────────────────────────────────────────
app.use(helmet());

// ── CORS ────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' is not allowed.`));
  },
  methods:          ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders:   ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
}));

// ── Body parser ─────────────────────────────────────────────────────
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false }));

// ── Logger ──────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Health check ────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'Bluedaws Hotel API',
    time:    new Date().toISOString(),
  });
});

// ── Routes ──────────────────────────────────────────────────────────
app.use('/api/bookings', bookingRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/settings', settingsRoutes);

// ── 404 ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found.` });
});

// ── Global error handler ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message,
  });
});

module.exports = app;
