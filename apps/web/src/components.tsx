import { useEffect, useRef, type ReactNode } from 'react';
import { caregiverCard, reasonText, t as tr } from '@aman/content';
import type { CaseRecord, Decision, Lang } from '@aman/types';
import { useT } from './i18n';
import { Icon } from './Icon';

const DECISION_ICON = { HOME: 'home', REFER_SOON: 'clock', GO_NOW: 'warning' } as const;

export const DECISION_STYLE: Record<Decision, { fg: string; bg: string; ring: string; icon: string }> = {
  HOME: { fg: 'text-home', bg: 'bg-home-bg', ring: 'border-home', icon: '⌂' },
  REFER_SOON: { fg: 'text-soon', bg: 'bg-soon-bg', ring: 'border-soon', icon: '◷' },
  GO_NOW: { fg: 'text-now', bg: 'bg-now-bg', ring: 'border-now', icon: '!' },
};

export function Banner({ children, tone = 'teal' }: { children: ReactNode; tone?: 'teal' | 'warn' }) {
  const cls = tone === 'warn' ? 'bg-soon-bg text-soon border-soon/30' : 'bg-teal-soft text-teal border-teal/20';
  return <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${cls}`}>{children}</div>;
}

export function DecisionBadge({ outcome, lang, size = 'lg' }: { outcome: Decision; lang?: Lang; size?: 'sm' | 'lg' }) {
  const { t } = useT();
  const s = DECISION_STYLE[outcome];
  const label = lang ? tr(lang, `decision_${outcome}`) : t(`decision_${outcome}`);
  if (size === 'sm') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${s.fg} ${s.bg} ${s.ring}`}>
        <span aria-hidden>{s.icon}</span>
        {label}
      </span>
    );
  }
  return (
    <div className={`flex items-center gap-4 rounded-3xl border-4 p-5 ${s.bg} ${s.ring}`}>
      <span aria-hidden className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-3xl font-black ${s.fg}`}>
        {s.icon}
      </span>
      <div>
        <div className={`text-2xl font-extrabold leading-tight ${s.fg}`}>{label}</div>
      </div>
    </div>
  );
}

export function ReasonList({ keys, lang }: { keys: string[]; lang: Lang }) {
  return (
    <ul className="space-y-2">
      {keys.map((k) => (
        <li key={k} className="flex gap-2 text-base leading-snug">
          <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-ink/60" />
          <span>{reasonText(lang, k)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Spectrogram({ frames }: { frames: Float64Array[] }) {
  const { t } = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || frames.length === 0) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const w = frames.length;
    const h = frames[0].length;
    c.width = w;
    c.height = h;
    let lo = Infinity;
    let hi = -Infinity;
    for (const f of frames) for (const v of f) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const img = ctx.createImageData(w, h);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const v = (frames[x][h - 1 - y] - lo) / (hi - lo || 1);
        const i = (y * w + x) * 4;
        img.data[i] = 15 + 220 * v;
        img.data[i + 1] = 76 + 150 * v;
        img.data[i + 2] = 74 + 80 * (1 - v);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [frames]);
  return <canvas ref={ref} className="h-20 w-full rounded-lg [image-rendering:pixelated]" aria-label={t('spectrogram_label')} />;
}

export function SaliencyStrip({ values }: { values: number[] }) {
  const { t } = useT();
  const max = Math.max(1e-9, ...values.map((v) => Math.abs(v)));
  return (
    <div className="flex gap-0.5" role="img" aria-label={t('saliency_label')}>
      {values.map((v, i) => {
        const a = Math.abs(v) / max;
        return (
          <div key={i} className="flex-1 text-center">
            <div className="h-5 rounded" style={{ background: v >= 0 ? `rgba(138,90,0,${0.1 + 0.9 * a})` : `rgba(15,76,74,${0.1 + 0.9 * a})` }} />
            <div className="mt-0.5 text-[10px] text-ink-soft">{i + 1} {t('seconds_short')}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Display only. The score does not change the referral decision. Pass modelVersion on staff screens only. */
export function ExperimentalAudio({ score, saliency, spectrogram, modelVersion }: { score: number; saliency?: number[]; spectrogram?: Float64Array[]; modelVersion?: string }) {
  const { t } = useT();
  return (
    <section className="rounded-2xl border-2 border-dashed border-ink/20 bg-paper-deep/60 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">{t('experimental_audio_title')}</h3>
        <span className="font-mono text-lg font-semibold text-ink-soft">{score.toFixed(2)}</span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">{t('experimental_audio_body')}</p>
      {spectrogram && spectrogram.length > 0 && (
        <div className="mt-3">
          <Spectrogram frames={spectrogram} />
        </div>
      )}
      {saliency && saliency.length > 0 && (
        <div className="mt-2">
          <SaliencyStrip values={saliency} />
          <p className="mt-1 text-xs text-ink-soft">{t('saliency_caption')}</p>
        </div>
      )}
      {modelVersion && <p className="mt-2 text-xs text-ink-soft">{modelVersion}</p>}
    </section>
  );
}

export function CaregiverCardView({ record, clinicName }: { record: CaseRecord; clinicName?: string }) {
  const { t, dir, lang } = useT();
  const card = caregiverCard(lang, record.decision.outcome, record.symptoms, clinicName);
  const s = DECISION_STYLE[record.decision.outcome];
  return (
    <article dir={dir} lang={lang} className={`print-card card border-[3px] ${s.ring}`}>
      <header className="flex items-center gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${s.bg} ${s.fg}`}>
          <Icon name={DECISION_ICON[record.decision.outcome]} />
        </span>
        <h2 className={`text-[1.375rem] font-bold leading-tight ${s.fg}`}>{card.title}</h2>
      </header>
      <ul className="mt-4 space-y-4 text-base leading-relaxed">
        {card.lines.map((l) => (
          <li key={l} className="flex gap-3">
            <Icon name={l === t('card_medicine') ? 'medicine' : l === t('card_go_now_travel') ? 'clinic' : 'heart'} className="mt-1 h-6 w-6 text-teal" />
            <span>{l}</span>
          </li>
        ))}
      </ul>
      <h3 className="mt-5 flex items-start gap-3 text-base font-bold leading-snug"><Icon name="warning" className="h-6 w-6 text-now" />{card.returnTitle}</h3>
      <ul className="mt-3 grid gap-3 text-base sm:grid-cols-2">
        {card.returnSigns.map((r) => (
          <li key={r} className="rounded-xl bg-now-bg px-3 py-2 text-now">
            {r}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-start gap-3 text-base leading-snug">
        <Icon name="location" className="h-6 w-6 text-teal" />
        <p><span className="font-bold">{t('card_where')}: </span>{card.where}</p>
      </div>
      <footer className="mt-5 space-y-1 border-t border-ink/10 pt-3 text-xs text-ink-soft">
        <p>{t('banner')}</p>
        {card.draft && <p className="font-semibold text-soon">{t('draft_translation')}</p>}
      </footer>
    </article>
  );
}
