// C.471 (GDD 7-13 스택 표시 · 8-9 훈련 인형 = 전투 안 설정 창) — 사용자 2026-11-17
// "스텍을 저따 쌓지 말고, 적한테 걸리는거면 적 체력바 위에, 나한테 쌓이는거면 내 체력바 위에. 작은 네모 아이콘으로 쌓아. 간략화 된걸로."
// "전투 들어간 뒤에 훈련장 설정 있고 그 창에서 설정해서 나오는 식으로 바꾸라해쓴ㄴ데?"
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMIES, getEnemy, PRACTICE_DUMMY } from '../src/data/enemies';
import { createCombat, statusMarksOf, STATUS_MARK_DEFS, type CombatParams, type CombatState } from '../src/engine/combat';
import { buildCombatParams } from '../src/engine/absorb/build';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { enemyAtDifficulty } from '../src/engine/difficulty';
import { noteEnemyBattle } from '../src/engine/enemyDex';
import { practiceArenaDefaults, practiceArenaEnemy, practiceFoes, practiceStar, PRACTICE_DUMMY_ID } from '../src/engine/practiceArena';
import { recordEvolutionPractice } from '../src/engine/evolution';
import { testGrantTranscendent, type TestArenaChoice } from '../src/engine/testMode';
import { newSaveData, switchKitMode, type SaveData } from '../src/game';

const read = (f: string) => readFileSync(f, 'utf8');

function kitParams(transId: string, mode?: string): Partial<CombatParams> {
  const s: SaveData = newSaveData('shinigami', 1000);
  expect(testGrantTranscendent(s, transId, 2000)).toBe('added');
  if (mode) expect(switchKitMode(s, mode).ok).toBe(true);
  const p: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
  applyEvolutionToParams(p, s.evolution, s.factionId, 0, false);
  return p;
}
const quiet = (params: Partial<CombatParams>): CombatState => {
  const s = createCombat(1, { enemy: getEnemy('test-a'), params });
  s.spawnTimer = 1e9;
  s.enemy.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  s.player.attackTimer = 1e9;
  return s;
};

