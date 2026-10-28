// C.88 테스트 모드 (GDD 38장): 세이브 분리(진짜 세이브 무변화), 전체 해금, 능력치 입력의 전투 반영, 런 로그 분리, 켜기·바로 전투 상대
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { BOSSES } from '../src/data/bosses';
import { ENEMIES } from '../src/data/enemies';
import { FORM_TABLE } from '../src/data/evolution';
import { FACTIONS } from '../src/data/factions';
import { GROUNDS, openGrounds } from '../src/data/grounds';
import { STAT_IDS } from '../src/data/schema';
import { COSMETIC_ITEMS } from '../src/data/shop';
import { STORY_CHAPTERS, chapterContent, episodeKey } from '../src/data/story';
import { TRAITS } from '../src/data/traits';
import { buildCombatParams } from '../src/engine/absorb';
import { buildBattleRecord, createCombat } from '../src/engine/combat';
import { enemyAtDifficulty, MAX_DIFFICULTY } from '../src/engine/difficulty';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { FOOD_IDS } from '../src/engine/faction';
import { canRebirth } from '../src/engine/rebirth';
import {
  clearTestSlot, countTap, fillAllUnlocked, newTestSave, resetStats, resolveTestMode, setAbility, setCustomStats, setForm, setNestValues, setTraitSlots,
  testBattleEnemy, testFoes, testParam, testStorage, towerFloorScale, TEST_FLAG_KEY, TEST_SAVE_KEY, TEST_TAPS, TEST_WEALTH, type FullStorage,
} from '../src/engine/testMode';
import { trainingGate } from '../src/engine/training';
import { liberationAccess, loadSave, newSaveData, recordBattle, SAVE_KEY, statBonusOf } from '../src/game';
import { collectSlotChunks, slotKey, stashSlot, touchSlot, writeSlotSave } from '../src/saveSlots';

/** localStorage 와 같은 모양의 메모리 저장소 (키 목록까지) */
function memStorage(): FullStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const fid = FACTIONS[0]!.id;
const snapshot = (m: Map<string, string>) => new Map([...m].filter(([k]) => !k.startsWith(TEST_SAVE_KEY)));

describe('세이브 분리 (38-2): 진짜 세이브는 읽지도 쓰지도 않는다', () => {
  it('테스트 칸 저장·백업·덩어리 정리·초기화 뒤에도 진짜 세이브 키는 한 글자도 안 바뀐다', () => {
    const base = memStorage();
    // 진짜 세이브: 슬롯 1·2 + 백업 + 긴 런 로그(압축 덩어리)
    const real = newSaveData(fid, 1000);
    for (let i = 0; i < 300; i++) recordBattle(real, buildBattleRecord(createCombat(i, { enemy: ENEMIES[0]! }), { factionId: fid, tierIndex: 0 }));
    expect(writeSlotSave(base, real, 1)).toBe('ok');
    writeSlotSave(base, newSaveData(fid, 2000), 2);
    stashSlot(base, 1);
    touchSlot(base, 1, 3000);
    const before = new Map(base.map);
    expect(before.size).toBeGreaterThan(3);

    const test = testStorage(base);
    expect(loadSave(test, slotKey(1))).toBeNull(); // 진짜 슬롯 1이 있어도 테스트 칸은 비어 있다
    const ts = newTestSave(fid, 5000);
    for (let i = 0; i < 300; i++) recordBattle(ts, buildBattleRecord(createCombat(i + 7, { enemy: ENEMIES[1]! }), { factionId: fid, tierIndex: 4 }));
    expect(writeSlotSave(test, ts, 1)).toBe('ok');
    stashSlot(test, 1, 'rank');
    writeSlotSave(test, ts, 1);
    touchSlot(test, 1, 9000);
    collectSlotChunks(test);
    collectSlotChunks(base); // 진짜 쪽 정리도 테스트 칸 덩어리를 지우지 않는다(진짜 키가 아니므로 대상 아님)
    expect(snapshot(base.map)).toEqual(before);
    // 테스트 칸에 생긴 키는 모두 bha-save-test 로 시작
    const added = [...base.map.keys()].filter((k) => !before.has(k));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((k) => k.startsWith(TEST_SAVE_KEY))).toBe(true);
    expect(base.map.has(TEST_SAVE_KEY)).toBe(true); // 슬롯 1 = bha-save-test 그대로
    // 테스트 칸 저장소로 읽으면 테스트 세이브, 진짜 저장소로 읽으면 진짜 세이브
    expect(loadSave(test, slotKey(1))!.machine.createdAt).toBe(5000);
    expect(loadSave(base, SAVE_KEY)!.machine.createdAt).toBe(1000);

    expect(clearTestSlot(base)).toBeGreaterThan(0);
    expect(new Map(base.map)).toEqual(before);
  });

  it('테스트 칸 키 목록에는 테스트 키만(진짜 키 이름으로) 보인다', () => {
    const base = memStorage();
    base.setItem(SAVE_KEY, 'real');
    base.setItem('bha-other-setting', 'x');
    const test = testStorage(base);
    test.setItem(SAVE_KEY, 'test');
    expect(test.length).toBe(1);
    expect(test.key(0)).toBe(SAVE_KEY);
    expect(test.getItem(SAVE_KEY)).toBe('test');
    expect(base.getItem(SAVE_KEY)).toBe('real');
    test.removeItem(SAVE_KEY);
    expect(base.getItem(SAVE_KEY)).toBe('real');
  });
});

