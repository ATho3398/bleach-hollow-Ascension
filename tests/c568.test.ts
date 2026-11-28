// C.568 (GDD 8-5 v6.254 — 사용자 2026-11-28 "진화 할건지 물어보지 말고 … 화면 3번 연속 터치하면 진화 취소할거냐 묻고 …"):
// 옛 [진화][미루기] 창 폐지 → 귀환하면 곧바로 진화 연출(애니만). 3번 연달아 터치 → 취소 확인. 취소하면 그 순간 후보 진화체를 배제,
// 다른 진화체 조건을 채울 때까지 연출 없음. 마지막 취소 뒤 원정 7번 귀환에도 진화 못 하면 배제를 풀고 강제 진화(터치 취소 없음). 형식 101
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BALANCE } from '../src/config/balance';
import { newBuild, gainTrait } from '../src/engine/absorb/build';
import { judgeCandidates, stepsNeeded } from '../src/engine/evolution';
import { createExpedition, type ExpeditionState } from '../src/engine/expedition';
import { tapCounter } from '../src/ui/evolutionPanel';
import {
  cancelEvolution, evolutionCancelAllowed, evolutionReady, evolveAfterReturn, loadSave, migrateSave, newSaveData, pendingEvolution, recordExpedition,
  SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, type SaveData,
} from '../src/game';

const C = BALANCE.provisional.evolution.cancel;
const H = BALANCE.provisional.evolution.hidden;

/** 튜토리얼 안내를 마친 3단계(물) 몸 + 걸음이 진화 기준에 닿았다 */
function grown(faction: 'hollow' | 'shinigami' = 'hollow'): SaveData {
  const s = newSaveData(faction, 1_000);
  for (const k of Object.keys(s.help.guides)) s.help.guides[k as keyof typeof s.help.guides] = 'done';
  s.build = newBuild();
  for (let i = 0; i < 4; i++) s.build.slots.push(null);
  gainTrait(s.build, 't-water-a');
  s.nest.hunger = 20;
  s.nest.condition = 80;
  const e = s.evolution;
  e.tierIndex = 2;
  e.formHistory = ['t2:base', 't3:water'];
  e.formId = 't3:water';
  e.steps = stepsNeeded(e)!;
  return s;
}

let runId = 100;
function ended(s: SaveData, outcome: 'returned' | 'defeated' = 'returned', extra: Partial<ExpeditionState> = {}): ExpeditionState {
  const exp = createExpedition({ factionId: s.factionId, seed: 7, hunger: 20, condition: 80, deck: [], build: s.build, evolution: s.evolution });
  Object.assign(exp, { phase: 'ended', outcome, endReason: outcome, lapsCompleted: 1, runId: ++runId }, extra);
  return exp;
}

/** 원정 한 번 다녀와 귀환 정산 (화면과 같은 holdEvolution) */
const back = (s: SaveData, outcome: 'returned' | 'defeated' = 'returned', extra: Partial<ExpeditionState> = {}) =>
  recordExpedition(s, ended(s, outcome, extra), 2_000 + runId, { holdEvolution: true });

function reload(s: SaveData): SaveData {
  const m = new Map<string, string>([['k', JSON.stringify(s)]]);
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  return loadSave(store as never, 'k')!;
}

describe('수치 (balance provisional)', () => {
  it('3번 연달아 · 간격 0.6초 · 원정 7번 강제 진화 · 허무형 = 취소 3회', () => {
    expect(C).toEqual({ taps: 3, tapGapMs: 600, forceAfterRuns: 7 });
    expect(H.void).toEqual({ element: 'kyo', absorbs: 10, cancels: 3 });
  });
});

describe('3번 연달아 터치 세기 (tapCounter)', () => {
  it('간격 0.6초 안 3번째에 true, 그 뒤 처음부터 · 간격이 벌어지면 다시 1부터', () => {
    const tap = tapCounter(C.taps, C.tapGapMs);
    expect([tap(0), tap(500), tap(1_000)]).toEqual([false, false, true]);
    expect([tap(1_200), tap(1_700)]).toEqual([false, false]);
    expect(tap(2_400)).toBe(false); // 0.7초 — 끊김, 이게 1번째
    expect([tap(2_900), tap(3_500)]).toEqual([false, true]);
  });
});

