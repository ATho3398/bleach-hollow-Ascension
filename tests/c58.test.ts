// C.58 (S-14, GDD 25-3·25-4·25-7 v5.25): 보스 프레임(페이즈·기믹 seal·시간 제한·보상)과 스토리 1장(장·화·고정 길·목표·대화). 세이브 형식 22, 원정 중간 저장 형식 6
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { BOSSES, BOSS_GIMMICKS, bossName, findEnemyDef, getBoss } from '../src/data/bosses';
import { chapterContent, episodeKey, getEpisode, STORY_CHAPTERS, STORY_CONTENT } from '../src/data/story';
import { getTrait, TRAITS } from '../src/data/traits';
import { TITLES, titleName } from '../src/data/titles';
import { ENEMIES } from '../src/data/enemies';
import { applyInput, chainGroup, createCombat, step, type CombatState, type BossSetup } from '../src/engine/combat';
import {
  advance, bossSetupOf, buildRunRecord, chooseAbsorb, chooseContinue, chooseRelease, createExpedition, EXPEDITION_SNAPSHOT_VERSION, finishBattle, finishRest, playExpedition, restoreExpedition,
  serializeExpedition, startBattle, storyEpisodeOf, takeStoryCue, type ExpeditionState,
} from '../src/engine/expedition';
import { buildOffer, newBuild } from '../src/engine/absorb';
import { createRng } from '../src/engine/rng';
import {
  chapterOpen, episodeOpen, migrateSave, newSaveData, recordExpedition, sanitizeDeck, SAVE_FORMAT_VERSION, storyProgressOf, type SaveData,
} from '../src/game';
import { objectiveText, storyGoalLine } from '../src/ui/storyView';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const BX = BALANCE.provisional.boss;
const SX = BALANCE.provisional.story;

function storyExp(fid: string, ep: string, seed = 11, save: SaveData = newSaveData(fid, 1)): ExpeditionState {
  return createExpedition({ factionId: fid, seed, hunger: 20, condition: 80, deck: sanitizeDeck(save.tiles, fid), build: save.build, evolution: save.evolution, tileVariants: true, story: { chapterId: 'ch1', episodeId: ep } });
}

/** 전투를 강제로 끝낸다: 승리면 적 체력을 0 으로 */
function forceBattle(e: ExpeditionState, win: boolean): CombatState {
  const b = startBattle(e);
  if (win) b.enemy.hp = 1e-9;
  else b.player.hp = 1e-9;
  for (let i = 0; i < 400 && b.status === 'playing'; i++) step(b);
  return b;
}

/** 다음 전투까지 걷는다 (휴식·흡수는 넘김) */
function walkToBattle(e: ExpeditionState): void {
  for (let g = 0; g < 200 && e.phase !== 'battle' && e.phase !== 'ended'; g++) {
    if (e.phase === 'moving') advance(e);
    else if (e.phase === 'rest') finishRest(e);
    else if (e.phase === 'absorb') chooseRelease(e);
    else if (e.phase === 'nest-choice') throw new Error('둥지 칸');
  }
}

function bossCombat(gimmick: BossSetup['gimmick'] = 'seal', seed = 3): CombatState {
  const boss = getBoss('sand-maw');
  return createCombat(seed, { enemy: boss.enemy, boss: { ...bossSetupOf('sand-maw'), gimmick } });
}

