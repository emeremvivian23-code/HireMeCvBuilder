'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CVFormData, CoverLetterFormData, UsageCounters } from '@/lib/types';
import { getCVForm, saveCVForm, getCoverLetterForm, saveCoverLetterForm, getUsageCounters, isProUnlocked } from '@/lib/storage';
import { useAuth } from '@/lib/auth-context';

interface AppContextValue {
  cvForm: CVFormData;
  setCVForm: (data: CVFormData) => void;
  coverLetterForm: CoverLetterFormData;
  setCoverLetterForm: (data: CoverLetterFormData) => void;
  usage: UsageCounters;
  refreshUsage: () => void;
  isPro: boolean;
  refreshPro: () => void;
  hydrated: boolean;
}

const emptyCVForm: CVFormData = {
  fullName: '',
  phone: '',
  email: '',
  location: '',
  targetJobTitle: '',
  yearsOfExperience: '',
  education: '',
  workExperience: '',
  workDescription: '',
  threeThingsDoneWell: '',
  relevantSkills: '',
  certifications: '',
};

const emptyCLForm: CoverLetterFormData = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  targetJobTitle: '',
  companyName: '',
  hiringManagerName: '',
  jobDescription: '',
  relevantSkillsOrExperience: '',
  whyYouWantTheRole: '',
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [cvForm, setCvForm] = useState<CVFormData>(emptyCVForm);
  const [coverLetterForm, setCoverLetterFormState] = useState<CoverLetterFormData>(emptyCLForm);
  const [usage, setUsage] = useState<UsageCounters>(getUsageCounters());
  const [isPro, setIsPro] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const { loading: authLoading, profile } = useAuth();

  useEffect(() => {
    const savedCV = getCVForm();
    if (savedCV) setCvForm(savedCV);
    const savedCL = getCoverLetterForm();
    if (savedCL) setCoverLetterFormState(savedCL);
    setUsage(getUsageCounters());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!authLoading) setIsPro(isProUnlocked());
  }, [authLoading, profile]);

  const setCVForm = useCallback((data: CVFormData) => {
    setCvForm(data);
    saveCVForm(data);
  }, []);

  const setCoverLetterForm = useCallback((data: CoverLetterFormData) => {
    setCoverLetterFormState(data);
    saveCoverLetterForm(data);
  }, []);

  const refreshUsage = useCallback(() => {
    setUsage(getUsageCounters());
  }, []);

  const refreshPro = useCallback(() => {
    setIsPro(isProUnlocked());
  }, []);

  return (
    <AppContext.Provider
      value={{
        cvForm,
        setCVForm,
        coverLetterForm,
        setCoverLetterForm,
        usage,
        refreshUsage,
        isPro,
        refreshPro,
        hydrated,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
