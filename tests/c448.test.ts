// C.448 (GDD 7-2): 빠른 간격의 모션 · 모션 중엔 평타 없음 · 블록 연속 사용 = 절충안(줄 세우기) · 모션과 이펙트는 따로 계산.
// 엔진(fitMotion·몸동작 줄·평타 타이머 멈춤)과 화면 순수 함수(bodyMotionSpec·bodyStartPlan)를 본다.
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import {
  BASIC_SKILL_ID, applyInput, blockMotionBusy, createCombat, drainCombatEvents, fitMotion, step, ticksOf,
  type Block, type CombatEvent, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { bodyMotionSpec, bodyStartPlan, type PixelPlan } from '../src/ui/pixelAttack';

const normal = getEnemy('test-a');
let uid = 9000;
const blk = (family: string): Block => ({ uid: uid++, kind: 'skill', traitId: BASIC_SKILL_ID, family });
const MOTION = { fastMax: 1.5, basic: { total: 0.6, hit: 0.3 }, block: { total: 1.0, hit: 0.5 } };
const mk = (params: Partial<CombatParams> = {}) => {
  const s = createCombat(1, { enemy: normal, params: { blockPlayDamage: 1, blockPlayCrit: 0, critChance: 0, enemyCritChance: 0, motion: MOTION, ...params } });
  s.enemy.hp = s.enemy.maxHp = 1e12;
  s.enemy.attackTimer = 1e9;
  return s;
};
const ev = (s: CombatState) => drainCombatEvents(s);
const swings = (list: CombatEvent[]) => list.filter((e) => e.kind === 'swing' && e.hit.kind === 'player-attack').length;

describe('빠른 간격의 모션 (fitMotion)', () => {
  it('간격이 모션보다 길면 그대로', () => {
    expect(fitMotion({ total: 0.6, hit: 0.3 }, 1, 1.5)).toEqual({ rate: 1, trim: 0, length: 0.6, hitIn: 0.3 });
    expect(fitMotion({ total: 0.6, hit: 0.3 }, null, 1.5)).toEqual({ rate: 1, trim: 0, length: 0.6, hitIn: 0.3 });
  });
  it('기획서 예: 0.6초 모션 → 1.5배속 0.4초 → 간격 0.3초면 앞 0.1초(재생 시간) 자름, 타격은 남은 모션의 타격 프레임', () => {
    const f = fitMotion({ total: 0.6, hit: 0.3 }, 0.3, 1.5);
    expect(f.rate).toBe(1.5);
    expect(f.length).toBeCloseTo(0.3);
    expect(f.trim).toBeCloseTo(0.15); // 1배 시간 0.15초 = 재생 시간 0.1초
    expect(f.hitIn).toBeCloseTo(0.1);
  });
  it('1.5배속 안에 들어가면 자르지 않는다', () => {
    const f = fitMotion({ total: 0.6, hit: 0.3 }, 0.5, 1.5);
    expect(f.rate).toBeCloseTo(1.2);
    expect(f.trim).toBe(0);
    expect(f.length).toBeCloseTo(0.5);
  });
  it('준비 동작(첫 타격 전)까지만 자른다 — 타격 프레임부터는 남긴다', () => {
    const f = fitMotion({ total: 0.6, hit: 0.3 }, 0.05, 1.5);
    expect(f.hitIn).toBe(0);
    expect(f.trim).toBeCloseTo(0.3);
    expect(f.length).toBeCloseTo(0.2);
  });
  it('엔진 평타: 간격이 모션보다 짧으면 swing 의 타격 시각이 남은 모션 타격 프레임, rate 를 사건에 싣는다', () => {
    const s = mk({ motion: { ...MOTION, basic: { total: 2, hit: 1 } }, hitDelay: { basic: 1, block: 0.3, enemy: 0.3, heavy: 0.3, counter: 0.3 } }); // 타격 = hitDelay.basic(화면이 동작 타격으로 넣는 값) · 기본 간격 1초 < 2초 모션 → 1.5배속 1.33초 → 앞 0.33초 자름 → 타격 0.33초 뒤
    let sw: Extract<CombatEvent, { kind: 'swing' }> | undefined;
    for (let i = 0; i < 40 && !sw; i++) {
      step(s);
      sw = ev(s).find((e): e is Extract<CombatEvent, { kind: 'swing' }> => e.kind === 'swing' && e.hit.kind === 'player-attack');
    }
    expect(sw).toBeDefined();
    expect(sw!.hit.kind === 'player-attack' ? sw!.hit.rate : null).toBe(1.5);
    expect(sw!.atTick - s.tick).toBe(Math.ceil(fitMotion({ total: 2, hit: 1 }, 1, 1.5).hitIn / s.params.tickSeconds - 1e-6));
  });
});

describe('모션 중엔 평타 없음 · 블록 줄 세우기', () => {
  it('블록 모션이 재생되는 동안 평타가 나가지 않고, 끝나면 평타 타이머가 다시 돈다', () => {
    const s = mk();
    const before = s.player.attackTimer;
    s.tray.push(blk('family-a'));
    step(s, { type: 'use', cell: 0 });
    const first = ev(s);
    expect(first.find((e) => e.kind === 'block-motion')).toMatchObject({ kind: 'block-motion', id: 1, rate: 1, trim: 0 });
    const blockEv = first.find((e) => e.kind === 'swing' && e.hit.kind === 'block');
    expect(blockEv && blockEv.kind === 'swing' && blockEv.hit.kind === 'block' ? blockEv.hit.motionId : null).toBe(1);
    expect(blockMotionBusy(s)).toBe(true);
    // 모션 1초 동안 평타 없음 · 타이머 그대로
    const motionTicks = ticksOf(s.params, MOTION.block.total);
    let n = 0;
    for (let i = 1; i < motionTicks; i++) {
      step(s);
      n += swings(ev(s));
    }
    expect(n).toBe(0);
    expect(s.player.attackTimer).toBe(before);
    step(s);
    expect(blockMotionBusy(s)).toBe(false);
    // 그 뒤 평타 간격 안에 평타가 나간다
    for (let i = 0; i < ticksOf(s.params, 1.1); i++) {
      step(s);
      n += swings(ev(s));
    }
    expect(n).toBeGreaterThanOrEqual(1);
  });

  it('연속으로 쓴 블록은 누른 순서대로 줄: 뒤에 기다리는 게 있으면 재생 중 모션은 1.5배속, 기다리던 모션은 빠른 간격 규칙, 줄이 비면 원래 속도', () => {
    const s = mk();
    s.tray.push(blk('family-a'), blk('family-b'), blk('family-c'));
    // 같은 틱에 3개 (블록 하나씩 따로 — 계열이 달라 체인이 아니다)
    step(s, [{ type: 'use', cell: 0 }, { type: 'use', cell: 0 }, { type: 'use', cell: 0 }]);
    const evs = ev(s);
    const motions = evs.filter((e): e is Extract<CombatEvent, { kind: 'block-motion' }> => e.kind === 'block-motion');
    expect(motions.map((m) => m.id)).toEqual([1]);
    expect(evs.find((e) => e.kind === 'motion-hasten')).toMatchObject({ id: 1, rate: 1.5 });
    // 블록 3개의 사건(이펙트·피해 예약)은 누른 틱에 모두 나왔다
    expect(evs.filter((e) => e.kind === 'swing' && e.hit.kind === 'block').length).toBe(3);
    const all: CombatEvent[] = [];
    for (let i = 0; i < 40; i++) {
      step(s);
      all.push(...ev(s));
    }
    const later = all.filter((e): e is Extract<CombatEvent, { kind: 'block-motion' }> => e.kind === 'block-motion');
    expect(later.map((m) => m.id)).toEqual([2, 3]);
    // 2번: 3번이 같은 틱에 눌려 기다림 → 간격 0 → 1.5배속 + 준비 동작 전부 자름
    expect(later[0]!.rate).toBe(1.5);
    expect(later[0]!.trim).toBeCloseTo(MOTION.block.hit);
    // 3번: 뒤에 아무것도 없음 → 원래 속도
    expect(later[1]).toMatchObject({ rate: 1, trim: 0 });
  });

  it('motion 이 없는 params(옛 동작)는 줄도 멈춤도 없다', () => {
    const s = mk({ motion: undefined });
    s.tray.push(blk('family-a'));
    step(s, { type: 'use', cell: 0 });
    expect(ev(s).some((e) => e.kind === 'block-motion')).toBe(false);
    expect(blockMotionBusy(s)).toBe(false);
  });

  it('balance 기본값: 최대 1.5배속', () => {
    expect(BALANCE.provisional.combat.motion.fastMax).toBe(1.5);
  });
});

describe('화면: 몸동작 시간줄 (이펙트와 따로)', () => {
  const body = (o: Partial<NonNullable<PixelPlan['body']>> = {}): NonNullable<PixelPlan['body']> =>
    ({ chain: [{ id: 'a', rate: 1 }, { id: 'b', rate: 2 }], bodyAt: 0, bodyFromHit: false, at: 100, speed: 1, ...o }) as NonNullable<PixelPlan['body']>;
  it('길이 = 앞 기다림 + 동작 길이 합(÷ 빠르기), 타격 = 앞 기다림 + 첫 동작 타격', () => {
    expect(bodyMotionSpec(body(), [{ durationMs: 600, hitAtMs: 300 }, { durationMs: 400, hitAtMs: 200 }])).toEqual({ totalMs: 100 + 600 + 200, hitMs: 400 });
  });
  it('첫 동작이 타격 프레임부터면 타격 뒤만 센다', () => {
    expect(bodyMotionSpec(body({ bodyFromHit: true }), [{ durationMs: 600, hitAtMs: 300 }, { durationMs: 400, hitAtMs: 200 }])).toEqual({ totalMs: 100 + 300 + 200, hitMs: 100 });
  });
  it('앞 자르기는 기다림부터 먹고, 남으면 첫 동작 앞부분을 건너뛴다', () => {
    expect(bodyStartPlan(100, 1, 0)).toEqual({ waitMs: 100, skipMs: 0 });
    expect(bodyStartPlan(100, 1.5, 60)).toEqual({ waitMs: 40 / 1.5, skipMs: 0 });
    expect(bodyStartPlan(100, 1.5, 250)).toEqual({ waitMs: 0, skipMs: 150 });
  });
});
