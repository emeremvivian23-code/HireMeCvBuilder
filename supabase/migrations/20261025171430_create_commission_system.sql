/*
# Referral commission system: payments, admin roles, wallet transactions

## Purpose
Adds server-side payment confirmation with referral commission awarding,
an audit trail for wallet changes, admin role management, and a safe
reversal process for refunded purchases. The existing manual unlock-code
flow is preserved and extended: when an admin confirms a qualifying
payment, Pro is activated for the customer AND a one-time ₦1,000
commission is awarded to the referrer (if any).

## 1. New Tables

### admins
Allowlist of administrator user IDs (user_id PK referencing auth.users).

### payments
Records each confirmed Pro payment. One confirmed payment per user
(enforced by partial unique index). status: confirmed | refunded | reversed.

### wallet_transactions
Immutable audit log for every wallet_balance change.
type: commission | reversal | adjustment.

## 2. Modified Objects

### referrals
Added `commission_awarded` boolean (default false) to mark when the
one-time commission has been paid. Prevents duplicate commissions.

## 3. New Functions (all SECURITY DEFINER)

### is_admin() — returns true if auth.uid() is in admins table.
### confirm_pro_payment(user_id, amount, method, reference) — admin-only,
    atomic: confirms payment, activates Pro, awards ₦1,000 commission to
    referrer if eligible and not already awarded. Idempotent.
### reverse_payment(payment_id) — admin-only, atomic: marks payment
    refunded, reverses any commission awarded (debit + flag), guarded
    so wallet never goes below 0.
### grant_admin(email) — service-role-only bootstrapping helper.

## 4. Security (RLS)
- payments: users see own; admins see all; no client writes.
- wallet_transactions: users see own; admins see all; no client writes.
- admins: authenticated can read (only user_ids, no sensitive data).
*/

-- ============================================================
-- admins table (created first so is_admin() can reference it)
-- ============================================================
CREATE TABLE IF NOT EXISTS admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON admins TO authenticated;

-- ============================================================
-- is_admin() function — must exist before policies reference it
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- admins policies (after is_admin exists)
DROP POLICY IF EXISTS "admins_select_for_is_admin" ON admins;
CREATE POLICY "admins_select_for_is_admin"
  ON admins FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Add commission_awarded to referrals
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referrals'
      AND column_name = 'commission_awarded'
  ) THEN
    ALTER TABLE referrals ADD COLUMN commission_awarded boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_referrals_commission ON referrals(commission_awarded);

-- ============================================================
-- payments table
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  method text NOT NULL DEFAULT 'opay',
  status text NOT NULL DEFAULT 'confirmed',
  reference text,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_confirmed_per_user
  ON payments (user_id) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON payments TO authenticated;

DROP POLICY IF EXISTS "select_own_payments" ON payments;
CREATE POLICY "select_own_payments"
  ON payments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admin_select_all_payments" ON payments;
CREATE POLICY "admin_select_all_payments"
  ON payments FOR SELECT TO authenticated
  USING (is_admin());

