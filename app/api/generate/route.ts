import { NextRequest, NextResponse } from 'next/server';

type SummaryStyle = 'corporate' | 'creative' | 'tech';

interface SummaryRequest {
  type: 'summary';
  style: SummaryStyle;
  data: {
    fullName: string;
    targetJobTitle: string;
    yearsOfExperience: string;
    relevantSkills: string;
    workDescription: string;
    threeThingsDoneWell: string;
    education: string;
  };
}

const STYLE_PROMPTS: Record<SummaryStyle, string> = {
  corporate:
    'Write a polished, formal professional summary suitable for a corporate environment. Emphasize reliability, stakeholder collaboration, and measurable business impact. Tone: confident, professional, third-person appropriate for a CV. 3-4 sentences.',
  creative:
    'Write a vibrant, distinctive professional summary that shows personality and originality while staying professional. Emphasize creative problem-solving, passion, and unique value. Tone: engaging, energetic, memorable. 3-4 sentences.',
  tech:
    'Write a technical professional summary for a tech/engineering role. Emphasize technical depth, systems thinking, shipped products, and engineering impact. Tone: precise, results-oriented, technical. 3-4 sentences.',
};

const SYSTEM_PROMPT =
  'You are an expert CV writer. Rewrite the user\'s professional summary in the requested style, based on their CV details. Return ONLY the summary paragraph — no headings, no preamble, no markdown. Keep it to 3-4 sentences and tailored to the target job title.';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body?.type || !body?.data) {
      return NextResponse.json(
        { error: 'Missing required fields: type and data.' },
        { status: 400 }
      );
    }

    if (body.type === 'summary') {
      return handleSummaryUpgrade(body as SummaryRequest);
    }

    return NextResponse.json({ error: 'Unknown request type.' }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

async function handleSummaryUpgrade(req: SummaryRequest) {
  const style = req.style;
  if (style !== 'corporate' && style !== 'creative' && style !== 'tech') {
    return NextResponse.json(
      { error: 'Invalid style. Choose corporate, creative, or tech.' },
      { status: 400 }
    );
  }

  const aiApiKey = process.env.AI_API_KEY;
  if (!aiApiKey) {
    // No AI key configured yet — return a deterministic placeholder so the
    // feature is demonstrable. When AI_API_KEY is set, real generation runs.
    return NextResponse.json({
      demo: true,
      summary: demoSummary(req, style),
      style,
    });
  }

  const userPrompt = buildUserPrompt(req, style);

  try {
    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 220,
      }),
    });

    if (!completion.ok) {
      const text = await completion.text();
      return NextResponse.json(
        { error: `AI service error (${completion.status}). ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await completion.json();
    const summary: string | undefined = data?.choices?.[0]?.message?.content?.trim();
    if (!summary) {
      return NextResponse.json(
        { error: 'The AI service returned an empty response. Please try again.' },
        { status: 502 }
      );
    }
    return NextResponse.json({ summary, style });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI request failed.' },
      { status: 502 }
    );
  }
}

function buildUserPrompt(req: SummaryRequest, style: SummaryStyle): string {
  const d = req.data;
  const skills = d.relevantSkills || 'relevant skills';
  return [
    `Target job title: ${d.targetJobTitle || 'not specified'}`,
    `Years of experience: ${d.yearsOfExperience || '0'}`,
    `Skills: ${skills}`,
    `Work description: ${d.workDescription || 'not provided'}`,
    `Key achievements: ${d.threeThingsDoneWell || 'not provided'}`,
    `Education: ${d.education || 'not provided'}`,
    '',
    `Style instruction: ${STYLE_PROMPTS[style]}`,
  ].join('\n');
}

function demoSummary(req: SummaryRequest, style: SummaryStyle): string {
  const d = req.data;
  const name = d.fullName || 'the candidate';
  const job = d.targetJobTitle || 'the role';
  const skills = (d.relevantSkills || '').split(/[,;]/)[0]?.trim() || 'key skills';
  const yrs = d.yearsOfExperience || '0';

  if (style === 'corporate') {
    return `${name} is a dedicated ${job} with ${yrs} year(s) of experience and proven strengths in ${skills}. Recognized for delivering consistent, high-quality results and collaborating effectively across teams to support organizational objectives. Brings a disciplined, stakeholder-focused approach to every engagement, with a track record of turning requirements into reliable outcomes.`;
  }
  if (style === 'creative') {
    return `${name} is a ${job} who turns ideas into impact, blending ${skills} with a fresh, human-centered perspective. With ${yrs} year(s) of hands-on experience, they thrive where creativity meets structure — crafting work that is as memorable as it is effective. They bring energy, curiosity, and a bias for bold, thoughtful solutions to every team they join.`;
  }
  return `${name} is a ${job} with ${yrs} year(s) of experience building and shipping with ${skills}. Comfortable across the full delivery lifecycle — from design and implementation to testing and production — with a focus on clean, maintainable systems and measurable engineering outcomes. Proven at translating complex requirements into reliable, well-tested solutions.`;
}
