'use client';

import Link from 'next/link';
import { LogIn, LogOut, UserCircle, ShieldCheck, Activity } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export function Header() {
  const { user, profile, isAdmin, loading, signOut } = useAuth();

  return (
    <header className="gradient-navy text-white">
      <div className="mx-auto max-w-2xl px-5 pt-10 pb-8 text-center">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-widest text-orange">
          HIREME CV
        </div>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          STAND OUT. GET NOTICED. <span className="text-orange">GET HIRED.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
          Create professional CVs, resumes, and cover letters tailored to your target job.
        </p>
        <div className="mt-5 rounded-xl bg-white/10 px-4 py-3">
          <p className="text-xs font-medium leading-relaxed text-white/90 sm:text-sm">
            <span className="font-bold text-orange">FOR EVERY JOB</span> — Tech, Corporate, NGO, Healthcare, Graduate, Remote, Trade &amp; More.
          </p>
        </div>

        {!loading && (
          <div className="mt-5 flex items-center justify-center gap-3">
            {user ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-white/90">
                  <UserCircle className="h-4 w-4" />
                  {profile?.full_name || user.email}
                </span>
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  <Activity className="h-3.5 w-3.5" /> My Activities
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-1 rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange/90"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> Admin
                  </Link>
                )}
                <button
                  onClick={() => signOut()}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/signin"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                >
                  <LogIn className="h-4 w-4" /> Sign In
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange/90"
                >
                  Sign Up Free
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
