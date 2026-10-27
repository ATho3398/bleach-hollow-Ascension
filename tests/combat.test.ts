// 전투 v2 (GDD 3-5): 실시간 자동 전투 + 스킬 블록 체인. C.6 에서 매치3 테스트(tests/battle.test.ts)를 대체한다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { ENEMIES, getEnemy } from '../src/data/enemies';
import { FACTIONS, getFaction } from '../src/data/factions';
import { pickFaction, type EnemyDef } from '../src/data/schema';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import {
  BASIC_GUARD_ID, BASIC_HEAL_ID, BASIC_SKILL_ID, isBasicBlockId, applyInput, blockSources, buildBattleRecord, chainGroup, createCombat, drainCombatEvents, elapsedSeconds,
  playCombatBot, replayCombat, spawnTableOf, step, ticksOf, type Block, type CombatParams, type CombatState,
} from '../src/engine/combat';
/** C.136 블록 플레이 보정(GDD 84장 3번)을 끈다 — 이 파일은 옛 피해 공식(체인·상성·환경 배율)만 본다. 보정 자체는 tests/c136.test.ts */
const NO_BLOCK_PLAY = { blockPlayDamage: 1, blockPlayCrit: 0 };
import { createExpedition, playExpedition } from '../src/engine/expedition';
import { parseFactionConfig } from '../src/engine/faction';
import { emptyRunLog, LEGACY_TILE_ROLES } from '../src/engine/runLog';
import { loadSave, migrateSave, newSaveData, recordBattle, recordExpedition, SAVE_FORMAT_VERSION, writeSave } from '../src/game';
import { battleLabels } from '../src/ui/labels';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const CX = BALANCE.provisional.combat;
const BP = BALANCE.provisional.blockPool;
const normal = getEnemy('test-a'); // 일반, 불 속성
const elite = getEnemy('test-elite');
const sealPat = elite.pattern as Extract<NonNullable<EnemyDef['pattern']>, { kind: 'heavy-seal' }>; // 기존 강적 = 강공격↔봉인
const mk = (opt: { seed?: number; enemy?: EnemyDef; params?: Partial<CombatParams> } = {}) =>
  createCombat(opt.seed ?? 1, { enemy: opt.enemy ?? normal, params: { ...NO_BLOCK_PLAY, ...opt.params } });
let uid = 1000;
const blk = (traitId: string | null, kind: Block['kind'] = 'skill'): Block => ({ uid: uid++, kind, traitId });
/** 바를 이 블록들로 채운다 (왼쪽부터) */
const put = (s: CombatState, ...blocks: Block[]) => {
  s.tray = blocks;
  return s;
};
/** 같은 특성 블록 n 개 */
const many = (traitId: string, n: number) => Array.from({ length: n }, () => blk(traitId));
/** 입력 없이 n 초 진행 */
const wait = (s: CombatState, seconds: number) => {
  for (let i = 0; i < ticksOf(s.params, seconds) && s.status === 'playing'; i++) step(s);
};
/** 블록 생성·공허·적 공격이 끼어들지 않게 멈춘 상태 */
const quiet = (s: CombatState) => {
  s.spawnTimer = 1e9;
  s.params.voidChance = s.params.voidChanceBonus = 0;
  s.enemy.attackTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  return s;
};
const useAt = (s: CombatState, cell: number) => applyInput(s, { type: 'use', cell });
const build = (...ids: string[]) => {
  const b = newBuild();
  for (const id of ids) gainTrait(b, id);
  return buildCombatParams(b);
};

