// C.84 (S-23, GDD 35장 v5.70): 스토리 2장·3장(두 종족), 새 보스 canyon-king(기믹 summon)·forest-lord(기믹 element, 페이즈 3개), 3장 완료 영옥 10 추가, 상점 가격 확정
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { BOSSES, bossName, getBoss } from '../src/data/bosses';
import { chapterClearJade, chapterContent, parseChapterContent } from '../src/data/story';
import { SHOP_PROVISIONAL } from '../src/data/shop';
import { getTrait, traitName } from '../src/data/traits';
import { TITLES, titleName } from '../src/data/titles';
import { createCombat, replayCombat, step, type CombatState } from '../src/engine/combat';
import { bossSetupOf, createExpedition, finishBattle, startBattle, advance, finishRest, chooseRelease, chooseContinue, type ExpeditionState } from '../src/engine/expedition';
import { newSaveData, sanitizeDeck, settleStory, chapterOpen, storyProgressOf } from '../src/game';

const BX = BALANCE.provisional.boss;
const FIDS = ['hollow', 'shinigami'];

function bossCombat(id: string, seed = 5): CombatState {
  const s = createCombat(seed, { enemy: getBoss(id).enemy, boss: bossSetupOf(id) });
  s.player.hp = 1e9;
  s.player.maxHp = 1e9;
  return s;
}

const secs = (s: CombatState, sec: number) => {
  for (let i = 0; i < Math.round(sec / s.params.tickSeconds); i++) step(s);
};

