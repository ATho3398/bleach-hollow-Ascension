// C.367 (GDD 224장): 튜토리얼 '일반 공격은 자동' 카드 · 튜토리얼(과 일반) 전투 피해를 모션 타격 순간에.
// 엔진: 시작 카드(auto-intro) · 막아 낸 강공격(피해 0)도 예약 · 각본 '맞은 뒤 멈춤'은 착탄 뒤부터 · step 입력은 그 틱 기준 · 지연 틱 올림.
// 화면 순수 함수: 연결 동작 처음부터(bodySwingMs·bodyLeadMs·bodyLastHitMs) · 지연 표(bodyWindup) · 계획 앞 건너뛰기(alignPlan).
import { describe, expect, it } from 'vitest';
import { getEnemy } from '../src/data/enemies';
import {
  createCombat, drainCombatEvents, hitDelayTicks, newCombatScript, playScriptedCombat, scriptAck, scriptPrompt, scriptStep, step,
  type CombatEvent, type CombatParams, type CombatState, type HitDelayParams,
} from '../src/engine/combat';
import { bodyLastHitMs, bodyLeadMs, bodySwingMs, cueHitMs, type AnimTiming } from '../src/ui/attackFx';
import type { PixelPlan } from '../src/ui/pixelAttack';
import tutorial from '../src/data/help/tutorial.json';
import { BATTLE_HELP_TARGETS } from '../src/data/help';

const normal = getEnemy('test-a');
const HD = (v: number, o: Partial<HitDelayParams> = {}): HitDelayParams => ({ basic: v, block: v, enemy: v, heavy: v, counter: v, ...o });
const scripted = (params: Partial<CombatParams> = {}) => createCombat(3, { enemy: normal, params: { blockPlayDamage: 1, blockPlayCrit: 0, ...params }, script: newCombatScript() });
/** 기다리는 단계가 나올 때까지 틱 (사건은 모아 둔다) */
const until = (s: CombatState, stage: string, log: CombatEvent[], max = 5000) => {
  for (let i = 0; i < max && s.status === 'playing'; i++) {
    const p = scriptPrompt(s);
    if (p?.stage === stage) return true;
    if (p?.wait === 'ack') scriptAck(s);
    else if (p?.wait === 'guard') scriptStep(s, { type: 'guard' });
    else if (p?.wait === 'use') scriptStep(s, { type: 'use', cell: 0 });
    else scriptStep(s);
    log.push(...drainCombatEvents(s));
  }
  return false;
};

describe("224장 1: '일반 공격은 자동' 카드", () => {
  it('각본 전투는 그 카드로 시작하고, 카드가 떠 있는 동안 시간이 흐르지 않으며 [다음] 뒤에 자동 공격이 시작된다', () => {
    const s = scripted({ hitDelay: HD(0) });
    expect(scriptPrompt(s)).toEqual({ stage: 'auto-intro', wait: 'ack' });
    const t = s.tick;
    expect(scriptStep(s, { type: 'guard' })).toEqual([false]);
    scriptStep(s);
    expect(s.tick).toBe(t);
    expect(scriptAck(s)).toBe(true);
    expect(s.script?.stage).toBe('auto');
    for (let i = 0; i < 40; i++) scriptStep(s);
    expect(s.tick).toBeGreaterThan(t);
    expect(s.script!.hits + (s.script!.stage === 'auto' ? 0 : 3)).toBeGreaterThan(0); // 자동 공격이 나갔다
  });
  it('카드 문구·대상: 내 캐릭터 옆(battle.hero), 종족 분기 없는 공용 문구, 지켜보기 단계 없음', () => {
    const card = tutorial.script.find((x) => x.id === 'auto-intro')!;
    expect(card.targets).toEqual(['battle.hero']);
    expect(card.body).toContain('자동');
    expect(BATTLE_HELP_TARGETS).toContain('battle.hero');
    expect(tutorial.script[0]!.id).toBe('auto-intro');
    const stages: string[] = [];
    playScriptedCombat(scripted({ hitDelay: HD(0.3, { heavy: 0.8 }) }), (x) => { if (stages.at(-1) !== x) stages.push(x); });
    expect(stages).toEqual(['auto-intro', 'guard-now', 'guard-ok', 'hurt', 'nice', 'chain-use']);
  });
});

