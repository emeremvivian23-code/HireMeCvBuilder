'use client';

import { useState, useEffect } from 'react';
import { Briefcase, Copy, Check, Loader2, Sparkles, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UsageCounter } from '@/components/UsageCounter';
import { ScoreCard } from '@/components/ScoreCard';
import { Watermark } from '@/components/Watermark';
import { useApp } from '@/lib/context';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { usePdfDownload } from '@/hooks/use-pdf-download';
import { generateResume } from '@/lib/generators';
import { scoreResume } from '@/lib/scores';
import { resumeToText } from '@/lib/formatters';
import { recordActivity } from '@/lib/activities';
import {
  incrementUsage,
  saveGeneratedResume,
  getGeneratedResume,
  getRemainingGenerations,
} from '@/lib/storage';
import { GeneratedResume, ResumeStrengthScore, ResumeFormData } from '@/lib/types';

export function ResumeTab() {
  const { cvForm, isPro, hydrated } = useApp();
  const { copied, copy } = useCopyToClipboard();
  const [activityId, setActivityId] = useState<string | undefined>(undefined);
  const { downloading, download } = usePdfDownload({ activityId });
  const [resumeData, setResumeData] = useState<ResumeFormData>({
    targetCountry: '',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResume, setGeneratedResume] = useState<GeneratedResume | null>(null);
  const [score, setScore] = useState<ResumeStrengthScore | null>(null);
  const [canGenerate, setCanGenerate] = useState(true);

  useEffect(() => {
    const saved = getGeneratedResume<GeneratedResume>();
    if (saved) setGeneratedResume(saved);
    if (typeof window !== 'undefined') {
      setCanGenerate(getRemainingGenerations('resume') > 0);
    }
  }, [hydrated, isPro]);

  const handleGenerate = async () => {
    if (isGenerating) return;
    if (!cvForm.fullName.trim() || !cvForm.relevantSkills.trim()) {
      alert('Please fill in your CV information first (at least Full Name and Relevant Skills), then come back to generate your resume.');
      return;
    }

    if (!isPro && !canGenerate) return;

    setIsGenerating(true);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const resume = generateResume(cvForm, resumeData);
    const rScore = scoreResume(cvForm, resume);
    setGeneratedResume(resume);
    setScore(rScore);
    saveGeneratedResume(resume);
    recordActivity('resume', resume.fullName, resume).then(setActivityId);

    if (!isPro) {
      incrementUsage('resume');
      setCanGenerate(getRemainingGenerations('resume') > 0);
    }

    setIsGenerating(false);
    setTimeout(() => {
      const preview = document.getElementById('resume-preview');
      if (preview) preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleCopy = async () => {
    if (!generatedResume) return;
    const success = await copy(resumeToText(generatedResume));
    if (!success) {
      alert('Could not copy to clipboard. Please try selecting and copying manually.');
    }
  };

  const handleDownload = async () => {
    if (!generatedResume) return;
    await download('resume-doc', `${generatedResume.fullName || 'Resume'} - HireMeCV`);
  };

  const hasCVInfo = cvForm.fullName.trim().length > 0;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-orange" />
          <h2 className="text-xl font-bold text-navy">RESUME GENERATOR</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Turn your information into a concise, professional, job-focused resume.
        </p>
      </div>

      <UsageCounter tab="resume" />

      {/* Info banner */}
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          {hasCVInfo ? (
            <>
              <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div>
                <p className="text-sm font-semibold text-navy">
                  Your CV information is ready
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  We&apos;ll use your CV details for {cvForm.fullName} ({cvForm.targetJobTitle || 'job title not set'}).
                  You can edit your information in the CV tab and it will update here automatically.
                </p>
              </div>
            </>
          ) : (
            <>
              <Briefcase className="mt-0.5 h-5 w-5 shrink-0 text-orange" />
              <div>
                <p className="text-sm font-semibold text-navy">
                  No CV information yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fill in your details in the CV tab first, or enter them manually there, then come back to generate your resume. Your information is saved automatically.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Summary of CV info */}
      {hasCVInfo && (
        <div className="rounded-2xl border border-border bg-light-gray p-5">
          <h3 className="mb-2 text-sm font-bold text-navy">Your Information (from CV tab)</h3>
          <dl className="space-y-1 text-xs">
            <div className="flex gap-2">
              <dt className="font-semibold text-muted-foreground">Name:</dt>
              <dd className="text-foreground">{cvForm.fullName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-muted-foreground">Target Job:</dt>
              <dd className="text-foreground">{cvForm.targetJobTitle || 'Not set'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-muted-foreground">Experience:</dt>
              <dd className="text-foreground">{cvForm.yearsOfExperience || '0'} year(s)</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-muted-foreground">Skills:</dt>
              <dd className="text-foreground">{cvForm.relevantSkills || 'Not set'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-muted-foreground">Education:</dt>
              <dd className="text-foreground">{cvForm.education || 'Not set'}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Country/style selector */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-navy">
              Target Country / Style (optional)
            </label>
            <Select
              value={resumeData.targetCountry}
              onValueChange={(value) =>
                setResumeData((prev) => ({ ...prev, targetCountry: value as ResumeFormData['targetCountry'] }))
              }
            >
              <SelectTrigger className="h-11 text-base">
                <SelectValue placeholder="Select a country style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="us">United States</SelectItem>
                <SelectItem value="uk">United Kingdom</SelectItem>
                <SelectItem value="international">International</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || (!isPro && !canGenerate) || !hasCVInfo}
            className="w-full bg-orange text-white hover:bg-orange/90 disabled:opacity-50"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generating your resume...
              </>
            ) : !isPro && !canGenerate ? (
              'Free generations used today — Upgrade to Pro'
            ) : !hasCVInfo ? (
              'Fill in CV tab first'
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                GENERATE MY 1-PAGE RESUME
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

      {/* Generated Resume Preview */}
      {generatedResume && (
        <div id="resume-preview" className="space-y-4">
          {score && (
            <ScoreCard
              title="Resume Strength"
              score={score.score}
              suggestions={score.suggestions}
              note="This score is an estimate based on relevance, clarity, completeness, and formatting. It does not guarantee interviews or employment."
            />
          )}

          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-navy">Resume Preview</h3>
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
                      COPY RESUME TEXT
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

            <div id="resume-doc" className="doc-preview rounded-lg border border-border overflow-hidden">
              <div className="border-l-4 border-orange bg-navy px-6 py-4 text-white">
                <h1 className="text-xl font-bold">{generatedResume.fullName}</h1>
                <p className="mt-1 text-xs text-white/80">
                  {generatedResume.contactInfo.phone} | {generatedResume.contactInfo.email} | {generatedResume.contactInfo.location}
                </p>
                {generatedResume.targetJobTitle && (
                  <p className="mt-1 text-xs font-semibold text-orange">
                    {generatedResume.targetJobTitle}
                  </p>
                )}
              </div>

              <div className="px-6 py-4 text-sm text-foreground">
                <section className="mb-3">
                  <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-navy">Summary</h2>
                  <p className="leading-relaxed">{generatedResume.summary}</p>
                </section>

                {generatedResume.skills.length > 0 && (
                  <section className="mb-3">
                    <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-navy">Key Skills</h2>
                    <p className="leading-relaxed">{generatedResume.skills.join(', ')}</p>
                  </section>
                )}

                {generatedResume.experience.trim() && (
                  <section className="mb-3">
                    <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-navy">Experience</h2>
                    <p className="whitespace-pre-wrap leading-relaxed">{generatedResume.experience}</p>
                  </section>
                )}

                {generatedResume.achievements.trim() && (
                  <section className="mb-3">
                    <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-navy">Key Achievements</h2>
                    <p className="whitespace-pre-wrap leading-relaxed">{generatedResume.achievements}</p>
                  </section>
                )}

                {generatedResume.projects.trim() && (
                  <section className="mb-3">
                    <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-navy">Projects & Training</h2>
                    <p className="whitespace-pre-wrap leading-relaxed">{generatedResume.projects}</p>
                  </section>
                )}

                {generatedResume.education.trim() && (
                  <section className="mb-3">
                    <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-navy">Education</h2>
                    <p className="whitespace-pre-wrap leading-relaxed">{generatedResume.education}</p>
                  </section>
                )}

                {generatedResume.certifications.trim() && (
                  <section className="mb-3">
                    <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-navy">Certifications</h2>
                    <p className="whitespace-pre-wrap leading-relaxed">{generatedResume.certifications}</p>
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
