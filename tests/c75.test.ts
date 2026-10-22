// C.75 (S-20, GDD 32장): 진화 = 진짜 강해짐(내 능력치 절대값) + 원정 난이도 ★ (적 세기·★ 열림·보상 배율·세이브 형식 29·런 로그)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { BOSSES } from '../src/data/bosses';
import { ENEMIES, getEnemy } from '../src/data/enemies';
import { GROUNDS } from '../src/data/grounds';
import { RANK_HOLDERS } from '../src/data/ranks';
import { STAT_IDS } from '../src/data/schema';
import { chapterContent, STORY_CHAPTERS } from '../src/data/story';
import { buildCombatParams, newBuild } from '../src/engine/absorb';
import { createCombat, enemyStatsOf, playerAttackSecondsOf, step, type CombatParams, type CombatState } from '../src/engine/combat';
import {
  applyDifficultyToParams, clampDifficulty, clampStreak, difficultyEnemyScale, difficultyFactor, difficultyGoldMultiplier, difficultyRefStat, difficultyRewardMultiplier, enemyAtDifficulty, MAX_DIFFICULTY, recommendedDifficulty, scaleEv, streakEnemyFactor, unlockedByTier,
} from '../src/engine/difficulty';
import { applyEvolutionToParams, currentStats, newEvolution, refStatOf, worldRefStat } from '../src/engine/evolution';
import {
  advance, buildRunRecord, chooseDifficulty, createExpedition, enemyScale, EXPEDITION_SNAPSHOT_VERSION, finishBattle, finishRest, lapScale, restoreExpedition, serializeExpedition, startBattle, type ExpeditionState,
} from '../src/engine/expedition';
import { difficultyLabels, difficultyText } from '../src/engine/faction';
import { getFaction } from '../src/data/factions';
import { defaultDifficulty, maxTierReached, migrateSave, newSaveData, performEvolution, performRebirth, recordExpedition, sanitizeDifficulty, SAVE_FORMAT_VERSION, settleStreak, streakFor, TRACK_KEYS, unlockDifficultyFor, type SaveData } from '../src/game';
import { difficultyInfo } from '../src/ui/planView';
import { PATCH_LABEL, STAGE_LABEL } from '../src/version';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SX = BALANCE.provisional.stats;
const DX = BALANCE.provisional.difficulty;
const WORLD = SX.tierTotals[0]! / STAT_IDS.length;
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'rest-a'];
const mk = (over: Partial<Parameters<typeof createExpedition>[0]> = {}) => createExpedition({ factionId: 'hollow', seed: 11, hunger: 10, condition: 100, deck: DECK, ...over });
function toBattle(exp: ExpeditionState): void {
  for (let i = 0; i < 200 && exp.phase !== 'battle'; i++) {
    if (exp.phase === 'moving') advance(exp);
    else if (exp.phase === 'rest') finishRest(exp);
    else break;
  }
}
function forceBattle(e: ExpeditionState, win: boolean): CombatState {
  const b = startBattle(e);
  if (win) b.enemy.hp = 1e-9;
  else b.player.hp = 1e-9;
  for (let i = 0; i < 400 && b.status === 'playing'; i++) step(b);
  return b;
}
/** 단계를 올린다 (진화 경로 흉내: 세이브 진화·도감 없이 상태만) */
function atTier(tierIndex: number) {
  const e = newEvolution();
  e.tierIndex = tierIndex;
  const ids = ['t2:base', 't3:base', 't4:fire', 't5:fire:physical'];
  e.formHistory = ids.slice(0, tierIndex);
  e.formId = tierIndex > 0 ? ids[tierIndex - 1]! : null;
  return e;
}