describe('보스 데이터 (GDD 25-3·25-7)', () => {
  it('sand-maw: 두 종족 공유, 이름은 종족별, 체력 150회분, 페이즈 2 (50% 이하 공격 간격 −25%), 기믹 seal, 보스 특성', () => {
    expect(BOSSES.map((b) => b.id)).toEqual(['sand-maw', 'canyon-king', 'forest-lord']); // C.84: 2·3장 보스 추가
    const b = getBoss('sand-maw');
    expect(bossName('sand-maw', 'hollow')).toBe('모래 아귀');
    expect(bossName('sand-maw', 'shinigami')).toBe('들개 대허');
    expect(b.enemy.hpInAttacks).toBe(150);
    expect(b.enemy.class).toBe('elite');
    expect(b.phases).toEqual([{ belowHpFraction: 0.5, attackSecondsMult: 0.75 }]);
    expect(b.gimmick).toBe('seal');
    expect(BOSS_GIMMICKS).toEqual(['seal', 'summon', 'element', 'reflect']);
    const t = getTrait(b.trait);
    expect(t.boss).toBe(true);
    expect(t.rare).toBe(true);
    expect(BX.timeLimitSeconds).toBe(180);
    expect(BX.seal).toEqual({ everySeconds: 10, seconds: 4, cells: 1 });
    expect(BX.reward.gold).toBe(100);
    expect(BX.reward.firstJade).toBe(10);
    // 보스는 원정 출현 풀(적 테이블)에 없다 — 자유 원정 등장은 [미정]
    expect(ENEMIES.some((e) => e.id === 'sand-maw')).toBe(false);
  });
});

describe('보스 전투 엔진', () => {
  it('시간 제한 3분: 넘기면 시간 초과 패배', () => {
    const s = bossCombat();
    expect(s.params.timeLimitSeconds).toBe(180);
    s.player.hp = 1e9;
    s.player.maxHp = 1e9;
    for (let i = 0; i < 2000 && s.status === 'playing'; i++) step(s);
    expect(s.status).toBe('lost');
    expect(s.lossReason).toBe('timeout');
    expect(s.tick).toBe(Math.round(180 / s.params.tickSeconds));
  });

  it('페이즈: 체력 50% 이하가 되면 페이즈 2, 기본 공격 간격 ×0.75, 이벤트 한 번', () => {
    const s = bossCombat();
    expect(s.boss?.phase).toBe(1);
    s.enemy.hp = s.enemy.maxHp * 0.5 + 1;
    for (let i = 0; i < 300 && s.boss!.phase === 1; i++) step(s);
    expect(s.boss!.phase).toBe(2);
    expect(s.boss!.attackMult).toBe(0.75);
    const evs = s.events.filter((e) => e.kind === 'boss-phase');
    expect(evs).toEqual([{ kind: 'boss-phase', phase: 2 }]);
  });

  it('기믹 seal: 10초마다 블록 1칸을 4초 봉인 — 봉인된 블록은 누를 수 없고 체인으로 묶이지 않으며 4초 뒤 풀린다', () => {
    const s = bossCombat();
    s.player.hp = 1e9;
    s.player.maxHp = 1e9;
    const t10 = Math.round(10 / s.params.tickSeconds);
    for (let i = 0; i < t10; i++) step(s);
    const sealed = s.tray.filter((b) => (b.sealTicks ?? 0) > 0);
    expect(sealed).toHaveLength(1);
    expect(s.events.filter((e) => e.kind === 'cell-seal')).toHaveLength(1);
    const idx = s.tray.indexOf(sealed[0]!);
    const before = s.tray.length;
    expect(applyInput(s, { type: 'use', cell: idx })).toBe(false);
    expect(s.tray.length).toBe(before);
    // 옆 블록과 묶이지 않는다
    for (const i of [idx - 1, idx + 1]) if (s.tray[i]) expect(chainGroup(s.tray, i, 3)).not.toContain(idx);
    for (let i = 0; i < Math.round(4 / s.params.tickSeconds); i++) step(s);
    expect(sealed[0]!.sealTicks).toBe(0);
    expect(s.boss!.seals).toBe(1);
  });

  it('seal 이 아닌 기믹(summon·element·reflect)은 블록을 봉인하지 않는다', () => {
    for (const g of ['summon', 'element', 'reflect'] as const) {
      const s = bossCombat(g);
      s.player.hp = 1e9;
      s.player.maxHp = 1e9;
      for (let i = 0; i < 300; i++) step(s);
      expect(s.tray.some((b) => (b.sealTicks ?? 0) > 0)).toBe(false);
      expect(s.boss!.seals).toBe(0);
    }
  });

  it('일반 전투에는 보스 상태가 없고 결과가 그대로다 (같은 시드)', () => {
    const e = ENEMIES.find((x) => x.class === 'normal' && !x.testOnly)!;
    const a = createCombat(9, { enemy: e });
    const b = createCombat(9, { enemy: e });
    expect(a.boss).toBeUndefined();
    for (let i = 0; i < 500; i++) {
      step(a);
      step(b);
    }
    expect(a.enemy.hp).toBe(b.enemy.hp);
  });
});