describe('스토리 2장·3장 데이터 (GDD 35-1~35-4)', () => {
  it('두 종족 모두 2·3장 4화, 목표·권장 단계·고정 ★ 가 35장 그대로', () => {
    for (const fid of FIDS) {
      const c2 = chapterContent(fid, 'ch2')!;
      const c3 = chapterContent(fid, 'ch3')!;
      expect(c2.episodes.map((e) => e.objective)).toEqual([
        { type: 'defeat', enemyClass: 'normal', count: 5 },
        { type: 'survive', laps: 3 },
        { type: 'absorb', enemyClass: 'elite', count: 2 },
        { type: 'boss' },
      ]);
      expect(c3.episodes.map((e) => e.objective)).toEqual([
        { type: 'defeat', enemyClass: 'elite', count: 2 },
        { type: 'survive', laps: 4 },
        { type: 'absorb', enemyClass: 'elite', count: 2 },
        { type: 'boss' },
      ]);
      expect(c2.episodes.map((e) => [e.recommendedTier, e.difficulty])).toEqual([[3, 3], [3, 3], [4, 4], [4, 4]]);
      expect(c3.episodes.map((e) => [e.recommendedTier, e.difficulty])).toEqual([[5, 5], [5, 5], [5, 5], [5, 5]]);
      expect(c2.episodes[0]!.maxLaps).toBe(3);
      expect(c3.episodes[0]!.maxLaps).toBe(3);
      expect(c2.episodes[3]!.boss).toEqual({ id: 'canyon-king', cell: 11 });
      expect(c3.episodes[3]!.boss).toEqual({ id: 'forest-lord', cell: 11 });
      // 보스의 ★ = 그 화의 ★ (32-1 7번)
      expect(getBoss('canyon-king').difficulty).toBe(c2.episodes[3]!.difficulty);
      expect(getBoss('forest-lord').difficulty).toBe(c3.episodes[3]!.difficulty);
      // 강적 목표 화에는 강적 소굴이 길에 있다
      for (const e of [...c2.episodes, ...c3.episodes].filter((x) => 'enemyClass' in x.objective && x.objective.enemyClass === 'elite')) {
        expect(Object.values(e.road).filter((t) => t.startsWith('elite-den')).length).toBeGreaterThanOrEqual(2);
      }
      // 3화는 중간 대사가 있다
      expect(c2.episodes[2]!.dialogue.mid?.lines.length).toBe(1);
      expect(c3.episodes[2]!.dialogue.mid?.lines.length).toBe(1);
    }
    expect(chapterContent('hollow', 'ch2')!.title).toBe('무리 속의 나');
    expect(chapterContent('hollow', 'ch3')!.title).toBe('가면을 깨는 자');
    expect(chapterContent('shinigami', 'ch2')!.title).toBe('현세 파견');
    expect(chapterContent('shinigami', 'ch3')!.title).toBe('석차를 향해');
  });

  it('대사는 35장 초안 글자 그대로 (몇 줄 표본)', () => {
    const h2 = chapterContent('hollow', 'ch2')!.episodes;
    expect(h2[0]!.dialogue.start).toEqual([
      { speaker: '나', text: '협곡에 들어서자, 수많은 굶주림이 한꺼번에 울린다.' },
      { speaker: '늙은 호로', text: '여기선 무리가 곧 몸이다. 무리에 먹히지 마라.' },
    ]);
    expect(h2[3]!.dialogue.start[1]).toEqual({ speaker: '협곡의 왕', text: '하나의 목소리로 무엇을 할 수 있지? 내 무리가 되어라.' });
    expect(chapterContent('hollow', 'ch3')!.episodes[3]!.dialogue.end[0]).toEqual({ speaker: '???', text: '재미있는 놈이군. 번호를 원하나? 그렇다면 올라와라.' });
    expect(chapterContent('shinigami', 'ch2')!.episodes[2]!.dialogue.mid!.lines).toEqual([{ speaker: '나', text: '이름이… 들린다.' }]);
    expect(chapterContent('shinigami', 'ch3')!.episodes[3]!.dialogue.end).toEqual([
      { speaker: '대장', text: '단가이를 넘어온 자가 있다고 들었다. 석차를 원하나? 그럼 증명해라.' },
      { speaker: '나', text: '증명하겠습니다.' },
    ]);
  });

  it('장은 단계에 맞춰 열린다 (2장 3단계, 3장 5단계) — 더는 준비 중이 아니다', () => {
    for (const fid of FIDS) {
      const s = newSaveData(fid, 1);
      s.evolution.tierIndex = 2;
      expect(chapterOpen(s, 'ch2')).toBe(true);
      expect(chapterOpen(s, 'ch3')).toBe(false);
      s.evolution.tierIndex = 4;
      expect(chapterOpen(s, 'ch3')).toBe(true);
    }
  });

  it('강적 처치 목표(defeat elite)는 데이터 검사를 통과하고, 강적을 이기면 진행이 오른다', () => {
    expect(() => parseChapterContent({ ...chapterContent('hollow', 'ch3')! })).not.toThrow();
    const save = newSaveData('hollow', 1);
    save.evolution.tierIndex = 4;
    const e: ExpeditionState = createExpedition({ factionId: 'hollow', seed: 7, hunger: 20, condition: 80, deck: sanitizeDeck(save.tiles, 'hollow'), build: save.build, evolution: save.evolution, tileVariants: true, story: { chapterId: 'ch3', episodeId: 'ep1' } });
    let elites = 0;
    for (let g = 0; g < 3000 && e.phase !== 'ended'; g++) {
      if (e.phase === 'moving') advance(e);
      else if (e.phase === 'rest') finishRest(e);
      else if (e.phase === 'absorb') chooseRelease(e);
      else if (e.phase === 'nest-choice') chooseContinue(e);
      else if (e.phase === 'battle') {
        const b = startBattle(e);
        const elite = e.pending!.enemy.class === 'elite';
        b.enemy.hp = 1e-9;
        for (let i = 0; i < 400 && b.status === 'playing'; i++) step(b);
        const before = e.story!.progress;
        finishBattle(e, b);
        if (elite) elites++;
        expect(e.story!.progress - before).toBe(elite ? 1 : 0);
      } else break;
    }
    expect(elites).toBe(2);
    expect(e.endReason).toBe('story-clear');
  });

  it('장 완료 칭호(장 제목 기반) + 영옥 5, 3장은 영옥 10 추가(스킨 자리)', () => {
    expect(chapterClearJade('ch1')).toBe(5);
    expect(chapterClearJade('ch2')).toBe(5);
    expect(chapterClearJade('ch3')).toBe(15);
    for (const id of ['story-ch2', 'story-ch3', 'boss-canyon-king', 'boss-forest-lord']) expect(TITLES.some((t) => t.id === id)).toBe(true);
    expect(titleName(TITLES.find((t) => t.id === 'story-ch2')!, 'hollow')).toBe('무리를 삼킨 자');
    expect(titleName(TITLES.find((t) => t.id === 'story-ch3')!, 'shinigami')).toBe('석차에 도전하는 자');
    // 3장 마지막 화를 깨며 장을 처음 다 깨면: 첫 클리어 2 + 장 15 (+ 보스 첫 처치 10)
    const save = newSaveData('shinigami', 1);
    save.evolution.tierIndex = 4;
    for (const id of ['ep1', 'ep2', 'ep3']) storyProgressOf(save).cleared[`ch3/${id}`] = { firstAt: 1, clears: 1 };
    const exp = { runId: 'r', factionId: 'shinigami', evolution: save.evolution, story: { chapterId: 'ch3', episodeId: 'ep4', progress: 1, cleared: true, kills: 1, midShown: true, cue: null, bossResult: { bossId: 'forest-lord', won: true, durationSeconds: 100, phase: 3, seals: 0, lossReason: null } } } as unknown as ExpeditionState;
    const jade0 = save.shared.jade;
    const r = settleStory(save, exp, 1000);
    expect(r.chapterCleared).toBe(true);
    expect(r.bossFirstKill).toBe('forest-lord');
    expect(save.shared.jade - jade0).toBe(BALANCE.provisional.story.firstClearJade + 15 + BX.reward.firstJade);
  });
});

