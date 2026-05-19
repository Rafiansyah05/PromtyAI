-- ============================================
-- PROMTY MVP — SUPABASE SCHEMA
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: users
-- Hanya simpan data minimal untuk cloud
-- (sesuai ERD Supabase)
-- ============================================
CREATE TABLE public.users (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email            TEXT NOT NULL UNIQUE,
    installed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at   TIMESTAMPTZ,
    extension_version TEXT NOT NULL DEFAULT '1.0.0',
    plan_tier        TEXT NOT NULL DEFAULT 'free'
                     CHECK (plan_tier IN ('free', 'pro', 'team')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk lookup cepat by email
CREATE INDEX idx_users_email ON public.users (email);
CREATE INDEX idx_users_plan_tier ON public.users (plan_tier);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Hanya anon bisa INSERT (untuk register via landing page)
-- Service role bisa semua
CREATE POLICY "Allow anonymous insert" ON public.users
    FOR INSERT TO anon
    WITH CHECK (true);

-- User hanya bisa baca data sendiri (jika nanti ada auth)
CREATE POLICY "Users can read own data" ON public.users
    FOR SELECT USING (true); -- relaxed di MVP, restrict nanti

-- ============================================
-- FUNCTION: update updated_at otomatis
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- TABLE: download_events
-- Tracking setiap kali user klik download
-- (analytics sederhana)
-- ============================================
CREATE TABLE public.download_events (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email      TEXT NOT NULL,
    user_agent TEXT,
    referrer   TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_download_events_email ON public.download_events (email);
CREATE INDEX idx_download_events_created_at ON public.download_events (created_at DESC);

ALTER TABLE public.download_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert on download_events"
    ON public.download_events FOR INSERT TO anon WITH CHECK (true);

-- ============================================
-- VIEWS: untuk analytics sederhana
-- ============================================
CREATE VIEW public.v_daily_downloads AS
SELECT
    DATE(created_at) AS date,
    COUNT(*) AS total_downloads
FROM public.download_events
GROUP BY DATE(created_at)
ORDER BY date DESC;

CREATE VIEW public.v_user_stats AS
SELECT
    plan_tier,
    COUNT(*) AS total_users,
    COUNT(*) FILTER (WHERE last_active_at > NOW() - INTERVAL '7 days') AS active_7d,
    COUNT(*) FILTER (WHERE installed_at > NOW() - INTERVAL '30 days') AS new_30d
FROM public.users
GROUP BY plan_tier;
