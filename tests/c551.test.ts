// C.551 (GDD 7절 v6.225, 사용자 2026-11-27 "스킬은 쓰면 그냥 모션에 맞춰서 딜 들어가게 하자. 어차피 모션 속도도 공통으로 바꿨으니까"):
// 블록 피해·적 맞음 반응 = 몸동작 타격 프레임 시각(기준 길이 위) — 이펙트·투사체 도착을 기다리지 않는다(옛 C.512 '+ 1배 이펙트 몫' 폐기).
// 블록 타격 지연 = 몸 몫 ÷ max(1, 배율)만. 이펙트는 1배 속도로 보이기만. 엔진은 종족·몸 이름 분기 없이 동작 길이 표만 읽는다.
import './helpers/rigMotions';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RIG_PACKS } from '../src/data/art/rig/pose';
import { getEnemy } from '../src/data/enemies';
import { BASIC_SKILL_ID, applyInput, blockHitDelayOf, blockHitKey, blockMotionOf, createCombat, defaultCombatParams, drainCombatEvents, step } from '../src/engine/combat';
import { attackCueOf, blockBodyMs, blockReactTimes, cueHitParts, hitDelaysOf, motionsOf, type AttackCue } from '../src/ui/attackFx';
import { blockEvent, bodyRig } from './helpers/blockMotionLength';

const ALL_LOOKS = RIG_PACKS.flatMap((p) => Object.keys(p.rig.looks));
const FACS = ['hollow', 'shinigami'] as const;

