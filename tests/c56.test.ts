// C.56 (S-12, GDD 22-1·22-7 v5.21): 환생 — 초기화·남김, 노력치 10% 누적 계승, 능력치 상한 999, 보상, 환생 전용 히든, 세이브 형식 20
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS, getFaction } from '../src/data/factions';
import { FORM_TABLE, formName, getForm } from '../src/data/evolution';
import { TRAITS } from '../src/data/traits';
import { STAT_IDS } from '../src/data/schema';
import { gainTrait, newBuild } from '../src/engine/absorb';
import { addEv, currentStats, evCaps, evolutionCandidates, evolve, judgeEvolution, newEvolution, STAT_MAX, zeroStats, type EvolutionState } from '../src/engine/evolution';
import { parseFactionConfig } from '../src/engine/faction';
import { canRebirth, inheritableTraits, nextCarry, rebirthStars, sanitizeRebirth, startingCarry } from '../src/engine/rebirth';
import { claimTutorialGoals, migrateSave, newSaveData, performRebirth, SAVE_FORMAT_VERSION, type SaveData } from '../src/game';
import { rebirthFinalText, rebirthLists } from '../src/ui/rebirthView';

const RB = BALANCE.provisional.rebirth;
const traitIds = TRAITS.filter((t) => !t.rare).slice(0, 3).map((t) => t.id);

/** 5단계(아란칼)에 닿은 세이브: 장착 특성 3개, 노력치 상한까지, 번호·수련·자원이 조금씩 있다 */
function tier5Save(factionId = 'hollow'): SaveData {
  const s = newSaveData(factionId, 1000);
  const e = s.evolution;
  e.tierIndex = 4;
  e.formHistory = ['t2:base', 't3:base', 't4:fire', 't5:fire:physical'];
  e.formId = 't5:fire:physical';
  e.ability = 'atk';
  e.steps = 33;
  e.ev = { hp: 20, atk: 20, int: 0, def: 0, spr: 0, spd: 0 };
  s.build = newBuild();
  for (let i = 0; i < 4; i++) s.build.slots.push(null);
  for (const id of traitIds) gainTrait(s.build, id);
  s.formDex = [...e.formHistory];
  s.rank.ladder = [...s.rank.ladder.slice(-1), ...s.rank.ladder.slice(0, -1)]; // 플레이어가 No.1
  s.rank.history.everRanked = true;
  s.rank.wins = 4;
  s.training.completed = true;
  s.training.points = 61;
  s.training.tickets = 2;
  s.shared.soulCrystals = 7;
  s.shared.jade = 3;
  s.shared.tradeCoins = 50;
  s.nest.risk = 70;
  s.nest.hunger = 90;
  s.nest.condition = 10;
  s.nest.weakened = true;
  return s;
}

describe('환생 진입 (22-7)', () => {
  it('5단계 이상만, 원정 중이면 못 한다, 장착하지 않은 특성은 고를 수 없다', () => {
    const low = newSaveData('hollow', 1);
    low.evolution.tierIndex = 3;
    expect(canRebirth(low.evolution)).toBe(false);
    expect(performRebirth(low, null)).toEqual({ ok: false, reason: 'tier' });
    const s = tier5Save();
    expect(canRebirth(s.evolution)).toBe(true);
    expect(performRebirth(s, 'no-such-trait')).toEqual({ ok: false, reason: 'trait' });
    s.activeExpedition = {} as never;
    expect(performRebirth(s, null)).toEqual({ ok: false, reason: 'expedition' });
    expect(s.rebirth.count).toBe(0);
  });
  it('계승 후보 = 지금 장착한 특성', () => {
    expect(inheritableTraits(tier5Save().build)).toEqual(traitIds);
  });
});

