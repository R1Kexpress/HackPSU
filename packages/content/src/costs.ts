import { OUTCOME_RANK, type Decision } from '@aman/types';

/**
 * Cost and transport options for a family, shown after the referral decision is final.
 * Nothing here can change the decision: the outcome is an input. Care below the decision's
 * level is either hidden (GO_NOW) or flagged and never recommended (HOME, REFER_SOON).
 */

export const COST_COUNTRIES = ['pk_punjab', 'et'] as const;
export type CostCountry = (typeof COST_COUNTRIES)[number];
export type Currency = 'PKR' | 'ETB';

export const COUNTRY_CURRENCY: Record<CostCountry, Currency> = { pk_punjab: 'PKR', et: 'ETB' };

export interface PriceSource {
  name: string;
  url: string;
  /** When the figure was last checked against the source. */
  checked: string;
}

export type Price = { kind: 'free' } | { kind: 'range'; min: number; max: number; currency: Currency };

/** Every number is either backed by sources or shown on screen as an assumption. */
export type Basis = { kind: 'sourced'; sources: PriceSource[] } | { kind: 'assumption' };

export interface Figure {
  min: number;
  max: number;
  basis: Basis;
}

export interface CareCosts {
  /** Typical medicines and tests on top of the visit fee, local currency. */
  extras: Figure;
  /** One-way travel time in minutes. */
  travelMinutes: Figure;
  /** Waiting time at the facility in minutes. */
  waitMinutes: Figure;
  /** Walk (no fare) or the country's local transport fare, paid both ways. */
  travelMode: 'walk' | 'local';
}

export interface CostOption {
  id: string;
  country: CostCountry;
  kind: 'transport' | 'care';
  titleKey: string;
  bodyKey: string;
  price: Price;
  sources: PriceSource[];
  /** Care options: the most urgent decision this place can handle (health post HOME, clinic REFER_SOON, hospital GO_NOW). */
  level?: Decision;
  /** Transport options limited to some outcomes, e.g. emergency ambulances for GO_NOW only. */
  onlyFor?: Decision[];
  /** The everyday transport whose fare is used for travel cost. */
  localFare?: true;
  /** False for a fare used only inside care totals and not shown as its own way to get there. */
  listed?: false;
  costs?: CareCosts;
}

export interface Benefit {
  id: string;
  country: CostCountry;
  titleKey: string;
  bodyKey: string;
  sources: PriceSource[];
  /** Care options this benefit makes cheaper; a "yes" to the health-card question moves them up. */
  covers: string[];
}

const CHECKED = '2026-10';

