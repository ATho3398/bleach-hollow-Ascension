// C.497 (GDD 8-5 진화 미루기 · 8-8 허무형 조건 교체 · 허무형 종족별 타입): 귀환 때 [진화] [미루기] · 미루기 횟수(진화 상태·런 로그) · 허무형 = (C.531 부터) 허무 블록 10개 흡수 + 미루기 3회 · 형식 92
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FORM_TABLE, formHint, getForm, validateFormTable } from '../src/data/evolution';
import { formCategoryOf } from '../src/data/schema';
import { newBuild, gainTrait } from '../src/engine/absorb/build';
import { analyzeTree, canEvolve, evolutionCandidates, stepsNeeded, type EvolutionState } from '../src/engine/evolution';
import { createExpedition, type ExpeditionState } from '../src/engine/expedition';
import {
  deferEvolution, evolutionChoiceAllowed, evolutionChoicePending, evolveAfterReturn, fusionInputOf, migrateSave, newSaveData, recordExpedition,
  SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, MIN_LOADABLE_SAVE_FORMAT, type SaveData,
} from '../src/game';

const H = BALANCE.provisional.evolution.hidden;

/** 튜토리얼 안내를 다 끝낸 세이브 (튜토리얼 중이면 창 없이 바로 진화) */
function grown(nowMs = 1_000): SaveData {
  const s = newSaveData('hollow', nowMs);
  for (const k of Object.keys(s.help.guides)) s.help.guides[k as keyof typeof s.help.guides] = 'done';
  s.build = newBuild();
  for (let i = 0; i < 4; i++) s.build.slots.push(null);
  gainTrait(s.build, 't-water-a');
  s.nest.hunger = 20;
  s.nest.condition = 80;
  return s;
}

/** 3단계(아쥬커스) 몸 + 걸음이 진화 기준에 닿기 한 칸 전 — 원정 사본이 한 칸 더 걸었다고 치고 끝낸다 */
function atTier3(s: SaveData): void {
  const e = s.evolution;
  e.tierIndex = 2;
  e.formHistory = ['t2:base', 't3:water'];
  e.formId = 't3:water';
  e.steps = stepsNeeded(e)!;
}

function ended(s: SaveData, outcome: 'returned' | 'defeated' = 'returned', extra: Partial<ExpeditionState> = {}): ExpeditionState {
  const exp = createExpedition({ factionId: s.factionId, seed: 7, hunger: 20, condition: 80, deck: [], build: s.build, evolution: s.evolution });
  Object.assign(exp, { phase: 'ended', outcome, endReason: outcome, lapsCompleted: 1 }, extra);
  return exp;
}

describe('진화 미루기 (GDD 8-5)', () => {
  it('holdEvolution: 진화 기준에 닿아도 귀환 정산에서 진화하지 않고 물을 차례가 된다 · 기본(봇·옛 호출)은 예전처럼 바로 진화', () => {
    const s = grown();
    atTier3(s);
    expect(recordExpedition(s, ended(s), 2_000, { holdEvolution: true })).toBeNull();
    expect(s.evolution.tierIndex).toBe(2);
    expect(evolutionChoicePending(s)).toBe(true);
    const t = grown();
    atTier3(t);
    const r = recordExpedition(t, ended(t), 2_000);
    expect(r?.ok).toBe(true);
    expect(t.evolution.tierIndex).toBe(3);
  });

  it('튜토리얼 원정·튜토리얼 안내 중이면 창 없이 바로 진화 (흐름이 막히지 않게)', () => {
    const s = grown();
    atTier3(s);
    expect(evolutionChoiceAllowed(s, { tutorial: true })).toBe(false);
    const r = recordExpedition(s, ended(s, 'returned', { tutorial: true }), 2_000, { holdEvolution: true });
    expect(r?.ok).toBe(true);
    const fresh = newSaveData('hollow', 1); // 새 세이브 = 튜토리얼 안내가 남았다
    expect(evolutionChoiceAllowed(fresh)).toBe(false);
  });

  it('[미루기]: 그 단계에 머문다 · 미루기 수 +1(상한 없음) · 런 로그 1건 · 다음 귀환 때 다시 묻는다 · 걸음은 그대로 쌓인다', () => {
    const s = grown();
    atTier3(s);
    for (let i = 1; i <= 3; i++) {
      expect(recordExpedition(s, ended(s), 2_000 + i, { holdEvolution: true })).toBeNull();
      const rec = deferEvolution(s, 3_000 + i, 40 + i)!;
      expect(rec).toEqual({ at: 3_000 + i, tier: 2, count: i, formId: 't3:water', steps: s.evolution.steps, runId: 40 + i });
      expect(s.evolution.tierIndex).toBe(2);
      expect(s.evolution.deferrals).toBe(i);
      expect(evolutionChoicePending(s)).toBe(true); // 다음 귀환 때 다시 묻는다
      s.evolution.steps += 5; // 미루는 동안 걸음은 정상으로 쌓인다
    }
    expect(s.runLog.tiers.deferrals.map((d) => d.count)).toEqual([1, 2, 3]);
    // [진화]: 진화 기록에 그 단계 미룬 수, 진화하면 새 단계의 미룬 수 0
    const r = evolveAfterReturn(s, { hunger: 20, condition: 80 }, 9_000);
    expect(r.ok && r.record.deferrals).toBe(3);
    expect(r.ok && r.record.snapshot!.deferrals).toBe(3);
    expect(s.evolution.tierIndex).toBe(3);
    expect(s.evolution.deferrals).toBe(0);
  });

  it('진화 기준에 안 닿았으면 미루기는 아무것도 안 한다', () => {
    const s = grown();
    expect(canEvolve(s.evolution)).toBe(false);
    expect(deferEvolution(s, 1)).toBeNull();
    expect(s.runLog.tiers.deferrals).toEqual([]);
    expect(s.evolution.deferrals).toBe(0);
  });

  it('원정 실패 정산(이어 하지 못한 원정)도 그 자리에서 진화하지 않고 다음 귀환 때 묻는다', () => {
    const s = grown();
    atTier3(s);
    expect(recordExpedition(s, ended(s, 'defeated'), 2_000, { holdEvolution: true })).toBeNull();
    expect(evolutionChoicePending(s)).toBe(true);
  });
});

