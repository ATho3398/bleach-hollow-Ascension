// C.517 마스터 11-21 수정(docs/drafts/evo-impl-1121.md 2절, provisional):
// 토르멘타 강화 필드 = 필드를 만든 누적 횟수 3번마다(끊김·초기화 없음, 켜지면 0 — 옛 C.515 '3개 동시') · 브라사 화상 = 공용 화상 값(석양홍과 같은 8초·+8%)
import { describe, expect, it } from 'vitest';
import { useImmediateHits } from './helpers/hitDelay';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import { evoFormEntry } from '../src/data/evolution/uniques';
import {
  BASIC_SKILL_ID, applyInput, createCombat, drainCombatEvents, evoStat, statusMarksOf, step, ticksOf,
  type Block, type CombatEvent, type CombatParams, type CombatSkill, type CombatState,
} from '../src/engine/combat';
import { evoParamsOf } from '../src/engine/evolution';
useImmediateHits();

const EU = BALANCE.provisional.evoUniques;
type Nums = Record<string, number> & { release: Record<string, number> };
const N = (id: string, side: 'hollow' | 'shinigami' = 'hollow'): Nums => ({ release: {}, ...(EU.forms[id]![side] as Record<string, unknown>) }) as Nums;
const evo = (id: string) => evoParamsOf(getForm(id), 'hollow')!;
const foe = getEnemy('test-a');
const STILL: Partial<CombatParams> = { critChance: 0, blockCritChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, voidChance: 0, enemyPassive: true, enemyImmortal: true };
let uid = 91000;
const blk = (over: Partial<Block> = {}): Block => ({ uid: uid++, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a', ...over });
const mk = (extra: Partial<CombatParams>, seed = 7): CombatState => createCombat(seed, { enemy: foe, params: { ...STILL, trayCapacity: 0, ...extra } });
const tick = (s: CombatState, n = 1): CombatEvent[] => {
  const out: CombatEvent[] = [];
  for (let i = 0; i < n && s.status === 'playing'; i++) {
    step(s);
    out.push(...drainCombatEvents(s));
  }
  return out;
};
const useChain = (s: CombatState, chain: number, family = 'family-a', traitId: string = BASIC_SKILL_ID) => {
  const at = s.tray.length;
  for (let k = 0; k < chain; k++) s.tray.push(blk({ family, traitId }));
  const ok = applyInput(s, { type: 'use', cell: at });
  return { ok, evs: drainCombatEvents(s) };
};
const libNow = (s: CombatState) => {
  s.liberation.gauge = 100;
  applyInput(s, { type: 'liberate' });
  drainCombatEvents(s);
};
const procOf = (evs: CombatEvent[], text: string) => evs.some((e) => e.kind === 'evo-proc' && e.text === text);
const markOf = (s: CombatState, key: string) => statusMarksOf(s, 'hollow').find((m) => m.key === key);

describe('토르멘타 — 강화 필드 = 필드 누적 3번마다 (마스터 11-21)', () => {
  const n = N('t4:thunder:special');
  /** 2→3 으로 필드 1번 만들고, 필드가 다 끝날 만큼(필드 초 + 1초) 기다린다 — 동시에 겹치지 않게 */
  const makeField = (s: CombatState, fieldSeconds: number) => {
    useChain(s, 2);
    const evs = useChain(s, 3).evs;
    tick(s, ticksOf(s.params, fieldSeconds + 1));
    return evs;
  };
  it('필드 2번(시간 간격 넓게)이면 강화 없음 · 누적 칩 2/3 · 3번째에 강화 켜짐 · 누적 0', () => {
    const s = mk({ evo: evo('t4:thunder:special') });
    expect(procOf(makeField(s, n.fieldSeconds!), '자기장!')).toBe(true);
    expect(procOf(makeField(s, n.fieldSeconds!), '강화 자기장!')).toBe(false);
    expect(s.evo!.stacks.field!.n).toBe(0); // 2번째 필드도 이미 끝남 — 동시에 있지 않다
    expect(s.evo!.buffs.storm?.until ?? 0).toBeLessThanOrEqual(s.tick);
    const chip = markOf(s, 'evo-s-fieldCount')!;
    expect(chip.value).toBe('2'); // 칩 숫자 = 누적, 설명 = n/3 (스택 칩 공용 형식)
    expect(chip.title).toContain(`2/${n.stormAt}`);
    useChain(s, 2);
    expect(procOf(useChain(s, 3).evs, '강화 자기장!')).toBe(true);
    expect(s.evo!.buffs.storm!.until - s.tick).toBe(ticksOf(s.params, n.stormSeconds!));
    expect(evoStat(s, 'foeMagicDefCut')).toBeCloseTo(n.magicCut!, 6);
    expect(s.evo!.stacks.fieldCount!.n).toBe(0);
    expect(markOf(s, 'evo-s-fieldCount')).toBeUndefined();
    expect(markOf(s, 'evo-b-storm')?.on).toBe('foe');
  });
  it('끊김·초기화 없음: 2체인→3체인 사이에 다른 블록을 써도, 오래 기다려도 누적은 그대로', () => {
    const s = mk({ evo: evo('t4:thunder:special') });
    makeField(s, n.fieldSeconds!);
    useChain(s, 1);
    useChain(s, 3);
    tick(s, ticksOf(s.params, 30));
    expect(s.evo!.stacks.fieldCount!.n).toBe(1);
  });
  it('레스렉시온 중에도 같은 규칙 — 누적 3번째에 강화 5초 · 마법방어 −25%', () => {
    const s = mk({ evo: evo('t4:thunder:special'), liberationUnique: true, liberationSeconds: 300 });
    libNow(s);
    makeField(s, n.release.fieldSeconds!);
    makeField(s, n.release.fieldSeconds!);
    expect(s.evo!.stacks.fieldCount!.n).toBe(2);
    useChain(s, 2);
    expect(procOf(useChain(s, 3).evs, '강화 자기장!')).toBe(true);
    expect(s.evo!.buffs.storm!.until - s.tick).toBe(ticksOf(s.params, n.release.stormSeconds!));
    expect(evoStat(s, 'foeMagicDefCut')).toBeCloseTo(n.release.magicCut!, 6);
    expect(s.evo!.stacks.fieldCount!.n).toBe(0);
  });
  it('설명 문구가 누적 규칙', () => {
    expect(JSON.stringify(evoFormEntry('t4:thunder:special', 'hollow')?.ability?.description)).toContain('번 만들 때마다');
  });
});

describe('브라사 — 화상 = 공용 화상 값 (석양홍과 같음, 마스터 11-21)', () => {
  const fire: CombatSkill = { id: 't-fire-b', element: 'fire', family: 'family-b', category: 'special', role: 'attack', powerInAttacks: 1, chainBonus: { kind: 'stagger', value: 0 }, powerMultiplier: 1 };
  it('수치: 8초 · 받는 피해 +8% — 석양홍(사신 t4:fire:special)과 같은 값', () => {
    const b = N('t4:fire:mixed');
    const sunset = N('t4:fire:special', 'shinigami');
    expect(b.burnSeconds).toBe(8);
    expect(b.burn).toBeCloseTo(0.08, 9);
    expect(b.burnSeconds).toBe(sunset.burnSeconds);
    expect(b.burn).toBe(sunset.burnPct);
  });
  it('불 블록 → 적 화상 8초 · 걸린 동안 주는 피해 +8%(+ 열기 1)', () => {
    const s = mk({ evo: evo('t4:fire:mixed'), skills: [fire] });
    useChain(s, 1, 'family-b', fire.id);
    const b = s.evo!.buffs.burn!;
    expect(b.value).toBeCloseTo(0.08, 9);
    expect(b.until - s.tick).toBe(ticksOf(s.params, 8));
    expect(evoStat(s, 'dealt')).toBeCloseTo(0.08 + N('t4:fire:mixed').dealtPer!, 6);
  });
});