const SRC = {
  rescue1122: { name: 'Punjab Emergency Service (Rescue 1122), district service page', url: 'https://sialkot.punjab.gov.pk/Punjab_Emergency_Service', checked: CHECKED },
  edhi: { name: 'Edhi Foundation, ambulance service (free, donation-funded)', url: 'https://www.edhi.org/ambulance', checked: CHECKED },
  edhiNumber: { name: 'Punjab Commission on the Status of Women, helplines (ambulance 115)', url: 'https://pcsw.punjab.gov.pk/important_helplines', checked: CHECKED },
  edhiCharges: { name: 'Express Tribune, welfare ambulances charging per km (about Rs 3,500 for ~20 km), 2025', url: 'https://tribune.com.pk/story/2561489/soaring-ambulance-costs-drive-patients-to-cheaper-transport', checked: CHECKED },
  ittefaq: { name: 'Ittefaq Hospital (Trust), Lahore, rate list (paeds emergency Rs 500, ward Rs 3,250/day)', url: 'https://www.ittefaqhospital.com/ratelist.pdf', checked: CHECKED },
  fazal: { name: 'Maanha Fazal Hospital, Lahore, rate list (paeds emergency Rs 1,000, emergency room Rs 2,000-5,000)', url: 'https://maanhafazalhospital.pk/rate-list/', checked: CHECKED },
  etEmergencyForum: { name: 'r/Ethiopia forum post: private emergency visit in Addis about ETB 3,500-4,500, 2025 (weak source)', url: 'https://www.reddit.com/r/Ethiopia/comments/1l4y24n/recommendation_for_medical_attention_in_addis/', checked: CHECKED },
  pkFares: { name: 'Express Tribune, Rawalpindi fares, 2025', url: 'https://tribune.com.pk/story/2553702/commuting-costlier-after-fuel-shock', checked: CHECKED },
  dhqOkara: { name: 'DHQ Hospital South City Okara, FAQ', url: 'https://dhqokarasouth.punjab.gov.pk/faqs', checked: CHECKED },
  phimc: { name: 'Punjab Health Initiative Management Company, Sehat card FAQ', url: 'https://phimc.punjab.gov.pk/faqe', checked: CHECKED },
  pkGpFee: { name: 'Express Tribune, general physician fees in small localities (Sindh), 2025', url: 'https://tribune.com.pk/story/2521667/private-healthcare-slips-through-the-fingers', checked: CHECKED },
  bhuMedicines: { name: 'Express Tribune, free medicines in BHUs and THQ hospitals, 2022', url: 'https://tribune.com.pk/story/2361591/free-medicines-in-bhus-from-july-1', checked: CHECKED },
  inspire: { name: 'INSPIRE Pakistan policy brief 6: average outpatient visit cost PKR 3,315 (late 2023, KP households)', url: 'https://blogs.fau.de/inspirepakistan/files/2025/04/Policy-Brief-6_OPD-Care-Utilization.pdf', checked: CHECKED },
  pkOop2013: { name: 'Pakistan 2013-14 OOP survey: medicines and tests are most of outpatient spending (BMC Health Serv Res, 2021)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7905921/', checked: CHECKED },
  alliedWait: { name: 'Allied Hospital Faisalabad outpatient waiting time, 55-65 min (JBAH, 2017)', url: 'https://iiste.org/Journals/index.php/JBAH/article/download/38841/39942', checked: CHECKED },
  ercs: { name: 'Ethiopian Red Cross Society, ambulance services', url: 'https://redcrosseth.org/get-help/ambulance-services/', checked: CHECKED },
  bajajMfm: { name: 'Menschen für Menschen, bajaj in rural towns (about 20 US cents a seat), 2025', url: 'https://www.menschenfuermenschen.de/blog/land-leute/das-rattern-der-bajaj/', checked: CHECKED },
  bajajPlan: { name: 'Kombolcha bajaj business plan, average town trip ETB 40, 2026', url: 'https://www.slideshare.net/slideshow/business-plan-for-three-wheel-vehicle-bajaj-transport-service-in-kombolcha-town-amhara-regional-state-ethiopia-pdf/288792096', checked: CHECKED },
  commonwealth: { name: 'Commonwealth Fund, Ethiopia health system profile, 2026', url: 'https://www.commonwealthfund.org/international-health-policy-center/countries/ethiopia', checked: CHECKED },
  whoEt: { name: 'WHO, Ethiopia health financing progress matrix, 2022', url: 'https://iris.who.int/server/api/core/bitstreams/e6c213c1-8ff0-4cb4-88d9-eb1ef28488fc/content', checked: CHECKED },
  careLand: { name: 'Care Land General Hospital price list (Addis Ababa area), 2025', url: 'https://africainfoline.com/listing/hospital/addis-ababa/care-land-general-hospital-addis-ababa-find-cost-best-surgeons/', checked: CHECKED },
  gondarWait: { name: 'Gondar district waiting times: public 48 min, private 6 min median (thesis, UWC)', url: 'http://hdl.handle.net/11394/2717', checked: CHECKED },
  addisHcWait: { name: 'Addis Ababa health centres: mean wait 101 min (thesis, 2011)', url: 'http://repository.iphce.org/handle/123456789/938', checked: CHECKED },
  jimmaWait2020: { name: 'Jimma Zone public hospitals: median wait 93 min (PMC, 2022)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8790858/', checked: CHECKED },
  jimmaWait2018: { name: 'Jimma Zone public hospitals: median wait 222 min (PMC, 2024)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10919670/', checked: CHECKED },
} satisfies Record<string, PriceSource>;

