// C.120 (GDD 64·67장): 타일 0장 시작 · 첫 진화 3장 · 상점 타일 뽑기(확률·첫 뽑기 환경) · 첫 원정 튜토리얼(고정 길·첫 흡수는 흡수 아님·전 능력치 +3) · 런 로그 · 1회성
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { GUIDES, guideVars, helpVars, renderHelpText } from '../src/data/help';
import { STAT_IDS } from '../src/data/schema';
import { getTile } from '../src/data/tiles';
import { getEnemy } from '../src/data/enemies';
import { evCaps } from '../src/engine/evolution';
import {
  advance, chooseAbsorb, chooseRelease, createExpedition, enemyScale, finishBattle, playExpedition, startBattle, summarize, tutorialAbsorb, type ExpeditionState,
} from '../src/engine/expedition';
import type { CombatState } from '../src/engine/combat';
import { GUIDE_IDS, guidePending, markGuideDone, sanitizeHelpState } from '../src/engine/tutorial';
import {
  firstRunPending, grantStarterTiles, loadSave, MIN_LOADABLE_SAVE_FORMAT, newSaveData, nextRunId, performEvolution, recordExpedition, SAVE_FORMAT_VERSION, tilesUnlocked, writeSave, type SaveData,
} from '../src/game';
import { buyShopItem, goldRows, rollTileDraw, tileDrawGroup, tileDrawOdds, TILES_LOCKED_TEXT } from '../src/shop';

const TD = BALANCE.provisional.tileDraw;
const TUT = BALANCE.provisional.tutorialRun;
const PX = BALANCE.provisional.expedition;
const H = getFaction('hollow');
const S = getFaction('shinigami');

const autoWin = (s: CombatState) => {
  s.enemy.hp = 0;
  s.status = 'won';
  s.finisher = { kind: 'basic-attack', traitId: null, element: null };
};
const tutorialExp = (save: SaveData, seed = 11): ExpeditionState => createExpedition({
  factionId: save.factionId, seed, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition, deck: [], risk: save.nest.risk, stability: save.nest.stability,
  build: save.build, evolution: save.evolution, tutorial: true,
});
/** 걷기 → 정해진 칸 전투(승리 처리)까지 */
const walkToBattle = (exp: ExpeditionState): number => {
  let moves = 0;
  while (exp.phase === 'moving') {
    advance(exp);
    moves++;
  }
  return moves;
};

describe('64장 1번: 시작 타일 0장 · 첫 진화 3장', () => {
  it('새 세이브는 타일 0장·덱 비어 있음·잠김, 세이브 형식 37 · 문턱 37', () => {
    const s = newSaveData('hollow', 1);
    expect(s.tiles).toEqual({ collection: {}, deck: [], unlocked: false, draws: 0 });
    expect(tilesUnlocked(s)).toBe(false);
    expect(SAVE_FORMAT_VERSION).toBe(37);
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(SAVE_FORMAT_VERSION);
  });

  it('첫 진화(1→2단계) 때 먹잇감 둥지 A·강적 소굴 A·휴식 1장씩 → 보관함·덱, 타일 안내 차례. 두 번째 진화엔 더 안 준다', () => {
    const s = newSaveData('hollow', 2);
    s.evolution.steps = 999;
    const r = performEvolution(s, 0);
    expect(r.ok).toBe(true);
    expect(s.evolution.tierIndex).toBe(1);
    expect(s.tiles.collection).toEqual({ 'prey-nest-a': 1, 'elite-den-a': 1, 'rest-a': 1 });
    expect(s.tiles.deck).toEqual(PX.starterTiles);
    expect(s.tiles.unlocked).toBe(true);
    expect(guidePending(s.help, 'tile-intro')).toBe(true);
    expect(guidePending(s.help, 'tile-plan')).toBe(true);
    s.evolution.steps = 999;
    expect(performEvolution(s, 0).ok).toBe(true);
    expect(Object.values(s.tiles.collection).reduce((a, b) => a + b, 0)).toBe(3);
    expect(grantStarterTiles(s)).toEqual([]);
  });

  it('사신도 같은 3종(종족 스킨 이름이 있는 기본 타일)', () => {
    const s = newSaveData('shinigami', 3);
    expect(grantStarterTiles(s)).toEqual(['prey-nest-a', 'elite-den-a', 'rest-a']);
  });

  it('타일 잠김 원정: 드래프트(이벤트 타일 포함)가 안 나오고 빈 길을 돈다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const e = playExpedition(createExpedition({ factionId: 'hollow', seed, hunger: 20, condition: 80, deck: [], tileVariants: true, tilesLocked: true }), { returnAfterLap: 4, playBattle: autoWin });
      expect(e.variantLog.drafts).toEqual([]);
      expect(e.variantLog.events).toEqual([]);
      expect(e.acquired).toEqual([]);
      expect(e.battles.length).toBeGreaterThan(0);
    }
  });
});

