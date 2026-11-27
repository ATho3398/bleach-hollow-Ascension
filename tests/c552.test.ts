// C.552 (GDD 7절 v6.226, 사용자 2026-11-27 "아비례안해? 그럼 모션은 체인상관없이 1.2초 고정시켜 일단. 아쥬커스 달면 1초 바스트로데 0.9 아란칼 0.8초로 ㄱㄱ"):
// 블록 몸동작 기준 길이 = 체인 단계와 무관, 진화 단계로만 — 1·2단계 1.2초 · 3단계 1.0초 · 4단계 0.9초 · 아란칼화/참백도 구상화 뒤 0.8초 (두 종족 같은 값, provisional).
// 나머지 규칙(타격 = 원래 비율 × 배율, 느리게 재생 안 함, 빠른 간격 1.5배속·앞 자르기, 이펙트 1배, C.551 피해 = 몸 타격 순간)은 이 새 기준 길이 위에서 그대로.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import {
  BASIC_SKILL_ID, applyInput, blockHitDelayOf, blockMotionBusy, blockMotionOf, blockMotionTarget, createCombat, drainCombatEvents, step,
  type CombatParams, type CombatState, type MotionParams,
} from '../src/engine/combat';
import { buildCombatParams } from '../src/engine/absorb/build';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { newSaveData } from '../src/game';

const M = BALANCE.provisional.combat.motion;
/** [단계(tierIndex), 아란칼화/구상화, 기준 길이] */
const TABLE: [number, boolean, number][] = [[0, false, 1.2], [1, false, 1.2], [2, false, 1.0], [3, false, 0.9], [3, true, 0.8]];

const quiet = (motion: MotionParams): CombatState => {
  const s = createCombat(1, { enemy: getEnemy('test-a'), params: { blockPlayDamage: 1, blockPlayCrit: 0, critChance: 0, enemyCritChance: 0 } });
  s.enemy.hp = s.enemy.maxHp = 1e12;
  s.enemy.attackTimer = s.enemy.actionTimer = s.spawnTimer = 1e9;
  s.params.timeLimitSeconds = 1e9;
  s.params.motion = motion;
  return s;
};

describe('C.552 블록 모션 기준 길이 = 진화 단계별 (GDD 7절 v6.226)', () => {
  it('balance: 기본 1.2 · 3단계 1.0 · 4단계 0.9 · 아란칼화/구상화 뒤 0.8, BALANCE_VERSION 172', () => {
    expect(M.blockLength).toEqual({ default: [1.2], byTier: { '2': [1.0], '3': [0.9] }, ascended: [0.8] });
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(172);
  });

  it('체인 단계와 무관: 1~5체인 모두 그 단계 값', () => {
    for (const [tier, ascended, len] of TABLE) {
      for (const c of [1, 2, 3, 4, 5]) expect(blockMotionTarget({ blockLength: M.blockLength, tier, ascended }, c)).toBe(len);
    }
    expect(blockMotionTarget({ blockLength: M.blockLength }, 3)).toBe(1.2); // 단계 모름(화면 없는 점검 봇) = 기본
  });

  it('진화 상태 → 몸동작 표에 단계·아란칼화 여부가 붙는다 (호로·사신 같은 값)', () => {
    for (const fid of ['hollow', 'shinigami']) {
      for (const [tier, ascended, len] of TABLE) {
        const s = newSaveData(fid, 1000);
        const e = { ...s.evolution, tierIndex: tier, ascended };
        const p: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
        applyEvolutionToParams(p, e, s.factionId, 0, false);
        expect([fid, tier, ascended, p.motion?.tier, p.motion?.ascended]).toEqual([fid, tier, ascended, tier, ascended]);
        expect(blockMotionTarget(p.motion, 1)).toBe(len);
        expect(blockMotionTarget(p.motion, 3)).toBe(len);
      }
    }
  });

  it('엔진: 블록을 쓰면 그 단계 기준 길이만큼(12/12/10/9/8틱) 몸동작 줄·평타 멈춤 — 체인 수와 무관', () => {
    for (const [tier, ascended, len] of TABLE) {
      for (const c of [1, 3]) {
        const s = quiet({ ...M, tier, ascended });
        s.tray = Array.from({ length: c }, (_, i) => ({ uid: 8000 + i, kind: 'skill' as const, traitId: BASIC_SKILL_ID, family: 'family-a' }));
        expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
        drainCombatEvents(s);
        let busy = 0;
        while (blockMotionBusy(s) && busy < 100) {
          step(s);
          busy++;
        }
        expect([tier, ascended, c, busy]).toEqual([tier, ascended, c, Math.round(len * 10)]);
      }
    }
  });

  it('나머지 규칙 그대로: 타격 = 원래 비율 × 배율(빠른 몸만 줄임, 느린 몸 1배), 피해 = 몸 타격 ÷ max(1, 배율)', () => {
    for (const [tier, ascended, len] of TABLE) {
      const motion: MotionParams = { ...M, tier, ascended, blockBy: { 'f:1': { total: 1.8, hit: 0.6 }, 'f:2': { total: 0.5, hit: 0.2 } } };
      const p = { motion, hitDelay: { basic: 0.3, block: 0.3, enemy: 0.3, heavy: 0.3, counter: 0.3, blockBy: { 'f:1': 0.6, 'f:2': 0.2 } } };
      const fast = blockMotionOf(p, 'f:1', 1)!;
      expect(fast.total).toBeCloseTo(len, 9);
      expect(fast.rate).toBeCloseTo(1.8 / len, 9);
      expect(fast.hit / fast.total).toBeCloseTo(0.6 / 1.8, 9); // 타격 비율 그대로
      expect(blockHitDelayOf(p, 'f:1', 1)).toBeCloseTo(0.6 / (1.8 / len), 9);
      const slow = blockMotionOf(p, 'f:2', 2)!;
      expect(slow.total).toBeCloseTo(len, 9); // 줄 길이 = 기준 길이(남는 시간 = 기본 대기)
      expect(slow.hit).toBeCloseTo(0.2, 9); // 느리게 재생하지 않음
      expect(blockHitDelayOf(p, 'f:2', 2)).toBeCloseTo(0.2, 9);
    }
  });

  it('적 몸동작은 이 표를 쓰지 않음(화면 배율은 내 공격만), 엔진·진화에 종족 분기 없음, 기획서 7절 줄', () => {
    const view = readFileSync('src/ui/attackFx.ts', 'utf8');
    expect(view).toMatch(/cue\.side === 'player' && cue\.chain !== undefined && opts\.blockLength/);
    const src = readFileSync('src/engine/combat/combat.ts', 'utf8') + readFileSync('src/engine/evolution/evolution.ts', 'utf8');
    expect(src).not.toMatch(/faction(Id)? === '(hollow|shinigami)'/);
    const gdd = readFileSync('docs/GDD.md', 'utf8');
    expect(gdd).toMatch(/1·2단계\(호로·길리안 \/ 혼백·영술원 학생\) \*\*1\.2초\*\* · 3단계\(아쥬커스 \/ 평대원\) \*\*1\.0초\*\* · 4단계\(바스트로데 \/ 수석 대원\) \*\*0\.9초\*\* · 아란칼화 성공 뒤/);
  });
});
