'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth-context';

export default function SignInPage() {
  const router = useRouter();
  const { signIn, user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.push('/');
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);

    if (signInError) {
      setError(signInError);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    router.push('/');
  };

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
          <h1 className="text-2xl font-extrabold text-navy">Welcome Back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to access your tools.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="Your password"
                className="pl-9"
                autoComplete="current-password"
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
            {submitting ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-semibold text-navy hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
