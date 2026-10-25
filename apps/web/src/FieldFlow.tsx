import { useEffect, useMemo, useRef, useState } from 'react';
import { QUESTION_ORDER, TRANSLATION_STATUS } from '@aman/content';
import { evaluate, fastBreathingCutoff } from '@aman/protocol';
import type { BooleanSymptomKey, CaseRecord, Symptoms } from '@aman/types';
import { analyseClip, loadDemoClip, recordClip, type ClipAnalysis } from './audio';
import { Banner, CaregiverCardView, DecisionBadge, ExperimentalAudio, ReasonList } from './components';
import { speak, useCanSpeak, useT } from './i18n';
import { saveLocal, syncNow } from './store';
import { Icon } from './Icon';

type Step =
  | { kind: 'consent' }
  | { kind: 'age' }
  | { kind: 'yesno'; field: BooleanSymptomKey }
  | { kind: 'coughDays' }
  | { kind: 'breath' }
  | { kind: 'cough_rec' }
  | { kind: 'result' }
  | { kind: 'card' };

const EMPTY: Symptoms = {
  cough: null,
  coughDays: null,
  fever: null,
  difficultyBreathing: null,
  chestIndrawing: null,
  stridorWhenCalm: null,
  unableToDrinkOrFeed: null,
  vomitsEverything: null,
  convulsions: null,
  unusuallySleepyOrUnconscious: null,
  diarrhea: null,
};

function buildSteps(symptoms: Symptoms): Step[] {
  const steps: Step[] = [{ kind: 'consent' }, { kind: 'age' }];
  for (const f of QUESTION_ORDER.dangerSigns) steps.push({ kind: 'yesno', field: f });
  for (const f of QUESTION_ORDER.symptoms) {
    steps.push({ kind: 'yesno', field: f });
    if (f === 'cough' && symptoms.cough === true) steps.push({ kind: 'coughDays' });
  }
  steps.push({ kind: 'breath' }, { kind: 'cough_rec' }, { kind: 'result' }, { kind: 'card' });
  return steps;
}

