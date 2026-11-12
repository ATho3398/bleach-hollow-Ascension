// C.414 (GDD 244장 2~6): 붕옥 안 B(반각성 → 공명) + 붕옥 개발(재료 3종 · 10단계 · 단계마다 전 능력치 +1%, 100% + 공명 + 1위 = 합체)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS } from '../src/data/factions';
import { GUIDES } from '../src/data/help';
import { HOGYOKU_STEP_NAMES, transcendentConditionText } from '../src/data/hogyoku';
import { chapterContent, STORY_CHAPTERS } from '../src/data/story';
import { TRANSCENDENTS } from '../src/data/transcendents';
import { developCost, developCostSum } from '../src/engine/transcend';
import { guidePending } from '../src/engine/tutorial';
import { checkTrackOpen, developGate, developHogyoku, migrateSave, newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, settleStory, statBonusOf, type SaveData } from '../src/game';
import { clearStory } from './helpers/storyClear';

const HX = BALANCE.provisional.hogyoku;
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const rich = (s: SaveData) => { s.shared.soulCrystals = 999; s.shared.hogyokuShards = 999; s.shared.resonanceEssence = 999; };
const other = (fid: string) => FACTIONS.find((f) => f.id !== fid)!.id;

describe('244장 4 개발 표 (balance 한 곳)', () => {
  it('10단계 · 재료 3종 · 구간 안에서 뒤 단계일수록 비쌈 · 단계 이름 10개', () => {
    const d = HX.develop;
    expect([d.soul.length, d.shard.length, d.essence.length]).toEqual([10, 10, 10]);
    expect(HX.maxLevel).toBe(10);
    expect(HX.halfLevel).toBe(5);
    expect(HOGYOKU_STEP_NAMES).toHaveLength(10);
    // 구간(1~5 반각성 · 6~10 공명) 안에서는 뒤 단계일수록 비싸다 (줄지 않음)
    for (const arr of [d.soul, d.shard, d.essence]) for (let i = 1; i < arr.length; i++) if (i !== HX.halfLevel) expect(arr[i]!).toBeGreaterThanOrEqual(arr[i - 1]!);
    expect(developCost(1)).toEqual({ soul: d.soul[0], shard: d.shard[0], essence: d.essence[0] });
    expect(developCostSum(0, 10).soul).toBe(d.soul.reduce((a, b) => a + b, 0));
    expect(HX.perLevelBonus * HX.halfLevel).toBeCloseTo(0.05); // 5단계 = 옛 붕옥 해방 +5%
  });
});

describe('244장 2 반각성 → 공명', () => {
  it('첫 종족 스토리만 = 반각성: 5단계까지만, 6단계는 공명 필요', () => {
    const s = newSaveData('hollow', 1);
    clearStory(s);
    checkTrackOpen(s, 10);
    expect(s.hogyoku.tabOpen).toBe(true);
    expect(s.hogyoku.resonance).toBe(false);
    rich(s);
    for (let i = 1; i <= HX.halfLevel; i++) expect(developHogyoku(s, 20 + i)?.level).toBe(i);
    expect(developHogyoku(s, 30)).toBeNull();
    expect(developGate(s).missing).toEqual(['resonance']);
    expect(statBonusOf(s).total).toBeCloseTo(0.05);
  });

  it('다른 종족 스토리도 전부 = 공명: 처음 한 번, 정수 +30, 컷, 6~10단계 열림', () => {
    const s = newSaveData('hollow', 1);
    clearStory(s);
    checkTrackOpen(s, 10);
    clearStory(s, other('hollow'));
    const ess = s.shared.resonanceEssence;
    checkTrackOpen(s, 11);
    expect(s.hogyoku).toMatchObject({ resonance: true, resonatedAt: 11 });
    expect(s.shared.resonanceEssence).toBe(ess + BALANCE.provisional.resonanceEssence.onResonance);
    expect(guidePending(s.help, 'hogyoku-resonance')).toBe(true);
    checkTrackOpen(s, 12);
    expect(s.shared.resonanceEssence).toBe(ess + BALANCE.provisional.resonanceEssence.onResonance); // 두 번은 없다
    rich(s);
    while (developHogyoku(s, 13)) { /* */ }
    expect(s.hogyoku.level).toBe(10);
    expect(developGate(s).missing).toEqual(['max']);
    expect(statBonusOf(s).total).toBeCloseTo(0.1);
  });

  it('재료가 모자라면 못 올리고 하나도 안 깎인다 · 개발 기록(단계·재료·종족·회차)', () => {
    const s = newSaveData('hollow', 1);
    clearStory(s);
    checkTrackOpen(s, 1);
    const c = developCost(1);
    s.shared.soulCrystals = c.soul;
    s.shared.hogyokuShards = c.shard - 1;
    s.shared.resonanceEssence = c.essence;
    expect(developGate(s).missing).toEqual(['shard']);
    expect(developHogyoku(s)).toBeNull();
    expect(s.shared.soulCrystals).toBe(c.soul);
    s.shared.hogyokuShards = c.shard;
    const r = developHogyoku(s, 77)!;
    expect(r).toEqual({ at: 77, level: 1, ...c, factionId: 'hollow', cycle: 1 });
    expect(s.slotLog.hogyokuDev).toEqual([r]);
    expect([s.shared.soulCrystals, s.shared.hogyokuShards, s.shared.resonanceEssence]).toEqual([0, 0, 0]);
  });

  it('공명 컷 1장 · 붕옥 아이콘을 가리킨다', () => {
    const g = GUIDES['hogyoku-resonance'];
    expect(g).toHaveLength(1);
    expect(g[0]!.targets).toEqual(['@.bha-prop--hogyoku']);
  });
});

