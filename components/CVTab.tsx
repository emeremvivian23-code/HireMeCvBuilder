'use client';

import { useState, useEffect } from 'react';
import { FileText, Copy, Check, Loader2, Sparkles, Download, Wand2, Building2, Palette, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, TextInput, TextArea } from '@/components/FormFields';
import { UsageCounter } from '@/components/UsageCounter';
import { ScoreCard } from '@/components/ScoreCard';
import { Watermark } from '@/components/Watermark';
import { useApp } from '@/lib/context';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { usePdfDownload } from '@/hooks/use-pdf-download';
import { generateCV } from '@/lib/generators';
import { scoreCV } from '@/lib/scores';
import { cvToText } from '@/lib/formatters';
import { recordActivity } from '@/lib/activities';
import {
  incrementUsage,
  saveGeneratedCV,
  getGeneratedCV,
  getRemainingGenerations,
} from '@/lib/storage';
import { CVFormData, GeneratedCV, CVReadinessScore } from '@/lib/types';

const JOB_SUGGESTIONS = [
  'Frontend Developer',
  'Customer Support Representative',
  'Virtual Assistant',
  'NGO Programme Assistant',
  'Graduate Trainee',
  'Administrative Assistant',
  'Data Analyst',
  'Healthcare Assistant',
  'Sales Representative',
  'Social Media Manager',
];