// C.531 (GDD 8-8 v6.166, 사용자 2026-11-23 "그냥 허무 흡수10번에 미루기 3번하면 허무 ㄱㄱ"): 허무형 조건 = 그 단계 허무 블록 10개 흡수 + 미루기 3회 이상.
// 옛 C.497 기대값('미루기 0회 + 빈사 귀환' — 사용자 2026-11-18)은 사용자가 11-23 에 폐기 — 아래 네 테스트를 새 조건으로 바꿨다(지우지 않음)
describe('허무형 조건 교체 (GDD 8-8 v6.166 — 허무 블록 10개 흡수 + 미루기 3회, 옛 v6.120 미루기 0회 + 빈사 귀환 폐기)', () => {
  /** 그 단계에서 허무 적을 블록 갈래로 n번 흡수한 기록 */
  const absorbKyo = (e: EvolutionState, n: number): void => {
    e.elementAbsorbs.kyo = (e.elementAbsorbs.kyo ?? 0) + n;
    e.absorbs += n;
  };
  it('허무 블록 10개 흡수 + 그 단계 미루기 3회 → 허무형 · 옛 미루기 0회·빈사·혈·독·허 + 환생 조건 폐기', () => {
    expect(H.void).toEqual({ element: 'kyo', absorbs: 10, deferrals: 3 });
    expect('voidMaxDeferrals' in H).toBe(false);
    expect('voidShare' in H).toBe(false);
    expect('voidRebirths' in H).toBe(false);
    const s = grown();
    atTier3(s);
    absorbKyo(s.evolution, 10);
    for (let i = 1; i <= 3; i++) {
      recordExpedition(s, ended(s, 'returned'), 2_000 + i, { holdEvolution: true });
      deferEvolution(s, 2_100 + i);
    }
    recordExpedition(s, ended(s, 'returned'), 2_900, { holdEvolution: true });
    expect(s.nest.collapsed).toBe(false); // 빈사가 아니어도 된다
    const r = evolveAfterReturn(s, { hunger: 20, condition: 80 }, 3_000);
    expect(r.ok && r.form.id).toBe('h4:void'); // 히든은 일반보다 우선, 다른 히든 조건 없음
    expect(r.ok && r.record.snapshot!.deferrals).toBe(3);
    expect(r.ok && r.record.snapshot!.elementAbsorbs.kyo).toBe(10);
  });

  it('미루기가 3회 미만이거나 허무 블록이 10개 미만이면 허무형이 아니다 · 빈사 귀환만으로는 아니다', () => {
    // 옛 조건(미루기 0회 + 빈사 귀환)만 채운 몸
    const s = grown();
    atTier3(s);
    recordExpedition(s, ended(s, 'defeated'), 3_000, { holdEvolution: true });
    expect(s.nest.collapsed).toBe(true);
    const r = evolveAfterReturn(s, { hunger: 20, condition: 80 }, 3_100);
    expect(r.ok && r.form.id).not.toBe('h4:void');
    // 허무 블록 10개 + 미루기 2회
    const t = grown();
    atTier3(t);
    absorbKyo(t.evolution, 10);
    for (let i = 1; i <= 2; i++) {
      recordExpedition(t, ended(t, 'returned'), 2_000 + i, { holdEvolution: true });
      deferEvolution(t, 2_100 + i);
    }
    const r2 = evolveAfterReturn(t, { hunger: 20, condition: 80 }, 2_900);
    expect(r2.ok && r2.form.id).not.toBe('h4:void');
    // 허무 블록 9개 + 미루기 3회
    const u = grown();
    atTier3(u);
    absorbKyo(u.evolution, 9);
    for (let i = 1; i <= 3; i++) {
      recordExpedition(u, ended(u, 'returned'), 2_000 + i, { holdEvolution: true });
      deferEvolution(u, 2_100 + i);
    }
    const r3 = evolveAfterReturn(u, { hunger: 20, condition: 80 }, 2_900);
    expect(r3.ok && r3.form.id).not.toBe('h4:void');
  });

  it('미루기·허무 흡수 판정은 그 단계 것만 (전 단계 기록은 진화하면 0) · 미루기는 3회 이상이면 된다', () => {
    const e = { ...newSaveData('hollow', 1).evolution, elementAbsorbs: {} } as EvolutionState;
    e.tierIndex = 2;
    e.formHistory = ['t2:base', 't3:water'];
    e.formId = 't3:water';
    const ctx = { factionId: 'hollow', build: grown().build, hunger: 20, condition: 80 };
    const has = (): boolean => evolutionCandidates(e, ctx).hidden.map((c) => c.formId).includes('h4:void');
    expect(has()).toBe(false);
    absorbKyo(e, 10);
    e.deferrals = 2;
    expect(has()).toBe(false);
    e.deferrals = 3;
    expect(has()).toBe(true);
    e.deferrals = 7;
    expect(has()).toBe(true);
    // 능력치만 흡수는 블록을 얻지 않아 세지 않는다 (단계 기록 elementAbsorbs 에 안 쌓인다)
    const f = { ...e, elementAbsorbs: { kyo: 9 }, absorbs: 20 } as EvolutionState;
    expect(evolutionCandidates(f, ctx).hidden.map((c) => c.formId)).not.toContain('h4:void');
  });

  it('진화 트리 점검: 허무형도 무작위 상태에서 뽑힌다 · 도감 힌트 문구 (종족 행위 이름)', () => {
    const rep = analyzeTree(FORM_TABLE, 'hollow', 4000, 7);
    expect(rep.unreachable).not.toContain('h4:void');
    expect(formHint(getForm('h4:void'), 'hollow')).toBe('허무 블록을 10개 포식하고, 진화를 3번 미룬 뒤 진화');
    expect(formHint(getForm('h4:void'), 'shinigami')).toBe('허무 블록을 10개 정화 흡수하고, 진화를 3번 미룬 뒤 진화');
  });
});

