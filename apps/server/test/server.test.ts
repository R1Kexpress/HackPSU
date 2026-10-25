import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evaluate } from '@aman/protocol';
import type { CaseRecord } from '@aman/types';
import { TABLE, mk } from '../../../packages/protocol/test/cases';
import { buildApp } from '../src/app';
import { openDb } from '../src/db';
import { pickClinic } from '../src/routing';
import { buildVoiceCase, applyFollowup, nextFollowup, VoiceUnavailableError, type Extraction } from '../src/voice';

const PIN = 'test-pin';
const H = { 'x-dashboard-pin': PIN };

const blankExtraction: Extraction = {
  language: 'ur',
  unclear: false,
  transcript: 'synthetic transcript',
  englishSummary: 'Synthetic: child has a cough for 2 days.',
  ageMonths: null,
  cough: true,
  coughDays: 2,
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

function submission(overrides: Partial<CaseRecord> = {}, input = mk()) {
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    source: 'field_app',
    language: 'en',
    ...input,
    summary: { english: 'Synthetic test case' },
    location: { lat: 31.45, lng: 74.23 },
    ...overrides,
  };
}

let ctx: ReturnType<typeof buildApp>;
beforeEach(() => {
  ctx = buildApp({ db: openDb(':memory:'), dashboardPin: PIN, extractor: async () => blankExtraction });
});
afterEach(async () => {
  await ctx.app.close();
});

describe('shared protocol table on the server', () => {
  for (const c of TABLE) {
    it(`server stores the protocol decision: ${c.name}`, async () => {
      const res = await ctx.app.inject({ method: 'POST', url: '/api/cases', payload: submission({}, c.input) });
      expect(res.statusCode).toBe(201);
      const body = res.json() as CaseRecord;
      expect(body.decision.outcome).toBe(c.outcome);
      expect(body.decision.reasonKeys).toEqual(c.reasons);
      expect(body.decision.audioEscalated).toBe(false);
    });
  }
});

describe('cases API', () => {
  it('ignores the client decision and recomputes it', async () => {
    const payload = submission({ decision: { outcome: 'HOME', reasonKeys: [], protocolVersion: 'x', audioEscalated: false } } as never, mk({ s: { convulsions: true } }));
    const body = (await ctx.app.inject({ method: 'POST', url: '/api/cases', payload })).json();
    expect(body.decision.outcome).toBe('GO_NOW');
  });

  it('a maximal audio score never escalates and is kept for display only', async () => {
    const payload = submission(
      { audio: { score: 1, modelVersion: 'test', experimental: true }, decision: { outcome: 'HOME', reasonKeys: ['no_concerning_signs'], protocolVersion: 'x', audioEscalated: false } } as never,
      mk({ s: { cough: true, coughDays: 2 } }),
    );
    const body = (await ctx.app.inject({ method: 'POST', url: '/api/cases', payload })).json();
    expect(body.decision.outcome).toBe('HOME');
    expect(body.decision.reasonKeys).not.toContain('audio_abnormal_sounds');
    expect(body.decision.audioEscalated).toBe(false);
    expect(body.audio.score).toBe(1);
  });

  it('an out-of-range audio score does not change the decision', async () => {
    const payload = submission({ audio: { score: 4, modelVersion: 'test', experimental: true } } as never, mk({ s: { cough: true, coughDays: 2 } }));
    const body = (await ctx.app.inject({ method: 'POST', url: '/api/cases', payload })).json();
    expect(body.decision.outcome).toBe('HOME');
    expect(body.decision.audioEscalated).toBe(false);
  });

  it('audio never downgrades a GO_NOW decision', async () => {
    const payload = submission({ audio: { score: 0, modelVersion: 'test', experimental: true } } as never, mk({ s: { convulsions: true } }));
    const body = (await ctx.app.inject({ method: 'POST', url: '/api/cases', payload })).json();
    expect(body.decision.outcome).toBe('GO_NOW');
    expect(body.decision.audioEscalated).toBe(false);
  });

  it('upsert is idempotent and keeps clinic status on re-post', async () => {
    const payload = submission();
    expect((await ctx.app.inject({ method: 'POST', url: '/api/cases', payload })).statusCode).toBe(201);
    await ctx.app.inject({ method: 'PATCH', url: `/api/cases/${payload.id}`, headers: H, payload: { status: 'en_route' } });
    const again = await ctx.app.inject({ method: 'POST', url: '/api/cases', payload: { ...payload, status: 'new' } });
    expect(again.statusCode).toBe(200);
    expect(again.json().status).toBe('en_route');
    const list = (await ctx.app.inject({ method: 'GET', url: '/api/cases', headers: H })).json();
    expect(list).toHaveLength(1);
  });

  it('sorts GO_NOW first, then younger, unknown age last, then oldest first', async () => {
    const t0 = '2026-10-24T18:00:00.000Z';
    const t1 = '2026-10-24T18:05:00.000Z';
    const posts = [
      submission({ createdAt: t0, summary: { english: 'home-24' } } as never, mk()),
      submission({ createdAt: t1, summary: { english: 'go-36' } } as never, mk({ age: 36, s: { convulsions: true } })),
      submission({ createdAt: t1, summary: { english: 'go-6' } } as never, mk({ age: 6, s: { convulsions: true } })),
      submission({ createdAt: t0, summary: { english: 'soon-null' } } as never, mk({ age: null })),
      submission({ createdAt: t1, summary: { english: 'soon-12-late' } } as never, mk({ age: 12, s: { fever: true } })),
      submission({ createdAt: t0, summary: { english: 'soon-12-early' } } as never, mk({ age: 12, s: { fever: true } })),
    ];
    for (const p of posts) await ctx.app.inject({ method: 'POST', url: '/api/cases', payload: p });
    const list = (await ctx.app.inject({ method: 'GET', url: '/api/cases', headers: H })).json() as CaseRecord[];
    expect(list.map((c) => c.summary.english)).toEqual(['go-6', 'go-36', 'soon-12-early', 'soon-12-late', 'soon-null', 'home-24']);
  });

  it('filters by status and rejects an unknown status', async () => {
    await ctx.app.inject({ method: 'POST', url: '/api/cases', payload: submission() });
    expect((await ctx.app.inject({ method: 'GET', url: '/api/cases?status=closed', headers: H })).json()).toHaveLength(0);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/cases?status=bogus', headers: H })).statusCode).toBe(400);
  });

  it('dashboard endpoints need the PIN; field sync does not', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/cases' })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/clinics' })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/stream?pin=wrong' })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: `/api/clinics?pin=${PIN}` })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/cases', payload: submission() })).statusCode).toBe(201);
  });

  it('rejects invalid bodies', async () => {
    expect((await ctx.app.inject({ method: 'POST', url: '/api/cases', payload: { id: 'nope' } })).statusCode).toBe(400);
  });

  it('emits events for live updates', async () => {
    const seen: string[] = [];
    ctx.listeners.add((e) => seen.push(e.type));
    const p = submission();
    await ctx.app.inject({ method: 'POST', url: '/api/cases', payload: p });
    await ctx.app.inject({ method: 'PATCH', url: `/api/cases/${p.id}`, headers: H, payload: { status: 'arrived' } });
    expect(seen).toEqual(['case_upserted', 'case_updated']);
  });
});