describe('224장 2: 튜토리얼 전투 피해 = 모션 타격 순간', () => {
  it('막아 낸 강공격(피해 0)도 바로 넣지 않고 예약 → 지연 뒤 landed. 막기 성공 카드는 그 뒤(맞음 모션이 끝난 뒤)', () => {
    const s = scripted({ hitDelay: HD(0.3, { heavy: 0.8 }) });
    const log: CombatEvent[] = [];
    expect(until(s, 'guard-now', log)).toBe(true);
    scriptStep(s, { type: 'guard' });
    log.length = 0;
    expect(until(s, 'guard-ok', log)).toBe(true);
    const sw = log.find((e) => e.kind === 'swing' && e.hit.kind === 'heavy-hit');
    const landed = log.findIndex((e) => e.kind === 'heavy-hit');
    expect(sw && sw.kind === 'swing' && sw.hit.kind === 'heavy-hit' ? sw.hit.guarded && sw.hit.damage === 0 : false).toBe(true);
    expect(log[landed]).toMatchObject({ kind: 'heavy-hit', guarded: true, landed: true });
    expect(log.indexOf(sw!)).toBeLessThan(landed);
    // 카드는 착탄 + hurtHoldSeconds 뒤: 착탄 틱보다 늦게
    expect(s.tick).toBeGreaterThan(sw && sw.kind === 'swing' ? sw.atTick : Infinity);
    expect((s.pendingHits ?? []).some((h) => h.event.kind === 'heavy-hit')).toBe(false);
  });
  it('못 막는 강공격: 위기 카드(블록 1개)는 강공격이 실제로 맞은 뒤에 — 기다릴 때 예약된 강공격이 없다', () => {
    const s = scripted({ hitDelay: HD(0.3, { heavy: 0.8 }) });
    const log: CombatEvent[] = [];
    expect(until(s, 'hurt', log)).toBe(true);
    expect((s.pendingHits ?? []).some((h) => h.event.kind === 'heavy-hit')).toBe(false);
    const hits = log.filter((e) => e.kind === 'heavy-hit');
    expect(hits.map((e) => e.kind === 'heavy-hit' && e.guarded)).toEqual([true, false]);
    expect(hits.every((e) => 'landed' in e && e.landed)).toBe(true);
  });
  it('블록 1개(위기 카드에서 사용): 예약 → 지연 뒤 피해, 좋아! 카드는 착탄 뒤. 지연 0.3초 = 3틱 그대로(대기 단계 입력은 틱 없이)', () => {
    const s = scripted({ hitDelay: HD(0.3, { heavy: 0.8 }) });
    const log: CombatEvent[] = [];
    expect(until(s, 'hurt', log)).toBe(true);
    const t = s.tick;
    const hp = s.enemy.hp;
    scriptStep(s, { type: 'use', cell: 0 });
    const sw = drainCombatEvents(s).find((e) => e.kind === 'swing');
    expect(sw && sw.kind === 'swing' ? [sw.hit.kind, sw.atTick] : null).toEqual(['block', t + 3]);
    expect(s.enemy.hp).toBe(hp);
    log.length = 0;
    expect(until(s, 'nice', log)).toBe(true);
    expect(log.some((e) => e.kind === 'block' && e.landed)).toBe(true);
    expect(s.enemy.hp).toBeLessThan(hp);
  });
});

