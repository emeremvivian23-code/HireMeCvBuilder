'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
  Users,
  Wallet,
  ArrowLeft,
  Search,
  Loader2,
  XCircle,
  CircleDollarSign,
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
import { supabase } from '@/lib/supabase-client';

// Fire-and-forget: triggers the withdraw-emails edge function to drain the
// notification outbox. Best-effort — failures are logged but never block the UI,
// since the outbox is also drained by scheduled invocations.
async function triggerEmailSender() {
  try {
    const { data } = await supabase.auth.getSession();
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}/functions/v1/withdraw-emails`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ trigger: true }),
    });
  } catch {
    // Non-fatal: scheduled drain will retry.
  }
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  referral_code: string | null;
  referred_by: string | null;
  is_pro: boolean;
  wallet_balance: number;
}

interface PaymentRow {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  confirmed_at: string | null;
  created_at: string;
  profiles: { email: string; full_name: string }[] | null;
}

interface TxRow {
  id: string;
  profile_id: string;
  amount: number;
  type: string;
  note: string | null;
  created_at: string;
  profiles: { email: string; full_name: string }[] | null;
}

interface WithdrawalRow {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  rejection_reason: string | null;
  payment_reference: string | null;
  requested_at: string;
  reviewed_at: string | null;
  profiles: { email: string; full_name: string }[] | null;
}

const PRO_PRICE = 3500;

export default function AdminPage() {
  const router = useRouter();
  const { user, isAdmin, loading } = useAuth();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reject dialog state
  const [rejectTarget, setRejectTarget] = useState<WithdrawalRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // Pay dialog state
  const [payTarget, setPayTarget] = useState<WithdrawalRow | null>(null);
  const [payReference, setPayReference] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  const loadData = useCallback(async () => {
    const [usersRes, payRes, txRes, wdRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, full_name, referral_code, referred_by, is_pro, wallet_balance')
        .order('created_at', { ascending: false }),
      supabase
        .from('payments')
        .select('id, user_id, amount, method, status, reference, confirmed_at, created_at, profiles(email, full_name)')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('wallet_transactions')
        .select('id, profile_id, amount, type, note, created_at, profiles(email, full_name)')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('withdrawals')
        .select('id, user_id, amount, status, bank_name, account_name, account_number, rejection_reason, payment_reference, requested_at, reviewed_at, profiles(email, full_name)')
        .order('requested_at', { ascending: false })
        .limit(50),
    ]);

    if (usersRes.data) setUsers(usersRes.data as UserRow[]);
    if (payRes.data) setPayments(payRes.data as PaymentRow[]);
    if (txRes.data) setTransactions(txRes.data as TxRow[]);
    if (wdRes.data) setWithdrawals(wdRes.data as WithdrawalRow[]);
  }, []);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/signin');
        return;
      }
      if (!isAdmin) {
        router.push('/');
        return;
      }
      loadData();
    }
  }, [loading, user, isAdmin, router, loadData]);

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (u.referral_code || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleConfirm = async (userId: string) => {
    setActionLoading(userId);
    setMessage(null);
    const { data, error } = await supabase.rpc('confirm_pro_payment', {
      p_user_id: userId,
      p_amount: PRO_PRICE,
      p_method: 'opay',
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data) {
      const result = data as { success: boolean; commission_awarded?: boolean; reason?: string; error?: string };
      if (!result.success) {
        setMessage({ type: 'error', text: result.error || 'Confirmation failed' });
      } else {
        const commissionNote = result.commission_awarded
          ? ' — ₦1,000 commission awarded to referrer'
          : '';
        setMessage({ type: 'success', text: `Payment confirmed. Pro activated${commissionNote}.` });
        loadData();
      }
    }
    setActionLoading(null);
  };

  const handleReverse = async (paymentId: string) => {
    if (!confirm('Reverse this payment and any associated commission? This marks the payment as refunded.')) {
      return;
    }
    setActionLoading(paymentId);
    setMessage(null);
    const { data, error } = await supabase.rpc('reverse_payment', { p_payment_id: paymentId });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data) {
      const result = data as { success: boolean; commission_reversed?: boolean; error?: string };
      if (!result.success) {
        setMessage({ type: 'error', text: result.error || 'Reversal failed' });
      } else {
        const note = result.commission_reversed ? ' — commission reversed' : '';
        setMessage({ type: 'success', text: `Payment marked as refunded${note}.` });
        loadData();
      }
    }
    setActionLoading(null);
  };

  const handleApproveWithdrawal = async (id: string) => {
    setActionLoading(id);
    setMessage(null);
    const { data, error } = await supabase.rpc('approve_withdrawal', { p_withdrawal_id: id });
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data) {
      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        setMessage({ type: 'error', text: result.error || 'Approval failed' });
      } else {
        setMessage({ type: 'success', text: 'Withdrawal approved. The user has been emailed. Mark as paid after transferring the funds.' });
        loadData();
        triggerEmailSender();
      }
    }
    setActionLoading(null);
  };

  const openRejectDialog = (w: WithdrawalRow) => {
    setRejectTarget(w);
    setRejectReason('');
  };

  const handleRejectSubmit = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      setMessage({ type: 'error', text: 'A rejection reason is required.' });
      return;
    }
    setRejectSubmitting(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('reject_withdrawal', {
      p_withdrawal_id: rejectTarget.id,
      p_reason: rejectReason.trim(),
    });
    setRejectSubmitting(false);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      setMessage({ type: 'error', text: result.error || 'Rejection failed' });
      return;
    }
    setRejectTarget(null);
    setMessage({ type: 'success', text: 'Withdrawal rejected. The user has been emailed and reserved funds released.' });
    loadData();
    triggerEmailSender();
  };

  const openPayDialog = (w: WithdrawalRow) => {
    setPayTarget(w);
    setPayReference('');
  };

  const handlePaySubmit = async () => {
    if (!payTarget) return;
    setPaySubmitting(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('mark_withdrawal_paid', {
      p_withdrawal_id: payTarget.id,
      p_payment_reference: payReference.trim() || null,
    });
    setPaySubmitting(false);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      setMessage({ type: 'error', text: result.error || 'Could not mark as paid' });
      return;
    }
    setPayTarget(null);
    setMessage({ type: 'success', text: 'Withdrawal marked as paid. Wallet debited, logged, and the user has been emailed.' });
    loadData();
    triggerEmailSender();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-light-gray">
        <Loader2 className="h-6 w-6 animate-spin text-navy" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-light-gray">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy">
          <ArrowLeft className="h-4 w-4" /> Back to HiremCV
        </Link>

        <div className="mb-6 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-navy" />
          <h1 className="text-2xl font-extrabold text-navy">Admin Dashboard</h1>
        </div>

        {message && (
          <div
            className={`mb-4 rounded-lg p-3 text-center text-sm font-medium ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-600'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Stats */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white p-4 text-center shadow-sm">
            <Users className="mx-auto mb-1 h-5 w-5 text-navy" />
            <p className="text-2xl font-extrabold text-navy">{users.length}</p>
            <p className="text-xs text-muted-foreground">Users</p>
          </div>
          <div className="rounded-xl bg-white p-4 text-center shadow-sm">
            <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-green-600" />
            <p className="text-2xl font-extrabold text-green-600">
              {payments.filter((p) => p.status === 'confirmed').length}
            </p>
            <p className="text-xs text-muted-foreground">Confirmed Payments</p>
          </div>
          <div className="rounded-xl bg-white p-4 text-center shadow-sm">
            <Wallet className="mx-auto mb-1 h-5 w-5 text-orange" />
            <p className="text-2xl font-extrabold text-orange">
              &#8358;
              {transactions
                .filter((t) => t.type === 'commission')
                .reduce((s, t) => s + t.amount, 0)
                .toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Commissions Paid</p>
          </div>
        </div>

        {/* Confirm Payment section */}
        <div className="mb-6 rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy">Confirm Pro Payment</h2>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or referral code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {filteredUsers.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No users found.</p>
            )}
            {filteredUsers.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {u.full_name || '(no name)'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Code: {u.referral_code || '—'} {u.referred_by ? `· Referred by: ${u.referred_by}` : ''}
                    {u.is_pro ? ' · PRO' : ''}
                  </p>
                </div>
                <Button
                  onClick={() => handleConfirm(u.id)}
                  disabled={actionLoading === u.id}
                  size="sm"
                  className="shrink-0 bg-green-600 text-white hover:bg-green-700"
                >
                  {actionLoading === u.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : u.is_pro ? (
                    'Re-confirm'
                  ) : (
                    'Confirm ₦3,500'
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="mb-6 rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy">Recent Payments</h2>
          {payments.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {p.profiles?.[0]?.email || 'Unknown user'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      &#8358;{p.amount.toLocaleString()} · {p.method} ·{' '}
                      <span
                        className={`font-semibold ${
                          p.status === 'confirmed'
                            ? 'text-green-600'
                            : p.status === 'refunded'
                            ? 'text-red-600'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {p.status}
                      </span>
                      {p.reference ? ` · Ref: ${p.reference}` : ''}
                    </p>
                  </div>
                  {p.status === 'confirmed' && (
                    <Button
                      onClick={() => handleReverse(p.id)}
                      disabled={actionLoading === p.id}
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-red-200 text-red-600 hover:bg-red-50"
                    >
                      {actionLoading === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reverse
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Withdrawal Management */}
        <div className="mb-6 rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy">Withdrawal Requests</h2>
          {withdrawals.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No withdrawal requests yet.</p>
          ) : (
            <div className="space-y-2">
              {withdrawals.map((w) => (
                <div key={w.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {w.profiles?.[0]?.email || 'Unknown user'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        &#8358;{w.amount.toLocaleString()} · {w.bank_name} · {w.account_name} · {w.account_number}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Requested {new Date(w.requested_at).toLocaleDateString()}
                      </p>
                      {w.rejection_reason && (
                        <p className="mt-1 text-xs text-red-600">Rejected: {w.rejection_reason}</p>
                      )}
                      {w.payment_reference && (
                        <p className="mt-1 text-xs text-green-600">Paid · Ref: {w.payment_reference}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <WdStatusBadge status={w.status} />
                      {w.status === 'pending' && (
                        <>
                          <Button
                            onClick={() => handleApproveWithdrawal(w.id)}
                            disabled={actionLoading === w.id}
                            size="sm"
                            className="bg-blue-600 text-white hover:bg-blue-700"
                          >
                            {actionLoading === w.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve'}
                          </Button>
                          <Button
                            onClick={() => openRejectDialog(w)}
                            disabled={actionLoading === w.id}
                            size="sm"
                            variant="outline"
                            className="border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </>
                      )}
                      {w.status === 'approved' && (
                        <>
                          <Button
                            onClick={() => openPayDialog(w)}
                            disabled={actionLoading === w.id}
                            size="sm"
                            className="bg-green-600 text-white hover:bg-green-700"
                          >
                            <CircleDollarSign className="mr-1 h-3.5 w-3.5" /> Mark Paid
                          </Button>
                          <Button
                            onClick={() => openRejectDialog(w)}
                            disabled={actionLoading === w.id}
                            size="sm"
                            variant="outline"
                            className="border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Wallet Transactions Audit Log */}
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy">
            Wallet Transactions (Audit Log)
          </h2>
          {transactions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="space-y-2">
              {transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {t.profiles?.[0]?.email || 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.note || t.type}</p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-bold ${
                      t.amount >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {t.amount >= 0 ? '+' : ''}&#8358;{t.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Withdrawal</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  Rejecting &#8358;{rejectTarget.amount.toLocaleString()} for{' '}
                  {rejectTarget.profiles?.[0]?.email || 'this user'}. Reserved funds will be released back to their available balance.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Input
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Account number could not be verified"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={rejectSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleRejectSubmit}
              disabled={rejectSubmitting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {rejectSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay Dialog */}
      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Withdrawal as Paid</DialogTitle>
            <DialogDescription>
              {payTarget && (
                <>
                  Confirm that you have transferred &#8358;{payTarget.amount.toLocaleString()} to{' '}
                  {payTarget.account_name} ({payTarget.bank_name}, {payTarget.account_number}). The user&apos;s wallet
                  will be debited and the transaction logged.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pay-ref">Payment Reference (optional)</Label>
            <Input
              id="pay-ref"
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder="Transaction ID / receipt number"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)} disabled={paySubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handlePaySubmit}
              disabled={paySubmitting}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {paySubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Paid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WdStatusBadge({ status }: { status: string }) {
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
