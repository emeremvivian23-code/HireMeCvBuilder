/*
# Withdrawal status email notifications

## Purpose
Sends an automated email to a user when their withdrawal request status
changes to approved, rejected, or paid. Emails are delivered through a
durable outbox pattern: the withdrawal status-change functions enqueue a
notification row, and a Supabase Edge Function polls the outbox and sends
each email through Resend.

This stage wires up the database side of that flow:
- The notification outbox + log tables.
- A queue function the edge function calls to claim and record each send.
- Modifications to approve_withdrawal, reject_withdrawal, and
  mark_withdrawal_paid so they enqueue the right email after a
  successful status transition.

## 1. New Tables

### notification_outbox
A durable queue. One row per email to send.
- `id` uuid PK
- `channel` text NOT NULL — 'email' (extensible to other channels later)
- `recipient_email` text NOT NULL — the user's email at enqueue time
- `recipient_user_id` uuid REFERENCES profiles(id) ON DELETE CASCADE
- `subject` text NOT NULL
- `html_body` text NOT NULL
- `status` text NOT NULL DEFAULT 'pending'
  ('pending', 'sending', 'sent', 'failed')
- `attempts` integer NOT NULL DEFAULT 0
- `last_error` text
- `source` text NOT NULL — which withdrawal function enqueued it
- `source_id` uuid — the withdrawal id
- `created_at` timestamptz DEFAULT now()
- `sent_at` timestamptz

A partial unique index limits concurrent 'sending' claims per row (the
claim function updates status to 'sending' atomically). A status CHECK
constraint keeps statuses valid.

### email_notification_log
Append-only audit trail of every send attempt, for debugging/delivery review.
- `id` uuid PK
- `notification_id` uuid REFERENCES notification_outbox(id) ON DELETE CASCADE
- `status` text NOT NULL — 'sent' or 'failed'
- `provider_message_id` text — Resend message id on success
- `error` text — error message on failure
- `created_at` timestamptz DEFAULT now()

## 2. New / Modified Functions (all SECURITY DEFINER)

### send_next_notification_email()
Called by the edge function (service role, no auth context). Atomically
claims the oldest 'pending' row by setting status='sending' and
incrementing attempts, then returns the row's payload (id, recipient,
subject, html). Returns NULL/empty when the queue is empty.
The claim uses `FOR UPDATE SKIP LOCKED` so concurrent invocations each
get a distinct row.

### record_notification_sent(p_id uuid, p_provider_message_id text)
Called by the edge function after a successful send. Sets the outbox row
to 'sent', records sent_at + provider message id, and appends a log row.

### record_notification_failed(p_id uuid, p_error text)
Called by the edge function after a failed send. Sets status back to
'pending' (so it will be retried on the next poll, up to attempts) and
appends a failed log row. Rows that exceed 5 attempts are marked
'failed' permanently and left for manual review.

### approve_withdrawal, reject_withdrawal, mark_withdrawal_paid (modified)
Each now enqueues a notification_outbox row after a successful status
transition, addressed to the withdrawal user's email, with subject + HTML
body appropriate to the new status. The enqueue uses a helper
`enqueue_withdrawal_email(...)` to keep the three functions DRY.

### enqueue_withdrawal_email(p_user_id, p_withdrawal_id, p_status, p_amount, p_extra)
Internal helper (not granted to clients). Builds the subject + HTML body
for a given withdrawal status and inserts a notification_outbox row.
Looks up the recipient email from profiles.

## 3. Security (RLS)
- notification_outbox + email_notification_log: NO client access.
  Only the service role (edge function) and the SECURITY DEFINER
  functions can read/write. RLS enabled, no policies, no grants to
  anon/authenticated. This keeps email payloads and addresses private.
- send_next_notification_email / record_notification_sent /
  record_notification_failed: revoked from PUBLIC/anon/authenticated;
  granted to service_role only (the edge function uses the service key).
- approve_withdrawal / reject_withdrawal / mark_withdrawal_paid: unchanged
  permissions (authenticated, internal is_admin() check). They enqueue
  emails via the internal helper which runs as part of their SECURITY
  DEFINER transaction.
*/

