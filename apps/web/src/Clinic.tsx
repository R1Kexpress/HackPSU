import { useCallback, useEffect, useMemo, useState } from 'react';
import { CASE_STATUS_LABELS, fieldLabel, reasonText } from '@aman/content';
import { fastBreathingCutoff } from '@aman/protocol';
import { CASE_STATUSES, OUTCOME_RANK, type CaseRecord, type CaseStatus, type Clinic as ClinicT } from '@aman/types';
import { Banner, DecisionBadge, ExperimentalAudio, ReasonList } from './components';

const PIN_KEY = 'aman.dashboardPin';

function sortCases(list: CaseRecord[]): CaseRecord[] {
  return [...list].sort((a, b) => {
    const o = OUTCOME_RANK[b.decision.outcome] - OUTCOME_RANK[a.decision.outcome];
    if (o) return o;
    const aa = a.patient.ageMonths;
    const ba = b.patient.ageMonths;
    if (aa !== ba) return aa === null ? 1 : ba === null ? -1 : aa - ba;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function waited(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function caseLabel(c: CaseRecord): string {
  return `A-${c.id.slice(0, 8).toUpperCase()}`;
}

function ageLabel(c: CaseRecord): string {
  const age = c.patient.ageMonths;
  if (age === null) return 'Age unknown';
  const label = age >= 24 && age % 12 === 0 ? `${age / 12} years` : `${age} ${age === 1 ? 'month' : 'months'}`;
  return c.patient.ageApproximate ? `${label} (approx.)` : label;
}

export function Clinic() {
  const [pin, setPin] = useState(() => sessionStorage.getItem(PIN_KEY) ?? '');
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [clinics, setClinics] = useState<ClinicT[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<CaseStatus | 'open'>('open');
  const [live, setLive] = useState(false);

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', 'x-dashboard-pin': pin, ...(init?.headers ?? {}) } });
      if (res.status === 401) {
        setAuthed(false);
        throw new Error('Wrong PIN');
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      return res.json();
    },
    [pin],
  );

  const load = useCallback(async () => {
    try {
      const [c, k] = await Promise.all([api('/api/cases'), api('/api/clinics')]);
      setCases(c);
      setClinics(k);
      setAuthed(true);
      setError(null);
      sessionStorage.setItem(PIN_KEY, pin);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api, pin]);

  useEffect(() => {
    if (pin) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authed) return;
    const es = new EventSource(`/api/stream?pin=${encodeURIComponent(pin)}`);
    const upsert = (e: MessageEvent) => {
      const c = JSON.parse(e.data) as CaseRecord;
      setCases((prev) => [c, ...prev.filter((p) => p.id !== c.id)]);
      if (c.clinicId) void api('/api/clinics').then(setClinics).catch(() => {});
    };
    es.addEventListener('case_upserted', upsert);
    es.addEventListener('case_updated', upsert);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [authed, pin, api]);

  const visible = useMemo(() => sortCases(cases.filter((c) => (filter === 'open' ? c.status !== 'closed' : c.status === filter))), [cases, filter]);
  const current = visible.find((c) => c.id === selected) ?? visible[0] ?? null;

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm space-y-4 px-4 py-10">
        <h1 className="text-3xl font-extrabold">Clinic dashboard</h1>
        <p className="text-ink-soft">Enter the shared demo PIN. This is a placeholder, not real authentication.</p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <input className="min-h-14 w-full rounded-2xl border-2 border-teal/30 bg-white px-4 text-2xl outline-none focus:border-teal" type="password" value={pin} onChange={(e) => setPin(e.target.value)} aria-label="Dashboard PIN" autoFocus />
          <button className="btn-primary w-full">Open dashboard</button>
        </form>
        {error && <Banner tone="warn">{error}</Banner>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <Banner tone="warn">Synthetic demo data. Clinics, coordinates and cases are invented. Screening support, not diagnosis.</Banner>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-4xl font-bold tracking-tight">Incoming cases</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${live ? 'bg-home-bg text-home' : 'bg-ink/10 text-ink-soft'}`}>{live ? 'Live' : 'Reconnecting'}</span>
        <select className="min-h-11 rounded-xl border-2 border-teal/25 bg-white px-3" value={filter} onChange={(e) => setFilter(e.target.value as CaseStatus | 'open')} aria-label="Filter by status">
          <option value="open">Open (not closed)</option>
          {CASE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CASE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <ol className="overflow-hidden rounded-[1.25rem] border border-ink/15 bg-white/70" aria-label="Urgency-ranked queue">
          {visible.length === 0 && <li className="p-5 text-ink-soft">No cases yet. New cases appear here live.</li>}
          {visible.map((c) => (
            <li key={c.id} className="border-b border-ink/10 last:border-0">
              <button className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-start transition hover:bg-teal-soft/30 ${current?.id === c.id ? 'bg-teal-soft/30' : ''}`} aria-pressed={current?.id === c.id} onClick={() => setSelected(c.id)}>
                <span className="min-w-0">
                  <span className="block font-semibold">{caseLabel(c)} · {ageLabel(c)}</span>
                  <span className="block text-sm text-ink-soft">{c.source === 'voice_note' ? 'Voice note' : 'Field app'} · {waited(c.createdAt)} ago</span>
                </span>
                <DecisionBadge outcome={c.decision.outcome} size="sm" />
              </button>
            </li>
          ))}
        </ol>
        {current ? <CaseDetail key={current.id} c={current} clinics={clinics} api={api} /> : <div className="card text-ink-soft">Select a case to see details.</div>}
      </div>
    </div>
  );
}

function CaseDetail({ c, clinics, api }: { c: CaseRecord; clinics: ClinicT[]; api: (p: string, i?: RequestInit) => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cutoff = fastBreathingCutoff(c.patient.ageMonths);
  const clinic = clinics.find((k) => k.id === c.clinicId);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sym = Object.entries(c.symptoms).filter(([k]) => k !== 'coughDays');

  return (
    <article className="card space-y-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{caseLabel(c)} · {ageLabel(c)}</h2>
        <DecisionBadge outcome={c.decision.outcome} size="sm" />
      </header>
      <section className="space-y-3 text-base leading-relaxed">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Summary</h3>
        <p>{c.summary.english}</p>
        {c.summary.localized && <p lang={c.language} dir={c.language === 'ur' ? 'rtl' : 'ltr'}>{c.summary.localized}</p>}
        {c.summary.transcript && <p lang={c.language} dir={c.language === 'ur' ? 'rtl' : 'ltr'}>{c.summary.transcript}</p>}
      </section>
      <section>
        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-soft">Reasons</h3>
        <ReasonList keys={c.decision.reasonKeys} lang="en" />
        {c.needsHumanReview && (
          <div className="mt-3">
            <Banner tone="warn">Needs human review.{c.missingFields.length > 0 && ` Missing: ${c.missingFields.map(fieldLabel).join(', ')}.`}</Banner>
          </div>
        )}
      </section>
      {c.audio && <ExperimentalAudio score={c.audio.score} saliency={c.audio.saliency} modelVersion={c.audio.modelVersion} />}
      {clinic && <p className="text-sm text-ink-soft">Assigned clinic: {clinic.name}{c.routingNote && ` · ${c.routingNote}`}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <button className="btn-primary" disabled={busy || c.status === 'en_route' || c.status === 'closed'} onClick={() => act(() => api(`/api/cases/${c.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'en_route' }) }))}>Mark en route</button>
        <button className="btn-quiet" disabled={busy} onClick={() => act(() => api(`/api/cases/${c.id}/route`, { method: 'POST' }))}>{clinic ? 'Reassign clinic' : 'Assign clinic'}</button>
      </div>
      <details className="border-t border-ink/10 pt-4">
        <summary className="text-sm font-semibold text-teal">Clinical details and case status</summary>
        <div className="mt-4 space-y-4">
          <section className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <Fact label="Age" value={c.patient.ageMonths === null ? 'unknown' : `${c.patient.ageMonths} months${c.patient.ageApproximate ? ' (approx.)' : ''}`} />
            <Fact label="Breath rate" value={c.breathRatePerMin === null ? 'not counted' : `${c.breathRatePerMin}/min (cutoff ≥ ${cutoff ?? '—'})`} />
            <Fact label="Cough days" value={c.symptoms.coughDays === null ? '—' : String(c.symptoms.coughDays)} />
            {sym.map(([k, v]) => (
              <Fact key={k} label={fieldLabel(k)} value={v === null ? 'unknown' : v ? 'yes' : 'no'} tone={v === true ? 'warn' : v === null ? 'muted' : undefined} />
            ))}
          </section>
          <p className="text-xs text-ink-soft">Protocol {c.decision.protocolVersion} · {CASE_STATUS_LABELS[c.status]}</p>
          <div className="flex flex-wrap gap-2">
            {CASE_STATUSES.map((s) => (
              <button key={s} disabled={busy || c.status === s} className={`min-h-11 rounded-xl border px-4 text-sm font-semibold ${c.status === s ? 'border-teal bg-teal text-paper' : 'border-teal/30 text-teal'}`} onClick={() => act(() => api(`/api/cases/${c.id}`, { method: 'PATCH', body: JSON.stringify({ status: s }) }))}>
                {CASE_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-soft">Reasons in the family's language: {c.decision.reasonKeys.map((k) => reasonText(c.language, k)).join(' ')}</p>
        </div>
      </details>
      {err && <Banner tone="warn">{err}</Banner>}
    </article>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'muted' }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${tone === 'warn' ? 'bg-soon-bg' : 'bg-ink/5'}`}>
      <div className="text-[11px] text-ink-soft">{label}</div>
      <div className={`font-semibold ${tone === 'muted' ? 'text-ink-soft' : ''}`}>{value}</div>
    </div>
  );
}
