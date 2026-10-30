// C.85 (GDD 36장): 도전의 탑 50층 — 층 구성·★·배율·보상(첫 클리어만)·세이브(형식 30)·런 로그·칭호·종족 분기 없음
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getBoss, isBossId } from '../src/data/bosses';
import { FACTIONS } from '../src/data/factions';
import { TITLES } from '../src/data/titles';
import { createCombat, playCombatBot } from '../src/engine/combat';
import { difficultyEnemyScale } from '../src/engine/difficulty';
import { towerFloorText, towerLabels } from '../src/engine/faction';
import {
  clampFloor, createTowerCombat, nextTowerFloor, TOWER_FLOORS, towerBossId, towerFloor, towerFloorKind, towerFloorMultiplier, towerOpen, towerReward, towerStar, towerUnlockBossId,
} from '../src/engine/tower';
import { checkCondition } from '../src/engine/titles';
import { emptyRunLog } from '../src/engine/runLog';
import { migrateSave, newSaveData, performRebirth, recordTowerBattle, sanitizeTower, SAVE_FORMAT_VERSION, TRACK_KEYS, type SaveData } from '../src/game';
import { TITLE_TABS } from '../src/ui/titleDexView';
import { towerRewardText } from '../src/ui/towerView';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const TX = BALANCE.provisional.tower;
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** 끝난 전투를 흉내 낸다 (이기거나 지게) */
function ended(floor: number, won: boolean) {
  const f = towerFloor(floor);
  const s = createTowerCombat(f, {}, 1);
  s.status = won ? 'won' : 'lost';
  return { f, s };
}

