// 계열별 공격 연출과 묶음 경계 표시 (GDD 19-2, C.45): DOM 없는 순수 부분
import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '../src/engine/combat';
import { FACTIONS } from '../src/data/factions';
import { familyOf, type AttackFxKind } from '../src/engine/faction';
import { attackCueOf, castPlan, familyHits, familyMotion, familyShakes, familyStage } from '../src/ui/attackFx';
import { ATTACK_FX, FAMILY_MOTION, FAMILY_STAGE_FX } from '../src/ui/attackFxConfig';
import { groupCuts } from '../src/ui/bha/battle';

const block = (o: Partial<Extract<CombatEvent, { kind: 'block' }>> = {}): CombatEvent => ({
  kind: 'block', block: 'skill', traitId: 'x', family: null, element: null, matchup: 'neutral', role: 'attack', chain: 1, damage: 10, weak: false, heal: 0, guardSeconds: 0, bonus: null, ...o,
});

describe('계열 공격 연출 고르기', () => {
  const hollow = FACTIONS.find((f) => f.id === 'hollow')!;
  const fxOf = (id: string) => familyOf(hollow, id)?.fx;

  it('계열 공격 블록은 그 계열의 연출 종류와 단계(묶음 크기)를 가진다', () => {
    const c1 = attackCueOf(block({ family: 'family-a', chain: 1 }), 3, fxOf);
    expect(c1).toMatchObject({ fx: 'claw', stage: 1, fam: 'family-a', tier: 'chain1' });
    expect(attackCueOf(block({ family: 'family-b', chain: 2 }), 3, fxOf)).toMatchObject({ fx: 'bite', stage: 2 });
    expect(attackCueOf(block({ family: 'family-c', chain: 3, matchup: 'strong' }), 3, fxOf)).toMatchObject({ fx: 'shot', stage: 3, tier: 'weak' });
  });

  it('자동 기본 공격·계열 없는 블록·막기·회복은 계열 연출 없이 몸통박치기', () => {
    expect(attackCueOf({ kind: 'player-attack', damage: 5, matchup: 'neutral' }, 3, fxOf)?.fx).toBeUndefined();
    expect(attackCueOf(block({ family: null }), 3, fxOf)?.fx).toBeUndefined();
    expect(attackCueOf(block({ family: 'family-a', role: 'guard', damage: 0 }), 3, fxOf)).toBeNull();
    expect(attackCueOf(block({ family: 'family-a', role: 'heal' }), 3, fxOf)?.fx).toBeUndefined();
    // 연출 종류 함수를 안 주면(옛 호출) 그대로 몸통박치기
    expect(attackCueOf(block({ family: 'family-a' }), 3)?.fx).toBeUndefined();
  });

  it('콤보는 가장 센 단계 + 이름을 크게(ult)', () => {
    expect(attackCueOf(block({ block: 'combo', family: null }), 3, fxOf)).toMatchObject({ tier: 'special', ult: true });
  });

  it('연출 종류마다 움직임 데이터가 있고, 탄·귀는 제자리 발사, 조·교·참·권은 돌진', () => {
    for (const f of FACTIONS) for (const fam of f.families) expect(FAMILY_MOTION[fam.fx]).toBeDefined();
    const moves = Object.fromEntries((Object.keys(FAMILY_MOTION) as AttackFxKind[]).map((k) => [k, familyMotion(k).move]));
    expect(moves).toEqual({ claw: 'lunge', bite: 'lunge', shot: 'cast', slash: 'lunge', impact: 'lunge', beam: 'cast' });
  });
});

describe('단계별 타격 시각표', () => {
  it('1단계 1회, 2단계 연타 3회, 3단계 연타 + 마지막이 크고 화면 흔들림', () => {
    expect(familyHits(1, 200)).toEqual([{ atMs: 200, scale: 1 }]);
    const h2 = familyHits(2, 200);
    expect(h2.map((h) => h.atMs)).toEqual([200, 200 + FAMILY_STAGE_FX[1]!.gapMs, 200 + FAMILY_STAGE_FX[1]!.gapMs * 2]);
    const h3 = familyHits(3, 100);
    expect(h3).toHaveLength(3);
    expect(h3.at(-1)!.scale).toBeGreaterThan(h3[0]!.scale);
    expect([familyShakes(1), familyShakes(2), familyShakes(3)]).toEqual([false, false, true]);
  });

  it('단계는 1~3 안으로 (4체인 이상이 와도 3단계 연출)', () => {
    expect([familyStage(0), familyStage(1), familyStage(3), familyStage(7)]).toEqual([1, 1, 3, 3]);
  });

  it('제자리 발사 반동: 투사체가 날아가는 시간 뒤에 맞고, 제자리로 돌아온다', () => {
    const p = castPlan(ATTACK_FX.chain1, 1, 230);
    expect(p.hitAtMs).toBe(Math.max(60, ATTACK_FX.chain1.backMs) + 230);
    expect(p.durationMs).toBeGreaterThan(p.hitAtMs);
    expect(p.keyframes[0]!.transform).toBe(p.keyframes.at(-1)!.transform);
    expect(p.ghosts).toBe(0);
  });
});

describe('블록 바 묶음 경계 (GDD 19-2)', () => {
  it('덩어리 안에서 새 묶음이 시작하는 칸에만 경계가 생긴다', () => {
    // 칸 0~4 같은 계열 5개(3+2), 5~6 다른 계열 2개, 7 단독
    const runs = [{ start: 0, length: 5 }, { start: 5, length: 2 }, { start: 7, length: 1 }];
    const groups = [{ start: 0, length: 3 }, { start: 3, length: 2 }, { start: 5, length: 2 }, { start: 7, length: 1 }];
    expect(groupCuts(runs, groups)).toEqual([3]);
    expect(groupCuts([{ start: 0, length: 7 }], [{ start: 0, length: 3 }, { start: 3, length: 3 }, { start: 6, length: 1 }])).toEqual([3, 6]);
    expect(groupCuts(runs.slice(1), groups.slice(2))).toEqual([]);
  });
});
