import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { evaluate } from '@aman/protocol';
import { LANGS, type CaseRecord, type Lang, type Symptoms } from '@aman/types';

export const SYSTEM_INSTRUCTION = `You extract facts from a caregiver's voice note about a sick child.
The speaker may use Urdu or Amharic (or English). Return ONLY JSON matching the schema.
Rules:
- Do NOT diagnose, advise, or estimate severity.
- Only mark a symptom true if clearly stated; false only if clearly denied; otherwise null.
- Include a faithful transcript in the original language and a plain English summary.
- If the age is stated in years or weeks, convert to months; if not stated, null.
- If the audio is unclear or unrelated, set "unclear": true.
Fields: language ("ur" | "am" | "en" | "other"), unclear, transcript, englishSummary, ageMonths,
cough, coughDays, fever, difficultyBreathing, chestIndrawing, stridorWhenCalm, unableToDrinkOrFeed,
vomitsEverything, convulsions, unusuallySleepyOrUnconscious, diarrhea.`;

const nb = z.boolean().nullable();
export const ExtractionSchema = z.object({
  language: z.enum(['ur', 'am', 'en', 'other']),
  unclear: z.boolean(),
  transcript: z.string().max(8000),
  englishSummary: z.string().max(4000),
  ageMonths: z.number().min(0).max(240).nullable(),
  cough: nb,
  coughDays: z.number().int().min(0).max(365).nullable(),
  fever: nb,
  difficultyBreathing: nb,
  chestIndrawing: nb,
  stridorWhenCalm: nb,
  unableToDrinkOrFeed: nb,
  vomitsEverything: nb,
  convulsions: nb,
  unusuallySleepyOrUnconscious: nb,
  diarrhea: nb,
});
export type Extraction = z.infer<typeof ExtractionSchema>;

const boolOrNull = { type: ['boolean', 'null'] };
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    language: { type: 'string', enum: ['ur', 'am', 'en', 'other'] },
    unclear: { type: 'boolean' },
    transcript: { type: 'string' },
    englishSummary: { type: 'string' },
    ageMonths: { type: ['number', 'null'] },
    cough: boolOrNull,
    coughDays: { type: ['integer', 'null'] },
    fever: boolOrNull,
    difficultyBreathing: boolOrNull,
    chestIndrawing: boolOrNull,
    stridorWhenCalm: boolOrNull,
    unableToDrinkOrFeed: boolOrNull,
    vomitsEverything: boolOrNull,
    convulsions: boolOrNull,
    unusuallySleepyOrUnconscious: boolOrNull,
    diarrhea: boolOrNull,
  },
  required: Object.keys(ExtractionSchema.shape),
};

export type Extractor = (audio: Buffer, mimeType: string) => Promise<Extraction>;

export class VoiceUnavailableError extends Error {}

export function geminiExtractor(apiKey: string | undefined, model: string): Extractor {
  return async (audio, mimeType) => {
    if (!apiKey) throw new VoiceUnavailableError('GEMINI_API_KEY is not set, so voice-note extraction is unavailable.');
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType, data: audio.toString('base64') } }, { text: 'Extract the facts from this voice note.' }],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
        temperature: 0,
      },
    });
    return ExtractionSchema.parse(JSON.parse(res.text ?? '{}'));
  };
}

/** Fields a family can answer by button. Breath rate, chest indrawing and stridor need a trained observer, so they stay missing and block HOME. */
export const VOICE_FOLLOWUP_FIELDS = [
  'ageMonths',
  'unableToDrinkOrFeed',
  'vomitsEverything',
  'convulsions',
  'unusuallySleepyOrUnconscious',
  'difficultyBreathing',
  'cough',
  'fever',
  'diarrhea',
] as const;
export type FollowupField = (typeof VOICE_FOLLOWUP_FIELDS)[number];

export function caseLanguage(e: Extraction, fallback: Lang = 'en'): Lang {
  return (LANGS as readonly string[]).includes(e.language) ? (e.language as Lang) : fallback;
}

/**
 * Every voice-note case goes through here. Fields only a trained observer can check are forced
 * unknown whatever the extraction or a follow-up says, and the outcome is floored at REFER_SOON
 * with human review, so a voice note never ends in HOME even if the protocol config changes.
 */
function decide(c: Omit<CaseRecord, 'decision' | 'missingFields' | 'needsHumanReview'>, forceReview: boolean): CaseRecord {
  const symptoms: Symptoms = { ...c.symptoms, chestIndrawing: null, stridorWhenCalm: null };
  const d = evaluate({ patient: c.patient, symptoms, breathRatePerMin: null });
  const floored = d.outcome === 'HOME';
  return {
    ...c,
    symptoms,
    breathRatePerMin: null,
    decision: {
      outcome: floored ? 'REFER_SOON' : d.outcome,
      reasonKeys: floored ? ['missing_critical_data'] : d.reasonKeys,
      protocolVersion: d.protocolVersion,
      audioEscalated: d.audioEscalated,
    },
    missingFields: d.missingFields,
    needsHumanReview: true,
  };
}

export function buildVoiceCase(e: Extraction, fallbackLang: Lang = 'en'): CaseRecord {
  const unsupported = e.language === 'other';
  const symptoms: Symptoms = {
    cough: e.cough,
    coughDays: e.coughDays,
    fever: e.fever,
    difficultyBreathing: e.difficultyBreathing,
    chestIndrawing: null,
    stridorWhenCalm: null,
    unableToDrinkOrFeed: e.unableToDrinkOrFeed,
    vomitsEverything: e.vomitsEverything,
    convulsions: e.convulsions,
    unusuallySleepyOrUnconscious: e.unusuallySleepyOrUnconscious,
    diarrhea: e.diarrhea,
  };
  return decide(
    {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      source: 'voice_note',
      language: caseLanguage(e, fallbackLang),
      patient: { ageMonths: e.ageMonths },
      symptoms,
      breathRatePerMin: null,
      summary: {
        english: (e.unclear || unsupported ? '[Unclear or unsupported voice note; human review required] ' : '') + e.englishSummary,
        transcript: e.transcript,
      },
      status: 'new',
    },
    e.unclear || unsupported,
  );
}

export function nextFollowup(c: CaseRecord): FollowupField | null {
  for (const f of VOICE_FOLLOWUP_FIELDS) {
    const v = f === 'ageMonths' ? c.patient.ageMonths : c.symptoms[f];
    if (v === null) return f;
  }
  return null;
}

export const FollowupAnswerSchema = z.object({
  field: z.enum(VOICE_FOLLOWUP_FIELDS),
  value: z.union([z.boolean(), z.number().min(0).max(240)]),
});

export function applyFollowup(c: CaseRecord, field: FollowupField, value: boolean | number): CaseRecord {
  const next: CaseRecord = structuredClone(c);
  if (field === 'ageMonths') {
    if (typeof value !== 'number') throw new Error('ageMonths needs a number');
    next.patient = { ageMonths: value, ageApproximate: true };
  } else {
    if (typeof value !== 'boolean') throw new Error(`${field} needs yes or no`);
    next.symptoms[field] = value;
  }
  const unclear = c.summary.english.startsWith('[Unclear');
  const { decision: _d, missingFields: _m, needsHumanReview: _n, ...rest } = next;
  return decide(rest, unclear);
}
