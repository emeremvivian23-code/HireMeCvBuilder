const REFERRAL_STORAGE_KEY = 'hiremcv-referral-code';

/**
 * The production domain for referral links.
 * Configurable via NEXT_PUBLIC_APP_URL env var.
 */
export const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_URL || 'https://hiremcv.com';

/**
 * Capture a referral code from the URL query param `ref`.
 * Stores it in localStorage so it survives navigation and page refreshes.
 * Only stores if the param is present — does not overwrite an existing
 * stored code unless a new one is explicitly provided in the URL.
 */
export function captureReferralCode(): string | null {
  if (typeof window === 'undefined') return null;

  const url = new URL(window.location.href);
  const refFromUrl = url.searchParams.get('ref');

  if (refFromUrl) {
    const code = refFromUrl.trim().toUpperCase();
    localStorage.setItem(REFERRAL_STORAGE_KEY, code);
    return code;
  }

  return getStoredReferralCode();
}

/**
 * Get the referral code stored in localStorage, if any.
 */
export function getStoredReferralCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Clear the stored referral code (e.g. after successful signup).
 */
export function clearStoredReferralCode(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(REFERRAL_STORAGE_KEY);
}

/**
 * Build a referral link for a given code.
 * Format: https://hiremcv.com/signup?ref=CODE
 */
export function buildReferralLink(code: string): string {
  return `${APP_DOMAIN}/signup?ref=${encodeURIComponent(code)}`;
}