describe('버전·밸런스 (C.75)', () => {
  it('PATCH_LABEL C.75 이상, STAGE_LABEL S-20, BALANCE_VERSION 41 이상, 세이브 형식 29 이상', () => {
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(75);
    expect(STAGE_LABEL).toMatch(/^S-\d+$/); // C.77 에서 S-21, C.79 에서 S-22
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(41);
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(29);
  });
  it('종족값 합계 간격이 단계당 15% 이상 벌어졌다 (32-1 3번, 옛 +10%)', () => {
    for (let i = 1; i < SX.tierTotals.length; i++) expect(SX.tierTotals[i]! / SX.tierTotals[i - 1]!).toBeGreaterThanOrEqual(1.15);
    expect(SX.tierTotals[0]).toBe(300);
  });
});

describe('32-1 1번: 내 능력치는 절대값 (세계 기준 = 1단계 기준 능력치 50)', () => {
  it('세계 기준 = 50, applyEvolutionToParams 는 내 기준만 싣고 적 기준(refStat)은 건드리지 않는다', () => {
    expect(worldRefStat()).toBe(WORLD);
    expect(WORLD).toBe(50);
    const p: Partial<CombatParams> = {};
    applyEvolutionToParams(p, atTier(4), 'hollow');
    expect(p.playerRefStat).toBe(WORLD);
    expect(p.refStat).toBeUndefined();
  });
  it('5단계 몸의 최대 체력 = 기본 체력 × (체력 ÷ 50), 평타 간격 = 기본 ÷ (속도 ÷ 50) — 1단계보다 실제로 크고 빠르다', () => {
    const base = BALANCE.provisional.combat.playerMaxHp * BALANCE.provisional.combat.playerHpScale; // C.118: 내 최대 체력 배율
    const enemy = getEnemy('fire-basic');
    const hpAt = (tier: number) => {
      const params = buildCombatParams(newBuild(), 'hollow');
      applyEvolutionToParams(params, atTier(tier), 'hollow');
      const s = createCombat(1, { enemy, params });
      return { hp: s.player.maxHp, secs: playerAttackSecondsOf(s.params), st: currentStats(atTier(tier), 'hollow') };
    };
    const t1 = hpAt(0);
    const t5 = hpAt(4);
    expect(t1.hp).toBeCloseTo(base);
    expect(t5.hp).toBeCloseTo(base * (t5.st.hp / WORLD));
    expect(t5.hp).toBeGreaterThan(base * 1.5);
    expect(t5.secs).toBeCloseTo(BALANCE.provisional.combat.playerAttackSeconds * (WORLD / t5.st.spd));
    expect(t5.secs).toBeLessThan(t1.secs);
  });
});

