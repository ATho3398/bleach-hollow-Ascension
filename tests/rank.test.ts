// 등급전 (GDD 21장, C.49): 번호 사다리·도전 규칙·재도전 대기·등급 이력·세이브 반영·영혼 결정(22-3)
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { RANK_COUNT, RANK_HOLDERS } from '../src/data/ranks';
import { FACTIONS } from '../src/data/factions';
import { createCombat, type CombatState } from '../src/engine/combat';
import { createExpedition } from '../src/engine/expedition';
import {
  applyChallenge, canChallenge, challengeTarget, holderAt, newRankState, PLAYER_ID, rankOf, rankUnlocked, resetRankKeepHistory, sanitizeRankState,
} from '../src/engine/rank';
import { loadSave, migrateSave, newSaveData, rankChallenge, recordExpedition, recordRankBattle, SAVE_FORMAT_VERSION, writeSave } from '../src/game';

const UNLOCK = BALANCE.rank.unlockTierIndex;

describe('번호 보유자 데이터 (provisional)', () => {
  it('번호 1~10 에 한 명씩, 원정 적과 별개, 흡수 노력치 없음', () => {
    expect(RANK_HOLDERS).toHaveLength(RANK_COUNT);
    expect(RANK_HOLDERS.map((h) => h.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const h of RANK_HOLDERS) {
      expect(h.provisional).toBe(true);
      expect(h.pattern && ['heavy-seal', 'heavy-chain', 'stance'].includes(h.pattern.kind)).toBe(true);
      expect(Object.keys(h.ev)).toHaveLength(0);
    }
  });
  it('위 번호일수록 강하다 (같은 패턴끼리 체력·공격 N회분·능력치 성향이 줄지 않는다. 패턴마다 체감 난도가 달라 패턴 사이는 승률로 맞춤 — npm run balance)', () => {
    const bias = (h: (typeof RANK_HOLDERS)[number]) => (h.statBias?.atk ?? 1) + (h.statBias?.def ?? 1) + (h.statBias?.spr ?? 1);
    for (let i = 0; i < RANK_HOLDERS.length; i++) {
      for (let j = i + 1; j < RANK_HOLDERS.length; j++) {
        const [up, down] = [RANK_HOLDERS[i]!, RANK_HOLDERS[j]!];
        expect(bias(up)).toBeGreaterThanOrEqual(bias(down));
        if (up.pattern?.kind !== down.pattern?.kind) continue;
        expect(up.hpInAttacks).toBeGreaterThanOrEqual(down.hpInAttacks);
        expect(up.attackInAttacks).toBeGreaterThanOrEqual(down.attackInAttacks);
      }
    }
    expect(RANK_HOLDERS[0]!.pattern?.kind).toBe(RANK_HOLDERS[9]!.pattern?.kind);
    expect(RANK_HOLDERS[0]!.hpInAttacks).toBeGreaterThan(RANK_HOLDERS[9]!.hpInAttacks * 1.2);
  });
  it('종족 설정에 번호 1~10 표시 이름·무번호 이름·문구가 있다 (엔진은 번호만)', () => {
    for (const f of FACTIONS) {
      expect(f.rankNames).toHaveLength(RANK_COUNT);
      for (const k of ['unrankedName', 'rankBattleName', 'rankWinText', 'rankLoseText'] as const) expect(f[k].length).toBeGreaterThan(0);
    }
  });
});

describe('사다리 규칙 (GDD 21-1 v4.4)', () => {
  it('처음: NPC 는 처음 번호 순, 나는 무번호. 도전 상대는 No.10', () => {
    const r = newRankState();
    expect(r.ladder).toHaveLength(RANK_COUNT + 1);
    expect(rankOf(r)).toBeNull();
    for (const h of RANK_HOLDERS) expect(rankOf(r, h.id)).toBe(h.rank);
    expect(challengeTarget(r)).toEqual({ opponentId: holderAt(r, 10), targetRank: 10 });
  });
  it('해금: 아란칼(5단계) 전에는 도전할 수 없다', () => {
    const r = newRankState();
    expect(rankUnlocked(UNLOCK - 1)).toBe(false);
    expect(canChallenge(r, UNLOCK - 1, 0)).toEqual({ ok: false, reason: 'locked' });
    expect(canChallenge(r, UNLOCK, 0)).toMatchObject({ ok: true, targetRank: 10 });
  });
  it('이기면 그 번호를 뺏고 상대는 한 칸 내려간다. 바로 위 1칸씩만', () => {
    const r = newRankState();
    const no10 = holderAt(r, 10)!;
    const res = applyChallenge(r, true, 0, 100);
    expect(res).toMatchObject({ won: true, before: null, after: 10, opponentId: no10, opponentBefore: 10, opponentAfter: null, firstRanked: true });
    expect(rankOf(r)).toBe(10);
    const no9 = holderAt(r, 9)!;
    applyChallenge(r, true, 0, 200);
    expect(rankOf(r)).toBe(9);
    expect(rankOf(r, no9)).toBe(10);
    expect(rankOf(r, no10)).toBeNull(); // 처음 상대는 무번호로 밀려 있다
    expect(r.history).toEqual({ everRanked: true, best: 9, firstRankedAt: 100 });
  });
  it('지면 한 칸 하락: No.10 에서 지면 무번호, 무번호에서 지면 그대로', () => {
    const r = newRankState();
    applyChallenge(r, true, 0);
    applyChallenge(r, true, 0);
    expect(rankOf(r)).toBe(9);
    expect(applyChallenge(r, false, 0)).toMatchObject({ before: 9, after: 10 });
    expect(applyChallenge(r, false, 0)).toMatchObject({ before: 10, after: null });
    expect(applyChallenge(r, false, 0)).toMatchObject({ before: null, after: null });
    expect(r.wins).toBe(2);
    expect(r.losses).toBe(3);
    // 번호를 잃어도 등급 이력은 남는다
    expect(r.history.everRanked).toBe(true);
    expect(r.history.best).toBe(9);
  });
  it('진 상대에게 재도전은 다음 원정을 한 번 다녀온 뒤', () => {
    const r = newRankState();
    const no10 = holderAt(r, 10)!;
    applyChallenge(r, false, 3); // 무번호에서 짐: 상대는 그대로 No.10
    expect(canChallenge(r, UNLOCK, 3)).toEqual({ ok: false, reason: 'rematch', opponentId: no10 });
    expect(canChallenge(r, UNLOCK, 3 + BALANCE.rank.rematchAfterRuns)).toMatchObject({ ok: true, opponentId: no10 });
    applyChallenge(r, true, 4);
    expect(r.lostTo[no10]).toBeUndefined();
  });
  it('No.1 이면 더 도전할 상대가 없다', () => {
    const r = newRankState();
    for (let i = 0; i < RANK_COUNT; i++) applyChallenge(r, true, 0);
    expect(rankOf(r)).toBe(1);
    expect(r.history.best).toBe(1);
    expect(canChallenge(r, UNLOCK, 0)).toEqual({ ok: false, reason: 'top' });
    expect(() => applyChallenge(r, true, 0)).toThrow();
  });
  it('환생용 초기화: 사다리·전적은 처음으로, 등급 이력은 유지 (22-2 해방 자격)', () => {
    const r = newRankState();
    applyChallenge(r, true, 0, 5);
    const n = resetRankKeepHistory(r);
    expect(rankOf(n)).toBeNull();
    expect(n.wins).toBe(0);
    expect(n.history).toEqual({ everRanked: true, best: 10, firstRankedAt: 5 });
  });
  it('세이브 값 보정: 모르는 id·중복은 빼고 빠진 참가자는 채운다', () => {
    const fixed = sanitizeRankState({ ladder: ['zzz', PLAYER_ID, PLAYER_ID, RANK_HOLDERS[3]!.id], lostTo: { zzz: 1, [RANK_HOLDERS[0]!.id]: 2 }, history: { best: 4 } });
    expect(fixed.ladder).toHaveLength(RANK_COUNT + 1);
    expect(new Set(fixed.ladder).size).toBe(RANK_COUNT + 1);
    expect(rankOf(fixed)).toBe(4); // 빠진 NPC 는 처음 번호 자리로 돌아오고 남은 순서(나 → 보유자 D)는 지킨다
    expect(fixed.lostTo).toEqual({ [RANK_HOLDERS[0]!.id]: 2 });
    expect(fixed.history.everRanked).toBe(true);
    expect(sanitizeRankState(undefined)).toEqual(newRankState());
  });
});

describe('세이브 반영 (형식 15)', () => {
  const battleAgainst = (won: boolean): CombatState => {
    const s = createCombat(42, { enemy: RANK_HOLDERS[9]! });
    s.status = won ? 'won' : 'lost';
    return s;
  };
  const aran = () => {
    const save = newSaveData('hollow', 0);
    Object.assign(save.evolution, { tierIndex: UNLOCK, formId: 't5:fire:physical' });
    return save;
  };
  it('등급전 승리: 번호·등급 이력·런 로그(등급전 기록 + 전투 기록 enemyClass rank)·영혼 결정 +3·등급 칭호', () => {
    const save = aran();
    expect(rankChallenge(save)).toMatchObject({ ok: true, targetRank: 10 });
    const r = recordRankBattle(save, battleAgainst(true), 777);
    expect(r).toMatchObject({ won: true, after: 10, firstRanked: true });
    expect(rankOf(save.rank)).toBe(10);
    expect(save.rank.history.everRanked).toBe(true);
    expect(save.runLog.rankBattles).toEqual([expect.objectContaining({ at: 777, won: true, rankBefore: null, rankAfter: 10, firstRanked: true, tierIndex: UNLOCK, formId: 't5:fire:physical', seed: 42 })]);
    expect(save.runLog.battles.at(-1)!.enemyClass).toBe('rank');
    expect(save.shared.soulCrystals).toBe(BALANCE.provisional.soulCrystals.perRankWin);
    expect(save.titles.find((t) => t.titleId === 'rank-1')).toMatchObject({ at: 777, trigger: 'rank' });
  });
  it('등급전 패배: 기록은 남고 영혼 결정은 없다, 재도전 대기', () => {
    const save = aran();
    recordRankBattle(save, battleAgainst(false), 1);
    expect(save.runLog.rankBattles[0]).toMatchObject({ won: false, rankAfter: null });
    expect(save.shared.soulCrystals).toBe(0);
    expect(rankChallenge(save)).toMatchObject({ ok: false, reason: 'rematch' });
  });
  it('원정에서 이긴 강적 수만큼 영혼 결정 +1 (진 강적·일반 적은 없음)', () => {
    const save = newSaveData('hollow', 0);
    const exp = createExpedition({ factionId: 'hollow', seed: 1, runId: 1, hunger: 0, condition: 100, deck: [], risk: 0, stability: 50, build: save.build, evolution: save.evolution });
    exp.phase = 'ended';
    exp.outcome = 'returned';
    exp.endReason = 'returned';
    const rec = (won: boolean, enemyClass: string) => ({ won, enemyClass }) as never;
    exp.battles.push(rec(true, 'elite'), rec(true, 'elite'), rec(false, 'elite'), rec(true, 'normal'));
    recordExpedition(save, exp, 0);
    expect(save.shared.soulCrystals).toBe(2 * BALANCE.provisional.soulCrystals.perElite);
  });
  it('형식 14 세이브 → 15: 무번호·등급 이력 없음·영혼 결정 0·등급전 기록 빈 목록', () => {
    const old = JSON.parse(JSON.stringify(newSaveData('shinigami', 0)));
    delete old.rank;
    delete old.shared;
    delete old.runLog.rankBattles;
    old.meta.format = 14;
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.rank).toEqual(newRankState());
    expect(m.shared.soulCrystals).toBe(0);
    expect(m.runLog.rankBattles).toEqual([]);
  });
  it('저장·불러오기 왕복: 사다리·이력·영혼 결정·등급전 기록이 그대로', () => {
    const save = aran();
    recordRankBattle(save, battleAgainst(true), 5);
    recordRankBattle(save, battleAgainst(false), 6);
    const mem: Record<string, string> = {};
    const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => void (mem[k] = v) };
    writeSave(storage, save);
    const loaded = loadSave(storage)!;
    expect(loaded.rank).toEqual(save.rank);
    expect(rankOf(loaded.rank)).toBeNull();
    expect(loaded.rank.history).toEqual({ everRanked: true, best: 10, firstRankedAt: 5 });
    expect(loaded.shared.soulCrystals).toBe(3);
    expect(loaded.runLog.rankBattles.map((r) => r.won)).toEqual([true, false]);
  });
});

describe('표시 이름 (종족 설정에서, 엔진은 번호만)', () => {
  it('번호 → rankNames, 무번호 → unrankedName', async () => {
    const { rankLabel } = await import('../src/ui/rankView');
    const { getFaction } = await import('../src/data/factions');
    expect(rankLabel(getFaction('hollow'), 10)).toBe('에스파다 No.10');
    expect(rankLabel(getFaction('hollow'), null)).toBe('무번호');
    expect(rankLabel(getFaction('shinigami'), 1)).toBe('대장');
    expect(rankLabel(getFaction('shinigami'), 10)).toBe('9석');
  });
});