describe('고정 틱 시뮬레이션', () => {
  it('틱은 0.1초(임시), 시간은 틱 × 틱 길이', () => {
    const s = mk();
    expect(s.params.tickSeconds).toBe(0.1);
    wait(s, 3);
    expect(s.tick).toBe(30);
    expect(elapsedSeconds(s)).toBeCloseTo(3);
  });

  it('같은 시드 + 같은 입력 기록 = 같은 결과 (봇 플레이를 기록에서 다시 돌려도 같다)', () => {
    for (const enemy of ENEMIES) {
      const a = playCombatBot(mk({ seed: 5, enemy, params: build('t-fire-a', 't-earth-c', 't-thunder-b') }));
      expect(a.inputs.length).toBeGreaterThan(0); // C.136: 공격 3칸 몸(속성 막기·회복 특성 삭제)이라 빠르게 끝나는 판이 있다
      const again = replayCombat(5, { enemy, params: { ...NO_BLOCK_PLAY, ...build('t-fire-a', 't-earth-c', 't-thunder-b') } }, a.inputs);
      expect(again.tick).toBe(a.tick);
      expect(again.status).toBe(a.status);
      expect(again.enemy.hp).toBe(a.enemy.hp);
      expect(again.player.hp).toBe(a.player.hp);
      expect(again.skillsUsed).toEqual(a.skillsUsed);
      expect(again.tray).toEqual(a.tray);
    }
  });

  it('시드가 다르면 공허 블록이 나오는 순서가 달라진다', () => {
    const kinds = (seed: number) => {
      const s = mk({ seed, params: { voidChance: 0.5, voidChanceMax: 0.5 } });
      s.player.hp = 1e9;
      wait(s, 40);
      return s.tray.map((x) => x.kind).join();
    };
    expect(new Set([1, 2, 3, 4, 5, 6].map(kinds)).size).toBeGreaterThan(1);
  });

  it('입력이 없어도 자동 기본 공격(내 1.0초, 적 1.5초)이 오간다', () => {
    const s = mk();
    s.params.voidChance = s.params.voidChanceBonus = 0;
    wait(s, 3);
    const unit = CX.playerAttackDamage;
    expect(s.enemy.maxHp - s.enemy.hp).toBeCloseTo(3 * unit);
    expect(s.player.hp).toBeLessThan(s.player.maxHp);
    const hits = drainCombatEvents(s).filter((e) => e.kind === 'enemy-attack');
    expect(hits).toHaveLength(2);
  });

  it('적 체력은 "플레이어 기본 공격 N회 분량" (CLAUDE.md 규칙 3)', () => {
    const s = mk();
    // C.118 (GDD 62장): 전투 시간 배율 hpScale(0.5)이 양쪽 최대 체력에 곱해진다
    expect(s.enemy.maxHp).toBeCloseTo(normal.hpInAttacks * CX.hpAttackScale * CX.playerAttackDamage * CX.hpScale);
    const grown = mk({ params: { growthMultiplier: 2 } });
    expect(grown.enemy.maxHp / s.enemy.maxHp).toBeCloseTo(2);
  });

  it('전투는 반드시 끝난다 (승 또는 패), 한 조우마다 체력은 새로 시작', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = playCombatBot(mk({ seed, enemy: elite }));
      expect(['won', 'lost']).toContain(s.status);
      expect(mk({ seed }).player.hp).toBe(CX.playerMaxHp * CX.playerHpScale);
    }
  });
});

describe('블록 생성과 블록 바 (일자 8칸)', () => {
  it('바는 8칸, 흡수 0칸이면 기본 블록 5종(공격·막기·회복)만 생성되고 왼쪽부터 빈 칸 없이 오른쪽 끝에 붙는다', () => {
    const s = mk();
    expect(s.params.trayCapacity).toBe(8);
    expect(s.tray).toHaveLength(0);
    expect(blockSources(s.params).map((x) => x.id)).toEqual([BASIC_SKILL_ID, BASIC_GUARD_ID, BASIC_HEAL_ID]);
    s.params.voidChance = s.params.voidChanceBonus = 0;
    wait(s, spawnTableOf(s.params).seconds * 1.6); // C.173: 막기 몫 0.45 로 간격이 출현표 총량에서 나온다. 첫 블록은 간격의 절반 뒤, 둘째는 1.5배 뒤 (C.118 간격 1.9초 = 19틱이라 반올림 여유로 1.6배)
    expect(s.tray).toHaveLength(2);
    expect(s.tray.every((b) => isBasicBlockId(b.traitId))).toBe(true);
    const spawns = drainCombatEvents(s).filter((e) => e.kind === 'spawn');
    expect(spawns.map((e) => e.kind === 'spawn' && e.index)).toEqual([0, 1]);
  });

  it('블록은 타이머 하나 + 출현표 한 장에서 나온다 (GDD 84장 6번, C.136): 흡수 특성·기본 블록이 모두 표에 있고 합 1', () => {
    const s = mk({ params: build('t-fire-a', 't-earth-c') });
    const table = spawnTableOf(s.params);
    const ids = table.entries.map((e) => e.source?.id ?? 'void');
    expect(ids).toContain('t-fire-a');
    expect(ids).toContain('t-earth-c');
    expect(ids).toContain(BASIC_SKILL_ID);
    expect(table.entries.reduce((a, e) => a + e.chance, 0)).toBeCloseTo(1);
    expect(typeof s.spawnTimer).toBe('number');
  });

  it('8개가 되면 생성이 멈추고(타이머도 멈춤), 하나를 쓰면 오른쪽 블록이 당겨지고 새 블록은 맨 오른쪽에 생긴다', () => {
    const s = mk({ params: build('t-fire-a', 't-earth-c', 't-thunder-b') });
    s.params.voidChance = s.params.voidChanceBonus = 0;
    s.player.hp = 1e9;
    s.enemy.hp = 1e9; // C.118: 적 체력이 절반이라 56초 안에 평타만으로 죽는다 — 생성 규칙만 본다
    wait(s, 40);
    expect(s.tray).toHaveLength(8);
    const timer = s.spawnTimer;
    wait(s, 10);
    expect(s.spawnTimer).toBe(timer);
    expect(s.tray).toHaveLength(8);
    const ids = s.tray.map((b) => b.uid);
    useAt(s, 2);
    const used = s.tray.length;
    expect(used).toBeLessThan(8);
    // 쓴 칸 오른쪽은 한 칸씩 당겨졌다 (같은 특성이 붙어 체인이 됐다면 그 개수만큼)
    const gone = 8 - used;
    expect(s.tray.map((b) => b.uid)).toEqual([...ids.slice(0, 2), ...ids.slice(2 + gone)]);
    wait(s, CX.blockSpawnSeconds);
    expect(s.tray.length).toBeGreaterThan(used);
    expect(s.tray.slice(0, used).map((b) => b.uid)).toEqual([...ids.slice(0, 2), ...ids.slice(2 + gone)]);
  });
});

