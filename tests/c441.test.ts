// C.441 (GDD v6.048·v6.049 12-4): 초월자 전용 블록·성장 — 아이젠(경화수월·귀도·붕옥 융합 프라고르·깨져라 경화수월·회피 10%) ·
// 초월자 기반 블록 풀(일반 블록 없음) · 흡수 화면 = 노력치·놓아주기만 · 초월 조각 드롭·전용 블록 강화 · 형식 85.
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { TRANSCENDENTS } from '../src/data/transcendents';
import {
  applyInput, createCombat, drainCombatEvents, kitBlockOf, kitCounterOpen, KIT_TRAIT_PREFIX, spawnTableOf, step, ticksOf, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { buildCombatParams } from '../src/engine/absorb/build';
import { applyEvolutionToParams, kitActive, TRANSCENDENT_BASIS } from '../src/engine/evolution';
import { combatKitOf, kitUpgradeCost, transcendShardsOfBattles } from '../src/engine/transcendKit';
import { testGrantTranscendent } from '../src/engine/testMode';
import { createExpedition } from '../src/engine/expedition';
import { chooseAbsorb, chooseRelease } from '../src/engine/expedition/expedition';
import { buildBattleRecord, voidChanceOf } from '../src/engine/combat';
import { migrateSave, newSaveData, SAVE_FORMAT_VERSION, switchCombatBasis, upgradeTranscendentBlock, type SaveData } from '../src/game';
import { useImmediateHits } from './helpers/hitDelay';
import { useLegacyMigrations } from './helpers/legacyGate';

// C.446: 게임은 형식 87 미만을 열지 않는다(MIN_LOADABLE_SAVE_FORMAT 87) — 이 파일의 옛 형식 마이그레이션 시험 동안만 문턱을 내린다
useLegacyMigrations();

useImmediateHits();

const KIT = BALANCE.provisional.transcendentKits.aizen!;
const normal = getEnemy('test-a');

function aizenSave(): SaveData {
  const s = newSaveData('hollow', 1000);
  expect(testGrantTranscendent(s, 'aizen', 2000)).toBe('added');
  return s;
}

function aizenParams(s: SaveData = aizenSave()): Partial<CombatParams> {
  const p: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
  applyEvolutionToParams(p, s.evolution, s.factionId, 0, false);
  return p;
}

const mk = (params: Partial<CombatParams> = aizenParams(), seed = 1): CombatState => createCombat(seed, { enemy: normal, params });
const kitBlk = (s: CombatState, id: string) => ({ uid: s.nextUid++, kind: 'skill' as const, traitId: KIT_TRAIT_PREFIX + id, family: null, element: null, ...(kitBlockOf(s.params, KIT_TRAIT_PREFIX + id)?.solo ? { solo: true } : {}) });
const quiet = (s: CombatState) => {
  s.spawnTimer = 1e9;
  s.params.voidChance = s.params.voidChanceBonus = 0;
  s.enemy.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  s.player.attackTimer = 1e9;
};

describe('초월자 기반 블록 풀', () => {
  it('아이젠 데이터 kit: 경화수월·귀도·붕옥·프라고르, 나머지 5종은 블록 없음([미정])', () => {
    const aizen = TRANSCENDENTS.find((t) => t.id === 'aizen')!;
    expect(aizen.kit?.blocks.map((b) => b.id)).toEqual(['kyoka', 'kido', 'hogyoku', 'fragor']); // C.443 (v6.052): 붕옥 블록
    expect(aizen.kit?.liberationName).toBe('붕옥 융합'); // C.443 (v6.052): 다시 '붕옥 융합' 담백하게
    expect(TRANSCENDENTS.filter((t) => t.kit).map((t) => t.id)).toEqual(['aizen', 'ichigo']); // C.454 (v6.069): 이치고 기본 모드
  });
  it('초월자 기반이면 일반 블록(기본·흡수) 없이 전용 블록만, 호로 기반이면 kit 없음', () => {
    const s = aizenSave();
    expect(kitActive(s.evolution)).toBe(true);
    const p = mk(aizenParams(s)).params;
    const t = spawnTableOf(p);
    const ids = t.entries.filter((e) => e.source).map((e) => e.source!.id);
    expect(ids).toEqual([KIT_TRAIT_PREFIX + 'kyoka', KIT_TRAIT_PREFIX + 'kido', KIT_TRAIT_PREFIX + 'hogyoku']); // C.443: 붕옥 블록 = 허 자리
    const sk = t.entries.filter((e) => e.source && e.source.id !== KIT_TRAIT_PREFIX + 'hogyoku');
    const sum = sk.reduce((a, e) => a + e.chance, 0);
    expect(sk[0]!.chance / sum).toBeCloseTo(voidChanceOf(p), 9); // C.452: 경화수월 = 허 공식 확률(붕옥이 안 걸린 몫 안에서)
    // 키웠던 호로 기반으로 바꾸면 그 빌드 그대로 (전용 블록 없음)
    expect(switchCombatBasis(s, 'hollow', 3000).ok).toBe(true);
    expect(kitActive(s.evolution)).toBe(false);
    const p2 = aizenParams(s);
    expect(p2.kit).toBeNull();
    expect(s.evolution.basis?.current).not.toBe(TRANSCENDENT_BASIS);
  });
  it('전투에서 실제로 나오는 블록 = 전용 블록만(공허 제외), 경화수월 레일 최대 2', () => {
    const s = mk();
    s.params.voidChance = 0.1; // C.452 (v6.066): 경화수월 = 허 공식 확률 — 허 10% 로 고정
    s.params.voidChanceBonus = 0;
    s.enemy.attackTimer = 1e9;
    s.enemy.actionTimer = 1e9;
    s.player.attackTimer = 1e9;
    s.params.timeLimitSeconds = 1e9;
    let kyokaMax = 0;
    let kyoka = 0;
    let total = 0;
    for (let i = 0; i < 12000 && s.status === 'playing'; i++) {
      step(s);
      for (const e of drainCombatEvents(s)) if (e.kind === 'spawn') {
        total++;
        if (s.tray[e.index]?.traitId === KIT_TRAIT_PREFIX + 'kyoka') kyoka++;
      }
      for (const b of s.tray) expect(b.traitId?.startsWith(KIT_TRAIT_PREFIX)).toBe(true);
      kyokaMax = Math.max(kyokaMax, s.tray.filter((b) => b.traitId === KIT_TRAIT_PREFIX + 'kyoka').length);
      if (s.tray.length >= s.params.trayCapacity) s.tray.splice(0, 4); // 계속 생성되게 비운다
    }
    expect(total).toBeGreaterThan(200);
    expect(kyoka / total).toBeGreaterThan(0.05);
    expect(kyoka / total).toBeLessThan(0.15);
    expect(kyokaMax).toBeLessThanOrEqual(2);
  });
  it('기본 회피율 10% (적 공격을 통째로 피함)', () => {
    expect(aizenParams().evadeChance).toBe(0.1);
    const s = mk();
    s.params.voidChance = s.params.voidChanceBonus = 0;
    s.player.attackTimer = 1e9;
    s.spawnTimer = 1e9;
    s.player.hp = s.player.maxHp = 1e12;
    s.params.timeLimitSeconds = 1e9;
    let evades = 0;
    let hits = 0;
    for (let i = 0; i < 30000; i++) {
      step(s);
      for (const e of drainCombatEvents(s)) {
        if (e.kind === 'evade') evades++;
        if (e.kind === 'enemy-attack' && !e.landed) hits++;
      }
    }
    expect(evades / (evades + hits)).toBeGreaterThan(0.07);
    expect(evades / (evades + hits)).toBeLessThan(0.13);
  });
});

describe('경화수월 — 반격 창', () => {
  const hitMe = (s: CombatState) => {
    s.enemy.attackTimer = 1;
    s.params.evadeChance = 0;
    step(s); // 적 공격이 맞는다
  };
  it('기본 피해 = 기본 공격 ×1.6, 체인 안 됨(solo)', () => {
    const s = mk();
    quiet(s);
    s.tray = [kitBlk(s, 'kyoka'), kitBlk(s, 'kyoka')];
    const before = s.enemy.hp;
    s.params.critChance = s.params.blockCritChance = 0;
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    expect(s.tray.length).toBe(1);
    const ev = drainCombatEvents(s).find((e) => e.kind === 'block');
    expect(ev && ev.kind === 'block' && ev.chain).toBe(1);
    expect(ev && ev.kind === 'block' && ev.kitName).toBe('경화수월');
    expect(before - s.enemy.hp).toBeGreaterThan(0);
  });
  it('적 공격을 받은 뒤 0.5초 창(발광) 안에 쓰면 반격: 대사 · 피해 ×1.5 · 손실 체력 50% 회복 (C.442: 즉시 1개 생성 삭제)', () => {
    const s = mk();
    quiet(s);
    s.params.critChance = s.params.blockCritChance = 0;
    s.params.critChanceMax = 0;
    s.params.blockCritChanceMax = 0;
    s.tray = [kitBlk(s, 'kyoka')];
    const hp0 = s.player.hp;
    hitMe(s);
    const lost = hp0 - s.player.hp;
    expect(lost).toBeGreaterThan(0);
    expect(kitCounterOpen(s)).toBe(true);
    expect(drainCombatEvents(s).some((e) => e.kind === 'kit-window' && e.seconds === 0.5)).toBe(true);
    const hpBefore = s.player.hp;
    const enemyBefore = s.enemy.hp;
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    const evs = drainCombatEvents(s);
    expect(evs.find((e) => e.kind === 'kit-line')).toMatchObject({ text: '언제부터 경화수월을 쓰고 있다고 착각한 거지?', tone: 'counter' });
    expect(s.player.hp - hpBefore).toBeCloseTo(lost * 0.5, 5);
    expect(s.tray.length).toBe(0); // C.442 (v6.050): 반격 뒤 즉시 재생성 없음
    expect(s.kit!.counters).toBe(1);
    // 피해 비교: 창 밖 같은 블록
    const t = mk();
    quiet(t);
    t.params.critChanceMax = t.params.blockCritChanceMax = 0;
    t.tray = [kitBlk(t, 'kyoka')];
    const e0 = t.enemy.hp;
    applyInput(t, { type: 'use', cell: 0 });
    expect((enemyBefore - s.enemy.hp) / (e0 - t.enemy.hp)).toBeCloseTo(1.5, 5);
  });
  it('창은 0.5초 — 지나면 보통 경화수월 (회복·즉시 생성 없음), 치명 +30%p 가산', () => {
    const s = mk();
    quiet(s);
    s.tray = [kitBlk(s, 'kyoka')];
    hitMe(s);
    for (let i = 0; i < ticksOf(s.params, 0.5); i++) step(s);
    expect(kitCounterOpen(s)).toBe(true); // 0.5초 끝 틱까지
    step(s);
    expect(kitCounterOpen(s)).toBe(false);
    drainCombatEvents(s);
    applyInput(s, { type: 'use', cell: 0 });
    expect(drainCombatEvents(s).some((e) => e.kind === 'kit-line')).toBe(false);
    expect(s.tray.length).toBe(0);
    expect(KIT.blocks.kyoka!.counter!.critBonus).toBe(0.3);
  });
});

describe('귀도 — 체인 이름·영창 스택·흑관', () => {
  const useKido = (s: CombatState, n: number) => {
    s.tray = Array.from({ length: n }, () => kitBlk(s, 'kido'));
    applyInput(s, { type: 'use', cell: 0 });
    return drainCombatEvents(s);
  };
  it('체인 1 영압 발산 · 2 뇌후포 · 3 오룡전멸 (×1.2 / ×2.0 / ×3.2)', () => {
    const names: string[] = [];
    const dmg: number[] = [];
    for (const n of [1, 2, 3]) {
      const s = mk();
      quiet(s);
      s.params.critChanceMax = s.params.blockCritChanceMax = 0;
      const e0 = s.enemy.hp;
      const ev = useKido(s, n).find((e) => e.kind === 'block');
      names.push(ev && ev.kind === 'block' ? ev.kitName ?? '' : '');
      dmg.push(e0 - s.enemy.hp);
    }
    expect(names).toEqual(['영압 발산', '뇌후포', '오룡전멸']);
    expect(dmg[1]! / dmg[0]!).toBeCloseTo(2.0 / 1.2, 5);
    expect(dmg[2]! / dmg[0]!).toBeCloseTo(3.2 / 1.2, 5);
  });
  it('3체인마다 영창 +1 · 스택 1당 생성 주기 −0.2초 · 5스택 → 다음 3체인 완전영창 흑관 (적 3초 공격 불능, 스택 0)', () => {
    const s = mk();
    quiet(s);
    const base = spawnTableOf(s.params).seconds;
    for (let k = 1; k <= 5; k++) {
      const evs = useKido(s, 3);
      expect(evs.find((e) => e.kind === 'kit-stack')).toMatchObject({ stack: k, full: 5 });
    }
    expect(s.kit!.stack).toBe(5);
    // 주기 단축 = 생성 타이머 간격 확인 (spawnIntervalOf 는 내부 — 다음 생성까지 틱으로 본다)
    s.spawnTimer = 1;
    step(s);
    drainCombatEvents(s);
    const gap = s.spawnTimer;
    expect(gap * s.params.tickSeconds).toBeCloseTo(Math.max(0.3, base - 1.0), 1);
    s.spawnTimer = 1e9;
    const enemyBefore = s.enemy.hp;
    const evs = useKido(s, 3);
    const blk = evs.find((e) => e.kind === 'block');
    expect(blk && blk.kind === 'block' && blk.kitName).toBe('완전영창 흑관');
    expect(blk && blk.kind === 'block' && blk.kitFinisher).toBe(true);
    expect(s.kit!.stack).toBe(0);
    expect(s.kit!.finishers).toBe(1);
    expect(s.knockbackTicks).toBe(ticksOf(s.params, 3));
    expect(enemyBefore - s.enemy.hp).toBeGreaterThan(0);
    // 공격 불능 동안 적 공격 없음
    s.enemy.attackTimer = 2;
    s.params.evadeChance = 0;
    const hp = s.player.hp;
    for (let i = 0; i < ticksOf(s.params, 2.5); i++) step(s);
    expect(s.player.hp).toBe(hp);
  });
});

describe('붕옥 융합 · 깨져라 경화수월', () => {
  it('해방 이름 = 붕옥 융합(C.443), 해방 수치 = 진화체 만해(고유 해방)와 같음', () => {
    const p = aizenParams();
    expect(p.kit?.liberationName).toBe('붕옥 융합');
    expect(p.liberationUnique).toBe(true);
    expect(p.liberationStatMultiplier).toBe(BALANCE.provisional.liberation.uniqueStatMultiplier);
  });
  // 융합 중 블록 바뀜·끝나면 되돌림은 C.443(v6.052)에서 바뀜 — tests/c443.test.ts
  it('쓰러지면 한 번만 체력 30%로 되살아남 + 대사', () => {
    const s = mk();
    quiet(s);
    s.params.evadeChance = 0;
    s.player.hp = 1;
    s.enemy.attackTimer = 1;
    step(s);
    expect(s.status).toBe('playing');
    expect(s.player.hp).toBeCloseTo(s.player.maxHp * 0.3, 5);
    expect(drainCombatEvents(s).find((e) => e.kind === 'kit-line')).toMatchObject({ text: '깨져라, 경화수월', tone: 'revive' });
    s.player.hp = 1;
    s.enemy.attackTimer = 1;
    step(s);
    expect(s.status).toBe('lost');
    const rec = buildBattleRecord(s, { factionId: 'hollow' });
    expect(rec.kit).toMatchObject({ id: 'aizen', revives: 1 });
  });
});

describe('초월자 성장 — 흡수 제한·초월 조각·강화', () => {
  it('흡수 화면: 노력치 흡수·놓아주기만 (특성 후보 없음)', () => {
    const s = aizenSave();
    const exp = createExpedition({ seed: 5, factionId: s.factionId, build: s.build, evolution: s.evolution, hunger: 80, condition: 80, deck: [] });
    exp.phase = 'absorb';
    exp.absorbOffer = { enemyId: 'test-a', element: 'fire', ev: { atk: 1 }, elite: false, strength: 1, candidates: [], reasons: ['victory'], chain3Count: 0, weakChain3Count: 0, finisherElement: null, statOnly: true };
    expect(chooseAbsorb(exp, null, undefined, 'both').ok).toBe(false);
    expect(chooseAbsorb(exp, null, undefined, 'trait').ok).toBe(false);
    expect(chooseAbsorb(exp, null, undefined, 'stat').ok).toBe(true);
    exp.phase = 'absorb';
    exp.absorbOffer = { enemyId: 'test-a', element: 'fire', ev: { atk: 1 }, elite: false, strength: 1, candidates: [], reasons: ['victory'], chain3Count: 0, weakChain3Count: 0, finisherElement: null, statOnly: true };
    expect(chooseRelease(exp).ok).toBe(true);
  });
  it('초월 조각: 이긴 전투만 일반 1·강적 3·보스 8', () => {
    expect(transcendShardsOfBattles([
      { won: true, enemyClass: 'normal' }, { won: true, enemyClass: 'elite' }, { won: true, enemyClass: 'boss', boss: true }, { won: false, enemyClass: 'elite' },
    ])).toBe(12);
  });
  it('전용 블록 강화: n강 비용 10×n · 강마다 피해 +8% · 최대 10강 · 런 로그', () => {
    const s = aizenSave();
    expect(s.evolution.kit).toEqual({ id: 'aizen', levels: {} });
    s.shared.transcendShards = 25;
    expect(kitUpgradeCost(s.evolution.kit!, 'kido')).toBe(10);
    expect(upgradeTranscendentBlock(s, 'kido', 1)).toMatchObject({ ok: true, level: 1, cost: 10 });
    expect(upgradeTranscendentBlock(s, 'kido', 2)).toMatchObject({ ok: false });
    expect(s.shared.transcendShards).toBe(15);
    expect(upgradeTranscendentBlock(s, 'fragor', 3).ok).toBe(false); // 프라고르는 붕옥 블록 단계를 같이 씀 (C.443)
    expect(s.runLog.kitShards).toEqual([{ at: 1, kind: 'upgrade', blockId: 'kido', level: 1, cost: 10 }]);
    const kit = combatKitOf(s.evolution.kit)!;
    expect(kit.blocks.find((b) => b.id === 'kido')!.mult).toBeCloseTo(1.08, 5);
    s.shared.transcendShards = 10_000;
    for (let i = 0; i < 20; i++) upgradeTranscendentBlock(s, 'hogyoku', 10);
    expect(s.evolution.kit!.levels.hogyoku).toBe(10);
    expect(combatKitOf(s.evolution.kit)!.blocks.find((b) => b.id === 'fragor')!.mult).toBeCloseTo(1.8, 5);
  });
  it('형식 85: 옛 초월자 트랙에 kit(강화 0) · 조각 0', () => {
    expect(SAVE_FORMAT_VERSION).toBe(88);
    const s = aizenSave();
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown> & { evolution: Record<string, unknown>; shared: Record<string, unknown> };
    delete raw.evolution.kit;
    delete raw.shared.transcendShards;
    raw.formatVersion = 84;
    const m = migrateSave(raw)!;
    expect(m.evolution.kit).toEqual({ id: 'aizen', levels: {} });
    expect(m.shared.transcendShards).toBe(0);
  });
});
