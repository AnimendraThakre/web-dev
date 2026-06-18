-- MFA Auth — Neon PostgreSQL schema (idempotent)

CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name             VARCHAR(100) NOT NULL,
  email                 VARCHAR(254) NOT NULL UNIQUE,
  password              TEXT NOT NULL,
  role                  VARCHAR(20) NOT NULL DEFAULT 'user',
  is_disabled           BOOLEAN NOT NULL DEFAULT FALSE,
  is_email_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  totp_secret           TEXT,
  email_otp_hash        TEXT,
  email_otp_expires_at  TIMESTAMPTZ,
  reset_otp_hash        TEXT,
  reset_otp_expires_at  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade existing tables created before full schema
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE TABLE IF NOT EXISTS auth_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(254),
  user_id     UUID,
  action      VARCHAR(100) NOT NULL,
  role        VARCHAR(20) NOT NULL DEFAULT 'user',
  ip          VARCHAR(45),
  user_agent  TEXT,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE auth_activity ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE auth_activity ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE auth_activity ADD COLUMN IF NOT EXISTS action VARCHAR(100);
ALTER TABLE auth_activity ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE auth_activity ADD COLUMN IF NOT EXISTS ip VARCHAR(45);
ALTER TABLE auth_activity ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE auth_activity ADD COLUMN IF NOT EXISTS meta JSONB;
ALTER TABLE auth_activity ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_auth_activity_created_at ON auth_activity (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_activity_user_id ON auth_activity (user_id);