describe('전체 해금 (38-3)', () => {
  for (const f of FACTIONS) {
    it(`${f.id}: 진화체 도감·★·사냥터·스토리·수련·환생·등급전·꾸밈·재화·먹이·보스 도감`, () => {
      const s = newTestSave(f.id, 1);
      expect(s.formDex.sort()).toEqual(FORM_TABLE.map((x) => x.id).sort());
      expect(s.difficulty.unlocked).toBe(MAX_DIFFICULTY);
      expect(openGrounds(s.evolution.tierIndex).length).toBe(GROUNDS.length);
      for (const g of FACTIONS) {
        for (const ch of STORY_CHAPTERS) {
          const c = chapterContent(g.id, ch.id);
          if (!c) continue;
          for (const ep of c.episodes) expect(s.story[g.id]!.cleared[episodeKey(ch.id, ep.id)]).toBeDefined();
          expect(s.story[g.id]!.chapters).toContain(ch.id);
        }
      }
      expect(s.training.completed).toBe(true);
      expect(trainingGate(s.training, s.evolution.tierIndex, 100).ok).toBe(true);
      expect(canRebirth(s.evolution)).toBe(true);
      expect(liberationAccess(s).usable).toBe(true);
      expect(new Set(s.shared.cosmetics)).toEqual(new Set(COSMETIC_ITEMS.map((c) => c.id)));
      expect(s.shared.tradeCoins).toBe(TEST_WEALTH);
      expect(s.shared.jade).toBe(TEST_WEALTH);
      for (const id of FOOD_IDS) expect(s.shared.food[id]).toBe(BALANCE.provisional.food.cap);
      for (const b of BOSSES) expect(s.bossDex[b.id]!.kills).toBeGreaterThan(0);
      expect(s.help.tutorialSeen).toBe(true);
    });
  }

  it('저장·불러오기를 거쳐도 해금이 남는다 (세이브 구조 그대로)', () => {
    const st = testStorage(memStorage());
    writeSlotSave(st, newTestSave(fid), 1);
    const back = loadSave(st, slotKey(1))!;
    expect(back.formDex.length).toBe(FORM_TABLE.length);
    expect(back.shared.cosmetics.length).toBe(COSMETIC_ITEMS.length);
    expect(back.difficulty.unlocked).toBe(MAX_DIFFICULTY);
  });

  it('탑 자리(tower.best)가 있으면 마지막 층 바로 아래까지 연다', () => {
    const s = newSaveData(fid) as ReturnType<typeof newSaveData> & { tower?: { best: number } };
    s.tower = { best: 0 };
    fillAllUnlocked(s);
    expect(s.tower.best).toBe(49);
  });
});

