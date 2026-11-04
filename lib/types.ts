export interface CVFormData {
  fullName: string;
  phone: string;
  email: string;
  location: string;
  targetJobTitle: string;
  yearsOfExperience: string;
  education: string;
  workExperience: string;
  workDescription: string;
  threeThingsDoneWell: string;
  relevantSkills: string;
  certifications: string;
}

export interface ResumeFormData {
  targetCountry: 'us' | 'uk' | 'international' | '';
}

export interface CoverLetterFormData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  targetJobTitle: string;
  companyName: string;
  hiringManagerName: string;
  jobDescription: string;
  relevantSkillsOrExperience: string;
  whyYouWantTheRole: string;
}

export interface GeneratedCV {
  fullName: string;
  contactInfo: { phone: string; email: string; location: string };
  targetJobTitle: string;
  professionalSummary: string;
  coreSkills: string[];
  experience: string;
  projects: string;
  education: string;
  certifications: string;
  threeThingsDoneWell: string;
}

export interface GeneratedResume {
  fullName: string;
  contactInfo: { phone: string; email: string; location: string };
  targetJobTitle: string;
  summary: string;
  skills: string[];
  experience: string;
  projects: string;
  education: string;
  certifications: string;
  achievements: string;
}

export interface GeneratedCoverLetter {
  fullName: string;
  contactInfo: { email: string; phone: string; location: string };
  date: string;
  companyName: string;
  hiringManagerName: string;
  greeting: string;
  opening: string;
  body: string;
  closing: string;
  signature: string;
}

export interface CVReadinessScore {
  score: number;
  suggestions: string[];
}

export interface ResumeStrengthScore {
  score: number;
  suggestions: string[];
}

export interface JobMatchScore {
  score: number;
  suggestions: string[];
  basedOnJobDescription: boolean;
}

export type TabId = 'cv' | 'resume' | 'cover-letter';

export interface UsageCounters {
  cv: { date: string; count: number };
  resume: { date: string; count: number };
  'cover-letter': { date: string; count: number };
}

export const FREE_DAILY_LIMIT = 1;
export const DEMO_UNLOCK_CODE = 'HIREME-DEMO-PRO';
