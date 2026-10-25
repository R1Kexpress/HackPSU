import { costPlan, costSummary, formatMoney, formatPrice, NO_FINANCE_ANSWERS, t, type CostCountry, type CostOption } from '@aman/content';
import type { Decision, Lang } from '@aman/types';

/** Telegram's limit is 4096; leave headroom. */
export const COST_CHUNK_LIMIT = 3500;
const MAX_TRANSPORT = 3;

/** p = Punjab, e = Ethiopia, x = ask which country. The outcome is never carried in the button: the handler reads it from the stored case. */
export type CostCode = 'p' | 'e' | 'x';
export const COST_CODE_COUNTRY: Record<'p' | 'e', CostCountry> = { p: 'pk_punjab', e: 'et' };

export function costCallback(caseId: string, code: CostCode): string {
  return `c|${caseId}|${code}`;
}

/**
 * Plain-text cost and transport advice for a finished decision, built only from costPlan and existing strings.
 * Never asks finance questions, so the plan uses NO_FINANCE_ANSWERS. Returns chunks when too long for one message.
 */
export function costMessage(outcome: Decision, country: CostCountry, lang: Lang): string | string[] {
  const tl = (key: string) => t(lang, key);
  const plan = costPlan(outcome, country, NO_FINANCE_ANSWERS);
  const goNow = outcome === 'GO_NOW';
  const price = (o: CostOption) => `${formatPrice(o.price, tl('costs_free'))} (${tl('costs_estimate')})`;
  const summary = costSummary(plan, tl);
  // The button message above already says costs_title. costSummary can already contain the floor line, so send it only once.
  const blocks: string[] = summary.includes(tl(plan.floorKey)) ? [summary] : [tl(plan.floorKey), summary];

  const rec = plan.care.find((e) => e.option.id === plan.recommendedId && e.meetsFloor);
  if (rec) {
    const total = rec.total ? `${tl('costs_total')}: ${formatMoney(rec.total.total, rec.total.currency)} (${tl('costs_estimate')})` : price(rec.option);
    blocks.push([`${tl('costs_recommended')}:`, tl(rec.option.titleKey), total, tl(rec.option.bodyKey)].join('\n'));
  }

  const transport = [...plan.transport].sort((a, b) => Number(b.price.kind === 'free') - Number(a.price.kind === 'free')).slice(0, MAX_TRANSPORT);
  if (transport.length > 0) {
    blocks.push([tl('costs_transport'), ...transport.map((o) => `• ${tl(o.titleKey)}: ${price(o)}\n${tl(o.bodyKey)}`), tl('costs_no_ambulance')].join('\n'));
  }

  if (plan.emergencyContacts.length > 0) {
    blocks.push([tl('costs_emergency_title'), tl('costs_emergency_body'), ...plan.emergencyContacts.map((o) => `• ${tl(o.titleKey)}: ${price(o)}`)].join('\n'));
  }

  // costSummary already ends with it for GO_NOW; keep it guaranteed without repeating it.
  if (goNow && !summary.includes(tl('costs_never_delay'))) blocks.push(tl('costs_never_delay'));
  blocks.push(tl('costs_disclaimer'));

  const text = blocks.join('\n\n');
  return text.length <= COST_CHUNK_LIMIT ? text : chunkBlocks(blocks);
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
