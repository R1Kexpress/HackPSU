import { describe, expect, it } from 'vitest';
import { DECISIONS, OUTCOME_RANK, type Decision } from '@aman/types';
import {
  COST_BENEFITS,
  COST_COUNTRIES,
  COST_OPTIONS,
  costPlan,
  costSummary,
  formatMoney,
  formatPrice,
  optionTotal,
  STRINGS,
  t,
  type FamilyFinanceAnswers,
  type Figure,
  type TriAnswer,
} from '../src/index';

const TRI: TriAnswer[] = ['yes', 'no', 'unsure', null];
const EARNINGS: (number | null)[] = [null, 0, 300, 1500, 5000, 1_000_000];
const ALL_ANSWERS: FamilyFinanceAnswers[] = TRI.flatMap((m) => TRI.flatMap((c) => EARNINGS.map((e) => ({ moneyForTransport: m, hasHealthCard: c, dailyEarnings: e }))));
const ids = (list: { id: string }[]) => list.map((o) => o.id);
const careIds = (plan: ReturnType<typeof costPlan>) => plan.care.map((e) => e.option.id);
const everyPlan = (fn: (outcome: Decision, plan: ReturnType<typeof costPlan>, answers: FamilyFinanceAnswers) => void) => {
  for (const outcome of DECISIONS) for (const country of COST_COUNTRIES) for (const answers of ALL_ANSWERS) fn(outcome, costPlan(outcome, country, Object.freeze({ ...answers })), answers);
};
const en = (key: string) => t('en', key);

