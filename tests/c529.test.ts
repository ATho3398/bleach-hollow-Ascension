/** C.529 치명 확률 상한 70% (GDD 7-4 v6.182, 사용자 2026-11-23 "치확 100% 안되게 … 상한 70%로 하고, 특정 진화체나 특성만 상한 뚫을 수 있다고"):
 *  ① 평타·블록 치명 상한 0.5 → 0.7 ② 진화체 특성·고유 능력 치명 +는 상한 70% 안에서 더한다(C.527 의 '+100%p 를 상한 위에' 대체)
 *  ③ 돌파 = 물 치명 특성(상한 + 그 특성 값, 기존 규칙)과 uniques.json ability.critBreak 표시 능력만(능력 몫만 최대 100%)
 *  ④ critBreak 켠 진화체 = 물 속성 6종(GDD 7-4 v6.183 사용자 "일단 수속 ㅇㅇ") · 조건 객체(need·when)면 그 조건이 켜진 동안만(폭주형·사냥꾼 자리 — 조건 [미정], 데이터 없음) */
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
/** 돌파 표시를 뗀 같은 몸 (표시 없는 능력이 70%에서 잘리는지 보는 용) */
const unbroken = (p: EvoParams): EvoParams => ({ ...p, ability: { ...p.ability, critBreak: undefined } });
const WATER6 = ['t4:water:physical', 't4:water:special', 't4:water:mixed'].flatMap((id) => ['hollow', 'shinigami'].map((f) => `${id}/${f}`));
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
  it('표시 없는 진화체 능력: (돌파 표시를 뗀) 라나 능력 치명 +가 100%p 를 넘어도 평타 치명 = 70%', () => {
    const s = ranaFull(unbroken(full('t4:water:physical', 'hollow')));
    expect(evoStat(s, 'crit')).toBeGreaterThan(1);
    expect(playerCritChanceOf(s)).toBeCloseTo(0.7, 6);
  });
  it('표시 없는 진화체 블록 능력(니에블라 체인 치명 +): 블록 치명 = 70%', () => {
    const s = mk({ evo: unbroken(full('t4:water:special', 'hollow')), blockCritChance: 0.3 });
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
  it('물 치명 특성 돌파는 그대로: 상한 = 70% + 특성 값 (표시 없는 진화체 능력 몫은 그 안)', () => {
    const s = ranaFull(unbroken(full('t4:water:physical', 'hollow')), { critChance: 0.15, critChanceMax: 0.7 + 0.1 });
    expect(playerCritChanceOf(s)).toBeCloseTo(0.8, 6);
  });
  it('critBreak 를 켠 진화체 = 물 속성 6종뿐 (라나·니에블라·바라쿠다 / 노도·연우·백랑파)', () => {
    const forms = (raw as { forms: Record<string, Record<string, { ability?: { critBreak?: unknown } }>> }).forms;
    const on = Object.entries(forms).flatMap(([id, by]) => Object.entries(by).filter(([, e]) => e.ability?.critBreak).map(([f]) => `${id}/${f}`));
    expect(on.sort()).toEqual([...WATER6].sort());
    for (const k of WATER6) { const [id, f] = k.split('/') as [string, string]; expect(forms[id]?.[f]?.ability?.critBreak).toBe(true); }
    expect(forms['h4:fusion:water+earth']).toBeUndefined(); // 물+흙 융합(판타노·이소)은 고유 능력 없음
    expect(validateEvoUniques()).toEqual([]);
  });
  it('실제 데이터: 라나(호로)·노도(사신) 다 키우면 평타 치명 70% 넘음, 니에블라·연우 블록 치명도 넘음', () => {
    expect(playerCritChanceOf(ranaFull(full('t4:water:physical', 'hollow')))).toBeCloseTo(1, 6);
    const nodo = mk({ evo: full('t4:water:physical', 'shinigami'), critChance: 0.7 });
    nodo.evo!.stacks.surge = { n: 5, exp: [1e9, 1e9, 1e9, 1e9, 1e9] }; // 노도 스택 최대 (수 블록 5번)
    expect(evoStat(nodo, 'crit')).toBeGreaterThan(0);
    expect(playerCritChanceOf(nodo)).toBeGreaterThan(0.7);
    for (const fac of ['hollow', 'shinigami']) {
      const s = mk({ evo: full('t4:water:special', fac), blockCritChance: 0.7 });
      expect(playerCritChanceOf(s, 0, true, 0.2)).toBeCloseTo(0.9, 6);
    }
  });
  it('물 아닌 진화체(사신 주홍장 만해 혈 블록 치명 +)는 70%에서 잘린다', () => {
    const s = mk({ evo: full('t4:blood:physical', 'shinigami'), critChance: 0.69 });
    s.params = { ...s.params, abilityEffects: { ...s.params.abilityEffects, evoCrit: 0.5 } }; // 특성 몫으로 상한까지
    expect(playerCritChanceOf(s)).toBeCloseTo(0.7, 6);
    expect(s.params.evo!.ability.critBreak).toBeUndefined();
  });
  it('조건부 돌파 틀: critBreak = { need } 면 조건이 참인 동안만 넘는다 (폭주형·사냥꾼 자리 — 데이터 없음)', () => {
    const base = unbroken(full('t4:water:physical', 'hollow'));
    const cond: EvoParams = { ...base, ability: { ...base.ability, critBreak: { need: [{ elite: true }] } } };
    const vsNormal = ranaFull(cond);
    expect(playerCritChanceOf(vsNormal)).toBeCloseTo(0.7, 6); // 일반 적 = 조건 거짓 → 70%
    const vsElite = createCombat(7, { enemy: { ...foe, class: 'elite' }, params: { ...STILL, trayCapacity: 0, evo: cond } });
    for (let k = 0; k < 10; k++) useOne(vsElite, k % 2 ? 'family-a' : 'family-b');
    expect(playerCritChanceOf(vsElite)).toBeCloseTo(1, 6); // 강적 = 조건 참 → 돌파
    const rel: EvoParams = { ...base, ability: { ...base.ability, critBreak: { when: 'release' } } };
    expect(playerCritChanceOf(ranaFull(rel))).toBeCloseTo(0.7, 6); // 해방 전 = 70%
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
  it('패치 C.529 · BALANCE 164', () => {
    expect(BALANCE_VERSION).toBe(164);
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(529);
  });
});