describe('허무형 종족별 타입 (GDD 8-8 첫 줄: 사신 특수·호로 물리) — 데이터만, 종족 분기 없음', () => {
  it('공화(사신) = 특수, 나다(호로) = 물리, 표에 없는 종족은 label.category', () => {
    const f = getForm('h4:void');
    expect(formCategoryOf(f, 'shinigami')).toBe('special');
    expect(formCategoryOf(f, 'hollow')).toBe('physical');
    expect(formCategoryOf(f, 'third-faction')).toBe(f.label.category);
    expect(formCategoryOf(getForm('h4:frenzy'), 'shinigami')).toBe('physical'); // 다른 진화체는 그대로
    expect(validateFormTable(FORM_TABLE)).toEqual([]);
    expect(validateFormTable([{ ...f, categoryByFaction: { shinigami: 'magic' as never } }]).some((m) => m.includes('categoryByFaction'))).toBe(true);
  });
  it('합체 입력의 타입도 종족별', () => {
    const s = newSaveData('shinigami', 1);
    s.evolution.formId = 'h4:void';
    expect(fusionInputOf(s).category).toBe('special');
    const h = newSaveData('hollow', 1);
    h.evolution.formId = 'h4:void';
    expect(fusionInputOf(h).category).toBe('physical');
  });
});

describe('세이브 형식 92 (진화 미루기)', () => {
  it('형식 92 · 91 → 92 변환 · 문턱 87 그대로', () => {
    expect(SAVE_FORMAT_VERSION).toBe(97);
    expect(typeof SAVE_MIGRATIONS[91]).toBe('function');
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(87);
  });
  it('옛 세이브(91): 모든 트랙 미루기 0회, 런 로그 빈 미루기 기록 — 이어 쓴다', () => {
    const s = newSaveData('hollow', 1);
    atTier3(s);
    delete s.evolution.deferrals;
    delete (s.runLog.tiers as Partial<typeof s.runLog.tiers>).deferrals;
    s.meta.format = 91;
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.meta.format).toBe(97);
    expect(m.evolution.deferrals).toBe(0);
    expect(m.runLog.tiers.deferrals).toEqual([]);
    expect(m.evolution.tierIndex).toBe(2);
    expect(canEvolve(m.evolution)).toBe(true); // 기준에 닿은 채 저장됐으면 다음 귀환 때 묻는다
  });
  it('새 세이브는 미루기 0회 · 빈 기록', () => {
    const s = newSaveData('shinigami', 1);
    expect(s.evolution.deferrals).toBe(0);
    expect(s.runLog.tiers.deferrals).toEqual([]);
  });
});
