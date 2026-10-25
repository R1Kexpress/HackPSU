import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { COST_COUNTRIES, costPlan, formatHours, formatMoney, t, type CareEntry } from '@aman/content';
import { DECISIONS, LANGS, type Decision } from '@aman/types';
import { chunkBlocks, costCallback, costChunks, costMessage, COST_CHUNK_LIMIT, planMessage } from '../src/costMessage';

const every = (fn: (outcome: Decision, country: (typeof COST_COUNTRIES)[number], lang: (typeof LANGS)[number], text: string) => void) => {
  for (const outcome of DECISIONS) for (const country of COST_COUNTRIES) for (const lang of LANGS) fn(outcome, country, lang, costChunks(outcome, country, lang).join('\n\n'));
};

const count = (text: string, s: string) => text.split(s).length - 1;

describe('Telegram cost message', () => {
  it('GO_NOW is at most 4 blocks: go now once, how to get there, one cost line for the recommended hospital, disclaimer', () => {
    for (const country of COST_COUNTRIES) {
      for (const lang of LANGS) {
        const plan = costPlan('GO_NOW', country);
        const text = costChunks('GO_NOW', country, lang).join('\n\n');
        const blocks = text.split('\n\n');
        expect(blocks.length).toBeLessThanOrEqual(4);
        expect(count(text, t(lang, 'costs_floor_GO_NOW'))).toBe(1);
        for (const k of ['costs_never_delay', 'costs_no_ambulance', 'costs_recommended', 'costs_below_floor', 'costs_emergency_body']) expect(text).not.toContain(t(lang, k));
        expect(count(text, t(lang, 'costs_go_fallback'))).toBe(1);
        const free = plan.transport.find((o) => o.price.kind === 'free');
        if (free) expect(blocks[1]).toContain(t(lang, free.titleKey));
        const rec = plan.care.find((e) => e.option.id === plan.recommendedId)!;
        expect(rec.meetsFloor).toBe(true);
        expect(blocks[2].startsWith(`${t(lang, rec.option.titleKey)}: `)).toBe(true);
        // No comparison with any other hospital.
        for (const e of plan.care) if (e !== rec && t(lang, e.option.titleKey) !== t(lang, rec.option.titleKey)) expect(text).not.toContain(t(lang, e.option.titleKey));
      }
    }
  });

  it('REFER_SOON and HOME start with the bottom line and rank care as costPlan does', () => {
    for (const outcome of ['REFER_SOON', 'HOME'] as const) {
      for (const country of COST_COUNTRIES) {
        for (const lang of LANGS) {
          const plan = costPlan(outcome, country);
          const text = costChunks(outcome, country, lang).join('\n\n');
          const rec = plan.care.find((e) => e.option.id === plan.recommendedId)!;
          expect(rec.meetsFloor).toBe(true);
          const first = text.split('\n\n')[0];
          expect(first).not.toContain('\n');
          expect(first).toContain(t(lang, rec.option.titleKey));
          expect(first).toContain(formatMoney(rec.total!.total, rec.total!.currency));
          expect(first).toContain(formatHours(rec.total!.hoursAway, t(lang, 'costs_hours_unit')));
          const ranked = plan.care.filter((e) => e.total).slice(0, 3);
          const lines = text.split('\n').filter((l) => /^\d\. /.test(l));
          expect(lines).toEqual(ranked.map((e, i) => `${i + 1}. ${t(lang, e.option.titleKey)}: ${formatMoney(e.total!.total, e.total!.currency)}`));
          expect(text).not.toContain(t(lang, 'costs_never_delay'));
        }
      }
    }
  });

  it('flags a below-floor option as cheaper but unable to treat the case, never as cheapest', () => {
    for (const country of COST_COUNTRIES) {
      for (const lang of LANGS) {
        const plan = costPlan('REFER_SOON', country);
        const [rec, ...rest] = plan.care;
        const cheap: CareEntry = { ...rest[0], meetsFloor: false, total: { ...rest[0].total!, total: { min: 0, max: 1 } } };
        const pricey: CareEntry = { ...rest[0], meetsFloor: false, total: { ...rest[0].total!, total: { min: 1e6, max: 2e6 } } };
        const text = [planMessage({ ...plan, care: [rec, cheap, pricey] }, lang)].flat().join('\n\n');
        expect(text).toContain(`${formatMoney(cheap.total!.total, cheap.total!.currency)}\n   ${t(lang, 'costs_below_floor_cheaper')}`);
        expect(text).toContain(`${formatMoney(pricey.total!.total, pricey.total!.currency)}\n   ${t(lang, 'costs_below_floor_cannot')}`);
        expect(text).not.toContain(t(lang, 'costs_below_floor'));
        expect(text.split('\n\n')[0]).toContain(t(lang, rec.option.titleKey));
      }
    }
  });

  it('never prints a percentage or the word cheapest', () => {
    every((_o, _c, lang, text) => {
      expect(text).not.toContain('%');
      if (lang === 'en') expect(text.toLowerCase()).not.toContain('cheapest');
    });
  });

  it('ends with the disclaimer, lists at most 2 transport options free first, and emergency contacts when the plan has them', () => {
    every((outcome, country, lang, text) => {
      const plan = costPlan(outcome, country);
      expect(text.trimEnd().endsWith(t(lang, 'costs_disclaimer'))).toBe(true);
      if (outcome === 'GO_NOW') return;
      for (const o of plan.emergencyContacts) expect(text).toContain(t(lang, o.titleKey));
      const shown = plan.transport.filter((o) => text.includes(`• ${t(lang, o.titleKey)}`));
      expect(shown.length).toBe(Math.min(2, plan.transport.length));
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
