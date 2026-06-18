-- MFA Auth — Neon PostgreSQL schema

CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name             VARCHAR(100) NOT NULL,
  email                 VARCHAR(254) NOT NULL UNIQUE,
  password              TEXT NOT NULL,
  role                  VARCHAR(20) NOT NULL DEFAULT 'user'
                        CHECK (role IN ('user', 'admin')),
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

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE TABLE IF NOT EXISTS auth_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(254),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  role        VARCHAR(20) NOT NULL DEFAULT 'user',
  ip          VARCHAR(45),
  user_agent  TEXT,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_activity_created_at ON auth_activity (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_activity_user_id ON auth_activity (user_id);
