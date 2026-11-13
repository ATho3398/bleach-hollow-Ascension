// C.425 (GDD 12-2 v6.013, 코딩279): 붕옥 창 재배치 — 오른쪽 세로 목록·개발 단계 삭제, 오른쪽 = 고른 것의 상세 + 아래 고정 [강화],
// 오른쪽 위 탭 [합체][초월자 도감] = 별도 창, 왼쪽 = 개발 % 아래 지금 얻는 총 효과, 한 글자씩 세로로 깨지던 상세 줄 수정
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { BALANCE } from '../src/config/balance';
import { checkTrackOpen, developAll, developGate, fusionGate, developHogyoku, hogyokuPercent, migrateSave, newSaveData, performFusion, SAVE_FORMAT_VERSION, type SaveData } from '../src/game';
import { STORY_CHAPTERS, chapterContent, episodeKey } from '../src/data/story';
import { newStoryProgress } from '../src/game';
import { totalEffectText, tracksInFactionOrder } from '../src/ui/hogyokuView';
import { useLegacyMigrations } from './helpers/legacyGate';

// C.446: 게임은 형식 87 미만을 열지 않는다(MIN_LOADABLE_SAVE_FORMAT 87) — 이 파일의 옛 형식 마이그레이션 시험 동안만 문턱을 내린다
useLegacyMigrations();

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const HX = BALANCE.provisional.hogyoku;
const clear = (s: SaveData, fid: string) => {
  const p = (s.story[fid] ??= newStoryProgress());
  for (const c of STORY_CHAPTERS) { for (const e of chapterContent(fid, c.id)?.episodes ?? []) p.cleared[episodeKey(c.id, e.id)] = { firstAt: 1, clears: 1 }; if (!p.chapters.includes(c.id)) p.chapters.push(c.id); }
};
/** 붕옥 등장(반각성) 세이브, resonance = 두 종족 모두 클리어(공명) */
const opened = (resonance: boolean): SaveData => {
  const s = newSaveData(FACTIONS[0]!.id, 1);
  clear(s, FACTIONS[0]!.id);
  checkTrackOpen(s, 10);
  if (resonance) { clear(s, FACTIONS[1]!.id); checkTrackOpen(s, 11); }
  s.shared.soulCrystals = 0; s.shared.hogyokuShards = 0; s.shared.resonanceEssence = 0;
  return s;
};