-- ============================================================
-- wallet_transactions table
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  type text NOT NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  referral_id uuid REFERENCES referrals(id) ON DELETE SET NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_profile ON wallet_transactions(profile_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_payment ON wallet_transactions(payment_id);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON wallet_transactions TO authenticated;

DROP POLICY IF EXISTS "select_own_wallet_tx" ON wallet_transactions;
CREATE POLICY "select_own_wallet_tx"
  ON wallet_transactions FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "admin_select_all_wallet_tx" ON wallet_transactions;
CREATE POLICY "admin_select_all_wallet_tx"
  ON wallet_transactions FOR SELECT TO authenticated
  USING (is_admin());

-- ============================================================
-- confirm_pro_payment() function
-- ============================================================
CREATE OR REPLACE FUNCTION confirm_pro_payment(
  p_user_id uuid,
  p_amount integer,
  p_method text DEFAULT 'opay',
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid;
  caller_is_admin boolean;
  customer_profile profiles%ROWTYPE;
  ref_code text;
  referrer profiles%ROWTYPE;
  referral_row referrals%ROWTYPE;
  payment_id uuid;
  already_awarded boolean;
  result jsonb;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT is_admin() INTO caller_is_admin;
  IF NOT caller_is_admin THEN
    RAISE EXCEPTION 'Only administrators can confirm payments';
  END IF;

  SELECT * INTO customer_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Customer profile not found');
  END IF;

  INSERT INTO payments (user_id, amount, method, status, reference, confirmed_by, confirmed_at)
  VALUES (p_user_id, p_amount, p_method, 'confirmed', p_reference, caller_id, now())
  ON CONFLICT (user_id) WHERE status = 'confirmed'
  DO UPDATE SET
    amount = EXCLUDED.amount,
    method = EXCLUDED.method,
    reference = EXCLUDED.reference,
    confirmed_by = EXCLUDED.confirmed_by,
    confirmed_at = now()
  RETURNING id INTO payment_id;

  UPDATE profiles SET is_pro = true WHERE id = p_user_id;

  ref_code := customer_profile.referred_by;

  IF ref_code IS NULL OR ref_code = '' THEN
    result := jsonb_build_object('success', true, 'payment_id', payment_id, 'pro_activated', true, 'commission_awarded', false, 'reason', 'no_referrer');
    RETURN result;
  END IF;

  SELECT * INTO referrer FROM profiles
  WHERE referral_code = ref_code AND id <> p_user_id;

  IF NOT FOUND THEN
    result := jsonb_build_object('success', true, 'payment_id', payment_id, 'pro_activated', true, 'commission_awarded', false, 'reason', 'invalid_or_self_referral');
    RETURN result;
  END IF;

  SELECT * INTO referral_row FROM referrals
  WHERE referred_id = p_user_id AND referrer_id = referrer.id
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO referrals (referrer_id, referred_id, amount, status, commission_awarded)
    VALUES (referrer.id, p_user_id, 1000, 'paid', false)
    ON CONFLICT (referred_id) DO NOTHING
    RETURNING * INTO referral_row;

    IF referral_row.id IS NULL THEN
      SELECT * INTO referral_row FROM referrals WHERE referred_id = p_user_id LIMIT 1;
    END IF;
  END IF;

  SELECT commission_awarded INTO already_awarded FROM referrals
  WHERE referred_id = p_user_id AND referrer_id = referrer.id
  LIMIT 1;

  IF already_awarded THEN
    result := jsonb_build_object('success', true, 'payment_id', payment_id, 'pro_activated', true, 'commission_awarded', false, 'reason', 'already_awarded');
    RETURN result;
  END IF;

  INSERT INTO wallet_transactions (profile_id, amount, type, payment_id, referral_id, note, created_by)
  VALUES (referrer.id, 1000, 'commission', payment_id, referral_row.id, 'Referral commission for confirmed Pro payment', caller_id);

  UPDATE profiles SET wallet_balance = wallet_balance + 1000 WHERE id = referrer.id;

  UPDATE referrals SET commission_awarded = true, status = 'paid'
  WHERE referred_id = p_user_id AND referrer_id = referrer.id;

  result := jsonb_build_object(
    'success', true,
    'payment_id', payment_id,
    'pro_activated', true,
    'commission_awarded', true,
    'referrer_id', referrer.id,
    'commission_amount', 1000
  );
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION confirm_pro_payment(uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION confirm_pro_payment(uuid, integer, text, text) TO authenticated;

-- ============================================================
-- reverse_payment() function
-- ============================================================
CREATE OR REPLACE FUNCTION reverse_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid;
  caller_is_admin boolean;
  pay payments%ROWTYPE;
  customer_id uuid;
  referrer_id uuid;
  referral_row referrals%ROWTYPE;
  tx_id uuid;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT is_admin() INTO caller_is_admin;
  IF NOT caller_is_admin THEN
    RAISE EXCEPTION 'Only administrators can reverse payments';
  END IF;

  SELECT * INTO pay FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  IF pay.status = 'refunded' THEN
    RETURN jsonb_build_object('success', true, 'already_refunded', true);
  END IF;

  customer_id := pay.user_id;

  UPDATE payments SET status = 'refunded' WHERE id = p_payment_id;

  SELECT * INTO referral_row FROM referrals
  WHERE referred_id = customer_id AND commission_awarded = true
  LIMIT 1;

  IF FOUND THEN
    referrer_id := referral_row.referrer_id;

    INSERT INTO wallet_transactions (profile_id, amount, type, payment_id, referral_id, note, created_by)
    VALUES (referrer_id, -1000, 'reversal', p_payment_id, referral_row.id, 'Commission reversed due to refunded purchase', caller_id)
    RETURNING id INTO tx_id;

    UPDATE profiles
    SET wallet_balance = GREATEST(0, wallet_balance - 1000)
    WHERE id = referrer_id;

    UPDATE referrals SET commission_awarded = false, status = 'reversed'
    WHERE id = referral_row.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'status', 'refunded',
    'commission_reversed', FOUND
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION reverse_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reverse_payment(uuid) TO authenticated;

-- ============================================================
-- grant_admin() — service-role bootstrapping helper
-- ============================================================
CREATE OR REPLACE FUNCTION grant_admin(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u record;
BEGIN
  SELECT id INTO u FROM auth.users WHERE email = p_email LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  INSERT INTO admins (user_id) VALUES (u.id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('success', true, 'user_id', u.id);
END;
$$;

REVOKE EXECUTE ON FUNCTION grant_admin(text) FROM PUBLIC, anon, authenticated;

-- Service role grants
GRANT SELECT, INSERT, UPDATE, DELETE ON payments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON wallet_transactions TO service_role;
GRANT SELECT, INSERT, DELETE ON admins TO service_role;
GRANT EXECUTE ON FUNCTION confirm_pro_payment(uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION reverse_payment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION grant_admin(text) TO service_role;
