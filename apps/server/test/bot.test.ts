import { describe, expect, it } from 'vitest';
import { COST_COUNTRIES, t } from '@aman/content';
import { DECISIONS, LANGS, type CaseRecord, type Decision, type Lang } from '@aman/types';
import { decisionMessage, followupText } from '../src/bot';
import { costChunks } from '../src/costMessage';
import { buildVoiceCase, type Extraction } from '../src/voice';

const extraction: Extraction = {
  language: 'en',
  unclear: false,
  transcript: 'synthetic transcript',
  englishSummary: 'Synthetic: child has a cough and diarrhea.',
  ageMonths: 24,
  cough: true,
  coughDays: 2,
  fever: true,
  difficultyBreathing: false,
  chestIndrawing: null,
  stridorWhenCalm: null,
  unableToDrinkOrFeed: false,
  vomitsEverything: false,
  convulsions: false,
  unusuallySleepyOrUnconscious: false,
  diarrhea: true,
};

/** A case with a chosen outcome and reasons; the decision itself comes from the protocol elsewhere. */
function caseWith(lang: Lang, outcome: Decision, reasonKeys: string[], needsHumanReview = true): CaseRecord {
  const c = buildVoiceCase({ ...extraction, language: lang });
  return { ...c, decision: { ...c.decision, outcome, reasonKeys }, needsHumanReview };
}

const count = (text: string, part: string) => text.split(part).length - 1;

const reasonSets = [
  ['missing_critical_data'],
  ['fever_needs_chart_assessment', 'missing_critical_data'],
  ['fever_needs_chart_assessment', 'diarrhea_needs_dehydration_check', 'missing_critical_data'],
  ['danger_sign_convulsions'],
  [],
];

describe('Telegram decision message', () => {
  it('says the decision once and leaves out the repeated card title and draft line', () => {
    for (const lang of LANGS) for (const outcome of DECISIONS) for (const reasons of [...reasonSets, ['no_concerning_signs']]) {
      // HOME only ever comes with the no-concerning-signs reason; the missing-data reason rules HOME out.
      if ((outcome === 'HOME') !== (reasons[0] === 'no_concerning_signs')) continue;
      const text = decisionMessage(caseWith(lang, outcome, reasons));
      expect(count(text.toLowerCase(), t(lang, `decision_${outcome}`).toLowerCase()), `${lang} ${outcome}`).toBe(1);
      expect(text.startsWith(`${t(lang, `decision_${outcome}`)}\n`)).toBe(true);
      if (t(lang, `card_title_${outcome}`) !== t(lang, `decision_${outcome}`)) expect(text).not.toContain(t(lang, `card_title_${outcome}`));
      expect(text).not.toContain(t(lang, 'draft_translation'));
      expect(count(text, t(lang, 'banner'))).toBe(1);
    }
  });

  it('never sends both review messages, and still asks for review when the missing-data reason is not shown', () => {
    for (const lang of LANGS) for (const outcome of DECISIONS) for (const reasons of reasonSets) {
      const text = decisionMessage(caseWith(lang, outcome, reasons));
      const missing = text.includes(t(lang, 'reason_missing_critical_data'));
      const review = text.includes(t(lang, 'needs_review'));
      expect(missing && review, `${lang} ${outcome} ${reasons}`).toBe(false);
      expect(missing || review).toBe(true);
    }
    expect(decisionMessage(caseWith('en', 'REFER_SOON', ['fever_needs_chart_assessment'], false))).not.toContain(t('en', 'needs_review'));
  });

  it('shows at most 2 reasons and at most 4 return signs', () => {
    const text = decisionMessage(caseWith('en', 'REFER_SOON', reasonSets[2]));
    expect(text).toContain(t('en', 'reason_fever_needs_chart_assessment'));
    expect(text).toContain(t('en', 'reason_diarrhea_needs_dehydration_check'));
    expect(text).not.toContain(t('en', 'reason_missing_critical_data'));
    expect(text).toContain(t('en', 'needs_review'));
    expect(text).toContain(t('en', 'card_return_title'));
    expect(count(text, '• ')).toBe(2 + 4);
  });

  it('has no home-care line for REFER_SOON or GO_NOW', () => {
    for (const lang of LANGS) {
      for (const outcome of ['REFER_SOON', 'GO_NOW'] as const) {
        const text = decisionMessage(caseWith(lang, outcome, ['missing_critical_data']));
        expect(text, `${lang} ${outcome}`).not.toContain(t(lang, 'card_home_care'));
        expect(text).toContain(t(lang, 'card_medicine'));
      }
      expect(decisionMessage(caseWith(lang, 'GO_NOW', ['danger_sign_convulsions']))).toContain(t(lang, 'card_go_now_travel'));
    }
  });

  it('uses no Markdown formatting characters', () => {
    for (const lang of LANGS) for (const outcome of DECISIONS) expect(decisionMessage(caseWith(lang, outcome, reasonSets[1]))).not.toMatch(/[*_`]/);
  });
});

describe('Telegram follow-up question', () => {
  it('explains the follow-up only the first time', () => {
    for (const lang of LANGS) {
      expect(followupText(lang, 'ageMonths', true)).toBe(`${t(lang, 'voice_followup')}\n${t(lang, 'age_title')}`);
      expect(followupText(lang, 'fever', false)).toBe(t(lang, 'q_fever'));
      expect(followupText(lang, 'fever', false)).not.toContain(t(lang, 'voice_followup'));
    }
  });
});

describe('Telegram cost message', () => {
  it('does not repeat the costs title, the decision line, the floor line or never-delay', () => {
    for (const outcome of DECISIONS) for (const country of COST_COUNTRIES) for (const lang of LANGS) {
      const text = costChunks(outcome, country, lang).join('\n\n');
      expect(text).not.toContain(t(lang, 'costs_title'));
      expect(text).not.toContain(t(lang, `decision_${outcome}`));
      expect(count(text, t(lang, `costs_floor_${outcome}`)), `${outcome} ${country} ${lang}`).toBe(1);
      expect(count(text, t(lang, 'costs_never_delay'))).toBe(outcome === 'GO_NOW' ? 1 : 0);
    }
  });
});
