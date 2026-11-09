// C.330 적 도감 (GDD 200장): 카드 목록·순서 · 만남/잡은 수·흡수 종류별 횟수 집계 · 세이브 형식 64 마이그레이션(런 로그에서 채움) · 보정 · 런 로그 원정 기록 kills · 책장 토글 · 화면(종족 설정 이름)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOSSES } from '../src/data/bosses';
import { ELEMENT_IDS } from '../src/data/elements';
import { ENEMIES } from '../src/data/enemies';
import { getFaction } from '../src/data/factions';
import { GROUNDS } from '../src/data/grounds';
import { ABSORB_KINDS, ENEMY_CARDS, enemyDexCounts, enemyDexFromLogs, killsByEnemy, markEnemyCardSeen, noteEnemyAbsorb, noteEnemyBattle, parseWhere, sanitizeEnemyDex, WHERE_TOWER, whereGround, type EnemyDex } from '../src/engine/enemyDex';
import { createExpedition } from '../src/engine/expedition';
import { createCombat } from '../src/engine/combat';
import { towerFloor } from '../src/engine/tower';
import { migrateSave, MIN_LOADABLE_SAVE_FORMAT, newSaveData, recordExpedition, recordTowerBattle, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, type SaveData } from '../src/game';
import { BOOK_TABS } from '../src/ui/bookView';
import { absorbsText, whereText } from '../src/ui/enemyDexView';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('카드 목록 (200장 2)', () => {
  it('일반 24(속성 8 × 3) → 강적 24 → 보스 3, 테스트 적 없음, 속성 순', () => {
    const kinds = ENEMY_CARDS.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'normal')).toHaveLength(24);
    expect(kinds.filter((k) => k === 'elite')).toHaveLength(24);
    expect(kinds.filter((k) => k === 'boss')).toHaveLength(BOSSES.length);
    expect(BOSSES.length).toBe(3);
    expect(kinds.join(',')).toBe([...Array(24).fill('normal'), ...Array(24).fill('elite'), ...Array(3).fill('boss')].join(','));
    expect(ENEMY_CARDS.some((c) => c.id.startsWith('test-'))).toBe(false);
    expect(ENEMIES.filter((e) => e.testOnly).length).toBeGreaterThan(0);
    // 일반 첫 8칸 = 속성 순(노멀 → … → 허)의 짐승형, 강적 첫 칸 = 노멀 강공격형
    const normals = ENEMY_CARDS.filter((c) => c.kind === 'normal');
    expect(normals.slice(0, 3).map((c) => c.id)).toEqual(['normal-basic', 'normal-swift', 'normal-sturdy']);
    expect(normals.filter((_, i) => i % 3 === 0).map((c) => c.def.element)).toEqual([...ELEMENT_IDS]);
    expect(ENEMY_CARDS.filter((c) => c.kind === 'elite')[0]!.id).toBe('normal-heavy-seal');
    // 탑 층 보스(10·20·30·40·50층)는 모두 보스 테이블의 보스 = 같은 칸, 따로 없음
    for (const n of [10, 20, 30, 40, 50]) expect(ENEMY_CARDS.some((c) => c.kind === 'boss' && c.id === towerFloor(n).bossId)).toBe(true);
  });
  it('강적·보스는 등급이 있고 일반은 없다 (198장 — 도감에서만 보인다)', () => {
    for (const c of ENEMY_CARDS) expect(!!c.def.grade, c.id).toBe(c.kind !== 'normal');
  });
});