export function CVTab() {
  const { cvForm, setCVForm, isPro, hydrated } = useApp();
  const { copied, copy } = useCopyToClipboard();
  const [activityId, setActivityId] = useState<string | undefined>(undefined);
  const { downloading, download } = usePdfDownload({ activityId });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCV, setGeneratedCV] = useState<GeneratedCV | null>(null);
  const [score, setScore] = useState<CVReadinessScore | null>(null);
  const [canGenerate, setCanGenerate] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  useEffect(() => {
    const saved = getGeneratedCV<GeneratedCV>();
    if (saved) setGeneratedCV(saved);
    if (typeof window !== 'undefined') {
      setCanGenerate(getRemainingGenerations('cv') > 0);
    }
  }, [hydrated, isPro]);

  const updateField = (field: keyof CVFormData, value: string) => {
    const updated = { ...cvForm, [field]: value };
    setCVForm(updated);
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!cvForm.fullName.trim()) e.fullName = 'Full name is required';
    if (!cvForm.phone.trim()) e.phone = 'Phone number is required';
    if (!cvForm.email.trim()) e.email = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cvForm.email)) e.email = 'Enter a valid email address';
    if (!cvForm.location.trim()) e.location = 'Location is required';
    if (!cvForm.targetJobTitle.trim()) e.targetJobTitle = 'Target job title is required';
    if (!cvForm.education.trim()) e.education = 'Education is required';
    if (!cvForm.relevantSkills.trim()) e.relevantSkills = 'Relevant skills are required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    if (!validate()) {
      const firstError = document.querySelector('[data-error="true"]');
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!isPro && !canGenerate) return;

    setIsGenerating(true);
    // Simulate generation delay for demo
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const cv = generateCV(cvForm);
    const cvScore = scoreCV(cvForm, cv);
    setGeneratedCV(cv);
    setScore(cvScore);
    saveGeneratedCV(cv);
    recordActivity('cv', cv.fullName, cv).then(setActivityId);

    if (!isPro) {
      incrementUsage('cv');
      setCanGenerate(getRemainingGenerations('cv') > 0);
    }

    setIsGenerating(false);
    setTimeout(() => {
      const preview = document.getElementById('cv-preview');
      if (preview) preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleCopy = async () => {
    if (!generatedCV) return;
    const success = await copy(cvToText(generatedCV));
    if (!success) {
      alert('Could not copy to clipboard. Please try selecting and copying manually.');
    }
  };

  const handleDownload = async () => {
    if (!generatedCV) return;
    await download('cv-doc', `${generatedCV.fullName || 'CV'} - HireMeCV`);
  };

  const handleUpgradeSummary = async (style: 'corporate' | 'creative' | 'tech') => {
    if (!generatedCV || upgrading) return;
    setUpgrading(true);
    setUpgradeError(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'summary',
          style,
          data: {
            fullName: cvForm.fullName,
            targetJobTitle: cvForm.targetJobTitle,
            yearsOfExperience: cvForm.yearsOfExperience,
            relevantSkills: cvForm.relevantSkills,
            workDescription: cvForm.workDescription,
            threeThingsDoneWell: cvForm.threeThingsDoneWell,
            education: cvForm.education,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.summary) {
        setUpgradeError(json.error || 'Could not upgrade the summary. Please try again.');
        setUpgrading(false);
        return;
      }
      const updated = { ...generatedCV, professionalSummary: json.summary };
      setGeneratedCV(updated);
      saveGeneratedCV(updated);
    } catch {
      setUpgradeError('Network error while upgrading the summary. Please try again.');
    }
    setUpgrading(false);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <FileText className="h-5 w-5 text-orange" />
          <h2 className="text-xl font-bold text-navy">ATS CV GENERATOR</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Create a professional CV tailored to your target job.
        </p>
      </div>

      <UsageCounter tab="cv" />

      {/* Form */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="space-y-4">
          <FormField label="Full Name" required error={errors.fullName}>
            <TextInput
              value={cvForm.fullName}
              onChange={(e) => updateField('fullName', e.target.value)}
              placeholder="e.g., Jane Doe"
              error={!!errors.fullName}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Phone Number" required error={errors.phone}>
              <TextInput
                value={cvForm.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="e.g., +234 800 123 4567"
                error={!!errors.phone}
              />
            </FormField>
            <FormField label="Email Address" required error={errors.email}>
              <TextInput
                type="email"
                value={cvForm.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="e.g., jane@email.com"
                error={!!errors.email}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Location" required error={errors.location}>
              <TextInput
                value={cvForm.location}
                onChange={(e) => updateField('location', e.target.value)}
                placeholder="e.g., Lagos, Nigeria"
                error={!!errors.location}
              />
            </FormField>
            <FormField label="Target Job Title" required error={errors.targetJobTitle}>
              <TextInput
                value={cvForm.targetJobTitle}
                onChange={(e) => updateField('targetJobTitle', e.target.value)}
                placeholder="e.g., Frontend Developer"
                error={!!errors.targetJobTitle}
              />
            </FormField>
          </div>

          {/* Job suggestions */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Quick suggestions:</p>
            <div className="flex flex-wrap gap-2">
              {JOB_SUGGESTIONS.map((job) => (
                <button
                  key={job}
                  type="button"
                  onClick={() => updateField('targetJobTitle', job)}
                  className="rounded-full border border-border bg-light-gray px-3 py-1 text-xs font-medium text-navy transition-colors hover:border-orange hover:text-orange"
                >
                  {job}
                </button>
              ))}
            </div>
          </div>

          <FormField label="Years of Experience" required={false}>
            <TextInput
              value={cvForm.yearsOfExperience}
              onChange={(e) => updateField('yearsOfExperience', e.target.value)}
              placeholder="e.g., 0, 1, 3, 5+"
              type="text"
            />
          </FormField>

          <FormField label="Education" required error={errors.education}>
            <TextArea
              value={cvForm.education}
              onChange={(e) => updateField('education', e.target.value)}
              placeholder="e.g.,&#10;B.Sc. Computer Science, University of Lagos (2018-2022)&#10;WAEC, King's College Lagos (2015)"
              rows={3}
              error={!!errors.education}
            />
          </FormField>

          <FormField
            label="Work Experience, Training, Projects, or Volunteering"
            required={false}
          >
            <TextArea
              value={cvForm.workExperience}
              onChange={(e) => updateField('workExperience', e.target.value)}
              placeholder="List your genuine experience, one per line. Include role, organization, and dates. e.g.,&#10;Intern, TechCorp Ltd (Jun 2022 - Dec 2022)&#10;Volunteer, Red Cross Lagos (2021)"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              For beginners: include projects, training, internships, or volunteering.
            </p>
          </FormField>

          <FormField
            label="Describe Your Work or Relevant Activities in 2-3 Sentences"
            required={false}
          >
            <TextArea
              value={cvForm.workDescription}
              onChange={(e) => updateField('workDescription', e.target.value)}
              placeholder="e.g., I supported the frontend team in building responsive web interfaces using React. I contributed to component libraries and resolved UI bugs. I also collaborated with designers to implement user-friendly layouts."
              rows={3}
            />
          </FormField>

          <FormField
            label="Three Things You Have Done Well"
            required={false}
          >
            <TextArea
              value={cvForm.threeThingsDoneWell}
              onChange={(e) => updateField('threeThingsDoneWell', e.target.value)}
              placeholder="List three genuine achievements or things you did well. One per line or separated by commas."
              rows={3}
            />
          </FormField>

          <FormField label="Relevant Skills" required error={errors.relevantSkills}>
            <TextArea
              value={cvForm.relevantSkills}
              onChange={(e) => updateField('relevantSkills', e.target.value)}
              placeholder="Separate with commas. e.g., React, TypeScript, CSS, Communication, Teamwork, Problem-solving"
              rows={2}
              error={!!errors.relevantSkills}
            />
          </FormField>

          <FormField label="Certifications (optional)">
            <TextArea
              value={cvForm.certifications}
              onChange={(e) => updateField('certifications', e.target.value)}
              placeholder="e.g., Google IT Support Certificate (2023), AWS Cloud Practitioner (2022)"
              rows={2}
            />
          </FormField>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || (!isPro && !canGenerate)}
            className="w-full bg-orange text-white hover:bg-orange/90 disabled:opacity-50"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generating your CV...
              </>
            ) : !isPro && !canGenerate ? (
              'Free generations used today — Upgrade to Pro'
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                GENERATE MY ATS CV
              </>
            )}
          </Button>

          {!isPro && !canGenerate && (
            <p className="text-center text-xs text-muted-foreground">
              You can still view and copy documents you already generated.
            </p>
          )}
        </div>
      </div>

      {/* Generated CV Preview */}
      {generatedCV && (
        <div id="cv-preview" className="space-y-4">
          {score && (
            <ScoreCard
              title="CV Readiness Score"
              score={score.score}
              suggestions={score.suggestions}
              note="This score is an estimate based on completeness, skills, keywords, and readability. It does not guarantee ATS acceptance, interviews, or employment."
            />
          )}

          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-navy">CV Preview</h3>
              <div className="flex gap-2">
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  size="sm"
                  className="border-navy text-navy hover:bg-navy hover:text-white"
                >
                  {copied ? (
                    <>
                      <Check className="mr-1.5 h-4 w-4 text-green-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-4 w-4" />
                      COPY CV TEXT
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleDownload}
                  disabled={downloading}
                  size="sm"
                  className="bg-orange text-white hover:bg-orange/90"
                >
                  {downloading ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-4 w-4" />
                  )}
                  {downloading ? 'PDF…' : 'PDF'}
                </Button>
              </div>
            </div>

            {isPro && (
              <div className="mb-3 rounded-xl border border-orange/30 bg-orange/5 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-orange" />
                  <p className="text-xs font-bold uppercase tracking-wide text-navy">
                    Upgrade Summary with AI
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    onClick={() => handleUpgradeSummary('corporate')}
                    disabled={upgrading}
                    variant="outline"
                    size="sm"
                    className="border-navy/30 text-navy hover:bg-navy/5"
                  >
                    <Building2 className="mr-1 h-3.5 w-3.5" /> Corporate
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleUpgradeSummary('creative')}
                    disabled={upgrading}
                    variant="outline"
                    size="sm"
                    className="border-navy/30 text-navy hover:bg-navy/5"
                  >
                    <Palette className="mr-1 h-3.5 w-3.5" /> Creative
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleUpgradeSummary('tech')}
                    disabled={upgrading}
                    variant="outline"
                    size="sm"
                    className="border-navy/30 text-navy hover:bg-navy/5"
                  >
                    <Cpu className="mr-1 h-3.5 w-3.5" /> Tech
                  </Button>
                </div>
                {upgrading && (
                  <p className="mt-2 text-xs text-muted-foreground">Rewriting your summary…</p>
                )}
                {upgradeError && (
                  <p className="mt-2 text-xs text-red-600">{upgradeError}</p>
                )}
              </div>
            )}

            <div id="cv-doc" className="doc-preview rounded-lg border border-border overflow-hidden">
              {/* Header */}
              <div className="bg-navy px-6 py-5 text-white">
                <h1 className="text-2xl font-bold">{generatedCV.fullName}</h1>
                <p className="mt-1 text-sm text-white/80">
                  {generatedCV.contactInfo.phone} | {generatedCV.contactInfo.email} | {generatedCV.contactInfo.location}
                </p>
                {generatedCV.targetJobTitle && (
                  <p className="mt-2 text-sm font-semibold text-orange">
                    Target: {generatedCV.targetJobTitle}
                  </p>
                )}
              </div>

              {/* Body */}
              <div className="px-6 py-5 text-sm text-foreground">
                <section className="mb-4">
                  <h2 className="mb-1.5 border-b border-border pb-0.5 text-sm font-bold uppercase tracking-wide text-navy">
                    Professional Summary
                  </h2>
                  <p className="leading-relaxed">{generatedCV.professionalSummary}</p>
                </section>

                {generatedCV.coreSkills.length > 0 && (
                  <section className="mb-4">
                    <h2 className="mb-1.5 border-b border-border pb-0.5 text-sm font-bold uppercase tracking-wide text-navy">
                      Core Skills
                    </h2>
                    <p className="leading-relaxed">{generatedCV.coreSkills.join(', ')}</p>
                  </section>
                )}

                {generatedCV.experience.trim() && (
                  <section className="mb-4">
                    <h2 className="mb-1.5 border-b border-border pb-0.5 text-sm font-bold uppercase tracking-wide text-navy">
                      Professional Experience
                    </h2>
                    <p className="whitespace-pre-wrap leading-relaxed">{generatedCV.experience}</p>
                  </section>
                )}

                {generatedCV.projects.trim() && (
                  <section className="mb-4">
                    <h2 className="mb-1.5 border-b border-border pb-0.5 text-sm font-bold uppercase tracking-wide text-navy">
                      Projects, Training, or Volunteering
                    </h2>
                    <p className="whitespace-pre-wrap leading-relaxed">{generatedCV.projects}</p>
                  </section>
                )}

                {generatedCV.threeThingsDoneWell.trim() && (
                  <section className="mb-4">
                    <h2 className="mb-1.5 border-b border-border pb-0.5 text-sm font-bold uppercase tracking-wide text-navy">
                      Key Achievements
                    </h2>
                    <p className="whitespace-pre-wrap leading-relaxed">{generatedCV.threeThingsDoneWell}</p>
                  </section>
                )}

                {generatedCV.education.trim() && (
                  <section className="mb-4">
                    <h2 className="mb-1.5 border-b border-border pb-0.5 text-sm font-bold uppercase tracking-wide text-navy">
                      Education
                    </h2>
                    <p className="whitespace-pre-wrap leading-relaxed">{generatedCV.education}</p>
                  </section>
                )}

                {generatedCV.certifications.trim() && (
                  <section className="mb-4">
                    <h2 className="mb-1.5 border-b border-border pb-0.5 text-sm font-bold uppercase tracking-wide text-navy">
                      Certifications
                    </h2>
                    <p className="whitespace-pre-wrap leading-relaxed">{generatedCV.certifications}</p>
                  </section>
                )}
              </div>

              {!isPro && <Watermark />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
