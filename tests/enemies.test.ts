// 적 다양성 확장 (GDD 14-5): 데이터·패턴 일반화·출현 풀. 엔진은 pattern.kind 로만 분기하고 적 id 로는 분기하지 않는다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { ENEMIES, enemyPatternKind, getEnemy, hasSpecialActions, parseEnemy, POOL_CONFIG, scaleEnemy } from '../src/data/enemies';
import { ELEMENTS } from '../src/data/elements';
const LINEAGES = ELEMENTS; // C.47: 계통 A~E → 속성 8종
import { ENEMY_PATTERN_KINDS, type EnemyDef, type EnemyPatternKind } from '../src/data/schema';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import { applyInput, blockDamage, createCombat, drainCombatEvents, enemyAttackSecondsOf, step, ticksOf, type Block, type CombatParams, type CombatState } from '../src/engine/combat';
/** C.136 블록 플레이 보정(GDD 84장 3번)을 끈다 — 이 파일은 옛 피해 공식(체인·상성·환경 배율)만 본다. 보정 자체는 tests/c136.test.ts */
const NO_BLOCK_PLAY = { blockPlayDamage: 1, blockPlayCrit: 0 };
import { enemyPool, pickFromPool } from '../src/engine/enemyPool';
import { createExpedition, playExpedition } from '../src/engine/expedition';
import { createRng } from '../src/engine/rng';
import { newTileStock, sanitizeDeck } from '../src/game';

const CX = BALANCE.provisional.combat;
const pool = ENEMIES.filter((e) => !e.testOnly);
const ofKind = (cls: 'normal' | 'elite', kind: EnemyPatternKind) => pool.find((e) => e.class === cls && enemyPatternKind(e) === kind)!;
const pat = <K extends EnemyPatternKind>(e: EnemyDef, kind: K) => e.pattern as Extract<NonNullable<EnemyDef['pattern']>, { kind: K }>;

let uid = 5000;
const blk = (traitId: string, kind: Block['kind'] = 'skill'): Block => ({ uid: uid++, kind, traitId });
const build = (...ids: string[]) => {
  const b = newBuild();
  for (const id of ids) gainTrait(b, id);
  return buildCombatParams(b);
};
const wait = (s: CombatState, seconds: number) => {
  for (let i = 0; i < ticksOf(s.params, seconds) && s.status === 'playing'; i++) step(s);
};
/** 블록 생성·공허·내 자동 공격이 끼어들지 않게 멈춘다 (적 행동만 본다) */
const enemyOnly = (enemy: EnemyDef, params?: Partial<CombatParams>) => {
  const s = createCombat(1, { enemy, params: { ...NO_BLOCK_PLAY, ...params } });
  s.spawnTimer = 1e9;
  s.params.voidChance = s.params.voidChanceBonus = 0;
  s.player.attackTimer = 1e9;
  s.player.hp = s.player.maxHp = 1e9;
  return s;
};
const events = (s: CombatState) => drainCombatEvents(s);
const countOf = (s: CombatState, kind: string) => events(s).filter((e) => e.kind === kind).length;

