// C.444 (GDD v6.054 12-4): 아이젠 붕옥 감응도 = 트랙 리스크 게이지 그 자체 (사용자 2026-11-13 "새 게이지 만들지 마").
// 전투는 원정 리스크로 시작 · 전투 중 변화(붕옥 +10 · 프라고르 −3, C.445)가 끝나면 원정에 반영 · 어디서 내려가도 20 밑으로 안 감 · 리스크 패널티(폭주) 없음.
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { applyInput, createCombat, kitBlockOf, kitRiskOf, KIT_TRAIT_PREFIX, type CombatParams, type CombatState } from '../src/engine/combat';
import { buildCombatParams } from '../src/engine/absorb/build';
import { changeRisk } from '../src/engine/absorb/risk';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { kitRiskFloorOf } from '../src/engine/transcendKit';
import { testGrantTranscendent } from '../src/engine/testMode';
import { doNestAction } from '../src/engine/nest';
import { advance, createExpedition, finishBattle, startBattle, type ExpeditionState } from '../src/engine/expedition/expedition';
import { applyTrackRiskFloor, careNest, migrateSave, newSaveData, type SaveData } from '../src/game';
import { useInventoryItem } from '../src/inventory';
import { getFaction } from '../src/data/factions';
import { useImmediateHits } from './helpers/hitDelay';

useImmediateHits();

const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const id = (b: string) => KIT_TRAIT_PREFIX + b;
const blk = (s: CombatState, b: string) => ({ uid: s.nextUid++, kind: 'skill' as const, traitId: id(b), family: null, element: null, ...(kitBlockOf(s.params, id(b))?.solo ? { solo: true } : {}) });

function aizenSave(): SaveData {
  const s = newSaveData('hollow', 1000);
  expect(testGrantTranscendent(s, 'aizen', 2000)).toBe('added');
  return s;
}
function expAt(s: SaveData, risk: number): ExpeditionState {
  const exp = createExpedition({ seed: 3, factionId: s.factionId, build: s.build, evolution: s.evolution, hunger: 10, condition: 100, deck: DECK, risk });
  for (let i = 0; i < 200 && exp.phase !== 'battle'; i++) advance(exp);
  expect(exp.phase).toBe('battle');
  return exp;
}
function quiet(b: CombatState): void {
  b.spawnTimer = 1e9;
  b.enemy.attackTimer = b.enemy.actionTimer = 1e9;
}
function win(b: CombatState): void {
  b.enemy.hp = 0;
  b.status = 'won';
  b.finisher = { kind: 'basic-attack', traitId: null, element: null };
}

describe('수치·데이터', () => {
  it('전투 전용 시작 값 없음 · 최솟값 20 = 데이터 kit.riskFloor (아이젠만)', () => {
    expect(BALANCE.provisional.transcendentKits.aizen!.riskRelease).toEqual({ floor: 20, minRisk: 30 });
    expect(kitRiskFloorOf('aizen')).toBe(20);
    expect(kitRiskFloorOf(null)).toBe(0);
    expect(kitRiskFloorOf('ichigo')).toBe(0);
  });
});

