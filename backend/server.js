require('dotenv').config();
const app                = require('./src/app');
const { testConnection } = require('./src/config/db');
const { pool }           = require('./src/config/db');

const PORT = process.env.PORT || 3000;

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id                  SERIAL PRIMARY KEY,
      ref                 VARCHAR(12)   NOT NULL UNIQUE,
      guest_first_name    VARCHAR(100)  NOT NULL,
      guest_last_name     VARCHAR(100)  NOT NULL,
      guest_email         VARCHAR(255)  NOT NULL,
      guest_phone         VARCHAR(50)   NOT NULL,
      guest_country       VARCHAR(100)  NOT NULL,
      room_code           VARCHAR(10)   NOT NULL,
      room_name           VARCHAR(100)  NOT NULL,
      room_floor          VARCHAR(60),
      room_bed            VARCHAR(120),
      price_per_night     NUMERIC(8,2)  NOT NULL,
      checkin_date        DATE          NOT NULL,
      checkout_date       DATE          NOT NULL,
      nights              SMALLINT      NOT NULL,
      adults              SMALLINT      NOT NULL DEFAULT 1,
      children            SMALLINT      NOT NULL DEFAULT 0,
      total_amount        NUMERIC(10,2) NOT NULL,
      payment_method      VARCHAR(20)   NOT NULL DEFAULT 'card'
                            CHECK (payment_method IN ('card','bank','payathotel')),
      special_requests    TEXT,
      status              VARCHAR(20)   NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','confirmed','cancelled')),
      created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id          SERIAL PRIMARY KEY,
      first_name  VARCHAR(100)  NOT NULL,
      last_name   VARCHAR(100)  NOT NULL,
      email       VARCHAR(255)  NOT NULL,
      phone       VARCHAR(50),
      subject     VARCHAR(100)  NOT NULL,
      message     TEXT          NOT NULL,
      status      VARCHAR(20)   NOT NULL DEFAULT 'unread'
                    CHECK (status IN ('unread','read','replied')),
      created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_email   ON bookings (guest_email);
    CREATE INDEX IF NOT EXISTS idx_bookings_checkin ON bookings (checkin_date);
    CREATE INDEX IF NOT EXISTS idx_bookings_status  ON bookings (status);
    CREATE INDEX IF NOT EXISTS idx_contacts_email   ON contacts (email);
    CREATE INDEX IF NOT EXISTS idx_contacts_status  ON contacts (status);
  `);

  // Settings table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key        VARCHAR(100) PRIMARY KEY,
      value      TEXT         NOT NULL DEFAULT '',
      label      VARCHAR(200) NOT NULL DEFAULT '',
      category   VARCHAR(100) NOT NULL DEFAULT 'general',
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);

  // Seed default settings (skip if already exist)
  await pool.query(`
    INSERT INTO settings (key, value, label, category) VALUES
      ('price_d6',  '85',   'Single Room (D6)',              'rooms'),
      ('price_c3',  '110',  'Twin Room (C3)',                'rooms'),
      ('price_d3',  '110',  'Twin Room (D3)',                'rooms'),
      ('price_b6',  '135',  'Triple Room (B6)',              'rooms'),
      ('price_c6',  '135',  'Triple Room (C6)',              'rooms'),
      ('price_b8',  '145',  'Double + Single (B8)',          'rooms'),
      ('price_b7',  '160',  'Family Room (B7)',              'rooms'),
      ('price_e2',  '160',  'Family Room (E2)',              'rooms'),
      ('price_e3',  '160',  'Family Room (E3)',              'rooms'),
      ('price_b2',  '195',  'Large Family Room (B2)',        'rooms'),
      ('price_b4',  '195',  'Large Family Room (B4)',        'rooms'),
      ('price_b5',  '225',  'Group Room 6 Beds (B5)',        'rooms'),
      ('price_c1',  '225',  'Group Room 6 Beds (C1)',        'rooms'),
      ('price_c4',  '225',  'Group Room 6 Beds (C4)',        'rooms'),
      ('price_d1',  '225',  'Group Room 6 Beds (D1)',        'rooms'),
      ('price_d2',  '225',  'Group Room 6 Beds (D2)',        'rooms'),
      ('price_d5',  '225',  'Group Room 6 Beds (D5)',        'rooms'),
      ('price_b3',  '235',  'Group Room Mixed Beds (B3)',    'rooms'),
      ('price_c5',  '235',  'Group Room Mixed Beds (C5)',    'rooms'),
      ('price_d4',  '235',  'Group Room Mixed Beds (D4)',    'rooms'),
      ('price_z6',  '275',  'Large Group Room (Z6)',         'rooms'),
      ('price_c2',  '275',  'Large Group Room (C2)',         'rooms'),
      ('checkin_time',    '1:00 PM',                        'Check-in Time',               'hotel'),
      ('checkout_time',   '12:00 PM',                       'Check-out Time',              'hotel'),
      ('confirm_hours',   '2',                              'Booking Confirmation (hours)', 'hotel'),
      ('hotel_address',   'Paddington, London',             'Address',                     'hotel'),
      ('hotel_email',     'bluedawsprivatehotel@gmail.com', 'Contact Email',               'hotel'),
      ('hotel_phone',     '02077236040',                    'Contact Phone',               'hotel'),
      ('deposit_percent', '50',                             'Deposit Required (%)',        'hotel'),
      -- Images
      ('img_hero',        '', 'Hero / Banner Image URL (all pages)',  'images'),
      ('img_double_room', '', 'Double Room Image URL',                'images'),
      ('img_twin_room',   '', 'Twin Room Image URL',                  'images'),
      ('img_exterior',    '', 'Exterior Photo URL',                   'images'),
      ('img_gallery_1',   '', 'Gallery Image 1 URL',                  'images'),
      ('img_gallery_2',   '', 'Gallery Image 2 URL',                  'images'),
      ('img_gallery_3',   '', 'Gallery Image 3 URL',                  'images'),
      -- Promotion
      ('promo_active',    'false',        'Active',                   'promotion'),
      ('promo_title',     'Special Offer','Title',                    'promotion'),
      ('promo_badge',     '',             'Badge Text (e.g. 20% OFF)','promotion'),
      ('promo_desc',      '',             'Description',              'promotion'),
      ('promo_expiry',    '',             'Valid Until (e.g. 30 Jun 2026)', 'promotion'),
      -- Announcement
      ('ann_active',      'false', 'Active',                          'announcement'),
      ('ann_text',        '',      'Announcement Text',               'announcement'),
      ('ann_type',        'info',  'Type  (info / warning / success)','announcement')
    ON CONFLICT (key) DO NOTHING;
  `);

  // Auto-update trigger for updated_at
  await pool.query(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS bookings_updated_at ON bookings;
    CREATE TRIGGER bookings_updated_at
      BEFORE UPDATE ON bookings
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  console.log('✓ Database tables ready');
}

(async () => {
  await testConnection();
  await initDb();
  app.listen(PORT, () => {
    console.log(`✓ Bluedaws Hotel API running on port ${PORT}`);
    console.log(`  Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Health check: http://localhost:${PORT}/api/health`);
  });
})();
