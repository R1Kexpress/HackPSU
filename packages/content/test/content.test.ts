import { describe, expect, it } from 'vitest';
import { REASON_KEYS } from '@aman/protocol';
import { caregiverCard, STRINGS } from '../src/index';

describe('bundled content', () => {
  it('every reason key has text in every language', () => {
    for (const lang of ['en', 'ur', 'am'] as const) {
      for (const k of REASON_KEYS) expect(STRINGS[lang][`reason_${k}`], `${lang} ${k}`).toBeTruthy();
    }
  });

  it('every language has every English key', () => {
    for (const lang of ['ur', 'am'] as const) {
      for (const k of Object.keys(STRINGS.en)) expect(STRINGS[lang][k], `${lang} ${k}`).toBeTruthy();
    }
  });

  it('never names a diagnosis or a detected disease', () => {
    const all = JSON.stringify(STRINGS).toLowerCase();
    expect(all).not.toMatch(/pneumonia|detects/);
  });

  it('audio instructions and labels have no English leftovers', () => {
    for (const lang of ['ur', 'am'] as const) {
      for (const key of ['cough_instructions', 'experimental_audio_title', 'experimental_audio_body']) {
        expect(STRINGS[lang][key], `${lang} ${key}`).not.toMatch(/[A-Za-z]/);
      }
    }
  });

  it('every return sign is translated for every outcome and language', () => {
    for (const lang of ['en', 'ur', 'am'] as const) {
      for (const outcome of ['HOME', 'REFER_SOON', 'GO_NOW'] as const) {
        const card = caregiverCard(lang, outcome, { cough: true, diarrhea: true, difficultyBreathing: true });
        expect(card.returnSigns).toHaveLength(7);
        for (const sign of card.returnSigns) {
          expect(sign).toBeTruthy();
          expect(sign).not.toMatch(/^card_return_/);
          if (lang !== 'en') expect(sign).not.toMatch(/[A-Za-z]/);
          if (lang === 'ur') expect(sign).not.toMatch(/^(کو|کے)\s/);
        }
      }
    }
  });

  it('return signs put the general and symptom signs first, and skip "develops a fever" for a child with fever', () => {
    const keys = (lang: 'en' | 'ur' | 'am', s: Parameters<typeof caregiverCard>[2]) => caregiverCard(lang, 'REFER_SOON', s).returnSigns;
    for (const lang of ['en', 'ur', 'am'] as const) {
      const sign = (k: string) => STRINGS[lang][`card_return_${k}`];
      expect(keys(lang, { cough: true, diarrhea: true, difficultyBreathing: false, fever: false }).slice(0, 4)).toEqual(['drink', 'sicker', 'breathing', 'blood'].map(sign));
      expect(keys(lang, { cough: false, diarrhea: false, difficultyBreathing: false, fever: false })).toEqual(['drink', 'sicker', 'fever', 'convulsions'].map(sign));
      const feverish = keys(lang, { cough: true, diarrhea: false, difficultyBreathing: false, fever: true });
      expect(feverish).not.toContain(sign('fever'));
      expect(feverish).toEqual(['drink', 'sicker', 'breathing', 'convulsions'].map(sign));
    }
  });

  it('reasons explain why without repeating the decision line', () => {
    for (const lang of ['en', 'ur', 'am'] as const) {
      // "Not safe for home care" explains a referral, so only the HOME reason is checked against the HOME line.
      const actions = ['REFER_SOON', 'GO_NOW'].map((d) => STRINGS[lang][`decision_${d}`].toLowerCase());
      for (const k of REASON_KEYS) {
        const text = STRINGS[lang][`reason_${k}`];
        for (const d of actions) expect(text.toLowerCase(), `${lang} ${k}`).not.toContain(d);
        expect(text.length, `${lang} ${k}`).toBeGreaterThan(20);
      }
      expect(STRINGS[lang].reason_no_concerning_signs).not.toContain(STRINGS[lang].decision_HOME);
    }
    for (const k of REASON_KEYS) expect(STRINGS.en[`reason_${k}`]).not.toMatch(/hospital now|clinic soon/i);
  });

  it('caregiver card never contains a dose', () => {
    for (const outcome of ['HOME', 'REFER_SOON', 'GO_NOW'] as const) {
      const card = caregiverCard('en', outcome, { cough: true, diarrhea: true, difficultyBreathing: false });
      expect(JSON.stringify(card)).not.toMatch(/\d+\s?(mg|ml|tablet)/i);
    }
  });

  it('caregiver card for non-English is flagged as a draft', () => {
    expect(caregiverCard('ur', 'HOME', { cough: false, diarrhea: false, difficultyBreathing: false }).draft).toBe(true);
  });
});