describe('64장 2번: 상점 타일 뽑기', () => {
  const rich = (fid = 'hollow') => {
    const s = newSaveData(fid, 4);
    s.shared.tradeCoins = 100000;
    return s;
  };

  it('첫 진화 전에는 잠김("첫 진화 후 열림"), 열리면 가격 = balance', () => {
    const s = rich();
    const row = goldRows(s, H).find((r) => r.id === 'tile-draw')!;
    expect(row).toMatchObject({ canBuy: false, lock: TILES_LOCKED_TEXT, price: TD.price });
    expect(buyShopItem(s, H, 'tile-draw').ok).toBe(false);
    grantStarterTiles(s);
    expect(goldRows(s, H).find((r) => r.id === 'tile-draw')!.canBuy).toBe(true);
  });

  it('첫 뽑기는 환경 타일 확정, 중복은 장수 +1, 구매 기록에 결과', () => {
    const s = rich();
    grantStarterTiles(s);
    const r = buyShopItem(s, H, 'tile-draw', 5, () => 0.99);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.firstDraw).toBe(true);
    expect(getTile(r.tile!).kind).toBe('environment');
    expect(s.tiles.draws).toBe(1);
    expect(s.shared.tradeCoins).toBe(100000 - TD.price);
    expect(s.runLog.shopPurchases.at(-1)).toMatchObject({ itemId: 'tile-draw', price: TD.price, result: r.tile });
    // 같은 굴림 = 같은 타일 → 장수 +1 (덱에는 안 들어간다)
    const deck = [...s.tiles.deck];
    const again = buyShopItem(s, H, 'tile-draw', 6, () => 0); // 기본 묶음 첫 타일
    expect(again.ok && again.tile).toBe('prey-nest-a');
    expect(s.tiles.collection['prey-nest-a']).toBe(2);
    expect(s.tiles.deck).toEqual(deck);
  });

  it('확률 = 기본 50 · 환경 35 · B형 15 (호로), 사신은 B형이 없어 남은 비율로', () => {
    expect(tileDrawOdds('hollow', false)).toEqual({ basic: 0.5, env: 0.35, b: 0.15 });
    expect(tileDrawOdds('hollow', true)).toEqual({ env: 1 });
    const sh = tileDrawOdds('shinigami', false);
    expect(Object.keys(sh)).toEqual(['basic', 'env']);
    expect(sh.basic! + sh.env!).toBeCloseTo(1);
    expect(sh.basic! / sh.env!).toBeCloseTo(50 / 35);
    expect(tileDrawGroup('env', 'hollow').sort()).toEqual(['env-fog', 'env-wasteland']);
    expect(tileDrawGroup('env', 'shinigami').sort()).toEqual(['env-barrier', 'env-ruin']);
    expect(tileDrawGroup('b', 'hollow')).toEqual(['prey-nest-b', 'elite-den-b']);
  });

  it('많이 뽑으면 묶음 비율이 확률에 가깝다 (2만 회)', () => {
    let x = 12345;
    const rand = () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 2 ** 32);
    const n = 20000;
    const by: Record<string, number> = { basic: 0, env: 0, b: 0 };
    const group = (id: string) => (TD.groups.basic!.includes(id) ? 'basic' : TD.groups.b!.includes(id) ? 'b' : 'env');
    for (let i = 0; i < n; i++) by[group(rollTileDraw('hollow', false, rand))]!++;
    expect(by.basic! / n).toBeCloseTo(0.5, 1);
    expect(by.env! / n).toBeCloseTo(0.35, 1);
    expect(by.b! / n).toBeCloseTo(0.15, 1);
    for (let i = 0; i < 50; i++) expect(getTile(rollTileDraw('shinigami', i === 0, rand)).name.shinigami).toBeTruthy();
  });
});

