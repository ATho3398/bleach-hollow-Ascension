// C.357 (GDD 214장): 공격 피해를 모션 타격 순간에 — 공격 주기(타이머·발동 시각)는 그대로, 피해 적용만 타격 지연(hitDelay)만큼 뒤 틱에.
// 엔진(swing 사건·예약 피해·쓰러지면 버림·재현성)과 화면 순수 함수(엔진 지연 표 hitDelaysOf·계획 맞추기 alignPlan·재생기 hitInMs)를 본다.
import { describe, expect, it } from 'vitest';
import { getEnemy } from '../src/data/enemies';
import { HUMANOID, MOTIONS } from '../src/data/art/rig/pose';
import { resolveAnims } from '../src/data/art/anim';
import {
  blockHitDelayOf, blockHitKey, createCombat, drainCombatEvents, hitDelayTicks, newCombatScript, playCombatHuman, playScriptedCombat, replayCombat, step,
  type CombatEvent, type CombatParams, type CombatState, type HitDelayParams,
} from '../src/engine/combat';
import { alignPlan, cueHitMs, hitDelaysOf, lungePlan, type AnimTiming } from '../src/ui/attackFx';
import { ATTACK_FX } from '../src/ui/attackFxConfig';
import { createAnimPlayer } from '../src/ui/bha/animPlayer';
import { createRigPlayer } from '../src/ui/bha/rigAnim';

const normal = getEnemy('test-a');
const HD = (v: number, o: Partial<HitDelayParams> = {}): HitDelayParams => ({ basic: v, block: v, enemy: v, heavy: v, counter: v, ...o });
const mk = (params: Partial<CombatParams> = {}, seed = 1) => createCombat(seed, { enemy: normal, params: { blockPlayDamage: 1, blockPlayCrit: 0, ...params } });
const ev = (s: CombatState) => drainCombatEvents(s);
/** 적이 받은 피해 합 */
const dealt = (s: CombatState) => s.enemy.maxHp - s.enemy.hp;

