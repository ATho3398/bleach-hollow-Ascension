// C.517 마스터 11-21 수정(docs/drafts/evo-impl-1121.md 2절, provisional):
// 토르멘타(사용자 11-21 "필드 한 5초로 할까" / "아니 강화지 강화필드,,"): 보통 필드 = 2→3체인 5초 · 강화 필드 = 2체인 2번 연달아 5초 · 켜진 동안 다시 = 시간만 새로 · 레스렉시온 7초·−25%
// (초안 '필드 누적 3번마다'는 사용자 지시로 취소) · 브라사 화상 = 공용 화상 값(석양홍과 같은 8초·+8%) · 공화 스택 '공허' → '허무' · 썬더우드 보스 특성 = 뇌
import { describe, expect, it } from 'vitest';
import { evoBlockLvOf } from '../src/engine/combat/evoUnique';
import { useImmediateHits } from './helpers/hitDelay';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import { evoFormEntry } from '../src/data/evolution/uniques';
import { getTrait } from '../src/data/traits';
import { getBoss } from '../src/data/bosses';
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

describe('토르멘타 — 보통 필드 2→3체인 5초 · 강화 필드 2체인 2번 연달아 5초 (사용자 11-21)', () => {
  const n = N('t4:thunder:special');
  it('2체인 2번 연달아 → 강화 필드 · 사이에 다른 블록이면 없음 · 2체인 3번 = 강화 1번(4번째에 다시)', () => {
    const s = mk({ evo: evo('t4:thunder:special') });
    useChain(s, 2);
    useChain(s, 1);
    expect(procOf(useChain(s, 2).evs, '강화 자기장!')).toBe(false);
    expect(procOf(useChain(s, 2).evs, '강화 자기장!')).toBe(true);
    expect(procOf(useChain(s, 2).evs, '강화 자기장!')).toBe(false);
    expect(procOf(useChain(s, 2).evs, '강화 자기장!')).toBe(true);
  });
  it('강화가 켜지면 보통 필드를 대신(보통 필드 지움) · 강화 중 다시 채우면 시간만 새로(세기 그대로)', () => {
    const s = mk({ evo: evo('t4:thunder:special') });
    useChain(s, 2);
    useChain(s, 3);
    expect(s.evo!.stacks.field!.n).toBe(1);
    useChain(s, 2);
    useChain(s, 2);
    expect(s.evo!.stacks.field!.n).toBe(0);
    expect(markOf(s, 'evo-s-field')).toBeUndefined();
    expect(markOf(s, 'evo-b-storm')?.on).toBe('foe');
    tick(s, ticksOf(s.params, 3));
    expect(s.evo!.buffs.storm!.until - s.tick).toBe(ticksOf(s.params, n.stormSeconds! - 3));
    useChain(s, 2);
    useChain(s, 2);
    expect(s.evo!.buffs.storm!.until - s.tick).toBe(ticksOf(s.params, n.stormSeconds!));
    expect(s.evo!.buffs.storm!.value).toBeCloseTo(n.stormDot!, 9);
    expect(evoStat(s, 'foeMagicDefCut')).toBeCloseTo(n.magicCut!, 6);
  });
  it('옛 초안(누적 3번)·옛 C.515(3개 동시)는 없음 — 시간 간격 넓게 필드 3번이어도 강화 안 켜짐', () => {
    const s = mk({ evo: evo('t4:thunder:special') });
    for (let k = 0; k < 3; k++) {
      useChain(s, 2);
      expect(procOf(useChain(s, 3).evs, '강화 자기장!')).toBe(false);
      tick(s, ticksOf(s.params, n.fieldSeconds! + 1));
    }
    expect(n.stormAt).toBeUndefined();
    expect(s.evo!.stacks.fieldCount).toBeUndefined();
  });
  it('레스렉시온 중에도 같은 규칙 — 보통 7초 · 강화 7초 · 마법방어 −25%', () => {
    const s = mk({ evo: evo('t4:thunder:special'), liberationUnique: true, liberationSeconds: 300 });
    libNow(s);
    useChain(s, 2);
    useChain(s, 3);
    expect(s.evo!.stacks.field!.exp![0]! - s.tick).toBe(ticksOf(s.params, 7));
    useChain(s, 2);
    expect(procOf(useChain(s, 2).evs, '강화 자기장!')).toBe(true);
    expect(s.evo!.buffs.storm!.until - s.tick).toBe(ticksOf(s.params, 7));
    expect(evoStat(s, 'foeMagicDefCut')).toBeCloseTo(0.25, 6);
  });
  it('설명 문구가 새 규칙', () => {
    const d = JSON.stringify(evoFormEntry('t4:thunder:special', 'hollow')?.ability?.description);
    expect(d).toContain('2체인을 2번 연달아');
    expect(d).toContain('시간만 새로');
    expect(d).not.toContain('동시');
  });
});

describe('사신 공화 — 스택 표시 이름 공허 → 허무 (사용자 11-21 "용어는 허무로 가자")', () => {
  it('칩 이름·작은 글자·꺼짐 안내·설명이 허무 (키는 그대로 hollow)', () => {
    const e = evoFormEntry('h4:void', 'shinigami')!.ability!;
    const j = JSON.stringify(e);
    expect(j).not.toContain('공허');
    expect(JSON.stringify(e.stacks!.hollow!.mark!.name)).toContain('허무');
    expect(j).toContain('"proc":"허무!"');
    expect(j).toContain('허무 2개부터 켜진다');
  });
});

describe('썬더우드 보스 특성 = 뇌 (마스터 11-21 provisional — C.516 허무 적 전용이라 얻을 길이 없던 것)', () => {
  it('썬더우드의 가면·문지기의 사슬 = 뇌 속성 · 설명도 뇌', () => {
    const t = getTrait('boss-forest-lord');
    expect(t.element).toBe('thunder');
    expect(JSON.stringify(t.description)).toContain('뇌 속성');
    expect(getBoss('forest-lord').enemy.element).toBe('thunder');
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
    const nb = N('t4:fire:mixed');
    expect(evoStat(s, 'dealt')).toBeCloseTo(0.08 + nb.dealtPer! * (1 + nb.dealtGrow! * evoBlockLvOf(s.params)), 6); // C.524: 열기당 주는 피해 = 블록 투자 비례
  });
});
