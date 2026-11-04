import {
  CVFormData,
  CVReadinessScore,
  ResumeStrengthScore,
  JobMatchScore,
  GeneratedCV,
  GeneratedResume,
  GeneratedCoverLetter,
  CoverLetterFormData,
} from './types';

function splitSkills(skills: string): string[] {
  return skills
    .split(/[,;•\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function scoreCV(data: CVFormData, _generated: GeneratedCV): CVReadinessScore {
  let score = 0;
  const suggestions: string[] = [];

  // Completeness (40 points)
  const fields = [
    { key: 'fullName', label: 'Full Name', val: data.fullName },
    { key: 'phone', label: 'Phone Number', val: data.phone },
    { key: 'email', label: 'Email Address', val: data.email },
    { key: 'location', label: 'Location', val: data.location },
    { key: 'targetJobTitle', label: 'Target Job Title', val: data.targetJobTitle },
    { key: 'education', label: 'Education', val: data.education },
    { key: 'workDescription', label: 'Work Description', val: data.workDescription },
    { key: 'threeThingsDoneWell', label: 'Three Things Done Well', val: data.threeThingsDoneWell },
    { key: 'relevantSkills', label: 'Relevant Skills', val: data.relevantSkills },
  ];
  const filled = fields.filter((f) => f.val.trim().length > 0).length;
  score += Math.round((filled / fields.length) * 40);
  const missing = fields.filter((f) => !f.val.trim()).map((f) => f.label);
  if (missing.length > 0) {
    suggestions.push(`Consider filling in: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' and more' : ''}.`);
  }

  // Relevant skills (15 points)
  const skills = splitSkills(data.relevantSkills);
  if (skills.length >= 5) score += 15;
  else if (skills.length >= 3) score += 10;
  else if (skills.length >= 1) score += 5;
  else suggestions.push('Add at least 3-5 relevant skills to improve your score.');

  // Job keywords (15 points)
  const jobTitle = data.targetJobTitle.trim().toLowerCase();
  if (jobTitle) {
    const allText = [
      data.workDescription,
      data.relevantSkills,
      data.threeThingsDoneWell,
      data.education,
    ].join(' ').toLowerCase();
    const jobWords = jobTitle.split(/\s+/).filter((w) => w.length > 3);
    const matched = jobWords.filter((w) => allText.includes(w));
    if (jobWords.length > 0) {
      score += Math.round((matched.length / jobWords.length) * 15);
      if (matched.length < jobWords.length) {
        suggestions.push(`Include more keywords related to "${data.targetJobTitle}" in your descriptions.`);
      }
    }
  } else {
    suggestions.push('Specify a target job title for better keyword matching.');
  }

  // Professional summary (15 points) - based on work description quality
  const descWords = data.workDescription.trim().split(/\s+/).filter(Boolean).length;
  if (descWords >= 30) score += 15;
  else if (descWords >= 15) score += 10;
  else if (descWords >= 5) score += 5;
  else suggestions.push('Write 2-3 sentences describing your work to strengthen your summary.');

  // Readability and organization (15 points)
  if (data.threeThingsDoneWell.trim()) score += 5;
  if (data.education.trim()) score += 5;
  if (data.workExperience.trim() || data.workDescription.trim()) score += 5;

  if (suggestions.length === 0) {
    suggestions.push('Your CV looks well-structured. Review it for any final refinements.');
  }

  return { score: Math.min(100, score), suggestions };
}

export function scoreResume(
  data: CVFormData,
  _generated: GeneratedResume
): ResumeStrengthScore {
  let score = 0;
  const suggestions: string[] = [];

  // Relevance (25 points)
  const skills = splitSkills(data.relevantSkills);
  const jobTitle = data.targetJobTitle.trim().toLowerCase();
  if (jobTitle && skills.length > 0) {
    const allText = [data.workDescription, data.relevantSkills].join(' ').toLowerCase();
    const jobWords = jobTitle.split(/\s+/).filter((w) => w.length > 3);
    const matched = jobWords.filter((w) => allText.includes(w));
    if (jobWords.length > 0) {
      score += Math.round((matched.length / jobWords.length) * 25);
    }
  }

  // Clarity (25 points)
  const descWords = data.workDescription.trim().split(/\s+/).filter(Boolean).length;
  if (descWords >= 20) score += 25;
  else if (descWords >= 10) score += 15;
  else if (descWords >= 5) score += 8;
  else suggestions.push('Add a clearer description of your work for a stronger resume.');

  // Completeness (30 points)
  const fields = [data.fullName, data.phone, data.email, data.location, data.education, data.relevantSkills];
  const filled = fields.filter((f) => f.trim().length > 0).length;
  score += Math.round((filled / fields.length) * 30);
  if (filled < fields.length) {
    suggestions.push('Complete all core fields for a higher strength score.');
  }

  // Formatting (20 points)
  if (skills.length >= 4) score += 10;
  else suggestions.push('List at least 4 relevant skills.');
  if (data.threeThingsDoneWell.trim()) score += 10;
  else suggestions.push('Add key achievements to boost your resume strength.');

  if (suggestions.length === 0) {
    suggestions.push('Your resume is well-structured and ready to review.');
  }

  return { score: Math.min(100, score), suggestions };
}

export function scoreCoverLetter(
  data: CoverLetterFormData,
  _generated: GeneratedCoverLetter
): JobMatchScore {
  let score = 0;
  const suggestions: string[] = [];
  const hasJD = data.jobDescription.trim().length > 0;

  // Contact info (15 points)
  const contactFields = [data.fullName, data.email, data.phone, data.location];
  const filledContact = contactFields.filter((f) => f.trim().length > 0).length;
  score += Math.round((filledContact / contactFields.length) * 15);

  // Job + company info (20 points)
  if (data.targetJobTitle.trim()) score += 10;
  else suggestions.push('Specify the target job title.');
  if (data.companyName.trim()) score += 10;
  else suggestions.push('Add the company name for a more tailored letter.');

  // Skills/experience relevance (30 points)
  const skills = splitSkills(data.relevantSkillsOrExperience);
  if (skills.length >= 4) score += 30;
  else if (skills.length >= 2) score += 20;
  else if (skills.length >= 1) score += 10;
  else suggestions.push('List your relevant skills or experience for a better match.');

  // Motivation (15 points)
  if (data.whyYouWantTheRole.trim()) {
    score += 15;
  } else {
    suggestions.push('Explain why you want the role to strengthen your application.');
  }

  // Job description matching (20 points)
  if (hasJD) {
    const jdLower = data.jobDescription.toLowerCase();
    const matchedSkills = skills.filter((s) =>
      jdLower.includes(s.toLowerCase().split(' ')[0])
    );
    score += Math.round((matchedSkills.length / Math.max(skills.length, 1)) * 20);
    if (matchedSkills.length < skills.length) {
      suggestions.push('Highlight more skills that directly match keywords in the job description.');
    }
  } else {
    score += 10;
    suggestions.push('Provide a job description for a more accurate match estimate.');
  }

  if (suggestions.length === 0) {
    suggestions.push('Your cover letter is well-tailored to the job.');
  }

  return {
    score: Math.min(100, score),
    suggestions,
    basedOnJobDescription: hasJD,
  };
}