describe('67장: 첫 원정 튜토리얼', () => {
  it('새 세이브만 첫 원정 튜토리얼 차례 — 첫 원정이 지난 세이브에는 안 뜬다', () => {
    const s = newSaveData('hollow', 5);
    expect(firstRunPending(s)).toBe(true);
    s.runLog.runs.push({ runId: 1 } as never);
    expect(firstRunPending(s)).toBe(false); // 이미 원정을 다녀온 세이브
  });

  it('고정 길: 1바퀴·★1·기본 사냥터·타일 변수 끔·보스 없음, 정해진 칸에서 약한 적 1마리', () => {
    const s = newSaveData('hollow', 6);
    const e = tutorialExp(s);
    expect([e.tutorial, e.maxLaps, e.difficulty, e.tileVariants, e.freeBoss, e.story, e.tilesLocked]).toEqual([true, 1, 1, false, null, null, true]);
    expect(e.wildCells).toEqual([TUT.cell]);
    const moves = walkToBattle(e);
    expect(moves).toBe(TUT.cell);
    expect(e.phase).toBe('battle');
    expect(e.pending!.cell).toBe(TUT.cell);
    expect(e.pending!.enemy.class).toBe('normal');
    // 약한 적: 출현 풀의 그 적(★1·1바퀴·기본 사냥터 배율) × 튜토리얼 체력·공격 배율
    const base = getEnemy(e.pending!.enemy.id);
    const k = enemyScale(1, e.groundId, 1, 0, 'normal');
    expect(e.pending!.enemy.hpInAttacks).toBeCloseTo(base.hpInAttacks * k.hp * TUT.enemyHpMult);
    expect(e.pending!.enemy.attackInAttacks).toBeCloseTo(base.attackInAttacks * k.attack * TUT.enemyAttackMult);
    expect(TUT.enemyHpMult).toBeLessThan(1);
  });

  it('승리하면 늘 흡수 화면 → 첫 흡수는 흡수가 아니다: 흡수 수·속성 카운트·특성·리스크·흡수 기록·보상 타일 없음, 노력치 6종 +3', () => {
    const s = newSaveData('hollow', 7);
    const e = tutorialExp(s);
    walkToBattle(e);
    const battle = startBattle(e);
    autoWin(battle);
    finishBattle(e, battle);
    expect(e.phase).toBe('absorb');
    const riskBefore = e.risk;
    const ownedBefore = [...e.build.owned];
    const evBefore = { ...e.evolution.ev };
    expect(tutorialAbsorb(e).ok).toBe(true);
    expect(e.phase).toBe('ended');
    expect(e.endReason).toBe('tutorial-clear');
    expect(e.outcome).toBe('returned');
    expect(e.evolution.absorbs).toBe(0);
    expect(e.evolution.elementAbsorbs).toEqual({});
    expect(e.build.owned).toEqual(ownedBefore);
    expect(e.risk).toBe(riskBefore);
    expect(e.absorbRecords).toEqual([]);
    expect(e.acquired).toEqual([]);
    for (const k of STAT_IDS) expect(e.evolution.ev[k] - evBefore[k]).toBe(TUT.statEv);
    // 1단계 상한(합 24·능력치당 12) 안
    const cap = evCaps(0);
    expect(cap.total).toBe(24);
    expect(TUT.statEv * STAT_IDS.length).toBeLessThanOrEqual(cap.total);
    expect(TUT.statEv).toBeLessThanOrEqual(cap.perStat);
    expect(summarize(e).laps).toBe(1);
  });

  it('흡수 화면에서 어떤 갈래·놓아주기를 골라도 튜토리얼 보상으로 처리된다 (봇·화면 공통)', () => {
    for (const pick of [(e: ExpeditionState) => chooseAbsorb(e, null, undefined, 'stat'), (e: ExpeditionState) => chooseRelease(e), (e: ExpeditionState) => chooseAbsorb(e, e.absorbOffer!.candidates[0] ?? null, undefined, 'both')]) {
      const e = tutorialExp(newSaveData('hollow', 8));
      walkToBattle(e);
      const b = startBattle(e);
      autoWin(b);
      finishBattle(e, b);
      expect(pick(e).ok).toBe(true);
      expect(e.tutorialReward?.ev).toEqual(Object.fromEntries(STAT_IDS.map((k) => [k, TUT.statEv])));
      expect(e.absorbRecords).toEqual([]);
      expect(e.build.owned).toEqual([]);
      expect(e.evolution.releases).toBe(0);
    }
  });

  it('귀환 정산: 런 로그 흡수 기록 0, 튜토리얼 보상 1건(따로), 원정 기록 tutorial, 노력치 +3 은 세이브에, 방 안내 차례 · 다시 안 뜸 · 저장 왕복', () => {
    const s = newSaveData('hollow', 9);
    const e = playExpedition(tutorialExp(s, 21), { returnAfterLap: 1, absorb: 'absorb', playBattle: autoWin });
    recordExpedition(s, e, 1234);
    expect(s.runLog.absorbs).toEqual([]);
    expect(s.runLog.tutorialRewards).toHaveLength(1);
    expect(s.runLog.tutorialRewards[0]).toMatchObject({ at: 1234, kind: 'first-absorb', factionId: 'hollow', tierIndex: 0, ev: Object.fromEntries(STAT_IDS.map((k) => [k, TUT.statEv])) });
    expect(s.runLog.runs).toHaveLength(1);
    expect(s.runLog.runs[0]).toMatchObject({ tutorial: true, endReason: 'tutorial-clear', outcome: 'returned' });
    for (const k of STAT_IDS) expect(s.evolution.ev[k]).toBe(TUT.statEv);
    expect(s.evolution.absorbs).toBe(0);
    expect(firstRunPending(s)).toBe(false);
    expect(s.help.guides['first-run']).toBe('done');
    expect(guidePending(s.help, 'first-run-room')).toBe(true);
    // 첫 진화 전이라 타일은 여전히 0장
    expect(s.tiles.collection).toEqual({});
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    writeSave(st, s);
    expect(loadSave(st)).toEqual(s);
  });

  it('흡수 봇: 튜토리얼 원정을 실제 전투로 이긴다 (20시드) — 약한 적', () => {
    let won = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const e = playExpedition(tutorialExp(newSaveData('hollow', seed), seed * 31), { returnAfterLap: 1, absorb: 'absorb' });
      if (e.endReason === 'tutorial-clear') won++;
    }
    expect(won).toBe(20);
  });

  it('튜토리얼이 아닌 원정의 흡수는 그대로 흡수다', () => {
    const e = createExpedition({ factionId: 'hollow', seed: 3, hunger: 20, condition: 80, deck: [] });
    expect(tutorialAbsorb(e).ok).toBe(false);
  });
});

