// C.414 (GDD 244장 2~6): 붕옥 안 B(반각성 → 공명) + 붕옥 개발(재료 3종 · 10단계 · 단계마다 전 능력치 +1%, 100% + 공명 + 1위 = 합체)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS } from '../src/data/factions';
import { GUIDES } from '../src/data/help';
import { HOGYOKU_STEP_NAMES, transcendentComboText } from '../src/data/hogyoku';
import { chapterContent, STORY_CHAPTERS } from '../src/data/story';
import { TRANSCENDENTS } from '../src/data/transcendents';
import { HOGYOKU_TRACK_IDS, trackCostSum, trackStepCost } from '../src/engine/transcend';
import { guidePending } from '../src/engine/tutorial';
import { checkTrackOpen, developGate, developHogyoku, hogyokuPercent, migrateSave, newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, settleStory, statBonusOf, type SaveData } from '../src/game';
import { clearStory } from './helpers/storyClear';
import { useLegacyMigrations } from './helpers/legacyGate';

// C.446: 게임은 형식 87 미만을 열지 않는다(MIN_LOADABLE_SAVE_FORMAT 87) — 이 파일의 옛 형식 마이그레이션 시험 동안만 문턱을 내린다
useLegacyMigrations();

const HX = BALANCE.provisional.hogyoku;
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const rich = (s: SaveData) => { s.shared.soulCrystals = 5000; s.shared.hogyokuShards = 5000; s.shared.resonanceEssence = 5000; };
const other = (fid: string) => FACTIONS.find((f) => f.id !== fid)!.id;

// C.425 (GDD v6.014): 10단계 개발 → 재료별 강화 트랙 3개(각 50강) — 이 묶음의 기대값을 트랙 규칙으로 바꿈 (지키던 결정: 반각성 한계·공명 처음 한 번·모자라면 안 깎임·개발 기록)
describe('12-3 강화 트랙 표 (balance 한 곳)', () => {
  it('트랙 3개 = 재료 3종 · 50강 · 반각성 25강 · 강당 비용 n강 = n개(C.426 v6.016) · 합체 뒤 30강 · 단계 이름 10개(10% 구간)', () => {
    expect(HOGYOKU_TRACK_IDS).toEqual(['soul', 'shard', 'essence']);
    expect([HX.trackMax, HX.trackHalf]).toEqual([50, 25]);
    expect(HOGYOKU_STEP_NAMES).toHaveLength(10);
    expect(HOGYOKU_TRACK_IDS.map((t) => [trackCostSum(t, 0, 25), trackCostSum(t, 25, 50)])).toEqual([[325, 950], [325, 950], [325, 950]]);
    for (const t of HOGYOKU_TRACK_IDS) expect([trackStepCost(t, 1), trackStepCost(t, 26), trackStepCost(t, 50)]).toEqual([1, 26, 50]);
    expect(HX.afterFusionLevel).toBe(30);
    expect(HX.perStepBonus * HX.trackMax * 3).toBeCloseTo(0.15); // 세 트랙 50강 = +15%
  });
});

describe('244장 2 반각성 → 공명', () => {
  it('첫 종족 스토리만 = 반각성: 트랙마다 25강까지만, 26강은 공명 필요', () => {
    const s = newSaveData('hollow', 1);
    clearStory(s);
    checkTrackOpen(s, 10);
    expect(s.hogyoku.tabOpen).toBe(true);
    expect(s.hogyoku.resonance).toBe(false);
    rich(s);
    for (let i = 1; i <= HX.trackHalf; i++) expect(developHogyoku(s, 'soul', 20 + i)?.level).toBe(i);
    expect(developHogyoku(s, 'soul', 30)).toBeNull();
    expect(developGate(s, 'soul').missing).toEqual(['resonance']);
    expect(developGate(s, 'shard').ok).toBe(true); // 다른 트랙은 따로
    expect(statBonusOf(s).total).toBeCloseTo(0.025);
  });

  it('다른 종족 스토리도 전부 = 공명: 처음 한 번, 정수 +30, 컷, 26~50강 열림', () => {
    const s = newSaveData('hollow', 1);
    clearStory(s);
    checkTrackOpen(s, 10);
    clearStory(s, other('hollow'));
    const ess = s.shared.resonanceEssence;
    checkTrackOpen(s, 11);
    expect(s.hogyoku).toMatchObject({ resonance: true, resonatedAt: 11 });
    expect(s.shared.resonanceEssence).toBe(ess); // C.425 (v6.015): 공명은 재료를 주지 않는다 — 안내 카드만
    expect(guidePending(s.help, 'hogyoku-resonance')).toBe(true);
    checkTrackOpen(s, 12);
    expect(s.hogyoku.resonatedAt).toBe(11); // 두 번은 없다
    rich(s);
    for (const t of HOGYOKU_TRACK_IDS) while (developHogyoku(s, t, 13)) { /* */ }
    expect(s.hogyoku.tracks).toEqual({ soul: 50, shard: 50, essence: 50 });
    expect(hogyokuPercent(s.hogyoku)).toBe(100);
    expect(developGate(s, 'soul').missing).toEqual(['max']);
    expect(statBonusOf(s).total).toBeCloseTo(0.15);
  });

  it('재료가 모자라면 못 올리고 하나도 안 깎인다 · 개발 기록(트랙·강·재료·종족·회차)', () => {
    const s = newSaveData('hollow', 1);
    clearStory(s);
    checkTrackOpen(s, 1);
    s.shared.soulCrystals = 99;
    s.shared.hogyokuShards = trackStepCost('shard', 1) - 1;
    s.shared.resonanceEssence = 99;
    expect(developGate(s, 'shard').missing).toEqual(['short']);
    expect(developHogyoku(s, 'shard')).toBeNull();
    expect(s.shared.hogyokuShards).toBe(trackStepCost('shard', 1) - 1);
    s.shared.hogyokuShards += 1;
    const r = developHogyoku(s, 'shard', 77)!;
    expect(r).toEqual({ at: 77, track: 'shard', level: 1, soul: 0, shard: trackStepCost('shard', 1), essence: 0, factionId: 'hollow', cycle: 1 });
    expect(s.slotLog.hogyokuDev).toEqual([r]);
    expect([s.shared.soulCrystals, s.shared.hogyokuShards, s.shared.resonanceEssence]).toEqual([99, 0, 99]); // 그 트랙 재료만
  });

  it('공명 컷 1장 · 붕옥 아이콘을 가리킨다', () => {
    const g = GUIDES['hogyoku-resonance'];
    expect(g).toHaveLength(1);
    expect(g[0]!.targets).toEqual(['@.bha-prop--hogyoku']);
  });
});

