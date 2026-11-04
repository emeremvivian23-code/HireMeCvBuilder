'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Lock, Loader2, MessageCircle, Sparkles, ShieldCheck, CreditCard, Building2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/lib/context';
import { useAuth } from '@/lib/auth-context';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { setProUnlocked } from '@/lib/storage';
import {
  startPaystackCheckout,
  openPaystackCheckout,
  verifyPaystackPayment,
} from '@/lib/paystack-client';

const WHATSAPP_LINK =
  'https://wa.me/2347019281041?text=Hi%20Vivian,%20I%20paid%20for%20HiremCV%20Pro%20-%20My%20email%20is:%20';

const SELAR_LINK = 'https://selar.com/4257h191aw';

const ACCOUNT_NUMBER = '7019281041';

const benefits = [
  'ATS-focused CV formatting',
  'Professional and modern design',
  'Tailored to different job titles',
  'Recruiter-friendly structure',
  'CV, resume, and cover letter generation',
  'Convenient mobile-friendly experience',
  'Easy-to-copy documents',
];

type PaystackStatus = 'idle' | 'working' | 'success' | 'error';

export function ProSection() {
  const { isPro, refreshPro } = useApp();
  const { user, refreshProfile } = useAuth();
  const { copied, copy } = useCopyToClipboard();
  const [unlockCode, setUnlockCode] = useState('');
  const [unlockStatus, setUnlockStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [unlockMessage, setUnlockMessage] = useState('');
  const [paystackStatus, setPaystackStatus] = useState<PaystackStatus>('idle');
  const [paystackMessage, setPaystackMessage] = useState('');
  const [pendingReference, setPendingReference] = useState<string | null>(null);

  const finishPayment = async (reference: string) => {
    setPaystackStatus('working');
    setPaystackMessage('');
    try {
      await verifyPaystackPayment(reference);
      setPendingReference(null);
      setProUnlocked(true);
      refreshPro();
      await refreshProfile();
      setPaystackStatus('success');
    } catch (err) {
      setPendingReference(reference);
      setPaystackStatus('error');
      setPaystackMessage(err instanceof Error ? err.message : 'We could not confirm your payment. Please try again.');
    }
  };

  const handlePaystack = async () => {
    if (pendingReference) {
      await finishPayment(pendingReference);
      return;
    }
    setPaystackStatus('working');
    setPaystackMessage('');
    try {
      const { accessCode } = await startPaystackCheckout();
      const reference = await openPaystackCheckout(accessCode);
      if (!reference) {
        setPaystackStatus('idle');
        return;
      }
      await finishPayment(reference);
    } catch (err) {
      setPaystackStatus('error');
      setPaystackMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  const handleUnlock = () => {
    const code = unlockCode.trim();
    if (!code) {
      setUnlockStatus('error');
      setUnlockMessage('Please enter the unlock code sent to you after payment verification.');
      return;
    }
    setUnlockStatus('error');
    setUnlockMessage(
      'Unlock codes are verified manually after payment. Please send your receipt on WhatsApp and your code will be provided once payment is confirmed.'
    );
  };

  if (isPro) {
    return (
      <div className="rounded-2xl border-2 border-green-500 bg-green-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-500">
          <ShieldCheck className="h-7 w-7 text-white" />
        </div>
        <h3 className="text-lg font-bold text-green-700">PRO UNLOCKED &#10003;</h3>
        <p className="mt-2 text-sm text-green-600">
          Your verified Pro access is now active. Enjoy unlimited generations across all three tools.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pro Upgrade Header Card */}
      <div className="overflow-hidden rounded-2xl border-2 border-orange bg-white shadow-lg">
        <div className="gradient-navy px-6 py-5 text-center text-white">
          <div className="mb-1 flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 text-orange" />
            <span className="text-xs font-bold tracking-widest text-orange">HIREME CV PRO</span>
          </div>
          <h3 className="text-2xl font-extrabold">ALL FOR ONLY &#8358;3,500</h3>
          <p className="mt-1 text-sm text-white/80">CV + RESUME + COVER LETTER</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-center text-sm font-semibold text-navy">
            QUALITY THAT SPEAKS. RESULTS THAT COUNT.
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Professional career documents tailored to your target job.
          </p>
          <ul className="mt-4 space-y-2">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm text-foreground">
                <Check className="h-4 w-4 shrink-0 text-green-600" />
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-lg bg-light-gray px-3 py-2 text-center text-xs font-bold text-navy">
            FAST DELIVERY — PROFESSIONAL — IMPACTFUL.
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Pro access includes unlimited CV, resume, and cover letter generations. Access lasts for 30 days after activation. This does not guarantee interviews or employment.
          </p>
        </div>
      </div>

      {/* Instant Paystack payment */}
      <div className="rounded-2xl border border-navy/20 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-orange" />
          <h4 className="text-sm font-bold uppercase tracking-wide text-navy">Pay Instantly with Paystack</h4>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Pay by card, bank transfer or USSD. Pro activates on your account as soon as payment is confirmed.
        </p>
        {user ? (
          <Button
            onClick={handlePaystack}
            disabled={paystackStatus === 'working'}
            className="mt-4 w-full bg-navy text-white hover:bg-navy/90"
          >
            {paystackStatus === 'working' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : pendingReference ? (
              'Confirm My Payment'
            ) : (
              'Pay \u20a63,500 with Paystack'
            )}
          </Button>
        ) : (
          <Link href="/signin" className="mt-4 block">
            <Button className="w-full bg-navy text-white hover:bg-navy/90">Sign in to pay with Paystack</Button>
          </Link>
        )}
        {paystackStatus === 'error' && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-center text-sm font-medium text-red-600">
            {paystackMessage}
          </div>
        )}
      </div>

      {/* Two Payment Cards — side by side on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* CARD 1: Pay via OPay / Bank Transfer */}
        <div className="flex flex-col rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-lg text-white">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-green-400" />
            <h4 className="text-sm font-bold uppercase tracking-wide">Pay via OPay / Bank Transfer</h4>
          </div>
          <div className="space-y-2 rounded-xl bg-slate-800 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Amount:</span>
              <span className="font-bold text-white">&#8358;3,500</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Account Number:</span>
              <span className="font-bold text-white">{ACCOUNT_NUMBER}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Account Name:</span>
              <span className="font-semibold text-white">Vivian Chinaemerem</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Bank:</span>
              <span className="font-semibold text-white">OPay</span>
            </div>
          </div>
          <Button
            onClick={() => copy(ACCOUNT_NUMBER)}
            variant="outline"
            className="mt-3 w-full border-slate-600 bg-slate-800 text-white hover:bg-slate-700 hover:text-white"
          >
            <Copy className="mr-2 h-4 w-4" />
            {copied ? 'Copied!' : 'Copy Account Number'}
          </Button>
          <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="mt-3 block">
            <Button className="w-full bg-green-600 text-white hover:bg-green-700">
              <MessageCircle className="mr-2 h-4 w-4" />
              SEND RECEIPT ON WHATSAPP
            </Button>
          </a>
          <p className="mt-2 text-center text-xs text-slate-400">
            After payment, send your receipt via WhatsApp for verification.
          </p>
        </div>

        {/* CARD 2: Pay with Card via Selar */}
        <div className="flex flex-col rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-lg text-white">
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-400" />
            <h4 className="text-sm font-bold uppercase tracking-wide">Pay with Card (For International Clients)</h4>
          </div>
          <p className="text-sm text-slate-300">
            Outside Nigeria? Pay securely through Selar using the payment methods available to you.
          </p>
          <div className="mt-4 flex-1" />
          <a href={SELAR_LINK} target="_blank" rel="noopener noreferrer" className="block">
            <Button className="w-full bg-blue-600 text-white hover:bg-blue-700">
              <CreditCard className="mr-2 h-4 w-4" />
              Pay with Card via Selar
            </Button>
          </a>
          <p className="mt-3 rounded-lg bg-slate-800 p-3 text-xs leading-relaxed text-slate-300">
            After Selar payment, send your receipt to WhatsApp for your Pro unlock code.
          </p>
          <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="mt-2 block">
            <Button className="w-full bg-green-600 text-white hover:bg-green-700">
              <MessageCircle className="mr-2 h-4 w-4" />
              SEND RECEIPT ON WHATSAPP
            </Button>
          </a>
        </div>
      </div>

      {/* Unlock Section */}
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-navy" />
          <h4 className="text-sm font-bold uppercase tracking-wide text-navy">Already Paid? Unlock Pro</h4>
        </div>
        <div className="mt-3 space-y-2">
          <Input
            type="text"
            placeholder="Enter unlock code"
            value={unlockCode}
            onChange={(e) => setUnlockCode(e.target.value)}
            aria-label="Enter unlock code"
            className="text-sm"
          />
          <Button onClick={handleUnlock} className="w-full bg-navy text-white hover:bg-navy/90">
            Unlock Pro
          </Button>
        </div>
        {unlockStatus === 'success' && (
          <div className="mt-3 rounded-lg bg-green-50 p-3 text-center text-sm font-medium text-green-700">
            {unlockMessage}
          </div>
        )}
        {unlockStatus === 'error' && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-center text-sm font-medium text-red-600">
            {unlockMessage}
          </div>
        )}
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Opening WhatsApp does not verify payment. Your access is activated only after your receipt is confirmed.
        </p>
      </div>
    </div>
  );
}