describe('안내 (GDD 64장 3번 · 67장 2·4번)', () => {
  it('안내 장면 2~3줄 · 자리표시자가 두 종족 모두 채워진다 (종족 분기 없음)', () => {
    for (const f of [H, S]) {
      const vars = { ...helpVars(f), ...guideVars(f) };
      for (const [id, scenes] of Object.entries(GUIDES)) {
        expect(scenes.length, id).toBeGreaterThan(0);
        for (const sc of scenes) {
          const body = renderHelpText(sc.body, vars);
          expect(body.length, `${id}/${sc.id}`).toBeLessThan(160);
          expect(renderHelpText(sc.title, vars)).not.toContain('{');
        }
      }
    }
    expect(renderHelpText(GUIDES['tile-plan'][2]!.body, { ...helpVars(H), ...guideVars(H) })).toContain('오아시스');
    expect(renderHelpText(GUIDES['tile-plan'][2]!.body, { ...helpVars(S), ...guideVars(S) })).toContain('샘터');
    expect(renderHelpText(GUIDES['first-absorb'][2]!.body, { ...helpVars(H), ...guideVars(H) })).toContain(`+${TUT.statEv}`);
  });

  it('안내는 1회성: 본 것으로 저장하면 다시 차례가 아니고, 저장 값은 보정된다', () => {
    const s = newSaveData('hollow', 10);
    expect(guidePending(s.help, 'first-run')).toBe(true);
    markGuideDone(s.help, 'first-run');
    expect(guidePending(s.help, 'first-run')).toBe(false);
    expect(firstRunPending(s)).toBe(false);
    grantStarterTiles(s);
    markGuideDone(s.help, 'tile-intro');
    expect(guidePending(s.help, 'tile-intro')).toBe(false);
    expect(sanitizeHelpState(JSON.parse(JSON.stringify(s.help)))).toEqual(s.help);
    expect([...GUIDE_IDS].sort()).toEqual(['first-run', 'first-run-room', 'tile-draw', 'tile-intro', 'tile-plan']);
  });
});