describe('집계 (200장 3·4)', () => {
  it('이긴 전투 = 만남 +1·잡은 수 +1, 진 전투 = 만남만, 처음 만난 곳·새 점은 첫 만남 때만, 카드가 아닌 적은 무시', () => {
    const dex: EnemyDex = {};
    expect(noteEnemyBattle(dex, 'normal-basic', false, whereGround('outskirts'), 100)).toMatchObject({ seen: 1, kills: 0, absorbs: { both: 0, trait: 0, stat: 0, none: 0 }, where: 'ground:outskirts', firstAt: 100, fresh: true });
    noteEnemyBattle(dex, 'normal-basic', true, whereGround('canyon'), 200);
    expect(dex['normal-basic']).toMatchObject({ seen: 2, kills: 1, where: 'ground:outskirts', firstAt: 100 });
    expect(noteEnemyBattle(dex, 'test-a', true, null, 1)).toBeNull();
    expect(noteEnemyBattle(dex, 'nope', true, null, 1)).toBeNull();
    expect(Object.keys(dex)).toEqual(['normal-basic']);
    expect(markEnemyCardSeen(dex, 'normal-basic')).toBe(true);
    expect(dex['normal-basic']!.fresh).toBeUndefined();
    expect(markEnemyCardSeen(dex, 'normal-basic')).toBe(false);
    const c = enemyDexCounts(dex);
    expect([c.found, c.total, c.byKind.normal.found, c.byKind.elite.total, c.byKind.boss.total]).toEqual([1, 51, 1, 24, 3]);
  });
  it('흡수 종류별 횟수 (200장 9): 갈래 both·trait·stat + 놓아주기, 전투 기록 없이 흡수 기록만 있으면 이긴 전투 하나로, 글자는 종족 설정 이름 그대로 0 포함 자리 고정', () => {
    const dex: EnemyDex = {};
    noteEnemyBattle(dex, 'normal-basic', true, null, 1);
    noteEnemyAbsorb(dex, 'normal-basic', 'both', 1);
    noteEnemyAbsorb(dex, 'normal-basic', 'stat', 1);
    noteEnemyAbsorb(dex, 'normal-basic', null, 1);
    expect(dex['normal-basic']!.absorbs).toEqual({ both: 1, trait: 0, stat: 1, none: 1 });
    expect(noteEnemyAbsorb(dex, 'water-swift', 'trait', 2)).toMatchObject({ seen: 1, kills: 1, absorbs: { both: 0, trait: 1, stat: 0, none: 0 } });
    expect(noteEnemyAbsorb(dex, 'test-a', 'both', 1)).toBeNull();
    expect(ABSORB_KINDS).toEqual(['both', 'trait', 'stat', 'none']);
    const hollow = getFaction('hollow');
    const n = hollow.absorbModeNames;
    expect(absorbsText(hollow, dex['normal-basic']!)).toBe(`${n.both} 1 · ${n.trait} 0 · ${n.stat} 1 · ${n.none} 1`);
    expect(absorbsText(getFaction('shinigami'), { absorbs: { both: 0, trait: 0, stat: 0, none: 0 } })).toBe(`${getFaction('shinigami').absorbModeNames.both} 0 · ${getFaction('shinigami').absorbModeNames.trait} 0 · ${getFaction('shinigami').absorbModeNames.stat} 0 · ${getFaction('shinigami').absorbModeNames.none} 0`);
  });
  it('처음 만난 곳 키: 사냥터·탑, 모르면 null', () => {
    expect(parseWhere(whereGround('forest'))).toEqual({ kind: 'ground', id: 'forest' });
    expect(parseWhere(WHERE_TOWER)).toEqual({ kind: 'tower' });
    expect(parseWhere(null)).toBeNull();
    expect(parseWhere('ground:')).toBeNull();
    const hollow = getFaction('hollow');
    const shinigami = getFaction('shinigami');
    expect(whereText(hollow, whereGround(GROUNDS[0]!.id))).toBe(hollow.huntingGrounds![GROUNDS[0]!.id]!.name);
    expect(whereText(shinigami, whereGround(GROUNDS[0]!.id))).toBe(shinigami.huntingGrounds![GROUNDS[0]!.id]!.name);
    expect(whereText(hollow, WHERE_TOWER)).toBe('도전의 탑');
    expect(whereText(hollow, null)).toBe('기록 없음');
  });
  it('보정: 카드 아닌 id·만남 0 버림, kills ≤ seen, 이상한 where 는 null, fresh 는 true 일 때만', () => {
    const out = sanitizeEnemyDex({ 'normal-basic': { seen: 3, kills: 9, where: 'moon', firstAt: -1, fresh: 1, absorbs: { both: 2, stat: -1, zzz: 4 } }, 'water-swift': { seen: 0, kills: 0 }, 'test-a': { seen: 1, kills: 1 }, 'sand-maw': { seen: 1, kills: 1, where: 'tower', fresh: true } });
    expect(out).toEqual({ 'normal-basic': { seen: 3, kills: 3, absorbs: { both: 2, trait: 0, stat: 0, none: 0 }, where: null, firstAt: 0 }, 'sand-maw': { seen: 1, kills: 1, absorbs: { both: 0, trait: 0, stat: 0, none: 0 }, where: 'tower', firstAt: 0, fresh: true } });
    expect(sanitizeEnemyDex(null)).toEqual({});
    expect(sanitizeEnemyDex([1])).toEqual({});
  });
  it('원정 기록 kills = 이긴 전투의 적 id → 수', () => {
    expect(killsByEnemy([{ enemyId: 'a', won: true }, { enemyId: 'a', won: true }, { enemyId: 'b', won: false }])).toEqual({ a: 2 });
  });
});

