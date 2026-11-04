import { supabase } from './supabase-client';

const PAYSTACK_SCRIPT_URL = 'https://js.paystack.co/v2/inline.js';

type PaystackPopInstance = {
  resumeTransaction: (
    accessCode: string,
    callbacks: { onSuccess: (transaction: { reference: string }) => void; onCancel: () => void }
  ) => void;
};
type PaystackPopConstructor = new () => PaystackPopInstance;

let scriptPromise: Promise<void> | null = null;

function loadPaystackScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Payments are only available in the browser.'));
  if ((window as unknown as { PaystackPop?: PaystackPopConstructor }).PaystackPop) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PAYSTACK_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Could not load the payment window. Check your connection and try again.'));
      };
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

async function callPaystackFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('paystack', { body });
  if (error) {
    let message = 'Payment request failed. Please try again.';
    const response = (error as { context?: Response }).context;
    try {
      const payload = await response?.json();
      if (typeof payload?.error === 'string') message = payload.error;
    } catch {
      // Response body was not JSON; keep the generic message.
    }
    throw new Error(message);
  }
  if (!data || typeof data !== 'object') throw new Error('Unexpected response from the payment service.');
  return data as T;
}

export async function startPaystackCheckout(): Promise<{ accessCode: string; reference: string }> {
  const data = await callPaystackFunction<{ access_code?: unknown; reference?: unknown }>({ action: 'initialize' });
  if (typeof data.access_code !== 'string' || typeof data.reference !== 'string') {
    throw new Error('Unexpected response from the payment service.');
  }
  return { accessCode: data.access_code, reference: data.reference };
}

export async function openPaystackCheckout(accessCode: string): Promise<string | null> {
  await loadPaystackScript();
  const PaystackPop = (window as unknown as { PaystackPop: PaystackPopConstructor }).PaystackPop;
  return new Promise((resolve) => {
    const popup = new PaystackPop();
    popup.resumeTransaction(accessCode, {
      onSuccess: (transaction) => resolve(transaction.reference),
      onCancel: () => resolve(null),
    });
  });
}

export async function verifyPaystackPayment(reference: string): Promise<void> {
  const data = await callPaystackFunction<{ success?: unknown }>({ action: 'verify', reference });
  if (data.success !== true) throw new Error('We could not confirm your payment yet. Please contact support.');
}
