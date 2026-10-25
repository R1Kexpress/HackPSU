import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkClipQuality,
  CLIP_SAMPLES,
  decodeWav16,
  extractFeatures,
  occlusionSaliency,
  scoreFeatures,
  type HeadWeights,
} from '../src/index';

const repo = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const head = JSON.parse(readFileSync(repo('apps/web/public/models/head.json'), 'utf8')) as HeadWeights;
const golden = JSON.parse(readFileSync(repo('ml/fixtures/golden.json'), 'utf8')) as { features: number[]; score: number; modelVersion: string };
const wavBuf = readFileSync(repo('ml/fixtures/golden.wav'));
const wav = decodeWav16(wavBuf.buffer.slice(wavBuf.byteOffset, wavBuf.byteOffset + wavBuf.byteLength));

describe('Python / browser parity on the golden wav', () => {
  it('decodes a 10 s, 16 kHz clip', () => {
    expect(wav.rate).toBe(16000);
    expect(wav.samples.length).toBe(CLIP_SAMPLES);
  });

  it('features match Python within tolerance', () => {
    const f = extractFeatures(wav.samples);
    expect(f.length).toBe(golden.features.length);
    for (let i = 0; i < f.length; i++) expect(Math.abs(f[i] - golden.features[i])).toBeLessThan(1e-6);
  });

  it('score matches Python within tolerance', () => {
    expect(head.modelVersion).toBe(golden.modelVersion);
    expect(Math.abs(scoreFeatures(extractFeatures(wav.samples), head) - golden.score)).toBeLessThan(1e-6);
  });

  it('exported head is experimental and does not itself name an outcome', () => {
    expect(head.experimental).toBe(true);
    expect(head.usedForReferral).toBe(false);
  });
});

describe('saliency and quality', () => {
  it('occlusion gives one value per second', () => {
    const { saliency, score } = occlusionSaliency(wav.samples, head);
    expect(saliency).toHaveLength(10);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('rejects silence and clipping, accepts the golden clip', () => {
    expect(checkClipQuality(new Float32Array(CLIP_SAMPLES)).problem).toBe('mostly_silent');
    expect(checkClipQuality(new Float32Array(CLIP_SAMPLES).fill(1)).problem).toBe('clipped');
    expect(checkClipQuality(new Float32Array(1000)).problem).toBe('too_short');
    expect(checkClipQuality(wav.samples).ok).toBe(true);
  });
});

describe('ml/metrics.json honesty', () => {
  const m = JSON.parse(readFileSync(repo('ml/metrics.json'), 'utf8'));

  it('uses subject-level splits with zero overlap', () => {
    expect(m.split.unit).toBe('subject');
    expect(m.split.recordingLevelSplitUsed).toBe(false);
    expect(m.split.subjectOverlap).toBe(0);
    const ids = m.split.subjectIds as Record<string, string[]>;
    const all = [...ids.train, ...ids.validation, ...ids.test];
    expect(new Set(all).size).toBe(all.length);
    expect(m.split.recordings.train).toBeGreaterThan(m.split.subjects.train);
  });

  it('leads with the synthetic-tone limit and records a research threshold the decision never uses', () => {
    expect(m.limitationsFirst[0]).toMatch(/Synthetic tones/);
    expect(m.limitationsFirst.join(' ')).toMatch(/Not children/);
    expect(m.dataNote).toMatch(/not clinical performance/i);
    expect(m.dataNote).toMatch(/synthetic tones only/i);
    expect(m.tauHigh).toBeUndefined();
    expect(m.experimentalResearchThreshold.value).toBeGreaterThan(0);
    expect(m.experimentalResearchThreshold.value).toBeLessThanOrEqual(1);
    expect(m.thresholdSelection.chosenOn).toBe('validation subjects');
    expect(m.thresholdSelection.rule).toMatch(/specificity >= 0\.80/);
    expect(m.thresholdSelection.rule).toMatch(/Youden/);
    expect(m.thresholdSelection.value).toBe(m.experimentalResearchThreshold.value);
    expect(m.usedForReferral).toBe(false);
    expect(m.experimentalResearchThreshold.usedByDecision).toBe(false);
    expect(m.limitationsFirst.join(' ')).not.toMatch(/raise HOME|REFER_SOON when/);
    const web = JSON.parse(readFileSync(repo('apps/web/public/models/metrics.json'), 'utf8'));
    expect(web).toEqual(m);
    const protocol = JSON.parse(readFileSync(repo('packages/protocol/protocol.json'), 'utf8'));
    expect(protocol.tauHigh).toBeUndefined();
    expect(protocol.audio.escalationEnabled).toBe(false);
  });

  it('never presents SPRSound as phone-cough validation', () => {
    expect(m.dataNote).toMatch(/SPRSound is pediatric stethoscope lung-sound audio, not phone cough/);
  });
});
