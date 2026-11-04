/*
# Referral dashboard: withdrawals table + secure stats function

## Purpose
Supports the Pro-only referral dashboard:
- Stores withdrawal requests (pending until the secure workflow is built).
- Provides a single server-side function that computes a user's referral
  statistics from trusted database records, so the dashboard never relies
  on figures supplied by the browser.

## 1. New Table

### withdrawals
- `id` uuid PK
- `user_id` uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
- `amount` integer NOT NULL (naira, must be > 0)
- `status` text NOT NULL DEFAULT 'pending'
  ('pending', 'approved', 'rejected', 'paid')
- `bank_name` text
- `account_number` text
- `account_name` text
- `requested_at` timestamptz DEFAULT now()
- `reviewed_at` timestamptz
- `reviewed_by` uuid REFERENCES auth.users(id) ON DELETE SET NULL
- `note` text

A CHECK constraint prevents non-positive amounts.
Only one pending withdrawal per user at a time (partial unique index).

## 2. New Function (SECURITY DEFINER)

### get_referral_stats()
Returns jsonb for the calling user (auth.uid()):
- `referral_code` text
- `wallet_balance` integer
- `successful_referrals` integer  (referrals with commission_awarded = true)
- `total_earnings` integer        (sum of commission wallet_transactions)
- `pending_withdrawal` integer    (sum of withdrawals with status='pending')

Computed entirely server-side. RLS on the underlying tables ensures users
cannot read another user's rows; the function scopes every query to
auth.uid().

## 3. Security (RLS)

### withdrawals
- Users: SELECT only their own rows. No INSERT/UPDATE/DELETE from clients
  — withdrawal creation will be handled by a secure function in the next
  stage. For now the table exists so pending amounts can be tracked.
- Admins: SELECT all (via is_admin()).
*/

-- ============================================================
-- withdrawals table
-- ============================================================
CREATE TABLE IF NOT EXISTS withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  bank_name text,
  account_number text,
  account_name text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  CONSTRAINT withdrawals_amount_positive CHECK (amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_one_pending_per_user
  ON withdrawals (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON withdrawals TO authenticated;

DROP POLICY IF EXISTS "select_own_withdrawals" ON withdrawals;
CREATE POLICY "select_own_withdrawals"
  ON withdrawals FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admin_select_all_withdrawals" ON withdrawals;
CREATE POLICY "admin_select_all_withdrawals"
  ON withdrawals FOR SELECT TO authenticated
  USING (is_admin());

-- ============================================================
-- get_referral_stats() function
-- ============================================================
CREATE OR REPLACE FUNCTION get_referral_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  uid uuid;
  p profiles%ROWTYPE;
  successful_count integer;
  earnings_total integer;
  pending_total integer;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO p FROM profiles WHERE id = uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  SELECT COUNT(*) INTO successful_count
  FROM referrals
  WHERE referrer_id = uid AND commission_awarded = true;

  SELECT COALESCE(SUM(amount), 0) INTO earnings_total
  FROM wallet_transactions
  WHERE profile_id = uid AND type = 'commission';

  SELECT COALESCE(SUM(amount), 0) INTO pending_total
  FROM withdrawals
  WHERE user_id = uid AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'referral_code', p.referral_code,
    'wallet_balance', p.wallet_balance,
    'successful_referrals', successful_count,
    'total_earnings', earnings_total,
    'pending_withdrawal', pending_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_referral_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_referral_stats() TO authenticated;

-- Service role grants
GRANT SELECT, INSERT, UPDATE, DELETE ON withdrawals TO service_role;
GRANT EXECUTE ON FUNCTION get_referral_stats() TO service_role;