describe('세이브 (200장 4·5, 123장 6)', () => {
  it('형식 64 · 문턱 54 고정 · 새 세이브 enemyDex 빈 도감', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(64); // C.354 에서 65 (수련권 기록)
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(54);
    expect(typeof SAVE_MIGRATIONS[63]).toBe('function');
    expect(newSaveData('hollow', 1000).enemyDex).toEqual({});
  });
  it('63 → 64: 두 트랙 런 로그(원정 전투·탑 전투)에서 채운다 — 연습(runId 0)·탑 등급·아란칼화는 battles 에서 빼고 탑은 towerBattles 로, 처음 만난 곳 = 원정 사냥터, 새 점 없음', () => {
    const old = clone(newSaveData('hollow', 1000)) as unknown as Record<string, any>;
    old.meta.format = 63;
    delete old.enemyDex;
    const battle = (runId: number, enemyId: string, won: boolean, enemyClass = 'normal') => ({ runId, lap: 1, turns: 0, matchesByRole: {}, won, skillsUsed: [], enemyClass, tierIndex: 0, enemyId, factionId: 'hollow', seed: 1, riskGained: 0, absorbGained: 0, lossReason: won ? null : 'hp', durationSeconds: 10 });
    old.runLog.runs.push({ runId: 1, laps: 1, outcome: 'returned', gained: [], lost: [], endReason: 'returned', seed: 1, factionId: 'hollow', gainedTraits: [], lostTraits: [], riskPeak: 0, breakthrough: false, groundId: 'canyon' });
    old.runLog.battles.push(battle(1, 'normal-basic', true), battle(1, 'normal-basic', false), battle(1, 'fire-heavy-seal', true, 'elite'), battle(1, 'sand-maw', true, 'boss'), battle(0, 'water-basic', true), battle(0, 'forest-lord', true, 'ascension'), battle(0, 'earth-basic', true, 'tower'), battle(1, 'test-a', true));
    old.runLog.towerBattles.push({ at: 5, factionId: 'hollow', floor: 1, star: 1, enemyId: 'earth-basic', bossId: null, won: true, durationSeconds: 1, tierIndex: 0, formId: null, firstClear: true }, { at: 6, factionId: 'hollow', floor: 10, star: 1, enemyId: 'sand-maw', bossId: 'sand-maw', won: false, durationSeconds: 1, tierIndex: 0, formId: null, firstClear: false });
    // 흡수 기록: 둘 다(mode 없음 = both)·능력치만·놓아줌
    old.runLog.absorbs.push({ runId: 1, enemyId: 'normal-basic', element: 'normal', rare: false, absorbed: true, traitId: 't', lap: 1 }, { runId: 1, enemyId: 'fire-heavy-seal', element: 'fire', rare: false, absorbed: true, traitId: null, lap: 1, mode: 'stat' }, { runId: 1, enemyId: 'sand-maw', element: 'earth', rare: false, absorbed: false, traitId: null, lap: 1 });
    // 쉬는 트랙(사신)의 런 로그도 합친다
    const other = clone(newSaveData('shinigami', 1000)) as unknown as Record<string, any>;
    other.runLog.runs.push({ runId: 7, laps: 1, outcome: 'defeated', gained: [], lost: [], endReason: 'battle-lost', seed: 1, factionId: 'shinigami', gainedTraits: [], lostTraits: [], riskPeak: 0, breakthrough: false, groundId: 'forest' });
    other.runLog.battles.push({ ...battle(7, 'kyo-stance', false, 'elite'), factionId: 'shinigami' });
    const { meta: _m, otherTracks: _o, shared: _s, hogyoku: _h, transcendentDex: _t, slotLog: _l, machine: _mc, lastSeenAt: _la, idlePending: _i, story: _st, bossDex: _b, enemyDex: _e, trackNotice: _tn, ...track } = other;
    old.otherTracks = [{ ...track, parkedAt: 1 }];
    const m = migrateSave(old)!;
    expect(m).not.toBeNull();
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    const ab = (both = 0, trait = 0, stat = 0, none = 0) => ({ both, trait, stat, none });
    expect(m.enemyDex).toEqual({
      'normal-basic': { seen: 2, kills: 1, absorbs: ab(1), where: 'ground:canyon', firstAt: 0 },
      'fire-heavy-seal': { seen: 1, kills: 1, absorbs: ab(0, 0, 1), where: 'ground:canyon', firstAt: 0 },
      'sand-maw': { seen: 2, kills: 1, absorbs: ab(0, 0, 0, 1), where: 'ground:canyon', firstAt: 0 },
      'earth-basic': { seen: 1, kills: 1, absorbs: ab(), where: 'tower', firstAt: 0 },
      'kyo-stance': { seen: 1, kills: 0, absorbs: ab(), where: 'ground:forest', firstAt: 0 },
    });
  });
  it('형식 54 세이브도 끝까지 올라오고(빈 도감), 깨진 enemyDex 는 보정', () => {
    const old = clone(newSaveData('shinigami', 1000)) as unknown as Record<string, any>;
    old.meta.format = 54;
    delete old.enemyDex;
    expect(migrateSave(old)!.enemyDex).toEqual({});
    const bad = clone(newSaveData('shinigami', 1000)) as unknown as Record<string, any>;
    bad.enemyDex = { 'normal-basic': { seen: 1, kills: 5 }, zzz: { seen: 1 } };
    expect(migrateSave(bad)!.enemyDex).toEqual({ 'normal-basic': { seen: 1, kills: 1, absorbs: { both: 0, trait: 0, stat: 0, none: 0 }, where: null, firstAt: 0 } });
  });
  it('마이그레이션 내용은 enemyDexFromLogs 와 같고, 빈 로그면 빈 도감', () => {
    expect(enemyDexFromLogs([])).toEqual({});
    expect(enemyDexFromLogs([newSaveData('hollow', 1).runLog])).toEqual({});
  });
});

