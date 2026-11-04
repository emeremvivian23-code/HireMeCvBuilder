/*
# Secure withdrawal request system

## Purpose
Turns the existing (empty) withdrawals table into a working, safe
withdrawal-request workflow with double-spend prevention, atomic status
transitions, and admin-only privileged operations.

## 1. Schema changes to existing withdrawals table

Adds:
- `rejection_reason` text — reason recorded when a request is rejected.
- `payment_reference` text — receipt/transaction id recorded when marked paid.

Adds CHECK constraints:
- `status` must be one of: pending, approved, rejected, paid.
- `amount` must be >= 3000 (enforced server-side as well, but the column
  constraint is a backstop).
- `account_number`, `bank_name`, `account_name` required at creation.

The existing partial unique index `idx_withdrawals_one_pending_per_user`
already prevents two pending requests. To prevent double-spend more
broadly, a new partial unique index prevents more than one
non-rejected (i.e. pending OR approved) withdrawal per user — so a user
cannot have a pending and an approved request at the same time.

## 2. New functions (all SECURITY DEFINER)

### request_withdrawal(p_amount, p_bank_name, p_account_name, p_account_number)
Called by an authenticated user. Atomically:
1. Validates amount >= 3000 and amount <= available balance
   (wallet_balance - sum of all non-rejected withdrawals).
2. Inserts a pending withdrawal row.
   The partial unique index guarantees no concurrent duplicate.
3. Does NOT deduct from wallet_balance — funds are "reserved" by the
   pending/approved rows. The available balance is always computed as
   wallet_balance minus pending+approved withdrawals.
Returns jsonb with the request id.

### approve_withdrawal(p_withdrawal_id)
Admin-only. Sets status pending -> approved.
Cannot approve a non-pending request. Idempotent guard.

### reject_withdrawal(p_withdrawal_id, p_reason)
Admin-only. Sets status pending|approved -> rejected and records reason.
Releasing reserved funds is automatic: rejected rows are excluded from
the available-balance computation. No wallet_balance mutation needed.

### mark_withdrawal_paid(p_withdrawal_id, p_payment_reference)
Admin-only. Sets status approved -> paid, records the payment reference,
and atomically debits the wallet_balance + logs a 'withdrawal' wallet
transaction. Cannot pay twice (status must be 'approved').

### get_withdrawal_history()
Returns the calling user's own withdrawal requests as jsonb, newest first.
RLS already restricts SELECT to own rows; this is a convenience accessor
used by the dashboard.

### get_available_balance()
Returns the calling user's available balance as an integer:
wallet_balance - sum(amount) where status IN ('pending','approved').
This is what the UI uses to enable/disable the withdrawal button and to
validate amounts, so it never trusts a browser-supplied figure.

## 3. Security
- request_withdrawal: any authenticated user (scopes to auth.uid()).
- approve/reject/mark_paid: admin-only (is_admin() check inside).
- RLS: users see only their own withdrawals; admins see all.
- No client can directly INSERT/UPDATE/DELETE withdrawals — only the
  SECURITY DEFINER functions can, and RLS blocks direct table writes
  (no INSERT/UPDATE/DELETE policy granted to authenticated).
*/

-- ============================================================
-- Add columns to withdrawals
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'withdrawals'
      AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE withdrawals ADD COLUMN rejection_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'withdrawals'
      AND column_name = 'payment_reference'
  ) THEN
    ALTER TABLE withdrawals ADD COLUMN payment_reference text;
  END IF;
END $$;

-- Status CHECK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'withdrawals_status_check'
  ) THEN
    ALTER TABLE withdrawals
      ADD CONSTRAINT withdrawals_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'paid'));
  END IF;
END $$;

-- Minimum amount CHECK constraint (>= 3000)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'withdrawals_amount_min'
  ) THEN
    ALTER TABLE withdrawals
      ADD CONSTRAINT withdrawals_amount_min CHECK (amount >= 3000);
  END IF;
END $$;

-- Require bank details
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'withdrawals_bank_details_required'
  ) THEN
    ALTER TABLE withdrawals
      ADD CONSTRAINT withdrawals_bank_details_required
      CHECK (
        bank_name IS NOT NULL AND bank_name <> ''
        AND account_name IS NOT NULL AND account_name <> ''
        AND account_number IS NOT NULL AND account_number <> ''
      );
  END IF;
END $$;

-- One active (non-rejected) withdrawal per user — prevents double spending
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_one_active_per_user
  ON withdrawals (user_id) WHERE status IN ('pending', 'approved');

-- ============================================================
-- get_available_balance()
-- ============================================================
CREATE OR REPLACE FUNCTION get_available_balance()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  uid uuid;
  bal integer;
  reserved integer;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT wallet_balance INTO bal FROM profiles WHERE id = uid;
  IF bal IS NULL THEN bal := 0; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO reserved
  FROM withdrawals
  WHERE user_id = uid AND status IN ('pending', 'approved');

  RETURN bal - reserved;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_available_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_available_balance() TO authenticated;

