-- =====================================================
-- EryAI Dashboard - Supabase Setup
-- Kör detta i Supabase SQL Editor
-- =====================================================

-- 1. CUSTOMERS TABLE (dina kunder - t.ex. restauranger)
-- =====================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- t.ex. "bella-italia"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settings JSONB DEFAULT '{}'::jsonb
);

-- Lägg till demo-kunden (Bella Italia)
INSERT INTO customers (name, slug) 
VALUES ('Bella Italia', 'bella-italia')
ON CONFLICT (slug) DO NOTHING;

-- 2. DASHBOARD_USERS TABLE (kopplar Supabase Auth till kunder)
-- =====================================================
CREATE TABLE IF NOT EXISTS dashboard_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'admin', -- 'admin', 'viewer'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 3. UPPDATERA CHAT_SESSIONS (lägg till customer_id om den saknas)
-- =====================================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'chat_sessions' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE chat_sessions 
    ADD COLUMN customer_id UUID REFERENCES customers(id);
  END IF;
END $$;

-- Sätt alla befintliga sessioner till Bella Italia (demo)
UPDATE chat_sessions 
SET customer_id = (SELECT id FROM customers WHERE slug = 'bella-italia')
WHERE customer_id IS NULL;

-- 4. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Aktivera RLS på alla tabeller
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Service role kan alltid läsa allt (för API-anrop)
-- (Service role bypasses RLS automatiskt, så vi behöver inte explicit policy)

-- Policy för customers - läs endast sin egen kund
CREATE POLICY "Users can view their own customer"
  ON customers FOR SELECT
  USING (
    id IN (
      SELECT customer_id FROM dashboard_users 
      WHERE user_id = auth.uid()
    )
  );

-- Policy för dashboard_users - läs endast sig själv
CREATE POLICY "Users can view their own dashboard_user"
  ON dashboard_users FOR SELECT
  USING (user_id = auth.uid());

-- Policy för chat_sessions - läs endast sin kunds sessioner
CREATE POLICY "Users can view their customer sessions"
  ON chat_sessions FOR SELECT
  USING (
    customer_id IN (
      SELECT customer_id FROM dashboard_users 
      WHERE user_id = auth.uid()
    )
  );

-- Policy för chat_messages - läs endast meddelanden från sina sessioner
CREATE POLICY "Users can view messages from their sessions"
  ON chat_messages FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM chat_sessions 
      WHERE customer_id IN (
        SELECT customer_id FROM dashboard_users 
        WHERE user_id = auth.uid()
      )
    )
  );

-- 5. INDEXES FÖR PRESTANDA
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_chat_sessions_customer_id ON chat_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_user_id ON dashboard_users(user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_customer_id ON dashboard_users(customer_id);

-- =====================================================
-- MANUELLA STEG EFTER SQL:
-- =====================================================
-- 
-- 1. Skapa användare i Supabase Auth:
--    - Din superadmin: (via Supabase Dashboard > Authentication > Users)
--    - Demo-konto: demo@eryai.tech (eller liknande)
--
-- 2. Koppla demo-användaren till Bella Italia:
--    INSERT INTO dashboard_users (user_id, customer_id)
--    VALUES (
--      '<demo-user-uuid>', 
--      (SELECT id FROM customers WHERE slug = 'bella-italia')
--    );
--
-- 3. Sätt SUPERADMIN_EMAIL i Vercel environment variables
-- =====================================================