describe('블록 순서는 바꿀 수 없다 (GDD 17-2)', () => {
  const order = (s: CombatState) => s.tray.map((b) => b.traitId).join('');
  const abcde = () => put(quiet(mk()), blk('a'), blk('b'), blk('c'), blk('d'), blk('e'));

  it('순서 바꾸기·합치기 같은 입력은 거절하고 바도 입력 기록도 그대로다', () => {
    const s = abcde();
    expect(applyInput(s, { type: 'move', from: 0, to: 3 } as never)).toBe(false);
    expect(applyInput(s, { type: 'merge', from: 0, to: 1 } as never)).toBe(false);
    expect(s.inputs).toHaveLength(0);
    expect(order(s)).toBe('abcde');
  });

  it('블록은 쓰면 사라지고 뒤 블록이 당겨질 뿐 순서는 나온 그대로다', () => {
    const s = abcde();
    expect(applyInput(s, { type: 'use', cell: 1 })).toBe(true);
    expect(order(s)).toBe('acde');
  });
});

describe('붙어 있는 같은 블록 = 클릭 시 함께 발동 (체인)', () => {
  const T = BASIC_SKILL_ID;
  const left = (s: CombatState) => s.tray.map((b) => b.traitId).join();

  it('붙은 같은 특성 2개·3개를 누르면 모두 소모되고 체인 단계 = 개수', () => {
    for (const n of [1, 2, 3]) {
      const s = put(quiet(mk()), ...many(T, n), blk('z'));
      useAt(s, n - 1);
      expect(left(s)).toBe('z');
      expect(s.blocksByChain.map((v, k) => (k === n - 1 ? v : 0))).toEqual(s.blocksByChain);
      expect(s.blocksByChain[n - 1]).toBe(1);
      expect(s.skillsUsed).toHaveLength(n);
      expect(s.blocksByTrait[T]).toBe(n);
    }
  });

  it('붙어 있지 않은 같은 블록은 체인이 아니다 (사이에 다른 블록이 있으면 개별 사용)', () => {
    const s = put(quiet(mk()), blk(T), blk('z'), blk(T));
    useAt(s, 0);
    expect(left(s)).toBe('z,' + T);
    expect(s.blocksByChain).toEqual([1, 0, 0]);
    useAt(s, 1);
    expect(s.blocksByChain).toEqual([2, 0, 0]);
  });

  it('붙은 블록이 4개 이상이면 앞에서부터 3개씩 묶고, 누른 블록의 묶음만 발동한다 (GDD 19-2: 4=3+1, 5=3+2)', () => {
    const s = put(quiet(mk()), ...many(T, 5));
    // 5개 덩어리 = [0,1,2] + [3,4]
    expect(chainGroup(s.tray, 0, 3)).toEqual([0, 1, 2]);
    expect(chainGroup(s.tray, 1, 3)).toEqual([0, 1, 2]);
    expect(chainGroup(s.tray, 2, 3)).toEqual([0, 1, 2]);
    expect(chainGroup(s.tray, 3, 3)).toEqual([3, 4]);
    expect(chainGroup(s.tray, 4, 3)).toEqual([3, 4]);
    const a = put(quiet(mk()), ...many(T, 4));
    useAt(a, 3);
    expect(a.tray).toHaveLength(3); // 4 = 3+1: 맨 오른쪽 1개 묶음만 쓰인다
    expect(a.blocksByChain).toEqual([1, 0, 0]);
    useAt(a, 0);
    expect(a.tray).toHaveLength(0);
    expect(a.blocksByChain).toEqual([1, 0, 1]);
    const b = put(quiet(mk()), blk('z'), ...many(T, 4), blk('y'));
    useAt(b, 2);
    expect(left(b)).toBe(['z', T, 'y'].join()); // 2번 클릭 → 1,2,3 이 발동, 4번 남음
  });

  it('덩어리가 아닌 다른 특성/공허/필살은 끼지 않는다', () => {
    const s = put(quiet(mk({ params: build('t-fire-a') })), blk('t-fire-a'), blk('t-fire-a'), blk(null, 'void'), blk('t-fire-a'));
    useAt(s, 1);
    expect(s.tray.map((b) => b.kind)).toEqual(['void', 'skill']);
  });

  it('공허 블록은 다른 공허 블록과 붙어 있어도 체인이 되지 않고 개별 사용, 콤보도 단독', () => {
    const s = put(quiet(mk()), blk(null, 'void'), blk(null, 'void'), blk('combo-x', 'combo'), blk('combo-x', 'combo'));
    expect(chainGroup(s.tray, 0, 3)).toEqual([0]);
    expect(chainGroup(s.tray, 3, 3)).toEqual([3]);
    useAt(s, 0);
    expect(s.voidUsed).toBe(1);
    expect(s.tray.map((b) => b.kind)).toEqual(['void', 'combo', 'combo']);
    s.stunTicks = 0; // 공허 경직 중에는 블록을 못 쓴다 (C.174 GDD 105장 1번)
    useAt(s, 1);
    expect(s.tray).toHaveLength(2);
    expect(s.blocksByChain).toEqual([0, 0, 0]); // 스킬 체인 기록은 오르지 않는다
  });

  it('붙이기: 사이에 낀 블록을 먼저 쓰면 뒤 블록이 당겨져 같은 블록이 붙고, 그다음 클릭이 체인', () => {
    const s = put(quiet(mk()), blk(T), blk('z'), blk(T), blk('y'));
    useAt(s, 1);
    expect(left(s)).toBe([T, T, 'y'].join());
    useAt(s, 0);
    expect(s.blocksByChain).toEqual([0, 1, 0]);
    expect(left(s)).toBe('y');
  });
});