describe('보스 특성 (흡수)', () => {
  it('보스 특성은 일반 흡수 후보에 나오지 않고, 보스를 이긴 흡수 화면에서 첫 후보로 확정된다', () => {
    const boss = getBoss('sand-maw');
    const input = { finisher: null, chain3Count: 0, weakChain3Count: 0, firstAbsorb: false } as never;
    for (let seed = 1; seed <= 200; seed++) {
      const o = buildOffer(createRng(seed), { ...boss.enemy, rare: true }, newBuild(), input);
      expect(o.candidates).not.toContain(boss.trait);
    }
    const o = buildOffer(createRng(5), boss.enemy, newBuild(), input, 0, boss.trait);
    expect(o.candidates[0]).toBe(boss.trait);
    expect(o.candidates.length).toBe(BALANCE.provisional.absorb.candidatesElite + 1);
    expect(TRAITS.filter((t) => t.boss).map((t) => t.id)).toEqual(['boss-sand-maw', 'boss-canyon-king', 'boss-forest-lord']);
    // 흡수 화면은 offer.enemyId 로 적을 찾는다: 보스도 찾아야 한다 (C.58 캡처에서 찾은 버그)
    expect(findEnemyDef('sand-maw').name).toEqual(boss.name);
    expect(findEnemyDef(ENEMIES[0]!.id)).toBe(ENEMIES[0]);
  });
});

