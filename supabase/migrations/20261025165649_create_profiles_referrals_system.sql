/*
# Create profiles and referrals tables with referral system

## Purpose
Adds user profiles linked to Supabase Auth, a referrals tracking table,
and a secure referral-code generation function. This is the foundation
for the HiremCV referral and signup-attribution system.

## 1. New Tables

### profiles
- `id` (uuid, primary key, references auth.users ON DELETE CASCADE)
- `email` (text, unique, not null) — cached from auth for convenience
- `full_name` (text, not null) — user's display name, used for referral code generation
- `referral_code` (text, unique) — the user's shareable code (e.g. VIVI4821)
- `referred_by` (text, nullable) — the referral_code of the user who referred them
- `wallet_balance` (integer, not null, default 0) — referral commission balance (naira)
- `is_pro` (boolean, not null, default false) — mirrors localStorage Pro state
- `created_at` (timestamptz, default now())

### referrals
- `id` (uuid, primary key)
- `referrer_id` (uuid, references profiles.id ON DELETE CASCADE)
- `referred_id` (uuid, references profiles.id ON DELETE CASCADE)
- `amount` (integer, default 1000) — commission in naira
- `status` (text, default 'paid')
- `created_at` (timestamptz, default now())
- Unique constraint on referred_id (one referral per signup)

## 2. Security (RLS)

### profiles
- Users can SELECT and UPDATE only their own profile row.
- INSERT is handled server-side (via SECURITY DEFINER function), so no direct INSERT grant to authenticated.
- Column-level UPDATE restriction: users may only update `full_name` — NOT referral_code, referred_by, wallet_balance, or is_pro.

### referrals
- Users can SELECT only referrals where they are the referrer.
- No INSERT/UPDATE/DELETE grants to authenticated — referral records are created server-side only.

## 3. Functions

### generate_referral_code(name text)
SECURITY DEFINER function that takes a name and returns a unique referral code.
Format: first 4 letters of name (uppercase) + 4 random digits.
Handles short names by padding. Resolves collisions by retrying with new digits.

### handle_new_user()
SECURITY DEFINER trigger function called on auth.users INSERT.
Creates a matching profiles row, generates a referral code, and if a valid
referred_by code was stored in raw_user_meta_data, validates it against an
existing profile and records the referral attribution.
*/

-- ============================================================
-- profiles table
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL DEFAULT '',
  referral_code text UNIQUE,
  referred_by text,
  wallet_balance integer NOT NULL DEFAULT 0,
  is_pro boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
GRANT SELECT ON profiles TO authenticated;
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile"
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Users can update only their own profile, and only the full_name column
-- (referral_code, referred_by, wallet_balance, is_pro are NOT user-editable)
GRANT UPDATE (full_name) ON profiles TO authenticated;
DROP POLICY IF EXISTS "update_own_profile_name" ON profiles;
CREATE POLICY "update_own_profile_name"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- referrals table
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL DEFAULT 1000,
  status text NOT NULL DEFAULT 'paid',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Users can see referrals where they are the referrer
GRANT SELECT ON referrals TO authenticated;
DROP POLICY IF EXISTS "select_own_referrals_as_referrer" ON referrals;
CREATE POLICY "select_own_referrals_as_referrer"
  ON referrals FOR SELECT TO authenticated
  USING (referrer_id = auth.uid());

-- No INSERT/UPDATE/DELETE grants to authenticated — managed server-side only

-- ============================================================
-- generate_referral_code function
-- ============================================================
CREATE OR REPLACE FUNCTION generate_referral_code(name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base text;
  code text;
  attempts integer := 0;
  max_attempts integer := 50;
BEGIN
  -- Normalize: uppercase, strip non-alpha, take up to 4 chars
  base := upper(regexp_replace(name, '[^A-Za-z]', '', 'g'));
  IF length(base) < 4 THEN
    base := rpad(base, 4, 'X');
  END IF;
  base := substr(base, 1, 4);

  LOOP
    code := base || lpad(floor(random() * 10000)::text, 4, '0');
    attempts := attempts + 1;

    IF NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = code) THEN
      RETURN code;
    END IF;

    IF attempts >= max_attempts THEN
      -- Fallback: append more randomness to force uniqueness
      code := base || lpad(floor(random() * 100000)::text, 5, '0');
      RETURN code;
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_referral_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_referral_code(text) TO authenticated;

-- ============================================================
-- handle_new_user trigger function
-- Called on INSERT to auth.users — creates profile + referral attribution
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  ref_code text;
  referrer_profile_id uuid;
  user_name text;
BEGIN
  -- Extract name from user metadata (set during signup)
  user_name := COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '');

  -- Generate a unique referral code for the new user
  new_code := generate_referral_code(user_name);

  -- Insert the profile row
  INSERT INTO profiles (id, email, full_name, referral_code)
  VALUES (new.id, new.email, user_name, new_code);

  -- Check for referral attribution from metadata
  ref_code := new.raw_user_meta_data->>'referred_by';

  IF ref_code IS NOT NULL AND ref_code <> '' THEN
    -- Validate: find the referrer's profile by referral_code
    -- Prevent self-referral (can't happen at signup since user doesn't exist yet, but guard anyway)
    SELECT id INTO referrer_profile_id
    FROM profiles
    WHERE referral_code = ref_code
      AND id <> new.id
    LIMIT 1;

    IF referrer_profile_id IS NOT NULL THEN
      -- Save the attribution on the new user's profile
      UPDATE profiles SET referred_by = ref_code WHERE id = new.id;

      -- Create the referral record
      INSERT INTO referrals (referrer_id, referred_id, amount, status)
      VALUES (referrer_profile_id, new.id, 1000, 'paid')
      ON CONFLICT (referred_id) DO NOTHING;
    END IF;
  END IF;

  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon;

-- Attach the trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Grant service_role access to profiles and referrals for edge functions
GRANT SELECT, INSERT, UPDATE ON profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON referrals TO service_role;
GRANT EXECUTE ON FUNCTION generate_referral_code(text) TO service_role;
