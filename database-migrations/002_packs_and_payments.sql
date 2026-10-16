-- Houserent Backend — Migration 002: Packs & Demo Payments
-- Run this in your Supabase SQL Editor AFTER schema.sql (or on an existing DB).
--
-- Business model
--   * New owners receive a free Starter Pack (30 days) for their first listing.
--   * Paid packs (basic 7d / pro 30d / ultra 90d) extend a listing's visibility.
--   * A listing is public only while its pack window (visibility_expires_at) is open.

-- ─── Users: track free starter usage ─────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS starter_used BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Listings: pack + visibility window ──────────────────────────────────────
ALTER TABLE listings ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS visibility_expires_at TIMESTAMPTZ;

-- Backfill existing listings so nothing disappears on upgrade: give each one a
-- Starter window starting from when it was created.
UPDATE listings
   SET plan = COALESCE(plan, 'starter'),
       visibility_expires_at = COALESCE(
           visibility_expires_at,
           created_at + INTERVAL '30 days'
       )
 WHERE visibility_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS listings_visibility_idx ON listings (visibility_expires_at);

-- ─── Payments (demo gateway) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id      UUID REFERENCES listings(id) ON DELETE SET NULL,
    plan            TEXT NOT NULL,
    amount          NUMERIC NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'INR',
    status          TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'failed')),
    method          TEXT NOT NULL DEFAULT 'demo',
    reference       TEXT,                -- demo transaction reference
    days            INTEGER NOT NULL,
    starts_at       TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,         -- listing visibility granted by this payment
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_user_idx    ON payments (user_id);
CREATE INDEX IF NOT EXISTS payments_listing_idx ON payments (listing_id);

-- ─── Row Level Security for payments ─────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read payments"   ON payments FOR SELECT TO anon USING (true);
CREATE POLICY "anon can insert payments" ON payments FOR INSERT TO anon WITH CHECK (true);