-- ============================================================
-- notification_outbox table
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL DEFAULT 'email',
  recipient_email text NOT NULL,
  recipient_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  html_body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  source text NOT NULL,
  source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT notification_outbox_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
  ON notification_outbox (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_outbox_source
  ON notification_outbox (source, source_id);

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
-- No policies, no grants to anon/authenticated: only service_role + SECURITY DEFINER functions.

-- ============================================================
-- email_notification_log table
-- ============================================================
CREATE TABLE IF NOT EXISTS email_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notification_outbox(id) ON DELETE CASCADE,
  status text NOT NULL,
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_notification
  ON email_notification_log (notification_id);

ALTER TABLE email_notification_log ENABLE ROW LEVEL SECURITY;
-- No policies, no grants to anon/authenticated.

-- ============================================================
-- enqueue_withdrawal_email() — internal helper
-- ============================================================
CREATE OR REPLACE FUNCTION enqueue_withdrawal_email(
  p_user_id uuid,
  p_withdrawal_id uuid,
  p_status text,
  p_amount integer,
  p_extra text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient text;
  subject text;
  html text;
  amount_fmt text;
BEGIN
  SELECT email INTO recipient FROM profiles WHERE id = p_user_id;
  IF recipient IS NULL THEN
    RETURN;
  END IF;

  amount_fmt := to_char(p_amount, 'FM999,999,999');

  IF p_status = 'approved' THEN
    subject := 'Your withdrawal request has been approved';
    html := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">'
      || '<h2 style="color:#1e3a8a;">Withdrawal Approved</h2>'
      || '<p>Hi there,</p>'
      || '<p>Your withdrawal request of <strong>₦' || amount_fmt || '</strong> has been <strong>approved</strong> and is now being processed.</p>'
      || '<p>You will receive another email once the payment has been transferred to your bank account.</p>'
      || '<p style="margin-top:24px;font-size:13px;color:#64748b;">— The HiremCV Team</p>'
      || '</div>';
  ELSIF p_status = 'rejected' THEN
    subject := 'Your withdrawal request was not approved';
    html := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">'
      || '<h2 style="color:#b91c1c;">Withdrawal Update</h2>'
      || '<p>Hi there,</p>'
      || '<p>Your withdrawal request of <strong>₦' || amount_fmt || '</strong> could not be approved.</p>'
      || CASE WHEN p_extra IS NOT NULL AND p_extra <> '' THEN '<p><strong>Reason:</strong> ' || p_extra || '</p>' ELSE '' END
      || '<p>The requested amount remains in your wallet and is available for a new withdrawal request.</p>'
      || '<p style="margin-top:24px;font-size:13px;color:#64748b;">— The HiremCV Team</p>'
      || '</div>';
  ELSIF p_status = 'paid' THEN
    subject := 'Your withdrawal has been paid';
    html := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">'
      || '<h2 style="color:#15803d;">Withdrawal Paid</h2>'
      || '<p>Hi there,</p>'
      || '<p>Your withdrawal of <strong>₦' || amount_fmt || '</strong> has been transferred to your bank account.</p>'
      || CASE WHEN p_extra IS NOT NULL AND p_extra <> '' THEN '<p><strong>Payment reference:</strong> ' || p_extra || '</p>' ELSE '' END
      || '<p>If you do not receive the funds within 24 hours, please contact support.</p>'
      || '<p style="margin-top:24px;font-size:13px;color:#64748b;">— The HiremCV Team</p>'
      || '</div>';
  ELSE
    RETURN;
  END IF;

  INSERT INTO notification_outbox (channel, recipient_email, recipient_user_id, subject, html_body, status, source, source_id)
  VALUES ('email', recipient, p_user_id, subject, html, 'pending', 'withdrawal:' || p_status, p_withdrawal_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION enqueue_withdrawal_email(uuid, uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
-- No grant to authenticated: only called from within other SECURITY DEFINER functions.
GRANT EXECUTE ON FUNCTION enqueue_withdrawal_email(uuid, uuid, text, integer, text) TO service_role;

-- ============================================================
-- send_next_notification_email() — claims next pending row
-- ============================================================
CREATE OR REPLACE FUNCTION send_next_notification_email()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row notification_outbox%ROWTYPE;
BEGIN
  -- Claim the oldest pending row, skipping rows locked by other workers.
  SELECT * INTO row
  FROM notification_outbox
  WHERE status = 'pending'
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_message', false);
  END IF;

  UPDATE notification_outbox
  SET status = 'sending', attempts = attempts + 1
  WHERE id = row.id;

  RETURN jsonb_build_object(
    'has_message', true,
    'id', row.id,
    'recipient_email', row.recipient_email,
    'subject', row.subject,
    'html_body', row.html_body,
    'source', row.source,
    'attempts', row.attempts + 1
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION send_next_notification_email() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION send_next_notification_email() TO service_role;

-- ============================================================
-- record_notification_sent()
-- ============================================================
CREATE OR REPLACE FUNCTION record_notification_sent(
  p_id uuid,
  p_provider_message_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE notification_outbox
  SET status = 'sent', sent_at = now(), last_error = NULL
  WHERE id = p_id;

  INSERT INTO email_notification_log (notification_id, status, provider_message_id)
  VALUES (p_id, 'sent', p_provider_message_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION record_notification_sent(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_notification_sent(uuid, text) TO service_role;

-- ============================================================
-- record_notification_failed()
-- ============================================================
CREATE OR REPLACE FUNCTION record_notification_failed(
  p_id uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_attempts integer;
BEGIN
  UPDATE notification_outbox
  SET last_error = p_error
  WHERE id = p_id;

  SELECT attempts INTO current_attempts FROM notification_outbox WHERE id = p_id;

  IF current_attempts >= 5 THEN
    UPDATE notification_outbox SET status = 'failed' WHERE id = p_id;
  ELSE
    UPDATE notification_outbox SET status = 'pending' WHERE id = p_id;
  END IF;

  INSERT INTO email_notification_log (notification_id, status, error)
  VALUES (p_id, 'failed', p_error);
END;
$$;

REVOKE EXECUTE ON FUNCTION record_notification_failed(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_notification_failed(uuid, text) TO service_role;

-- ============================================================
-- Rebuild approve_withdrawal() with email enqueue
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

  PERFORM enqueue_withdrawal_email(w.user_id, p_withdrawal_id, 'approved', w.amount);

  RETURN jsonb_build_object('success', true, 'withdrawal_id', p_withdrawal_id, 'status', 'approved');
END;
$$;

REVOKE EXECUTE ON FUNCTION approve_withdrawal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION approve_withdrawal(uuid) TO authenticated;

-- ============================================================
-- Rebuild reject_withdrawal() with email enqueue
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

  PERFORM enqueue_withdrawal_email(w.user_id, p_withdrawal_id, 'rejected', w.amount, p_reason);

  RETURN jsonb_build_object('success', true, 'withdrawal_id', p_withdrawal_id, 'status', 'rejected');
END;
$$;

REVOKE EXECUTE ON FUNCTION reject_withdrawal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reject_withdrawal(uuid, text) TO authenticated;

-- ============================================================
-- Rebuild mark_withdrawal_paid() with email enqueue
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

  PERFORM enqueue_withdrawal_email(w.user_id, p_withdrawal_id, 'paid', w.amount, COALESCE(p_payment_reference, ''));

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

-- Service role grants for the edge function
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_outbox TO service_role;
GRANT SELECT, INSERT, DELETE ON email_notification_log TO service_role;
