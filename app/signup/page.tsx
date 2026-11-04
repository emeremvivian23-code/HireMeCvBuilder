'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, User, Mail, Lock, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth-context';
import { captureReferralCode, getStoredReferralCode } from '@/lib/referral';

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signUp, user, loading } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    const code = captureReferralCode();
    if (code) setReferralCode(code);
  }, [searchParams]);

  useEffect(() => {
    if (!loading && user) {
      router.push('/');
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    const { error: signUpError } = await signUp(email.trim(), password, fullName.trim());

    if (signUpError) {
      setError(signUpError);
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setSubmitting(false);
    setTimeout(() => router.push('/'), 1500);
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-light-gray px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-500">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-navy">Account Created!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Welcome to HiremCV. Redirecting you to the app...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-light-gray px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-8 shadow-lg">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy">
          <ArrowLeft className="h-4 w-4" /> Back to HiremCV
        </Link>

        <div className="mb-6 text-center">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-navy/5 px-4 py-1.5 text-xs font-semibold tracking-widest text-navy">
            HIREME CV
          </div>
          <h1 className="text-2xl font-extrabold text-navy">Create Your Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Start building professional CVs today.</p>
        </div>

        {referralCode && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-center text-sm text-green-700">
            You were referred by <span className="font-bold">{referralCode}</span> — welcome!
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                className="pl-9"
                autoComplete="name"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="pl-9"
                autoComplete="email"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="pl-9"
                autoComplete="new-password"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-center text-sm font-medium text-red-600">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-navy text-white hover:bg-navy/90"
          >
            {submitting ? 'Creating account...' : 'Sign Up'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/signin" className="font-semibold text-navy hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-light-gray"><p className="text-muted-foreground">Loading...</p></div>}>
      <SignUpForm />
    </Suspense>
  );
}
