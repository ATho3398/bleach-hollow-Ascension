// C.361 (GDD 217장 2·3): 튜토리얼 노력치 = 상한 밖(evFree) · 세이브 형식 67 마이그레이션 · 결과 노력치 칩(evGains)
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { STAT_IDS } from '../src/data/schema';
import { addEv, addEvFree, cloneEvolution, evCaps, evCounted, evTotal, newEvolution } from '../src/engine/evolution';
import { advance, createExpedition, finishBattle, startBattle, tutorialAbsorb, type ExpeditionState } from '../src/engine/expedition';
import type { CombatState } from '../src/engine/combat';
import { migrateEvFree, migrateSave, newSaveData, nextRunId, performRevive, performRebirth, recordExpedition, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, type SaveData } from '../src/game';
import { evGains } from '../src/ui/bha/evChips';

const TUT = BALANCE.provisional.tutorialRun;
const all = (n: number) => Object.fromEntries(STAT_IDS.map((k) => [k, n]));
const autoWin = (s: CombatState) => {
  s.enemy.hp = 0;
  s.status = 'won';
  s.finisher = { kind: 'basic-attack', traitId: null, element: null };
};
const tutorialExp = (save: SaveData, seed = 11): ExpeditionState => createExpedition({
  factionId: save.factionId, seed, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition, deck: [], risk: save.nest.risk, stability: save.nest.stability,
  build: save.build, evolution: save.evolution, tutorial: true,
});
/** 튜토리얼 원정을 흡수 화면까지 → 튜토리얼 흡수 → 귀환 정산 */
function playTutorial(s: SaveData): ExpeditionState {
  const e = tutorialExp(s);
  while (e.phase === 'moving') advance(e);
  const b = startBattle(e);
  autoWin(b);
  finishBattle(e, b);
  expect(tutorialAbsorb(e).ok).toBe(true);
  recordExpedition(s, e, 1000);
  return e;
}

describe('217장 2: 튜토리얼 노력치는 상한 밖', () => {
  it('튜토리얼 보상은 ev 에 더하고 evFree 에도 적는다 (상한 계산 0)', () => {
    const s = newSaveData('hollow', 3);
    playTutorial(s);
    for (const k of STAT_IDS) expect(s.evolution.ev[k]).toBe(TUT.statEv);
    expect(s.evolution.evFree).toEqual(all(TUT.statEv));
    expect(evTotal(evCounted(s.evolution))).toBe(0);
    expect(s.runLog.tutorialRewards[0]!.ev).toEqual(all(TUT.statEv)); // 런 로그 그대로
  });

  it('튜토리얼 뒤에도 단계 합계·능력치 하나 상한을 다 채울 수 있다 (값은 상한 + 튜토리얼분)', () => {
    const s = newSaveData('hollow', 4);
    playTutorial(s);
    const cap = evCaps(0);
    addEv(s.evolution, { hp: 1000 });
    expect(s.evolution.ev.hp).toBe(cap.perStat + TUT.statEv);
    addEv(s.evolution, all(1000));
    expect(evTotal(evCounted(s.evolution))).toBe(cap.total);
    expect(evTotal(s.evolution.ev)).toBe(cap.total + TUT.statEv * STAT_IDS.length);
  });

  it('막힌 몫 기록 (결과 화면 가득): 넘친 만큼 blocked 에', () => {
    const e = newEvolution();
    const blocked: Record<string, number> = {};
    const cap = evCaps(0);
    addEv(e, { atk: cap.perStat + 5 }, blocked);
    expect(e.ev.atk).toBe(cap.perStat);
    expect(blocked.atk).toBe(5);
  });

  it('진화 상태 복제·부활·환생: 튜토리얼분도 일반 노력치처럼 따라간다', () => {
    const e = newEvolution();
    addEvFree(e, all(3));
    expect(cloneEvolution(e).evFree).toEqual(all(3));
    const s = newSaveData('hollow', 5);
    s.evolution.ev = { hp: 13, atk: 3, int: 3, def: 3, spr: 3, spd: 3 };
    s.evolution.evFree = all(3) as SaveData['evolution']['ev'];
    s.nest.dead = true;
    s.nest.collapsed = true;
    expect(performRevive(s, 5).ok).toBe(true);
    // 손실 50%: ev 13 → 6, 3 → 1 · evFree 3 → 1
    expect(s.evolution.ev.hp).toBe(6);
    expect(s.evolution.evFree).toEqual(all(1));
    // 환생: 노력치 0 (계승분은 ev 전체 기준) → 상한 밖 몫도 없음
    const r = newSaveData('hollow', 6);
    r.evolution.tierIndex = 3;
    r.evolution.ev = all(10) as SaveData['evolution']['ev'];
    r.evolution.evFree = all(3) as SaveData['evolution']['ev'];
    const before = r.rebirth.carry.hp;
    expect(performRebirth(r, null, 7).ok).toBe(true);
    expect(r.evolution.evFree).toBeUndefined();
    expect(r.rebirth.carry.hp).toBeCloseTo(before + 10 * BALANCE.provisional.rebirth.evCarryRate);
  });
});

