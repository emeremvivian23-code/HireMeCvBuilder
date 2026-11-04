import {
  CVFormData,
  GeneratedCV,
  ResumeFormData,
  GeneratedResume,
  CoverLetterFormData,
  GeneratedCoverLetter,
} from './types';

function splitSkills(skills: string): string[] {
  return skills
    .split(/[,;•\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitSentencesOrLines(text: string): string[] {
  const lines = text
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (lines.length > 1) return lines;
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function generateCV(data: CVFormData): GeneratedCV {
  const skills = splitSkills(data.relevantSkills);
  const hasExperience = data.workExperience.trim().length > 0;
  const isBeginner = !hasExperience || data.yearsOfExperience === '0';

  let summary: string;
  if (isBeginner) {
    summary = `Motivated and detail-oriented ${data.targetJobTitle} with a strong foundation in ${
      skills.slice(0, 3).join(', ') || 'relevant skills'
    }. Seeking to leverage genuine education, training, and transferable skills to contribute effectively in a professional environment. Eager to learn, grow, and add value from day one.`;
  } else {
    summary = `Dedicated ${data.targetJobTitle} with ${data.yearsOfExperience} year(s) of genuine experience and expertise in ${
      skills.slice(0, 3).join(', ') || 'key areas'
    }. Committed to delivering quality results and contributing to organizational goals through proven skills and professional experience.`;
  }

  const projects = data.workExperience.trim().length > 0 ? data.workExperience : '';

  return {
    fullName: data.fullName,
    contactInfo: {
      phone: data.phone,
      email: data.email,
      location: data.location,
    },
    targetJobTitle: data.targetJobTitle,
    professionalSummary: summary,
    coreSkills: skills,
    experience: data.workDescription,
    projects,
    education: data.education,
    certifications: data.certifications,
    threeThingsDoneWell: data.threeThingsDoneWell,
  };
}

export function generateResume(
  cvData: CVFormData,
  resumeData: ResumeFormData
): GeneratedResume {
  const skills = splitSkills(cvData.relevantSkills);
  const hasExperience = cvData.workExperience.trim().length > 0;
  const isBeginner = !hasExperience || cvData.yearsOfExperience === '0';

  let summary: string;
  const countryNote =
    resumeData.targetCountry === 'us'
      ? ' (US-style resume)'
      : resumeData.targetCountry === 'uk'
      ? ' (UK-style CV)'
      : '';

  if (isBeginner) {
    summary = `Results-focused ${cvData.targetJobTitle} candidate${countryNote} with strengths in ${
      skills.slice(0, 3).join(', ') || 'key areas'
    }. Bringing genuine education, hands-on projects, and transferable skills to deliver real value.`;
  } else {
    summary = `Professional ${cvData.targetJobTitle}${countryNote} with ${cvData.yearsOfExperience} year(s) of experience. Skilled in ${
      skills.slice(0, 3).join(', ') || 'core competencies'
    }. Focused on delivering measurable results and supporting team objectives.`;
  }

  const experienceLines = splitSentencesOrLines(cvData.workDescription);
  const achievements = cvData.threeThingsDoneWell.trim()
    ? splitSentencesOrLines(cvData.threeThingsDoneWell)
    : [];

  return {
    fullName: cvData.fullName,
    contactInfo: {
      phone: cvData.phone,
      email: cvData.email,
      location: cvData.location,
    },
    targetJobTitle: cvData.targetJobTitle,
    summary,
    skills,
    experience: experienceLines.join('\n'),
    projects: cvData.workExperience,
    education: cvData.education,
    certifications: cvData.certifications,
    achievements: achievements.join('\n'),
  };
}

export function generateCoverLetter(
  data: CoverLetterFormData,
  cvData: CVFormData | null
): GeneratedCoverLetter {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const skills = data.relevantSkillsOrExperience.trim()
    ? splitSkills(data.relevantSkillsOrExperience)
    : cvData
    ? splitSkills(cvData.relevantSkills)
    : [];

  const greeting = data.hiringManagerName.trim()
    ? `Dear ${data.hiringManagerName},`
    : `Dear Hiring Manager,`;

  const opening = `I am writing to express my sincere interest in the ${data.targetJobTitle} position at ${data.companyName}. The opportunity to contribute my skills and dedication to your team is one I would welcome with great enthusiasm.`;

  const skillsText = skills.slice(0, 4).join(', ');
  let body: string;
  if (data.relevantSkillsOrExperience.trim()) {
    body = `Through my genuine experience and training, I have developed strong capabilities in ${skillsText}. ${
      data.whyYouWantTheRole.trim()
        ? data.whyYouWantTheRole
        : `I am confident that my background aligns well with the requirements of this role at ${data.companyName}.`
    } I am eager to bring my commitment and skills to your organization and contribute meaningfully to your team's success.`;
  } else if (cvData && cvData.workDescription.trim()) {
    body = `My background includes genuine experience in ${skillsText}. ${
      data.whyYouWantTheRole.trim()
        ? data.whyYouWantTheRole
        : `I believe my skills and experience make me a strong candidate for this position at ${data.companyName}.`
    } I am ready to contribute to your team and grow professionally within your organization.`;
  } else {
    body = `While I am early in my professional journey, I have built a solid foundation through genuine education, training, and transferable skills in ${skillsText}. ${
      data.whyYouWantTheRole.trim()
        ? data.whyYouWantTheRole
        : `I am eager to begin my career with ${data.companyName} and contribute with dedication and a strong willingness to learn.`
    } I am confident that my motivation and readiness to grow will make me a valuable addition to your team.`;
  }

  if (data.jobDescription.trim()) {
    const jdKeywords = extractKeywordsFromJobDescription(data.jobDescription);
    const matchedSkills = skills.filter((s) =>
      jdKeywords.some(
        (k) => s.toLowerCase().includes(k) || k.includes(s.toLowerCase())
      )
    );
    if (matchedSkills.length > 0) {
      body += ` Based on the job description provided, I note that my experience in ${matchedSkills.slice(0, 3).join(', ')} directly aligns with your requirements.`;
    }
  }

  const closing = `Thank you for considering my application. I would welcome the opportunity to discuss how my skills and background can contribute to ${data.companyName}. I look forward to hearing from you.`;

  const signature = `Sincerely,\n${data.fullName}`;

  return {
    fullName: data.fullName,
    contactInfo: {
      email: data.email,
      phone: data.phone,
      location: data.location,
    },
    date: today,
    companyName: data.companyName,
    hiringManagerName: data.hiringManagerName,
    greeting,
    opening,
    body,
    closing,
    signature,
  };
}

function extractKeywordsFromJobDescription(jd: string): string[] {
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'you', 'are', 'our', 'will', 'have', 'this',
    'that', 'from', 'your', 'all', 'but', 'not', 'can', 'who', 'they', 'his',
    'her', 'she', 'him', 'has', 'was', 'were', 'been', 'being', 'into', 'about',
    'their', 'them', 'these', 'those', 'what', 'which', 'when', 'where', 'why',
    'how', 'each', 'both', 'more', 'most', 'other', 'some', 'such', 'only', 'own',
    'same', 'than', 'too', 'very', 'just', 'should', 'now', 'also', 'any', 'job',
    'role', 'position', 'candidate', 'applicant', 'must', 'plus', 'etc', 'may',
    'team', 'work', 'experience', 'skills', 'ability', 'strong', 'including',
    'required', 'preferred', 'qualifications', 'responsibilities', 'company',
  ]);
  const words = jd
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map((e) => e[0]);
}
