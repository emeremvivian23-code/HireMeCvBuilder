'use client';

import { FileText, Briefcase, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TabId } from '@/lib/types';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'cv', label: 'CV', icon: FileText },
  { id: 'resume', label: 'Resume', icon: Briefcase },
  { id: 'cover-letter', label: 'Cover Letter', icon: Mail },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-navy border-t border-white/10"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-2xl items-stretch">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 py-3 transition-colors',
                isActive ? 'text-orange' : 'text-white/60 hover:text-white'
              )}
              aria-current={isActive ? 'page' : undefined}
              aria-label={`${tab.label} tab`}
            >
              <div className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full transition-all',
                isActive ? 'bg-orange/20' : ''
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold tracking-wide">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