describe('체인 배율과 SP·필살', () => {
  it('체인 효과 ×1.0 / ×2.2 / ×3.6 (붙은 블록 1·2·3개)', () => {
    const dmg = (n: number) => {
      const s = put(quiet(mk()), ...many(BASIC_SKILL_ID, n));
      const before = s.enemy.hp;
      useAt(s, 0);
      return before - s.enemy.hp;
    };
    const d1 = dmg(1);
    expect(d1).toBeCloseTo(CX.basicBlockPowerInAttacks * CX.playerAttackDamage);
    expect(dmg(2) / d1).toBeCloseTo(2.2);
    expect(dmg(3) / d1).toBeCloseTo(3.6);
  });

  it('체인3 은 특성별 추가 효과가 붙는다: stagger(적 행동 지연), reflect(막기 반사 — 막기 버튼 3칸), cleanse(봉인 해제 + 게이지 — 회복 버튼 3칸). 체인2 는 없음', () => {
    const s = quiet(mk({ params: build('t-fire-a', 't-earth-c', 't-thunder-b') }));
    s.enemy.attackTimer = 10;
    put(s, ...many('t-fire-a', 2));
    useAt(s, 0);
    expect(s.enemy.attackTimer).toBe(10); // 체인2 는 추가 효과 없음
    put(s, ...many('t-fire-a', 3));
    useAt(s, 0);
    expect(s.enemy.attackTimer).toBe(10 + ticksOf(s.params, 1.5));
    expect(s.chain3Count).toBe(1);
    expect(s.blocksByChain).toEqual([0, 1, 1]);
  });

  it('SP 게이지·필살 블록은 없다 (C.118, GDD 66장): 블록을 아무리 써도 상태에 sp 가 없고 바에 특수 블록이 생기지 않는다', () => {
    const s = quiet(mk());
    for (let i = 0; i < 6; i++) {
      put(s, blk(BASIC_SKILL_ID));
      useAt(s, 0);
      step(s);
    }
    expect('sp' in s).toBe(false);
    expect('specialUsed' in s).toBe(false);
    expect(s.tray.every((b) => b.kind === 'skill' || b.kind === 'void' || b.kind === 'combo' || b.kind === 'liberation')).toBe(true);
    expect('spMax' in CX).toBe(false);
    expect('spPerBlock' in CX).toBe(false);
    expect('specialPowerInAttacks' in CX).toBe(false);
  });
});