describe('C.425 붕옥 재료별 강화 트랙 (GDD v6.014 12-3·12-4)', () => {
  it('트랙 강화 = 그 트랙 재료만, 개발 % = 세 트랙 평균 ÷ 50', () => {
    const s = opened(true);
    s.shared.soulCrystals = 15; s.shared.hogyokuShards = 9;
    for (let i = 0; i < 5; i++) expect(developHogyoku(s, 'soul', 1)).not.toBeNull(); // n강 = n개 (C.426): 1+2+3+4+5
    expect(s.shared.soulCrystals).toBe(0);
    expect(developHogyoku(s, 'shard', 1)?.shard).toBe(1);
    expect(s.hogyoku.tracks).toEqual({ soul: 5, shard: 1, essence: 0 });
    expect(hogyokuPercent(s.hogyoku)).toBe(4); // 평균 2 ÷ 50
    s.hogyoku.tracks = { soul: 30, shard: 20, essence: 10 };
    expect(hogyokuPercent(s.hogyoku)).toBe(40); // GDD 예시
  });

  it('반각성 한계: 공명 전에는 트랙마다 25강까지', () => {
    const s = opened(false);
    s.hogyoku.tracks.soul = HX.trackHalf;
    s.shared.soulCrystals = 999;
    expect(developGate(s, 'soul').missing).toEqual(['resonance']);
    expect(developHogyoku(s, 'soul')).toBeNull();
    expect(s.shared.soulCrystals).toBe(999);
  });

  it('일괄 강화: 가진 재료로 갈 수 있는 데까지, 낮은 트랙부터 번갈아', () => {
    const s = opened(true);
    s.shared.soulCrystals = 6; s.shared.hogyokuShards = 5; s.shared.resonanceEssence = 1;
    s.hogyoku.tracks.shard = 1;
    const r = developAll(s, 5);
    expect(r.gained).toEqual({ soul: 3, shard: 2, essence: 1 }); // n강 = n개: 1+2+3 · 2+3 · 1
    expect(s.hogyoku.tracks).toEqual({ soul: 3, shard: 3, essence: 1 });
    expect([s.shared.soulCrystals, s.shared.hogyokuShards, s.shared.resonanceEssence]).toEqual([0, 0, 0]);
    expect(r.records.map((x) => x.track).slice(0, 3)).toEqual(['soul', 'essence', 'soul']); // 0강 둘 → 목록 순서 soul, 다음 essence(0) …
    expect(developAll(s).records).toEqual([]);
  });

  it('합체 조건 = 세 트랙 모두 50강 (합체 뒤 25강은 c59 합체 테스트)', () => {
    const s = opened(true);
    s.hogyoku.tracks = { soul: 50, shard: 50, essence: 49 };
    s.hogyoku.developed = 149;
    expect(performFusion(s).ok).toBe(false);
    expect(fusionGate(s).missing).toContain('develop');
    s.hogyoku.tracks.essence = 50;
    expect(fusionGate(s).missing).not.toContain('develop');
  });

  it('옛 세이브 형식 79 → 80: n단계 → 세 트랙 n×5강, 오른 보너스 보존', () => {
    expect(SAVE_FORMAT_VERSION).toBe(87);
    const raw = JSON.parse(JSON.stringify(newSaveData('hollow', 1))) as Record<string, unknown> & { meta: { format: number } };
    raw.meta.format = 79;
    raw.hogyoku = { tabOpen: true, tabNotice: false, appearedAt: 0, level: 5, developed: 15, resonance: true, resonatedAt: 0 }; // 합체 2번 뒤 5단계 (옛 +15%)
    const m = migrateSave(raw)!;
    expect(m.hogyoku.tracks).toEqual({ soul: 25, shard: 25, essence: 25 });
    expect(m.hogyoku.developed).toBe(75 + 100); // 지금 75강 + 깎였던 10단계 × 10강
    expect('level' in m.hogyoku).toBe(false);
    expect(m.hogyoku.developed * HX.perStepBonus).toBeGreaterThanOrEqual(0.15);
  });
});

describe('C.425 붕옥 창 재배치', () => {
  it('지금 얻는 총 효과 = 붕옥 개발 보너스 + 초월자 보너스', () => {
    const s = newSaveData('hollow', 0);
    expect(totalEffectText(s).main).toBe('두 캐릭터 전 능력치 +0%');
    s.hogyoku.developed = 30;
    s.transcendentDex.push({ id: 'x', at: 0, fusionIndex: 1 });
    const t = totalEffectText(s);
    expect(t.main).toMatch(/\+5%$/); // 30강 × 0.1% + 1종 × 2% (임시값)
    expect(t.parts).toContain('붕옥 강화 30강 +3%');
    expect(t.parts).toContain('초월자 1종 +2%');
  });

  it('합체 창 두 칸 순서 = 종족 설정 순서 (지금 키우는 트랙과 무관, 종족 id 분기 없음)', () => {
    const order = FACTIONS.map((f) => f.id);
    for (const first of order) {
      const s = newSaveData(first, 0);
      for (const other of order.filter((x) => x !== first)) s.otherTracks.push({ ...newSaveData(other, 0), parkedAt: 0 } as never);
      expect(tracksInFactionOrder(s).map((t) => t.factionId)).toEqual(order);
    }
  });

  it('화면: 세로 목록·개발 단계 삭제, 탭 2개 = 별도 창, [강화]는 오른쪽 아래 고정', () => {
    const v = read('src/ui/hogyokuView.ts');
    for (const gone of ["'bha-hglist'", 'HOGYOKU_LIST', 'stepList', "'개발 단계'"]) expect(v).not.toContain(gone);
    for (const k of ["dataset.sc = 'hogyoku-fusion'", "dataset.sc = 'hogyoku-dex'", "'bha-hgfoot'", "art.onclick = () => pick('orb')", "dataset.sc = 'hogyoku-develop-all'", '지금 두 캐릭터라면 → ', "'상세 보기'", 'dexGrid(', 'dexCard(']) expect(v).toContain(k);
    expect(v).not.toMatch(/faction(Id)? === '(hollow|shinigami)'/);
    const app = read('src/ui/app.ts');
    for (const k of ["open('hogyoku-fusion'", "open('hogyoku-dex'", "open('fusion-confirm'", "stashSlot(store, slot, 'fusion')"]) expect(app).toContain(k);
  });

  it('CSS: 상세 줄 이름표는 줄바꿈 없음(폭 0 으로 눌리지 않음) · 상세만 스크롤 · 버튼 줄 고정 · 토큰만', () => {
    const css = read('src/ui/bha/screens-lcd.css');
    expect(css).toMatch(/\.bha-hgrow__label \{[^}]*flex: none;[^}]*white-space: nowrap/);
    expect(css).toMatch(/\.bha-hgdetail \{[^}]*overflow-y: auto/);
    expect(css).toMatch(/\.bha-hgfoot \{ flex: none;/);
    const block = css.slice(css.indexOf('붕옥 창 배치 (C.421'), css.indexOf('.bha-articon'));
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
  });
});