describe('36장 4·5번: 층 구성·★·배율', () => {
  it('50층, ★ = ⌈층 ÷ 10⌉ (C.220: ★ 최대 4 — 41~50층도 ★4)', () => {
    expect(TOWER_FLOORS).toBe(50);
    expect([1, 10, 11, 20, 21, 30, 31, 40, 41, 50].map(towerStar)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 4, 4]);
    expect(clampFloor(0)).toBe(1);
    expect(clampFloor(99)).toBe(50);
  });
  it('보통 층 = 일반, 5의 배수 = 강적, 10의 배수 = 보스', () => {
    for (let n = 1; n <= TOWER_FLOORS; n++) {
      const f = towerFloor(n);
      const want = n % 10 === 0 ? 'boss' : n % 5 === 0 ? 'elite' : 'normal';
      expect(towerFloorKind(n)).toBe(want);
      expect(f.kind).toBe(want);
      if (want === 'boss') expect(isBossId(f.bossId)).toBe(true);
      else {
        expect(f.bossId).toBeNull();
        expect(f.enemy.class).toBe(want);
        expect(f.enemy.testOnly).toBeFalsy();
      }
    }
  });
  it('보스 층: 10·40층 sand-maw, 20·30·50층은 설정한 보스(없으면 sand-maw 로 이어 둔다)', () => {
    expect(towerBossId(10)).toBe('sand-maw');
    expect(towerBossId(40)).toBe('sand-maw');
    for (const n of [20, 30, 50]) expect(towerBossId(n)).toBe(isBossId(TX.bossFloors[n]) ? TX.bossFloors[n] : 'sand-maw');
    expect(TX.bossFloors[20]).toBe('canyon-king');
    expect(TX.bossFloors[30]).toBe('forest-lord');
    expect(TX.bossFloors[50]).toBe('forest-lord');
    expect(towerFloor(50).final).toBe(true);
    expect(towerFloor(40).final).toBe(false);
  });
  it('같은 층은 늘 같은 적 (시드 = 층 번호), 층마다 골고루 다른 적', () => {
    for (let n = 1; n <= TOWER_FLOORS; n++) expect(towerFloor(n).enemy).toEqual(towerFloor(n).enemy);
    const normals = new Set(Array.from({ length: TOWER_FLOORS }, (_, i) => i + 1).filter((n) => towerFloorKind(n) === 'normal').map((n) => towerFloor(n).enemy.id));
    expect(normals.size).toBeGreaterThan(5);
  });
  it('구간 안에서 층마다 +4% (첫 층 +0% → 끝 층 +36%), 50층은 finalFloorBonus 더', () => {
    expect(towerFloorMultiplier(1)).toBeCloseTo(1);
    expect(towerFloorMultiplier(5)).toBeCloseTo(1.16 * TX.eliteScale); // 강적 층 보정 (C.85 측정)
    expect(towerFloorMultiplier(4)).toBeCloseTo(1.12);
    expect(towerFloorMultiplier(10)).toBeCloseTo(1.36);
    expect(towerFloorMultiplier(11)).toBeCloseTo(1);
    expect(towerFloorMultiplier(49)).toBeCloseTo(1.32);
    expect(towerFloorMultiplier(50)).toBeCloseTo(1.36 * (1 + TX.finalFloorBonus));
  });
  it('적 체력·공격 = 바탕 × ★ 배율 × 층 배율 (보스는 강적 입문 보정 없이)', () => {
    const boss = towerFloor(10);
    const kb = difficultyEnemyScale(1, 'normal');
    expect(boss.enemy.hpInAttacks).toBeCloseTo(getBoss('sand-maw').enemy.hpInAttacks * kb.hp * 1.36);
    expect(boss.enemy.attackInAttacks).toBeCloseTo(getBoss('sand-maw').enemy.attackInAttacks * kb.attack * 1.36);
  });
  it('탑 전투: 체력 가득, ★ 기준 능력치, 보스 층은 보스 재료(페이즈·기믹·시간)', () => {
    const s = createTowerCombat(towerFloor(25), { playerStartHpFraction: 0.3 }, 7);
    expect(s.player.hp).toBe(s.player.maxHp);
    const b = createTowerCombat(towerFloor(10), {}, 7);
    expect(b.boss).toBeTruthy();
    expect(createTowerCombat(towerFloor(9), {}, 7).boss ?? null).toBeNull();
    // 끝까지 돌아간다
    const end = playCombatBot(createCombat(3, { enemy: towerFloor(1).enemy }));
    expect(end.status).not.toBe('playing');
  });
  it('다음 층 = 최고 + 1, 꼭대기를 깼으면 없음', () => {
    expect(nextTowerFloor(0)).toBe(1);
    expect(nextTowerFloor(17)).toBe(18);
    expect(nextTowerFloor(50)).toBeNull();
  });
});

