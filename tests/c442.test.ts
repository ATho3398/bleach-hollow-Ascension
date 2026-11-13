// C.442 (GDD v6.050·v6.051 12-4): 경화수월 반격 즉시 재생성 삭제 · 리스크 게이지 이름 초월자 데이터가 덮음 · 리스크 패널티(폭주) 없음.
// 붕옥 해방 모드(호로화 50·블록마다 −8)는 C.443(GDD v6.052) 붕옥 감응도·붕옥 융합으로 바뀜 — tests/c443.test.ts
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
function aizenParams(): Partial<CombatParams> {
  const s = aizenSave();
  const p: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
  applyEvolutionToParams(p, s.evolution, s.factionId, 0, false);
  return p;
}
const mk = (): CombatState => {
  const s = createCombat(1, { enemy: normal, params: aizenParams() });
  s.spawnTimer = 1e9;
  s.params.voidChance = s.params.voidChanceBonus = 0;
  s.enemy.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.params.timeLimitSeconds = 1e9;
  return s;
};
const kitBlk = (s: CombatState, id: string) => ({ uid: s.nextUid++, kind: 'skill' as const, traitId: KIT_TRAIT_PREFIX + id, family: null, element: null, ...(kitBlockOf(s.params, KIT_TRAIT_PREFIX + id)?.solo ? { solo: true } : {}) });

describe('리스크 게이지 이름 (C.443: 호로화 → 붕옥 감응도)', () => {
  it('종족·기반과 상관없이 초월자 데이터가 덮음', () => {
    expect(kitRiskGaugeNameOf('aizen')).toBe('붕옥 감응도');
    expect(getFaction('hollow').riskGaugeName).toBe('광기');
    expect(withKitRiskName(getFaction('hollow'), 'aizen').riskGaugeName).toBe('붕옥 감응도');
    expect(withKitRiskName(getFaction('shinigami'), 'aizen').riskGaugeName).toBe('붕옥 감응도');
    expect(withKitRiskName(getFaction('hollow'), null).riskGaugeName).toBe('광기');
    expect(withKitRiskName(getFaction('hollow'), 'ichigo').riskGaugeName).toBe('광기'); // kit 없는 초월자
  });
});

describe('경화수월 반격', () => {
  it('반격이 성공해도 경화수월이 곧바로 다시 나오지 않는다', () => {
    const s = mk();
    s.tray = [kitBlk(s, 'kyoka')];
    s.enemy.attackTimer = 1;
    s.params.evadeChance = 0;
    step(s);
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    expect(s.kit!.counters).toBe(1);
    expect(s.tray.length).toBe(0);
  });
});

describe('원정: 패널티 없음', () => {
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
});