export function FieldFlow() {
  const { t, lang, dir } = useT();
  const [idx, setIdx] = useState(0);
  const [ageMonths, setAgeMonths] = useState<number | null>(null);
  const [symptoms, setSymptoms] = useState<Symptoms>(EMPTY);
  const [breathRate, setBreathRate] = useState<number | null>(null);
  const [clip, setClip] = useState<ClipAnalysis | null>(null);
  const [saved, setSaved] = useState<'no' | 'local' | 'synced'>('no');
  const [caseId, setCaseId] = useState(() => crypto.randomUUID());
  const [createdAt, setCreatedAt] = useState(() => new Date().toISOString());
  // Any change after saving (e.g. going back to fix an answer) needs a fresh save; the server upserts by id.
  useEffect(() => setSaved('no'), [ageMonths, symptoms, breathRate, clip, lang]);

  const steps = useMemo(() => buildSteps(symptoms), [symptoms]);
  const step = steps[Math.min(idx, steps.length - 1)];
  const next = () => setIdx((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setIdx((i) => Math.max(0, i - 1));

  const input = { patient: { ageMonths }, symptoms, breathRatePerMin: breathRate };
  const decision = evaluate(input, undefined, clip?.score);

  const record: CaseRecord = {
    id: caseId,
    createdAt,
    source: 'field_app',
    language: lang,
    ...input,
    ...(clip?.score !== undefined ? { audio: { score: clip.score, modelVersion: clip.modelVersion ?? 'unknown', saliency: clip.saliency, experimental: true as const } } : {}),
    decision: { outcome: decision.outcome, reasonKeys: decision.reasonKeys, protocolVersion: decision.protocolVersion, audioEscalated: decision.audioEscalated },
    summary: { english: englishSummary(input, decision.outcome) },
    missingFields: decision.missingFields,
    needsHumanReview: decision.needsHumanReview,
    status: 'new',
  };

  const reset = () => {
    setIdx(1);
    setAgeMonths(null);
    setSymptoms(EMPTY);
    setBreathRate(null);
    setClip(null);
    setSaved('no');
    setCaseId(crypto.randomUUID());
    setCreatedAt(new Date().toISOString());
  };

  const save = async () => {
    await saveLocal(record);
    setSaved('local');
    if (navigator.onLine && (await syncNow()) > 0) setSaved('synced');
  };

  const answer = (field: BooleanSymptomKey, v: boolean | null) => {
    setSymptoms((s) => ({ ...s, [field]: v, ...(field === 'cough' && v !== true ? { coughDays: null } : {}) }));
    next();
  };

  const progress = Math.round((idx / (steps.length - 1)) * 100);

  return (
    <div dir={dir} lang={lang} className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col gap-5 px-4 pb-10 pt-4">
      {idx > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden>
          <div className="h-full bg-teal transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {step.kind === 'consent' && (
        <Screen title={t('consent_title')} promptKey="consent" promptText={t('consent_body')}>
          <p className="text-lg leading-relaxed">{t('consent_body')}</p>
          <Banner>{t('banner')}</Banner>
          {TRANSLATION_STATUS[lang] !== 'source' && <Banner tone="warn">{t('draft_translation')}</Banner>}
          <button className="btn-primary w-full" onClick={next}>
            {t('agree')}
          </button>
        </Screen>
      )}

      {step.kind === 'age' && <AgeStep onDone={(a) => (setAgeMonths(a), next())} initial={ageMonths} />}

      {step.kind === 'yesno' && (
        <Screen title={t(`q_${step.field}`)} promptKey={step.field} promptText={t(`q_${step.field}`)} key={step.field}>
          <YesNo value={symptoms[step.field]} onAnswer={(v) => answer(step.field, v)} />
        </Screen>
      )}

      {step.kind === 'coughDays' && (
        <Screen title={t('q_coughDays')} promptKey="coughDays" promptText={t('q_coughDays')}>
          <NumberPad
            unit={t('days')}
            initial={symptoms.coughDays}
            max={365}
            onDone={(d) => {
              setSymptoms((s) => ({ ...s, coughDays: d }));
              next();
            }}
          />
        </Screen>
      )}

      {step.kind === 'breath' && (
        <BreathCounter
          ageMonths={ageMonths}
          onDone={(r) => {
            setBreathRate(r);
            next();
          }}
        />
      )}

      {step.kind === 'cough_rec' && <CoughRecorder onDone={(c) => (setClip(c), next())} />}

      {step.kind === 'result' && (
        <ResultScreen
          record={record}
          clip={clip}
          saved={saved}
          onSave={save}
          onCard={next}
          onNew={reset}
        />
      )}

      {step.kind === 'card' && (
        <div className="space-y-4">
          <CaregiverCardView record={record} />
          <div className="no-print grid grid-cols-2 gap-3">
            <button className="btn-quiet" onClick={() => window.print()}>
              <Icon name="printer" className="me-2 h-5 w-5" /> {t('print')}
            </button>
            <button className="btn-primary" onClick={reset}>
              {t('new_case')}
            </button>
          </div>
        </div>
      )}

      {idx > 0 && step.kind !== 'card' && (
        <button className="no-print self-start text-sm font-semibold text-ink-soft underline" onClick={back}>
          <span aria-hidden="true" dir="ltr">←</span> {t('back')}
        </button>
      )}
    </div>
  );
}

function englishSummary(input: { patient: { ageMonths: number | null }; symptoms: Symptoms; breathRatePerMin: number | null }, outcome: string): string {
  const yes = Object.entries(input.symptoms)
    .filter(([k, v]) => v === true && k !== 'coughDays')
    .map(([k]) => k);
  const unknown = Object.entries(input.symptoms)
    .filter(([k, v]) => v === null && k !== 'coughDays')
    .map(([k]) => k);
  const age = input.patient.ageMonths === null ? 'unknown age' : `${input.patient.ageMonths} months`;
  return [
    `Field worker intake, ${age}.`,
    yes.length ? `Reported: ${yes.join(', ')}${input.symptoms.coughDays !== null ? ` (cough ${input.symptoms.coughDays} days)` : ''}.` : 'No signs reported.',
    input.breathRatePerMin !== null ? `Breath rate ${input.breathRatePerMin}/min.` : 'Breath rate not counted.',
    unknown.length ? `Not answered: ${unknown.join(', ')}.` : '',
    `Protocol outcome ${outcome}.`,
  ]
    .filter(Boolean)
    .join(' ');
}

function Screen({ title, children, promptKey, promptText }: { title: string; children: React.ReactNode; promptKey?: string; promptText?: string }) {
  const { lang, t } = useT();
  const speakable = useCanSpeak(lang, promptKey);
  return (
    <section className="flex flex-1 flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-3xl font-extrabold leading-tight">{title}</h1>
        {promptKey && speakable && (
          <button
            className="no-print flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-soft text-xl text-teal"
            aria-label={t('play_prompt')}
            onClick={() => speak(lang, promptKey, promptText ?? title)}
          >
            🔊
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function YesNo({ value, onAnswer }: { value: boolean | null; onAnswer: (v: boolean | null) => void }) {
  const { t } = useT();
  return (
    <div className="mt-auto grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <button className={`btn min-h-28 border-4 text-2xl ${value === true ? 'border-teal bg-teal text-paper' : 'border-teal/30 bg-white text-teal'}`} onClick={() => onAnswer(true)}>
          {t('yes')}
        </button>
        <button className={`btn min-h-28 border-4 text-2xl ${value === false ? 'border-teal bg-teal text-paper' : 'border-teal/30 bg-white text-teal'}`} onClick={() => onAnswer(false)}>
          {t('no')}
        </button>
      </div>
      <button className="btn-quiet" onClick={() => onAnswer(null)}>
        {t('not_sure')}
      </button>
    </div>
  );
}

function NumberPad({ unit, initial, max, onDone }: { unit: string; initial: number | null; max: number; onDone: (v: number | null) => void }) {
  const { t } = useT();
  const [v, setV] = useState(initial === null ? '' : String(initial));
  const n = v === '' ? null : Number(v);
  const valid = n !== null && Number.isFinite(n) && n >= 0 && n <= max;
  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-3 rounded-2xl border-2 border-teal/30 bg-white px-4">
        <input
          inputMode="numeric"
          className="min-h-16 w-full bg-transparent text-4xl font-bold outline-none"
          value={v}
          onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
          aria-label={unit}
        />
        <span className="text-xl text-ink-soft">{unit}</span>
      </label>
      <button className="btn-primary" disabled={!valid} onClick={() => onDone(n)}>
        {t('next')}
      </button>
      <button className="btn-quiet" onClick={() => onDone(null)}>
        {t('not_sure')}
      </button>
    </div>
  );
}

function AgeStep({ onDone, initial }: { onDone: (months: number | null) => void; initial: number | null }) {
  const { t } = useT();
  const [unit, setUnit] = useState<'months' | 'years'>('months');
  const [v, setV] = useState(initial === null ? '' : String(initial));
  const n = v === '' ? null : Number(v);
  const months = n === null ? null : unit === 'years' ? n * 12 : n;
  const valid = months !== null && months >= 0 && months <= 240;
  return (
    <Screen title={t('age_title')} promptKey="age" promptText={t('age_title')}>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-ink/5 p-1">
        {(['months', 'years'] as const).map((u) => (
          <button key={u} className={`min-h-12 rounded-xl font-semibold ${unit === u ? 'bg-white text-teal shadow' : 'text-ink-soft'}`} onClick={() => setUnit(u)}>
            {t(`age_${u}`)}
          </button>
        ))}
      </div>
      <input
        inputMode="numeric"
        className="min-h-20 rounded-2xl border-2 border-teal/30 bg-white px-4 text-5xl font-bold outline-none focus:border-teal"
        value={v}
        onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
        aria-label={t('age_title')}
      />
      <button className="btn-primary" disabled={!valid} onClick={() => onDone(months)}>
        {t('next')}
      </button>
      <button className="btn-quiet" onClick={() => onDone(null)}>
        {t('age_unknown')}
      </button>
    </Screen>
  );
}

function BreathCounter({ ageMonths, onDone }: { ageMonths: number | null; onDone: (rate: number | null) => void }) {
  const { t } = useT();
  const [duration, setDuration] = useState<30 | 60>(60);
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(0);
  const [left, setLeft] = useState(0);
  const [finished, setFinished] = useState(false);
  const timer = useRef<number | null>(null);
  const cutoff = fastBreathingCutoff(ageMonths);
  const rate = finished ? Math.round(count * (60 / duration)) : null;

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const start = () => {
    setCount(0);
    setFinished(false);
    setRunning(true);
    const end = Date.now() + duration * 1000;
    setLeft(duration);
    timer.current = window.setInterval(() => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        clearInterval(timer.current!);
        setRunning(false);
        setFinished(true);
        navigator.vibrate?.(200);
      }
    }, 200);
  };

  return (
    <Screen title={t('breath_title')} promptKey="breathing_instructions" promptText={t('breath_instructions')}>
      <p className="text-lg">{t('breath_instructions')}</p>
      {!running && !finished && (
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-ink/5 p-1">
          {([60, 30] as const).map((d) => (
            <button key={d} className={`min-h-12 rounded-xl font-semibold ${duration === d ? 'bg-white text-teal shadow' : 'text-ink-soft'}`} onClick={() => setDuration(d)}>
              {t(d === 60 ? 'breath_60' : 'breath_30')}
            </button>
          ))}
        </div>
      )}
      <button
        className={`relative mx-auto flex aspect-square w-full max-w-xs select-none flex-col items-center justify-center rounded-full border-8 text-paper shadow-lg transition active:scale-95 ${running ? 'border-teal-soft bg-teal' : 'border-teal/20 bg-teal/80'}`}
        onPointerDown={(e) => {
          e.preventDefault();
          if (running) {
            setCount((c) => c + 1);
            navigator.vibrate?.(15);
          } else if (!finished) start();
        }}
        aria-label={t('breath_tap')}
      >
        <span className="text-7xl font-black tabular-nums">{count}</span>
        <span className="mt-1 text-base font-semibold">{running ? `${left} ${t('seconds_short')} · ${t('breath_tap')}` : finished ? t('breath_count') : t('start')}</span>
      </button>
      <dl className="grid grid-cols-2 gap-3 text-center">
        <div className="card p-3">
          <dt className="text-xs text-ink-soft">{t('breath_rate')}</dt>
          <dd className="text-3xl font-extrabold tabular-nums">{rate ?? '—'}</dd>
        </div>
        <div className="card p-3">
          <dt className="text-xs text-ink-soft">{t('breath_cutoff')}</dt>
          <dd className="text-3xl font-extrabold tabular-nums">{cutoff === null ? '—' : `≥ ${cutoff}`}</dd>
        </div>
      </dl>
      {finished && (
        <div className="grid grid-cols-2 gap-3">
          <button className="btn-quiet" onClick={start}>
            {t('breath_redo')}
          </button>
          <button className="btn-primary" onClick={() => onDone(rate)}>
            {t('breath_done')}
          </button>
        </div>
      )}
      {!running && (
        <button className="btn-quiet" onClick={() => onDone(null)}>
          {t('breath_skip')}
        </button>
      )}
    </Screen>
  );
}

function CoughRecorder({ onDone }: { onDone: (c: ClipAnalysis | null) => void }) {
  const { t } = useT();
  const [state, setState] = useState<'idle' | 'recording' | 'analysing' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClipAnalysis | null>(null);

  const run = async (source: () => Promise<Float32Array>) => {
    setError(null);
    try {
      setState('recording');
      const samples = await source();
      setState('analysing');
      const r = await analyseClip(samples);
      if (!r.quality.ok) {
        setError(t(`quality_${r.quality.problem}`));
        setState('idle');
        return;
      }
      setResult(r);
      setState('done');
    } catch {
      setError(t('mic_error'));
      setState('idle');
    }
  };

  return (
    <Screen title={t('cough_title')} promptKey="record_cough" promptText={t('cough_instructions')}>
      <p className="text-lg">{t('cough_instructions')}</p>
      {state === 'recording' && (
        <div className="card text-center">
          <div className="text-xl font-bold text-now">● {t('recording')}</div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full bg-now transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}
      {state === 'analysing' && <div className="card text-center text-ink-soft">…</div>}
      {error && <Banner tone="warn">{error}</Banner>}
      {state === 'done' && result?.score !== undefined && (
        <ExperimentalAudio score={result.score} saliency={result.saliency} spectrogram={result.spectrogram} />
      )}
      <div className="mt-auto grid gap-3">
        {state === 'done' ? (
          <>
            <button className="btn-primary" onClick={() => onDone(result)}>
              {t('next')}
            </button>
            <button className="btn-quiet" onClick={() => (setResult(null), setState('idle'))}>
              {t('rerecord')}
            </button>
          </>
        ) : (
          <>
            <button className="btn-primary" disabled={state !== 'idle'} onClick={() => run(() => recordClip(setProgress))}>
              🎙 {t('record')}
            </button>
            <button className="btn-quiet" disabled={state !== 'idle'} onClick={() => run(loadDemoClip)}>
              {t('use_demo_clip')}
            </button>
            <button className="btn-quiet" disabled={state !== 'idle'} onClick={() => onDone(null)}>
              {t('skip')}
            </button>
          </>
        )}
      </div>
    </Screen>
  );
}

function ResultScreen({ record, clip, saved, onSave, onCard, onNew }: { record: CaseRecord; clip: ClipAnalysis | null; saved: 'no' | 'local' | 'synced'; onSave: () => void; onCard: () => void; onNew: () => void }) {
  const { t, lang } = useT();
  const spoken = useRef(false);
  useEffect(() => {
    if (spoken.current) return;
    spoken.current = true;
    const text = [t(`decision_${record.decision.outcome}`), ...record.decision.reasonKeys.slice(0, 3).map((k) => t(`reason_${k}`))].join('. ');
    void speak(lang, `result_${record.decision.outcome.toLowerCase()}`, text, { auto: true });
  }, [lang, record.decision.outcome, record.decision.reasonKeys, t]);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-sm font-bold uppercase tracking-widest text-ink-soft">{t('result_title')}</h1>
      <DecisionBadge outcome={record.decision.outcome} />
      <div className="card">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-soft">{t('reasons')}</h2>
        <ReasonList keys={record.decision.reasonKeys.slice(0, 3)} lang={lang} />
        {record.needsHumanReview && (
          <div className="mt-4">
            <Banner tone="warn">
              {t('needs_review')}
              {record.missingFields.length > 0 && (
                <span className="mt-1 block text-xs font-normal">
                  {t('missing_fields')}: {record.missingFields.map((field) => t(field === 'ageMonths' ? 'age_title' : field === 'breathRatePerMin' ? 'breath_rate' : `q_${field}`)).join(' · ')}
                </span>
              )}
            </Banner>
          </div>
        )}
      </div>
      <Banner>{t('banner')}</Banner>
      {clip?.score !== undefined && <ExperimentalAudio score={clip.score} saliency={clip.saliency} spectrogram={clip.spectrogram} />}
      <div className="no-print grid gap-3">
        <button className="btn-primary" onClick={onSave} disabled={saved !== 'no'}>
          {saved === 'no' ? t('save') : saved === 'synced' ? `✓ ${t('synced')}` : `✓ ${t('saved')}`}
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn-quiet" onClick={onCard}>
            {t('caregiver_card')}
          </button>
          <button className="btn-quiet" onClick={onNew}>
            {t('new_case')}
          </button>
        </div>
      </div>
    </section>
  );
}
