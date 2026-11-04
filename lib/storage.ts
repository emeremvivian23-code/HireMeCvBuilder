import {
  UsageCounters,
  FREE_DAILY_LIMIT,
  TabId,
  CVFormData,
  CoverLetterFormData,
} from './types';

const USAGE_KEY = 'hireme-cv-usage';
const PRO_KEY = 'hireme-cv-pro';
const CV_FORM_KEY = 'hireme-cv-form';
const CL_FORM_KEY = 'hireme-cv-cl-form';
const GENERATED_CV_KEY = 'hireme-cv-generated';
const GENERATED_RESUME_KEY = 'hireme-cv-resume-generated';
const GENERATED_CL_KEY = 'hireme-cv-cl-generated';

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

export function getUsageCounters(): UsageCounters {
  if (typeof window === 'undefined') {
    const today = getTodayString();
    return {
      cv: { date: today, count: 0 },
      resume: { date: today, count: 0 },
      'cover-letter': { date: today, count: 0 },
    };
  }
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) {
      const fresh: UsageCounters = {
        cv: { date: getTodayString(), count: 0 },
        resume: { date: getTodayString(), count: 0 },
        'cover-letter': { date: getTodayString(), count: 0 },
      };
      localStorage.setItem(USAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw) as UsageCounters;
    const today = getTodayString();
    if (parsed.cv.date !== today) parsed.cv = { date: today, count: 0 };
    if (parsed.resume.date !== today) parsed.resume = { date: today, count: 0 };
    if (parsed['cover-letter'].date !== today)
      parsed['cover-letter'] = { date: today, count: 0 };
    localStorage.setItem(USAGE_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    return {
      cv: { date: getTodayString(), count: 0 },
      resume: { date: getTodayString(), count: 0 },
      'cover-letter': { date: getTodayString(), count: 0 },
    };
  }
}

export function incrementUsage(tab: TabId): UsageCounters {
  const counters = getUsageCounters();
  counters[tab].count += 1;
  if (typeof window !== 'undefined') {
    localStorage.setItem(USAGE_KEY, JSON.stringify(counters));
  }
  return counters;
}

export function getRemainingGenerations(tab: TabId): number {
  const counters = getUsageCounters();
  return Math.max(0, FREE_DAILY_LIMIT - counters[tab].count);
}

export function isProUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(PRO_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setProUnlocked(value: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PRO_KEY, value ? 'true' : 'false');
}

export function saveCVForm(data: CVFormData): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CV_FORM_KEY, JSON.stringify(data));
}

export function getCVForm(): CVFormData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CV_FORM_KEY);
    return raw ? (JSON.parse(raw) as CVFormData) : null;
  } catch {
    return null;
  }
}

export function saveCoverLetterForm(data: CoverLetterFormData): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CL_FORM_KEY, JSON.stringify(data));
}

export function getCoverLetterForm(): CoverLetterFormData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CL_FORM_KEY);
    return raw ? (JSON.parse(raw) as CoverLetterFormData) : null;
  } catch {
    return null;
  }
}

export function saveGeneratedCV(data: unknown): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GENERATED_CV_KEY, JSON.stringify(data));
}

export function getGeneratedCV<T>(): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GENERATED_CV_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveGeneratedResume(data: unknown): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GENERATED_RESUME_KEY, JSON.stringify(data));
}

export function getGeneratedResume<T>(): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GENERATED_RESUME_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveGeneratedCoverLetter(data: unknown): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GENERATED_CL_KEY, JSON.stringify(data));
}

export function getGeneratedCoverLetter<T>(): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GENERATED_CL_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
