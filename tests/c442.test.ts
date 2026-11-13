// C.442 (GDD v6.050·v6.051 12-4): 아이젠 붕옥 해방 = 호로화(리스크) 소모형 모드 체인지 · 경화수월 반격 즉시 재생성 삭제 ·
// 리스크 게이지 이름 '호로화' 고정(초월자 데이터) · 리스크 패널티(폭주) 없음.
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getFaction } from '../src/data/factions';
import {
  applyInput, buildBattleRecord, canLiberate, createCombat, drainCombatEvents, kitBlockOf, kitRiskOf, KIT_TRAIT_PREFIX, liberationActive, step, ticksOf, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { buildCombatParams } from '../src/engine/absorb/build';
import { changeRisk } from '../src/engine/absorb/risk';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { kitRiskGaugeNameOf, kitRiskPenaltyFree, withKitRiskName } from '../src/engine/transcendKit';
import { testGrantTranscendent } from '../src/engine/testMode';
import { advance, createExpedition, finishBattle, startBattle } from '../src/engine/expedition/expedition';
import { newSaveData, type SaveData } from '../src/game';
import { useImmediateHits } from './helpers/hitDelay';

useImmediateHits();

const RR = BALANCE.provisional.transcendentKits.aizen!.riskRelease!;
const normal = getEnemy('test-a');
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];

function aizenSave(): SaveData {
  const s = newSaveData('hollow', 1000);
  expect(testGrantTranscendent(s, 'aizen', 2000)).toBe('added');
  return s;
}
function aizenParams(riskStart: number): Partial<CombatParams> {
  const s = aizenSave();
  const p: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
  applyEvolutionToParams(p, s.evolution, s.factionId, 0, false);
  p.riskStart = riskStart;
  return p;
}
const mk = (riskStart: number): CombatState => {
  const s = createCombat(1, { enemy: normal, params: aizenParams(riskStart) });
  s.spawnTimer = 1e9;
  s.params.voidChance = s.params.voidChanceBonus = 0;
  s.enemy.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.params.timeLimitSeconds = 1e9;
  return s;
};
const kitBlk = (s: CombatState, id: string) => ({ uid: s.nextUid++, kind: 'skill' as const, traitId: KIT_TRAIT_PREFIX + id, family: null, element: null, ...(kitBlockOf(s.params, KIT_TRAIT_PREFIX + id)?.solo ? { solo: true } : {}) });

describe('수치·데이터 (provisional)', () => {
  it('붕옥 해방: 호로화 50 이상 · 블록 1번마다 −8, 이름 = 붕옥 해방', () => {
    expect(RR).toEqual({ minRisk: 50, costPerUse: 8 });
    const p = aizenParams(0);
    expect(p.kit?.liberationName).toBe('붕옥 해방');
    expect(p.kit?.riskRelease).toEqual({ minRisk: 50, costPerUse: 8, limit: BALANCE.provisional.risk.limit });
    expect(p.kit?.riskPenaltyFree).toBe(true);
  });
  it('리스크 게이지 이름 = 호로화 (종족·기반과 상관없이 초월자 데이터가 덮음)', () => {
    expect(kitRiskGaugeNameOf('aizen')).toBe('호로화');
    expect(getFaction('hollow').riskGaugeName).toBe('광기');
    expect(withKitRiskName(getFaction('hollow'), 'aizen').riskGaugeName).toBe('호로화');
    expect(withKitRiskName(getFaction('shinigami'), 'aizen').riskGaugeName).toBe('호로화');
    expect(withKitRiskName(getFaction('hollow'), null).riskGaugeName).toBe('광기');
    expect(withKitRiskName(getFaction('hollow'), 'ichigo').riskGaugeName).toBe('광기'); // kit 없는 초월자
  });
});

describe('경화수월 반격', () => {
  it('반격이 성공해도 경화수월이 곧바로 다시 나오지 않는다', () => {
    const s = mk(0);
    s.tray = [kitBlk(s, 'kyoka')];
    s.enemy.attackTimer = 1;
    s.params.evadeChance = 0;
    step(s);
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    expect(s.kit!.counters).toBe(1);
    expect(s.tray.length).toBe(0);
  });
});