describe('적 데이터 (속성 8종 × 일반 3종 · 강적 3종, C.47)', () => {
  it('속성마다 일반 적 2종 이상과 강적 1종 이상이 있다, 전부 provisional, 분류·노력치가 있다', () => {
    expect(LINEAGES).toHaveLength(8);
    for (const l of LINEAGES) {
      expect(pool.filter((e) => e.class === 'normal' && e.element === l.id).length, l.id).toBeGreaterThanOrEqual(2);
      expect(pool.filter((e) => e.class === 'elite' && e.element === l.id).length, l.id).toBeGreaterThanOrEqual(1);
    }
    for (const e of pool) {
      expect(['physical', 'special', 'mixed']).toContain(e.category);
      expect(Object.values(e.ev).reduce((a, b) => a + (b ?? 0), 0), e.id).toBeGreaterThan(0);
    }
    for (const e of pool) expect(e.provisional, e.id).toBe(true);
    expect(new Set(ENEMIES.map((e) => e.id)).size).toBe(ENEMIES.length);
  });

  it('이름은 자리 표시("불 일반 1")이고 모든 종족에서 읽힌다', () => {
    for (const e of pool) expect(e.name['*'], e.id).toMatch(/^\S+ (일반|강적) \d$/);
  });

  it('방어·정신력 성향은 분류 선택이 의미 있게 갈리지만 평균은 1 근처 (C.47)', () => {
    for (const e of pool) {
      const d = e.statBias?.def ?? 1;
      const sp = e.statBias?.spr ?? 1;
      expect(Math.abs(Math.log(d * sp)), e.id).toBeLessThan(0.05);
    }
    expect(pool.some((e) => (e.statBias?.def ?? 1) > (e.statBias?.spr ?? 1))).toBe(true);
    expect(pool.some((e) => (e.statBias?.def ?? 1) < (e.statBias?.spr ?? 1))).toBe(true);
  });

  it('일반 적 3종류·강적 3종류가 모두 데이터에 있고, 속성마다 종류가 빠짐없다', () => {
    const kinds = new Set(pool.map(enemyPatternKind));
    expect([...kinds].sort()).toEqual([...ENEMY_PATTERN_KINDS].sort());
    for (const k of ENEMY_PATTERN_KINDS) {
      const group = pool.filter((e) => enemyPatternKind(e) === k);
      for (const l of LINEAGES) expect(group.some((e) => e.element === l.id), `${k}/${l.id}`).toBe(true);
    }
  });

  it('체력·공격은 "기본 공격 N회 분량"이다 (패턴 종류별 기준 ±15%, 절대 피해 필드 없음)', () => {
    for (const e of pool) {
      const ref = CX.enemyHpByKind[enemyPatternKind(e)];
      expect(Math.abs(e.hpInAttacks - ref), e.id).toBeLessThanOrEqual(ref * 0.15);
      expect(Object.keys(e).filter((k) => /^(hp|attack|damage)$/.test(k))).toEqual([]);
    }
    // 일반 적은 약 30회, 강적은 약 70회 분량(임시) 근처 — 단단형·방어 자세 등 종류 편차 포함 ±40%
    for (const e of pool) expect(Math.abs(e.hpInAttacks - CX.enemyHpInAttacks[e.class])).toBeLessThanOrEqual(CX.enemyHpInAttacks[e.class] * 0.4);
  });

  it('검증: 알 수 없는 패턴 종류·필드 누락·잘못된 값을 거부한다', () => {
    const base = { ...getEnemy('fire-basic') } as Record<string, unknown>;
    expect(() => parseEnemy({ ...base, element: 'wind' })).toThrow(/element/);
    expect(() => parseEnemy({ ...base, category: 'magic' })).toThrow(/category/);
    expect(() => parseEnemy({ ...base, ev: { luck: 1 } })).toThrow(/ev/);
    expect(() => parseEnemy({ ...base, statBias: { def: 0 } })).toThrow(/statBias/);
    expect(() => parseEnemy({ ...base, pattern: { kind: 'nope' } })).toThrow(/pattern\.kind/);
    expect(() => parseEnemy({ ...base, pattern: { kind: 'swift' } })).toThrow(/attackSeconds/);
    expect(() => parseEnemy({ ...base, pattern: { kind: 'heavy-chain', everySeconds: 9, castSeconds: 2, heavyInAttacks: 1, hits: 2.5, followCastSeconds: 1 } })).toThrow(/hits/);
    expect(() => parseEnemy({ ...base, pattern: { kind: 'stance', everySeconds: 5, stanceSeconds: 6, blockDamageMultiplier: 0.4, counterInAttacks: 0.3 } })).toThrow(/everySeconds/);
    expect(() => parseEnemy({ ...base, pattern: { kind: 'stance', everySeconds: 9, stanceSeconds: 5, blockDamageMultiplier: 1.2, counterInAttacks: 0.3 } })).toThrow(/blockDamageMultiplier/);
    expect(() => parseEnemy({ ...base, pattern: { kind: 'basic' } })).not.toThrow();
  });

  it('바퀴 강화(scaleEnemy)는 체력·기본 공격과 패턴의 큰 한 방(강공격·반격)에 배율을 곱한다', () => {
    const k = { hp: 1.24, attack: 1.16 };
    const heavy = scaleEnemy(ofKind('elite', 'heavy-chain'), k);
    expect(heavy.hpInAttacks).toBeCloseTo(ofKind('elite', 'heavy-chain').hpInAttacks * 1.24);
    expect(pat(heavy, 'heavy-chain').heavyInAttacks).toBeCloseTo(pat(ofKind('elite', 'heavy-chain'), 'heavy-chain').heavyInAttacks * 1.16);
    const st = scaleEnemy(ofKind('elite', 'stance'), k);
    expect(pat(st, 'stance').counterInAttacks).toBeCloseTo(pat(ofKind('elite', 'stance'), 'stance').counterInAttacks * 1.16);
    const sw = scaleEnemy(ofKind('normal', 'swift'), k);
    expect(sw.pattern).toEqual(ofKind('normal', 'swift').pattern);
  });
});

