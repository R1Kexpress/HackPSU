import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { COST_COUNTRIES, costPlan, t } from '@aman/content';
import { DECISIONS, LANGS, type Decision } from '@aman/types';
import { chunkBlocks, costCallback, costChunks, costMessage, COST_CHUNK_LIMIT } from '../src/costMessage';

const every = (fn: (outcome: Decision, country: (typeof COST_COUNTRIES)[number], lang: (typeof LANGS)[number], text: string) => void) => {
  for (const outcome of DECISIONS) for (const country of COST_COUNTRIES) for (const lang of LANGS) fn(outcome, country, lang, costChunks(outcome, country, lang).join('\n\n'));
};

function recommendedBlock(text: string, lang: (typeof LANGS)[number]): string {
  const start = text.indexOf(`${t(lang, 'costs_recommended')}:`);
  expect(start).toBeGreaterThanOrEqual(0);
  return text.slice(start).split('\n\n')[0];
}

function expectNoBelowFloorRecommendation(outcome: Decision) {
  for (const country of COST_COUNTRIES) {
    for (const lang of LANGS) {
      const plan = costPlan(outcome, country);
      const text = costChunks(outcome, country, lang).join('\n\n');
      const rec = plan.care.find((e) => e.option.id === plan.recommendedId)!;
      expect(rec.meetsFloor).toBe(true);
      const block = recommendedBlock(text, lang);
      expect(block).toContain(t(lang, rec.option.titleKey));
      for (const e of plan.care.filter((x) => !x.meetsFloor)) {
        if (t(lang, e.option.titleKey) !== t(lang, rec.option.titleKey)) expect(block).not.toContain(t(lang, e.option.titleKey));
      }
      expect(text).not.toContain(t(lang, 'costs_below_floor'));
    }
  }
}

describe('Telegram cost message', () => {
  it('GO_NOW says never delay and only recommends a hospital at the right level', () => {
    for (const country of COST_COUNTRIES) {
      for (const lang of LANGS) {
        const text = costChunks('GO_NOW', country, lang).join('\n\n');
        expect(text).toContain(t(lang, 'costs_never_delay'));
        expect(text.split(t(lang, 'costs_never_delay')).length - 1).toBe(1);
        expect(text).toContain(t(lang, 'costs_floor_GO_NOW'));
      }
    }
    expectNoBelowFloorRecommendation('GO_NOW');
  });

  it('REFER_SOON and HOME never recommend a below-floor option', () => {
    expectNoBelowFloorRecommendation('REFER_SOON');
    expectNoBelowFloorRecommendation('HOME');
  });

  it('includes the floor line, the disclaimer, free transport first and emergency contacts when the plan has them', () => {
    every((outcome, country, lang, text) => {
      const plan = costPlan(outcome, country);
      expect(text).toContain(t(lang, plan.floorKey));
      expect(text.trimEnd().endsWith(t(lang, 'costs_disclaimer'))).toBe(true);
      for (const o of plan.emergencyContacts) expect(text).toContain(t(lang, o.titleKey));
      const shown = plan.transport.filter((o) => text.includes(`• ${t(lang, o.titleKey)}`));
      expect(shown.length).toBe(Math.min(3, plan.transport.length));
      const firstPaid = shown.findIndex((o) => o.price.kind !== 'free');
      if (firstPaid >= 0) expect(shown.slice(firstPaid).every((o) => o.price.kind !== 'free')).toBe(true);
    });
  });

  it('uses no Markdown formatting characters', () => {
    every((_o, _c, _l, text) => expect(text).not.toMatch(/[*_`]/));
  });

  it('every country and language gives non-empty text with no missing strings', () => {
    every((outcome, country, lang, text) => {
      expect(text.trim().length, `${outcome} ${country} ${lang}`).toBeGreaterThan(0);
      expect(text).not.toMatch(/\{\w+\}/);
      expect(text).not.toMatch(/\b(costs|opt|country|summary|benefit|see|decision)_[A-Za-z_]+/);
      if (lang !== 'en') expect(text).not.toContain(t('en', 'costs_disclaimer'));
    });
  });

  it('every chunk fits in one Telegram message', () => {
    for (const outcome of DECISIONS) for (const country of COST_COUNTRIES) for (const lang of LANGS) {
      for (const c of costChunks(outcome, country, lang)) expect(c.length).toBeLessThan(4096);
    }
    const r = costMessage('GO_NOW', 'pk_punjab', 'en');
    if (typeof r === 'string') expect(r.length).toBeLessThanOrEqual(COST_CHUNK_LIMIT);
    const long = chunkBlocks(['a'.repeat(3000), 'b'.repeat(3000), `c\n\n${'d'.repeat(9000)}`]);
    expect(long.length).toBeGreaterThan(1);
    for (const c of long) expect(c.length).toBeLessThanOrEqual(COST_CHUNK_LIMIT);
    expect(long.join('').replace(/\n/g, '').length).toBe(3000 + 3000 + 1 + 9000);
  });

  it('callback data for a UUID case id stays under 64 bytes', () => {
    const id = randomUUID();
    for (const code of ['p', 'e', 'x'] as const) {
      const data = costCallback(id, code);
      expect(Buffer.byteLength(data, 'utf8')).toBeLessThan(64);
      expect(data.split('|')).toEqual(['c', id, code]);
    }
  });
});