describe('기록 훅 (200장 3·6, 9장)', () => {
  it('원정 끝: 치른 전투마다 도감 만남·잡은 수, 처음 만난 곳 = 사냥터, 원정 기록 kills', () => {
    const save = newSaveData('hollow', 1000);
    const exp = createExpedition({ factionId: 'hollow', seed: 3, hunger: 10, condition: 100, deck: [], groundId: 'canyon', difficulty: 1 });
    // 전투 기록을 직접 넣고 끝낸다 (전투 엔진은 다른 테스트가 본다)
    const rec = (enemyId: string, won: boolean, enemyClass: 'normal' | 'elite' | 'boss') => ({ runId: exp.runId, lap: 1, turns: 0, matchesByRole: { damage: 0, spirit: 0, shield: 0, absorb: 0, risk: 0 }, won, skillsUsed: [], enemyClass, tierIndex: 0, enemyId, factionId: 'hollow', seed: 1, riskGained: 0, absorbGained: 0, lossReason: won ? null : ('hp' as const), durationSeconds: 1, blocksByTrait: {}, blocksByChain: [0, 0, 0] as [number, number, number], chain3Count: 0, chainsByFamily: {}, combosTriggered: 0, comboBlocksUsed: 0, guardSuccesses: 0, voidUsed: 0, specialUsed: false, finisherKind: null, finisherTraitId: null, finisherElement: null, absorbable: won, storedUsed: 0, storedWasted: 0, liberationUsed: false, liberationAt: null });
    exp.battles.push(rec('normal-basic', true, 'normal'), rec('normal-basic', true, 'normal'), rec('fire-heavy-seal', false, 'elite'), rec('test-a', true, 'normal'));
    exp.absorbRecords.push({ runId: exp.runId, enemyId: 'normal-basic', element: 'normal', rare: false, absorbed: true, traitId: 'x', lap: 1, mode: 'trait' }, { runId: exp.runId, enemyId: 'normal-basic', element: 'normal', rare: false, absorbed: false, traitId: null, lap: 1 });
    (exp as unknown as { phase: string; outcome: string; endReason: string }).phase = 'ended';
    (exp as unknown as { outcome: string }).outcome = 'returned';
    (exp as unknown as { endReason: string }).endReason = 'returned';
    recordExpedition(save, exp, 5000);
    expect(save.enemyDex['normal-basic']).toEqual({ seen: 2, kills: 2, absorbs: { both: 0, trait: 1, stat: 0, none: 1 }, where: 'ground:canyon', firstAt: 5000, fresh: true });
    expect(save.enemyDex['fire-heavy-seal']).toEqual({ seen: 1, kills: 0, absorbs: { both: 0, trait: 0, stat: 0, none: 0 }, where: 'ground:canyon', firstAt: 5000, fresh: true });
    expect(save.enemyDex['test-a']).toBeUndefined();
    const run = save.runLog.runs.at(-1)!;
    expect(run.kills).toEqual({ 'normal-basic': 2, 'test-a': 1 });
    // 환생해도 지우지 않는 슬롯 칸: 트랙 바꿈과 무관한 평평한 필드
    expect(read('src/game.ts')).toMatch(/enemyDex: EnemyDex;/);
    expect(read('src/game.ts')).not.toMatch(/TRACK_KEYS[^\n]*enemyDex/);
  });
  it('탑 층: 이기든 지든 만남, 보스 층은 보스 칸, 처음 만난 곳 = 탑', () => {
    const save = newSaveData('shinigami', 1000);
    const f1 = towerFloor(1);
    // recordTowerBattle 은 CombatState 전체를 읽으므로 실제 전투로 만든다
    const s = createCombat(1, { enemy: f1.enemy });
    (s as unknown as { status: string }).status = 'won';
    recordTowerBattle(save, f1, s, 777);
    expect(save.enemyDex[f1.enemy.id]).toMatchObject({ seen: 1, kills: 1, where: WHERE_TOWER, firstAt: 777 });
    const f10 = towerFloor(10);
    const s2 = createCombat(2, { enemy: f10.enemy });
    (s2 as unknown as { status: string }).status = 'lost';
    (s2 as unknown as { lossReason: string }).lossReason = 'hp';
    recordTowerBattle(save, f10, s2, 778);
    expect(save.enemyDex[f10.bossId!]).toMatchObject({ seen: 1, kills: 0, where: WHERE_TOWER });
  });
});

describe('화면 (200장 1·2·7·8)', () => {
  it('책장 토글 = 진화체 도감 · 칭호 도감 · 적 도감 (새 버튼 자리 없음), 적 도감은 masterDetail 틀', () => {
    expect(BOOK_TABS.map((t) => t.label)).toEqual(['진화체 도감', '칭호 도감', '적 도감']);
    const view = read('src/ui/enemyDexView.ts');
    expect(view).toContain('masterDetail(');
    expect(view).toContain("'???'");
    expect(view).toContain('is-silhouette');
    expect(view).toContain('enemyGradeName(');
    expect(view).toContain('absorbsText(faction, entry)'); // 흡수 종류별 횟수 줄 (200장 9)
    expect(view).toContain('bha-edex__new'); // 새 점
    expect(view).not.toMatch(/factionId === '|faction\.id === '/); // 종족 분기 없음
    expect(read('src/ui/roomView.ts')).not.toContain('적 도감'); // 방에 새 물건·버튼 없음
    // 적 도감 CSS 는 토큰만 (새 색 값 없음)
    const css = read('src/ui/bha/screens-lcd.css').split('적 도감 (.bha-edex')[1]!.split('═════ 진화 제단')[0]!;
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });
});
