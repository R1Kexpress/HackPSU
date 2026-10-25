import { costPlan, formatHours, formatMoney, formatPrice, NO_FINANCE_ANSWERS, t, type CareEntry, type CostCountry, type CostPlan, type Price } from '@aman/content';
import type { Decision, Lang } from '@aman/types';

/** Telegram's limit is 4096; leave headroom. */
export const COST_CHUNK_LIMIT = 3500;
const MAX_CARE = 3;
const MAX_TRANSPORT = 2;

/** p = Punjab, e = Ethiopia, x = ask which country. The outcome is never carried in the button: the handler reads it from the stored case. */
export type CostCode = 'p' | 'e' | 'x';
export const COST_CODE_COUNTRY: Record<'p' | 'e', CostCountry> = { p: 'pk_punjab', e: 'et' };

export function costCallback(caseId: string, code: CostCode): string {
  return `c|${caseId}|${code}`;
}

const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
const mid = (e: CareEntry) => (e.total ? (e.total.total.min + e.total.total.max) / 2 : Infinity);

/**
 * Plain-text cost and transport advice for a finished decision, built only from costPlan and existing strings.
 * Never asks finance questions, so the plan uses NO_FINANCE_ANSWERS. Returns chunks when too long for one message.
 */
export function costMessage(outcome: Decision, country: CostCountry, lang: Lang): string | string[] {
  return planMessage(costPlan(outcome, country, NO_FINANCE_ANSWERS), lang);
}

/** No percentages and no price comparisons: GO_NOW is four short blocks, the others a ranked list. */
export function planMessage(plan: CostPlan, lang: Lang): string | string[] {
  const blocks = plan.outcome === 'GO_NOW' ? goNowBlocks(plan, lang) : rankedBlocks(plan, lang);
  const text = blocks.join('\n\n');
  return text.length <= COST_CHUNK_LIMIT ? text : chunkBlocks(blocks);
}

function goNowBlocks(plan: CostPlan, lang: Lang): string[] {
  const tl = (key: string) => t(lang, key);
  // The floor line is the single "go now, do not compare prices" line.
  const blocks = [tl(plan.floorKey)];

  const free = plan.transport.find((o) => o.price.kind === 'free');
  blocks.push([free ? fill(tl('summary_go_now'), { a: tl(free.titleKey) }) : null, tl('costs_go_fallback')].filter(Boolean).join('\n'));

  const rec = plan.care.find((e) => e.option.id === plan.recommendedId && e.meetsFloor);
  if (rec) {
    // A free visit gets the option's own note (e.g. free under 5); anything else gets the plan's estimate.
    const cost = rec.option.price.kind === 'free' || !rec.total ? tl(rec.option.bodyKey) : `${tl('costs_total')} ${formatMoney(rec.total.total, rec.total.currency)}`;
    blocks.push(`${tl(rec.option.titleKey)}: ${cost}`);
  }

  blocks.push(tl('costs_disclaimer'));
  return blocks;
}

function rankedBlocks(plan: CostPlan, lang: Lang): string[] {
  const tl = (key: string) => t(lang, key);
  const price = (p: Price) => `${formatPrice(p, tl('costs_free'))} (${tl('costs_estimate')})`;
  const blocks: string[] = [];

  const rec = plan.care.find((e) => e.option.id === plan.recommendedId && e.meetsFloor);
  blocks.push(
    rec?.total
      ? fill(tl(`costs_bottom_${plan.outcome}`), {
          a: tl(rec.option.titleKey),
          total: formatMoney(rec.total.total, rec.total.currency),
          hours: formatHours(rec.total.hoursAway, tl('costs_hours_unit')),
        })
      : tl(plan.floorKey),
  );

  // costPlan already ranks care: recommended first, then the rest at the right level, below-floor last.
  const care = plan.care.filter((e) => e.total).slice(0, MAX_CARE);
  if (care.length > 0) {
    const lines = care.map((e, i) => {
      const line = `${i + 1}. ${tl(e.option.titleKey)}: ${formatMoney(e.total!.total, e.total!.currency)}`;
      if (e.meetsFloor) return line;
      // Only claim "cheaper" when it is, and never "cheapest".
      const note = rec && mid(e) < mid(rec) ? 'costs_below_floor_cheaper' : 'costs_below_floor_cannot';
      return `${line}\n   ${tl(note)}`;
    });
    blocks.push([`${tl('costs_total')}:`, ...lines].join('\n'));
  }

  const transport = [...plan.transport].sort((a, b) => Number(b.price.kind === 'free') - Number(a.price.kind === 'free')).slice(0, MAX_TRANSPORT);
  if (transport.length > 0) blocks.push([tl('costs_transport'), ...transport.map((o) => `• ${tl(o.titleKey)}: ${price(o.price)}`)].join('\n'));

  if (plan.emergencyContacts.length > 0) {
    blocks.push([tl('costs_emergency_title'), tl('costs_emergency_body'), ...plan.emergencyContacts.map((o) => `• ${tl(o.titleKey)}: ${price(o.price)}`)].join('\n'));
  }

  blocks.push(tl('costs_disclaimer'));
  return blocks;
}

/** Packs blank-line-separated paragraphs into messages of at most COST_CHUNK_LIMIT characters. */
export function chunkBlocks(blocks: string[]): string[] {
  const out: string[] = [];
  let cur = '';
  for (const b of blocks.flatMap((x) => x.split('\n\n'))) {
    for (let piece = b; piece.length > 0; piece = piece.slice(COST_CHUNK_LIMIT)) {
      const part = piece.slice(0, COST_CHUNK_LIMIT);
      if (cur && cur.length + 2 + part.length > COST_CHUNK_LIMIT) {
        out.push(cur);
        cur = part;
      } else {
        cur = cur ? `${cur}\n\n${part}` : part;
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function costChunks(outcome: Decision, country: CostCountry, lang: Lang): string[] {
  return [costMessage(outcome, country, lang)].flat();
}
