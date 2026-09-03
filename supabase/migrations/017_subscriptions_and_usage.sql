-- Subscriptions table — tracks Razorpay subscription lifecycle
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    razorpay_subscription_id TEXT UNIQUE,
    razorpay_payment_id TEXT,
    razorpay_customer_id TEXT,
    plan TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'pro'
    status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'cancelled' | 'expired' | 'past_due' | 'pending'
    amount INTEGER DEFAULT 0,  -- in paise (19900 = ₹199)
    currency TEXT DEFAULT 'INR',
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_rz_sub_id ON subscriptions(razorpay_subscription_id);

-- Usage tracking — per user per month
CREATE TABLE IF NOT EXISTS usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month TEXT NOT NULL,  -- '2026-09'
    assessments_used INTEGER NOT NULL DEFAULT 0,
    lab_reports_used INTEGER NOT NULL DEFAULT 0,
    face_scans_used INTEGER NOT NULL DEFAULT 0,
    image_analyses_used INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_month ON usage_tracking(user_id, month);

-- RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_user_read ON subscriptions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY usage_tracking_user_read ON usage_tracking
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything (backend uses service role key)
CREATE POLICY subscriptions_service_all ON subscriptions
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY usage_tracking_service_all ON usage_tracking
    FOR ALL USING (true) WITH CHECK (true);
