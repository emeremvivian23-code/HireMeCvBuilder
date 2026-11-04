'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  Briefcase,
  Mail,
  Download,
  Loader2,
  Activity as ActivityIcon,
  Crown,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { fetchActivities, clearActivities, ActivityRecord } from '@/lib/activities';
import { isProUnlocked } from '@/lib/storage';

const TYPE_META: Record<
  ActivityRecord['type'],
  { label: string; icon: React.ReactNode; color: string }
> = {
  cv: { label: 'CV', icon: <FileText className="h-5 w-5 text-blue-600" />, color: 'bg-blue-50' },
  resume: { label: 'Resume', icon: <Briefcase className="h-5 w-5 text-orange" />, color: 'bg-orange-50' },
  'cover-letter': {
    label: 'Cover Letter',
    icon: <Mail className="h-5 w-5 text-green-600" />,
    color: 'bg-green-50',
  },
};

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pro, setPro] = useState(false);

  const loadActivities = useCallback(async () => {
    setActivitiesLoading(true);
    setActionError(null);
    try {
      setActivities(await fetchActivities());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not load your activities.');
    } finally {
      setActivitiesLoading(false);
    }
  }, []);

  useEffect(() => {
    setHydrated(true);
    if (!loading) {
      if (!user) {
        router.push('/signin');
        return;
      }
      setPro(isProUnlocked());
      void loadActivities();
    }
  }, [loading, user, router, loadActivities]);

  const handleClear = async () => {
    if (!confirm('Clear your activity history? This will not delete your saved documents.')) return;
    setActionError(null);
    try {
      await clearActivities();
      setActivities([]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not clear your history.');
    }
  };

  if (loading || !hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-light-gray">
        <Loader2 className="h-6 w-6 animate-spin text-navy" />
      </div>
    );
  }

  if (!user) return null;

  const cvCount = activities.filter((a) => a.type === 'cv').length;
  const resumeCount = activities.filter((a) => a.type === 'resume').length;
  const clCount = activities.filter((a) => a.type === 'cover-letter').length;
  const totalDownloads = activities.reduce((sum, a) => sum + a.downloads, 0);

  return (
    <div className="min-h-screen bg-light-gray">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy">
          <ArrowLeft className="h-4 w-4" /> Back to HireMe CV
        </Link>

        {/* Profile header */}
        <div className="mb-6 rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy text-white">
              <ActivityIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-extrabold text-navy">
                {profile?.full_name || user.email}
              </h1>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                pro ? 'bg-orange/10 text-orange' : 'bg-muted text-muted-foreground'
              }`}
            >
              <Crown className="h-3.5 w-3.5" />
              {pro ? 'Pro' : 'Free'}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-4 gap-3">
          <StatTile value={cvCount} label="CVs" icon={<FileText className="h-5 w-5 text-blue-600" />} tone="bg-blue-50" />
          <StatTile value={resumeCount} label="Resumes" icon={<Briefcase className="h-5 w-5 text-orange" />} tone="bg-orange-50" />
          <StatTile value={clCount} label="Cover Letters" icon={<Mail className="h-5 w-5 text-green-600" />} tone="bg-green-50" />
          <StatTile value={totalDownloads} label="Downloads" icon={<Download className="h-5 w-5 text-navy" />} tone="bg-navy/5" />
        </div>

        {/* Activities list */}
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-navy">My Activities</h2>
            {activities.length > 0 && (
              <Button onClick={handleClear} variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50">
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear History
              </Button>
            )}
          </div>

          {actionError && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <span>{actionError}</span>
              <Button onClick={loadActivities} variant="outline" size="sm">Try again</Button>
            </div>
          )}

          {activitiesLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-navy" />
            </div>
          ) : activities.length === 0 ? (
            <div className="py-10 text-center">
              <ActivityIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-navy">No documents yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Generate your first CV, resume, or cover letter and it will appear here.
              </p>
              <Link href="/" className="mt-4 inline-block">
                <Button className="bg-orange text-white hover:bg-orange/90" size="sm">
                  Start Creating
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {activities.map((a) => {
                const meta = TYPE_META[a.type];
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${meta.color}`}>
                      {meta.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy">
                        {meta.label} — {a.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="flex items-center justify-end gap-1 text-xs font-semibold text-navy">
                        <Download className="h-3 w-3" />
                        {a.downloads}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pro ? 'Pro' : 'Free'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({
  value,
  label,
  icon,
  tone,
}: {
  value: number;
  label: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className={`rounded-xl ${tone} p-3 text-center`}>
      <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center">{icon}</div>
      <p className="text-lg font-extrabold text-navy">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