-- ============================================================
-- request_withdrawal()
-- ============================================================
CREATE OR REPLACE FUNCTION request_withdrawal(
  p_amount integer,
  p_bank_name text,
  p_account_name text,
  p_account_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  bal integer;
  avail integer;
  reserved integer;
  new_id uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount < 3000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum withdrawal is ₦3,000');
  END IF;

  IF p_bank_name IS NULL OR btrim(p_bank_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bank name is required');
  END IF;
  IF p_account_name IS NULL OR btrim(p_account_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account name is required');
  END IF;
  IF p_account_number IS NULL OR btrim(p_account_number) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account number is required');
  END IF;

  SELECT wallet_balance INTO bal FROM profiles WHERE id = uid;
  IF bal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO reserved
  FROM withdrawals
  WHERE user_id = uid AND status IN ('pending', 'approved');

  avail := bal - reserved;

  IF p_amount > avail THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Amount exceeds available balance',
      'available', avail
    );
  END IF;

  BEGIN
    INSERT INTO withdrawals (user_id, amount, status, bank_name, account_name, account_number)
    VALUES (uid, p_amount, 'pending', p_bank_name, p_account_name, p_account_number)
    RETURNING id INTO new_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'You already have an active withdrawal request. Please wait for it to be processed.'
      );
  END;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', new_id,
    'amount', p_amount,
    'available', avail - p_amount
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION request_withdrawal(integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION request_withdrawal(integer, text, text, text) TO authenticated;

-- ============================================================
-- approve_withdrawal()
-- ============================================================
CREATE OR REPLACE FUNCTION approve_withdrawal(p_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid;
  caller_is_admin boolean;
  w withdrawals%ROWTYPE;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT is_admin() INTO caller_is_admin;
  IF NOT caller_is_admin THEN
    RAISE EXCEPTION 'Only administrators can approve withdrawals';
  END IF;

  SELECT * INTO w FROM withdrawals WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF w.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only pending requests can be approved', 'current_status', w.status);
  END IF;

  UPDATE withdrawals
  SET status = 'approved', reviewed_at = now(), reviewed_by = caller_id
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object('success', true, 'withdrawal_id', p_withdrawal_id, 'status', 'approved');
END;
$$;

REVOKE EXECUTE ON FUNCTION approve_withdrawal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION approve_withdrawal(uuid) TO authenticated;

-- ============================================================
-- reject_withdrawal()
-- ============================================================
CREATE OR REPLACE FUNCTION reject_withdrawal(p_withdrawal_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid;
  caller_is_admin boolean;
  w withdrawals%ROWTYPE;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT is_admin() INTO caller_is_admin;
  IF NOT caller_is_admin THEN
    RAISE EXCEPTION 'Only administrators can reject withdrawals';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'A rejection reason is required');
  END IF;

  SELECT * INTO w FROM withdrawals WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF w.status NOT IN ('pending', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only pending or approved requests can be rejected', 'current_status', w.status);
  END IF;

  UPDATE withdrawals
  SET status = 'rejected',
      rejection_reason = p_reason,
      reviewed_at = now(),
      reviewed_by = caller_id
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object('success', true, 'withdrawal_id', p_withdrawal_id, 'status', 'rejected');
END;
$$;

REVOKE EXECUTE ON FUNCTION reject_withdrawal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reject_withdrawal(uuid, text) TO authenticated;

-- ============================================================
-- mark_withdrawal_paid()
-- ============================================================
CREATE OR REPLACE FUNCTION mark_withdrawal_paid(p_withdrawal_id uuid, p_payment_reference text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid;
  caller_is_admin boolean;
  w withdrawals%ROWTYPE;
  tx_id uuid;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT is_admin() INTO caller_is_admin;
  IF NOT caller_is_admin THEN
    RAISE EXCEPTION 'Only administrators can mark withdrawals as paid';
  END IF;

  SELECT * INTO w FROM withdrawals WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF w.status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only approved requests can be marked as paid', 'current_status', w.status);
  END IF;

  -- Atomically debit the wallet and log the transaction
  INSERT INTO wallet_transactions (profile_id, amount, type, note, created_by)
  VALUES (w.user_id, -1 * w.amount, 'withdrawal', 'Withdrawal paid out', caller_id)
  RETURNING id INTO tx_id;

  UPDATE profiles
  SET wallet_balance = GREATEST(0, wallet_balance - w.amount)
  WHERE id = w.user_id;

  UPDATE withdrawals
  SET status = 'paid',
      payment_reference = p_payment_reference,
      reviewed_at = now(),
      reviewed_by = caller_id
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'status', 'paid',
    'amount', w.amount,
    'transaction_id', tx_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION mark_withdrawal_paid(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_withdrawal_paid(uuid, text) TO authenticated;

-- ============================================================
-- get_withdrawal_history()
-- ============================================================
CREATE OR REPLACE FUNCTION get_withdrawal_history()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'amount', amount,
        'status', status,
        'bank_name', bank_name,
        'account_name', account_name,
        'account_number', account_number,
        'rejection_reason', rejection_reason,
        'payment_reference', payment_reference,
        'requested_at', requested_at,
        'reviewed_at', reviewed_at
      )
      ORDER BY requested_at DESC
    )
    FROM withdrawals WHERE user_id = uid),
    '[]'::jsonb
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_withdrawal_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_withdrawal_history() TO authenticated;

-- Service role grants
GRANT EXECUTE ON FUNCTION get_available_balance() TO service_role;
GRANT EXECUTE ON FUNCTION request_withdrawal(integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION approve_withdrawal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION reject_withdrawal(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION mark_withdrawal_paid(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION get_withdrawal_history() TO service_role;