describe('테스트 패널 값 넣기 (38-4)', () => {
  it('능력치 입력이 전투 파라미터(원정·등급전·연습 공통)에 그대로 실린다', () => {
    const s = newTestSave(fid);
    const want = { hp: 777, atk: 1, int: 250, def: 0, spr: 999, spd: 42 };
    setCustomStats(s, want);
    const params = buildCombatParams(s.build, fid);
    applyEvolutionToParams(params, s.evolution, fid, statBonusOf(s).total);
    expect(params.playerStats).toEqual(want);
    // 저장·불러오기 뒤에도
    const st = testStorage(memStorage());
    writeSlotSave(st, s, 1);
    const back = loadSave(st, slotKey(1))!;
    const p2 = buildCombatParams(back.build, fid);
    applyEvolutionToParams(p2, back.evolution, fid, statBonusOf(back).total);
    expect(p2.playerStats).toEqual(want);
    // 큰 체력은 전투의 내 최대 체력도 키운다
    const weak = newTestSave(fid);
    setCustomStats(weak, { ...want, hp: 10 });
    const pw = buildCombatParams(weak.build, fid);
    applyEvolutionToParams(pw, weak.evolution, fid);
    const enemy = enemyAtDifficulty(ENEMIES[0]!, 5);
    expect(createCombat(1, { enemy, params }).player.maxHp).toBeGreaterThan(createCombat(1, { enemy, params: pw }).player.maxHp);
  });

  it('범위 밖 값은 0~상한으로, [진화체 기본값으로]는 노력치·계승을 비운다', () => {
    const s = newTestSave(fid);
    setCustomStats(s, { hp: -5, atk: 99999 });
    const p = buildCombatParams(s.build, fid);
    applyEvolutionToParams(p, s.evolution, fid);
    expect(p.playerStats!.hp).toBe(0);
    expect(p.playerStats!.atk).toBe(BALANCE.provisional.stats.statMax);
    resetStats(s);
    expect(s.evolution.carry).toBeUndefined();
    expect(STAT_IDS.every((k) => s.evolution.ev[k] === 0)).toBe(true);
  });

  it('진화체 고르기: 단계·이력·도감을 맞추고, null 이면 1단계', () => {
    const s = newSaveData(fid);
    const f = FORM_TABLE.find((x) => x.tier === 3)!;
    expect(setForm(s, f.id)).toBe(true);
    expect(s.evolution.tierIndex).toBe(2);
    expect(s.evolution.formId).toBe(f.id);
    expect(s.formDex).toContain(f.id);
    expect(setForm(s, '없는-진화체')).toBe(false);
    setForm(s, null);
    expect(s.evolution).toMatchObject({ tierIndex: 0, formId: null, formHistory: [] });
  });

  it('특성 고르기: 없는 특성·중복은 빈칸, 가진 목록·장착 순서 갱신 · 고유 특성', () => {
    const s = newSaveData(fid);
    const [a, b] = TRAITS.filter((t) => t.element !== 'normal').map((t) => t.id) as [string, string]; // C.184: 노멀 skill 특성은 비워 둔다(GDD 111장 1)
    expect(setTraitSlots(s, [a, a, 'nope'])).toEqual([a, null, null]);
    expect(setTraitSlots(s, [b, null, a])).toEqual([b, null, a]);
    expect(s.build.owned).toEqual(expect.arrayContaining([a, b]));
    expect(s.build.equipOrder).toEqual([b, a]);
    setAbility(s, 'spd');
    expect(s.evolution.ability).toBe('spd');
    setAbility(s, null);
    expect(s.evolution.ability).toBeNull();
  });

  it('리스크·허기·컨디션 입력은 범위로 자른다', () => {
    const s = newSaveData(fid);
    setNestValues(s, { risk: 1e9, hunger: -3, condition: 55.4 });
    expect(s.nest).toMatchObject({ risk: BALANCE.provisional.risk.limit, hunger: 0, condition: 55 });
  });
});

