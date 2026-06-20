-- ======================================================================
-- BLUEDAWS HOTEL — PostgreSQL Schema (Render.com)
-- ======================================================================
-- Render runs this automatically via the DATABASE_URL connection.
-- You can also run it manually in Render's "Shell" tab:
--   psql $DATABASE_URL -f sql/schema.sql
-- ======================================================================

CREATE TABLE IF NOT EXISTS bookings (
  id                  SERIAL PRIMARY KEY,
  ref                 VARCHAR(12)  NOT NULL UNIQUE,

  -- Guest
  guest_first_name    VARCHAR(100) NOT NULL,
  guest_last_name     VARCHAR(100) NOT NULL,
  guest_email         VARCHAR(255) NOT NULL,
  guest_phone         VARCHAR(50)  NOT NULL,
  guest_country       VARCHAR(100) NOT NULL,

  -- Room
  room_code           VARCHAR(10)  NOT NULL,
  room_name           VARCHAR(100) NOT NULL,
  room_floor          VARCHAR(60),
  room_bed            VARCHAR(120),
  price_per_night     NUMERIC(8,2) NOT NULL,

  -- Stay
  checkin_date        DATE         NOT NULL,
  checkout_date       DATE         NOT NULL,
  nights              SMALLINT     NOT NULL,
  adults              SMALLINT     NOT NULL DEFAULT 1,
  children            SMALLINT     NOT NULL DEFAULT 0,

  -- Financials
  total_amount        NUMERIC(10,2) NOT NULL,
  payment_method      VARCHAR(20)  NOT NULL DEFAULT 'card'
                        CHECK (payment_method IN ('card','bank','payathotel')),
  special_requests    TEXT,

  -- Status
  status              VARCHAR(20)  NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','cancelled')),

  -- Timestamps
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_email    ON bookings (guest_email);
CREATE INDEX IF NOT EXISTS idx_bookings_checkin  ON bookings (checkin_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_room     ON bookings (room_code);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_updated_at ON bookings;
CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_contacts_email  ON contacts (email);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts (status);
