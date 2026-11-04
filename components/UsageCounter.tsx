'use client';

import { Loader2 } from 'lucide-react';
import { useApp } from '@/lib/context';
import { getRemainingGenerations } from '@/lib/storage';
import { TabId } from '@/lib/types';

export function UsageCounter({ tab }: { tab: TabId }) {
  const { isPro, hydrated } = useApp();

  if (!hydrated) return null;
  if (isPro) {
    return (
      <div className="rounded-lg bg-navy px-4 py-2 text-center text-sm font-semibold text-white">
        PRO ACCESS — Unlimited generations
      </div>
    );
  }

  const remaining = typeof window !== 'undefined' ? getRemainingGenerations(tab) : 1;

  return (
    <div className="rounded-lg bg-light-gray px-4 py-2 text-center text-sm font-semibold text-navy">
      {remaining > 0 ? (
        <>
          {remaining} free {tab === 'cv' ? 'CV' : tab === 'resume' ? 'resume' : 'cover letter'} generation{remaining !== 1 ? 's' : ''} remaining today
        </>
      ) : (
        <>
          Free {tab === 'cv' ? 'CV' : tab === 'resume' ? 'resume' : 'cover letter'} generations used up today — Upgrade to Pro below
        </>
      )}
    </div>
  );
}