describe('적 패턴: 강공격 예고·막기, 봉인', () => {
  const eliteQuiet = () => {
    const s = mk({ enemy: elite, params: build() });
    s.spawnTimer = 1e9;
    s.params.voidChance = s.params.voidChanceBonus = 0;
    s.player.attackTimer = 1e9;
    return s;
  };
  const castNow = (s: CombatState) => {
    s.enemy.actionIndex = 0; // 다음 행동 = 강공격
    s.enemy.actionTimer = 1;
    step(s);
    expect(s.enemy.cast).not.toBeNull();
  };

  it('일반 적은 기본 공격만 한다', () => {
    const s = mk();
    s.player.hp = 1e9;
    wait(s, 60);
    const kinds = new Set(drainCombatEvents(s).map((e) => e.kind));
    expect(kinds.has('heavy-cast')).toBe(false);
    expect(kinds.has('seal')).toBe(false);
  });

  it('강적은 강공격(2초 예고)과 봉인을 번갈아 한다, 예고 중에는 기본 공격을 멈춘다', () => {
    const s = mk({ enemy: elite });
    s.player.hp = 1e9;
    s.player.attackTimer = 1e9;
    wait(s, 40);
    const seq = drainCombatEvents(s).filter((e) => e.kind === 'heavy-cast' || e.kind === 'seal').map((e) => e.kind);
    expect(seq.slice(0, 4)).toEqual(['heavy-cast', 'seal', 'heavy-cast', 'seal']);
    const t = eliteQuiet();
    castNow(t);
    expect(t.enemy.cast!.total).toBe(ticksOf(t.params, sealPat.castSeconds));
    t.enemy.attackTimer = 1;
    wait(t, 1);
    expect(drainCombatEvents(t).some((e) => e.kind === 'enemy-attack')).toBe(false);
  });

  it('예고 중 guard 블록을 쓰면 강공격을 크게 줄이고(막기 성공), 안 쓰면 그대로 맞는다', () => {
    const hit = (guard: boolean) => {
      const s = eliteQuiet();
      castNow(s);
      const before = s.player.hp;
      // 막기 지속이 짧다(GDD 105장 수정, 0.5초): 착탄 0.4초 전에 막는다
      wait(s, sealPat.castSeconds - 0.4);
      if (guard) {
        put(s, blk('basic-guard'));
        useAt(s, 0);
      }
      wait(s, 0.6);
      const ev = drainCombatEvents(s).find((e) => e.kind === 'heavy-hit');
      return { s, taken: before - s.player.hp, ev };
    };
    const open = hit(false);
    const guarded = hit(true);
    expect(open.ev).toMatchObject({ guarded: false });
    expect(guarded.ev).toMatchObject({ guarded: true });
    expect(guarded.s.guardSuccesses).toBe(1);
    expect(open.s.guardSuccesses).toBe(0);
    const heavy = sealPat.heavyInAttacks * CX.heavyHitMultiplier * CX.playerAttackDamage;
    expect(open.taken).toBeGreaterThan(heavy * (1 - CX.enemyDamageVariance) - 1e-9);
    expect(guarded.taken).toBeCloseTo(0, 6); // 강공격 완전 막기 (C.177)
  });

  it('reflect 추가 효과가 붙은 막기는 막은 피해를 적에게 돌려준다', () => {
    const s = eliteQuiet();
    castNow(s);
    wait(s, sealPat.castSeconds - 0.4);
    put(s, ...many('basic-guard', 3));
    useAt(s, 0);
    const before = s.enemy.hp;
    wait(s, 0.6);
    const ev = drainCombatEvents(s).find((e) => e.kind === 'heavy-hit');
    expect(ev && ev.kind === 'heavy-hit' && ev.reflected).toBeGreaterThan(0);
    expect(s.enemy.hp).toBeLessThan(before);
  });

  it('봉인: 정해진 시간 동안 스킬 블록 생성이 멈춘다', () => {
    const s = mk({ enemy: elite });
    s.params.voidChance = s.params.voidChanceBonus = 0;
    s.enemy.actionIndex = 1; // 다음 행동 = 봉인
    s.enemy.actionTimer = 1;
    s.spawnTimer = 5;
    step(s);
    expect(s.sealTicks).toBe(ticksOf(s.params, sealPat.sealSeconds) - 0);
    wait(s, sealPat.sealSeconds - 0.2);
    expect(s.tray).toHaveLength(0);
    wait(s, 1);
    expect(s.tray).toHaveLength(1);
  });
});

