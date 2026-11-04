/*
# Add Paystack payment activation with 30-day Pro expiry

1. Modified Tables
- `profiles`
  - New column `pro_expires_at` (timestamptz, nullable). Set to 30 days after each verified Paystack payment. Existing Pro users keep NULL, meaning no expiry.
- `payments`
  - Unique index on `reference` (where present) so the same Paystack transaction can never be recorded twice.

2. New Functions
- `apply_paystack_payment(p_user_id, p_amount, p_reference)`: records a confirmed Paystack payment, switches the user to Pro, extends their Pro period by 30 days and credits the referrer's N1000 commission on the user's first paid referral. Idempotent for a given reference.
  - Only the server (service role) may call it. Customers cannot call it directly.

3. Security
- The function is SECURITY DEFINER with a fixed search path.
- EXECUTE revoked from PUBLIC, anon and authenticated; granted to service_role only.

4. Important Notes
- No existing rows are changed or removed.
- Commission logic mirrors the existing admin confirmation function so both paths behave identically.
- Migration is idempotent and safe to re-run.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pro_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS payments_reference_unique_idx
  ON payments (reference) WHERE reference IS NOT NULL;

CREATE OR REPLACE FUNCTION apply_paystack_payment(
  p_user_id uuid,
  p_amount integer,
  p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  customer_profile profiles%ROWTYPE;
  referrer profiles%ROWTYPE;
  referral_row referrals%ROWTYPE;
  payment_id uuid;
  commission_amount constant integer := 1000;
BEGIN
  IF EXISTS (SELECT 1 FROM payments WHERE reference = p_reference) THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true);
  END IF;

  SELECT * INTO customer_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Customer profile not found');
  END IF;

  INSERT INTO payments (user_id, amount, method, status, reference, confirmed_at)
  VALUES (p_user_id, p_amount, 'paystack', 'confirmed', p_reference, now())
  ON CONFLICT (user_id) WHERE status = 'confirmed'
  DO UPDATE SET
    amount = EXCLUDED.amount,
    method = EXCLUDED.method,
    reference = EXCLUDED.reference,
    confirmed_at = now()
  RETURNING id INTO payment_id;

  UPDATE profiles
  SET is_pro = true,
      pro_expires_at = GREATEST(COALESCE(pro_expires_at, now()), now()) + interval '30 days'
  WHERE id = p_user_id;

  IF customer_profile.referred_by IS NULL OR customer_profile.referred_by = '' THEN
    RETURN jsonb_build_object('success', true, 'payment_id', payment_id, 'pro_activated', true, 'commission_awarded', false);
  END IF;

  SELECT * INTO referrer FROM profiles
  WHERE referral_code = customer_profile.referred_by AND id <> p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'payment_id', payment_id, 'pro_activated', true, 'commission_awarded', false);
  END IF;

  INSERT INTO referrals (referrer_id, referred_id, amount, status, commission_awarded)
  VALUES (referrer.id, p_user_id, commission_amount, 'paid', false)
  ON CONFLICT (referred_id) DO NOTHING;

  SELECT * INTO referral_row FROM referrals
  WHERE referred_id = p_user_id AND referrer_id = referrer.id
  LIMIT 1;

  IF referral_row.id IS NULL OR referral_row.commission_awarded THEN
    RETURN jsonb_build_object('success', true, 'payment_id', payment_id, 'pro_activated', true, 'commission_awarded', false);
  END IF;

  INSERT INTO wallet_transactions (profile_id, amount, type, payment_id, referral_id, note)
  VALUES (referrer.id, commission_amount, 'commission', payment_id, referral_row.id, 'Referral commission for Paystack Pro payment');

  UPDATE profiles SET wallet_balance = wallet_balance + commission_amount WHERE id = referrer.id;

  UPDATE referrals SET commission_awarded = true, status = 'paid' WHERE id = referral_row.id;

  RETURN jsonb_build_object('success', true, 'payment_id', payment_id, 'pro_activated', true, 'commission_awarded', true, 'commission_amount', commission_amount);
END;
$function$;

REVOKE EXECUTE ON FUNCTION apply_paystack_payment(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_paystack_payment(uuid, integer, text) TO service_role;