const sourced = (min: number, max: number, ...sources: PriceSource[]): Figure => ({ min, max, basis: { kind: 'sourced', sources } });
const assumed = (min: number, max: number): Figure => ({ min, max, basis: { kind: 'assumption' } });

const TOWN_TRIP = assumed(30, 90);

export const COST_OPTIONS: readonly CostOption[] = [
  {
    id: 'rescue1122',
    country: 'pk_punjab',
    kind: 'transport',
    titleKey: 'opt_rescue1122_title',
    bodyKey: 'opt_rescue1122_body',
    price: { kind: 'free' },
    onlyFor: ['GO_NOW'],
    sources: [SRC.rescue1122],
  },
  {
    id: 'edhi',
    country: 'pk_punjab',
    kind: 'transport',
    titleKey: 'opt_edhi_title',
    bodyKey: 'opt_edhi_body',
    price: { kind: 'range', min: 0, max: 3500, currency: 'PKR' },
    onlyFor: ['GO_NOW'],
    sources: [SRC.edhi, SRC.edhiNumber, SRC.edhiCharges],
  },
  {
    id: 'rickshaw',
    country: 'pk_punjab',
    kind: 'transport',
    titleKey: 'opt_rickshaw_title',
    bodyKey: 'opt_rickshaw_body',
    price: { kind: 'range', min: 30, max: 300, currency: 'PKR' },
    localFare: true,
    listed: false,
    sources: [SRC.pkFares],
  },
  {
    id: 'pk_public',
    country: 'pk_punjab',
    kind: 'care',
    titleKey: 'opt_pk_public_title',
    bodyKey: 'opt_pk_public_body',
    price: { kind: 'range', min: 0, max: 30, currency: 'PKR' },
    level: 'GO_NOW',
    sources: [SRC.dhqOkara],
    costs: { extras: sourced(0, 3300, SRC.bhuMedicines, SRC.inspire), travelMinutes: TOWN_TRIP, waitMinutes: sourced(55, 65, SRC.alliedWait), travelMode: 'local' },
  },
  {
    id: 'pk_private',
    country: 'pk_punjab',
    kind: 'care',
    titleKey: 'opt_pk_private_title',
    bodyKey: 'opt_pk_private_body',
    price: { kind: 'range', min: 150, max: 500, currency: 'PKR' },
    level: 'REFER_SOON',
    sources: [SRC.pkGpFee],
    costs: { extras: sourced(2000, 3300, SRC.inspire, SRC.pkOop2013), travelMinutes: TOWN_TRIP, waitMinutes: assumed(15, 45), travelMode: 'local' },
  },
  {
    id: 'pk_private_hospital',
    country: 'pk_punjab',
    kind: 'care',
    titleKey: 'opt_pk_private_hospital_title',
    bodyKey: 'opt_pk_private_hospital_body',
    price: { kind: 'range', min: 500, max: 1000, currency: 'PKR' },
    level: 'GO_NOW',
    sources: [SRC.ittefaq, SRC.fazal],
    costs: { extras: sourced(2000, 8250, SRC.fazal, SRC.ittefaq), travelMinutes: TOWN_TRIP, waitMinutes: assumed(15, 45), travelMode: 'local' },
  },
  {
    id: 'ercs',
    country: 'et',
    kind: 'transport',
    titleKey: 'opt_ercs_title',
    bodyKey: 'opt_ercs_body',
    price: { kind: 'free' },
    onlyFor: ['GO_NOW'],
    sources: [SRC.ercs],
  },
  {
    id: 'bajaj',
    country: 'et',
    kind: 'transport',
    titleKey: 'opt_bajaj_title',
    bodyKey: 'opt_bajaj_body',
    price: { kind: 'range', min: 25, max: 40, currency: 'ETB' },
    localFare: true,
    listed: false,
    sources: [SRC.bajajMfm, SRC.bajajPlan],
  },
  {
    id: 'et_hospital',
    country: 'et',
    kind: 'care',
    titleKey: 'opt_et_hospital_title',
    bodyKey: 'opt_et_public_body',
    price: { kind: 'free' },
    level: 'GO_NOW',
    sources: [SRC.commonwealth, SRC.whoEt],
    costs: { extras: sourced(0, 0, SRC.commonwealth), travelMinutes: TOWN_TRIP, waitMinutes: sourced(93, 222, SRC.jimmaWait2020, SRC.jimmaWait2018), travelMode: 'local' },
  },
  {
    id: 'et_health_centre',
    country: 'et',
    kind: 'care',
    titleKey: 'opt_et_health_centre_title',
    bodyKey: 'opt_et_public_body',
    price: { kind: 'free' },
    level: 'REFER_SOON',
    sources: [SRC.commonwealth],
    costs: { extras: sourced(0, 0, SRC.commonwealth), travelMinutes: TOWN_TRIP, waitMinutes: sourced(48, 101, SRC.gondarWait, SRC.addisHcWait), travelMode: 'local' },
  },
  {
    id: 'et_private',
    country: 'et',
    kind: 'care',
    titleKey: 'opt_et_private_title',
    bodyKey: 'opt_et_private_body',
    price: { kind: 'range', min: 1000, max: 1500, currency: 'ETB' },
    level: 'REFER_SOON',
    sources: [SRC.careLand],
    costs: { extras: assumed(500, 2000), travelMinutes: TOWN_TRIP, waitMinutes: sourced(6, 6, SRC.gondarWait), travelMode: 'local' },
  },
  {
    id: 'et_private_hospital',
    country: 'et',
    kind: 'care',
    titleKey: 'opt_et_private_hospital_title',
    bodyKey: 'opt_et_private_hospital_body',
    price: { kind: 'range', min: 1000, max: 4500, currency: 'ETB' },
    level: 'GO_NOW',
    sources: [SRC.careLand, SRC.etEmergencyForum],
    costs: { extras: sourced(1910, 11350, SRC.careLand), travelMinutes: TOWN_TRIP, waitMinutes: assumed(15, 45), travelMode: 'local' },
  },
];

