import {
  GeneratedCV,
  GeneratedResume,
  GeneratedCoverLetter,
} from './types';

export function cvToText(cv: GeneratedCV): string {
  const lines: string[] = [];
  lines.push(cv.fullName.toUpperCase());
  lines.push(`${cv.contactInfo.phone} | ${cv.contactInfo.email} | ${cv.contactInfo.location}`);
  lines.push('');
  lines.push('PROFESSIONAL SUMMARY');
  lines.push(cv.professionalSummary);
  lines.push('');
  if (cv.coreSkills.length > 0) {
    lines.push('CORE SKILLS');
    lines.push(cv.coreSkills.join(', '));
    lines.push('');
  }
  if (cv.experience.trim()) {
    lines.push('PROFESSIONAL EXPERIENCE');
    lines.push(cv.experience);
    lines.push('');
  }
  if (cv.projects.trim()) {
    lines.push('PROJECTS, TRAINING, OR VOLUNTEERING');
    lines.push(cv.projects);
    lines.push('');
  }
  if (cv.threeThingsDoneWell.trim()) {
    lines.push('KEY ACHIEVEMENTS');
    lines.push(cv.threeThingsDoneWell);
    lines.push('');
  }
  if (cv.education.trim()) {
    lines.push('EDUCATION');
    lines.push(cv.education);
    lines.push('');
  }
  if (cv.certifications.trim()) {
    lines.push('CERTIFICATIONS');
    lines.push(cv.certifications);
    lines.push('');
  }
  return lines.join('\n');
}

export function resumeToText(r: GeneratedResume): string {
  const lines: string[] = [];
  lines.push(r.fullName.toUpperCase());
  lines.push(`${r.contactInfo.phone} | ${r.contactInfo.email} | ${r.contactInfo.location}`);
  lines.push('');
  lines.push('PROFESSIONAL SUMMARY');
  lines.push(r.summary);
  lines.push('');
  if (r.skills.length > 0) {
    lines.push('KEY SKILLS');
    lines.push(r.skills.join(', '));
    lines.push('');
  }
  if (r.experience.trim()) {
    lines.push('EXPERIENCE');
    lines.push(r.experience);
    lines.push('');
  }
  if (r.achievements.trim()) {
    lines.push('KEY ACHIEVEMENTS');
    lines.push(r.achievements);
    lines.push('');
  }
  if (r.projects.trim()) {
    lines.push('PROJECTS & TRAINING');
    lines.push(r.projects);
    lines.push('');
  }
  if (r.education.trim()) {
    lines.push('EDUCATION');
    lines.push(r.education);
    lines.push('');
  }
  if (r.certifications.trim()) {
    lines.push('CERTIFICATIONS');
    lines.push(r.certifications);
    lines.push('');
  }
  return lines.join('\n');
}

export function coverLetterToText(cl: GeneratedCoverLetter): string {
  const lines: string[] = [];
  lines.push(cl.fullName);
  lines.push(cl.contactInfo.email);
  lines.push(cl.contactInfo.phone);
  lines.push(cl.contactInfo.location);
  lines.push('');
  lines.push(cl.date);
  lines.push('');
  if (cl.companyName.trim()) {
    lines.push(cl.companyName);
    lines.push('');
  }
  lines.push(cl.greeting);
  lines.push('');
  lines.push(cl.opening);
  lines.push('');
  lines.push(cl.body);
  lines.push('');
  lines.push(cl.closing);
  lines.push('');
  lines.push(cl.signature);
  return lines.join('\n');
}
