// C.476 (GDD 7절 v6.106 '같은 진화 단계 = 블록 모션 길이 통일' · 12-4 아이젠, 사용자 2026-11-17 "ㅇㅇ 해" — 마스터 추천안, provisional):
// 블록 몸동작 총 길이 = 1체인 0.8초 / 2체인 1.0초 / 3체인 1.2초 (모든 단계·호로/사신 공통, 그림은 그대로 재생 배율로).
// 엔진(몸동작 줄·평타 멈춤·타격 틱)과 화면(실제 종이인형 재생)을 같은 값으로 본다. 그림 없는 몸(아이젠)·noMotion(월아천충) = 0. 아이젠 프라고르 몫 0.6·반격 창 0.8초.
import './helpers/rigMotions'; // 종이인형 동작 데이터 채우기 (C.509 — 게임에선 따로 받는 덩어리)
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import {
  BASIC_SKILL_ID, KIT_TRAIT_PREFIX, applyInput, blockHitDelayOf, blockMotionBusy, blockMotionOf, blockMotionTarget, createCombat, defaultCombatParams, drainCombatEvents, step,
  type Block, type CombatParams, type CombatState, type MotionParams,
} from '../src/engine/combat';
import { buildCombatParams } from '../src/engine/absorb/build';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { testGrantTranscendent } from '../src/engine/testMode';
import { newSaveData } from '../src/game';
import { createAnimPlayer } from '../src/ui/bha/animPlayer';
import { motionsOf } from '../src/ui/attackFx';
import { bodyRig, measureBlockMs } from './helpers/blockMotionLength';

const M = BALANCE.provisional.combat.motion;
const LEN = [0.8, 1.0, 1.2];
const normal = getEnemy('test-a');
let uid = 7000;
const blk = (family: string): Block => ({ uid: uid++, kind: 'skill', traitId: BASIC_SKILL_ID, family });

/** 조용한 전투: 생성·적 공격 멈춤, 적 체력 무한 */
const quiet = (params: Partial<CombatParams> = {}): CombatState => {
  const s = createCombat(1, { enemy: normal, params: { blockPlayDamage: 1, blockPlayCrit: 0, critChance: 0, enemyCritChance: 0, ...params } });
  s.enemy.hp = s.enemy.maxHp = 1e12;
  s.enemy.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  s.spawnTimer = 1e9;
  s.params.timeLimitSeconds = 1e9;
  return s;
};

describe('수치 (provisional)', () => {
  it('기준 길이 = 모든 단계 [0.8, 1.0, 1.2]초 · 단계 키 구조(byTier) · 아이젠 프라고르 몫 0.6 · 반격 창 0.8초', () => {
    expect(M.blockLength).toEqual({ default: LEN, byTier: {} });
    for (const c of [1, 2, 3]) expect(blockMotionTarget(M, c)).toBe(LEN[c - 1]);
    expect(blockMotionTarget(M, 5)).toBe(1.2); // 3체인 넘으면 마지막 값
    // 단계별로 나중에 다르게: byTier[단계] 가 있으면 그것, 없으면 default
    const t: Pick<MotionParams, 'blockLength' | 'tier'> = { blockLength: { default: LEN, byTier: { '2': [0.6, 0.7, 0.9] } }, tier: 2 };
    expect([1, 2, 3].map((c) => blockMotionTarget(t, c))).toEqual([0.6, 0.7, 0.9]);
    expect(blockMotionTarget({ ...t, tier: 1 }, 3)).toBe(1.2);
    const K = BALANCE.provisional.transcendentKits.aizen!;
    expect(K.blocks.fragor!.weight).toBe(0.6);
    expect(K.blocks.kyoka!.counter!.windowSeconds).toBe(0.8);
  });
  it('진화 상태를 실으면 몸동작 표에 그 진화 단계 키가 붙는다', () => {
    const s = newSaveData('hollow', 1000);
    const p: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
    applyEvolutionToParams(p, s.evolution, s.factionId, 0, false);
    expect(p.motion?.tier).toBe(s.evolution.tierIndex);
    expect(p.motion?.blockLength).toEqual(M.blockLength);
  });
});

