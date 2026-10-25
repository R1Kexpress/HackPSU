import { useEffect, useState } from 'react';
import { AGE_BUCKETS, caregiverCard, reasonText, t as tr } from '@aman/content';
import type { CaseRecord } from '@aman/types';
import { Banner, DecisionBadge } from './components';
import { saveFamilyResult } from './CostOptions';
import { useT } from './i18n';
import { navigate } from './router';

interface VoiceResponse {
  case: CaseRecord;
  nextQuestion: string | null;
}

export function Voice() {
  const { t } = useT();
  const [pin, setPin] = useState(() => sessionStorage.getItem('aman.dashboardPin') ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<VoiceResponse | null>(null);

  const call = async (url: string, init: RequestInit) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { ...init, headers: { 'x-dashboard-pin': pin, ...(init.headers ?? {}) } });
      // Server errors are English developer text; families get a translated message instead.
      if (!res.ok) {
        setError(t(res.status === 401 ? 'voice_error_pin' : 'voice_error'));
        return;
      }
      setResp(await res.json());
      sessionStorage.setItem('aman.dashboardPin', pin);
    } catch {
      setError(t('voice_error'));
    } finally {
      setBusy(false);
    }
  };

  const answer = (field: string, value: boolean | number) =>
    call(`/api/voice-intake/${resp!.case.id}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field, value }) });

  const c = resp?.case;
  const L = c?.language ?? 'en';
  const finished = !!c && !resp?.nextQuestion;
  useEffect(() => {
    if (finished && c) saveFamilyResult({ caseId: c.id, outcome: c.decision.outcome, language: c.language, protocolVersion: c.decision.protocolVersion });
  }, [finished, c]);
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <h1 className="text-3xl font-extrabold">{t('voice_title')}</h1>
      <p className="text-ink-soft">{t('voice_body')}</p>
      <Banner tone="warn">{t('synthetic_banner')}</Banner>
      <div className="card space-y-3">
        <input className="min-h-12 w-full rounded-xl border-2 border-teal/30 bg-white px-3" type="password" placeholder={t('dashboard_pin')} value={pin} onChange={(e) => setPin(e.target.value)} aria-label={t('dashboard_pin')} />
        <input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" aria-label={t('voice_file')} />
        <button className="btn-primary w-full" disabled={!file || busy} onClick={() => call('/api/voice-intake', { method: 'POST', headers: { 'Content-Type': file!.type || 'audio/ogg' }, body: file })}>
          {busy ? '…' : t('voice_upload')}
        </button>
      </div>
      {error && <Banner tone="warn">{error}</Banner>}
      {c && (
        <div className="space-y-4" lang={L} dir={L === 'ur' ? 'rtl' : 'ltr'}>
          {resp?.nextQuestion ? (
            <div className="card space-y-3">
              <p className="font-semibold">{tr(L, 'voice_followup')}</p>
              <p className="text-2xl font-bold">{tr(L, resp.nextQuestion === 'ageMonths' ? 'age_title' : `q_${resp.nextQuestion}`)}</p>
              {resp.nextQuestion === 'ageMonths' ? (
                <div className="grid gap-2">
                  {AGE_BUCKETS.map((b) => (
                    <button key={b.key} className="btn-quiet" disabled={busy} onClick={() => answer('ageMonths', b.ageMonths)}>
                      {tr(L, b.key)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button className="btn-primary" disabled={busy} onClick={() => answer(resp.nextQuestion!, true)}>
                    {tr(L, 'yes')}
                  </button>
                  <button className="btn-quiet" disabled={busy} onClick={() => answer(resp.nextQuestion!, false)}>
                    {tr(L, 'no')}
                  </button>
                </div>
              )}
            </div>
          ) : null}
          <DecisionBadge outcome={c.decision.outcome} lang={L} />
          <div className="card space-y-2">
            {c.decision.reasonKeys.map((k) => (
              <p key={k}>• {reasonText(L, k)}</p>
            ))}
            {c.needsHumanReview && <Banner tone="warn">{tr(L, 'needs_review')}</Banner>}
          </div>
          {finished && (
            <button className="btn-primary w-full" onClick={() => navigate('/costs')}>
              {tr(L, 'see_costs')}
            </button>
          )}
          <div className="card space-y-1 text-sm">
            <p className="font-semibold">{caregiverCard(L, c.decision.outcome, c.symptoms).title}</p>
            {caregiverCard(L, c.decision.outcome, c.symptoms).lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
          <details className="card text-sm">
            <summary className="cursor-pointer font-semibold">{tr(L, 'voice_review')}</summary>
            <p className="mt-2" dir="ltr" lang="en">{c.summary.english}</p>
            <p className="mt-2" lang={L} dir={L === 'ur' ? 'rtl' : 'ltr'}>
              {c.summary.transcript}
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
