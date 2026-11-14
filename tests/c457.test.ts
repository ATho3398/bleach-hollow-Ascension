// C.457 (GDD v6.083 17-4, 사용자 2026-11-15): 테스트 모드 최신화 —
// ① 특수던전(레이드)을 깨고 나오면 주간 횟수가 다 써져 [이번 주 끝]으로 막히던 것 → 테스트 칸은 횟수를 쓰지 않는다(회귀)
// ② 테스트 전투 = 적 설정 창(적 종류·★·배율·공격 여부·무적) — 엔진 enemyPassive·enemyImmortal ③ 붕옥 재료 3종 채우기·[재료 각 +100]
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getEnemy } from '../src/data/enemies';
import { BOSSES } from '../src/data/bosses';
import { createCombat, step } from '../src/engine/combat';
import { materialHave } from '../src/engine/hogyokuMaterials';
import { entriesLeft } from '../src/engine/specialDungeon';
import {
  applyTestArenaParams, createTestItem, newTestSave, testAddHogyokuMaterials, testArenaEnemy, testRefillSpecial,
  TEST_ARENA_SECONDS, TEST_CURRENCIES, TEST_HOGYOKU_MATERIAL_STEP, TEST_WEALTH, type TestArenaChoice,
} from '../src/engine/testMode';
import { enterSpecial } from '../src/game';
import { useImmediateHits } from './helpers/hitDelay';

useImmediateHits();

const NOW = Date.UTC(2026, 10, 15, 3);

describe('C.457 ① 특수던전 횟수 (레이드 클리어 뒤 진행 막힘 회귀)', () => {
  it('보스전은 주 1회 — 진짜 게임은 두 번째 입장이 막힌다(재현), 테스트 칸은 비워서 계속 들어간다', () => {
    const s = newTestSave('hollow', NOW);
    const boss = BOSSES[0]!.id;
    expect(enterSpecial(s, 'boss', boss, NOW)).toBe(true);
    expect(entriesLeft(s.shared.special, `boss:${boss}`, NOW)).toBe(0); // 깨고 나오면 [이번 주 끝] — 이게 막힌 원인
    expect(enterSpecial(s, 'boss', boss, NOW + 1)).toBe(false);
    testRefillSpecial(s);
    expect(entriesLeft(s.shared.special, `boss:${boss}`, NOW)).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) {
      expect(enterSpecial(s, 'boss', boss, NOW + 10 + i)).toBe(true);
      testRefillSpecial(s);
    }
  });
  it('화면 연결: 테스트 칸은 입장 뒤·목록을 그릴 때 횟수를 비운다', () => {
    const src = readFileSync('src/ui/app.ts', 'utf8');
    const run = src.slice(src.indexOf('function startSpecialRun'), src.indexOf('function sideBattleParams'));
    expect(run).toMatch(/enterSpecial\([\s\S]*if \(testOn\) testRefillSpecial\(s0\)/);
    expect(src).toMatch(/specialState\(save!\);[^\n]*\n\s*if \(testOn\) testRefillSpecial\(save!\)/);
  });
});

describe('C.457 ③ 붕옥 재료', () => {
  it('새 테스트 칸 = 재료 3종·초월 조각 넉넉히 (옛: soul 만 99999, shard·essence 0)', () => {
    const s = newTestSave('hollow', NOW);
    for (const t of ['soul', 'shard', 'essence'] as const) expect(materialHave(s, t)).toBe(TEST_WEALTH);
    expect(s.shared.transcendShards).toBe(TEST_WEALTH);
  });
  it('[재료 각 +100] = 3종에 각 100', () => {
    const s = newTestSave('hollow', NOW);
    s.shared.soulCrystals = 0; s.shared.hogyokuShards = 5; s.shared.resonanceEssence = 0;
    expect(testAddHogyokuMaterials(s)).toEqual({ soul: TEST_HOGYOKU_MATERIAL_STEP, shard: 5 + TEST_HOGYOKU_MATERIAL_STEP, essence: TEST_HOGYOKU_MATERIAL_STEP });
  });
  it('아이템 생성 재화에 재료 3종·초월 조각', () => {
    expect(TEST_CURRENCIES).toEqual(expect.arrayContaining(['soulCrystals', 'hogyokuShards', 'resonanceEssence', 'transcendShards']));
    const s = newTestSave('hollow', NOW);
    s.shared.resonanceEssence = 0;
    expect(createTestItem(s, { kind: 'currency', id: 'resonanceEssence', count: 7 })).toBe(7);
    expect(s.shared.resonanceEssence).toBe(7);
  });
});

describe('C.457 ② 적 설정 창', () => {
  const base: TestArenaChoice = { foeId: 'test-a', star: 1, streak: 0, floor: null, hpPct: 100, attackPct: 100, attacks: true, immortal: false };
  it('체력·공격력 배율 % 가 적에 실린다', () => {
    const a = testArenaEnemy(base)!;
    const b = testArenaEnemy({ ...base, hpPct: 300, attackPct: 50 })!;
    expect(b.enemy.hpInAttacks).toBeCloseTo(a.enemy.hpInAttacks * 3);
    expect(b.enemy.attackInAttacks).toBeCloseTo(a.enemy.attackInAttacks * 0.5);
    expect(testArenaEnemy({ ...base, foeId: 'nope' })).toBeNull();
  });
  it('공격 안 함 = 내 체력이 줄지 않는다 / 공격함 = 준다', () => {
    const run = (attacks: boolean) => {
      const params = {};
      applyTestArenaParams(params, { attacks, immortal: true });
      const s = createCombat(7, { enemy: getEnemy('test-a'), params });
      for (let i = 0; i < 20 * 20; i++) step(s);
      return s.player.hp / s.player.maxHp;
    };
    expect(run(false)).toBe(1);
    expect(run(true)).toBeLessThan(1);
  });
  it('무적 = 쓰러지지 않고(체력 가득으로) 전투가 이어진다, 시간 상한은 길게', () => {
    const params = {};
    applyTestArenaParams(params, { attacks: false, immortal: true });
    const s = createCombat(3, { enemy: { ...getEnemy('test-a'), hpInAttacks: 1 }, params });
    expect(s.params.timeLimitSeconds).toBe(TEST_ARENA_SECONDS);
    for (let i = 0; i < 30 * 20; i++) step(s);
    expect(s.status).toBe('playing');
    expect(s.enemy.hp).toBeGreaterThan(0);
  });
  it('무적 끔 = 그대로 쓰러진다', () => {
    const params = {};
    applyTestArenaParams(params, { attacks: false, immortal: false });
    const s = createCombat(3, { enemy: { ...getEnemy('test-a'), hpInAttacks: 1 }, params });
    for (let i = 0; i < 30 * 20 && s.status === 'playing'; i++) step(s);
    expect(s.status).toBe('won');
  });
});