describe('엔진: 몸동작 줄·평타 멈춤·타격 틱이 기준 길이', () => {
  it('실제 길이가 몸마다 달라도 블록 몸동작 = 0.8/1.0/1.2초, 타격 시각·타격 지연은 같은 배율', () => {
    const p = defaultCombatParams();
    p.motion = { ...p.motion!, blockBy: { 'family-a:1': { total: 0.4, hit: 0.2 }, 'family-a:2': { total: 1.9, hit: 0.95 }, 'family-a:3': { total: 0.6, hit: 0.15 } } };
    p.hitDelay = { ...p.hitDelay, blockBy: { 'family-a:1': 0.2, 'family-a:2': 0.95, 'family-a:3': 0.15 } };
    for (const c of [1, 2, 3]) {
      const m = blockMotionOf(p, `family-a:${c}`, c)!;
      expect(m.total).toBeCloseTo(LEN[c - 1]!, 9);
      const nat = p.motion.blockBy![`family-a:${c}`]!;
      expect(m.rate).toBeCloseTo(nat.total / LEN[c - 1]!, 9);
      expect(m.hit / m.total).toBeCloseTo(nat.hit / nat.total, 9); // 타격 비율 그대로
      expect(blockHitDelayOf(p, `family-a:${c}`, c)).toBeCloseTo(p.hitDelay.blockBy![`family-a:${c}`]! / m.rate, 9);
    }
  });
  it('1/2/3체인을 쓰면 그만큼(8/10/12틱) 평타 타이머가 멈춘다 — 화면 없는 기본값(1.4초 동작)도 기준 길이로', () => {
    for (const c of [1, 2, 3]) {
      const s = quiet();
      s.tray = Array.from({ length: c }, () => blk('family-a'));
      const t0 = s.player.attackTimer;
      expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
      const ev = drainCombatEvents(s);
      expect(ev.find((e) => e.kind === 'block-motion')).toMatchObject({ rate: 1, trim: 0 }); // 기준 길이 위에서 1배 (뒤에 기다리는 블록 없음)
      let busy = 0;
      while (blockMotionBusy(s) && busy < 100) {
        step(s);
        busy++;
      }
      expect([c, busy]).toEqual([c, Math.round(LEN[c - 1]! * 10)]);
      expect(s.player.attackTimer).toBeGreaterThanOrEqual(t0 - 1); // 모션 중엔 평타 없음 — 타이머 그대로(모션이 끝난 틱에 다시 돎)
    }
  });
  it('블록 연속 사용 절충안은 기준 길이 위에서 그대로: 재생 중 다음 블록 → 남은 부분 1.5배속, 다음 블록은 간격에 맞춰 빨리 감기', () => {
    const s = quiet();
    s.tray = [blk('family-a'), blk('family-a'), blk('family-a'), blk('family-b')];
    applyInput(s, { type: 'use', cell: 3 }); // family-b 1체인 (0.8초)
    drainCombatEvents(s);
    step(s);
    step(s);
    applyInput(s, { type: 'use', cell: 0 }); // family-a 3체인을 0.2초 뒤에
    const ev = drainCombatEvents(s);
    expect(ev.find((e) => e.kind === 'motion-hasten')).toMatchObject({ rate: M.fastMax });
    // 앞 모션 남은 0.6초 ÷ 1.5 = 0.4초 뒤 다음 모션 시작(1배 — 뒤에 기다리는 블록 없음)
    let n = 0;
    let started: { rate: number } | undefined;
    while (!started && n < 30) {
      step(s);
      n++;
      started = drainCombatEvents(s).find((e) => e.kind === 'block-motion') as { rate: number } | undefined;
    }
    expect(n).toBe(4);
    expect(started!.rate).toBe(1);
  });
});

describe('화면: 실제 종이인형 재생 길이 (진짜 재생기로 측정)', () => {
  const cases: [string, string, string, string][] = [
    ['3단계 아쥬커스(가시형)', 'spiky-base', 'hollow', 'family-a'],
    ['3단계 아쥬커스(짐승형 교)', 'beast-base', 'hollow', 'family-b'],
    ['사신 참', 'shinigami-base', 'shinigami', 'family-a'],
    ['사신 귀(여)', 'shinigami-base-f', 'shinigami', 'family-c'],
    ['길리안(손 모션 없음 — 대신 동작)', 'gillian-base', 'hollow', 'family-a'],
    ['아란칼 해방(여)', 'arrancar-base-f-released', 'hollow', 'family-c'],
  ];
  for (const [name, look, fac, fam] of cases) {
    it(`${name}: 1/2/3체인 = 0.8/1.0/1.2초 (변형이 달라도), 옛 길이는 몸마다 다름`, () => {
      for (const rng of [() => 0, () => 0.99]) {
        const b = bodyRig(look, fac, rng);
        for (const c of [1, 2, 3]) expect(Math.abs(measureBlockMs(b, fam, c, true).ms - LEN[c - 1]! * 1000)).toBeLessThanOrEqual(3);
      }
      // 엔진 몸동작 표도 같은 몸 데이터로 같은 길이
      const b = bodyRig(look, fac);
      const p = defaultCombatParams();
      p.motion = motionsOf({ player: b.player, slot: b.slot, familyIds: b.familyIds, familyFx: b.familyFx, fallback: p.motion! });
      for (const c of [1, 2, 3]) expect(blockMotionOf(p, `${fam}:${c}`, c)!.total).toBeCloseTo(LEN[c - 1]!, 9);
    });
  }
  it('옛 길이(배율 없음)는 몸마다 0.16~1.07초로 달랐다 — 통일 전 확인', () => {
    const old = [measureBlockMs(bodyRig('arrancar-base', 'hollow'), 'family-a', 3, false).ms, measureBlockMs(bodyRig('gillian-base', 'hollow'), 'family-c', 3, false).ms];
    expect(old[0]).toBeLessThan(300);
    expect(old[1]).toBeGreaterThan(1000);
  });
  it('프레임 그림 재생기도 lengthMs 로 길이를 맞춘다 (타격 비율 그대로)', () => {
    const shown: string[] = [];
    const clip = { action: 'skill', frames: ['a', 'b', 'c', 'd'], frameMs: [100, 100, 100, 100], hitFrame: 2, mode: 'once' } as never;
    const p = createAnimPlayer({ skill: clip }, 'still', { show: (u: string) => shown.push(u) } as never);
    const nat = p.peek('skill')!;
    expect(nat.durationMs).toBe(400);
    expect(p.peek('skill', { lengthMs: 800 })).toEqual({ durationMs: 800, hitAtMs: nat.hitAtMs * 2 });
    let done = false;
    let hitAt = -1;
    let t = 0;
    p.play('skill', { lengthMs: 800, onEnd: () => { done = true; }, onHit: () => { hitAt = t; } });
    while (!done && t < 5000) {
      p.advance(1);
      t++;
    }
    expect(t).toBe(800);
    expect(Math.abs(hitAt - nat.hitAtMs * 2)).toBeLessThanOrEqual(1);
  });
});