describe('36장 8번: 보상 (첫 클리어만)', () => {
  it('골드 10 × ★, 5의 배수 든든한 먹이 1, 10의 배수 영옥 3 + 칭호, 50층 영옥 10 추가 — 골드 합 1400 (C.220: 41~50층 ★4)', () => {
    expect(towerReward(3)).toEqual({ gold: 10, food: null, jade: 0, titleId: null });
    expect(towerReward(15)).toEqual({ gold: 20, food: 'hearty', jade: 0, titleId: null });
    expect(towerReward(30)).toEqual({ gold: 30, food: null, jade: 3, titleId: 'tower-30' });
    expect(towerReward(50)).toEqual({ gold: 40, food: null, jade: 13, titleId: 'tower-50' });
    let gold = 0;
    for (let n = 1; n <= TOWER_FLOORS; n++) gold += towerReward(n).gold;
    expect(gold).toBe(1400);
  });
  it('이기면 최고 층·보상, 같은 층을 다시 이겨도 보상 없음, 지면 아무것도 잃지 않는다(리스크·허기·컨디션 그대로)', () => {
    const save = newSaveData('hollow', 1);
    const before = { ...save.nest };
    const lost = ended(1, false);
    const r0 = recordTowerBattle(save, lost.f, lost.s, 10);
    expect(r0).toMatchObject({ won: false, firstClear: false, gold: 0, jade: 0, next: 1 });
    expect(save.tower.best).toBe(0);
    for (let n = 1; n <= 5; n++) {
      const w = ended(n, true);
      const r = recordTowerBattle(save, w.f, w.s, 10 + n);
      expect(r.firstClear).toBe(true);
      expect(r.next).toBe(n + 1);
    }
    expect(save.tower.best).toBe(5);
    expect(save.shared.tradeCoins).toBe(50);
    expect(save.shared.food.hearty).toBeGreaterThanOrEqual(1);
    // 지나온 층을 다시 이겨도(화면은 막지만) 보상 없음
    const again = ended(3, true);
    const ra = recordTowerBattle(save, again.f, again.s, 30);
    expect(ra).toMatchObject({ won: true, firstClear: false, gold: 0 });
    expect(save.shared.tradeCoins).toBe(50);
    expect(save.nest).toEqual(before);
    // 런 로그: 매 판 기록, 전투 기록은 enemyClass 'tower'
    expect(save.runLog.towerBattles).toHaveLength(7);
    expect(save.runLog.towerBattles[1]).toMatchObject({ floor: 1, star: 1, won: true, firstClear: true, factionId: 'hollow', tierIndex: 0 });
    expect(save.runLog.battles.every((b) => b.enemyClass === 'tower')).toBe(true);
  });
  it('보스 층: 영옥 3·칭호 「탑 10층 돌파」·보스 도감 처치 수 (보스 칭호·보스 특성은 스토리에서만)', () => {
    const save = newSaveData('shinigami', 1);
    save.tower.best = 9;
    const w = ended(10, true);
    recordTowerBattle(save, w.f, w.s, 100);
    expect(save.shared.jade).toBe(3);
    expect(save.bossDex['sand-maw']?.kills).toBe(1);
    expect(save.titles.map((t) => t.titleId)).toContain('tower-10');
    expect(save.titles.map((t) => t.titleId)).not.toContain('boss-sand-maw');
    expect(save.titles.find((t) => t.titleId === 'tower-10')?.trigger).toBe('tower');
  });
  it('50층 = 탑의 정상 (영옥 13), 이후 다음 층 없음', () => {
    const save = newSaveData('hollow', 1);
    save.tower.best = 49;
    const w = ended(50, true);
    const r = recordTowerBattle(save, w.f, w.s, 100);
    expect(r).toMatchObject({ firstClear: true, jade: 13, gold: 40, next: null });
    expect(save.titles.map((t) => t.titleId)).toContain('tower-50');
  });
});

describe('36장 2·3번: 열림·화면 문구', () => {
  it('스토리 1장 보스(종족별 스토리 데이터)를 이기면 열린다', () => {
    for (const f of FACTIONS) {
      const boss = towerUnlockBossId(f.id);
      expect(boss).toBe('sand-maw');
      const log = emptyRunLog();
      expect(towerOpen(log, f.id)).toBe(false);
      log.bossBattles.push({ at: 1, runId: 1, factionId: f.id, bossId: boss!, won: false, firstKill: false, durationSeconds: 1, phase: 1, seals: 0, lossReason: 'hp', tierIndex: 1, episode: 'ch1/ep4' });
      expect(towerOpen(log, f.id)).toBe(false);
      log.bossBattles.push({ ...log.bossBattles[0]!, won: true, firstKill: true });
      expect(towerOpen(log, f.id)).toBe(true);
      expect(towerOpen(emptyRunLog(), f.id, 3)).toBe(true);
    }
  });
  it('종족 설정 tower: 이름 "도전의 탑", 50층 보스 "탑의 주인", 층 표시 "n층"', () => {
    for (const f of FACTIONS) {
      const L = towerLabels(f);
      expect(L.name).toBe('도전의 탑');
      expect(L.finalBossName).toBe('탑의 주인');
      expect(L.locked).toContain('스토리 1장');
      expect(towerFloorText(f, 12)).toBe('12층');
      expect(towerRewardText(f, towerReward(10))).toContain('칭호 「탑 10층 돌파」');
    }
  });
  it('원정 출발 화면 머리 탭 [자유 원정]/[스토리] (탑은 C.217 부터 월드맵 장소, GDD 139장 1), 칭호 도감 [탑] 탭', () => {
    expect(src('src/ui/storyView.ts')).not.toMatch(/id: 'tower', label: '탑'/);
    expect(src('src/ui/worldMapView.ts')).toContain('tower: hd.onTower');
    expect(TITLE_TABS.map((t) => t.label)).toContain('탑');
  });
});