describe('약점·공허·시간 제한', () => {
  it('상성 (GDD 20-2): 강 ×1.2 / 약 ×0.85 / 그 밖 ×1, 자기 속성 ×1.1, 능력치 비가 곱해진다', () => {
    const dmg = (traitId: string, extra: Partial<CombatParams> = {}) => {
      const s = quiet(mk({ params: { ...build(traitId), ...extra } }));
      put(s, blk(traitId));
      const before = s.enemy.hp;
      useAt(s, 0);
      return before - s.enemy.hp;
    };
    // test-a 는 불 속성: 물이 불을 이기고(강), 불이 흙을 이긴다(흙 공격은 약)
    expect(normal.element).toBe('fire');
    const base = 4.2 * CX.playerAttackDamage;
    expect(dmg('t-water-a')).toBeCloseTo(base * BALANCE.elements.strong);
    expect(dmg('t-earth-a')).toBeCloseTo(base * BALANCE.elements.weak);
    expect(dmg('t-fire-a')).toBeCloseTo(base);
    // 내 캐릭터 속성이 노멀이면 노멀 블록에 자기 속성 보정
    expect(dmg('t-normal-a')).toBeCloseTo(base * BALANCE.elements.stab);
    // 내 힘·지능이 두 배면 (특성 분류가 종족 없이 혼합이라) 피해 두 배
    const ref = 50;
    expect(dmg('t-fire-a', { refStat: ref, playerStats: { hp: ref, atk: ref * 2, int: ref * 2, def: ref, spr: ref, spd: ref } })).toBeCloseTo(base * 2);
  });

  it('특수 속성 (GDD 20-2): 혈 = 준 피해 일부 흡혈, 독 = 지속 피해, 허 = 방어 일부 무시 + 쓰면 리스크', () => {
    const EL = BALANCE.provisional.elements;
    const plain = getEnemy('test-e'); // 노멀: 상성 없음
    const hit = (traitId: string) => {
      const s = quiet(mk({ enemy: plain, params: build(traitId) }));
      s.player.hp = 1;
      put(s, blk(traitId));
      const before = s.enemy.hp;
      useAt(s, 0);
      return { s, damage: before - s.enemy.hp };
    };
    const base = 4.2 * CX.playerAttackDamage;
    const blood = hit('t-blood-a');
    expect(blood.damage).toBeCloseTo(base);
    expect(blood.s.player.hp).toBeCloseTo(1 + base * EL.drainFraction);
    const poison = hit('t-poison-a');
    expect(poison.s.enemy.dot).not.toBeNull();
    const d = poison.s.enemy.dot!;
    expect(d.ticks * d.perTick).toBeCloseTo(base * EL.poisonFraction);
    const hpBefore = poison.s.enemy.hp;
    wait(poison.s, EL.poisonSeconds + 0.5);
    expect(hpBefore - poison.s.enemy.hp).toBeCloseTo(base * EL.poisonFraction);
    const kyo = hit('t-kyo-a');
    // GDD 45장 5번 "허 방무 없애": 허 블록은 방어 무시·리스크 없이 보통 피해
    expect(kyo.damage).toBeCloseTo(base);
    expect(kyo.s.riskGained).toBe(0);
  });

  it('적의 공격도 상성·능력치를 따른다: 내 방어가 두 배면 받는 피해가 절반, 적 속성이 나를 이기면 ×1.2', () => {
    const taken = (extra: Partial<CombatParams>) => {
      const s = mk({ seed: 3, params: { enemyDamageVariance: 0, ...extra } });
      s.spawnTimer = 1e9;
      s.params.voidChance = s.params.voidChanceBonus = 0;
      s.player.attackTimer = 1e9;
      const before = s.player.hp;
      wait(s, CX.enemyAttackSeconds + 0.05);
      return before - s.player.hp;
    };
    const one = taken({});
    expect(one).toBeCloseTo(normal.attackInAttacks * CX.playerAttackDamage);
    const r = 50;
    expect(taken({ refStat: r, playerStats: { hp: r, atk: r, int: r, def: r * 2, spr: r * 2, spd: r } })).toBeCloseTo(one / 2);
    // test-a 는 불: 불이 흙을 이긴다 → 흙 캐릭터는 ×1.2, 물 캐릭터(물이 불을 이김)는 ×0.85
    expect(taken({ playerElements: ['earth'] })).toBeCloseTo(one * BALANCE.elements.strong);
    expect(taken({ playerElements: ['water'] })).toBeCloseTo(one * BALANCE.elements.weak);
  });

  it('공허 블록: 자연 생성되고, 쓰면 큰 피해 + 리스크 상승, 합칠 수 없고 두면 칸을 차지한다', () => {
    // C.136 (GDD 84장 6번): 공허도 출현표의 한 칸 — 확률 = 공허 시계의 초당 기대치 ÷ 총량
    const s = mk({ params: { voidChance: 1, voidChanceMax: 1 } });
    s.player.hp = s.enemy.hp = 1e9;
    const voidEntry = spawnTableOf(s.params).entries.find((e) => e.kind === 'void');
    expect(voidEntry!.chance).toBeGreaterThan(0.3);
    for (let i = 0; i < 400 && s.tray.filter((b) => b.kind === 'void').length < 2; i++) step(s);
    const cell = s.tray.findIndex((b) => b.kind === 'void');
    expect(cell).toBeGreaterThanOrEqual(0);
    expect(s.tray.filter((b) => b.kind === 'void')).toHaveLength(2); // 쓰지 않으면 남는다
    quiet(s);
    const before = s.enemy.hp;
    useAt(s, cell);
    expect(before - s.enemy.hp).toBeCloseTo(CX.voidPowerInAttacks * CX.playerAttackDamage);
    expect(s.voidUsed).toBe(1);
    expect(s.riskGained).toBeCloseTo(BALANCE.provisional.risk.perVoidBlock);
  });

  it('공허 생성 확률은 가산(컨디션·폐가 등)만큼 오른다', () => {
    const count = (bonus: number) => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const s = mk({ seed, params: { voidChanceBonus: bonus } });
        s.player.hp = 1e9;
        s.enemy.hp = 1e9;
        wait(s, 30);
        n += s.events.filter((e) => e.kind === 'spawn' && e.block === 'void').length;
      }
      return n;
    };
    expect(count(0.3)).toBeGreaterThan(count(0));
  });

  it('시간 제한(임시 150초)을 넘기면 패배', () => {
    const s = mk();
    s.enemy.hp = 1e12;
    s.player.hp = 1e12;
    wait(s, CX.timeLimitSeconds + 1);
    expect(s.status).toBe('lost');
    expect(s.lossReason).toBe('timeout');
    expect(elapsedSeconds(s)).toBeCloseTo(CX.timeLimitSeconds);
  });

  it('체력 0 이면 패배', () => {
    const s = mk();
    s.player.hp = 0.5;
    s.enemy.attackTimer = 1;
    step(s);
    expect(s.status).toBe('lost');
    expect(s.lossReason).toBe('hp');
  });
});