describe('family cost options', () => {
  it('passes the finished outcome through unchanged for every input', () => {
    everyPlan((outcome, plan) => expect(plan.outcome).toBe(outcome));
  });

  it('the recommended option always meets the floor', () => {
    everyPlan((outcome, plan) => {
      if (plan.recommendedId === null) return;
      const rec = plan.care.find((e) => e.option.id === plan.recommendedId)!;
      expect(rec.meetsFloor).toBe(true);
      expect(OUTCOME_RANK[rec.option.level!]).toBeGreaterThanOrEqual(OUTCOME_RANK[outcome]);
    });
  });

  it('every outcome gets a recommendation', () => {
    everyPlan((_outcome, plan) => expect(plan.recommendedId).not.toBeNull());
  });

  it('below-floor options are flagged, listed last and never recommended', () => {
    everyPlan((outcome, plan) => {
      for (const e of plan.care) expect(e.meetsFloor).toBe(OUTCOME_RANK[e.option.level!] >= OUTCOME_RANK[outcome]);
      const firstBelow = plan.care.findIndex((e) => !e.meetsFloor);
      if (firstBelow >= 0) expect(plan.care.slice(firstBelow).every((e) => !e.meetsFloor)).toBe(true);
      expect(plan.care.filter((e) => !e.meetsFloor).map((e) => e.option.id)).not.toContain(plan.recommendedId);
    });
  });

  it('GO_NOW compares hospitals only, and the summary names the free transport and says never delay to compare', () => {
    everyPlan((outcome, plan) => {
      if (outcome !== 'GO_NOW') return;
      expect(plan.care.every((e) => e.meetsFloor && e.option.level === 'GO_NOW')).toBe(true);
      expect(plan.care.length).toBeGreaterThan(1);
      expect(plan.cheaperBelowFloorId).toBeNull();
      expect(plan.transport.some((o) => o.price.kind === 'free')).toBe(true);
      const s = costSummary(plan, en);
      const free = plan.transport.find((o) => o.price.kind === 'free')!;
      expect(s.startsWith(en('summary_go_now').replace('{a}', en(free.titleKey)))).toBe(true);
      expect(s.endsWith(en('costs_never_delay'))).toBe(true);
      // The decision and the floor line are shown beside the summary, so it does not repeat them.
      expect(s).not.toContain(en('decision_GO_NOW'));
      expect(s).not.toContain(en('costs_floor_GO_NOW'));
    });
  });

  it('private hospitals are offered for GO_NOW in both countries, private clinics never are', () => {
    for (const country of COST_COUNTRIES) {
      const levels = costPlan('GO_NOW', country).care.map((e) => e.option);
      expect(levels.some((o) => o.id.includes('private_hospital'))).toBe(true);
      expect(levels.some((o) => o.level === 'REFER_SOON')).toBe(false);
    }
  });

  it('unlisted fares are never shown as a way to get there, but still count in travel cost', () => {
    everyPlan((_outcome, plan) => expect(plan.transport.every((o) => o.listed !== false)).toBe(true));
    const o = COST_OPTIONS.find((x) => x.id === 'pk_public')!;
    expect(optionTotal(o, 'pk_punjab', null)!.travel.max).toBeGreaterThan(0);
  });

  it('HOME and REFER_SOON keep every ambulance number as an FYI; GO_NOW lists them as the way to get there', () => {
    everyPlan((outcome, plan) => {
      if (outcome === 'GO_NOW') {
        expect(plan.emergencyContacts).toEqual([]);
        expect(plan.transport.length).toBeGreaterThan(0);
        expect(plan.transport.every((o) => o.onlyFor?.includes('GO_NOW'))).toBe(true);
      } else {
        expect(plan.emergencyContacts.length).toBeGreaterThan(0);
        expect(plan.emergencyContacts.every((o) => o.onlyFor?.includes('GO_NOW'))).toBe(true);
      }
    });
    for (const country of COST_COUNTRIES) {
      expect(ids(costPlan('REFER_SOON', country).emergencyContacts).sort()).toEqual(ids(costPlan('GO_NOW', country).transport).sort());
    }
  });

  it('emergency ambulances are only suggested for GO_NOW', () => {
    for (const outcome of ['HOME', 'REFER_SOON'] as Decision[]) {
      for (const country of COST_COUNTRIES) expect(costPlan(outcome, country).transport.some((o) => o.onlyFor)).toBe(false);
    }
  });

  it('finance answers never add or remove options and never change the outcome', () => {
    for (const outcome of DECISIONS) {
      for (const country of COST_COUNTRIES) {
        const base = costPlan(outcome, country);
        for (const answers of ALL_ANSWERS) {
          const plan = costPlan(outcome, country, answers);
          expect(plan.outcome).toBe(outcome);
          expect(careIds(plan).sort()).toEqual(careIds(base).sort());
          expect(ids(plan.transport).sort()).toEqual(ids(base.transport).sort());
          expect(ids(plan.benefits).sort()).toEqual(ids(base.benefits).sort());
          expect(plan.floorKey).toBe(base.floorKey);
        }
      }
    }
  });

  it('the summary warns when a cheaper option is below the floor, and never recommends it', () => {
    everyPlan((_outcome, plan) => {
      const s = costSummary(plan, en);
      if (plan.cheaperBelowFloorId) {
        const low = plan.care.find((e) => e.option.id === plan.cheaperBelowFloorId)!;
        expect(low.meetsFloor).toBe(false);
        expect(s).toContain('too low a level of care');
      }
      expect(s).not.toMatch(/\{\w+\}/);
    });
    const s = costSummary(costPlan('REFER_SOON', 'pk_punjab'), en);
    expect(s).toContain('right level of care');
  });

  it('lost earnings are added only when daily earnings are given, and capped at one day', () => {
    const o = COST_OPTIONS.find((x) => x.id === 'pk_public')!;
    const without = optionTotal(o, 'pk_punjab', null)!;
    expect(without.wages).toBeNull();
    const withWages = optionTotal(o, 'pk_punjab', 1600)!;
    expect(withWages.wages!.min).toBeGreaterThan(0);
    expect(withWages.wages!.max).toBeLessThanOrEqual(1600);
    expect(withWages.total.max).toBeCloseTo(without.total.max + withWages.wages!.max);
    expect(costPlan('REFER_SOON', 'pk_punjab', { moneyForTransport: null, hasHealthCard: null, dailyEarnings: null }).wagesIncluded).toBe(false);
    expect(costPlan('REFER_SOON', 'pk_punjab', { moneyForTransport: null, hasHealthCard: null, dailyEarnings: 1600 }).wagesIncluded).toBe(true);
  });

  it('every number is sourced or marked as an assumption, and every option has text in every language', () => {
    const checkFigure = (f: Figure, label: string) => {
      expect(f.min, label).toBeLessThanOrEqual(f.max);
      if (f.basis.kind === 'sourced') {
        expect(f.basis.sources.length, label).toBeGreaterThan(0);
        for (const s of f.basis.sources) expect(s.url).toMatch(/^https?:\/\//);
      }
    };
    for (const o of COST_OPTIONS) {
      expect(o.sources.length, o.id).toBeGreaterThan(0);
      for (const s of o.sources) {
        expect(s.url).toMatch(/^https?:\/\//);
        expect(s.checked).toMatch(/^\d{4}-\d{2}$/);
      }
      if (o.kind === 'care') {
        expect(o.costs, o.id).toBeDefined();
        checkFigure(o.costs!.extras, `${o.id} extras`);
        checkFigure(o.costs!.travelMinutes, `${o.id} travel`);
        checkFigure(o.costs!.waitMinutes, `${o.id} wait`);
      }
      for (const lang of ['en', 'ur', 'am'] as const) {
        expect(STRINGS[lang][o.titleKey], `${lang} ${o.titleKey}`).toBeTruthy();
        expect(STRINGS[lang][o.bodyKey], `${lang} ${o.bodyKey}`).toBeTruthy();
      }
    }
    for (const b of COST_BENEFITS) {
      expect(b.sources.length, b.id).toBeGreaterThan(0);
      for (const lang of ['en', 'ur', 'am'] as const) expect(STRINGS[lang][b.titleKey], `${lang} ${b.titleKey}`).toBeTruthy();
    }
  });

  it('formats prices with currency', () => {
    expect(formatPrice({ kind: 'free' }, 'Free')).toBe('Free');
    expect(formatPrice({ kind: 'range', min: 1000, max: 1500, currency: 'ETB' }, 'Free')).toBe('ETB 1,000–1,500');
    expect(formatPrice({ kind: 'range', min: 30, max: 300, currency: 'PKR' }, 'Free')).toBe('Rs 30–300');
    expect(formatMoney({ min: 0, max: 0 }, 'PKR')).toBe('Rs 0');
  });
});