describe('귀환 = 묻지 않고 연출 차례 · 취소 · 배제 (GDD 8-5 v6.254)', () => {
  it('귀환하면 연출 차례(터치 취소 가능), 연출이 끝나면 진화', () => {
    const s = grown();
    expect(back(s)).toBeNull();
    const p = pendingEvolution(s)!;
    expect(p).toMatchObject({ runId });
    expect(evolutionCancelAllowed(s, p)).toBe(true);
    const r = evolveAfterReturn(s, p);
    expect(r.ok && r.record.cancels).toBe(0);
    expect(s.evolution.tierIndex).toBe(3);
  });

  it('취소 → 그 순간 후보 전부 배제 · 그 단계에 머묾 · 기록 · 다른 진화체 조건을 채울 때까지 연출 없음(걸음은 쌓임)', () => {
    const s = grown();
    back(s);
    const cands = judgeCandidates(s.evolution, { factionId: s.factionId, build: s.build, hunger: 20, condition: 80 }).map((c) => c.formId);
    expect(cands.length).toBeGreaterThan(0);
    const rec = cancelEvolution(s, 5_000)!;
    expect(rec).toMatchObject({ at: 5_000, tier: 2, count: 1, formId: 't3:water', excluded: cands, runId });
    expect(s.runLog.tiers.cancels).toHaveLength(1);
    expect(s.evolution).toMatchObject({ tierIndex: 2, cancels: 1, excluded: cands, cancelRuns: 0 });
    expect(s.evolution.pending).toBeUndefined();
    const steps0 = s.evolution.steps;
    // 같은 후보뿐 — 귀환해도 연출 없음, 마지막 취소 뒤 원정 수만 센다
    for (let i = 1; i < C.forceAfterRuns; i++) {
      expect(back(s, i % 2 ? 'returned' : 'defeated')).toBeNull(); // 패배 귀환도 센다
      expect(pendingEvolution(s)).toBeNull();
      expect(evolutionReady(s, { hunger: 20, condition: 80 })).toBe(false); // 판정은 그 원정을 마친 몸 상태
      expect(s.evolution.cancelRuns).toBe(i);
      s.nest.collapsed = false;
      s.nest.dead = false;
      s.nest.hunger = 20;
      s.nest.condition = 80;
    }
    expect(s.evolution.steps).toBeGreaterThanOrEqual(steps0);
  });

  it('배제 안 된 다른 진화체(히든 사냥꾼) 조건을 채우면 다시 연출 → 또 취소하면 배제 누적 · 취소 수 2', () => {
    const s = grown();
    back(s);
    const first = cancelEvolution(s, 5_000)!.excluded;
    s.evolution.hunterRuns = H.hunterRuns; // 사냥꾼 조건 (히든은 일반보다 우선)
    back(s);
    const p = pendingEvolution(s)!;
    expect(p).not.toBeNull();
    expect(evolutionCancelAllowed(s, p)).toBe(true); // 보통 연출 — 다시 취소할 수 있다
    const second = cancelEvolution(s, 6_000)!;
    expect(second.excluded).toContain('h4:hunter');
    expect(s.evolution.excluded).toEqual([...first, ...second.excluded]);
    expect(s.evolution.cancels).toBe(2);
    expect(s.runLog.tiers.cancels.map((c) => c.count)).toEqual([1, 2]);
  });

  it('히든이 모두 배제되면 배제 안 된 일반 진화체로 (4단계 히든 우선 → 일반)', () => {
    const s = grown();
    s.evolution.hunterRuns = H.hunterRuns;
    const ctx = { factionId: s.factionId, build: s.build, hunger: 20, condition: 80 };
    expect(judgeCandidates(s.evolution, ctx).map((c) => c.formId)).toEqual(['h4:hunter']);
    s.evolution.excluded = ['h4:hunter'];
    const left = judgeCandidates(s.evolution, ctx).map((c) => c.formId);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatch(/^t4:/);
    s.evolution.excluded.push(left[0]!);
    expect(judgeCandidates(s.evolution, ctx)).toEqual([]);
  });

  it(`마지막 취소 뒤 원정 ${C.forceAfterRuns}번째 귀환에도 진화 못 하면 배제를 풀고 강제 진화 — 터치 취소 없음 · 껐다 켜도 강제 그대로`, () => {
    const s = grown();
    back(s);
    const ex = cancelEvolution(s, 5_000)!.excluded;
    for (let i = 1; i < C.forceAfterRuns; i++) expect(back(s)).toBeNull();
    expect(pendingEvolution(s)).toBeNull();
    expect(back(s)).toBeNull(); // 7번째 — 연출 차례(강제)
    const r0 = reload(s);
    for (const t of [s, r0]) {
      const p = pendingEvolution(t)!;
      expect(p.forced).toBe(true);
      expect(evolutionCancelAllowed(t, p)).toBe(false);
      expect(cancelEvolution(t, 9_000)).toBeNull(); // 강제 진화는 취소되지 않는다
      expect(t.evolution.excluded).toBeUndefined();
    }
    const r = evolveAfterReturn(s, pendingEvolution(s)!);
    expect(r.ok && r.form.id).toBe(ex[0]); // 배제를 풀었으니 그 순간 판정 = 기존 진화체 중 하나
    expect(r.ok && r.record.cancels).toBe(1);
    expect(r.ok && r.record.snapshot!.excluded).toEqual([]);
    // 진화하면 배제 목록·원정 수·취소 수 0
    expect(s.evolution).toMatchObject({ tierIndex: 3, cancels: 0 });
    expect(s.evolution.excluded).toBeUndefined();
    expect(s.evolution.cancelRuns).toBeUndefined();
  });

  it('튜토리얼 원정은 원정 수로 세지 않고, 튜토리얼 중엔 차례 없이 바로 진화(터치 취소 없음)', () => {
    const s = grown();
    back(s);
    cancelEvolution(s, 5_000);
    back(s, 'returned', { tutorial: true });
    expect(s.evolution.cancelRuns).toBe(0);
    const t = grown();
    const r = back(t, 'returned', { tutorial: true });
    expect(r?.ok).toBe(true);
    expect(t.evolution.pending).toBeUndefined();
    const fresh = newSaveData('shinigami', 1); // 튜토리얼 안내가 남은 새 세이브
    expect(evolutionCancelAllowed(fresh, { forced: false })).toBe(false);
  });

  it('사신도 같은 엔진 (종족 분기 없음)', () => {
    const s = grown('shinigami');
    back(s);
    expect(cancelEvolution(s, 5_000)?.count).toBe(1);
    expect(back(s)).toBeNull();
    expect(s.evolution.cancelRuns).toBe(1);
  });
});

