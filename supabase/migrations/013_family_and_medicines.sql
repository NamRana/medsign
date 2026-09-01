-- Family Members table
CREATE TABLE IF NOT EXISTS family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relationship TEXT NOT NULL, -- self, mother, father, spouse, child, sibling, other
    date_of_birth DATE,
    gender TEXT, -- male, female, other
    blood_group TEXT,
    avatar_color TEXT DEFAULT 'emerald',
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_family_members_user ON family_members(user_id);

-- Medicines table
CREATE TABLE IF NOT EXISTS medicines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    family_member_id UUID REFERENCES family_members(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    dosage TEXT, -- "500mg", "1 tablet", "5ml"
    frequency TEXT NOT NULL DEFAULT 'daily', -- daily, twice_daily, thrice_daily, weekly, as_needed
    times TEXT[] DEFAULT '{}', -- ["08:00", "20:00"]
    meal_relation TEXT DEFAULT 'after', -- before, after, with, anytime
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_medicines_user ON medicines(user_id);
CREATE INDEX idx_medicines_family ON medicines(family_member_id);
CREATE INDEX idx_medicines_active ON medicines(user_id, is_active);

-- Medicine Logs (track daily adherence)
CREATE TABLE IF NOT EXISTS medicine_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scheduled_time TEXT, -- "08:00"
    status TEXT NOT NULL DEFAULT 'pending', -- taken, missed, skipped
    taken_at TIMESTAMPTZ,
    logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_medicine_logs_medicine ON medicine_logs(medicine_id);
CREATE INDEX idx_medicine_logs_date ON medicine_logs(user_id, logged_date);

-- RLS Policies
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicine_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own family members"
    ON family_members FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own medicines"
    ON medicines FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own medicine logs"
    ON medicine_logs FOR ALL USING (auth.uid() = user_id);
