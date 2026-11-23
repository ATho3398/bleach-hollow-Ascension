/** C.529 치명 확률 상한 70% (GDD 7-4 v6.182, 사용자 2026-11-23 "치확 100% 안되게 … 상한 70%로 하고, 특정 진화체나 특성만 상한 뚫을 수 있다고"):
 *  ① 평타·블록 치명 상한 0.5 → 0.7 ② 진화체 특성·고유 능력 치명 +는 상한 70% 안에서 더한다(C.527 의 '+100%p 를 상한 위에' 대체)
 *  ③ 돌파 = 물 치명 특성(상한 + 그 특성 값, 기존 규칙)과 uniques.json ability.critBreak 표시 능력만(능력 몫만 최대 100%) — 표시 목록은 [미정], 지금은 비어 있음 */
import { describe, expect, it } from 'vitest';
import { useImmediateHits } from './helpers/hitDelay';
import raw from '../src/data/evolution/uniques.json';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import { validateEvoUniques } from '../src/data/evolution/uniques';
import {
  BASIC_SKILL_ID, applyInput, createCombat, drainCombatEvents, evoStat, playerCritChanceOf,
  type Block, type CombatParams, type CombatState, type EvoParams,
} from '../src/engine/combat';
import { applyTraitTotals, evoParamsOf } from '../src/engine/evolution';
import { BALANCE_VERSION } from '../src/config/balance';
import { PATCH_LABEL } from '../src/version';
import { critChances } from '../src/ui/lcdScreens';
import { newSaveData } from '../src/game';
useImmediateHits();

const CX = BALANCE.provisional.combat;
const CAPS = BALANCE.provisional.evoAbilityCaps;
const foe = getEnemy('test-a');
const STILL: Partial<CombatParams> = { enemyCritChance: 0, enemyDamageVariance: 0, voidChance: 0, enemyPassive: true, enemyImmortal: true };
let uid = 95000;
const blk = (over: Partial<Block> = {}): Block => ({ uid: uid++, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a', ...over });
const mk = (extra: Partial<CombatParams>, seed = 7): CombatState => createCombat(seed, { enemy: foe, params: { ...STILL, trayCapacity: 0, ...extra } });
const full = (id: string, fac: string): EvoParams => ({ ...evoParamsOf(getForm(id), fac)!, effort: 1, blockLv: 1 } as EvoParams);
const broken = (p: EvoParams): EvoParams => ({ ...p, ability: { ...p.ability, critBreak: true } });
const useOne = (s: CombatState, family = 'family-a') => {
  s.tray.push(blk({ family }));
  applyInput(s, { type: 'use', cell: s.tray.length - 1 });
  drainCombatEvents(s);
};
/** 라나(호로 물·물리) 다 키우고 블록 10번 = 능력 평타 치명 + > 100%p */
const ranaFull = (evo: EvoParams, extra: Partial<CombatParams> = {}) => {
  const s = mk({ evo, ...extra });
  for (let k = 0; k < 10; k++) useOne(s, k % 2 ? 'family-a' : 'family-b');
  return s;
};

describe('C.529 치명 상한 70%', () => {
  it('수치: 평타·블록 치명 상한 0.7 (옛 0.5) · 돌파 능력 최대 100%', () => {
    expect([CX.critChanceMax, CX.blockCritChanceMax]).toEqual([0.7, 0.7]);
    expect(CAPS.critBreakMax).toBe(1);
    expect('critMax' in CAPS).toBe(false); // C.527 '+100%p 상한 위에' 삭제
  });
  it('기본·특성·가산을 다 더해도 70%에서 잘린다', () => {
    expect(playerCritChanceOf(mk({ critChance: 0.95 }))).toBeCloseTo(0.7, 6);
    expect(playerCritChanceOf(mk({ blockCritChance: 0.4 }), 0.5, true)).toBeCloseTo(0.7, 6);
  });
  it('표시 없는 진화체 능력: 라나 능력 치명 +가 100%p 를 넘어도 평타 치명 = 70%', () => {
    const s = ranaFull(full('t4:water:physical', 'hollow'));
    expect(evoStat(s, 'crit')).toBeGreaterThan(1);
    expect(playerCritChanceOf(s)).toBeCloseTo(0.7, 6);
  });
  it('표시 없는 진화체 블록 능력(니에블라 체인 치명 +): 블록 치명 = 70%', () => {
    const s = mk({ evo: full('t4:water:special', 'hollow'), blockCritChance: 0.3 });
    expect(playerCritChanceOf(s, 0, true, 0.9)).toBeCloseTo(0.7, 6);
  });
  it('critBreak 표시 능력: 능력 몫만 70% 위로 — 최대 100%', () => {
    const s = ranaFull(broken(full('t4:water:physical', 'hollow')));
    expect(playerCritChanceOf(s)).toBeCloseTo(CAPS.critBreakMax, 6);
    const z = mk({ evo: broken(evoParamsOf(getForm('t4:water:physical'), 'hollow')!) });
    useOne(z);
    const up = evoStat(z, 'crit');
    expect(up).toBeGreaterThan(0);
    // 기본·가산은 70%까지, 그 위에 능력 몫 — 기본이 이미 상한이면 상한 + 능력 값
    expect(playerCritChanceOf({ ...z, params: { ...z.params, critChance: 0.95 } })).toBeCloseTo(Math.min(1, 0.7 + up), 6);
    // 블록 쪽도 같다 (이번 블록 능력 치명 + = evoBonus)
    const b = mk({ evo: broken(full('t4:water:special', 'hollow')), blockCritChance: 0.6 });
    expect(playerCritChanceOf(b, 0.3, true, 0.2)).toBeCloseTo(0.9, 6);
  });
  it('물 치명 특성 돌파는 그대로: 상한 = 70% + 특성 값 (진화체 능력 몫은 그 안)', () => {
    const s = ranaFull(full('t4:water:physical', 'hollow'), { critChance: 0.15, critChanceMax: 0.7 + 0.1 });
    expect(playerCritChanceOf(s)).toBeCloseTo(0.8, 6);
  });
  it('돌파 목록은 [미정] — 지금 데이터에서 critBreak 를 켠 진화체는 없다', () => {
    const forms = (raw as { forms: Record<string, Record<string, { ability?: { critBreak?: boolean } }>> }).forms;
    const on = Object.entries(forms).flatMap(([id, by]) => Object.entries(by).filter(([, e]) => e.ability?.critBreak).map(([f]) => `${id}/${f}`));
    expect(on).toEqual([]);
    expect(validateEvoUniques()).toEqual([]);
  });
  it('상태창 치명 상한 표시 = 70%', () => {
    const g = newSaveData('hollow');
    const c = critChances(g.build, g.evolution);
    expect([c.basicMax, c.blockMax]).toEqual([0.7, 0.7]);
  });
  it('탈착·초월 특성 블록 치명(집중 등)은 상한을 올리지 않는다 — 70% 안', () => {
    const p: Partial<CombatParams> = {};
    applyTraitTotals(p, { dealt: 0, taken: 0, maxHp: 0, blockCrit: 0.05 });
    expect(p.blockCritChance).toBeCloseTo(CX.blockCritChance + 0.05, 6);
    expect(p.blockCritChanceMax).toBeUndefined();
  });
  it('패치 C.529 · BALANCE 163', () => {
    expect(BALANCE_VERSION).toBe(163);
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(529);
  });
});