describe('몸동작 0: 그림 한 장(아이젠)·noMotion(월아천충)', () => {
  it('아이젠(몸 그림 없음 — 재생기 없음): 화면 몸동작 표 = 0 → 줄에 안 섬, 평타가 안 멈춘다, 타격 지연 배율 없음', () => {
    const s0 = newSaveData('hollow', 1000);
    expect(testGrantTranscendent(s0, 'aizen', 2000)).toBe('added');
    const p: Partial<CombatParams> = { ...buildCombatParams(s0.build, s0.factionId) };
    applyEvolutionToParams(p, s0.evolution, s0.factionId, 0, false);
    p.motion = motionsOf({ player: null, slot: 'male', familyIds: [], fallback: p.motion! });
    expect(p.motion.block).toEqual({ total: 0, hit: 0 });
    const s = quiet(p);
    expect(blockMotionOf(s.params, null, 3)).toBeNull();
    expect(blockHitDelayOf(s.params, null, 3)).toBe(s.params.hitDelay.block);
    s.tray = [{ uid: uid++, kind: 'skill', traitId: KIT_TRAIT_PREFIX + 'kido', family: null, element: null }];
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    const ev = drainCombatEvents(s);
    expect(ev.some((e) => e.kind === 'block-motion')).toBe(false);
    expect(blockMotionBusy(s)).toBe(false);
  });
  it('이치고 월아천충(noMotion): 기준 길이가 있어도 줄에 안 섬', () => {
    const s0 = newSaveData('shinigami', 1000);
    expect(testGrantTranscendent(s0, 'ichigo', 2000)).toBe('added');
    const p: Partial<CombatParams> = { ...buildCombatParams(s0.build, s0.factionId) };
    applyEvolutionToParams(p, s0.evolution, s0.factionId, 0, false);
    const s = quiet(p);
    expect(s.params.motion?.blockLength).toEqual(M.blockLength);
    s.tray = [1, 2, 3].map(() => ({ uid: uid++, kind: 'skill' as const, traitId: KIT_TRAIT_PREFIX + 'getsuga', family: null, element: null }));
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    expect(drainCombatEvents(s).some((e) => e.kind === 'block-motion')).toBe(false);
    expect(blockMotionBusy(s)).toBe(false);
  });
  it('아이젠 경화수월 반격 창 = 0.8초 (사건 seconds)', () => {
    const s0 = newSaveData('hollow', 1000);
    testGrantTranscendent(s0, 'aizen', 2000);
    const p: Partial<CombatParams> = { ...buildCombatParams(s0.build, s0.factionId) };
    applyEvolutionToParams(p, s0.evolution, s0.factionId, 0, false);
    const s = quiet(p);
    s.player.attackTimer = 1e9;
    s.params.evadeChance = 0;
    s.enemy.attackTimer = 1;
    let win: number | undefined;
    for (let i = 0; i < 40 && win === undefined; i++) {
      step(s);
      const e = drainCombatEvents(s).find((x) => x.kind === 'kit-window');
      if (e && e.kind === 'kit-window') win = e.seconds;
    }
    expect(win).toBe(0.8);
  });
});