describe('엔진: 발동은 그대로, 피해는 타격 지연 뒤 틱에 (GDD 214장 1)', () => {
  it('평타: 발동 틱에 swing(atTick = 지금 + 지연 틱), 체력은 그대로 → 지연 틱이 지나면 landed 사건과 함께 체력이 깎인다', () => {
    const s = mk({ hitDelay: HD(0, { basic: 0.3 }) });
    expect(hitDelayTicks(s.params, 0.3)).toBe(3);
    let swing: Extract<CombatEvent, { kind: 'swing' }> | undefined;
    for (let i = 0; i < 30 && !swing; i++) {
      step(s);
      swing = ev(s).find((e): e is Extract<CombatEvent, { kind: 'swing' }> => e.kind === 'swing');
    }
    expect(swing).toBeDefined();
    expect(swing!.hit.kind).toBe('player-attack');
    expect(swing!.atTick).toBe(s.tick + 3);
    expect(dealt(s)).toBe(0);
    expect(s.pendingHits).toHaveLength(1);
    step(s);
    step(s);
    expect(dealt(s)).toBe(0);
    expect(ev(s).some((e) => e.kind === 'player-attack')).toBe(false);
    step(s);
    const landed = ev(s).find((e) => e.kind === 'player-attack');
    expect(landed).toMatchObject({ kind: 'player-attack', landed: true, damage: swing!.hit.kind === 'player-attack' ? swing!.hit.damage : -1 });
    expect(dealt(s)).toBeCloseTo(swing!.hit.kind === 'player-attack' ? swing!.hit.damage : -1);
    expect(s.pendingHits).toHaveLength(0);
  });

  it('적 기본 공격도 같다: 막았는지(guarded)·피해는 발동 때 정해지고, 내 체력은 지연 뒤에 깎인다', () => {
    const s = mk({ hitDelay: HD(0, { enemy: 0.2 }) });
    s.enemy.attackTimer = 1;
    const hp = s.player.hp;
    step(s);
    const sw = ev(s).find((e) => e.kind === 'swing');
    expect(sw && sw.kind === 'swing' ? sw.hit.kind : null).toBe('enemy-attack');
    expect(s.player.hp).toBe(hp);
    step(s);
    expect(s.player.hp).toBe(hp);
    step(s);
    expect(s.player.hp).toBeLessThan(hp);
    expect(ev(s).find((e) => e.kind === 'enemy-attack')).toMatchObject({ landed: true });
  });

  it('지연 0·피해 0 인 공격은 옛날처럼 바로 (swing 없음)', () => {
    const s = mk({ hitDelay: HD(0) });
    for (let i = 0; i < 10; i++) step(s);
    const es = ev(s);
    expect(es.some((e) => e.kind === 'swing')).toBe(false);
    expect(es.some((e) => e.kind === 'player-attack' && !e.landed)).toBe(true);
    expect(dealt(s)).toBeGreaterThan(0);
  });

  it('초당 피해는 같다: 같은 시드·입력 없음에서 피해 수열이 같고, 지연만큼 늦게 들어간다 (GDD 214장 "DPS 같음")', () => {
    const big = { ...normal, hpInAttacks: 500 };
    const run = (hd: HitDelayParams) => {
      const s = createCombat(7, { enemy: big, params: { hitDelay: hd, playerHpScale: 100 } });
      const series: number[] = [];
      const hits: number[] = [];
      for (let i = 0; i < 300; i++) {
        step(s);
        series.push(dealt(s));
        for (const e of ev(s)) if (e.kind === 'player-attack' && (hd.basic === 0 || e.landed)) hits.push(e.damage);
      }
      return { s, series, hits };
    };
    const a = run(HD(0));
    const b = run(HD(0.3));
    expect(b.hits.length).toBeGreaterThan(20);
    expect(b.hits).toEqual(a.hits.slice(0, b.hits.length)); // 한 대 한 대의 피해가 같은 순서로
    for (let t = 3; t < 300; t++) expect(b.series[t]).toBeCloseTo(a.series[t - 3]!, 6); // 3틱 늦게 같은 누적
    expect((b.s.pendingHits ?? []).filter((h) => h.target === 'enemy').length).toBeLessThanOrEqual(1); // 날아가는 중인 내 평타는 최대 1
  });
});

describe('엔진: 쓰러지면 예약 피해는 버린다 (GDD 214장 2)', () => {
  it('내가 먼저 쓰러지면 날아가던 내 평타는 들어가지 않는다 (landed 사건도 없음)', () => {
    const s = mk({ hitDelay: HD(0, { basic: 0.3, enemy: 0.1 }) });
    s.player.hp = 0.01;
    s.player.attackTimer = 1;
    s.enemy.attackTimer = 1;
    step(s);
    expect(ev(s).filter((e) => e.kind === 'swing')).toHaveLength(2);
    expect(s.pendingHits).toHaveLength(2);
    step(s); // 적 공격 착탄 → 패배
    expect(s.status).toBe('lost');
    expect(dealt(s)).toBe(0);
    for (let i = 0; i < 5; i++) step(s);
    expect(dealt(s)).toBe(0);
    expect(ev(s).some((e) => e.kind === 'player-attack')).toBe(false);
  });

  it('적이 먼저 쓰러지면 적의 예약 공격은 없던 일 (내 체력 그대로)', () => {
    const s = mk({ hitDelay: HD(0, { basic: 0.1, enemy: 0.3 }) });
    s.enemy.hp = 0.01;
    s.player.attackTimer = 1;
    s.enemy.attackTimer = 1;
    const hp = s.player.hp;
    step(s);
    step(s); // 내 평타 착탄 → 승리
    expect(s.status).toBe('won');
    expect(s.finisher?.kind).toBe('basic-attack');
    for (let i = 0; i < 5; i++) step(s);
    expect(s.player.hp).toBe(hp);
  });
});

