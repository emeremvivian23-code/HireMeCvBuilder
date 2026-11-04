'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-client';
import { getStoredReferralCode, clearStoredReferralCode } from '@/lib/referral';
import { setProUnlocked } from '@/lib/storage';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  referral_code: string | null;
  referred_by: string | null;
  wallet_balance: number;
  is_pro: boolean;
  pro_expires_at: string | null;
  created_at: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, referral_code, referred_by, wallet_balance, is_pro, pro_expires_at, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      return;
    }
    setProfile(data as Profile | null);

    if (data) {
      const expiresAt = data.pro_expires_at ? new Date(data.pro_expires_at).getTime() : null;
      const proActive = data.is_pro && (expiresAt === null || expiresAt > Date.now());
      setProUnlocked(proActive);
    }

    const { data: adminRow } = await supabase.rpc('is_admin');
    setIsAdmin(Boolean(adminRow));
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        if (!mounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          await fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
          setIsAdmin(false);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string): Promise<{ error: string | null }> => {
      const refCode = getStoredReferralCode();

      const metadata: Record<string, string> = { full_name: fullName };
      if (refCode) {
        metadata.referred_by = refCode;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata },
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        clearStoredReferralCode();
      }

      return { error: null };
    },
    []
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      return { error: null };
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setIsAdmin(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, user, profile, isAdmin, loading, signUp, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