describe('환생 결과: 초기화와 남김 (22-7)', () => {
  it('단계·진화체·경로·걸음·장착(계승 1개 제외)·번호·리스크·허기·컨디션은 처음으로, 도감·칭호·등급 이력·수련·자원·스킨은 남는다', () => {
    const s = tier5Save();
    s.skin = 'grandfisher';
    s.titles = [{ id: 'x' } as never];
    const stability = s.nest.stability;
    const r = performRebirth(s, traitIds[1]!, 5000);
    expect(r.ok).toBe(true);
    const e = s.evolution;
    expect([e.tierIndex, e.formId, e.formHistory, e.steps, e.ability]).toEqual([0, null, [], 0, null]);
    expect(e.ev).toEqual(zeroStats());
    expect(s.build.slots).toHaveLength(BALANCE.absorb.slotCount);
    expect(s.build.slots.filter(Boolean)).toEqual([traitIds[1]]);
    expect(s.build.owned).toEqual([traitIds[1]]);
    expect(s.rank.ladder[s.rank.ladder.length - 1]).toBe('player');
    expect([s.rank.wins, s.rank.history.everRanked]).toEqual([0, true]);
    expect([s.nest.risk, s.nest.weakened]).toEqual([0, false]);
    expect(s.nest.hunger).toBe(BALANCE.provisional.nest.startHunger);
    expect(s.nest.condition).toBe(BALANCE.provisional.nest.startCondition);
    expect(s.nest.stability).toBe(stability);
    expect(s.formDex).toEqual(['t2:base', 't3:base', 't4:fire', 't5:fire:physical']);
    expect(s.titles).toHaveLength(1);
    expect([s.training.completed, s.training.points, s.training.tickets]).toEqual([true, 61, 2]);
    expect(s.shared.tradeCoins).toBe(50);
    expect(s.skin).toBe('grandfisher');
    expect(s.lastScreen).toBe('room');
  });
  it('특성 없이도 환생할 수 있다', () => {
    const s = tier5Save();
    expect(performRebirth(s, null).ok).toBe(true);
    expect(s.build.slots.every((x) => x === null)).toBe(true);
  });
  it('보상: 영혼 결정 +10 매번, 영옥 10 은 첫 환생만, 튜토리얼 first-rebirth 를 켠다', () => {
    const s = tier5Save();
    const r1 = performRebirth(s, null);
    expect(r1.ok && [r1.soulCrystals, r1.jade]).toEqual([10, RB.firstJade]);
    expect([s.shared.soulCrystals, s.shared.jade]).toEqual([17, 3 + RB.firstJade]);
    expect(claimTutorialGoals(s, 6000).map((g) => g.goal.id)).toContain('first-rebirth');
    const jadeAfterClaims = s.shared.jade; // C.60: 튜토리얼 목표마다 영옥 +1
    s.evolution.tierIndex = 4;
    const r2 = performRebirth(s, null);
    expect(r2.ok && [r2.soulCrystals, r2.jade]).toEqual([10, 0]);
    expect(s.shared.jade).toBe(jadeAfterClaims);
    expect(claimTutorialGoals(s, 7000).map((g) => g.goal.id)).not.toContain('first-rebirth');
  });
  it('런 로그: 횟수·시각·이전 생 최종 진화체·단계·속성·계승 특성·계승 노력치', () => {
    const s = tier5Save();
    performRebirth(s, traitIds[0]!, 4242);
    expect(s.runLog.rebirths).toEqual([{
      at: 4242, count: 1, factionId: 'hollow', prevFormId: 't5:fire:physical', prevTierIndex: 4, prevElements: ['fire'], keptTraitId: traitIds[0], carry: { hp: 2, atk: 2, int: 0, def: 0, spr: 0, spd: 0 }, runsCompleted: 0,
    }]);
  });
});