describe('244장 3 재료 얻는 곳 (등장 전에도 쌓임)', () => {
  it('스토리 화 첫 클리어 +5 · 장 보스(장 완주) +20 · 다시 깨면 없음 — 기록은 slotLog.hogyokuMaterials', () => {
    const s = newSaveData('hollow', 1);
    s.evolution.tierIndex = 3;
    const ch = STORY_CHAPTERS[0]!;
    const eps = chapterContent('hollow', ch.id)!.episodes;
    const HS = BALANCE.provisional.hogyokuShards;
    let want = 0;
    for (const [i, e] of eps.entries()) {
      const out = settleStory(s, { story: { chapterId: ch.id, episodeId: e.id, cleared: true, bossResult: null }, runId: `r${i}`, evolution: s.evolution, difficulty: 1 } as never, 100 + i);
      want += HS.perEpisodeFirst + (i === eps.length - 1 ? HS.perChapterBoss : 0);
      expect(out.shards).toBe(HS.perEpisodeFirst + (i === eps.length - 1 ? HS.perChapterBoss : 0));
    }
    expect(s.hogyoku.tabOpen).toBe(false);
    expect(s.shared.hogyokuShards).toBe(want);
    const again = settleStory(s, { story: { chapterId: ch.id, episodeId: eps[0]!.id, cleared: true, bossResult: null }, runId: 'x', evolution: s.evolution, difficulty: 1 } as never, 200);
    expect(again.shards).toBeUndefined();
    expect(s.slotLog.hogyokuMaterials.map((m) => m.source)).toEqual([...eps.slice(0, -1).map(() => 'episode'), 'episode', 'chapter']);
  });

  it('진화·승급마다 정수 +3, 탑 10층마다 파편 +5 (엔진 연결)', () => {
    const g = read('src/game.ts');
    expect(g).toContain("gainHogyokuMaterial(save, 'essence', BALANCE.provisional.resonanceEssence.perEvolution, 'evolution', nowMs)");
    expect(g).toContain("gainHogyokuMaterial(save, 'essence', BALANCE.provisional.resonanceEssence.perEvolution, 'ascension', nowMs)");
    expect(g).toContain("if (f.floor % HS.towerEvery === 0) out.shards = gainHogyokuMaterial(save, 'shard', HS.perTowerStep, 'tower', nowMs);");
  });
});

describe('244장 5 합체 뒤 · 6 옛 세이브', () => {
  it('세이브 형식 79 · 78 → 79: 해방 = 5단계, 2단계 게이지 비율 → 6~10단계(내림), 나머지 결정은 돌려줌', () => {
    expect(SAVE_FORMAT_VERSION).toBe(79);
    expect(typeof SAVE_MIGRATIONS[78]).toBe('function');
    const mk = (h: Record<string, unknown>, soul: number) => {
      const raw = JSON.parse(JSON.stringify(newSaveData('hollow', 1))) as Record<string, unknown> & { meta: { format: number }; shared: Record<string, unknown>; slotLog: Record<string, unknown> };
      raw.meta.format = 78;
      raw.hogyoku = { tabOpen: true, tabNotice: false, appearedAt: 0, ...h };
      raw.shared.soulCrystals = soul;
      delete raw.shared.hogyokuShards;
      delete raw.shared.resonanceEssence;
      delete raw.slotLog.hogyokuDev;
      delete raw.slotLog.hogyokuMaterials;
      return migrateSave(raw)!;
    };
    const a = mk({ fed: 100, liberated: true, liberatedAt: 5, fusionFed: 150 }, 7);
    expect(a.hogyoku).toMatchObject({ level: 7, developed: 7, resonance: false });
    expect(a.shared.soulCrystals).toBe(7 + 30); // 150 = 2.5단계 → 2단계(120) + 남은 30
    expect([a.shared.hogyokuShards, a.shared.resonanceEssence]).toEqual([0, 0]);
    expect(a.slotLog.hogyokuDev).toEqual([]);
    expect('fusionFed' in a.hogyoku).toBe(false);
    const b = mk({ fed: 60, liberated: false, liberatedAt: null, fusionFed: 0 }, 1);
    expect(b.hogyoku).toMatchObject({ level: 0, developed: 0 });
    expect(b.shared.soulCrystals).toBe(61);
    const c = mk({ fed: 100, liberated: true, liberatedAt: 5, fusionFed: 300 }, 0);
    expect(c.hogyoku.level).toBe(10);
  });

  it('붕옥 화면: 단계 띠·강화 버튼·강화 상세·지금 두 캐릭터라면·못 모은 조건 공개 (개발 단계 목록은 C.425 사용자 지시로 삭제)', () => {
    const v = read('src/ui/hogyokuView.ts');
    for (const k of ["'bha-hogyoku__stages'", "dataset.sc = 'hogyoku-develop'", "'붕옥 강화'", "'지금 두 캐릭터라면 → '", 'transcendentConditionText(d.condition)']) expect(v).toContain(k);
    for (const d of TRANSCENDENTS) expect(transcendentConditionText(d.condition)).toMatch(/\S/);
    expect(read('src/ui/bha/screens-lcd.css')).toMatch(/\.bha-hogyoku__stages \{[^}]*var\(--bha-sp-1\)/);
  });
});