describe('환경 지형 타일 (전투 v2 효과)', () => {
  it('안개: 블록 바의 순서가 주기적으로 섞인다 (블록은 그대로, 빈 칸 없이 왼쪽부터 유지)', () => {
    const s = quiet(mk({ seed: 4, params: { trayShuffleSeconds: BALANCE.provisional.tiles.reshuffle.trayShuffleSeconds } }));
    put(s, blk('a'), blk('b'), blk('c'), blk('d'), blk('e'), blk('f'));
    const before = s.tray.map((b) => b.traitId);
    wait(s, BALANCE.provisional.tiles.reshuffle.trayShuffleSeconds);
    expect(s.events.some((e) => e.kind === 'shuffle')).toBe(true);
    expect(s.tray.map((b) => b.traitId)).not.toEqual(before);
    expect(s.tray.map((b) => b.traitId).sort()).toEqual(before);
    expect(s.tray).toHaveLength(6);
    // 섞인 뒤에도 같은 입력 기록이면 같은 결과 (결정성)
    const again = quiet(mk({ seed: 4, params: { trayShuffleSeconds: BALANCE.provisional.tiles.reshuffle.trayShuffleSeconds } }));
    put(again, ...before.map((id) => blk(id)));
    wait(again, BALANCE.provisional.tiles.reshuffle.trayShuffleSeconds);
    expect(again.tray.map((b) => b.traitId)).toEqual(s.tray.map((b) => b.traitId));
  });

  it('황무지: 내 공격 위력(기본 공격·블록) ×1.3', () => {
    const k = BALANCE.provisional.tiles.power.playerPowerMultiplier;
    const s = quiet(mk({ params: { playerPowerMultiplier: k } }));
    put(s, blk(BASIC_SKILL_ID));
    const before = s.enemy.hp;
    useAt(s, 0);
    expect(before - s.enemy.hp).toBeCloseTo(CX.basicBlockPowerInAttacks * CX.playerAttackDamage * k);
    const t = mk({ params: { playerPowerMultiplier: k } });
    wait(t, 1);
    expect(t.enemy.maxHp - t.enemy.hp).toBeCloseTo(CX.playerAttackDamage * k);
  });

  it('결계: 받는 피해 경감', () => {
    const taken = (m: number) => {
      const s = mk({ seed: 3, params: { damageTakenMultiplier: m } });
      wait(s, 6);
      return s.player.maxHp - s.player.hp;
    };
    expect(taken(BALANCE.provisional.tiles.shield.damageTakenMultiplier) / taken(1)).toBeCloseTo(BALANCE.provisional.tiles.shield.damageTakenMultiplier);
  });

  it('폐가: 공허 블록 생성 확률 가산 (원정이 voidChanceBonus 로 넘긴다, tests/expedition.test.ts)', () => {
    expect(BALANCE.provisional.tiles.void.voidChanceBonus).toBeGreaterThan(0);
  });
});

describe('런 로그 BattleRecord (형식 5)', () => {
  it('전투 시간·블록 사용(특성별·체인별)·체인3·막기·공허·필살·마무리 일격이 기록되고, 매치3 필드는 0', () => {
    const s = playCombatBot(mk({ seed: 9, enemy: elite, params: build('t-fire-a', 't-earth-c', 't-thunder-b') }));
    const save = newSaveData('hollow');
    recordBattle(save, buildBattleRecord(s, { factionId: save.factionId }));
    const rec = save.runLog.battles[0]!;
    expect(rec.won).toBe(s.status === 'won');
    expect(rec.durationSeconds).toBeCloseTo(elapsedSeconds(s), 1);
    // 체인별은 발동 횟수, 특성별·skillsUsed 는 소모한 블록 수 (한 번 눌러 체인N = N개 소모)
    expect(rec.blocksByChain.reduce((a, v, k) => a + v * (k + 1), 0)).toBe(s.skillsUsed.length);
    expect(Object.values(rec.blocksByTrait).reduce((a, b) => a + b, 0)).toBe(s.skillsUsed.length);
    expect(rec.chain3Count).toBe(s.chain3Count);
    expect(rec.guardSuccesses).toBe(s.guardSuccesses);
    expect(rec.voidUsed).toBe(s.voidUsed);
    expect(rec.specialUsed).toBe(false); // SP 필살 블록은 C.118 에 삭제 — 런 로그 필드는 옛 기록 호환으로 늘 false
    expect(rec.finisherKind).toBe(s.finisher?.kind ?? null);
    expect(rec.turns).toBe(0);
    expect(rec.absorbGained).toBe(0);
    expect(Object.keys(rec.matchesByRole).sort()).toEqual([...LEGACY_TILE_ROLES].sort());
    expect(Object.values(rec.matchesByRole).every((v) => v === 0)).toBe(true);
  });

  it('저장하고 다시 불러온다', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(loadSave(storage)).toBeNull();
    const save = newSaveData('shinigami');
    recordBattle(save, buildBattleRecord(playCombatBot(mk({ seed: 2 })), { factionId: 'shinigami' }));
    writeSave(storage, save);
    expect(loadSave(storage)).toEqual(save);
  });

  it('형식 4 세이브가 열린다: 매치3 시절 전투 기록에 새 필드가 0/빈 값으로 채워지고 기존 필드는 그대로', () => {
    const old = newSaveData('hollow', 0) as unknown as Record<string, any>;
    old.meta.format = 4;
    old.runLog.battles = [{
      runId: 1, lap: 2, turns: 7, matchesByRole: { damage: 3, spirit: 1, shield: 2, absorb: 4, risk: 1 }, won: true, skillsUsed: ['t-fire-a'],
      enemyClass: 'normal', tierIndex: 0, enemyId: 'test-a', factionId: 'hollow', seed: 5, riskGained: 5, absorbGained: 4, lossReason: null,
    }];
    const m = migrateSave(JSON.parse(JSON.stringify(old)))!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.runLog.battles[0]).toMatchObject({
      turns: 7, matchesByRole: { damage: 3, absorb: 4 }, absorbGained: 4, skillsUsed: ['t-fire-a'],
      durationSeconds: 0, blocksByTrait: {}, blocksByChain: [0, 0, 0], chain3Count: 0, guardSuccesses: 0, voidUsed: 0, specialUsed: false,
      finisherKind: null, finisherTraitId: null, finisherLineageId: null, absorbable: false, storedUsed: 0, storedWasted: 0,
    });
  });

  it('형식 1 세이브도 끝까지 올라간다', () => {
    const old = {
      meta: { format: 1, balanceVersion: 2, startPatch: 'C.1' },
      factionId: 'hollow',
      runLog: { ...emptyRunLog(), battles: [{ runId: 0, lap: 0, turns: 5, matchesByRole: {}, won: true, skillsUsed: [], enemyClass: 'normal', tierIndex: 0 }] },
    };
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.runLog.battles[0]).toMatchObject({ turns: 5, enemyId: 'unknown', seed: 0, lossReason: null, chain3Count: 0, matchesByRole: { damage: 0 } });
    expect(migrateSave({ nope: 1 })).toBeNull();
  });
});