describe('32-1 2번: 적의 세기 = 원정 난이도 ★', () => {
  it('★n 기준 능력치 = n단계 기준 능력치, k = ★1 대비 비, ★1 배율 = 1', () => {
    expect(MAX_DIFFICULTY).toBe(SX.tierTotals.length);
    for (let n = 1; n <= MAX_DIFFICULTY; n++) {
      expect(difficultyRefStat(n)).toBe(refStatOf(n - 1));
      expect(difficultyFactor(n)).toBeCloseTo(refStatOf(n - 1) / WORLD);
    }
    expect(difficultyEnemyScale(1)).toEqual({ hp: 1, attack: 1 });
    const k3 = difficultyFactor(3);
    expect(difficultyEnemyScale(3).hp).toBeCloseTo(1 + (k3 - 1) * DX.hpGrowth);
    expect(difficultyEnemyScale(3).attack).toBeCloseTo(1 + (k3 - 1) * DX.attackGrowth);
    expect(clampDifficulty(0)).toBe(1);
    expect(clampDifficulty(99)).toBe(MAX_DIFFICULTY);
    expect(clampDifficulty(NaN)).toBe(1);
    expect(recommendedDifficulty(2)).toBe(3);
    expect(unlockedByTier(4)).toBe(5);
  });
  it('전투 파라미터: applyDifficultyToParams 가 적 기준 능력치를 ★ 로, 적 능력치 = 기준 × 성향; enemyAtDifficulty 가 체력·공격 배율을 입힌다', () => {
    const p: Partial<CombatParams> = {};
    applyDifficultyToParams(p, 4);
    expect(p.refStat).toBe(refStatOf(3));
    const enemy = getEnemy('fire-heavy-seal');
    const st = enemyStatsOf({ refStat: refStatOf(3) }, enemy);
    expect(st.def).toBeCloseTo(refStatOf(3) * (enemy.statBias?.def ?? 1));
    const e4 = enemyAtDifficulty(enemy, 4);
    expect(e4.hpInAttacks).toBeCloseTo(enemy.hpInAttacks * difficultyEnemyScale(4).hp);
    expect(e4.attackInAttacks).toBeCloseTo(enemy.attackInAttacks * difficultyEnemyScale(4).attack);
    expect(e4.id).toBe(enemy.id);
  });
  it('같은 1단계 몸이 ★3 적과 싸우면 ★1 보다 적 체력·능력치가 크다 (같은 시드)', () => {
    const params = buildCombatParams(newBuild(), 'hollow');
    applyEvolutionToParams(params, atTier(0), 'hollow');
    const enemy = getEnemy('fire-basic');
    const at = (star: number) => {
      const q = { ...params };
      applyDifficultyToParams(q, star);
      return createCombat(3, { enemy: enemyAtDifficulty(enemy, star), params: q });
    };
    const a = at(1);
    const b = at(3);
    expect(b.enemy.maxHp).toBeGreaterThan(a.enemy.maxHp);
    expect(b.enemy.stats.def).toBeGreaterThan(a.enemy.stats.def);
    expect(b.player.maxHp).toBe(a.player.maxHp);
  });
  it('원정: 기본 ★ = 내 단계(권장), enemyScale = 바퀴 × 사냥터(×1) × ★, 적 체력에 그대로 붙는다', () => {
    expect(mk().difficulty).toBe(1);
    expect(mk({ evolution: atTier(2) }).difficulty).toBe(3);
    expect(mk({ evolution: atTier(2), difficulty: 1 }).difficulty).toBe(1);
    expect(mk({ difficulty: 99 }).difficulty).toBe(MAX_DIFFICULTY);
    const k = enemyScale(2, GROUNDS[0]!.id, 3);
    expect(k.hp).toBeCloseTo(lapScale(2).hp * difficultyEnemyScale(3).hp);
    expect(enemyScale(1, GROUNDS[0]!.id)).toEqual({ hp: 1, attack: 1 });
    const exp = mk({ difficulty: 3 });
    toBattle(exp);
    const p = exp.pending!;
    const base = ENEMIES.find((e) => e.id === p.enemy.id)!;
    expect(p.enemy.hpInAttacks).toBeCloseTo(base.hpInAttacks * enemyScale(exp.lap, exp.groundId, 3).hp);
    expect(p.params.refStat).toBe(refStatOf(2));
    expect(p.params.playerRefStat).toBe(WORLD);
  });
  it('chooseDifficulty: 출발 전에만, 연 ★ 안에서만, 정수 1~5 만, 스토리 화는 못 바꾼다', () => {
    const exp = mk();
    chooseDifficulty(exp, 2, 3);
    expect(exp.difficulty).toBe(2);
    expect(() => chooseDifficulty(exp, 4, 3)).toThrow();
    expect(() => chooseDifficulty(exp, 0)).toThrow();
    expect(() => chooseDifficulty(exp, 2.5)).toThrow();
    expect(() => chooseDifficulty(exp, MAX_DIFFICULTY + 1)).toThrow();
    chooseDifficulty(exp, MAX_DIFFICULTY);
    toBattle(exp);
    expect(() => chooseDifficulty(exp, 1)).toThrow();
    const st = mk({ story: { chapterId: 'ch1', episodeId: 'ep1' } });
    expect(() => chooseDifficulty(st, 2)).toThrow();
  });
});