describe('런 로그 분리 (38-5)', () => {
  it('테스트 칸 전투 기록은 진짜 세이브 런 로그에 안 들어간다', () => {
    const base = memStorage();
    const real = newSaveData(fid);
    writeSlotSave(base, real, 1);
    const test = testStorage(base);
    const ts = newTestSave(fid);
    writeSlotSave(test, ts, 1);
    const loaded = loadSave(test, slotKey(1))!;
    recordBattle(loaded, buildBattleRecord(createCombat(3, { enemy: ENEMIES[0]! }), { factionId: fid, tierIndex: 4 }));
    writeSlotSave(test, loaded, 1);
    expect(loadSave(test, slotKey(1))!.runLog.battles.length).toBe(1);
    expect(loadSave(base, slotKey(1))!.runLog.battles.length).toBe(0);
  });
});

describe('켜기 (38-1)·바로 전투 상대', () => {
  it('?test=1 이면 켜고 표시를 남기고, ?test=0 이면 끈다. 주소에 없으면 표시를 따른다', () => {
    const st = memStorage();
    expect(testParam('?a=1')).toBeNull();
    expect(resolveTestMode('', st)).toBe(false);
    expect(resolveTestMode('?test=1', st)).toBe(true);
    expect(st.getItem(TEST_FLAG_KEY)).toBe('1');
    expect(resolveTestMode('', st)).toBe(true);
    expect(resolveTestMode('?test=0', st)).toBe(false);
    expect(st.getItem(TEST_FLAG_KEY)).toBeNull();
  });

  it('버전 줄 7번 연속 누르기: 간격이 길면 처음부터', () => {
    let t = { count: 0, at: 0 };
    for (let i = 0; i < TEST_TAPS; i++) t = countTap(t, 10_000 + i * 300);
    expect(t.count).toBe(TEST_TAPS);
    expect(countTap(t, 10_000 + TEST_TAPS * 300 + 5000).count).toBe(1);
  });

  it('상대 목록 = 공유 적 테이블 전부 + 보스 전부 (데이터에서)', () => {
    const ids = testFoes().map((f) => f.id);
    expect(ids).toEqual([...ENEMIES.map((e) => e.id), ...BOSSES.map((b) => b.id)]);
  });

  it('★·연속 배율·탑 층 규칙이 적에 입혀진다', () => {
    const e = ENEMIES.find((x) => x.class === 'normal')!;
    const plain = testBattleEnemy({ foeId: e.id, star: 3, streak: 0 })!;
    expect(plain.star).toBe(3);
    expect(plain.enemy.hpInAttacks).toBeCloseTo(enemyAtDifficulty(e, 3).hpInAttacks);
    const streak = testBattleEnemy({ foeId: e.id, star: 3, streak: 4 })!;
    expect(streak.enemy.hpInAttacks).toBeGreaterThan(plain.enemy.hpInAttacks);
    expect(towerFloorScale(1)).toEqual({ star: 1, factor: 1 });
    expect(towerFloorScale(10).star).toBe(1);
    expect(towerFloorScale(10).factor).toBeCloseTo(1.36);
    expect(towerFloorScale(41)).toEqual({ star: 5, factor: 1 });
    expect(towerFloorScale(50).factor).toBeCloseTo(1.36 * 1.2);
    const tower = testBattleEnemy({ foeId: BOSSES[0]!.id, star: 1, streak: 9, floor: 30 })!;
    expect(tower.star).toBe(3);
    expect(tower.bossId).toBe(BOSSES[0]!.id);
    expect(plain.bossId).toBeNull();
    expect(testBattleEnemy({ foeId: '없는-적', star: 1, streak: 0 })).toBeNull();
  });
});