describe('엔진: 블록 지연 키·재현성·각본 전투 (GDD 214장 4)', () => {
  it('블록 공격 지연 = 계열:단계(1~3) 키 → 콤보·해방 → 기본값', () => {
    const p = { hitDelay: HD(0.3, { blockBy: { 'fam-a:2': 0.8, combo: 0.5 } }) };
    expect(blockHitKey('fam-a', 2)).toBe('fam-a:2');
    expect(blockHitKey('fam-a', 5)).toBe('fam-a:3');
    expect(blockHitKey(null, 2)).toBeNull();
    expect(blockHitDelayOf(p, 'fam-a:2')).toBe(0.8);
    expect(blockHitDelayOf(p, 'fam-a:1')).toBe(0.3);
    expect(blockHitDelayOf(p, 'combo')).toBe(0.5);
    expect(blockHitDelayOf(p, null)).toBe(0.3);
  });

  it('사람형 봇 한 판: 같은 시드 + 입력 기록으로 다시 돌리면 같은 결과 (예약 피해는 데이터뿐)', () => {
    const setup = { enemy: normal, params: { hitDelay: HD(0.3) } };
    const s = playCombatHuman(createCombat(3, setup));
    const r = replayCombat(3, setup, s.inputs);
    expect([r.status, r.tick, r.enemy.hp, r.player.hp]).toEqual([s.status, s.tick, s.enemy.hp, s.player.hp]);
    expect(s.pendingHits?.every((h) => h.atTick > s.tick - 10)).toBe(true);
  });

  it('각본 전투(첫 전투)는 지연이 있어도 끝까지 간다 — 마무리 체인은 맡겨 둔 피해(holdHit) 그대로 바로', () => {
    const s = playScriptedCombat(createCombat(1, { enemy: normal, params: { hitDelay: HD(0.3) }, script: newCombatScript() }));
    expect(s.status).toBe('won');
  });
});

describe('화면: 엔진 지연 표는 실제 동작 데이터에서 (hitDelaysOf·cueHitMs)', () => {
  const fake = (hit: Record<string, number>): AnimTiming => ({
    has: (a) => a in hit,
    peek: (a) => (a in hit ? { durationMs: hit[a]! * 2, hitAtMs: hit[a]! } : null),
  });
  it('동작이 있으면 그 타격 시각, 없으면 몸통박치기 계획이 닿는 시각(물러남 + 돌진)', () => {
    const a = fake({ attack: 300, skill: 800 });
    expect(cueHitMs({ tier: 'basic' }, a, 'male')).toBe(300);
    expect(cueHitMs({ tier: 'special' }, a, 'male')).toBe(800); // 강공격·콤보 = skill 동작
    expect(cueHitMs({ tier: 'basic' }, null, 'male')).toBe(ATTACK_FX.basic.backMs + ATTACK_FX.basic.lungeMs);
    expect(cueHitMs({ tier: 'special' }, fake({ attack: 150 }), 'male')).toBe(ATTACK_FX.special.backMs + ATTACK_FX.special.lungeMs); // skill 없음 → 대신 안 쓴다
  });
  it('표: 초 단위, 계열:단계·콤보·해방 키, 적은 적 동작으로', () => {
    const t = hitDelaysOf({ player: fake({ attack: 300, skill: 800 }), enemy: fake({ attack: 150 }), slot: 'male', familyIds: ['fam-a'], familyFx: () => ({ fx: 'slash', motion: 'cast' }), fallback: HD(0.3) });
    expect(t.basic).toBe(0.3);
    expect(t.enemy).toBe(0.15);
    expect(t.heavy).toBe((ATTACK_FX.special.backMs + ATTACK_FX.special.lungeMs) / 1000);
    expect(t.blockBy).toMatchObject({ 'fam-a:1': 0.8, 'fam-a:2': 0.8, 'fam-a:3': 0.8, combo: 0.8, liberation: 0.3 });
  });
  it('종이인형 peek: 변형 중 가장 늦은 타격(공격1 300·공격2 280 → 300), 특수 800·700 → 800', () => {
    const p = createRigPlayer(HUMANOID, MOTIONS, () => {}, () => 0);
    expect(p.peek('attack')?.hitAtMs).toBe(Math.max(MOTIONS.attack!.hit!, MOTIONS.attack2!.hit!));
    expect(p.peek('skill')?.hitAtMs).toBe(Math.max(MOTIONS.skill!.hit!, MOTIONS.skill2!.hit!));
    expect(p.peek('skill', { motion: 'strike' })?.hitAtMs).toBe(MOTIONS.straight!.hit);
    expect(p.peek('eat')).toBeNull();
  });
});

