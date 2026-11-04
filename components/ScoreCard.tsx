'use client';

import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScoreCardProps {
  title: string;
  score: number;
  suggestions: string[];
  note?: string;
}

export function ScoreCard({ title, score, suggestions, note }: ScoreCardProps) {
  const scoreColor =
    score >= 75 ? 'text-green-600' : score >= 50 ? 'text-orange' : 'text-red-500';
  const ringColor =
    score >= 75 ? 'border-green-500' : score >= 50 ? 'border-orange' : 'border-red-500';
  const bgColor =
    score >= 75 ? 'bg-green-50' : score >= 50 ? 'bg-orange/5' : 'bg-red-50';

  return (
    <div className={cn('rounded-2xl border-2 p-5', ringColor, bgColor)}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold uppercase tracking-wide text-navy">{title}</h4>
        <div className={cn('text-3xl font-extrabold', scoreColor)}>
          {score}
          <span className="text-lg text-muted-foreground">/100</span>
        </div>
      </div>
      {note && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-white/60 p-2.5">
          <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>
        </div>
      )}
      <div className="mt-3 space-y-2">
        {suggestions.map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            {score >= 75 ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-orange" />
            )}
            <span className="text-foreground/80">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