export const COST_BENEFITS: readonly Benefit[] = [
  { id: 'sehat', country: 'pk_punjab', titleKey: 'opt_sehat_title', bodyKey: 'opt_sehat_body', sources: [SRC.phimc], covers: ['pk_public'] },
  { id: 'et_under5', country: 'et', titleKey: 'benefit_et_under5_title', bodyKey: 'opt_et_public_body', sources: [SRC.commonwealth, SRC.whoEt], covers: ['et_health_centre', 'et_hospital'] },
  { id: 'cbhi', country: 'et', titleKey: 'opt_cbhi_title', bodyKey: 'opt_cbhi_body', sources: [SRC.whoEt], covers: ['et_health_centre', 'et_hospital'] },
];

/** Lost earnings count time away as a share of this many working hours, capped at one day. */
export const WORKDAY_HOURS = 8;

export type TriAnswer = 'yes' | 'no' | 'unsure' | null;

/** Answered on the family's phone only. Never saved, never sent, never part of a case. */
export interface FamilyFinanceAnswers {
  moneyForTransport: TriAnswer;
  hasHealthCard: TriAnswer;
  /** Rough daily earnings in local currency. */
  dailyEarnings: number | null;
}

export const NO_FINANCE_ANSWERS: FamilyFinanceAnswers = { moneyForTransport: null, hasHealthCard: null, dailyEarnings: null };

export interface Range {
  min: number;
  max: number;
}

export interface OptionTotal {
  currency: Currency;
  visit: Range;
  extras: Range;
  travel: Range;
  /** Null when daily earnings were not given. */
  wages: Range | null;
  total: Range;
  /** Round-trip travel plus waiting, in hours. */
  hoursAway: Range;
}

export interface CareEntry {
  option: CostOption;
  meetsFloor: boolean;
  /** Null for GO_NOW: there is nothing to compare. */
  total: OptionTotal | null;
}