describe('스토리 데이터 (GDD 25-4·25-7)', () => {
  it('장 3개(1장 = 1단계 웨코문도 외곽 자리, 2장 = 3단계, 3장 = 5단계), 2·3장 내용은 C.84 에서 채움', () => {
    expect(STORY_CHAPTERS.map((c) => [c.id, c.unlockTierIndex, c.groundId])).toEqual([['ch1', 0, 'outskirts'], ['ch2', 2, 'canyon'], ['ch3', 4, 'forest']]);
    for (const fid of ['hollow', 'shinigami']) {
      expect(chapterContent(fid, 'ch1')!.episodes).toHaveLength(4);
      expect(chapterContent(fid, 'ch2')!.episodes).toHaveLength(4);
      expect(chapterContent(fid, 'ch3')!.episodes).toHaveLength(4);
      const eps = chapterContent(fid, 'ch1')!.episodes;
      expect(eps.map((e) => e.objective.type)).toEqual(['defeat', 'survive', 'absorb', 'boss']);
      expect(eps[3]!.boss).toEqual({ id: 'sand-maw', cell: 11 });
    }
    expect(STORY_CONTENT).toHaveLength(6);
  });

  it('대사는 25-7 초안 그대로 (글자 그대로)', () => {
    const h = chapterContent('hollow', 'ch1')!;
    expect(h.title).toBe('굶주린 영혼');
    expect(h.episodes.map((e) => e.title)).toEqual(['첫 사냥', '모래 위의 무리', '큰 놈의 힘', '모래 아귀']);
    expect(h.episodes[0]!.dialogue.start).toEqual([{ speaker: '나', text: '…배고프다. 무엇이든 먹어야 한다.' }]);
    expect(h.episodes[0]!.dialogue.mid!.lines).toEqual([{ speaker: '나', text: '작은 영혼들이 흩어진다. 쫓아라.' }]);
    expect(h.episodes[0]!.dialogue.end).toEqual([{ speaker: '나', text: '처음으로, 배가 조금 찼다.' }]);
    expect(h.episodes[3]!.dialogue.start).toEqual([
      { speaker: '늙은 호로', text: '모래 아귀다. 외곽의 영혼을 다 먹어 치운 놈.' },
      { speaker: '모래 아귀', text: '…작은 것. 너도 먹이다.' },
    ]);
    expect(h.episodes[3]!.dialogue.end).toEqual([{ speaker: '나', text: '굶주림 너머에, 무언가가 있다.' }]);
    const s = chapterContent('shinigami', 'ch1')!;
    expect(s.title).toBe('입대');
    expect(s.episodes.map((e) => e.title)).toEqual(['첫 순찰', '밤의 루콘가이', '큰 기척', '들개 대허']);
    expect(s.episodes[1]!.dialogue.end).toEqual([{ speaker: '분대장', text: '…버텼군. 제법이다.' }]);
    expect(s.episodes[2]!.dialogue.end).toEqual([{ speaker: '나', text: '내 참백도가… 대답했다.' }]);
    expect(s.episodes[3]!.dialogue.start).toEqual([
      { speaker: '분대장', text: '주민을 지켜라!' },
      { speaker: '들개 대허', text: '…사신 냄새. 맛있겠군.' },
    ]);
    expect(s.episodes[3]!.dialogue.end).toEqual([{ speaker: '분대장', text: '오늘부터 너도 진짜 사신이다.' }]);
  });

  it('목표 문구', () => {
    const eps = chapterContent('hollow', 'ch1')!.episodes;
    expect(eps.map((e) => objectiveText(e.objective, getFaction('hollow')))).toEqual(['일반 적 3마리 처치', '2바퀴 버티기', '강적 1마리 포식', '보스 처치']);
  });
});

