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
  BASIC_SKILL_ID, applyInput, blockSources, buildBattleRecord, canMerge, canMove, createCombat, drainCombatEvents, elapsedSeconds,
  playCombatBot, replayCombat, step, ticksOf, type Block, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { createExpedition, playExpedition } from '../src/engine/expedition';
import { parseFactionConfig } from '../src/engine/faction';
import { emptyRunLog, LEGACY_TILE_ROLES } from '../src/engine/runLog';
import { loadSave, migrateSave, newSaveData, recordBattle, recordExpedition, SAVE_FORMAT_VERSION, writeSave } from '../src/game';
import { battleLabels } from '../src/ui/labels';

const CX = BALANCE.provisional.combat;
const normal = getEnemy('test-a'); // 일반, 약점 계통 B
const elite = getEnemy('test-elite');
const mk = (opt: { seed?: number; enemy?: EnemyDef; params?: Partial<CombatParams> } = {}) =>
  createCombat(opt.seed ?? 1, { enemy: opt.enemy ?? normal, params: opt.params });
let uid = 1000;
const blk = (traitId: string | null, chain = 1, kind: Block['kind'] = 'skill'): Block => ({ uid: uid++, kind, traitId, chain });
/** 입력 없이 n 초 진행 */
const wait = (s: CombatState, seconds: number) => {
  for (let i = 0; i < ticksOf(s.params, seconds) && s.status === 'playing'; i++) step(s);
};
/** 블록 생성·공허·적 공격이 끼어들지 않게 멈춘 상태 */
const quiet = (s: CombatState) => {
  s.spawnTimers = s.spawnTimers.map(() => 1e9);
  s.voidTimer = 1e9;
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
      const a = playCombatBot(mk({ seed: 5, enemy, params: build('trait-a1', 'trait-b1', 'trait-c1') }));
      expect(a.inputs.length).toBeGreaterThan(5);
      const again = replayCombat(5, { enemy, params: build('trait-a1', 'trait-b1', 'trait-c1') }, a.inputs);
      expect(again.tick).toBe(a.tick);
      expect(again.status).toBe(a.status);
      expect(again.enemy.hp).toBe(a.enemy.hp);
      expect(again.player.hp).toBe(a.player.hp);
      expect(again.skillsUsed).toEqual(a.skillsUsed);
      expect(again.tray).toEqual(a.tray);
    }
  });

  it('시드가 다르면 블록 위치 등이 달라진다', () => {
    const a = mk({ seed: 1 });
    const b = mk({ seed: 2 });
    wait(a, 12);
    wait(b, 12);
    expect(a.tray.map((x) => (x ? 1 : 0))).not.toEqual(b.tray.map((x) => (x ? 1 : 0)));
  });

  it('입력이 없어도 자동 기본 공격(내 1.0초, 적 1.5초)이 오간다', () => {
    const s = mk();
    s.voidTimer = 1e9;
    wait(s, 3);
    const unit = CX.playerAttackDamage;
    expect(s.enemy.maxHp - s.enemy.hp).toBeCloseTo(3 * unit);
    expect(s.player.hp).toBeLessThan(s.player.maxHp);
    const hits = drainCombatEvents(s).filter((e) => e.kind === 'enemy-attack');
    expect(hits).toHaveLength(2);
  });

  it('적 체력은 "플레이어 기본 공격 N회 분량" (CLAUDE.md 규칙 3)', () => {
    const s = mk();
    expect(s.enemy.maxHp).toBeCloseTo(normal.hpInAttacks * CX.hpAttackScale * CX.playerAttackDamage);
    const grown = mk({ params: { growthMultiplier: 2 } });
    expect(grown.enemy.maxHp / s.enemy.maxHp).toBeCloseTo(2);
  });

  it('전투는 반드시 끝난다 (승 또는 패), 한 조우마다 체력은 새로 시작', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = playCombatBot(mk({ seed, enemy: elite }));
      expect(['won', 'lost']).toContain(s.status);
      expect(mk({ seed }).player.hp).toBe(CX.playerMaxHp);
    }
  });
});