describe('노력치 계승 (22-7): 10% 누적, 상한 없음', () => {
  it('환생할 때마다 (이번 생 노력치 + 계승분) × 10% 를 누적에 더하고 새 생은 정수 부분을 받는다', () => {
    const s = tier5Save();
    performRebirth(s, null);
    expect(s.rebirth.carry.hp).toBeCloseTo(2);
    expect(s.evolution.carry).toEqual({ hp: 2, atk: 2, int: 0, def: 0, spr: 0, spd: 0 });
    // 두 번째 생: 노력치 다시 20 → 누적 2 + (20 + 2) × 0.1 = 4.2
    s.evolution.tierIndex = 4;
    s.evolution.ev = { hp: 20, atk: 0, int: 0, def: 0, spr: 0, spd: 5 };
    performRebirth(s, null);
    expect(s.rebirth.carry.hp).toBeCloseTo(4.2);
    expect(s.rebirth.carry.spd).toBeCloseTo(0.5);
    expect(s.evolution.carry!.hp).toBe(4);
    expect(s.evolution.carry!.spd).toBe(0);
    expect(s.rebirth.count).toBe(2);
  });
  it('누적 상한이 없다 (큰 값도 그대로 쌓인다)', () => {
    const big = nextCarry({ count: 50, carry: { ...zeroStats(), hp: 500 } }, { ev: { ...zeroStats(), hp: 40 }, carry: { ...zeroStats(), hp: 500 } });
    expect(big.hp).toBeCloseTo(554);
    expect(startingCarry(big).hp).toBe(554);
  });
  it('계승분은 단계 노력치 상한과 따로: 1단계에서도 흡수 노력치를 상한까지 더 쌓는다', () => {
    const e = newEvolution(1);
    e.carry = { ...zeroStats(), hp: 30 };
    addEv(e, { hp: 99 });
    expect(e.ev.hp).toBe(evCaps(0).perStat);
    expect(currentStats(e, 'hollow').hp).toBe(getFaction('hollow').baseStats.hp + evCaps(0).perStat + 30);
  });
  it('능력치 절대 상한 999 (6개 모두)', () => {
    expect(STAT_MAX).toBe(999);
    const e = newEvolution(1);
    e.carry = { hp: 5000, atk: 5000, int: 5000, def: 5000, spr: 5000, spd: 5000 };
    for (const k of STAT_IDS) expect(currentStats(e, 'hollow')[k]).toBe(999);
  });
});

describe('★ 표시 (22-7)', () => {
  it('0회 없음, 1~4회 ★ 횟수만큼, 5회부터 ★ + 숫자', () => {
    expect([0, 1, 2, 4, 5, 12].map(rebirthStars)).toEqual(['', '★', '★★', '★★★★', '★5', '★12']);
  });
});