describe('세이브 형식 101 (옛 미루기 → 취소)', () => {
  it('형식 101 · 100 → 101 변환', () => {
    expect(SAVE_FORMAT_VERSION).toBe(101);
    expect(typeof SAVE_MIGRATIONS[100]).toBe('function');
  });
  it('옛 세이브(100): 미루기 수 → 취소 수, 묻는 중 표시 → 연출 차례(터치 취소 가능), 런 로그 빈 취소 기록(옛 미루기 기록은 남김)', () => {
    const s = grown();
    const old = JSON.parse(JSON.stringify(s)) as Record<string, any>;
    old.meta.format = 100;
    delete old.evolution.cancels;
    old.evolution.deferrals = 2;
    old.evolution.choice = { hunger: 33, condition: 71, runId: 42 };
    delete old.runLog.tiers.cancels;
    old.runLog.tiers.deferrals = [{ at: 1, tier: 2, count: 1, formId: 't3:water', steps: 65 }, { at: 2, tier: 2, count: 2, formId: 't3:water', steps: 70 }];
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(101);
    expect(m.evolution.cancels).toBe(2);
    expect('deferrals' in m.evolution).toBe(false);
    expect('choice' in m.evolution).toBe(false);
    expect(m.evolution.pending).toEqual({ hunger: 33, condition: 71, runId: 42 });
    expect(pendingEvolution(m)).not.toBeNull();
    expect(evolutionCancelAllowed(m)).toBe(true);
    expect(m.runLog.tiers.cancels).toEqual([]);
    expect(m.runLog.tiers.deferrals).toHaveLength(2);
  });
  it('이상한 묻는 중 표시는 버리고, 이상한 배제·원정 수도 정리', () => {
    const s = grown();
    const old = JSON.parse(JSON.stringify(s)) as Record<string, any>;
    old.meta.format = 100;
    old.evolution.choice = { hunger: 'x' };
    const m = migrateSave(old)!;
    expect(m.evolution.pending).toBeUndefined();
    const t = grown();
    (t.evolution as unknown as Record<string, unknown>).excluded = ['t4:water:physical', 3, '', 't4:water:physical'];
    (t.evolution as unknown as Record<string, unknown>).cancelRuns = -2;
    const r = reload(t);
    expect(r.evolution.excluded).toEqual(['t4:water:physical']);
    expect(r.evolution.cancelRuns).toBeUndefined();
  });
});

describe('화면 (소스 확인)', () => {
  const panel = readFileSync('src/ui/evolutionPanel.ts', 'utf8');
  const app = readFileSync('src/ui/app.ts', 'utf8');
  it('연출 중 글줄·[건너뛰기] 없음 — 애니만, 3번 터치 → "진화를 취소할까?" [취소한다] [계속]', () => {
    expect(panel).not.toContain("label: '건너뛰기'");
    expect(panel).not.toContain('cutsceneLines(');
    expect(panel).toContain("export const EVOLVE_CANCEL_TITLE = '진화를 취소할까?';");
    expect(panel).toMatch(/yes: '계속',\s*no: '취소한다',/);
  });
  it('옛 [진화][미루기] 창 폐지 — 결과 화면 뒤 바로 연출, 방에 들어오면 남은 연출 차례를 튼다', () => {
    expect(app).not.toContain('evolveChoiceDialog');
    expect(app).toContain('afterResult = () => playPendingEvolution(faction, s, afterEvolveDone);');
    expect(app).toMatch(/const toRoom = \(\) => \{\s*resumePendingEvolution\(\);/);
  });
});