describe('일반 적 패턴: 기본형 / 속공형 / 단단형', () => {
  const basic = ofKind('normal', 'basic');
  const swift = ofKind('normal', 'swift');
  const sturdy = ofKind('normal', 'sturdy');

  it('기본형은 패턴 없이 공통 간격(1.5초)으로 기본 공격만 한다', () => {
    expect(enemyAttackSecondsOf(createCombat(1, { enemy: basic }).params, basic.pattern)).toBe(CX.enemyAttackSeconds);
    const s = enemyOnly(basic);
    wait(s, 30);
    const ev = events(s);
    expect(ev.filter((e) => e.kind === 'enemy-attack')).toHaveLength(Math.floor(30 / CX.enemyAttackSeconds));
    expect(ev.some((e) => ['heavy-cast', 'seal', 'stance'].includes(e.kind))).toBe(false);
  });

  it('속공형: 공격 간격이 짧고 한 방은 약하다', () => {
    const sec = pat(swift, 'swift').attackSeconds;
    expect(sec).toBeLessThan(CX.enemyAttackSeconds);
    expect(swift.attackInAttacks).toBeLessThan(basic.attackInAttacks);
    const s = enemyOnly(swift);
    wait(s, 18);
    const hits = events(s).filter((e) => e.kind === 'enemy-attack');
    expect(hits).toHaveLength(Math.floor(18 / sec));
    expect(hits.length).toBeGreaterThan(Math.floor(18 / CX.enemyAttackSeconds));
    // 한 방은 약하지만 초당 피해는 기본형과 같은 급 (±35%)
    const dps = (e: EnemyDef) => e.attackInAttacks / (e.pattern && 'attackSeconds' in e.pattern ? e.pattern.attackSeconds : CX.enemyAttackSeconds);
    expect(Math.abs(dps(swift) / dps(basic) - 1)).toBeLessThan(0.35);
  });

  it('단단형: 체력이 많고 공격 간격이 느리다', () => {
    expect(sturdy.hpInAttacks).toBeGreaterThan(basic.hpInAttacks * 1.2);
    expect(pat(sturdy, 'sturdy').attackSeconds).toBeGreaterThan(CX.enemyAttackSeconds);
    const a = createCombat(1, { enemy: sturdy });
    const b = createCombat(1, { enemy: basic });
    expect(a.enemy.maxHp).toBeGreaterThan(b.enemy.maxHp * 1.2);
    const s = enemyOnly(sturdy);
    wait(s, 22);
    expect(countOf(s, 'enemy-attack')).toBe(Math.floor(22 / pat(sturdy, 'sturdy').attackSeconds));
  });

  it('일반 적 3종류에는 특수 행동(예고·봉인·자세)이 없다', () => {
    for (const e of [basic, swift, sturdy]) expect(hasSpecialActions(e.pattern)).toBe(false);
  });
});