export interface CostPlan {
  /** The finished decision, passed through untouched. */
  outcome: Decision;
  floorKey: string;
  transport: CostOption[];
  /** Options that meet the floor first; below-floor options (flagged) last. */
  care: CareEntry[];
  /** Lowest estimated total among options that meet the floor. Null for GO_NOW. */
  recommendedId: string | null;
  /** Set when the cheapest option overall is below the floor, so the summary can warn. */
  cheaperBelowFloorId: string | null;
  showComparison: boolean;
  wagesIncluded: boolean;
  freeFirst: boolean;
  benefits: Benefit[];
  /** Ambulance numbers to keep in case the child gets worse. Empty for GO_NOW, where ambulances are the main way to get there. */
  emergencyContacts: CostOption[];
}

const isFree = (o: CostOption) => o.price.kind === 'free' || o.price.min === 0;
const mid = (r: Range) => (r.min + r.max) / 2;
const add = (...rs: Range[]): Range => ({ min: rs.reduce((s, r) => s + r.min, 0), max: rs.reduce((s, r) => s + r.max, 0) });
const priceRange = (p: Price): Range => (p.kind === 'free' ? { min: 0, max: 0 } : { min: p.min, max: p.max });

function prefer<T>(list: T[], pred: (x: T) => boolean): T[] {
  return [...list.filter(pred), ...list.filter((x) => !pred(x))];
}

export function localFareOption(country: CostCountry): CostOption | undefined {
  return COST_OPTIONS.find((o) => o.country === country && o.localFare);
}

export function optionTotal(option: CostOption, country: CostCountry, dailyEarnings: number | null): OptionTotal | null {
  const c = option.costs;
  if (!c) return null;
  const fare = localFareOption(country);
  const oneWay = c.travelMode === 'walk' || !fare ? { min: 0, max: 0 } : priceRange(fare.price);
  const travel = { min: oneWay.min * 2, max: oneWay.max * 2 };
  const hoursAway = { min: (2 * c.travelMinutes.min + c.waitMinutes.min) / 60, max: (2 * c.travelMinutes.max + c.waitMinutes.max) / 60 };
  const earnings = dailyEarnings !== null && Number.isFinite(dailyEarnings) && dailyEarnings > 0 ? dailyEarnings : null;
  const wages = earnings === null ? null : { min: Math.min(1, hoursAway.min / WORKDAY_HOURS) * earnings, max: Math.min(1, hoursAway.max / WORKDAY_HOURS) * earnings };
  const visit = priceRange(option.price);
  const extras = { min: c.extras.min, max: c.extras.max };
  return { currency: COUNTRY_CURRENCY[country], visit, extras, travel, wages, total: add(visit, extras, travel, wages ?? { min: 0, max: 0 }), hoursAway };
}

/**
 * Builds the options for a finished decision. Finance answers may only reorder options or
 * change which floor-meeting option is cheapest; the set of options depends on outcome and country alone.
 */
export function costPlan(outcome: Decision, country: CostCountry, answers: FamilyFinanceAnswers = NO_FINANCE_ANSWERS): CostPlan {
  const forCountry = COST_OPTIONS.filter((o) => o.country === country);
  const benefits = COST_BENEFITS.filter((b) => b.country === country);
  const goNow = outcome === 'GO_NOW';
  const meets = (o: CostOption) => OUTCOME_RANK[o.level ?? 'HOME'] >= OUTCOME_RANK[outcome];

  let transport = forCountry.filter((o) => o.kind === 'transport' && o.listed !== false && (!o.onlyFor || o.onlyFor.includes(outcome)));
  let care = forCountry.filter((o) => o.kind === 'care' && (!goNow || meets(o)));

  const freeFirst = answers.moneyForTransport === 'no' || answers.moneyForTransport === 'unsure';
  if (freeFirst) {
    transport = prefer(transport, isFree);
    care = prefer(care, isFree);
  }
  if (answers.hasHealthCard === 'yes') {
    const covered = new Set(benefits.flatMap((b) => b.covers));
    care = prefer(care, (o) => covered.has(o.id));
  }

  const entries: CareEntry[] = care.map((option) => ({ option, meetsFloor: meets(option), total: optionTotal(option, country, answers.dailyEarnings) }));
  const byTotal = (a: CareEntry, b: CareEntry) => mid(a.total!.total) - mid(b.total!.total);
  const priced = entries.filter((e) => e.total);
  const recommended = [...priced.filter((e) => e.meetsFloor)].sort(byTotal)[0];
  const cheapest = [...priced].sort(byTotal)[0];

  const ordered = [...(recommended ? [recommended] : []), ...entries.filter((e) => e.meetsFloor && e !== recommended), ...entries.filter((e) => !e.meetsFloor)];

  return {
    outcome,
    floorKey: `costs_floor_${outcome}`,
    transport,
    care: ordered,
    recommendedId: recommended?.option.id ?? null,
    cheaperBelowFloorId: cheapest && !cheapest.meetsFloor && recommended && mid(cheapest.total!.total) < mid(recommended.total!.total) ? cheapest.option.id : null,
    showComparison: true,
    wagesIncluded: answers.dailyEarnings !== null && answers.dailyEarnings > 0,
    freeFirst,
    benefits,
    emergencyContacts: goNow ? [] : forCountry.filter((o) => o.kind === 'transport' && o.onlyFor?.includes('GO_NOW')),
  };
}