describe('블록 생성과 트레이', () => {
  it('트레이는 3열×2행 6칸, 슬롯이 비면 기본 블록만 생성된다', () => {
    const s = mk();
    expect(s.tray).toHaveLength(6);
    expect(blockSources(s.params).map((x) => x.id)).toEqual([BASIC_SKILL_ID]);
    s.voidTimer = 1e9;
    wait(s, CX.blockSpawnSeconds * 2);
    const blocks = s.tray.filter(Boolean);
    expect(blocks.length).toBe(2);
    expect(blocks.every((b) => b!.traitId === BASIC_SKILL_ID)).toBe(true);
  });

  it('슬롯 skill 특성마다 일정 간격(임시 4초)으로 블록이 생긴다', () => {
    const s = mk({ params: build('trait-a1', 'trait-b1') });
    s.voidTimer = 1e9;
    wait(s, CX.blockSpawnSeconds);
    const ids = s.tray.filter(Boolean).map((b) => b!.traitId).sort();
    expect(ids).toEqual(['trait-a1', 'trait-b1']);
  });

  it('트레이가 가득 차면 생성이 멈추고, 칸이 비면 다시 생긴다', () => {
    const s = mk({ params: build('trait-a1', 'trait-b1', 'trait-c1') });
    s.voidTimer = 1e9;
    s.player.hp = 1e9;
    wait(s, 30);
    expect(s.tray.every(Boolean)).toBe(true);
    const timers = [...s.spawnTimers];
    wait(s, 10);
    expect(s.spawnTimers).toEqual(timers);
    useAt(s, 0);
    wait(s, CX.blockSpawnSeconds);
    expect(s.tray.every(Boolean)).toBe(true);
  });
});

describe('이동과 합치기 (상하좌우 인접 규칙)', () => {
  it('빈 칸으로는 어디든 옮기고, 블록이 있는 칸과는 이웃일 때만 맞바꾼다', () => {
    const s = quiet(mk());
    s.tray[0] = blk('x');
    s.tray[5] = blk('y');
    expect(canMove(s.tray, 0, 4, 3)).toBe(true); // 빈 칸(대각선이어도)
    expect(canMove(s.tray, 0, 5, 3)).toBe(false); // 이웃 아닌 블록
    expect(applyInput(s, { type: 'move', from: 0, to: 2 })).toBe(true);
    expect(s.tray[2]!.traitId).toBe('x');
    expect(applyInput(s, { type: 'move', from: 2, to: 5 })).toBe(true); // 2와 5는 세로 이웃 → 맞바꿈
    expect(s.tray[2]!.traitId).toBe('y');
    expect(s.tray[5]!.traitId).toBe('x');
    expect(applyInput(s, { type: 'move', from: 1, to: 0 })).toBe(false); // 빈 칸에서 옮길 것은 없다
  });

  it('같은 특성 블록이 상하좌우로 이웃하면 합쳐져 체인 +1 (최대 3), 대각선·다른 특성은 안 된다', () => {
    const s = quiet(mk());
    s.tray[0] = blk(BASIC_SKILL_ID);
    s.tray[1] = blk(BASIC_SKILL_ID);
    s.tray[4] = blk(BASIC_SKILL_ID);
    s.tray[2] = blk('trait-a1');
    expect(canMerge(s.tray, 0, 4, 3, 3)).toBe(false); // 대각선
    expect(canMerge(s.tray, 1, 2, 3, 3)).toBe(false); // 다른 특성
    expect(applyInput(s, { type: 'merge', from: 0, to: 1 })).toBe(true);
    expect(s.tray[0]).toBeNull();
    expect(s.tray[1]!.chain).toBe(2);
    expect(applyInput(s, { type: 'merge', from: 4, to: 1 })).toBe(true);
    expect(s.tray[1]!.chain).toBe(3);
    s.tray[0] = blk(BASIC_SKILL_ID);
    expect(applyInput(s, { type: 'merge', from: 0, to: 1 })).toBe(false); // 최대 체인
  });

  it('필살·공허 블록은 합칠 수 없다', () => {
    const s = quiet(mk());
    s.tray[0] = blk(null, 1, 'void');
    s.tray[1] = blk(null, 1, 'void');
    s.tray[3] = blk(null, 1, 'special');
    s.tray[4] = blk(null, 1, 'special');
    expect(applyInput(s, { type: 'merge', from: 0, to: 1 })).toBe(false);
    expect(applyInput(s, { type: 'merge', from: 3, to: 4 })).toBe(false);
  });
});