describe('32-1 6·7번: 사냥터 강도 일원화, 스토리 화·보스·등급전 고정 ★', () => {
  it('사냥터 강도는 모두 ×1 (무대·속성·먹이만 담당)', () => {
    for (const g of GROUNDS) expect(g.strength, g.id).toEqual({ hp: 1, attack: 1 });
  });
  it('스토리 화마다 ★ 가 있고(1장 = ★1~★2), 원정은 화의 ★ 를 쓰며 보스 화의 ★ = 보스 데이터의 ★ (모래 아귀 ★2)', () => {
    for (const ch of STORY_CHAPTERS) {
      for (const fid of ['hollow', 'shinigami']) {
        const c = chapterContent(fid, ch.id);
        if (!c) continue;
        for (const ep of c.episodes) {
          expect(ep.difficulty, `${fid} ${ch.id}/${ep.id}`).toBeGreaterThanOrEqual(1);
          if (ch.id === 'ch1') expect(ep.difficulty).toBeLessThanOrEqual(2);
          if (ep.boss) expect(BOSSES.find((b) => b.id === ep.boss!.id)!.difficulty).toBe(ep.difficulty);
          const exp = mk({ story: { chapterId: ch.id, episodeId: ep.id }, evolution: atTier(4), difficulty: 5 });
          expect(exp.difficulty).toBe(ep.difficulty);
        }
      }
    }
    expect(BOSSES.find((b) => b.id === 'sand-maw')!.difficulty).toBe(2);
  });
  it('등급전 보유자: No.1 = ★5, 아래 번호일수록 낮거나 같다, 모두 1~5', () => {
    const byRank = [...RANK_HOLDERS].sort((a, b) => a.rank - b.rank);
    expect(byRank[0]!.difficulty).toBe(MAX_DIFFICULTY);
    for (let i = 1; i < byRank.length; i++) expect(byRank[i]!.difficulty).toBeLessThanOrEqual(byRank[i - 1]!.difficulty);
    for (const h of byRank) expect(h.difficulty).toBeGreaterThanOrEqual(1);
    expect(byRank[byRank.length - 1]!.difficulty).toBeLessThan(MAX_DIFFICULTY);
  });
});

describe('32-1 5·11번: 보상은 난이도 따라 — 먹이·노력치 ★당 +25%, 골드 ★당 +15% (재화 인플레 막기), 리스크는 그대로', () => {
  it('먹이·노력치 배율 = 1 + (★−1) × 0.25 (+ 연속 × 0.05), 골드 = 1 + (★−1) × 0.15 (+ min(연속 × 0.02, 0.2)), 노력치는 반올림', () => {
    expect(DX.rewardPerStar).toBe(0.25);
    expect(DX.goldPerStar).toBe(0.1); // 기획 +15% → 측정 뒤 +10% (GDD 32-2)
    expect(difficultyRewardMultiplier(1)).toBe(1);
    expect(difficultyRewardMultiplier(3)).toBeCloseTo(1.5);
    expect(difficultyRewardMultiplier(3, 4)).toBeCloseTo(1.7);
    expect(difficultyGoldMultiplier(1)).toBe(1);
    expect(difficultyGoldMultiplier(3)).toBeCloseTo(1.2);
    expect(difficultyGoldMultiplier(3, 4)).toBeCloseTo(1.28);
    expect(difficultyGoldMultiplier(5, 10)).toBeCloseTo(1.6);
    expect(difficultyGoldMultiplier(5, 99)).toBeCloseTo(1.6); // 연속 상한 10·골드 가산 상한 +20%
    expect(difficultyRewardMultiplier(5, 10)).toBeCloseTo(2.5);
    expect(scaleEv({ hp: 3, def: 2 }, 1)).toEqual({ hp: 3, def: 2 });
    expect(scaleEv({ hp: 3, def: 2 }, 3)).toEqual({ hp: 5, def: 3 });
    expect(scaleEv({ hp: 1 }, 2)).toEqual({ hp: 1 });
  });
  it('같은 시드 일반 적 승리 골드가 ★3 에서 ★1 의 1.2배, 연속 4 면 1.28배 (반올림) — 먹이 굴림 배율과 따로 간다', () => {
    const goldOf = (star: number, streak = 0) => {
      const exp = mk({ difficulty: star, streak });
      toBattle(exp);
      finishBattle(exp, forceBattle(exp, true));
      return exp.goldLoot.reduce((a, g) => a + g.amount, 0);
    };
    const g1 = goldOf(1);
    const g3 = goldOf(3);
    expect(g1).toBeGreaterThan(0);
    expect(g3).toBe(Math.round(g1 * 1.2));
    expect(goldOf(3, 4)).toBe(Math.round(g1 * 1.28));
  });
});