describe('36장 8번: 칭호 5개', () => {
  it('탑 10/20/30/40층 돌파 · 탑의 정상 — towerFloorCleared 조건, 임시', () => {
    const tower = TITLES.filter((t) => t.kind === 'tower');
    expect(tower.map((t) => t.id)).toEqual(['tower-10', 'tower-20', 'tower-30', 'tower-40', 'tower-50']);
    expect(tower.map((t) => t.name.hollow)).toEqual(['탑 10층 돌파', '탑 20층 돌파', '탑 30층 돌파', '탑 40층 돌파', '탑의 정상']);
    expect(tower.every((t) => t.provisional === true && t.condition?.type === 'towerFloorCleared')).toBe(true);
    const log = emptyRunLog();
    log.towerBattles.push({ at: 1, factionId: 'hollow', floor: 20, star: 2, enemyId: 'x', bossId: null, won: true, durationSeconds: 1, tierIndex: 0, formId: null, firstClear: true });
    expect(checkCondition({ type: 'towerFloorCleared', floor: 20 }, log)).toBe(true);
    expect(checkCondition({ type: 'towerFloorCleared', floor: 30 }, log)).toBe(false);
  });
});

describe('36장 9번: 세이브 (형식 30)', () => {
  it('트랙마다 tower { best }, 새 세이브는 0', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(30);
    expect(TRACK_KEYS).toContain('tower');
    expect(newSaveData('hollow', 1).tower).toEqual({ best: 0 });
    expect(newSaveData('hollow', 1).runLog.towerBattles).toEqual([]);
  });
  it('옛 세이브(형식 29)는 best 0·빈 towerBattles 로 열린다 (쉬는 트랙도)', () => {
    const s = newSaveData('hollow', 3) as unknown as Record<string, unknown>;
    delete s.tower;
    delete (s.runLog as Record<string, unknown>).towerBattles;
    (s.meta as { format: number }).format = 29;
    const other = newSaveData('shinigami', 3) as unknown as Record<string, unknown>;
    const otherTrack: Record<string, unknown> = {};
    for (const k of TRACK_KEYS) otherTrack[k] = other[k];
    delete otherTrack.tower;
    otherTrack.parkedAt = 3;
    s.otherTracks = [otherTrack];
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.tower).toEqual({ best: 0 });
    expect(m.runLog.towerBattles).toEqual([]);
    expect(m.otherTracks[0]?.tower).toEqual({ best: 0 });
  });
  it('깨진 값 보정 0~50, 환생해도 유지', () => {
    expect(sanitizeTower({ best: 99 })).toEqual({ best: 50 });
    expect(sanitizeTower({ best: -3 })).toEqual({ best: 0 });
    expect(sanitizeTower(null)).toEqual({ best: 0 });
    expect(sanitizeTower({ best: 12.7 })).toEqual({ best: 12 });
    const save: SaveData = newSaveData('hollow', 1);
    save.evolution.tierIndex = 4;
    save.tower.best = 23;
    const r = performRebirth(save, null, 5);
    expect(r.ok).toBe(true);
    expect(save.tower.best).toBe(23);
  });
});

describe('36장 12번: 종족 분기 없음', () => {
  it('탑 엔진·탑 화면에 종족 id 문자열이 없다', () => {
    for (const p of ['src/engine/tower.ts', 'src/ui/towerView.ts']) {
      const code = src(p);
      for (const f of FACTIONS) expect(code.includes(`'${f.id}'`), `${p}: '${f.id}'`).toBe(false);
    }
  });
});