describe('C.471 스택 = 걸린 쪽 체력 막대 위 작은 네모 (GDD 7-13)', () => {
  it('천년혈전 자세 스택: 내 쪽(self) · 아이콘 = 초월자 데이터 stances[].icon · 지금 자세는 0 이어도 보인다', () => {
    const s = quiet(kitParams('ichigo', 'tybw'));
    let m = statusMarksOf(s);
    const now = m.find((x) => x.key === 'stance-kodachi');
    expect(now).toMatchObject({ on: 'self', icon: 'i-fx-slash', value: '0', full: true });
    expect(m.some((x) => x.key === 'stance-odachi')).toBe(false); // 다른 자세 0 = 안 보임
    s.kit!.stanceStacks = [12, 3];
    m = statusMarksOf(s);
    expect(m.find((x) => x.key === 'stance-kodachi')?.value).toBe('12');
    expect(m.find((x) => x.key === 'stance-odachi')).toMatchObject({ on: 'self', icon: 'i-fx-impact', value: '3', full: false });
    expect(m.every((x) => x.on === 'self')).toBe(true);
    // 이름 = 글자 대신 설명 창(title) — 이름이 들어 있다
    expect(m.find((x) => x.key === 'stance-odachi')!.title).toContain('대도');
    expect(m.find((x) => x.key === 'stance-odachi')!.name).toBe('대도'); // 설명 창 제목 = 숫자 없는 이름
  });
  it('이치고 기본 모드 월아천충 충전 · 아이젠 영창: 쌓이면 내 쪽 네모, 0 이면 없음', () => {
    const ic = quiet(kitParams('ichigo'));
    expect(statusMarksOf(ic).some((x) => x.kind === 'charge')).toBe(false);
    ic.kit!.charges = 2;
    expect(statusMarksOf(ic).find((x) => x.kind === 'charge')).toMatchObject({ on: 'self', value: '2', icon: STATUS_MARK_DEFS.charge.icon });
    const az = quiet(kitParams('aizen'));
    expect(statusMarksOf(az).some((x) => x.kind === 'kitStack')).toBe(false);
    az.kit!.stack = 3;
    const st = statusMarksOf(az).find((x) => x.kind === 'kitStack')!;
    expect(st).toMatchObject({ on: 'self', value: '3' });
    expect(st.title).toContain('영창');
  });
  it('적에게 건 것(지속 피해·넉백) = foe, 내게 걸린 지속 피해 = self', () => {
    const s = quiet({});
    s.enemy.dot = { ticks: 50, perTick: 1 };
    s.knockbackTicks = 20;
    s.player.dot = { ticks: 30, perTick: 1 };
    const m = statusMarksOf(s);
    expect(m.find((x) => x.kind === 'foeDot')?.on).toBe('foe');
    expect(m.find((x) => x.kind === 'knockback')?.on).toBe('foe');
    expect(m.find((x) => x.kind === 'selfDot')?.on).toBe('self');
  });
  it('걸린 쪽·아이콘은 데이터 표에 있고, 아이콘은 스프라이트에 있는 것만', () => {
    const sprite = read('src/ui/bha/sprite.svg');
    for (const d of Object.values(STATUS_MARK_DEFS)) {
      expect(['self', 'foe']).toContain(d.on);
      expect(sprite).toContain(`id="${d.icon}"`);
    }
    for (const ic of ['i-fx-slash', 'i-fx-impact']) expect(sprite).toContain(`id="${ic}"`);
  });
  it('화면: 체력 막대 칸(bha-unit__hp) 안 네모 줄 — 내 것 = 내 막대, 적 것 = 적 막대. 범례 줄 스택 칩·머리 위 칩은 없다', () => {
    const bv = read('src/ui/battleView.ts');
    expect(bv).toContain("const meMarks = statusMarkRow('self');");
    expect(bv).toContain("const foeMarks = statusMarkRow('foe');");
    expect(bv).toContain('hpBox.append(markRow, hp);');
    expect(bv).toContain("unit('bha-unit--foe', foeHeads, foe, enemyHp.root, foeMarks)");
    expect(bv).toContain("unit('bha-unit--me', meHeads, hero.root, playerHp.root, meMarks)");
    expect(bv).toContain('marks.update(statusMarksOf(s, bf.id));'); // C.498: 진화체 고유 능력 네모 이름 = 기반 종족 표기
    expect(bv).not.toContain('bha-kitstack');
    expect(bv).not.toContain('bha-kitbuff');
    // 화면은 걸린 쪽을 엔진 값(m.on)으로만 고른다 — 장치·초월자 id 분기 없음
    const ui = read('src/ui/bha/statusMarks.ts');
    expect(ui).toContain('rows[m.on].push(c.root);');
    expect(ui).not.toMatch(/kind === '|ichigo|aizen/);
    expect(read('src/engine/combat/statusMarks.ts')).not.toMatch(/'ichigo'|'aizen'|'kodachi'|'odachi'/);
  });
});

describe('C.471 훈련 인형 = 전투 안 설정 창 (GDD 8-9)', () => {
  it('적 목록 = 기본 훈련 인형 + 적 도감에서 본 적 (테스트 적은 테스트 모드만)', () => {
    expect(practiceFoes({}).map((e) => e.id)).toEqual([PRACTICE_DUMMY_ID]);
    const real = ENEMIES.filter((e) => !e.testOnly);
    const dex = {};
    noteEnemyBattle(dex, real[2]!.id, true, 'tower', 1);
    noteEnemyBattle(dex, real[0]!.id, false, 'tower', 1);
    expect(practiceFoes(dex).map((e) => e.id)).toEqual([PRACTICE_DUMMY_ID, real[0]!.id, real[2]!.id]); // 적 테이블 순서
    expect(practiceFoes({}, true).some((e) => e.testOnly)).toBe(true);
    expect(practiceFoes({}).some((e) => e.testOnly)).toBe(false);
    // 훈련 인형은 적 테이블(출현표·도감)에 없다
    expect(ENEMIES.some((e) => e.id === PRACTICE_DUMMY.id)).toBe(false);
  });
  it('★ = 연 난이도까지, 체력·공격력 = 창 값(내 기본 공격 n회 분량)', () => {
    const foes = practiceFoes({});
    expect(practiceStar(5, 2)).toBe(2);
    const c: TestArenaChoice = { foeId: PRACTICE_DUMMY_ID, star: 4, streak: 0, floor: null, hpAttacks: null, attackAttacks: null, attackSeconds: null, attacks: true, immortal: false };
    const base = practiceArenaEnemy(foes, c, 2)!;
    expect(base.star).toBe(2);
    expect(base.enemy.hpInAttacks).toBeCloseTo(enemyAtDifficulty(PRACTICE_DUMMY, 2).hpInAttacks);
    expect(practiceArenaDefaults(foes, PRACTICE_DUMMY_ID, 2, 2)?.hpAttacks).toBeCloseTo(base.enemy.hpInAttacks);
    const custom = practiceArenaEnemy(foes, { ...c, hpAttacks: 77, attackAttacks: 0.5 }, 2)!;
    expect(custom.enemy.hpInAttacks).toBeCloseTo(77);
    expect(custom.enemy.attackInAttacks).toBeCloseTo(0.5);
    expect(practiceArenaEnemy(foes, { ...c, foeId: 'nope' }, 2)).toBeNull();
  });
  it('흐름: [전투 들어가기] → 적 설정 창 전투(테스트 전투와 같은 arenaBattle), 결과 창 없음, 판마다 훈련 인형 수 +1', () => {
    const app = read('src/ui/app.ts');
    const practice = app.slice(app.indexOf('function practiceArena('), app.indexOf('// ── 등급전 (GDD 21장'));
    expect(practice).toContain('arenaBattle(faction, {');
    expect(practice).toContain('onRoundEnd: (sv) => recordEvolutionPractice(sv.evolution)');
    expect(practice).toContain('practiceArenaSource(faction, s0.enemyDex, maxStar, devText())');
    expect(practice).toContain('const maxStar = s0.difficulty.unlocked;');
    const test = app.slice(app.indexOf('function testBattle('), app.indexOf('function arenaBattle('));
    expect(test).toContain('arenaBattle(faction, {');
    const arena = app.slice(app.indexOf('function arenaBattle('), app.indexOf('// ── 수련장 훈련 인형'));
    expect(arena).toContain('autoEnd: true');
    expect(arena).toContain('emptyFoe: { slot: testArenaSlot(openDialog) }');
    expect(arena).toContain('onExit: () => nav.pop()');
    expect(arena).not.toContain('practiceResult');
    expect(read('src/ui/practiceView.ts')).toContain("label: '전투 들어가기'");
    // 집계 단위 = 전투 한 판(적 하나와 싸움)마다 1 — 옛 흐름(한 판 = 1)과 같은 뜻
    const s = newSaveData('hollow', 1);
    recordEvolutionPractice(s.evolution);
    recordEvolutionPractice(s.evolution);
    expect(s.evolution.practices).toBe(2);
  });
});