describe('스토리 원정', () => {
  it('고정 길·사냥터·최대 바퀴를 쓰고, 드래프트·바퀴 변이는 끈다', () => {
    const e = storyExp('hollow', 'ep2');
    const ep = getEpisode('hollow', 'ch1', 'ep2');
    for (const [cell, id] of Object.entries(ep.road)) expect(e.slots[Number(cell)]).toBe(id);
    expect(e.groundId).toBe('outskirts');
    expect(e.maxLaps).toBe(ep.maxLaps);
    expect(storyGoalLine(e)).toBe('목표 · 2바퀴 버티기 0/2');
    const done = playExpedition(e, { returnAfterLap: 4, absorb: 'absorb', place: false, playBattle: (b) => { b.enemy.hp = 1e-9; for (let i = 0; i < 50 && b.status === 'playing'; i++) step(b); } });
    expect(done.variantLog.mutations).toEqual([]);
    expect(done.variantLog.drafts).toEqual([]);
    expect(done.endReason).toBe('story-clear');
    expect(done.story!.cleared).toBe(true);
    expect(done.lapsCompleted).toBe(2);
  });

  it('1화: 일반 적 3마리를 쓰러뜨리면 바로 귀환(story-clear). 첫 처치 뒤 중간 대사가 한 번', () => {
    const e = storyExp('hollow', 'ep1');
    walkToBattle(e);
    finishBattle(e, forceBattle(e, true));
    if (e.phase === 'absorb') chooseRelease(e);
    expect(e.story!.progress).toBe(1);
    expect(takeStoryCue(e)).toEqual([{ speaker: '나', text: '작은 영혼들이 흩어진다. 쫓아라.' }]);
    expect(takeStoryCue(e)).toBeNull();
    for (let k = 0; k < 2; k++) {
      walkToBattle(e);
      finishBattle(e, forceBattle(e, true));
      if (e.phase === 'absorb') chooseRelease(e);
    }
    expect(e.phase).toBe('ended');
    expect(e.endReason).toBe('story-clear');
    expect(e.outcome).toBe('returned');
    expect(buildRunRecord(e).story).toEqual({ chapterId: 'ch1', episodeId: 'ep1', cleared: true });
  });

  it('3화: 강적을 흡수해야 진행한다 (놓아준 강적·흡수한 일반 적은 세지 않는다)', () => {
    const e = storyExp('hollow', 'ep3');
    let elites = 0;
    for (let g = 0; g < 300 && e.phase !== 'ended'; g++) {
      if (e.phase === 'moving') advance(e);
      else if (e.phase === 'rest') finishRest(e);
      else if (e.phase === 'nest-choice') chooseContinue(e);
      else if (e.phase === 'battle') {
        const elite = e.pending!.enemy.class === 'elite';
        finishBattle(e, forceBattle(e, true));
        if ((e.phase as string) === 'absorb') {
          if (elite && elites++ === 0) {
            chooseRelease(e);
            expect(e.story!.progress).toBe(0);
          } else chooseAbsorb(e, null);
        }
      } else if (e.phase === 'absorb') chooseAbsorb(e, null);
    }
    expect(elites).toBe(2);
    expect(e.story!.progress).toBe(1);
    expect(e.endReason).toBe('story-clear');
  });

  it('4화: 11번 칸에 보스 — 보스 재료(페이즈·기믹·시간), 이기면 골드 100·희귀 먹이·보스 특성 확정 후보, 흡수 화면 뒤 클리어', () => {
    const e = storyExp('hollow', 'ep4');
    for (let g = 0; g < 10 && !e.pending?.boss; g++) {
      walkToBattle(e);
      if (!e.pending?.boss) {
        finishBattle(e, forceBattle(e, true));
        if (e.phase === 'absorb') chooseRelease(e);
      }
    }
    expect(e.pending!.boss).toBe('sand-maw');
    expect(e.pos).toBe(11);
    const b = startBattle(e);
    expect(b.boss!.setup.gimmick).toBe('seal');
    expect(b.params.timeLimitSeconds).toBe(180);
    expect(b.enemy.def.id).toBe('sand-maw');
    b.enemy.hp = 1e-9;
    for (let i = 0; i < 50 && b.status === 'playing'; i++) step(b);
    const goldBefore = e.goldLoot.reduce((a, x) => a + x.amount, 0);
    const rec = finishBattle(e, b);
    expect(rec.enemyClass).toBe('boss');
    expect(e.goldLoot.reduce((a, x) => a + x.amount, 0) - goldBefore).toBe(BX.reward.gold);
    expect(e.foodLoot.at(-1)!.food).toBe(BX.reward.food);
    expect(e.phase).toBe('absorb');
    expect(e.absorbOffer!.candidates[0]).toBe('boss-sand-maw');
    expect(e.story!.bossResult).toMatchObject({ bossId: 'sand-maw', won: true });
    chooseAbsorb(e, 'boss-sand-maw', 0);
    expect(e.phase).toBe('ended');
    expect(e.endReason).toBe('story-clear');
    expect(e.build.owned).toContain('boss-sand-maw');
  });

  it('보스에게 지면 원정 패배 귀환과 같다', () => {
    const e = storyExp('shinigami', 'ep4');
    for (let g = 0; g < 10 && !e.pending?.boss; g++) {
      walkToBattle(e);
      if (!e.pending?.boss) {
        finishBattle(e, forceBattle(e, true));
        if (e.phase === 'absorb') chooseRelease(e);
      }
    }
    finishBattle(e, forceBattle(e, false));
    expect(e.outcome).toBe('defeated');
    expect(e.endReason).toBe('battle-lost');
    expect(e.story!.cleared).toBe(false);
    expect(e.story!.bossResult!.won).toBe(false);
  });

  it('원정 중간 저장 형식 7(C.58 때 6, C.75 난이도 추가): 스토리 진행·보스 대기 왕복, 깨진 스토리 값은 이어하지 않는다', () => {
    expect(EXPEDITION_SNAPSHOT_VERSION).toBeGreaterThanOrEqual(7);
    const e = storyExp('hollow', 'ep4');
    for (let g = 0; g < 10 && !e.pending?.boss; g++) {
      walkToBattle(e);
      if (!e.pending?.boss) {
        finishBattle(e, forceBattle(e, true));
        if (e.phase === 'absorb') chooseRelease(e);
      }
    }
    const snap = JSON.parse(JSON.stringify(serializeExpedition(e, 1)));
    const r = restoreExpedition(snap);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.exp.story).toEqual(e.story);
      expect(r.exp.pending!.boss).toBe('sand-maw');
      expect(storyEpisodeOf(r.exp)!.id).toBe('ep4');
    }
    const bad = structuredClone(snap);
    bad.exp.story.episodeId = 'ep9';
    expect(restoreExpedition(bad).ok).toBe(false);
    const bad2 = structuredClone(snap);
    bad2.exp.pending.boss = 'nobody';
    expect(restoreExpedition(bad2).ok).toBe(false);
  });
});