describe('환생 전용 히든 진화체 (22-7, 20-5 가중 랜덤)', () => {
  const ctxOf = (rebirths: number) => {
    const build = newBuild();
    for (let i = 0; i < 4; i++) build.slots.push(null);
    for (const id of traitIds) gainTrait(build, id);
    return { factionId: 'hollow', build, hunger: 20, condition: 80, rebirths };
  };
  const t4 = (): EvolutionState => {
    const e = newEvolution(77);
    e.tierIndex = 3;
    e.formHistory = ['t2:base', 't3:base', 't4:fire'];
    e.formId = 't4:fire';
    e.steps = 999;
    return e;
  };
  it('데이터: 5단계 히든 h5:reborn 1종, 속성은 바스트로데에서 잇고 이름 `아란칼_환생_<속성>`', () => {
    const f = getForm('h5:reborn');
    expect([f.tier, f.hidden, f.label.kind, f.elements]).toEqual([5, true, 'reborn', undefined]);
    expect(formName(f, 'hollow', ['fire'])).toBe('아란칼_환생_불');
    expect(formName(f, 'shinigami', ['fire'])).toBe('수석 대원_환생_불');
    expect(FORM_TABLE.filter((x) => x.label.kind === 'reborn')).toHaveLength(1);
  });
  it('환생 3회 이상일 때만 아란칼 진화 후보에 든다 (많을수록 무겁다)', () => {
    expect(evolutionCandidates(t4(), ctxOf(2)).hidden.map((c) => c.formId)).not.toContain('h5:reborn');
    const at3 = evolutionCandidates(t4(), ctxOf(3)).hidden.find((c) => c.formId === 'h5:reborn')!;
    const at6 = evolutionCandidates(t4(), ctxOf(6)).hidden.find((c) => c.formId === 'h5:reborn')!;
    expect(at3.weight).toBe(1);
    expect(at6.weight).toBeGreaterThan(at3.weight);
    // 바스트로데 진화(4단계)에는 나오지 않는다
    const e3 = t4();
    e3.tierIndex = 2;
    expect(evolutionCandidates(e3, ctxOf(9)).hidden.map((c) => c.formId)).not.toContain('h5:reborn');
  });
  it('가중 랜덤으로 실제로 뽑히고, 뽑히면 바스트로데 속성을 잇는다', () => {
    let hit: EvolutionState | null = null;
    for (let seed = 1; seed < 200 && !hit; seed++) {
      const e = t4();
      e.stageSeed = seed;
      if (judgeEvolution(e, ctxOf(6)).form.id === 'h5:reborn') hit = e;
    }
    expect(hit).not.toBeNull();
    const r = evolve(hit!, ctxOf(6).build, ctxOf(6), 0);
    expect(r.ok && r.form.id).toBe('h5:reborn');
  });
  it('performEvolution 이 세이브의 환생 횟수를 판정에 넘긴다', async () => {
    const { performEvolution } = await import('../src/game');
    const s = newSaveData('hollow', 3);
    s.evolution = t4();
    s.build = ctxOf(0).build;
    s.rebirth.count = 9;
    s.nest.hunger = 20;
    s.nest.condition = 80;
    const r = performEvolution(s, 0);
    expect(r.ok && r.record.snapshot!.candidates.map((c) => c.formId)).toContain('h5:reborn');
  });
});

describe('세이브 형식 20', () => {
  it('형식 19 → 20: 환생 0회·계승 없음·환생 기록 빈 목록, 진화 계승 없음', () => {
    const s = JSON.parse(JSON.stringify(newSaveData('hollow', 5))) as Record<string, unknown> & { meta: { format: number }; runLog: Record<string, unknown> };
    s.meta.format = 19;
    delete s.rebirth;
    delete s.runLog.rebirths;
    const m = migrateSave(s)!;
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(20);
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.rebirth).toEqual({ count: 0, carry: zeroStats() });
    expect(m.runLog.rebirths).toEqual([]);
    expect(m.evolution.carry).toBeUndefined();
    expect(currentStats(m.evolution, 'hollow')).toEqual(getFaction('hollow').baseStats);
  });
  it('깨진 환생 값은 고친다', () => {
    expect(sanitizeRebirth({ count: -3, carry: { hp: 'x', atk: 2.5 } })).toEqual({ count: 0, carry: { ...zeroStats(), atk: 2.5 } });
  });
  it('환생한 세이브를 저장했다 다시 열어도 그대로', () => {
    const s = tier5Save();
    performRebirth(s, traitIds[2]!);
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.rebirth).toEqual(s.rebirth);
    expect(m.evolution.carry).toEqual(s.evolution.carry);
    expect(m.runLog.rebirths).toHaveLength(1);
  });
});

describe('종족 설정 (분기 없음)', () => {
  it('두 종족 모두 환생 문구가 있고, 없으면 설정 오류', () => {
    expect(getFaction('hollow').rebirth.rebornText).toBe('다시 굶주린 영혼으로');
    expect(getFaction('shinigami').rebirth.rebornText).toBe('다시 혼백으로');
    for (const f of FACTIONS) {
      expect(() => parseFactionConfig({ ...f, rebirth: undefined })).toThrow(/rebirth/);
      const lists = rebirthLists(f);
      expect(lists.resets.join()).toContain(f.tierNames[0]);
      expect(lists.keeps.join()).toContain(f.liberation.name);
      expect(rebirthFinalText(f, null).body).toContain('되돌릴 수 없다');
    }
  });
});
