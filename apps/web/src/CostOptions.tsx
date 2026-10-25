import { useState } from 'react';
import {
  COST_COUNTRIES,
  COUNTRY_CURRENCY,
  costPlan,
  costSummary,
  defaultCostCountry,
  formatHours,
  formatMoney,
  formatPrice,
  localFareOption,
  NO_FINANCE_ANSWERS,
  type Benefit,
  type CareEntry,
  type CostCountry,
  type CostOption,
  type FamilyFinanceAnswers,
  type Figure,
  type PriceSource,
  type TriAnswer,
} from '@aman/content';
import { DECISIONS, type Decision, type Lang } from '@aman/types';
import { Banner, DecisionBadge } from './components';
import { speak, useCanSpeak, useT } from './i18n';
import { navigate } from './router';

const RESULT_KEY = 'aman.familyResult';

/** The finished decision only. Finance answers are never part of this. */
export interface FamilyResult {
  readonly caseId: string;
  readonly outcome: Decision;
  readonly language: Lang;
  readonly protocolVersion: string;
}

export function saveFamilyResult(r: FamilyResult): void {
  localStorage.setItem(RESULT_KEY, JSON.stringify(r));
}

function readFamilyResult(): FamilyResult | null {
  try {
    const r = JSON.parse(localStorage.getItem(RESULT_KEY) ?? 'null') as FamilyResult | null;
    return r && (DECISIONS as readonly string[]).includes(r.outcome) ? Object.freeze(r) : null;
  } catch {
    return null;
  }
}

export function CostOptions() {
  const { t, lang, dir } = useT();
  const [result] = useState(readFamilyResult);
  const [country, setCountry] = useState<CostCountry | null>(() => defaultCostCountry(result?.language ?? lang));
  // Kept in component state only: never written to storage or sent anywhere.
  const [answers, setAnswers] = useState<FamilyFinanceAnswers>(NO_FINANCE_ANSWERS);
  const [earningsText, setEarningsText] = useState('');
  const speakable = useCanSpeak(lang, 'cost_summary');

  if (!result) {
    return (
      <div dir={dir} lang={lang} className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <h1 className="text-3xl font-extrabold">{t('costs_title')}</h1>
        <Banner tone="warn">{t('costs_no_result')}</Banner>
        <button className="btn-primary w-full" onClick={() => navigate('/voice')}>
          {t('voice_link')}
        </button>
      </div>
    );
  }

  const plan = country ? costPlan(result.outcome, country, answers) : null;
  const summary = plan ? costSummary(plan, t) : '';
  const set = (k: 'moneyForTransport' | 'hasHealthCard', v: TriAnswer) => setAnswers((a) => ({ ...a, [k]: a[k] === v ? null : v }));
  const setEarnings = (text: string) => {
    const clean = text.replace(/[^0-9]/g, '').slice(0, 9);
    setEarningsText(clean);
    setAnswers((a) => ({ ...a, dailyEarnings: clean === '' ? null : Number(clean) }));
  };

  return (
    <div dir={dir} lang={lang} className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <h1 className="text-3xl font-extrabold">{t('costs_title')}</h1>
      <DecisionBadge outcome={result.outcome} />
      <p className="text-xs text-ink-soft">{t('costs_reads_result')}</p>
      <Banner tone={result.outcome === 'GO_NOW' ? 'warn' : 'teal'}>{t(`costs_floor_${result.outcome}`)}</Banner>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">{t('costs_country')}</h2>
        <div className="grid grid-cols-2 gap-2">
          {COST_COUNTRIES.map((c) => (
            <button key={c} className={`btn-quiet text-base ${country === c ? 'border-teal bg-teal-soft' : ''}`} onClick={() => setCountry(c)}>
              {t(`country_${c}`)}
            </button>
          ))}
        </div>
      </section>

      {plan && country && (
        <>
          <div className="card flex items-start gap-3 border-2 border-teal/30">
            <p className="flex-1 text-lg font-semibold leading-snug">{summary}</p>
            {speakable && (
              <button className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-soft text-xl text-teal" aria-label={t('costs_read_aloud')} onClick={() => speak(lang, 'cost_summary', summary)}>
                🔊
              </button>
            )}
          </div>

          <details className="card space-y-3">
            <summary className="cursor-pointer font-bold">🔒 {t('costs_private_title')}</summary>
            <p className="mt-2 text-sm text-ink-soft">{t('costs_private_note')}</p>
            <TriQuestion label={t('costs_q_money')} value={answers.moneyForTransport} onChange={(v) => set('moneyForTransport', v)} />
            <TriQuestion label={t(`costs_q_card_${country}`)} value={answers.hasHealthCard} onChange={(v) => set('hasHealthCard', v)} />
            {plan.showComparison && (
              <label className="block space-y-2">
                <span className="font-semibold">{t('costs_q_earnings')}</span>
                <span className="flex items-center gap-2 rounded-xl border-2 border-teal/30 bg-white px-3" dir="ltr">
                  <span className="text-ink-soft">{COUNTRY_CURRENCY[country] === 'PKR' ? 'Rs' : 'ETB'}</span>
                  <input inputMode="numeric" autoComplete="off" className="min-h-12 w-full bg-transparent text-xl font-bold outline-none" value={earningsText} onChange={(e) => setEarnings(e.target.value)} aria-label={t('costs_q_earnings')} />
                </span>
              </label>
            )}
          </details>
          {plan.freeFirst && <p className="text-sm font-semibold text-teal">{t('costs_free_first')}</p>}

          <TransportList options={plan.transport} />
          <EmergencyContacts options={plan.emergencyContacts} />
          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">{t('costs_care')}</h2>
            {plan.outcome === 'GO_NOW' && <p className="font-bold text-now">{t('costs_never_delay')}</p>}
            {plan.showComparison && <p className="text-xs text-ink-soft">{plan.wagesIncluded ? t('costs_wages_note') : t('costs_wages_missing')}</p>}
            <ul className="space-y-2">
              {plan.care.map((e) => (
                <CareCard key={e.option.id} entry={e} recommended={e.option.id === plan.recommendedId} />
              ))}
            </ul>
          </section>
          <Benefits benefits={plan.benefits} />
          <p className="text-xs text-ink-soft">{t('costs_disclaimer')}</p>
        </>
      )}
    </div>
  );
}