describe('세이브 형식 67 (217장 2)', () => {
  it('66 → 67: 튜토리얼 끝난 이번 생 트랙은 받은 튜토리얼 노력치를 상한 밖으로 (값 그대로)', () => {
    expect(SAVE_FORMAT_VERSION).toBe(67);
    expect(typeof SAVE_MIGRATIONS[66]).toBe('function');
    const s = newSaveData('hollow', 7);
    playTutorial(s);
    addEv(s.evolution, { atk: 10 });
    delete s.evolution.evFree;
    s.meta.format = 66;
    const m = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(m).not.toBeNull();
    expect(m!.meta.format).toBe(67);
    expect(m!.evolution.evFree).toEqual(all(TUT.statEv));
    expect(m!.evolution.ev.atk).toBe(TUT.statEv + 10);
  });

  it('튜토리얼 안 한 트랙·환생한 트랙은 그대로, 부활했으면 손실 비율을 곱한다', () => {
    const fresh = newSaveData('hollow', 8);
    migrateEvFree(fresh);
    expect(fresh.evolution.evFree).toBeUndefined();
    const reborn = newSaveData('hollow', 9);
    playTutorial(reborn);
    delete reborn.evolution.evFree;
    reborn.rebirth.count = 1;
    migrateEvFree(reborn);
    expect(reborn.evolution.evFree).toBeUndefined();
    const revived = newSaveData('hollow', 10);
    playTutorial(revived);
    delete revived.evolution.evFree;
    revived.runLog.vitals.push({ at: 2000, kind: 'revive', evLoss: 0.5, tierIndex: 0, formId: null } as SaveData['runLog']['vitals'][number]);
    for (const k of STAT_IDS) revived.evolution.ev[k] = 1;
    migrateEvFree(revived);
    expect(revived.evolution.evFree).toEqual(all(1)); // 3 × 0.5 내림 = 1, 지금 ev 1 이하
  });
});

describe('217장 3: 결과 노력치 칩', () => {
  it('오른 것만 칩(반올림 정수), 막혔으면 가득 · 하나도 못 오른 막힘은 따로', () => {
    const r = evGains({ hp: 0, atk: 2, int: 5, def: 0, spr: 0, spd: 0 }, { hp: 3, atk: 2, int: 7.4, def: 0.2, spr: 0, spd: 0 }, { int: 1, spd: 2 });
    expect(r.gains).toEqual([{ stat: 'hp', amount: 3, full: false }, { stat: 'int', amount: 2, full: true }]);
    expect(r.fullOnly).toEqual(['spd']);
    expect(evGains(undefined, all(3) as SaveData['evolution']['ev'])).toEqual({ gains: [], fullOnly: [] });
  });

  it('원정은 시작 노력치를 들고 다닌다 (튜토리얼 귀환 = 모든 능력치 +3 칩)', () => {
    const s = newSaveData('hollow', 11);
    const e = playTutorial(s);
    expect(e.evStart).toEqual(all(0));
    expect(evGains(e.evStart, e.evolution.ev, e.evBlocked).gains.map((g) => g.amount)).toEqual(STAT_IDS.map(() => TUT.statEv));
  });
});