describe('224장 3: 일반 전투 보충 (엔진)', () => {
  it('지연 틱은 올림 — 모션 타격보다 먼저 들어가지 않게 (0.24초 = 3틱, 0.3 = 3, 0.098 = 1, 0 = 0)', () => {
    const p = { tickSeconds: 0.1 };
    expect(hitDelayTicks(p, 0.24)).toBe(3);
    expect(hitDelayTicks(p, 0.3)).toBe(3);
    expect(hitDelayTicks(p, 0.30000000000000004)).toBe(3);
    expect(hitDelayTicks(p, 0.098)).toBe(1);
    expect(hitDelayTicks(p, 0)).toBe(0);
  });
  it('step 안에서 받은 블록 입력은 그 step 의 틱 기준: 0.1초 지연이 같은 step 에서 0 이 되지 않는다', () => {
    const s = createCombat(5, { enemy: normal, params: { blockPlayDamage: 1, blockPlayCrit: 0, hitDelay: HD(0.1) } });
    for (let i = 0; i < 400 && !s.tray.some((b) => b.kind === 'skill'); i++) { step(s); drainCombatEvents(s); }
    const cell = s.tray.findIndex((b) => b.kind === 'skill');
    expect(cell).toBeGreaterThanOrEqual(0);
    const before = s.tick;
    step(s, { type: 'use', cell });
    const evs = drainCombatEvents(s);
    const sw = evs.find((e) => e.kind === 'swing' && e.hit.kind === 'block');
    expect(sw && sw.kind === 'swing' ? sw.atTick : null).toBe(before + 2); // 입력 = 틱 before+1 의 일, 지연 1틱 → before+2
    expect(evs.some((e) => e.kind === 'block' && e.landed)).toBe(false); // 같은 step 에서 맞지 않는다
    step(s);
    expect(drainCombatEvents(s).some((e) => e.kind === 'block' && e.landed)).toBe(true);
  });
});

describe('224장 2·3: 화면 — 도트 연결 동작을 처음부터 (순수 함수)', () => {
  // 가짜 재생기: 프레임 그림식(pose 없음) — punch 타격 300·길이 600, straight 타격 200·길이 500
  const anim: AnimTiming = {
    has: () => true,
    peek: (a) => (a === ('punch' as never) ? { hitAtMs: 300, durationMs: 600 } : a === ('straight' as never) ? { hitAtMs: 200, durationMs: 500 } : null),
  };
  const body = (o: Partial<NonNullable<PixelPlan['body']>> = {}): NonNullable<PixelPlan['body']> => ({ chain: [{ id: 'punch', rate: 2 }, { id: 'straight', rate: 1 }], bodyAt: 0, bodyFromHit: true, at: 0, speed: 1, ...o });
  it('bodySwingMs = 첫 동작 타격 ÷ 빠르기 (타격 프레임부터가 아니면 0), bodyLeadMs = 그중 시작(at) 앞으로 넘치는 만큼', () => {
    expect(bodySwingMs(body(), anim)).toBe(150);
    expect(bodySwingMs(body({ bodyFromHit: false }), anim)).toBe(0);
    expect(bodyLeadMs(body(), anim)).toBe(150);
    expect(bodyLeadMs(body({ at: 100 }), anim)).toBe(50);
    expect(bodyLeadMs(body({ at: 400 }), anim)).toBe(0);
    expect(bodySwingMs(body(), null)).toBe(0);
  });
  it('bodyLastHitMs = 앞 동작 길이 합 + 마지막 동작 타격 (처음부터 / 타격부터)', () => {
    expect(bodyLastHitMs(body(), anim, true)).toBe(600 / 2 + 200);
    expect(bodyLastHitMs(body(), anim, false)).toBe((600 - 300) / 2 + 200);
    expect(bodyLastHitMs(body({ chain: [{ id: 'punch', rate: 1 }] }), anim, true)).toBe(300);
    expect(bodyLastHitMs(body({ chain: [{ id: 'none', rate: 1 }] }), anim, true)).toBeNull();
  });
  it('cueHitMs: 도트 연출이 없으면 bodyWindup 이 바꾸는 것 없음 (몸통박치기·동작 그대로)', () => {
    expect(cueHitMs({ tier: 'chain1', bodyWindup: true }, anim, 'male')).toBe(cueHitMs({ tier: 'chain1' }, anim, 'male'));
  });
});