// C.425 (GDD v6.015): 재료 얻는 곳 = 사냥 드롭 + 우라하라뿐 — 옛 스토리·탑·진화·승급·공명 지급이 없어졌는지 (지키던 결정: 등장 전에도 쌓이고 기록은 slotLog.hogyokuMaterials)
describe('12-3 재료 얻는 곳 (v6.015: 사냥 + 우라하라)', () => {
  it('스토리 화 첫 클리어·장 보스로는 재료를 주지 않는다', () => {
    const s = newSaveData('hollow', 1);
    s.evolution.tierIndex = 3;
    const ch = STORY_CHAPTERS[0]!;
    const eps = chapterContent('hollow', ch.id)!.episodes;
    for (const [i, e] of eps.entries()) settleStory(s, { story: { chapterId: ch.id, episodeId: e.id, cleared: true, bossResult: null }, runId: `r${i}`, evolution: s.evolution, difficulty: 1 } as never, 100 + i);
    expect([s.shared.soulCrystals, s.shared.hogyokuShards, s.shared.resonanceEssence]).toEqual([0, 0, 0]);
    expect(s.slotLog.hogyokuMaterials).toEqual([]);
  });

  it('진화·승급·탑·공명·등급전·환생 지급 코드가 없다', () => {
    const g = read('src/game.ts');
    for (const gone of ["'essence', BALANCE", "'shard', HS.", "'resonance', nowMs)", 'perRankWin', 'perRebirth', 'hogyokuShards.perEpisodeFirst']) expect(g).not.toContain(gone);
    expect(g).toContain("gainHogyokuMaterial(save, id, drops[id], 'hunt', nowMs)");
  });
});

describe('244장 5 합체 뒤 · 6 옛 세이브', () => {
  it('78 → 79: 해방 = 5단계, 2단계 게이지 비율 → 6~10단계(내림), 나머지 결정은 돌려줌 (→ 80 트랙 n×5강)', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(80);
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
    expect(a.hogyoku).toMatchObject({ tracks: { soul: 35, shard: 35, essence: 35 }, developed: 105, resonance: false }); // C.425 형식 80: 7단계 → 세 트랙 35강
    expect(a.shared.soulCrystals).toBe(7 + 30); // 150 = 2.5단계 → 2단계(120) + 남은 30
    expect([a.shared.hogyokuShards, a.shared.resonanceEssence]).toEqual([0, 0]);
    expect(a.slotLog.hogyokuDev).toEqual([]);
    expect('fusionFed' in a.hogyoku).toBe(false);
    const b = mk({ fed: 60, liberated: false, liberatedAt: null, fusionFed: 0 }, 1);
    expect(b.hogyoku).toMatchObject({ tracks: { soul: 0, shard: 0, essence: 0 }, developed: 0 });
    expect(b.shared.soulCrystals).toBe(61);
    const c = mk({ fed: 100, liberated: true, liberatedAt: 5, fusionFed: 300 }, 0);
    expect(c.hogyoku.tracks).toEqual({ soul: 50, shard: 50, essence: 50 });
  });

  it('붕옥 화면: 단계 띠·강화 버튼·강화 상세·지금 두 캐릭터라면·못 모은 조건 공개 (개발 단계 목록은 C.425 사용자 지시로 삭제)', () => {
    const v = read('src/ui/hogyokuView.ts');
    for (const k of ["'bha-hogyoku__stages'", "dataset.sc = 'hogyoku-develop'", "'붕옥 개발'", '`${m.track} — ${m.name}`', "'지금 두 캐릭터라면 → '", 'transcendentComboText(d.combo)']) expect(v).toContain(k);
    for (const d of TRANSCENDENTS) expect(transcendentComboText(d.combo)).toMatch(/\S/);
    expect(read('src/ui/bha/screens-lcd.css')).toMatch(/\.bha-hogyoku__stages \{[^}]*var\(--bha-sp-1\)/);
  });
});