describe('C.425 붕옥 용어·얻는 곳 (GDD v6.015)', () => {
  it('이름 = 데이터 한 곳: 트랙 세공·정제·주입 / 재료 고순도 윤활제·혼백 여과기·영압 결정', async () => {
    const { HOGYOKU_TRACK_NAMES, HOGYOKU_MATERIAL_NAMES } = await import('../src/data/hogyoku');
    expect(HOGYOKU_TRACK_NAMES).toEqual({ soul: '세공', shard: '정제', essence: '주입' });
    expect(HOGYOKU_MATERIAL_NAMES).toEqual({ soul: '고순도 윤활제', shard: '혼백 여과기', essence: '영압 결정' });
    for (const f of ['src/ui/hogyokuView.ts', 'src/ui/rebirthView.ts', 'src/ui/tutorialGoalsView.ts', 'src/data/help/guides.json']) for (const old of ['영혼 결정', '붕옥 파편', '공명의 정수']) expect(read(f), `${f} ${old}`).not.toContain(old);
  });

  it('사냥 드롭: 강적·보스 확정, 진 전투 없음, 같은 원정 = 같은 드롭', async () => {
    const { rollHogyokuDrops } = await import('../src/game');
    const D = BALANCE.provisional.hogyokuDrops;
    const b = (won: boolean, enemyClass: string) => ({ won, enemyClass });
    const sum = (c: Record<string, number>) => Object.values(c).reduce((a, x) => a + x, 0);
    expect(sum(rollHogyokuDrops([b(true, 'elite'), b(true, 'boss'), b(false, 'elite')], 7))).toBe(D.eliteCount + D.bossCount);
    const many = Array.from({ length: 3000 }, () => b(true, 'normal'));
    const r = rollHogyokuDrops(many, 3);
    expect(r).toEqual(rollHogyokuDrops(many, 3));
    expect(sum(r) / 3000).toBeGreaterThan(D.normalChance - 0.05);
    expect(sum(r) / 3000).toBeLessThanOrEqual(D.normalChance + 0.05);
    for (const id of ['soul', 'shard', 'essence'] as const) expect(r[id] / sum(r)).toBeCloseTo(D.weights[id] / (D.weights.soul + D.weights.shard + D.weights.essence), 1); // C.426 비율 1:1:1
    expect(rollHogyokuDrops([], 1, 2).soul).toBe(2); // 폭풍 강적 추가분 = 첫 재료
  });

  it('우라하라: 재료 묶음 3종을 골드로 판다 → 보유 + 런 로그 wanderer', async () => {
    const { buyWandererItem } = await import('../src/shop');
    const { WANDERER_ITEMS } = await import('../src/data/shop');
    expect(WANDERER_ITEMS.filter((w) => w.kind === 'hogyokuMat').map((w) => w.material)).toEqual(['soul', 'shard', 'essence']);
    const s = newSaveData('hollow', 0);
    s.shared.tradeCoins = 1000;
    s.shared.wanderer.visit = { at: 0, runId: 1, tier: 1, stock: [{ itemId: 'w-hg-shard', price: 120, sold: false }] };
    const r = buyWandererItem(s, FACTIONS[0]!, 'w-hg-shard', 9);
    expect(r.ok).toBe(true);
    expect(s.shared.hogyokuShards).toBe(BALANCE.provisional.wanderer.items['w-hg-shard']!.amount);
    expect(s.slotLog.hogyokuMaterials.at(-1)).toMatchObject({ kind: 'shard', source: 'wanderer', at: 9 });
  });
});