describe('화면: 타격 프레임을 엔진 착탄에 맞춘다 (hitInMs·alignPlan)', () => {
  it('종이인형: 타격이 더 늦으면 앞을 건너뛰고(100ms 뒤 타격), 더 이르면 기다렸다 시작(500ms 뒤 타격)', () => {
    const p = createRigPlayer(HUMANOID, MOTIONS, () => {}, () => 0);
    const hit = MOTIONS.attack!.hit!;
    let fired = 0;
    const a = p.play('attack', { hitInMs: 100, onHit: () => fired++ })!;
    expect(a.hitAtMs).toBe(100);
    expect(a.durationMs).toBe(MOTIONS.attack!.duration - (hit - 100));
    p.advance(99);
    expect(fired).toBe(0);
    p.advance(2);
    expect(fired).toBe(1);
    p.stop();
    const b = p.play('attack', { hitInMs: 500, onHit: () => fired++ })!;
    expect(b.hitAtMs).toBe(500);
    expect(b.durationMs).toBe(MOTIONS.attack!.duration + (500 - hit));
    expect(p.pose().t).toBe(hit - 500); // 음수 = 기다리는 중 (첫 자세)
    p.advance(499);
    expect(fired).toBe(1);
    p.advance(2);
    expect(fired).toBe(2);
    expect(p.play('attack', { hitInMs: 0 })!.hitAtMs).toBe(0); // 0 = 옛 즉발(fromHit)
  });
  it('프레임 그림 재생기도 같다', () => {
    const files = Array.from({ length: 4 }, (_, i) => `x/attack-${i + 1}.png`);
    const anims = resolveAnims(['x'], '', files, {});
    const shown: string[] = [];
    const p = createAnimPlayer(anims, 'still.png', { show: (u) => shown.push(u) });
    const hitAt = p.peek('attack')!.hitAtMs;
    expect(hitAt).toBeGreaterThan(0);
    let fired = 0;
    const r = p.play('attack', { hitInMs: hitAt + 200, onHit: () => fired++ })!;
    expect(r.hitAtMs).toBe(hitAt + 200);
    expect(shown.at(-1)).toBe('/art/x/attack-1.png');
    p.advance(hitAt + 190);
    expect([fired, shown.at(-1)]).toEqual([0, '/art/x/attack-1.png']);
    p.advance(20);
    expect(fired).toBe(1);
  });
  it('alignPlan: 닿는 시각보다 늦게 맞아야 하면 그만큼 기다린다(leadMs), 더 이르면 앞을 건너뛴다(음수 leadMs, GDD 224장 3)', () => {
    const plan = lungePlan(ATTACK_FX.basic, 1, 20);
    const early = alignPlan(plan, 100);
    expect(early.hitAtMs).toBe(100);
    expect(early.leadMs).toBe(100 - plan.hitAtMs);
    expect(early.durationMs).toBe(plan.durationMs - (plan.hitAtMs - 100));
    expect(alignPlan(plan, 0).hitAtMs).toBe(0); // 착탄이 이미 지났으면 타격부터
    expect(alignPlan(plan, undefined)).toBe(plan);
    const late = alignPlan(plan, plan.hitAtMs + 80);
    expect(late.leadMs).toBe(80);
    expect(late.hitAtMs).toBe(plan.hitAtMs + 80);
    expect(late.durationMs).toBe(plan.durationMs + 80);
  });
});