describe('체인 배율과 SP·필살', () => {
  it('체인 효과 ×1.0 / ×2.2 / ×3.6', () => {
    const dmg = (chain: number) => {
      const s = quiet(mk());
      s.tray[0] = blk(BASIC_SKILL_ID, chain);
      const before = s.enemy.hp;
      useAt(s, 0);
      return before - s.enemy.hp;
    };
    const d1 = dmg(1);
    expect(d1).toBeCloseTo(CX.basicBlockPowerInAttacks * CX.playerAttackDamage);
    expect(dmg(2) / d1).toBeCloseTo(2.2);
    expect(dmg(3) / d1).toBeCloseTo(3.6);
  });

  it('체인3 은 특성별 추가 효과가 붙는다: stagger(적 행동 지연), reflect(막기 반사), cleanse(봉인 해제 + SP)', () => {
    const s = quiet(mk({ params: build('trait-a1', 'trait-b1', 'trait-c1') }));
    s.enemy.attackTimer = 10;
    s.tray[0] = blk('trait-a1', 2);
    useAt(s, 0);
    expect(s.enemy.attackTimer).toBe(10); // 체인2 는 추가 효과 없음
    s.tray[0] = blk('trait-a1', 3);
    useAt(s, 0);
    expect(s.enemy.attackTimer).toBe(10 + ticksOf(s.params, 1.5));
    s.tray[1] = blk('trait-b1', 3);
    useAt(s, 1);
    expect(s.guard.reflect).toBe(1);
    s.sealTicks = 30;
    const sp = s.sp;
    s.tray[2] = blk('trait-c1', 3);
    useAt(s, 2);
    expect(s.sealTicks).toBe(0);
    expect(s.sp).toBe(Math.min(CX.spMax, sp + CX.spPerBlock + 40));
    expect(s.chain3Count).toBe(3);
    expect(s.blocksByChain).toEqual([0, 1, 3]);
  });

  it('블록 하나 사용 → SP +20, SP 100 이면 필살 블록이 생기고 큰 피해를 준다', () => {
    const s = quiet(mk());
    for (let i = 0; i < 5; i++) {
      s.tray[0] = blk(BASIC_SKILL_ID);
      useAt(s, 0);
    }
    expect(s.sp).toBe(CX.spMax);
    step(s);
    const cell = s.tray.findIndex((b) => b?.kind === 'special');
    expect(cell).toBeGreaterThanOrEqual(0);
    expect(s.sp).toBe(0);
    const before = s.enemy.hp;
    useAt(s, cell);
    expect(before - s.enemy.hp).toBeCloseTo(CX.specialPowerInAttacks * CX.playerAttackDamage);
    expect(s.specialUsed).toBe(true);
    expect(s.sp).toBe(0); // 필살은 SP 를 주지 않는다
  });
});