describe('전투 시작 값 = 원정 리스크, 끝나면 원정에 반영', () => {
  it('원정 리스크 47 → 전투 감응도 47, 붕옥 블록 +10 → 원정 57', () => {
    const s = aizenSave();
    const exp = expAt(s, 47);
    const b = startBattle(exp);
    expect(kitRiskOf(b)).toBe(47);
    quiet(b);
    b.tray = [blk(b, 'hogyoku')];
    applyInput(b, { type: 'use', cell: 0 });
    expect(kitRiskOf(b)).toBe(57);
    win(b);
    finishBattle(exp, b);
    expect(exp.risk).toBe(57);
  });
  it('융합 중 프라고르 3체인 −9 → 원정에도 −9', () => {
    const s = aizenSave();
    const exp = expAt(s, 60);
    const b = startBattle(exp);
    quiet(b);
    applyInput(b, { type: 'liberate' });
    b.tray = [blk(b, 'fragor'), blk(b, 'fragor'), blk(b, 'fragor')];
    applyInput(b, { type: 'use', cell: 0 });
    expect(kitRiskOf(b)).toBe(51);
    win(b);
    finishBattle(exp, b);
    expect(exp.risk).toBe(51);
  });
  it('원정 리스크 100 이면 전투도 100 (붕옥 블록 안 나옴)', () => {
    const s = aizenSave();
    const b = startBattle(expAt(s, 100));
    expect(kitRiskOf(b)).toBe(100);
  });
  it('riskStart 를 안 주면(테스트 전투) 최솟값 20 에서', () => {
    const s = aizenSave();
    const p: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
    applyEvolutionToParams(p, s.evolution, s.factionId, 0, false);
    expect(kitRiskOf(createCombat(1, { enemy: getEnemy('test-a'), params: p }))).toBe(20);
    expect(kitRiskOf(createCombat(1, { enemy: getEnemy('test-a'), params: { ...p, riskStart: 5 } }))).toBe(20);
  });
});

describe('최솟값 20', () => {
  it('원정: 시작 값·놓아주기 등 감소가 20 밑으로 안 감', () => {
    const s = aizenSave();
    const exp = createExpedition({ seed: 3, factionId: s.factionId, build: s.build, evolution: s.evolution, hunger: 10, condition: 100, deck: DECK, risk: 5 });
    expect(exp.risk).toBe(20);
    changeRisk(exp, 30, 'void-block');
    expect(exp.risk).toBe(50);
    changeRisk(exp, -100, 'release');
    expect(exp.risk).toBe(20);
  });
  it('일반 캐릭터는 0 까지 그대로', () => {
    const s = newSaveData('hollow', 1000);
    const exp = createExpedition({ seed: 3, factionId: s.factionId, build: s.build, evolution: s.evolution, hunger: 10, condition: 100, deck: DECK, risk: 30 });
    changeRisk(exp, -100, 'release');
    expect(exp.risk).toBe(0);
  });
  it('둥지: 정화제·재우기가 20 밑으로 안 감, 정화제는 20 이면 못 씀', () => {
    const s = aizenSave();
    s.nest.risk = 25;
    s.shared.items['calm'] = 3;
    const f = getFaction(s.factionId);
    const r = useInventoryItem(s, f, 'calm');
    expect(r.ok).toBe(true);
    expect(s.nest.risk).toBe(20);
    const again = useInventoryItem(s, f, 'calm');
    expect(again.ok).toBe(false);
    expect(s.nest.risk).toBe(20);
    s.nest.risk = 22;
    // 초월자는 돌봄 요청이 없어 careNest 는 거절 — 둥지 행동(재우기 −10) 뒤 저장(persist → applyTrackRiskFloor)에서 막힌다
    careNest(s, 'sleep', 2001, () => 0);
    doNestAction(s.nest, 'sleep', 'basic', 2002);
    applyTrackRiskFloor(s);
    expect(s.nest.risk).toBe(20); // 22 − 10 → 20
  });
  it('옛 세이브: 아이젠 트랙 리스크 20 미만이면 불러올 때 20 (형식 그대로, 읽을 때 보정)', () => {
    const s = aizenSave();
    s.nest.risk = 3;
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.transcendentId).toBe('aizen');
    expect(m.nest.risk).toBe(20);
  });
});

describe('리스크 패널티 없음 유지', () => {
  it('리스크가 100 에 닿아도 폭주(돌파) 없음 · 공허 가산의 폭주 몫 0', () => {
    const s = aizenSave();
    const exp = createExpedition({ seed: 3, factionId: s.factionId, build: s.build, evolution: s.evolution, hunger: 10, condition: 100, deck: DECK, risk: 90 });
    changeRisk(exp, 50, 'void-block');
    expect(exp.risk).toBe(BALANCE.provisional.risk.limit);
    expect(exp.breakthrough).toBeNull();
    expect(exp.events.some((e) => e.kind === 'breakthrough')).toBe(false);
  });
});