describe('붕옥 해방 = 모드 체인지', () => {
  it('호로화 50 미만이면 해방 불가(해방 게이지가 가득이어도), 50 이상이면 가능', () => {
    const lo = mk(RR.minRisk - 1);
    lo.liberation.gauge = 100;
    expect(kitRiskOf(lo)).toBe(RR.minRisk - 1);
    expect(canLiberate(lo)).toBe(false);
    expect(applyInput(lo, { type: 'liberate' })).toBe(false);
    const hi = mk(RR.minRisk);
    expect(canLiberate(hi)).toBe(true);
    step(hi);
    expect(drainCombatEvents(hi).some((e) => e.kind === 'liberation-ready')).toBe(true);
  });
  it('공허 블록으로 호로화가 올라 문턱을 넘으면 해방 가능', () => {
    const s = mk(RR.minRisk - 1);
    s.tray = [{ uid: s.nextUid++, kind: 'void', traitId: null, family: null, element: null }];
    s.params.voidStunSeconds = 0;
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    expect(kitRiskOf(s)).toBe(RR.minRisk - 1 + s.params.riskPerVoidBlock);
    expect(canLiberate(s)).toBe(true);
  });
  it('진입: 지속 시간 없음(오래 지나도 안 풀림), 경화수월 → 프라고르, 능력치 = 만해 수치', () => {
    const s = mk(60);
    s.tray = [kitBlk(s, 'kyoka')];
    const atk0 = s.player.stats.atk;
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    const ev = drainCombatEvents(s).find((e) => e.kind === 'liberate');
    expect(ev).toMatchObject({ kind: 'liberate', endless: true });
    expect(s.tray[0]!.traitId).toBe(KIT_TRAIT_PREFIX + 'fragor');
    expect(s.player.stats.atk).toBeCloseTo(atk0 * s.params.liberationStatMultiplier, 6);
    for (let i = 0; i < ticksOf(s.params, 60); i++) step(s);
    expect(liberationActive(s)).toBe(true);
    expect(kitRiskOf(s)).toBe(60);
    expect(s.kit!.modeEnters).toBe(1);
  });
  it('블록(스킬) 1번마다 −8 (체인 3도 1번), 0 이 되면 모드 끝 · 원래 모습(프라고르 → 경화수월) · 리스크 오르지 않음', () => {
    const s = mk(20);
    expect(canLiberate(s)).toBe(false);
    s.kit!.risk = 50;
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    s.tray = [kitBlk(s, 'kido'), kitBlk(s, 'kido'), kitBlk(s, 'kido')];
    drainCombatEvents(s);
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true); // 3체인 = 한 번
    expect(kitRiskOf(s)).toBe(42);
    expect(drainCombatEvents(s).find((e) => e.kind === 'kit-risk')).toMatchObject({ spent: 8, risk: 42 });
    for (const want of [34, 26, 18, 10, 2]) {
      s.tray = [kitBlk(s, 'fragor')];
      applyInput(s, { type: 'use', cell: 0 });
      expect(kitRiskOf(s)).toBe(want);
      expect(liberationActive(s)).toBe(true);
    }
    s.tray = [kitBlk(s, 'kido'), kitBlk(s, 'fragor')];
    drainCombatEvents(s);
    applyInput(s, { type: 'use', cell: 0 });
    expect(kitRiskOf(s)).toBe(0);
    expect(liberationActive(s)).toBe(false);
    const end = drainCombatEvents(s).find((e) => e.kind === 'liberation-end');
    expect(end).toMatchObject({ endless: true, risk: 0 });
    expect(s.liberation.risk).toBe(0);
    expect(s.tray[0]!.traitId).toBe(KIT_TRAIT_PREFIX + 'kyoka');
    expect(s.kit!.modeExits).toBe(1);
    expect(s.kit!.riskSpent).toBe(50);
    expect(canLiberate(s)).toBe(false);
    // 런 로그: 전투 기록에 모드 진입·끝·깎은 양
    s.status = 'won';
    const rec = buildBattleRecord(s, { factionId: 'hollow', runId: 1, lap: 1, tierIndex: 0 });
    expect(rec.kit).toMatchObject({ id: 'aizen', modeEnters: 1, modeExits: 1, riskSpent: 50 });
  });
  it('모드 중 프라고르 3체인 = 울트라 프라고르 ×5.0 (C.441 그대로)', () => {
    const s = mk(80);
    applyInput(s, { type: 'liberate' });
    s.tray = [kitBlk(s, 'fragor'), kitBlk(s, 'fragor'), kitBlk(s, 'fragor')];
    drainCombatEvents(s);
    applyInput(s, { type: 'use', cell: 0 });
    const ev = drainCombatEvents(s).find((e) => e.kind === 'block');
    expect(ev && ev.kind === 'block' && ev.kitName).toBe('울트라 프라고르');
    expect(BALANCE.provisional.transcendentKits.aizen!.blocks.fragor!.tiers).toEqual([2.4, 3.6, 5.0]);
    expect(BALANCE.provisional.transcendentKits.aizen!.blocks.fragor!.weight).toBe(0.35);
  });
});

describe('원정: 호로화 이어 가기 · 패널티 없음', () => {
  it('리스크 패널티 없음: 아이젠은 100 이 돼도 폭주(돌파)가 없다, 호로는 있다', () => {
    expect(kitRiskPenaltyFree('aizen')).toBe(true);
    expect(kitRiskPenaltyFree(null)).toBe(false);
    const s = aizenSave();
    const exp = createExpedition({ seed: 3, factionId: s.factionId, build: s.build, evolution: s.evolution, hunger: 10, condition: 100, deck: DECK, risk: 95 });
    changeRisk(exp, 30, 'void-block');
    expect(exp.risk).toBe(BALANCE.provisional.risk.limit);
    expect(exp.breakthrough).toBeNull();
    const h = createExpedition({ seed: 3, factionId: 'hollow', hunger: 10, condition: 100, deck: DECK, risk: 95 });
    changeRisk(h, 30, 'void-block');
    expect(h.breakthrough).not.toBeNull();
  });
  it('전투가 원정 호로화로 시작하고, 모드가 깎은 만큼 원정 값이 내려간다', () => {
    const s = aizenSave();
    const exp = createExpedition({ seed: 3, factionId: s.factionId, build: s.build, evolution: s.evolution, hunger: 10, condition: 100, deck: DECK, risk: 70 });
    for (let i = 0; i < 200 && exp.phase !== 'battle'; i++) advance(exp);
    expect(exp.phase).toBe('battle');
    expect(exp.pending!.params.riskStart).toBe(70);
    const b = startBattle(exp);
    expect(kitRiskOf(b)).toBe(70);
    b.spawnTimer = 1e9;
    b.enemy.attackTimer = b.enemy.actionTimer = 1e9;
    expect(applyInput(b, { type: 'liberate' })).toBe(true);
    b.tray = [kitBlk(b, 'kido')];
    applyInput(b, { type: 'use', cell: 0 });
    expect(kitRiskOf(b)).toBe(62);
    b.enemy.hp = 0;
    b.status = 'won';
    b.finisher = { kind: 'basic-attack', traitId: null, element: null };
    finishBattle(exp, b);
    expect(exp.risk).toBe(62);
  });
});