describe('routing', () => {
  it('assigns the nearest clinic with capacity and decrements capacity', async () => {
    const p = submission({ language: 'ur' } as never, mk({ s: { convulsions: true } }));
    await ctx.app.inject({ method: 'POST', url: '/api/cases', payload: p });
    const routed = (await ctx.app.inject({ method: 'POST', url: `/api/cases/${p.id}/route`, headers: H })).json();
    expect(routed.clinicId).toBe('pk-lhr');
    expect(routed.routingNote).toMatch(/Nearest clinic with capacity/);
    const clinics = (await ctx.app.inject({ method: 'GET', url: '/api/clinics', headers: H })).json();
    expect(clinics.find((c: { id: string }) => c.id === 'pk-lhr').capacityRemaining).toBe(3);
  });

  it('skips clinics with no capacity', () => {
    const c = { ...submission(), decision: { outcome: 'GO_NOW' }, location: { lat: 31.7131, lng: 73.9783 } } as unknown as CaseRecord;
    const choice = pickClinic(c, [
      { id: 'full', name: 'Full', lat: 31.7131, lng: 73.9783, capacityRemaining: 0, languages: ['en'], region: 'x', synthetic: true },
      { id: 'far', name: 'Far', lat: 31.45, lng: 74.23, capacityRemaining: 1, languages: ['en'], region: 'x', synthetic: true },
    ]);
    expect(choice?.clinic.id).toBe('far');
  });

  it('GO_NOW weights distance over language more than REFER_SOON does', () => {
    const near = { id: 'near', name: 'Near', lat: 31.5, lng: 74.3, capacityRemaining: 1, languages: ['am' as const], region: 'x', synthetic: true as const };
    const far = { id: 'far', name: 'Far', lat: 31.7, lng: 74.3, capacityRemaining: 1, languages: ['ur' as const], region: 'x', synthetic: true as const };
    const base = { ...submission({ language: 'ur' } as never), location: { lat: 31.5, lng: 74.3 } } as unknown as CaseRecord;
    expect(pickClinic({ ...base, decision: { ...evaluate(mk()), outcome: 'GO_NOW' } } as CaseRecord, [near, far])?.clinic.id).toBe('near');
    expect(pickClinic({ ...base, decision: { ...evaluate(mk()), outcome: 'REFER_SOON' } } as CaseRecord, [near, far])?.clinic.id).toBe('far');
  });
});