describe('적 패턴: 강공격 예고·막기, 봉인', () => {
  const eliteQuiet = () => {
    const s = mk({ enemy: elite, params: build('trait-b1') });
    s.spawnTimers = [1e9];
    s.voidTimer = 1e9;
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
    expect(t.enemy.cast!.total).toBe(ticksOf(t.params, elite.pattern!.castSeconds));
    t.enemy.attackTimer = 1;
    wait(t, 1);
    expect(drainCombatEvents(t).some((e) => e.kind === 'enemy-attack')).toBe(false);
  });

  it('예고 중 guard 블록을 쓰면 강공격을 크게 줄이고(막기 성공), 안 쓰면 그대로 맞는다', () => {
    const hit = (guard: boolean) => {
      const s = eliteQuiet();
      castNow(s);
      if (guard) {
        s.tray[0] = blk('trait-b1');
        useAt(s, 0);
      }
      const before = s.player.hp;
      wait(s, elite.pattern!.castSeconds);
      const ev = drainCombatEvents(s).find((e) => e.kind === 'heavy-hit');
      return { s, taken: before - s.player.hp, ev };
    };
    const open = hit(false);
    const guarded = hit(true);
    expect(open.ev).toMatchObject({ guarded: false });
    expect(guarded.ev).toMatchObject({ guarded: true });
    expect(guarded.s.guardSuccesses).toBe(1);
    expect(open.s.guardSuccesses).toBe(0);
    const heavy = elite.pattern!.heavyInAttacks * CX.playerAttackDamage;
    expect(open.taken).toBeGreaterThan(heavy * (1 - CX.enemyDamageVariance) - 1e-9);
    expect(guarded.taken).toBeLessThan(heavy * (1 + CX.enemyDamageVariance) * (1 - CX.heavyGuardReduction) + 1e-9);
  });

  it('reflect 추가 효과가 붙은 막기는 막은 피해를 적에게 돌려준다', () => {
    const s = eliteQuiet();
    castNow(s);
    s.tray[0] = blk('trait-b1', 3);
    useAt(s, 0);
    const before = s.enemy.hp;
    wait(s, elite.pattern!.castSeconds);
    const ev = drainCombatEvents(s).find((e) => e.kind === 'heavy-hit');
    expect(ev && ev.kind === 'heavy-hit' && ev.reflected).toBeGreaterThan(0);
    expect(s.enemy.hp).toBeLessThan(before);
  });

  it('봉인: 정해진 시간 동안 스킬 블록 생성이 멈춘다', () => {
    const s = mk({ enemy: elite });
    s.voidTimer = 1e9;
    s.enemy.actionIndex = 1; // 다음 행동 = 봉인
    s.enemy.actionTimer = 1;
    s.spawnTimers = [5];
    step(s);
    expect(s.sealTicks).toBe(ticksOf(s.params, elite.pattern!.sealSeconds) - 0);
    wait(s, elite.pattern!.sealSeconds - 0.2);
    expect(s.tray.every((b) => b === null)).toBe(true);
    wait(s, 1);
    expect(s.tray.filter(Boolean)).toHaveLength(1);
  });
});