describe('C.551 블록 피해 = 몸동작 타격 순간 (GDD 7절 v6.225)', () => {
  it('엔진: 타격 지연 = 몸 몫 ÷ max(1, 배율)만, 이펙트 몫 칸(blockFxBy) 없음', () => {
    const p = defaultCombatParams();
    p.motion = { ...p.motion!, blockBy: { 'f:1': { total: 2.4, hit: 0.6 }, 'f:2': { total: 0.4, hit: 0.2 } } }; // C.552: 기준 1.2초 → 2.4초 몸 = 배율 2
    p.hitDelay = { ...p.hitDelay, blockBy: { 'f:1': 0.6, 'f:2': 0.2 } };
    expect(blockHitDelayOf(p, 'f:1', 1)).toBeCloseTo(0.6 / 2, 9); // 2.4초 몸 → 기준 1.2초, 배율 2
    expect(blockHitDelayOf(p, 'f:2', 2)).toBeCloseTo(0.2, 9); // 짧은 몸 → 1배 그대로(느리게 재생 안 함)
    expect(blockHitDelayOf(p, 'f:1', 1)).toBeCloseTo(blockMotionOf(p, 'f:1', 1)!.hit, 9); // = 몸동작 표 타격(기준 길이 위)
    const src = readFileSync('src/engine/combat/combat.ts', 'utf8');
    expect(src).not.toMatch(/blockFxBy/);
    expect(readFileSync('src/ui/attackFx.ts', 'utf8')).not.toMatch(/blockFxBy\[|blockFxBy:/);
  });

  it('실제 몸 전부(종이인형 × 호로·사신 × 계열 × 1~3체인): 엔진 피해 시각 = 몸동작 표 타격 시각 (옛 식 대비 평균 출력)', () => {
    let n = 0;
    let oldSum = 0;
    let newSum = 0;
    let earlier = 0;
    let later = 0;
    for (const look of ALL_LOOKS) {
      for (const fac of FACS) {
        const b = bodyRig(look, fac);
        const p = defaultCombatParams();
        p.motion = motionsOf({ player: b.player, slot: b.slot, familyIds: b.familyIds, familyFx: b.familyFx, fallback: p.motion! });
        p.hitDelay = hitDelaysOf({ player: b.player, enemy: null, slot: b.slot, familyIds: b.familyIds, familyFx: b.familyFx, fallback: p.hitDelay });
        for (const fam of b.familyIds) {
          for (const c of [1, 2, 3]) {
            const key = blockHitKey(fam, c)!;
            const m = blockMotionOf(p, key, c)!;
            const d = blockHitDelayOf(p, key, c);
            expect(Math.abs(d - m.hit)).toBeLessThanOrEqual(0.003);
            const cue = attackCueOf(blockEvent(fam, c), 3, b.familyFx) as AttackCue;
            const parts = cueHitParts(cue, b.player, b.slot);
            expect(parts.hitMs).toBeCloseTo(blockBodyMs(cue, b.player, b.slot)!.hitMs, 6);
            const old = parts.bodyMs / 1000 / Math.max(1, m.rate) + parts.fxMs / 1000; // 옛 C.512 식
            oldSum += old;
            newSum += d;
            if (d < old - 0.001) earlier++;
            if (d > old + 0.001) later++;
            n++;
          }
        }
      }
    }
    console.log(`C.551 블록 피해 시각 평균: 옛 ${(oldSum / n).toFixed(3)}초 → 새 ${(newSum / n).toFixed(3)}초 (${n}칸, 앞당겨진 칸 ${earlier} · 늦어진 칸 ${later})`);
    expect(n).toBeGreaterThan(100);
  });

  it('맞음 반응: 첫 반응 = 몸 타격, 여러 타격은 이펙트 반응 간격 그대로 / null = 옛 식(적 공격·각본 마무리 체인)', () => {
    expect(blockReactTimes([300, 500, 650], 120)).toEqual([120, 320, 470]);
    expect(blockReactTimes([300, 500], null)).toEqual([300, 500]);
    expect(blockReactTimes([], 50)).toEqual([]);
    const src = readFileSync('src/ui/attackFx.ts', 'utf8');
    expect(src).toMatch(/const bodyTimed = cue\.side === 'player' && !cue\.windup;/); // 적 강공격 빔·각본 마무리(windup)는 옛 식
  });

  it('엔진 전투: 블록을 쓰면 swing 착탄 틱 = 쓴 틱 + 몸동작 타격(기준 길이 위, 올림) — 그 틱에 적 체력이 준다', () => {
    const s = createCombat(1, { enemy: getEnemy('test-a'), params: { blockPlayDamage: 1, blockPlayCrit: 0, critChance: 0, enemyCritChance: 0 } });
    s.enemy.hp = s.enemy.maxHp = 1e12;
    s.enemy.attackTimer = s.enemy.actionTimer = s.spawnTimer = s.player.attackTimer = 1e9;
    s.params.timeLimitSeconds = 1e9;
    s.params.motion = { ...s.params.motion!, blockBy: { 'family-a:1': { total: 2.4, hit: 0.5 } } }; // 2.4초 몸 → 기준 1.2초(C.552), 배율 2 → 타격 0.25초
    s.params.hitDelay = { ...s.params.hitDelay, blockBy: { 'family-a:1': 0.5 } };
    s.tray = [{ uid: 9001, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a' }];
    const t0 = s.tick;
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    const sw = drainCombatEvents(s).find((e) => e.kind === 'swing');
    expect(sw && sw.kind === 'swing').toBe(true);
    const due = Math.ceil(0.25 / s.params.tickSeconds - 1e-6);
    expect(blockHitDelayOf(s.params, 'family-a:1', 1)).toBeCloseTo(0.25, 9);
    expect((sw as { atTick: number }).atTick - t0).toBeGreaterThanOrEqual(due);
    expect((sw as { atTick: number }).atTick - t0).toBeLessThanOrEqual(due + 1);
    const hp0 = s.enemy.hp;
    while (s.tick < (sw as { atTick: number }).atTick - 1) step(s);
    expect(s.enemy.hp).toBe(hp0); // 타격 프레임 전엔 그대로
    step(s);
    step(s);
    expect(s.enemy.hp).toBeLessThan(hp0); // 타격 프레임에 줄어듦
  });

  it('화면 없는 기본 표(점검 봇·balance)는 그대로 — 이펙트 몫이 원래 없었다', () => {
    const p = defaultCombatParams();
    expect('blockFxBy' in p.hitDelay).toBe(false);
  });

  it('엔진에 종족·몸 이름 분기 없음, 기획서 7절 줄', () => {
    const src = readFileSync('src/engine/combat/combat.ts', 'utf8');
    expect(src).not.toMatch(/faction(Id)? === '(hollow|shinigami)'/);
    const gdd = readFileSync('docs/GDD.md', 'utf8');
    expect(gdd).toMatch(/블록 피해 = 몸동작 타격 순간에 바로/);
  });
});