describe('32-1 4·8번: ★ 열림(세이브)·마이그레이션·런 로그', () => {
  it('새 세이브 = ★1 만 열림, 기본 선택 = 권장(내 단계), difficulty 는 트랙 필드', () => {
    const s = newSaveData('hollow', 1);
    expect(s.difficulty).toEqual({ unlocked: 1, last: 1, streak: { star: 1, count: 0 } });
    expect(defaultDifficulty(s)).toBe(1);
    expect(TRACK_KEYS).toContain('difficulty');
  });
  it('진화로 n단계에 닿으면 ★n 이 열리고(영구), 환생해도 남는다', () => {
    const s = newSaveData('hollow', 2);
    const need = BALANCE.provisional.evolution.stepsNeeded;
    for (let t = 0; t < 4; t++) {
      s.evolution.steps = need[t]!;
      expect(performEvolution(s, 1, { hunger: 30, condition: 80 }).ok).toBe(true);
      expect(s.difficulty.unlocked).toBe(t + 2);
    }
    expect(s.evolution.tierIndex).toBe(4);
    expect(defaultDifficulty(s)).toBe(5);
    s.difficulty.last = 3;
    const r = performRebirth(s, null, 5);
    expect(r.ok).toBe(true);
    expect(s.evolution.tierIndex).toBe(0);
    expect(s.difficulty.unlocked).toBe(5);
    expect(defaultDifficulty(s)).toBe(1); // 기본은 내 단계(권장)
    expect(unlockDifficultyFor(s)).toBe(false);
  });
  it('형식 28 세이브: 연 ★ = 최고 도달 단계(지금 단계·진화 기록·환생), 마지막 선택 = 권장, 쉬는 트랙도', () => {
    const s = newSaveData('hollow', 3) as unknown as Record<string, unknown>;
    delete s.difficulty;
    (s.meta as { format: number }).format = 28;
    const t = s as unknown as SaveData;
    t.evolution.tierIndex = 2;
    t.runLog.tiers.evolutions.push({ at: 1, fromTier: 2, toTier: 3, formId: 't4:fire', factionId: 'hollow', hidden: false, steps: 110 } as never);
    expect(maxTierReached(t)).toBe(3);
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.difficulty).toEqual({ unlocked: 4, last: 3, streak: { star: 1, count: 0 } });
    // 환생한 세이브는 5단계에 닿은 것
    const r = newSaveData('hollow', 4);
    r.rebirth.count = 1;
    delete (r as unknown as Record<string, unknown>).difficulty;
    r.meta.format = 28;
    expect(migrateSave(JSON.parse(JSON.stringify(r)))!.difficulty).toEqual({ unlocked: 5, last: 1, streak: { star: 1, count: 0 } });
    // 깨진 값 보정: 연 ★ 는 최고 단계 이상, 마지막 선택은 연 범위 안
    expect(sanitizeDifficulty({ ...newSaveData('hollow', 5), evolution: atTier(1), difficulty: { unlocked: 0, last: 9 } })).toEqual({ unlocked: 2, last: 2, streak: { star: 1, count: 0 } });
    expect(sanitizeDifficulty({ ...newSaveData('hollow', 5), difficulty: { unlocked: 4, last: 2, streak: { star: 3, count: 99 } } })).toEqual({ unlocked: 4, last: 2, streak: { star: 3, count: 10 } });
  });
  it('런 로그: 원정 기록에 ★, 원정 중간 저장(형식 7)이 ★ 를 왕복하고 이상한 ★ 는 이어하지 않는다', () => {
    const exp = mk({ difficulty: 2 });
    exp.phase = 'ended';
    exp.outcome = 'returned';
    exp.endReason = 'returned';
    expect(buildRunRecord(exp).difficulty).toBe(2);
    expect(EXPEDITION_SNAPSHOT_VERSION).toBeGreaterThanOrEqual(7);
    const e2 = mk({ difficulty: 3 });
    toBattle(e2);
    const snap = serializeExpedition(e2, 1, 1)!;
    const r = restoreExpedition(JSON.parse(JSON.stringify(snap)));
    expect(r.ok && r.exp.difficulty).toBe(3);
    const bad = JSON.parse(JSON.stringify(snap)) as { exp: { difficulty: number } };
    bad.exp.difficulty = MAX_DIFFICULTY + 1;
    expect(restoreExpedition(bad).ok).toBe(false);
  });
});