describe('원정과 이어서 한 판 완주 (통합)', () => {
  it('둥지 → 원정(블록 봇 전투·흡수) → 귀환/패배 → 세이브까지 한 번에 돌아가고, 전투 기록이 새 형식으로 쌓인다', () => {
    const save = newSaveData('shinigami', 0);
    const deck = ['prey-nest-a', 'prey-nest-b', 'elite-den-a', 'env-barrier', 'env-ruin', 'rest-a'];
    const exp = playExpedition(createExpedition({ factionId: 'shinigami', seed: 31, runId: 1, hunger: 20, condition: 80, deck }), { returnAfterLap: 3, absorb: 'absorb' });
    expect(exp.phase).toBe('ended');
    expect(exp.battles.length).toBeGreaterThan(2);
    expect(exp.battles.every((b) => b.durationSeconds > 0 && b.factionId === 'shinigami')).toBe(true);
    recordExpedition(save, exp, 1);
    expect(save.runLog.runs).toHaveLength(1);
    expect(save.runLog.battles.length).toBe(exp.battles.length);
    const writable = new Map<string, string>();
    writeSave({ getItem: (k) => writable.get(k) ?? null, setItem: (k, v) => void writable.set(k, v) }, save);
    expect(loadSave({ getItem: (k) => writable.get(k) ?? null, setItem: () => {} })).toEqual(save);
  });
});

describe('종족 설정만 바꿔도 이름이 바뀐다 (코드 분기 없음)', () => {
  it('두 종족의 전투 화면 텍스트(블록·역할·체인·SP)가 설정에서 나온다', () => {
    const h = battleLabels(getFaction('hollow'));
    const sh = battleLabels(getFaction('shinigami'));
    // 범례 역할 이름은 양 종족 같은 공격·막기·회복 (GDD 20장 v5.7), 블록 통칭도 기술 블록으로 통일 — 값은 여전히 종족 설정에서 읽는다
    expect([h.role.attack, h.role.guard, h.role.heal]).toEqual(['공격', '막기', '회복']);
    expect(sh.role).toEqual(h.role);
    expect(sh.skillBlock).toBe('기술 블록');
    // 블록 표시 이름은 종족 무관 고정 낱말 (GDD 20장 v5.4). SP 필살 블록 이름은 C.118 에 삭제
    expect('specialBlock' in h).toBe(false);
    expect('sp' in h).toBe(false);
    expect(h.riskGauge).toBe('광기');
    expect(sh.riskGauge).toBe('호로화');
    expect(h.defeatState).toBe('가면이 깨져 쓰러짐');
    expect(sh.defeatState).toBe('영력 고갈');
    expect(h.families.map((f) => f.abbr)).not.toEqual(sh.families.map((f) => f.abbr));
  });

  it('3번째 종족은 설정 객체 하나만으로 전투 텍스트가 나온다', () => {
    const quincy = parseFactionConfig({
      ...getFaction('hollow'),
      id: 'quincy',
      name: '퀸시',
      skillBlockName: '성문 블록',
      voidBlockName: '균열 블록',
      chainName: '연결',
      roleNames: { attack: '광시', guard: '블루트', heal: '흡수' },
      riskGaugeName: '균열',
      basicSkillName: '성문',
    });
    const l = battleLabels(quincy);
    expect(l.role.guard).toBe('블루트');
    expect(l.chain).toBe('연결');
    expect(l.voidBlock).toBe('공허');
    expect(pickFaction(getEnemy('test-a').name, 'quincy')).toBe('테스트 적 A');
    expect(FACTIONS.length).toBe(2);
  });

  it('엔진·화면 코드에 종족 id 문자열 분기가 없다', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk('src/engine');
    walk('src/ui');
    files.push('src/main.ts', 'src/game.ts');
    expect(files.some((f) => f.includes('combat'))).toBe(true);
    for (const f of files) {
      const text = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(text, f).not.toMatch(/['"`](hollow|shinigami)['"`]/);
    }
  });

  it('매치3 보드 코드가 남아 있지 않다', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|css)$/.test(p)) files.push(p);
      }
    };
    walk('src');
    for (const f of files) {
      const text = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(text, f).not.toMatch(/engine\/battle|playerSwap|resolveBoard|findMoves|tileNames|\.board\b/);
    }
  });
});