describe('강적 패턴 3종류: 강공격↔봉인 / 연속 강공격 / 방어 자세+반격', () => {
  it('강공격↔봉인: 강공격 예고와 봉인을 번갈아 한다 (기존 패턴 그대로)', () => {
    const e = ofKind('elite', 'heavy-seal');
    const s = enemyOnly(e);
    wait(s, 40);
    const seq = events(s).filter((x) => x.kind === 'heavy-cast' || x.kind === 'seal').map((x) => x.kind);
    expect(seq.slice(0, 4)).toEqual(['heavy-cast', 'seal', 'heavy-cast', 'seal']);
  });

  it('연속 강공격: 한 번의 시전 뒤 hits 번 연달아 치고, 둘째 방부터는 시전이 짧다', () => {
    const e = ofKind('elite', 'heavy-chain');
    const p = pat(e, 'heavy-chain');
    expect(p.hits).toBeGreaterThanOrEqual(2);
    expect(p.followCastSeconds).toBeLessThan(p.castSeconds);
    const s = enemyOnly(e);
    s.enemy.attackTimer = 1e9;
    wait(s, p.everySeconds + 0.2);
    expect(s.enemy.cast).not.toBeNull();
    expect(s.enemy.cast!.total).toBe(ticksOf(s.params, p.castSeconds));
    events(s);
    wait(s, p.castSeconds + p.followCastSeconds * (p.hits - 1) + 0.3);
    const ev = events(s);
    expect(ev.filter((x) => x.kind === 'heavy-hit')).toHaveLength(p.hits);
    const casts = ev.filter((x) => x.kind === 'heavy-cast');
    expect(casts).toHaveLength(p.hits - 1);
    expect(casts.every((c) => c.kind === 'heavy-cast' && c.seconds === p.followCastSeconds)).toBe(true);
    expect(s.enemy.cast).toBeNull();
  });

  it('연속 강공격: 막기 상태 하나가 이어지는 강공격 일부를 막고, 안 막으면 전부 맞는다', () => {
    const e = ofKind('elite', 'heavy-chain');
    const p = pat(e, 'heavy-chain');
    const run = (guard: boolean) => {
      const s = enemyOnly(e, build());
      s.enemy.attackTimer = 1e9;
      wait(s, p.everySeconds + 0.2);
      if (guard) {
        s.tray = [blk('basic-guard')];
        expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
      }
      const before = s.player.hp;
      wait(s, p.castSeconds + p.followCastSeconds * (p.hits - 1) + 0.3);
      return { taken: before - s.player.hp, guards: s.guardSuccesses, hits: events(s).filter((x) => x.kind === 'heavy-hit') };
    };
    const open = run(false);
    const guarded = run(true);
    expect(open.hits).toHaveLength(p.hits);
    expect(open.guards).toBe(0);
    expect(guarded.guards).toBeGreaterThanOrEqual(1); // 막기 3초가 이어지는 시전을 덮는다 (남는 한 방은 다시 막아야 한다)
    expect(guarded.guards).toBeLessThan(p.hits);
    expect(guarded.taken).toBeLessThan(open.taken * 0.85);
  });

  it('방어 자세: 자세 중 내 블록 피해가 줄고, 블록을 쓸 때마다 반격을 받으며, 자세가 풀리면 원래대로 돌아온다', () => {
    const e = ofKind('elite', 'stance');
    const p = pat(e, 'stance');
    const s = enemyOnly(e, build('t-thunder-c')); // 공격 스킬
    s.enemy.attackTimer = 1e9;
    const b = blk('t-thunder-c');
    const normalDamage = blockDamage(s, b);
    wait(s, p.everySeconds + 0.2);
    expect(s.enemy.stance).not.toBeNull();
    expect(events(s).some((x) => x.kind === 'stance')).toBe(true);
    expect(blockDamage(s, b)).toBeCloseTo(normalDamage * p.blockDamageMultiplier);
    s.tray = [blk('t-thunder-c')];
    const hp = s.player.hp;
    const hpE = s.enemy.hp;
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    const ev = events(s);
    const counter = ev.find((x) => x.kind === 'counter');
    expect(counter).toBeDefined();
    expect(hp - s.player.hp).toBeGreaterThan(p.counterInAttacks * CX.playerAttackDamage * (1 - CX.enemyDamageVariance) - 1e-9);
    expect(hp - s.player.hp).toBeLessThan(p.counterInAttacks * CX.playerAttackDamage * (1 + CX.enemyDamageVariance) + 1e-9);
    expect(hpE - s.enemy.hp).toBeCloseTo(normalDamage * p.blockDamageMultiplier, 5);
    wait(s, p.stanceSeconds + 0.2);
    expect(s.enemy.stance).toBeNull();
    expect(events(s).some((x) => x.kind === 'stance-end')).toBe(true);
    expect(blockDamage(s, b)).toBeCloseTo(normalDamage);
    s.tray = [blk('t-thunder-c')];
    const hp2 = s.player.hp;
    applyInput(s, { type: 'use', cell: 0 });
    expect(hp2 - s.player.hp).toBe(0); // 자세가 아니면 반격 없음
  });

  it('방어 자세 반격은 막기 상태에서 경감된다', () => {
    const e = ofKind('elite', 'stance');
    const p = pat(e, 'stance');
    const counterTaken = (guardFirst: boolean) => {
      const s = enemyOnly(e, build('t-thunder-c'));
      s.enemy.attackTimer = 1e9;
      wait(s, p.everySeconds + 0.2);
      s.tray = [blk(guardFirst ? 'basic-guard' : 't-thunder-c')];
      const before = s.player.hp;
      applyInput(s, { type: 'use', cell: 0 });
      return before - s.player.hp;
    };
    // basic-guard = 막기 블록: 쓰는 순간 막기 상태가 되어 그 블록이 부른 반격이 경감된다
    expect(counterTaken(true)).toBeLessThan(counterTaken(false) * 0.75);
  });

  it('방어 자세: 마무리 일격으로 적이 쓰러지면 반격은 없다', () => {
    const e = ofKind('elite', 'stance');
    const s = enemyOnly(e, build('t-thunder-c'));
    s.enemy.attackTimer = 1e9;
    wait(s, pat(e, 'stance').everySeconds + 0.2);
    s.enemy.hp = 0.001;
    s.tray = [blk('t-thunder-c')];
    const hp = s.player.hp;
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.status).toBe('won');
    expect(s.player.hp).toBe(hp);
  });

  it('stagger 추가 효과는 모든 특수 행동 패턴의 다음 행동을 늦춘다 (패턴 종류별 일반 처리)', () => {
    for (const kind of ['heavy-seal', 'heavy-chain', 'stance'] as const) {
      const e = ofKind('elite', kind);
      const s = enemyOnly(e, { skills: [{ id: 'sk', element: null, category: 'mixed', role: 'attack', powerInAttacks: 1, chainBonus: { kind: 'stagger', value: 2 }, powerMultiplier: 1 }] });
      const before = s.enemy.actionTimer;
      s.tray = [blk('sk'), blk('sk'), blk('sk')];
      expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
      expect(s.enemy.actionTimer, kind).toBe(before + ticksOf(s.params, 2));
    }
  });
});

