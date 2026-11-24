/** C.536 호로 불·물리(소로) 여우불 재설계 (GDD 8-7 v6.196, 사용자 2026-11-24 "소로 여우불은 저거 말고, 여우불일 때 블록쓰면 화상으로 바꿔.
 *  그리고 여우불 1개당 효과로 바꾸고. 여우불 5개이상+화상이면 더 더 쎄지는거로 ㄱㄱ")
 *  여우불 0개 = 화상 없음 · 1~4개 = 개수 × 1개당 · 5개 이상 + 미화상 = 개수 × 1개당 · 5개 이상 + 이미 화상 = 개수 × 센 화상 1개당 (덮어쓰기) */
import { describe, expect, it } from 'vitest';
import { useImmediateHits } from './helpers/hitDelay';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import { validateEvoUniques } from '../src/data/evolution/uniques';
import { BASIC_SKILL_ID, applyInput, createCombat, drainCombatEvents, evoStat, statusMarksOf, step, ticksOf, type Block, type CombatEvent, type CombatParams, type CombatState } from '../src/engine/combat';
import { evoParamsOf } from '../src/engine/evolution';
import { evoUniqueLines } from '../src/ui/evolutionPanel';
import { PATCH_LABEL } from '../src/version';
useImmediateHits();

type Nums = Record<string, number> & { release: Record<string, number> };
const n = BALANCE.provisional.evoUniques.forms['t4:fire:physical']!.hollow as Nums;
const STILL: Partial<CombatParams> = { critChance: 0, blockCritChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, voidChance: 0, enemyPassive: true, enemyImmortal: true };
let uid = 90000;
const mk = (extra: Partial<CombatParams> = {}): CombatState =>
  createCombat(7, { enemy: getEnemy('test-a'), params: { ...STILL, trayCapacity: 0, playerElements: ['fire'], playerAttackSeconds: 100, evo: evoParamsOf(getForm('t4:fire:physical'), 'hollow')!, ...extra } });
/** 여우불을 k 개로 (스택마다 따로 시간 — 충분히 길게) */
const fox = (s: CombatState, k: number) => {
  s.evo!.stacks.fox = { n: k, exp: Array.from({ length: k }, () => s.tick + 100000) };
};
/** 불 블록 1체인 */
const fire = (s: CombatState): CombatEvent[] => {
  const at = s.tray.length;
  s.tray.push({ uid: uid++, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a' } as Block);
  applyInput(s, { type: 'use', cell: at });
  return drainCombatEvents(s);
};
const procs = (evs: CombatEvent[]) => evs.filter((e) => e.kind === 'evo-proc').map((e) => (e as { text: string }).text);

describe('C.536 소로 여우불 → 화상 (1개당 · 5개 이상 + 화상 = 센 화상)', () => {
  it('데이터 검사 통과 · 수치 = 여우불 2.5초·강화 문턱 5개 그대로, 센 화상 1개당 > 1개당', () => {
    expect(validateEvoUniques()).toEqual([]);
    expect(n).toMatchObject({ seconds: 2.5, need: 5, burnSeconds: 6 });
    expect(n.burnBoost!).toBeGreaterThan(n.burn!);
    expect(n.burnGrow!).toBeGreaterThan(0); // 노력 곡선(시간 제한 능력 규칙): 1개당 값 × (1 + 기울기 × 공속 투자율) — 여우불 개수도 공속에 따라 늘어난다
  });
  it('공속을 다 키운 몸(effort 1): 1개당 × (1 + 기울기)', () => {
    const s = mk({ evo: { ...evoParamsOf(getForm('t4:fire:physical'), 'hollow')!, effort: 1 } });
    step(s);
    fox(s, 3);
    fire(s);
    expect(evoStat(s, 'dealt')).toBeCloseTo(3 * n.burn! * (1 + n.burnGrow!), 6);
  });
  it('여우불 0개 = 화상 없음', () => {
    const s = mk();
    step(s);
    fox(s, 0);
    expect(procs(fire(s))).not.toContain('화상!');
    expect(evoStat(s, 'dealt')).toBe(0);
  });
  it('여우불 3개 = 3 × 1개당', () => {
    const s = mk();
    step(s);
    fox(s, 3);
    expect(procs(fire(s))).toEqual(['화상!']);
    expect(evoStat(s, 'dealt')).toBeCloseTo(3 * n.burn!, 6);
    expect(statusMarksOf(s, 'hollow').find((m) => m.key === 'evo-b-burn')?.on).toBe('foe');
  });
  it('여우불 5개 + 화상 아님 = 5 × 1개당 (센 화상 아님)', () => {
    const s = mk();
    step(s);
    fox(s, 5);
    expect(procs(fire(s))).toEqual(['화상!']);
    expect(evoStat(s, 'dealt')).toBeCloseTo(5 * n.burn!, 6);
  });
  it('여우불 5개 + 이미 화상 = 센 화상 5 × 센 1개당 (덮어쓰기, 발동 글자 한 번)', () => {
    const s = mk();
    step(s);
    fox(s, 2);
    fire(s); // 화상(2개)
    expect(evoStat(s, 'dealt')).toBeCloseTo(2 * n.burn!, 6);
    fox(s, 5);
    expect(procs(fire(s))).toEqual(['센 화상!']);
    expect(evoStat(s, 'dealt')).toBeCloseTo(5 * n.burnBoost!, 6);
  });
  it('여우불 4개 + 이미 화상 = 센 화상 아님(1개당) · 화상 시간 지나면 꺼짐', () => {
    const s = mk();
    step(s);
    fox(s, 1);
    fire(s);
    fox(s, 4);
    expect(procs(fire(s))).toEqual(['화상!']);
    expect(evoStat(s, 'dealt')).toBeCloseTo(4 * n.burn!, 6);
    for (let i = 0, t = ticksOf(s.params, n.burnSeconds! + 0.1); i < t; i++) step(s);
    expect(evoStat(s, 'dealt')).toBe(0);
  });
  it('레스렉시온: 여우불 3초 · 1개당·센 화상 1개당 = 해방 값', () => {
    const s = mk({ liberationUnique: true, liberationSeconds: 120 });
    step(s);
    s.liberation.gauge = 100;
    applyInput(s, { type: 'liberate' });
    drainCombatEvents(s);
    fox(s, 3);
    fire(s);
    expect(evoStat(s, 'dealt')).toBeCloseTo(3 * n.release.burn!, 6);
    fox(s, 5);
    fire(s);
    expect(evoStat(s, 'dealt')).toBeCloseTo(5 * n.release.burnBoost!, 6);
  });
  it('설명: 문턱 없는 화상 · 센 화상 · 투자 괄호 없음', () => {
    const t = evoUniqueLines('t4:fire:physical', 'hollow', '레스렉시온').map((l) => l.text).join(' / ');
    expect(t).toContain('여우불이 있을 때 불 블록을 쓰면 적에게 화상');
    expect(t).toContain(`여우불이 ${n.need}개 이상일 때 이미 화상인 적에게 불 블록을 쓰면 더 센 화상`);
    expect(t).not.toMatch(/키울수록|다 키우면|\{/);
  });
  it('패치 C.536 · BALANCE 169', () => {
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(536);
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(169);
  });
});