describe('세이브·보상·칭호 (형식 22)', () => {
  /** 보스 화를 이기고 귀환까지 */
  function bossWin(save: SaveData, seed: number): ExpeditionState {
    const e = storyExp(save.factionId, 'ep4', seed, save);
    for (let g = 0; g < 10 && !e.pending?.boss; g++) {
      walkToBattle(e);
      if (!e.pending?.boss) {
        finishBattle(e, forceBattle(e, true));
        if (e.phase === 'absorb') chooseRelease(e);
      }
    }
    finishBattle(e, forceBattle(e, true));
    chooseRelease(e);
    return e;
  }
  const clearEp = (save: SaveData, ep: string, seed: number): ExpeditionState => {
    const e = storyExp(save.factionId, ep, seed, save);
    e.story!.progress = 99;
    e.story!.cleared = true;
    e.phase = 'ended';
    e.outcome = 'returned';
    e.endReason = 'story-clear';
    recordExpedition(save, e, 1000 + seed);
    return e;
  };

  it('화는 순서대로 열리고, 장은 단계·내용이 있어야 열린다', () => {
    const s = newSaveData('hollow', 1);
    expect(chapterOpen(s, 'ch1')).toBe(true);
    expect(chapterOpen(s, 'ch2')).toBe(false);
    expect(episodeOpen(s, 'ch1', 'ep1')).toBe(true);
    expect(episodeOpen(s, 'ch1', 'ep2')).toBe(false);
    clearEp(s, 'ep1', 1);
    expect(episodeOpen(s, 'ch1', 'ep2')).toBe(true);
    expect(episodeOpen(s, 'ch1', 'ep3')).toBe(false);
    s.evolution.tierIndex = 1;
    expect(chapterOpen(s, 'ch2')).toBe(false); // 2장은 3단계부터
    s.evolution.tierIndex = 2;
    expect(chapterOpen(s, 'ch2')).toBe(true); // C.84: 2장 내용이 생겼다
  });

  it('화 클리어: 골드 20 + 먹이 1(매번), 첫 클리어만 영옥 2. 실패는 보상 없음, 기록만', () => {
    const s = newSaveData('shinigami', 1);
    const jade0 = s.shared.jade;
    const gold0 = s.shared.tradeCoins;
    const e = clearEp(s, 'ep1', 1);
    expect(e.storySettled).toMatchObject({ cleared: true, firstClear: true, gold: SX.episodeGold, jade: SX.firstClearJade, chapterCleared: false });
    expect(s.shared.tradeCoins - gold0).toBe(SX.episodeGold);
    expect(s.shared.jade - jade0).toBe(SX.firstClearJade);
    const e2 = clearEp(s, 'ep1', 2);
    expect(e2.storySettled).toMatchObject({ firstClear: false, jade: 0, gold: SX.episodeGold });
    expect(storyProgressOf(s).cleared[episodeKey('ch1', 'ep1')]!.clears).toBe(2);
    expect(s.runLog.storyRuns.map((r) => [r.episodeId, r.cleared, r.firstClear])).toEqual([['ep1', true, true], ['ep1', true, false]]);
  });

  it('보스 첫 처치: 영옥 10 + 칭호, 보스 도감. 두 번째는 첫 처치 보상 없음. 장을 다 깨면 영옥 5 + 장 칭호', () => {
    const s = newSaveData('hollow', 1);
    for (const [i, ep] of ['ep1', 'ep2', 'ep3'].entries()) clearEp(s, ep, i + 1);
    const jade0 = s.shared.jade;
    const e = bossWin(s, 7);
    recordExpedition(s, e, 5000);
    expect(e.storySettled).toMatchObject({ cleared: true, firstClear: true, bossFirstKill: 'sand-maw', chapterCleared: true });
    expect(s.shared.jade - jade0).toBe(SX.firstClearJade + BX.reward.firstJade + SX.chapterJade);
    expect(s.bossDex['sand-maw']).toEqual({ kills: 1, firstAt: 5000 });
    expect(s.titles.map((t) => t.titleId)).toEqual(expect.arrayContaining(['boss-sand-maw', 'story-ch1']));
    expect(storyProgressOf(s).chapters).toEqual(['ch1']);
    expect(s.runLog.bossBattles).toHaveLength(1);
    expect(s.runLog.bossBattles[0]).toMatchObject({ bossId: 'sand-maw', won: true, firstKill: true, episode: 'ch1/ep4' });
    const titleNames = ['boss-sand-maw', 'story-ch1'].map((id) => titleName(TITLES.find((t) => t.id === id)!, 'hollow'));
    expect(titleNames).toEqual(['모래 아귀 사냥꾼', '굶주림을 넘은 자']);
    const jade1 = s.shared.jade;
    const e2 = bossWin(s, 8);
    recordExpedition(s, e2, 6000);
    expect(e2.storySettled).toMatchObject({ bossFirstKill: null, chapterCleared: false, firstClear: false, jade: 0 });
    expect(s.shared.jade).toBe(jade1);
    expect(s.bossDex['sand-maw']).toEqual({ kills: 2, firstAt: 5000 });
    expect(s.runLog.bossBattles[1]!.firstKill).toBe(false);
  });

  it('세이브 형식 22 마이그레이션: 형식 21 세이브에 빈 스토리 진행·보스 도감·기록', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(22);
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 1)));
    old.meta.format = 21;
    delete old.story;
    delete old.bossDex;
    delete old.runLog.bossBattles;
    delete old.runLog.storyRuns;
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.story).toEqual({});
    expect(m.bossDex).toEqual({});
    expect(m.runLog.bossBattles).toEqual([]);
    expect(m.runLog.storyRuns).toEqual([]);
    // 깨진 값 보정
    const broken = JSON.parse(JSON.stringify(newSaveData('hollow', 1)));
    broken.story = { hollow: { cleared: { 'ch1/ep1': { firstAt: 5, clears: 2 }, junk: 1 }, chapters: ['ch1', 3] } };
    broken.bossDex = { 'sand-maw': { kills: 2, firstAt: 9 }, nobody: { kills: 1 } };
    const b = migrateSave(broken)!;
    expect(b.story).toEqual({ hollow: { cleared: { 'ch1/ep1': { firstAt: 5, clears: 2 } }, chapters: ['ch1'] } });
    expect(b.bossDex).toEqual({ 'sand-maw': { kills: 2, firstAt: 9 } });
  });
});