describe('32-1 9번: 종족 분기 없음·표시 문구는 종족 설정', () => {
  it('난이도 엔진·출발 화면 코드에 종족 id 문자열이 없다', () => {
    for (const p of ['src/engine/difficulty.ts', 'src/ui/planView.ts']) {
      const t = src(p);
      expect(t, p).not.toMatch(/['"`](hollow|shinigami)['"`]/);
      expect(t, p).not.toMatch(/faction(Id)?\s*===/);
    }
  });
  it('★ 표시·권장·잠김 문구는 종족 설정 difficulty (없으면 기본 문구)', () => {
    for (const fid of ['hollow', 'shinigami']) {
      const f = getFaction(fid);
      expect(f.difficulty?.star).toBe('★');
      expect(difficultyText(f, 3)).toBe('★3');
      expect(difficultyLabels(f).locked).toContain('{tier}');
    }
    expect(difficultyLabels({ difficulty: undefined })).toEqual({ name: '난이도', star: '★', recommended: '권장', locked: '{tier}단계에 열린다' });
  });
  it('출발 화면: ★ 버튼 5개(잠김 자물쇠·권장 태그), 상태 막대는 마지막 단계 기준으로 고정', () => {
    const pv = src('src/ui/planView.ts');
    expect(pv).toContain('chooseDifficulty');
    expect(pv).toContain("dataset.difficulty");
    expect(pv).toContain('MAX_DIFFICULTY');
    expect(pv).toContain('L.recommended');
    expect(src('src/ui/lcdScreens.ts')).toContain('refStatOf(BALANCE.provisional.stats.tierTotals.length - 1)');
  });
});

describe('32-1 10번: 연속 클리어 (같은 ★ 클리어마다 다음 원정 적 +5%, 최대 10, 지거나 ★를 바꾸면 0)', () => {
  it('적 배율 = 1 + 연속 × 0.05 (상한 10), enemyScale 에 곱해진다, 스토리 화는 0', () => {
    expect(DX.streak).toEqual({ enemyPerClear: 0.05, maxClears: 10, foodPerClear: 0.05, goldPerClear: 0.02, goldMaxBonus: 0.2 });
    expect(streakEnemyFactor(0)).toBe(1);
    expect(streakEnemyFactor(4)).toBeCloseTo(1.2);
    expect(streakEnemyFactor(99)).toBeCloseTo(1.5);
    expect(clampStreak(-3)).toBe(0);
    expect(clampStreak(2.7)).toBe(2);
    const k = enemyScale(1, GROUNDS[0]!.id, 2, 4);
    expect(k.hp).toBeCloseTo(difficultyEnemyScale(2).hp * 1.2);
    expect(k.attack).toBeCloseTo(difficultyEnemyScale(2).attack * 1.2);
    expect(mk({ difficulty: 2, streak: 4 }).streak).toBe(4);
    expect(mk({ streak: 99 }).streak).toBe(10);
    expect(mk({ story: { chapterId: 'ch1', episodeId: 'ep1' }, streak: 5 }).streak).toBe(0);
    const exp = mk({ difficulty: 2, streak: 4 });
    toBattle(exp);
    const base = ENEMIES.find((e) => e.id === exp.pending!.enemy.id)!;
    expect(exp.pending!.enemy.hpInAttacks).toBeCloseTo(base.hpInAttacks * enemyScale(exp.lap, exp.groundId, 2, 4).hp);
    exp.phase = 'ended';
    exp.outcome = 'returned';
    exp.endReason = 'returned';
    expect(buildRunRecord(exp).streak).toBe(4);
  });
  it('세이브: 귀환 +1(같은 ★만), 패배 0, 다른 ★로 떠나면 그 ★부터, 상한 10, 스토리 화는 건드리지 않는다', () => {
    const s = newSaveData('hollow', 9);
    const done = (star: number, outcome: 'returned' | 'defeated', story = false) => ({ difficulty: star, outcome, story: story ? ({} as never) : null });
    settleStreak(s, done(1, 'returned'));
    expect(s.difficulty.streak).toEqual({ star: 1, count: 1 });
    settleStreak(s, done(1, 'returned'));
    expect(streakFor(s, 1)).toBe(2);
    expect(streakFor(s, 2)).toBe(0);
    settleStreak(s, done(2, 'returned'));
    expect(s.difficulty.streak).toEqual({ star: 2, count: 1 });
    settleStreak(s, done(2, 'defeated'));
    expect(s.difficulty.streak).toEqual({ star: 2, count: 0 });
    for (let i = 0; i < 15; i++) settleStreak(s, done(2, 'returned'));
    expect(s.difficulty.streak.count).toBe(10);
    settleStreak(s, done(1, 'returned', true));
    expect(s.difficulty.streak).toEqual({ star: 2, count: 10 });
    // recordExpedition 이 실제로 부른다
    const t = newSaveData('hollow', 10);
    const exp = mk({ difficulty: 1, deck: t.tiles.deck });
    exp.phase = 'ended';
    exp.outcome = 'returned';
    exp.endReason = 'returned';
    exp.lapsCompleted = 1;
    recordExpedition(t, exp, 1);
    expect(t.difficulty.streak).toEqual({ star: 1, count: 1 });
    expect(t.runLog.runs[0]!.streak).toBe(0);
  });
  it('원정 중간 저장이 연속 수를 왕복하고, 상한을 넘는 값은 이어하지 않는다', () => {
    const e = mk({ difficulty: 2, streak: 3 });
    toBattle(e);
    const snap = serializeExpedition(e, 1, 1)!;
    const r = restoreExpedition(JSON.parse(JSON.stringify(snap)));
    expect(r.ok && r.exp.streak).toBe(3);
    const bad = JSON.parse(JSON.stringify(snap)) as { exp: { streak: number } };
    bad.exp.streak = 11;
    expect(restoreExpedition(bad).ok).toBe(false);
  });
  it('출발 화면 한 줄: "★3 · 연속 4 · 권장: 적은 3단계(아쥬커스) 기준 +20% · 먹이·노력치 +70% · 골드 +28%"', () => {
    const f = getFaction('hollow');
    expect(difficultyInfo(f, 3, 2, 4)).toBe('★3 · 연속 4 · 권장: 적은 3단계(아쥬커스) 기준 +20% · 먹이·노력치 +70% · 골드 +28%');
    expect(difficultyInfo(f, 1, 0, 0)).toBe('★1 · 권장: 적은 1단계(호로) 기준');
    expect(src('src/ui/planView.ts')).toContain('h.streak');
  });
});

