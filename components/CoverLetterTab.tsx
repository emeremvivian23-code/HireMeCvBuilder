'use client';

import { useState, useEffect } from 'react';
import { Mail, Copy, Check, Loader2, Sparkles, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, TextInput, TextArea } from '@/components/FormFields';
import { UsageCounter } from '@/components/UsageCounter';
import { ScoreCard } from '@/components/ScoreCard';
import { Watermark } from '@/components/Watermark';
import { useApp } from '@/lib/context';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { usePdfDownload } from '@/hooks/use-pdf-download';
import { generateCoverLetter } from '@/lib/generators';
import { scoreCoverLetter } from '@/lib/scores';
import { coverLetterToText } from '@/lib/formatters';
import { recordActivity } from '@/lib/activities';
import {
  incrementUsage,
  saveGeneratedCoverLetter,
  getGeneratedCoverLetter,
  getRemainingGenerations,
} from '@/lib/storage';
import { CoverLetterFormData, GeneratedCoverLetter, JobMatchScore } from '@/lib/types';

export function CoverLetterTab() {
  const { cvForm, coverLetterForm, setCoverLetterForm, isPro, hydrated } = useApp();
  const { copied, copy } = useCopyToClipboard();
  const [activityId, setActivityId] = useState<string | undefined>(undefined);
  const { downloading, download } = usePdfDownload({ activityId });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCL, setGeneratedCL] = useState<GeneratedCoverLetter | null>(null);
  const [score, setScore] = useState<JobMatchScore | null>(null);
  const [canGenerate, setCanGenerate] = useState(true);

  useEffect(() => {
    const saved = getGeneratedCoverLetter<GeneratedCoverLetter>();
    if (saved) setGeneratedCL(saved);
    if (typeof window !== 'undefined') {
      setCanGenerate(getRemainingGenerations('cover-letter') > 0);
    }
  }, [hydrated, isPro]);

  const updateField = (field: keyof CoverLetterFormData, value: string) => {
    const updated = { ...coverLetterForm, [field]: value };
    setCoverLetterForm(updated);
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleReuseCVInfo = () => {
    const updated: CoverLetterFormData = {
      ...coverLetterForm,
      fullName: cvForm.fullName || coverLetterForm.fullName,
      email: cvForm.email || coverLetterForm.email,
      phone: cvForm.phone || coverLetterForm.phone,
      location: cvForm.location || coverLetterForm.location,
      targetJobTitle: cvForm.targetJobTitle || coverLetterForm.targetJobTitle,
      relevantSkillsOrExperience:
        coverLetterForm.relevantSkillsOrExperience ||
        cvForm.relevantSkills ||
        '',
    };
    setCoverLetterForm(updated);
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!coverLetterForm.fullName.trim()) e.fullName = 'Full name is required';
    if (!coverLetterForm.email.trim()) e.email = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(coverLetterForm.email))
      e.email = 'Enter a valid email address';
    if (!coverLetterForm.phone.trim()) e.phone = 'Phone number is required';
    if (!coverLetterForm.location.trim()) e.location = 'Location is required';
    if (!coverLetterForm.targetJobTitle.trim()) e.targetJobTitle = 'Target job title is required';
    if (!coverLetterForm.companyName.trim()) e.companyName = 'Company name is required';
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
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const cl = generateCoverLetter(coverLetterForm, cvForm);
    const clScore = scoreCoverLetter(coverLetterForm, cl);
    setGeneratedCL(cl);
    setScore(clScore);
    saveGeneratedCoverLetter(cl);
    recordActivity('cover-letter', cl.fullName, cl).then(setActivityId);

    if (!isPro) {
      incrementUsage('cover-letter');
      setCanGenerate(getRemainingGenerations('cover-letter') > 0);
    }

    setIsGenerating(false);
    setTimeout(() => {
      const preview = document.getElementById('cl-preview');
      if (preview) preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleCopy = async () => {
    if (!generatedCL) return;
    const success = await copy(coverLetterToText(generatedCL));
    if (!success) {
      alert('Could not copy to clipboard. Please try selecting and copying manually.');
    }
  };

  const handleDownload = async () => {
    if (!generatedCL) return;
    await download('cl-doc', `${generatedCL.fullName || 'CoverLetter'} - ${generatedCL.companyName || 'HireMeCV'}`);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Mail className="h-5 w-5 text-orange" />
          <h2 className="text-xl font-bold text-navy">COVER LETTER GENERATOR</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Create a professional cover letter tailored to the job you want.
        </p>
      </div>

      <UsageCounter tab="cover-letter" />

      {/* Reuse CV info button */}
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <Button
          onClick={handleReuseCVInfo}
          variant="outline"
          className="w-full border-navy text-navy hover:bg-navy hover:text-white"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Reuse My CV Information
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Fills in your name, contact, job title, and skills from the CV tab.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="space-y-4">
          <FormField label="Full Name" required error={errors.fullName}>
            <TextInput
              value={coverLetterForm.fullName}
              onChange={(e) => updateField('fullName', e.target.value)}
              placeholder="e.g., Jane Doe"
              error={!!errors.fullName}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Email Address" required error={errors.email}>
              <TextInput
                type="email"
                value={coverLetterForm.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="e.g., jane@email.com"
                error={!!errors.email}
              />
            </FormField>
            <FormField label="Phone Number" required error={errors.phone}>
              <TextInput
                value={coverLetterForm.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="e.g., +234 800 123 4567"
                error={!!errors.phone}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Location" required error={errors.location}>
              <TextInput
                value={coverLetterForm.location}
                onChange={(e) => updateField('location', e.target.value)}
                placeholder="e.g., Lagos, Nigeria"
                error={!!errors.location}
              />
            </FormField>
            <FormField label="Target Job Title" required error={errors.targetJobTitle}>
              <TextInput
                value={coverLetterForm.targetJobTitle}
                onChange={(e) => updateField('targetJobTitle', e.target.value)}
                placeholder="e.g., Frontend Developer"
                error={!!errors.targetJobTitle}
              />
            </FormField>
          </div>

          <FormField label="Company Name" required error={errors.companyName}>
            <TextInput
              value={coverLetterForm.companyName}
              onChange={(e) => updateField('companyName', e.target.value)}
              placeholder="e.g., TechCorp Ltd"
              error={!!errors.companyName}
            />
          </FormField>

          <FormField label="Hiring Manager's Name (optional)">
            <TextInput
              value={coverLetterForm.hiringManagerName}
              onChange={(e) => updateField('hiringManagerName', e.target.value)}
              placeholder="e.g., Mr. John Smith"
            />
          </FormField>

          <FormField label="Job Description (optional)">
            <TextArea
              value={coverLetterForm.jobDescription}
              onChange={(e) => updateField('jobDescription', e.target.value)}
              placeholder="Paste the job description here. We'll match your skills to the requirements."
              rows={4}
            />
          </FormField>

          <FormField label="Relevant Skills or Experience" required={false}>
            <TextArea
              value={coverLetterForm.relevantSkillsOrExperience}
              onChange={(e) => updateField('relevantSkillsOrExperience', e.target.value)}
              placeholder="Separate with commas. e.g., React, Communication, Teamwork, Problem-solving"
              rows={2}
            />
          </FormField>

          <FormField label="Why You Want the Role (optional)">
            <TextArea
              value={coverLetterForm.whyYouWantTheRole}
              onChange={(e) => updateField('whyYouWantTheRole', e.target.value)}
              placeholder="e.g., I admire your company's mission to make technology accessible to everyone, and I want to contribute to that vision."
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
                Generating your cover letter...
              </>
            ) : !isPro && !canGenerate ? (
              'Free generations used today — Upgrade to Pro'
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                GENERATE MY COVER LETTER
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

      {/* Generated Cover Letter Preview */}
      {generatedCL && (
        <div id="cl-preview" className="space-y-4">
          {score && (
            <ScoreCard
              title="Job Match Estimate"
              score={score.score}
              suggestions={score.suggestions}
              note={
                score.basedOnJobDescription
                  ? 'This estimate is based on the job description you provided and your skills. It is an estimate and does not guarantee interviews or employment.'
                  : 'This estimate is based on available information only. Provide a job description for a more accurate match estimate. This does not guarantee interviews or employment.'
              }
            />
          )}

          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-navy">Cover Letter Preview</h3>
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
                      COPY TEXT
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

            <div id="cl-doc" className="doc-preview rounded-lg border border-border bg-white px-6 py-6 text-sm text-foreground">
              {/* Sender info */}
              <div className="mb-4">
                <p className="font-semibold">{generatedCL.fullName}</p>
                <p className="text-xs text-muted-foreground">{generatedCL.contactInfo.email}</p>
                <p className="text-xs text-muted-foreground">{generatedCL.contactInfo.phone}</p>
                <p className="text-xs text-muted-foreground">{generatedCL.contactInfo.location}</p>
              </div>

              {/* Date */}
              <p className="mb-4 text-xs text-muted-foreground">{generatedCL.date}</p>

              {/* Company */}
              {generatedCL.companyName && (
                <div className="mb-4">
                  <p className="font-semibold">{generatedCL.companyName}</p>
                </div>
              )}

              {/* Greeting */}
              <p className="mb-3">{generatedCL.greeting}</p>

              {/* Body */}
              <p className="mb-3 leading-relaxed">{generatedCL.opening}</p>
              <p className="mb-3 leading-relaxed">{generatedCL.body}</p>
              <p className="mb-4 leading-relaxed">{generatedCL.closing}</p>

              {/* Signature */}
              <p className="whitespace-pre-wrap">{generatedCL.signature}</p>

              {!isPro && <Watermark />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