describe('새 보스 2종 (GDD 35장)', () => {
  it('데이터: 두 종족 공유·이름과 보스 특성 이름은 종족별, 체력 150회분, 기믹·페이즈', () => {
    const ck = getBoss('canyon-king');
    const fl = getBoss('forest-lord');
    expect([bossName('canyon-king', 'hollow'), bossName('canyon-king', 'shinigami')]).toEqual(['협곡의 왕', '현세의 대허']);
    expect([bossName('forest-lord', 'hollow'), bossName('forest-lord', 'shinigami')]).toEqual(['숲의 군주', '단가이의 문지기']);
    expect([traitName(ck.trait, 'hollow'), traitName(ck.trait, 'shinigami')]).toEqual(['협곡의 왕의 뿔', '대허의 갑각']);
    expect([traitName(fl.trait, 'hollow'), traitName(fl.trait, 'shinigami')]).toEqual(['숲의 군주의 가면', '문지기의 사슬']);
    for (const b of [ck, fl]) {
      expect(b.enemy.hpInAttacks).toBe(150);
      expect(getTrait(b.trait).boss).toBe(true);
      expect(b.provisional).toBe(true);
    }
    expect(ck.gimmick).toBe('summon');
    expect(ck.phases).toEqual([{ belowHpFraction: 0.5, attackSecondsMult: 0.8 }]);
    expect(fl.gimmick).toBe('element');
    expect(fl.phases.map((p) => p.belowHpFraction)).toEqual([0.66, 0.33]);
    expect(fl.phases.map((p) => p.attackSecondsMult)).toEqual([0.9, 0.81]);
    expect(fl.elementShifts).toHaveLength(2);
    expect(BX.summon).toEqual({ everySeconds: 20, hpInAttacks: 6, attackSeconds: 3, attackInAttacks: 0.1 });
    expect(BOSSES.filter((b) => b.gimmick !== 'element').every((b) => b.elementShifts === undefined)).toBe(true);
  });

  it('기믹 summon: 20초마다 졸개 1마리(한 번에 1마리), 내 피해를 먼저 받고, 3초마다 작은 공격', () => {
    const s = bossCombat('canyon-king');
    s.status = 'playing';
    // 내 공격을 막아 보스 체력이 안 움직이는 것만 보기 위해 자동 공격을 멈춘다
    s.player.attackTimer = 1e9;
    secs(s, 19.9);
    expect(s.boss!.minion ?? null).toBeNull();
    secs(s, 0.2);
    const m = s.boss!.minion!;
    expect(m).toBeTruthy();
    const unit = s.params.hpAttackScale * s.params.playerAttackDamage * s.params.growthMultiplier;
    expect(m.maxHp).toBeCloseTo(6 * unit, 6);
    expect(s.boss!.summons).toBe(1);
    // 20초 뒤에도 살아 있으면 두 번째 졸개는 오지 않는다
    s.player.attackTimer = 1e9;
    const hits0 = s.events.filter((e) => e.kind === 'minion-attack').length;
    secs(s, 20);
    expect(s.boss!.summons).toBe(1);
    const hits = s.events.filter((e) => e.kind === 'minion-attack').length - hits0;
    expect(hits).toBeGreaterThanOrEqual(6);
    expect(hits).toBeLessThanOrEqual(7);
    // 졸개가 내 피해를 먼저 받는다: 졸개 체력보다 큰 피해 → 졸개는 쓰러지고 넘친 만큼만 보스에게
    const bossHp = s.enemy.hp;
    const over = s.boss!.minion!.hp + 10;
    s.enemy.dot = { ticks: 1, perTick: over };
    step(s);
    expect(s.boss!.minion).toBeNull();
    expect(s.boss!.minionKills).toBe(1);
    expect(bossHp - s.enemy.hp).toBeCloseTo(10, 6);
    expect(s.events.some((e) => e.kind === 'minion-down')).toBe(true);
  });

  it('기믹 element: 체력 66%·33% 에서 페이즈 2·3, 속성이 elementShifts 대로 바뀌고 상성도 바뀐 속성으로 본다', () => {
    const fl = getBoss('forest-lord');
    const s = bossCombat('forest-lord');
    expect(s.enemy.def.element).toBe(fl.enemy.element);
    s.enemy.dot = { ticks: 1, perTick: s.enemy.maxHp * 0.35 };
    step(s);
    expect(s.boss!.phase).toBe(2);
    expect(s.enemy.def.element).toBe(fl.elementShifts![0]);
    expect(s.boss!.attackMult).toBe(0.9);
    s.enemy.dot = { ticks: 1, perTick: s.enemy.maxHp * 0.34 };
    step(s);
    expect(s.boss!.phase).toBe(3);
    expect(s.enemy.def.element).toBe(fl.elementShifts![1]);
    expect(s.boss!.attackMult).toBe(0.81);
    expect(s.events.filter((e) => e.kind === 'boss-element').map((e) => (e as { element: string }).element)).toEqual(fl.elementShifts);
    // 보스 데이터 자체는 바뀌지 않는다 (다음 전투는 처음 속성)
    expect(getBoss('forest-lord').enemy.element).toBe(fl.enemy.element);
  });

  it('같은 시드·입력이면 같은 결과 (summon·element 도 재현)', () => {
    for (const id of ['canyon-king', 'forest-lord']) {
      const a = createCombat(21, { enemy: getBoss(id).enemy, boss: bossSetupOf(id) });
      for (let i = 0; i < 3000 && a.status === 'playing'; i++) step(a);
      const b = replayCombat(21, { enemy: getBoss(id).enemy, boss: bossSetupOf(id) }, a.inputs);
      expect(b.status).toBe(a.status);
      expect(b.tick).toBe(a.tick);
      expect(b.enemy.hp).toBe(a.enemy.hp);
    }
  });

  it('보스 기믹 엔진은 보스 id·종족으로 분기하지 않는다 (데이터로 고름)', () => {
    const src = readFileSync('src/engine/combat/combat.ts', 'utf8');
    for (const bad of ['canyon-king', 'forest-lord', 'sand-maw', "'hollow'", "'shinigami'"]) expect(src).not.toContain(bad);
    const exp = readFileSync('src/engine/expedition/expedition.ts', 'utf8');
    for (const bad of ['canyon-king', 'forest-lord']) expect(exp).not.toContain(bad);
  });
});

describe('상점 가격 확정 (GDD 25-9 v5.70)', () => {
  it('가격표는 확정 구역(BALANCE.shop)으로, 값은 그대로, 임시 표시 없음', () => {
    expect((BALANCE.provisional as Record<string, unknown>).shop).toBeUndefined();
    expect(BALANCE.shop.goldPrices).toEqual({
      'food-snack': 20, 'food-basic': 35, 'food-hearty': 60, 'food-tonic': 100, 'food-feast': 140,
      calm: 80, wake: 60, 'training-ticket': 90, 'rare-tile': 60, reroll: 120,
    });
    expect(BALANCE.shop.deckSlotPrices).toEqual([400, 800]);
    expect(BALANCE.shop.skinPrice).toBe(30);
    expect(SHOP_PROVISIONAL).toBe(false);
  });
});
