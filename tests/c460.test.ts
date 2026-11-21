// C.460 (GDD v6.088 12-4): 이치고 천년혈전 모드 1차 구현 — 상태 화면 '전투 모드'(기본/천년혈전) · 자세 소도/대도([자세] 대기 1초, 지금 자세 블록만) ·
// 자세 스택(때릴 때마다 +1, 5초·갱신, 상한 30 — 소도 1스택 공속 +1%, 대도 1스택 평타 +1%) · 대도(평타 1초 고정·초과 공속 = 추가 피해, 발도 충전, 자세 무너짐, 유지 보너스, 패링) ·
// 만해(지금 자세 스택 20 이상 — 혈쇄참월 분신 / 천쇄참월 회색 블록 불 켜기, 1대마다 스택 −1·0 이면 풀림). 엔진은 장치만 본다 — 초월자·자세 id 분기 없음.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { TRANSCENDENTS } from '../src/data/transcendents';
import {
  applyInput, buildBattleRecord, canLiberate, canSwitchStance, createCombat, drainCombatEvents, kitStanceStackOf, KIT_TRAIT_PREFIX, liberationActive, spawnTableOf,
  stanceBasicPowerOf, stanceCloneCountOf, stanceHoldBonusOf, stanceLitCountOf, stanceOf, step, ticksOf, attackSecondsNow, kitStanceBlockOf,
  type CombatEvent, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { buildCombatParams } from '../src/engine/absorb/build';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { combatKitOf, kitModesOf } from '../src/engine/transcendKit';
import { testGrantTranscendent } from '../src/engine/testMode';
import { kitModeChoices, migrateSave, newSaveData, SAVE_FORMAT_VERSION, switchKitMode, type SaveData } from '../src/game';
import { useImmediateHits } from './helpers/hitDelay';

useImmediateHits();

const T = BALANCE.provisional.transcendentKits.ichigo!.modes!.tybw!;
const normal = getEnemy('test-a');
const elite = getEnemy('test-elite');
const id = (b: string) => KIT_TRAIT_PREFIX + b;

function tybwSave(): SaveData {
  const s = newSaveData('shinigami', 1000);
  expect(testGrantTranscendent(s, 'ichigo', 2000)).toBe('added');
  expect(switchKitMode(s, 'tybw')).toEqual({ ok: true, changed: true });
  return s;
}
function tybwParams(): Partial<CombatParams> {
  const s = tybwSave();
  const p: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
  applyEvolutionToParams(p, s.evolution, s.factionId, 0, false);
  return p;
}
/** 조용한 전투 (생성·적 공격·내 평타 멈춤, 치명 없음, 적 체력 무한) */
const mk = (enemy = normal): CombatState => {
  const s = createCombat(1, { enemy, params: tybwParams() });
  s.spawnTimer = 1e9;
  s.enemy.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.params.timeLimitSeconds = 1e9;
  s.params.critChance = 0;
  s.params.critChanceMax = 0;
  s.enemy.hp = 1e12;
  return s;
};
const blk = (s: CombatState, b: string) => ({ uid: s.nextUid++, kind: 'skill' as const, traitId: id(b), family: null, element: null, ...(b === 'odachi' ? { solo: true } : {}) });
const wait = (s: CombatState, seconds: number) => {
  for (let i = 0; i < ticksOf(s.params, seconds) && s.status === 'playing'; i++) step(s);
};
/** 평타 한 대가 나갈 때까지 틱을 돌리고 그 틱의 사건들을 돌려준다 */
function swing(s: CombatState): CombatEvent[] {
  drainCombatEvents(s);
  s.player.attackTimer = 1;
  step(s);
  s.player.attackTimer = 1e9;
  return drainCombatEvents(s);
}
const basicHits = (ev: CombatEvent[]) => ev.filter((e): e is Extract<CombatEvent, { kind: 'player-attack' }> => e.kind === 'player-attack');
/** 대도 자세로 바꾼다 (대기 무시) */
function toOdachi(s: CombatState): void {
  s.kit!.stanceReadyAt = 0;
  expect(applyInput(s, { type: 'stance' })).toBe(true);
  expect(stanceOf(s)?.id).toBe('odachi');
  s.player.attackTimer = 1e9; // 자세를 바꾸면 기다리던 평타가 새 간격(1초)으로 줄어든다 — 시험은 평타를 직접 낸다
}

describe('데이터·수치·세이브', () => {
  it('이치고 modes = 기본 / 천년혈전(자세 소도·대도, 블록 소도·대도 둘뿐) — 수치 provisional', () => {
    const t = TRANSCENDENTS.find((x) => x.id === 'ichigo')!;
    expect(kitModesOf('ichigo').map((m) => m.name)).toEqual(['기본', '천년혈전']);
    const m = t.kit!.modes![1]!;
    expect(m.stances!.map((x) => [x.name, x.releaseName])).toEqual([['소도', '혈쇄참월'], ['대도', '천쇄참월']]);
    expect(m.blocks!.map((b) => b.name)).toEqual(['소도', '대도']);
    expect(T.stance).toEqual({ switchSeconds: 1, stackSeconds: 5, stackMax: 30, releaseAt: 20 });
    expect([T.speedPerStack, T.powerPerStack]).toEqual([0.01, 0.01]);
    expect(T.clones).toEqual({ perChain: 3, max: 2 });
    expect(T.parry.windowSeconds).toBe(0.35);
    expect(T.lanterns.max).toBe(5);
  });

  it('천년혈전 전투 kit = 자세 장치 + 소도/대도 블록, 호로화·무월수련·월아천충 없음 (기본 모드는 그대로)', () => {
    const k = combatKitOf({ id: 'ichigo', levels: {}, mode: 'tybw' })!;
    expect(k.mode).toBe('tybw');
    expect(k.blocks.map((b) => b.id)).toEqual(['kodachi', 'odachi']);
    expect(k.riskDrain).toBeUndefined();
    expect(k.mastery).toBeUndefined();
    expect(k.blocks.some((b) => b.chargeShot)).toBe(false);
    expect(k.stance!.stances.map((x) => [!!x.speedPerStack, !!x.fixed, !!x.draw, !!x.parry, !!x.clones, !!x.lanterns])).toEqual([[true, false, false, false, true, false], [false, true, true, true, false, true]]);
    const basic = combatKitOf({ id: 'ichigo', levels: {} })!;
    expect(basic.mode).toBe('basic');
    expect(basic.riskDrain).toBeDefined();
    expect(basic.stance).toBeUndefined();
  });

  it('세이브 형식 89: 88 → 89 마이그레이션 = 모드 있는 초월자 kit 에 기본 · 모르는 모드는 기본으로 · 모험 중엔 못 바꿈', () => {
    expect(SAVE_FORMAT_VERSION).toBe(95);
    const s = newSaveData('shinigami', 1000);
    testGrantTranscendent(s, 'ichigo', 2000);
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.evolution.kit.mode;
    raw.meta.format = 88;
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBe(95);
    expect(m.evolution.kit?.mode).toBe('basic');
    const bad = JSON.parse(JSON.stringify(s));
    bad.evolution.kit.mode = 'nope';
    expect(migrateSave(bad)!.evolution.kit?.mode).toBe('basic');
    expect(kitModeChoices(s).map((c) => [c.id, c.current])).toEqual([['basic', true], ['tybw', false]]);
    s.activeExpedition = {} as never;
    expect(switchKitMode(s, 'tybw')).toEqual({ ok: false, reason: 'expedition' });
    expect(switchKitMode(s, 'tybw', true)).toEqual({ ok: true, changed: true });
    // 아이젠(모드 없음)은 고를 것이 없다
    const a = newSaveData('shinigami', 1000);
    testGrantTranscendent(a, 'aizen', 2000);
    expect(kitModeChoices(a)).toEqual([]);
  });
});

describe('자세·스택', () => {
  it('출현 = 지금 자세 블록만 · [자세] = 바의 블록도 바뀜 · 대기 1초 · 만해 중엔 잠김', () => {
    const s = mk();
    expect(stanceOf(s)?.id).toBe('kodachi');
    expect(spawnTableOf(s.params, false, null, kitStanceBlockOf(s)).entries.map((e) => e.source?.id)).toEqual([id('kodachi')]);
    s.tray = [blk(s, 'kodachi'), blk(s, 'kodachi')];
    expect(applyInput(s, { type: 'stance' })).toBe(true);
    expect(s.tray.map((b) => b.traitId)).toEqual([id('odachi'), id('odachi')]);
    expect(spawnTableOf(s.params, false, null, kitStanceBlockOf(s)).entries.map((e) => e.source?.id)).toEqual([id('odachi')]);
    expect(canSwitchStance(s)).toBe(false);
    wait(s, T.stance.switchSeconds);
    expect(canSwitchStance(s)).toBe(true);
    s.kit!.stanceStacks[1] = 20;
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    expect(canSwitchStance(s)).toBe(false);
  });

  it('때릴 때마다 지금 자세 스택 +1 (상한 30) · 5초 지나면 사라짐 · 다른 자세 스택은 갱신 안 됨', () => {
    const s = mk();
    for (let i = 0; i < 3; i++) swing(s);
    expect(kitStanceStackOf(s, 0)).toBe(3);
    toOdachi(s);
    swing(s);
    expect([kitStanceStackOf(s, 0), kitStanceStackOf(s, 1)]).toEqual([3, 1]);
    wait(s, T.stance.stackSeconds + 0.2);
    expect(kitStanceStackOf(s, 0)).toBe(0); // 소도 스택은 갱신 없이 사라짐
    s.kit!.stanceStacks[1] = 30;
    s.kit!.stanceUntil[1] = s.tick + 100;
    swing(s);
    expect(kitStanceStackOf(s, 1)).toBe(30);
  });

  it('소도 1스택 공속 +1% · 대도 1스택 평타 피해 +1% (지금 자세 스택만)', () => {
    const s = mk();
    const before = attackSecondsNow(s);
    s.kit!.stanceStacks[0] = 20;
    expect(attackSecondsNow(s)).toBeLessThan(before);
    const t = mk();
    toOdachi(t);
    t.kit!.holdTicks = 0;
    const p0 = stanceBasicPowerOf(t);
    t.kit!.stanceStacks[1] = 10;
    expect(stanceBasicPowerOf(t) / p0).toBeCloseTo(1.1, 6);
    t.kit!.stanceStacks[0] = 30; // 소도 스택은 대도 자세에선 효과 없음
    expect(stanceBasicPowerOf(t) / p0).toBeCloseTo(1.1, 6);
  });
});

describe('대도', () => {
  it('평타 간격 1초 고정 · 유지 1초마다 +2% (최대 30%, 자세 바꾸면 0)', () => {
    const s = mk();
    toOdachi(s);
    expect(attackSecondsNow(s)).toBeCloseTo(T.fixed.attackSeconds, 6);
    wait(s, 3);
    expect(stanceHoldBonusOf(s)).toBeCloseTo(0.06, 6);
    wait(s, 30);
    expect(stanceHoldBonusOf(s)).toBeCloseTo(T.hold.max, 6);
    s.kit!.stanceReadyAt = 0;
    applyInput(s, { type: 'stance' });
    s.kit!.stanceReadyAt = 0;
    applyInput(s, { type: 'stance' });
    expect(stanceHoldBonusOf(s)).toBe(0);
  });

  it('발도 충전: 0.9초 누르고 평타 전에 떼면 다음 평타 ×2.5 · 대도 스택 +9 · 블록 소모', () => {
    const s = mk();
    toOdachi(s);
    s.kit!.holdTicks = 0;
    s.tray = [blk(s, 'odachi')];
    const plain = basicHits(swing(s))[0]!.damage;
    s.kit!.stanceStacks[1] = 0;
    s.kit!.holdTicks = 0;
    expect(applyInput(s, { type: 'draw', cell: 0 })).toBe(true);
    wait(s, T.draw.fullSeconds);
    expect(applyInput(s, { type: 'draw-release' })).toBe(true);
    expect(s.tray.length).toBe(0);
    expect(kitStanceStackOf(s)).toBe(9);
    s.kit!.holdTicks = 0;
    s.kit!.stanceStacks[1] = 0; // plain 평타 때와 같은 스택
    const hit = basicHits(swing(s))[0]!;
    expect(hit.kitShot).toBe('발도');
    expect(hit.damage / plain).toBeCloseTo(T.draw.maxPower, 6);
  });

  it('평타 시각을 넘겨 누르고 있으면 자세 무너짐: 그 평타 취소 · 3초 받는 피해 +30% · 블록은 그대로', () => {
    const s = mk();
    toOdachi(s);
    s.tray = [blk(s, 'odachi')];
    expect(applyInput(s, { type: 'draw', cell: 0 })).toBe(true);
    const ev = swing(s);
    expect(basicHits(ev)).toEqual([]);
    expect(ev.some((e) => e.kind === 'kit-break')).toBe(true);
    expect(s.kit!.breaks).toBe(1);
    expect(s.tray.length).toBe(1);
    expect(applyInput(s, { type: 'draw-release' })).toBe(false);
    const hp = s.player.hp;
    s.enemy.attackTimer = 1;
    step(s);
    const taken = hp - s.player.hp;
    const t = mk();
    toOdachi(t);
    const hp2 = t.player.hp;
    t.enemy.attackTimer = 1;
    step(t);
    expect(taken / (hp2 - t.player.hp)).toBeCloseTo(1 + T.draw.breakTaken, 1);
  });

  it('패링: 강공격이 0.35초 창에 닿으면 성공 — 피해 0 · 대도 스택 +5 · 적 자세 무너짐 · 방무 피해 / 창만 열고 끝나면 실패', () => {
    const s = mk(elite);
    toOdachi(s);
    s.kit!.stanceStacks[1] = 0;
    s.guardGauge = 1;
    s.guardFilled = true;
    s.enemy.actionIndex = 0;
    s.enemy.actionTimer = 1;
    step(s);
    expect(s.enemy.cast).not.toBeNull();
    while (s.enemy.cast && s.enemy.cast.ticks > 2) step(s);
    const hp = s.player.hp;
    drainCombatEvents(s);
    expect(applyInput(s, { type: 'guard' })).toBe(true);
    for (let i = 0; i < 4 && s.enemy.cast; i++) step(s);
    const ev = drainCombatEvents(s);
    expect(ev.some((e) => e.kind === 'kit-parry' && e.ok)).toBe(true);
    expect(s.player.hp).toBeCloseTo(hp, 6);
    expect(s.kit!.parries).toBe(1);
    expect(kitStanceStackOf(s)).toBe(T.parry.stacks);
    expect(s.knockbackTicks).toBeGreaterThan(0);
    expect(basicHits(ev).find((e) => e.kitShot === '패링')!.damage).toBeGreaterThan(0);
    expect(s.guardGauge).toBe(1);
    // 실패: 강공격 없이 창이 닫힘
    expect(applyInput(s, { type: 'guard' })).toBe(true);
    wait(s, 0.5);
    expect(s.kit!.parryFails).toBe(1);
  });
});

describe('만해', () => {
  it('지금 자세 스택 20 이상이면 만해 — 1대마다 −1, 0 이면 풀림 · 컷인 이름 = 자세의 만해', () => {
    const s = mk();
    s.kit!.stanceStacks[0] = 19;
    expect(canLiberate(s)).toBe(false);
    s.kit!.stanceStacks[0] = 2;
    expect(canLiberate(s)).toBe(false);
    s.kit!.stanceStacks[0] = 20;
    expect(canLiberate(s)).toBe(true);
    drainCombatEvents(s);
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    expect(drainCombatEvents(s).find((e) => e.kind === 'liberate')).toMatchObject({ name: '혈쇄참월', endless: true });
    s.kit!.stanceStacks[0] = 2;
    swing(s);
    expect(kitStanceStackOf(s)).toBe(1);
    expect(liberationActive(s)).toBe(true);
    swing(s);
    expect(liberationActive(s)).toBe(false);
    expect(s.kit!.modeExits).toBe(1);
  });

  it('혈쇄참월: 바의 소도 블록 3개당 분신 1명(최대 2) — 평타마다 같은 피해로 같이 한 대, 블록 소모 없음', () => {
    const s = mk();
    s.kit!.stanceStacks[0] = 25;
    applyInput(s, { type: 'liberate' });
    s.tray = Array.from({ length: 7 }, () => blk(s, 'kodachi'));
    expect(stanceCloneCountOf(s)).toBe(2);
    const hits = basicHits(swing(s));
    expect(hits.length).toBe(3);
    expect(hits.filter((h) => h.kitClone).length).toBe(2);
    expect(hits[1]!.damage).toBeCloseTo(hits[0]!.damage, 6);
    expect(s.tray.length).toBe(7);
    s.tray = s.tray.slice(0, 4);
    expect(basicHits(swing(s)).filter((h) => h.kitClone).length).toBe(1);
  });

  it('천쇄참월: 평타 0.8초 · 강화 ×2.5 기본 · 회색 블록 누르면 불 켜기(최대 5) · 패링 성공 때 불 1개당 스택 +1 / 강공격 피격 때 1개당 +15% · 뒤에 꺼짐', () => {
    const s = mk(elite);
    toOdachi(s);
    s.kit!.holdTicks = 0;
    const plain = basicHits(swing(s))[0]!.damage;
    s.kit!.stanceStacks[1] = 25;
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    expect(attackSecondsNow(s)).toBeCloseTo(T.fixed.releaseAttackSeconds, 6);
    s.tray = Array.from({ length: 6 }, () => blk(s, 'odachi'));
    for (let i = 0; i < 6; i++) applyInput(s, { type: 'use', cell: i });
    expect(stanceLitCountOf(s)).toBe(T.lanterns.max);
    expect(s.tray.length).toBe(6); // 쓰이지 않는다
    s.kit!.holdTicks = 0;
    s.kit!.stanceStacks[1] = 25;
    const hit = basicHits(swing(s))[0]!;
    // ×2.5 · 스택 25 (plain 은 스택 1) · 고정 0.8초라 초과 공속 몫은 둘 다 같은 원래 간격 기준
    expect(hit.damage / plain).toBeGreaterThan(T.lanterns.basicPower);
    // 패링 성공: 스택 +5 + 불 5
    const st0 = kitStanceStackOf(s);
    s.guardGauge = 1;
    s.guardFilled = true;
    s.enemy.actionIndex = 0;
    s.enemy.actionTimer = 1;
    step(s);
    while (s.enemy.cast && s.enemy.cast.ticks > 2) step(s);
    applyInput(s, { type: 'guard' });
    for (let i = 0; i < 4 && s.enemy.cast; i++) step(s);
    expect(kitStanceStackOf(s)).toBe(Math.min(T.stance.stackMax, st0 + T.parry.stacks + T.lanterns.perStacks * T.lanterns.max));
    expect(stanceLitCountOf(s)).toBe(0);
  });
});

describe('런 로그·엔진 규칙', () => {
  it('전투 기록 kit = 모드 · 자세 변경 · 만해 진입 · 패링 성공/실패 · 자세 무너짐', () => {
    const s = mk();
    s.kit!.stanceReadyAt = 0;
    applyInput(s, { type: 'stance' });
    s.kit!.parryFails = 2;
    s.kit!.breaks = 1;
    const r = buildBattleRecord(s, { factionId: 'shinigami' });
    expect(r.kit).toMatchObject({ id: 'ichigo', mode: 'tybw', stanceSwitches: 1, modeEnters: 0, parries: 0, parryFails: 2, breaks: 1 });
  });

  it('엔진은 초월자·자세 id 로 분기하지 않는다 (CLAUDE.md 2번)', () => {
    const src = readFileSync('src/engine/combat/combat.ts', 'utf8') + readFileSync('src/engine/transcendKit.ts', 'utf8');
    for (const w of ['ichigo', 'kodachi', 'odachi', 'tybw', "'소도'", "'대도'"]) expect(src.includes(w)).toBe(false);
  });
});