describe('약점·공허·시간 제한', () => {
  it('약점 계통의 스킬 블록은 위력 ×1.5, 다른 계통·기본 블록은 그대로', () => {
    const dmg = (traitId: string) => {
      const s = quiet(mk({ params: build('trait-a1', 'trait-b4', 'trait-c5') }));
      s.tray[0] = blk(traitId);
      const before = s.enemy.hp;
      useAt(s, 0);
      return before - s.enemy.hp;
    };
    // test-a 의 약점 = 계통 B. b4(B, 공격 4.5) vs a1(A, 공격 3.5)
    expect(normal.weaknessLineageId).toBe('lineage-b');
    expect(dmg('trait-b4')).toBeCloseTo(4.5 * CX.playerAttackDamage * CX.weaknessMultiplier);
    expect(dmg('trait-a1')).toBeCloseTo(3.5 * CX.playerAttackDamage);
  });

  it('공허 블록: 자연 생성되고, 쓰면 큰 피해 + 리스크 상승, 합칠 수 없고 두면 칸을 차지한다', () => {
    const s = mk({ params: { voidChance: 1, voidChanceMax: 1 } });
    s.spawnTimers = [1e9];
    wait(s, CX.voidCheckSeconds);
    const cell = s.tray.findIndex((b) => b?.kind === 'void');
    expect(cell).toBeGreaterThanOrEqual(0);
    wait(s, CX.voidCheckSeconds);
    expect(s.tray.filter((b) => b?.kind === 'void')).toHaveLength(2); // 쓰지 않으면 남는다
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
  it('안개: 트레이 블록이 주기적으로 섞인다', () => {
    const s = quiet(mk({ params: { trayShuffleSeconds: BALANCE.provisional.tiles.reshuffle.trayShuffleSeconds } }));
    s.tray = [blk('a'), blk('b'), blk('c'), null, null, null];
    const before = s.tray.map((b) => b?.traitId ?? null);
    wait(s, BALANCE.provisional.tiles.reshuffle.trayShuffleSeconds);
    expect(s.events.some((e) => e.kind === 'shuffle')).toBe(true);
    expect(s.tray.map((b) => b?.traitId ?? null)).not.toEqual(before);
    expect(s.tray.filter(Boolean)).toHaveLength(3);
  });

  it('황무지: 내 공격 위력(기본 공격·블록) ×1.3', () => {
    const k = BALANCE.provisional.tiles.power.playerPowerMultiplier;
    const s = quiet(mk({ params: { playerPowerMultiplier: k } }));
    s.tray[0] = blk(BASIC_SKILL_ID);
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
    const s = playCombatBot(mk({ seed: 9, enemy: elite, params: build('trait-a1', 'trait-b1', 'trait-c1') }));
    const save = newSaveData('hollow');
    recordBattle(save, buildBattleRecord(s, { factionId: save.factionId }));
    const rec = save.runLog.battles[0]!;
    expect(rec.won).toBe(s.status === 'won');
    expect(rec.durationSeconds).toBeCloseTo(elapsedSeconds(s), 1);
    expect(rec.blocksByChain.reduce((a, b) => a + b, 0)).toBe(s.skillsUsed.length);
    expect(Object.values(rec.blocksByTrait).reduce((a, b) => a + b, 0)).toBe(s.skillsUsed.length);
    expect(rec.chain3Count).toBe(s.chain3Count);
    expect(rec.guardSuccesses).toBe(s.guardSuccesses);
    expect(rec.voidUsed).toBe(s.voidUsed);
    expect(rec.specialUsed).toBe(s.specialUsed);
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
      runId: 1, lap: 2, turns: 7, matchesByRole: { damage: 3, spirit: 1, shield: 2, absorb: 4, risk: 1 }, won: true, skillsUsed: ['trait-a1'],
      enemyClass: 'normal', tierIndex: 0, enemyId: 'test-a', factionId: 'hollow', seed: 5, riskGained: 5, absorbGained: 4, lossReason: null,
    }];
    const m = migrateSave(JSON.parse(JSON.stringify(old)))!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.runLog.battles[0]).toMatchObject({
      turns: 7, matchesByRole: { damage: 3, absorb: 4 }, absorbGained: 4, skillsUsed: ['trait-a1'],
      durationSeconds: 0, blocksByTrait: {}, blocksByChain: [0, 0, 0], chain3Count: 0, guardSuccesses: 0, voidUsed: 0, specialUsed: false,
      finisherKind: null, finisherTraitId: null, finisherLineageId: null, absorbable: false,
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
    expect(h.role.attack).not.toBe(sh.role.attack);
    expect(h.specialBlock).not.toBe(sh.specialBlock);
    expect(h.riskGauge).toBe('광기');
    expect(sh.riskGauge).toBe('호로화');
    expect(h.defeatState).toBe('가면이 깨져 쇠약');
    expect(sh.defeatState).toBe('영력 고갈');
    expect(h.basicBlock).toBe('본체 능력');
    expect(sh.basicBlock).toBe('시해');
  });

  it('3번째 종족은 설정 객체 하나만으로 전투 텍스트가 나온다', () => {
    const quincy = parseFactionConfig({
      ...getFaction('hollow'),
      id: 'quincy',
      name: '퀸시',
      skillBlockName: '성문 블록',
      specialBlockName: '레이시',
      voidBlockName: '균열 블록',
      chainName: '연결',
      spName: '영자',
      roleNames: { attack: '광시', guard: '블루트', heal: '흡수' },
      riskGaugeName: '균열',
      basicSkillName: '성문',
    });
    const l = battleLabels(quincy);
    expect(l.role.guard).toBe('블루트');
    expect(l.specialBlock).toBe('레이시');
    expect(l.chain).toBe('연결');
    expect(l.sp).toBe('영자');
    expect(l.basicBlock).toBe('성문');
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