function TriQuestion({ label, value, onChange }: { label: string; value: TriAnswer; onChange: (v: TriAnswer) => void }) {
  const { t } = useT();
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {(['yes', 'no', 'unsure'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={value === v} className={`min-h-11 rounded-xl border-2 font-semibold ${value === v ? 'border-teal bg-teal text-paper' : 'border-teal/30 text-teal'}`} onClick={() => onChange(v)}>
            {t(v === 'unsure' ? 'not_sure' : v)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Sources({ sources }: { sources: PriceSource[] }) {
  const { t } = useT();
  return (
    <ul className="space-y-0.5 text-xs text-ink-soft" dir="ltr" lang="en">
      {sources.map((s) => (
        <li key={s.url + s.name}>
          {t('costs_source')}:{' '}
          <a className="underline" href={s.url} target="_blank" rel="noreferrer">
            {s.name}
          </a>{' '}
          ({t('costs_checked')} {s.checked})
        </li>
      ))}
    </ul>
  );
}

function PriceTag({ text }: { text: string }) {
  const { t } = useT();
  return (
    <span className="shrink-0 text-end">
      <span className="block text-lg font-extrabold tabular-nums" dir="ltr">
        {text}
      </span>
      <span className="block text-[11px] font-bold uppercase tracking-wide text-soon">{t('costs_estimate')}</span>
    </span>
  );
}

function TransportList({ options }: { options: CostOption[] }) {
  const { t } = useT();
  if (options.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">{t('costs_transport')}</h2>
      <ul className="space-y-2">
        {options.map((o) => (
          <li key={o.id} className="card space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold">{t(o.titleKey)}</h3>
              <PriceTag text={formatPrice(o.price, t('costs_free'))} />
            </div>
            <p className="text-sm">{t(o.bodyKey)}</p>
            <Sources sources={o.sources} />
          </li>
        ))}
      </ul>
      <p className="text-sm font-semibold">{t('costs_no_ambulance')}</p>
    </section>
  );
}

function EmergencyContacts({ options }: { options: CostOption[] }) {
  const { t } = useT();
  if (options.length === 0) return null;
  return (
    <section className="card space-y-2 border-2 border-now/30 p-4">
      <h2 className="font-bold text-now">⚠️ {t('costs_emergency_title')}</h2>
      <p className="text-sm">{t('costs_emergency_body')}</p>
      <ul className="space-y-2">
        {options.map((o) => (
          <li key={o.id} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-bold">{t(o.titleKey)}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums" dir="ltr">
                {formatPrice(o.price, t('costs_free'))} <span className="text-[11px] uppercase text-soon">{t('costs_estimate')}</span>
              </span>
            </div>
            <Sources sources={o.sources} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function FigureBasis({ figure }: { figure: Figure }) {
  const { t } = useT();
  return figure.basis.kind === 'assumption' ? <span className="rounded bg-soon-bg px-1 text-[10px] font-bold uppercase text-soon">{t('costs_assumption')}</span> : null;
}

function CareCard({ entry, recommended }: { entry: CareEntry; recommended: boolean }) {
  const { t } = useT();
  const { option: o, total, meetsFloor } = entry;
  const ring = recommended ? 'ring-2 ring-teal' : !meetsFloor ? 'border-2 border-dashed border-now/40 opacity-90' : '';
  const fareSources = total && o.costs?.travelMode === 'local' ? (localFareOption(o.country)?.sources ?? []) : [];
  const sources = [...o.sources, ...(o.costs ? [o.costs.extras, o.costs.waitMinutes].flatMap((f) => (f.basis.kind === 'sourced' ? f.basis.sources : [])) : []), ...fareSources].filter((s, i, all) => all.findIndex((x) => x.url === s.url && x.name === s.name) === i);
  return (
    <li className={`card space-y-2 p-4 ${ring}`}>
      {recommended && <p className="text-xs font-bold uppercase tracking-wide text-teal">✓ {t('costs_recommended')}</p>}
      {!meetsFloor && <p className="rounded-lg bg-now-bg px-2 py-1 text-sm font-bold text-now">⚠️ {t('costs_below_floor')}</p>}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-bold">{t(o.titleKey)}</h3>
        <PriceTag text={total ? formatMoney(total.total, total.currency) : formatPrice(o.price, t('costs_free'))} />
      </div>
      {total && <p className="text-[11px] font-semibold text-ink-soft">{t('costs_total')}</p>}
      <p className="text-sm">{t(o.bodyKey)}</p>
      {total && o.costs && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-ink/5 p-2 text-xs">
          <dt>{t('costs_visit')}</dt>
          <dd className="text-end tabular-nums" dir="ltr">
            {formatPrice(o.price, t('costs_free'))}
          </dd>
          <dt>
            {t('costs_extras')} <FigureBasis figure={o.costs.extras} />
          </dt>
          <dd className="text-end tabular-nums" dir="ltr">
            {formatMoney(total.extras, total.currency)}
          </dd>
          <dt>{t('costs_travel_cost')}</dt>
          <dd className="text-end tabular-nums" dir="ltr">
            {formatMoney(total.travel, total.currency)}
          </dd>
          <dt>{t('costs_wages')}</dt>
          <dd className="text-end tabular-nums" dir="ltr">
            {total.wages ? formatMoney(total.wages, total.currency) : '—'}
          </dd>
          <dt>
            {t('costs_time_away')} <FigureBasis figure={o.costs.travelMinutes.basis.kind === 'assumption' ? o.costs.travelMinutes : o.costs.waitMinutes} />
          </dt>
          <dd className="text-end tabular-nums" dir="ltr">
            {formatHours(total.hoursAway, t('costs_hours_unit'))}
          </dd>
        </dl>
      )}
      <Sources sources={sources} />
    </li>
  );
}

function Benefits({ benefits }: { benefits: Benefit[] }) {
  const { t } = useT();
  if (benefits.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">{t('costs_benefits_title')}</h2>
      <ul className="space-y-2">
        {benefits.map((b) => (
          <li key={b.id} className="card space-y-1 p-4">
            <h3 className="font-bold">{t(b.titleKey)}</h3>
            <p className="text-sm">{t(b.bodyKey)}</p>
            <Sources sources={b.sources} />
          </li>
        ))}
      </ul>
    </section>
  );
}