export function defaultCostCountry(lang: string): CostCountry | null {
  return lang === 'ur' ? 'pk_punjab' : lang === 'am' ? 'et' : null;
}

const roundTo = (v: number) => (v >= 1000 ? Math.round(v / 50) * 50 : Math.round(v / 10) * 10);

/** Totals are rounded because they add up several estimates; source prices are shown as published. */
export function formatMoney(r: Range, currency: Currency, round = true): string {
  const sym = currency === 'PKR' ? 'Rs' : 'ETB';
  const r2 = (v: number) => (round ? roundTo(v) : v);
  const n = (v: number) => r2(v).toLocaleString('en-US');
  return r2(r.min) === r2(r.max) ? `${sym} ${n(r.min)}` : `${sym} ${n(r.min)}–${n(r.max)}`;
}

export function formatPrice(price: Price, freeLabel: string): string {
  if (price.kind === 'free') return freeLabel;
  return formatMoney(price, price.currency, false);
}

export function formatHours(r: Range, unit: string): string {
  const h = (v: number) => (Math.round(v * 2) / 2).toString();
  return h(r.min) === h(r.max) ? `${h(r.min)} ${unit}` : `${h(r.min)}–${h(r.max)} ${unit}`;
}

const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

/** A short plain-language summary for the family to read or hear. GO_NOW always leads with "go now" and ends with "never delay to compare". */
export function costSummary(plan: CostPlan, t: (key: string) => string): string {
  const comparison = compareSentence(plan, t);
  if (plan.outcome !== 'GO_NOW') return comparison ?? t(plan.floorKey);
  // The decision and costs_floor_GO_NOW are shown next to the summary, so it does not repeat them.
  const free = plan.transport.find((o) => o.price.kind === 'free');
  const goNow = free ? fill(t('summary_go_now'), { a: t(free.titleKey) }) : null;
  return [goNow, comparison, t('costs_never_delay')].filter(Boolean).join(' ');
}

function compareSentence(plan: CostPlan, t: (key: string) => string): string | null {
  const rec = plan.care.find((e) => e.option.id === plan.recommendedId);
  if (!rec?.total) return null;
  const a = t(rec.option.titleKey);
  const others = plan.care.filter((e) => e.meetsFloor && e !== rec && e.total);
  const priciest = others.sort((x, y) => mid(y.total!.total) - mid(x.total!.total))[0];
  let sentence: string;
  if (!priciest) {
    sentence = fill(t('summary_only'), { a, total: formatMoney(rec.total.total, rec.total.currency) });
  } else {
    const ratio = mid(rec.total.total) / Math.max(1, mid(priciest.total!.total));
    const pct = Math.round((1 - ratio) * 100);
    sentence = pct < 10 ? fill(t('summary_same'), { a, b: t(priciest.option.titleKey) }) : fill(t('summary_cheaper'), { a, b: t(priciest.option.titleKey), pct: String(pct) });
  }
  const low = plan.care.find((e) => e.option.id === plan.cheaperBelowFloorId);
  return low ? `${sentence} ${fill(t('summary_below_warning'), { c: t(low.option.titleKey) })}` : sentence;
}