describe('voice intake', () => {
  it('builds a case from extraction, never HOME without an observer, and asks follow-ups', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/voice-intake', headers: { ...H, 'content-type': 'audio/ogg' }, payload: Buffer.from('fake-audio') });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.case.source).toBe('voice_note');
    expect(body.case.summary.transcript).toBe('synthetic transcript');
    expect(body.case.decision.outcome).toBe('REFER_SOON');
    expect(body.case.needsHumanReview).toBe(true);
    expect(body.nextQuestion).toBe('ageMonths');

    const ans = await ctx.app.inject({ method: 'POST', url: `/api/voice-intake/${body.case.id}/answer`, headers: H, payload: { field: 'convulsions', value: true } });
    expect(ans.json().case.decision.outcome).toBe('GO_NOW');
  });

  it('age bucket answers are approximate and flag review', () => {
    const c = applyFollowup(buildVoiceCase(blankExtraction), 'ageMonths', 12);
    expect(c.patient).toEqual({ ageMonths: 12, ageApproximate: true });
    expect(c.needsHumanReview).toBe(true);
    expect(nextFollowup(c)).toBe('unableToDrinkOrFeed');
  });

  it('a fully answered voice case still is not HOME because observer-only fields stay unknown', () => {
    let c = buildVoiceCase({ ...blankExtraction, ageMonths: 24, fever: false, difficultyBreathing: false, chestIndrawing: false, stridorWhenCalm: false, unableToDrinkOrFeed: false, vomitsEverything: false, convulsions: false, unusuallySleepyOrUnconscious: false, diarrhea: false });
    expect([...c.missingFields].sort()).toEqual(['breathRatePerMin', 'chestIndrawing', 'stridorWhenCalm']);
    expect(c.decision.outcome).toBe('REFER_SOON');
    c = buildVoiceCase({ ...blankExtraction, unclear: true });
    expect(c.needsHumanReview).toBe(true);
    expect(c.summary.english).toMatch(/human review required/);
  });

  const allAnsweredNoCough: Extraction = {
    ...blankExtraction,
    ageMonths: 24,
    cough: false,
    coughDays: null,
    fever: false,
    difficultyBreathing: false,
    chestIndrawing: false,
    stridorWhenCalm: false,
    unableToDrinkOrFeed: false,
    vomitsEverything: false,
    convulsions: false,
    unusuallySleepyOrUnconscious: false,
    diarrhea: false,
  };

  it('everything answered and no cough still yields REFER_SOON with review, never HOME', async () => {
    const c = buildVoiceCase(allAnsweredNoCough);
    expect(c.decision.outcome).toBe('REFER_SOON');
    expect(c.decision.reasonKeys).toEqual(['missing_critical_data']);
    expect(c.needsHumanReview).toBe(true);
    expect(c.breathRatePerMin).toBeNull();

    const app2 = buildApp({ db: openDb(':memory:'), dashboardPin: PIN, extractor: async () => allAnsweredNoCough });
    const res = await app2.app.inject({ method: 'POST', url: '/api/voice-intake', headers: { ...H, 'content-type': 'audio/ogg' }, payload: Buffer.from('x') });
    expect(res.json().case.decision.outcome).toBe('REFER_SOON');
    expect(res.json().case.needsHumanReview).toBe(true);
    await app2.app.close();
  });

  it('ignores chest indrawing = false (and stridor) from Gemini; they stay unknown', () => {
    const c = buildVoiceCase({ ...blankExtraction, chestIndrawing: false, stridorWhenCalm: false });
    expect(c.symptoms.chestIndrawing).toBeNull();
    expect(c.symptoms.stridorWhenCalm).toBeNull();
    expect(c.missingFields).toContain('chestIndrawing');
    expect(c.decision.outcome).toBe('REFER_SOON');
    expect(c.needsHumanReview).toBe(true);
  });

  it('follow-up answers cannot bring a voice case to HOME', () => {
    let c = buildVoiceCase({ ...allAnsweredNoCough, ageMonths: null });
    c = applyFollowup(c, 'ageMonths', 24);
    expect(c.decision.outcome).toBe('REFER_SOON');
    expect(c.symptoms.chestIndrawing).toBeNull();
    expect(c.needsHumanReview).toBe(true);
  });

  it('unsupported language is flagged for review', () => {
    const c = buildVoiceCase({ ...blankExtraction, language: 'other' });
    expect(c.needsHumanReview).toBe(true);
    expect(c.language).toBe('en');
  });

  it('returns 503 when Gemini is not configured', async () => {
    const app2 = buildApp({
      db: openDb(':memory:'),
      dashboardPin: PIN,
      extractor: async () => {
        throw new VoiceUnavailableError('GEMINI_API_KEY is not set');
      },
    });
    const res = await app2.app.inject({ method: 'POST', url: '/api/voice-intake', headers: { ...H, 'content-type': 'audio/ogg' }, payload: Buffer.from('x') });
    expect(res.statusCode).toBe(503);
    await app2.app.close();
  });
});
