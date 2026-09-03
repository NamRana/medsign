-- Notifications and follow-up system for health assessments

-- 1. Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'follow_up', -- follow_up, reminder, system, tip
    icon TEXT DEFAULT 'bell', -- bell, heart, alert, check, pill
    read BOOLEAN NOT NULL DEFAULT FALSE,
    action_url TEXT, -- e.g. /chat, /insights, /chat?id=xxx
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Follow-ups table (scheduled check-ins after assessments)
CREATE TABLE IF NOT EXISTS follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    chief_complaint TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, dismissed
    follow_up_number INT NOT NULL DEFAULT 1, -- 1st, 2nd, 3rd follow-up
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follow_ups_user_id ON follow_ups(user_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_scheduled ON follow_ups(scheduled_at) WHERE status = 'pending';

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON notifications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own follow_ups" ON follow_ups FOR ALL USING (auth.uid() = user_id);
