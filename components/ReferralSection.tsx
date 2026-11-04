'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Copy,
  Gift,
  Users,
  Wallet,
  Link2,
  TrendingUp,
  Clock,
  CheckCircle2,
  Lock,
  AlertCircle,
  Loader2,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth-context';
import { useApp } from '@/lib/context';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { buildReferralLink } from '@/lib/referral';
import { supabase } from '@/lib/supabase-client';

interface ReferralStats {
  referral_code: string | null;
  wallet_balance: number;
  successful_referrals: number;
  total_earnings: number;
  pending_withdrawal: number;
}

interface WithdrawalRow {
  id: string;
  amount: number;
  status: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  rejection_reason: string | null;
  payment_reference: string | null;
  requested_at: string;
  reviewed_at: string | null;
}

const ZERO_STATS: ReferralStats = {
  referral_code: null,
  wallet_balance: 0,
  successful_referrals: 0,
  total_earnings: 0,
  pending_withdrawal: 0,
};

const WITHDRAWAL_THRESHOLD = 3000;

export function ReferralSection() {
  const { profile, user, loading } = useAuth();
  const { isPro } = useApp();
  const { copied, copy } = useCopyToClipboard();
  const [stats, setStats] = useState<ReferralStats>(ZERO_STATS);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [copyError, setCopyError] = useState(false);

  // Withdrawal form state
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [form, setForm] = useState({ bankName: '', accountName: '', accountNumber: '', amount: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Withdrawal history
  const [history, setHistory] = useState<WithdrawalRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!user) {
      setStats(ZERO_STATS);
      setAvailableBalance(0);
      setStatsLoading(false);
      return;
    }
    setStatsLoading(true);
    const [statsRes, balRes] = await Promise.all([
      supabase.rpc('get_referral_stats'),
      supabase.rpc('get_available_balance'),
    ]);

    if (statsRes.data) {
      const result = statsRes.data as Partial<ReferralStats> & { success?: boolean };
      if (result.success === false) {
        setStats(ZERO_STATS);
      } else {
        setStats({
          referral_code: result.referral_code ?? null,
          wallet_balance: result.wallet_balance ?? 0,
          successful_referrals: result.successful_referrals ?? 0,
          total_earnings: result.total_earnings ?? 0,
          pending_withdrawal: result.pending_withdrawal ?? 0,
        });
      }
    }
    if (balRes.data !== null && balRes.data !== undefined) {
      setAvailableBalance(balRes.data as number);
    }
    setStatsLoading(false);
  }, [user]);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc('get_withdrawal_history');
    if (error) {
      setHistory([]);
      return;
    }
    setHistory((data as WithdrawalRow[]) || []);
  }, [user]);

  useEffect(() => {
    fetchStats();
    fetchHistory();
  }, [fetchStats, fetchHistory]);

  const handleCopy = async () => {
    setCopyError(false);
    const link = buildReferralLink(stats.referral_code || profile?.referral_code || '');
    const ok = await copy(link);
    if (!ok) setCopyError(true);
  };

  const openWithdrawForm = () => {
    setForm({ bankName: '', accountName: '', accountNumber: '', amount: String(WITHDRAWAL_THRESHOLD) });
    setFormError(null);
    setWithdrawOpen(true);
  };

  const handleWithdrawSubmit = async () => {
    setFormError(null);

    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount)) {
      setFormError('Enter a valid amount in naira.');
      return;
    }
    if (amount < WITHDRAWAL_THRESHOLD) {
      setFormError(`Minimum withdrawal is ₦${WITHDRAWAL_THRESHOLD.toLocaleString()}.`);
      return;
    }
    if (amount > availableBalance) {
      setFormError(`Amount cannot exceed your available balance of ₦${availableBalance.toLocaleString()}.`);
      return;
    }
    if (!form.bankName.trim() || !form.accountName.trim() || !form.accountNumber.trim()) {
      setFormError('All bank details are required.');
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.rpc('request_withdrawal', {
      p_amount: Math.round(amount),
      p_bank_name: form.bankName.trim(),
      p_account_name: form.accountName.trim(),
      p_account_number: form.accountNumber.trim(),
    });

    setSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    const result = data as { success: boolean; error?: string; available?: number };
    if (!result.success) {
      setFormError(result.error || 'Withdrawal request failed.');
      return;
    }

    setWithdrawOpen(false);
    fetchStats();
    fetchHistory();
  };

  if (loading) return null;

  // Only authenticated Pro users can see the dashboard
  if (!profile || !isPro) return null;

  const code = stats.referral_code || profile.referral_code;
  const referralLink = code ? buildReferralLink(code) : '';
  const canWithdraw = availableBalance >= WITHDRAWAL_THRESHOLD;
  const hasActiveRequest = history.some((h) => h.status === 'pending' || h.status === 'approved');

  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Gift className="h-5 w-5 text-orange" />
        <h3 className="text-sm font-bold uppercase tracking-wide text-navy">Refer & Earn</h3>
      </div>

      <p className="text-sm text-muted-foreground">
        Share your referral link with friends. You earn &#8358;1,000 for every friend who signs up and gets Pro.
      </p>

      {!code ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-light-gray p-4 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Your referral code is being generated. Please refresh the page in a moment.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Referral Link */}
          <div className="rounded-xl bg-slate-900 p-4 text-white">
            <div className="flex items-center gap-2 text-xs font-semibold text-orange">
              <Link2 className="h-3.5 w-3.5" /> YOUR REFERRAL LINK
            </div>
            <p className="mt-1.5 break-all text-sm font-medium text-white">{referralLink}</p>
            <Button
              onClick={handleCopy}
              className="mt-3 w-full bg-orange text-white hover:bg-orange/90"
              size="sm"
            >
              <Copy className="mr-2 h-3.5 w-3.5" />
              {copied ? 'Link Copied!' : 'Copy Referral Link'}
            </Button>
            {copyError && (
              <p className="mt-2 flex items-center gap-1 text-xs text-red-300">
                <AlertCircle className="h-3 w-3" />
                Couldn&apos;t copy automatically. Long-press the link above to copy it.
              </p>
            )}
            {copied && (
              <p className="mt-2 flex items-center gap-1 text-xs text-green-300">
                <CheckCircle2 className="h-3 w-3" />
                Link copied — paste it anywhere to share.
              </p>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Users className="h-5 w-5 text-blue-600" />}
              value={statsLoading ? '—' : String(stats.successful_referrals)}
              label="Successful Referrals"
              tone="blue"
            />
            <StatCard
              icon={<Wallet className="h-5 w-5 text-green-600" />}
              value={statsLoading ? '—' : `₦${availableBalance.toLocaleString()}`}
              label="Available Balance"
              tone="green"
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5 text-orange" />}
              value={statsLoading ? '—' : `₦${stats.total_earnings.toLocaleString()}`}
              label="Total Earnings"
              tone="orange"
            />
            <StatCard
              icon={<Clock className="h-5 w-5 text-amber-600" />}
              value={statsLoading ? '—' : `₦${stats.pending_withdrawal.toLocaleString()}`}
              label="Pending Withdrawal"
              tone="amber"
            />
          </div>

          {/* Withdrawal */}
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy">Withdraw Earnings</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Minimum withdrawal is &#8358;3,000. Requests are processed manually.
                </p>
              </div>
              <Button
                onClick={openWithdrawForm}
                disabled={!canWithdraw || statsLoading || hasActiveRequest}
                className="shrink-0 bg-navy text-white hover:bg-navy/90"
                size="sm"
              >
                {hasActiveRequest ? 'Request Pending' : canWithdraw ? 'Request Withdrawal' : 'Not Available'}
              </Button>
            </div>
            {!canWithdraw && !statsLoading && !hasActiveRequest && (
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                Available once your balance reaches &#8358;3,000.
              </p>
            )}
            {hasActiveRequest && (
              <p className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                <Clock className="h-3 w-3" />
                You have an active request being reviewed. New requests unlock once it&apos;s processed.
              </p>
            )}
          </div>

          {/* Withdrawal History */}
          <div className="rounded-xl border border-border p-4">
            <button
              onClick={() => setShowHistory((s) => !s)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-navy">
                <History className="h-4 w-4" /> Withdrawal History
              </span>
              <span className="text-xs text-muted-foreground">{showHistory ? 'Hide' : 'Show'}</span>
            </button>
            {showHistory && (
              <div className="mt-3 space-y-2">
                {history.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">No withdrawal requests yet.</p>
                ) : (
                  history.map((h) => (
                    <div key={h.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-navy">
                          &#8358;{h.amount.toLocaleString()}
                        </span>
                        <StatusBadge status={h.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(h.requested_at).toLocaleDateString()} · {h.bank_name} ·{' '}
                        {h.account_number}
                      </p>
                      {h.rejection_reason && (
                        <p className="mt-1 text-xs text-red-600">Reason: {h.rejection_reason}</p>
                      )}
                      {h.payment_reference && (
                        <p className="mt-1 text-xs text-green-600">Ref: {h.payment_reference}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Withdrawal Form Dialog */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Withdrawal</DialogTitle>
            <DialogDescription>
              Enter your bank details and the amount to withdraw. Available balance:&#160;
              <span className="font-semibold text-navy">₦{availableBalance.toLocaleString()}</span>.
              Minimum is ₦3,000.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="wd-amount">Amount (₦)</Label>
              <Input
                id="wd-amount"
                type="number"
                min={WITHDRAWAL_THRESHOLD}
                max={availableBalance}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="3000"
              />
            </div>
            <div>
              <Label htmlFor="wd-bank">Bank Name</Label>
              <Input
                id="wd-bank"
                value={form.bankName}
                onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                placeholder="e.g. OPay, GTBank, Access Bank"
              />
            </div>
            <div>
              <Label htmlFor="wd-acct-name">Account Name</Label>
              <Input
                id="wd-acct-name"
                value={form.accountName}
                onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
                placeholder="Name on the account"
              />
            </div>
            <div>
              <Label htmlFor="wd-acct-num">Account Number</Label>
              <Input
                id="wd-acct-num"
                value={form.accountNumber}
                onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                placeholder="10-digit account number"
                inputMode="numeric"
              />
            </div>

            {formError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {formError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleWithdrawSubmit} disabled={submitting} className="bg-navy text-white hover:bg-navy/90">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-blue-100 text-blue-700',
    paid: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    paid: 'Paid',
    rejected: 'Rejected',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {labels[status] || status}
    </span>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone: 'blue' | 'green' | 'orange' | 'amber';
}

function StatCard({ icon, value, label, tone }: StatCardProps) {
  const tones: Record<string, string> = {
    blue: 'bg-blue-50',
    green: 'bg-green-50',
    orange: 'bg-orange-50',
    amber: 'bg-amber-50',
  };
  return (
    <div className={`rounded-xl p-4 text-center ${tones[tone]}`}>
      <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center">{icon}</div>
      <p className="text-lg font-extrabold text-navy">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
