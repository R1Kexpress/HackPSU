import { useEffect, useState } from 'react';
import { t as tr } from '@aman/content';
import { protocol } from '@aman/protocol';
import { DECISIONS } from '@aman/types';
import { Banner } from './components';

interface Report {
  auroc: number;
  sensitivityAtThreshold: number;
  specificityAtThreshold: number;
  confusionMatrix: { tn: number; fp: number; fn: number; tp: number };
}
interface Metrics {
  limitationsFirst: string[];
  modelVersion: string;
  dataNote: string;
  stabilityNote: string;
  split: { method: string; subjects: Record<string, number>; recordings: Record<string, number>; subjectOverlap: number; recordingLevelSplitUsed: boolean };
  groupedCrossValidation: { method: string; aurocPerFold: number[]; aurocMean: number; aurocStd: number };
  experimentalResearchThreshold: { value: number; selectionRule: string; usedByDecision: boolean };
  validation: Report;
  test: Report;
}

export function Limits() {
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch('/models/metrics.json')
      .then((r) => r.json())
      .then(setM)
      .catch(() => setErr(true));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <h1 className="text-3xl font-extrabold">Model limits</h1>
      <div className="rounded-3xl border-4 border-now bg-now-bg p-5 text-now">
        <h2 className="text-lg font-extrabold">Read this first</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 font-medium">
          {(m?.limitationsFirst ?? [
            'synthetic tones; not children; not phone cough; not used for referral.',
          ]).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
      <div className="card space-y-2">
        <h2 className="text-lg font-bold">How the referral decision is made</h2>
        <p>
          Only the rule-based protocol decides between {DECISIONS.map((d) => `“${tr('en', `decision_${d}`)}”`).join(', ')}, using the published child-illness chart cutoffs in <code>protocol.json</code> (version {protocol.version}).
        </p>
        <p>
          Experimental audio score - information only. It does not change the referral decision. {protocol.audio.note}
        </p>
        <p>Missing answers never produce a home-care result. The language model used for voice notes only transcribes and extracts facts; it never picks the outcome.</p>
      </div>
      {err && <Banner tone="warn">Could not load metrics.json.</Banner>}
      {m && (
        <>
          <div className="card space-y-2 text-sm">
            <h2 className="text-lg font-bold">Training data and split</h2>
            <p>{m.dataNote}</p>
            <p>
              <b>Split:</b> {m.split.method}. Subject overlap between splits: {m.split.subjectOverlap}. Recording-level split used: {m.split.recordingLevelSplitUsed ? 'yes' : 'no'}.
            </p>
            <table className="w-full text-left">
              <thead>
                <tr className="text-ink-soft">
                  <th className="py-1">Split</th>
                  <th>Subjects</th>
                  <th>Recordings</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(m.split.subjects).map((k) => (
                  <tr key={k} className="border-t border-ink/10">
                    <td className="py-1">{k}</td>
                    <td>{m.split.subjects[k]}</td>
                    <td>{m.split.recordings[k]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card space-y-3 text-sm">
            <h2 className="text-lg font-bold">Synthetic-tone separation metrics ({m.modelVersion})</h2>
            <p className="text-ink-soft">{m.stabilityNote}</p>
            <p>
              <b>Grouped cross-validation AUROC:</b> {m.groupedCrossValidation.aurocMean} ± {m.groupedCrossValidation.aurocStd} (folds: {m.groupedCrossValidation.aurocPerFold.join(', ')})
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['validation', 'test'] as const).map((k) => (
                <div key={k} className="rounded-2xl bg-ink/5 p-3">
                  <div className="font-bold capitalize">{k} subjects</div>
                  <div>AUROC {m[k].auroc}</div>
                  <div>
                    Sensitivity {m[k].sensitivityAtThreshold} at specificity {m[k].specificityAtThreshold}
                  </div>
                  <div className="mt-1 font-mono text-xs">
                    TN {m[k].confusionMatrix.tn} · FP {m[k].confusionMatrix.fp} · FN {m[k].confusionMatrix.fn} · TP {m[k].confusionMatrix.tp}
                  </div>
                </div>
              ))}
            </div>
            <p>
              A research operating point on synthetic validation tones is {m.experimentalResearchThreshold.value}. It is not an active threshold and it is not used for referral ({m.experimentalResearchThreshold.usedByDecision ? 'used by the decision' : 'not used by the decision'}).
            </p>
          </div>
        </>
      )}
      <div className="card text-sm">
        <h2 className="text-lg font-bold">What real use would need</h2>
        <p>
          Real pediatric phone-cough data with consent, subject-level evaluation, trials with health workers, alignment with the national IMNCI booklet, clinician review of every translation, and data protection. SPRSound is not used. If it is mentioned, label it stethoscope lung-sound results; not phone-cough validation, and require patient-level splits.
        </p>
      </div>
    </div>
  );
}
