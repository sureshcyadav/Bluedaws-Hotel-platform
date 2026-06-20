-- ======================================================================
-- BLUEDAWS HOTEL — MySQL Database Schema
-- ======================================================================
-- Run this file once to set up the database:
--   mysql -u root -p < sql/schema.sql
-- ======================================================================

CREATE DATABASE IF NOT EXISTS bluedaws_hotel
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bluedaws_hotel;

-- ------------------------------------------------------------------
-- bookings
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ref                   VARCHAR(12)  NOT NULL UNIQUE,           -- e.g. BDW-K4MX7Z

  -- Guest
  guest_first_name      VARCHAR(100) NOT NULL,
  guest_last_name       VARCHAR(100) NOT NULL,
  guest_email           VARCHAR(255) NOT NULL,
  guest_phone           VARCHAR(50)  NOT NULL,
  guest_country         VARCHAR(100) NOT NULL,

  -- Room
  room_code             VARCHAR(10)  NOT NULL,                  -- e.g. D6, C3
  room_name             VARCHAR(100) NOT NULL,
  room_floor            VARCHAR(60)  DEFAULT NULL,
  room_bed              VARCHAR(120) DEFAULT NULL,
  price_per_night       DECIMAL(8,2) NOT NULL,

  -- Stay
  checkin_date          DATE         NOT NULL,
  checkout_date         DATE         NOT NULL,
  nights                SMALLINT     NOT NULL,
  adults                TINYINT      NOT NULL DEFAULT 1,
  children              TINYINT      NOT NULL DEFAULT 0,

  -- Financials
  total_amount          DECIMAL(10,2) NOT NULL,
  payment_method        ENUM('card','bank','payathotel') NOT NULL DEFAULT 'card',
  special_requests      TEXT         DEFAULT NULL,

  -- Status
  status                ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',

  -- Timestamps
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Indexes
  INDEX idx_email       (guest_email),
  INDEX idx_checkin     (checkin_date),
  INDEX idx_status      (status),
  INDEX idx_room_code   (room_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- contacts  (from the contact page form)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name    VARCHAR(100)  NOT NULL,
  last_name     VARCHAR(100)  NOT NULL,
  email         VARCHAR(255)  NOT NULL,
  phone         VARCHAR(50)   DEFAULT NULL,
  subject       VARCHAR(100)  NOT NULL,
  message       TEXT          NOT NULL,
  status        ENUM('unread','read','replied') NOT NULL DEFAULT 'unread',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_email  (email),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