describe('적 출현 풀 (바퀴·타일 종류)', () => {
  const kindsAt = (cls: 'normal' | 'elite', lap: number, source = 'wild') => new Set(enemyPool(cls, lap, source).map((p) => enemyPatternKind(p.enemy)));

  it('1~2바퀴 일반 적은 기본형만, 3바퀴부터 속공형·단단형이 섞인다', () => {
    expect([...kindsAt('normal', 1)]).toEqual(['basic']);
    expect([...kindsAt('normal', 2)]).toEqual(['basic']);
    expect([...kindsAt('normal', 3)].sort()).toEqual(['basic', 'sturdy', 'swift']);
    expect([...kindsAt('normal', 6)].sort()).toEqual(['basic', 'sturdy', 'swift']);
  });

  it('강적 풀은 바퀴에 따라 종류가 늘어난다 (강공격↔봉인 → 방어 자세 → 연속 강공격)', () => {
    expect([...kindsAt('elite', 1)]).toEqual(['heavy-seal']);
    expect([...kindsAt('elite', 2)].sort()).toEqual(['heavy-seal', 'stance']);
    expect([...kindsAt('elite', 3)].sort()).toEqual(['heavy-chain', 'heavy-seal', 'stance']);
  });

  it('환경 타일·조합은 한 바퀴 일찍 센 적이 나온다 (sourceLapBonus)', () => {
    expect([...kindsAt('normal', 1, 'environment')]).toEqual(['basic']);
    expect([...kindsAt('normal', 2, 'environment')].sort()).toEqual(['basic', 'sturdy', 'swift']);
    expect([...kindsAt('elite', 1, 'combo')].sort()).toEqual(['heavy-seal', 'stance']);
    expect([...kindsAt('elite', 2, 'combo')].sort()).toEqual(['heavy-chain', 'heavy-seal', 'stance']);
    expect(kindsAt('elite', 2, 'elite-den')).toEqual(kindsAt('elite', 2, 'wild'));
  });

  it('풀에는 해당 등급만 있고 테스트 고정 적(testOnly)은 들어가지 않는다', () => {
    for (const lap of [1, 3, 6]) {
      for (const cls of ['normal', 'elite'] as const) {
        const p = enemyPool(cls, lap);
        expect(p.length).toBeGreaterThan(0);
        for (const e of p) {
          expect(e.enemy.class).toBe(cls);
          expect(e.enemy.testOnly).toBeUndefined();
        }
      }
    }
  });

  it('풀 선택은 결정적이다: 같은 시드 = 같은 적, 다른 시드는 여러 적이 나온다', () => {
    const seq = (seed: number) => {
      const rng = createRng(seed);
      return Array.from({ length: 30 }, () => pickFromPool(rng, enemyPool('normal', 4)).id);
    };
    expect(seq(7)).toEqual(seq(7));
    expect(new Set(seq(7)).size).toBeGreaterThan(5);
    expect(seq(7)).not.toEqual(seq(8));
  });

  it('원정에서 만나는 적은 같은 시드면 같고, 풀 규칙(바퀴별 종류)을 지킨다', () => {
    const run = (seed: number) =>
      playExpedition(createExpedition({ factionId: 'hollow', seed, hunger: 0, condition: 100, deck: sanitizeDeck(newTileStock(), 'hollow') }), {
        returnAfterLap: 6,
        playBattle: (s) => {
          s.enemy.hp = 0;
          s.status = 'won';
          s.finisher = { kind: 'basic-attack', traitId: null, element: null };
        },
      });
    const a = run(11);
    expect(a.battles.map((b) => b.enemyId)).toEqual(run(11).battles.map((b) => b.enemyId));
    const kindOf = (id: string) => enemyPatternKind(getEnemy(id));
    for (let seed = 1; seed <= 30; seed++) {
      for (const b of run(seed).battles) {
        const e = getEnemy(b.enemyId);
        expect(e.testOnly).toBeUndefined();
        const lap = b.lap;
        if (lap <= 1 && e.class === 'normal') expect(kindOf(b.enemyId)).toBe('basic');
        if (lap <= 1 && e.class === 'elite') expect(['heavy-seal', 'stance']).toContain(kindOf(b.enemyId));
      }
    }
  });

  it('풀 규칙 데이터는 모든 패턴 종류를 다룬다', () => {
    for (const k of ENEMY_PATTERN_KINDS) {
      expect(POOL_CONFIG.kinds[k].minLap).toBeGreaterThanOrEqual(1);
      expect(POOL_CONFIG.kinds[k].weight).toBeGreaterThan(0);
    }
  });

  it('속성이 한쪽에 몰리지 않는다: 어느 바퀴·출처의 풀에서도 각 속성 적이 6% 이상', () => {
    for (const cls of ['normal', 'elite'] as const) {
      for (const source of ['wild', 'environment', 'combo']) {
        for (let lap = 1; lap <= 6; lap++) {
          const p = enemyPool(cls, lap, source);
          const total = p.reduce((a, e) => a + e.weight, 0);
          for (const l of LINEAGES) {
            const share = p.filter((e) => e.enemy.element === l.id).reduce((a, e) => a + e.weight, 0) / total;
            expect(share, `${cls}/${source}/${lap}바퀴/${l.id}`).toBeGreaterThanOrEqual(0.06);
          }
        }
      }
    }
  });
});

describe('엔진은 적 id 로 분기하지 않는다', () => {
  it('전투·원정·풀 엔진 코드에 적 id 문자열이 없다', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk('src/engine');
    files.push('src/ui/battleView.ts');
    for (const f of files) {
      const text = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const e of ENEMIES) expect(text, `${f}: ${e.id}`).not.toMatch(new RegExp(`['"\`]${e.id}['"\`]`));
    }
  });
});
