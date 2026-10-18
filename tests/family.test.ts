// 체인 계열 개편 (GDD 17-3, R-3 C.34): 데이터 모델
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { LINEAGES } from '../src/data/lineages';
import { TRAITS, parseTrait } from '../src/data/traits';
import { FAMILY_TIERS, parseFactionConfig } from '../src/engine/faction';
import { BALANCE } from '../src/config/balance';
import { absorbReasons, buildCombatParams, equippedSkills, gainTrait, newBuild } from '../src/engine/absorb';
import { applyInput, createCombat, runAt, spawnSecondsOf as spawnSecondsOfTest, step, ticksOf, type Block, type CombatParams, type CombatState } from '../src/engine/combat';
import { chainGroup } from '../src/engine/combat/tray';
import { getEnemy } from '../src/data/enemies';
import { combosAtTier, COMBOS, comboName } from '../src/data/evolution';
import { applyEvolutionToParams, comboRulesOf, newEvolution } from '../src/engine/evolution';
import { buildBattleRecord, playCombatBot, playCombatHuman, replayCombat } from '../src/engine/combat';
import { emptyLegacyMatches, emptyRunLog } from '../src/engine/runLog';
import { migrateSave, newSaveData, SAVE_FORMAT_VERSION } from '../src/game';
import { battleLabels, familyAbbr, familySkillName, weakFamilyName } from '../src/ui/labels';
import { blockAbbr, blockName } from '../src/ui/battleView';
import { helpVars } from '../src/data/help';
import { getFaction } from '../src/data/factions';

describe('계열 데이터 (GDD 17-3)', () => {
  it('모든 종족 설정에 계열 목록이 있고 단계 기술은 체인 단계 수와 같다', () => {
    expect(FAMILY_TIERS).toBe(BALANCE.provisional.combat.chainMultipliers.length);
    for (const f of FACTIONS) {
      expect(f.families.length).toBeGreaterThanOrEqual(3);
      for (const fam of f.families) {
        expect(fam.tiers).toHaveLength(FAMILY_TIERS);
        expect(Array.from(fam.abbr)).toHaveLength(1);
        // 기존 체인 배율을 이어받는다
        expect(fam.tiers.map((t) => t.multiplier)).toEqual([...BALANCE.provisional.combat.chainMultipliers]);
      }
    }
  });

  it('호로는 조·교·탄, 사신은 참·권·귀 계열이다 (종족 설정에서 읽음)', () => {
    const abbrs = (id: string) => FACTIONS.find((f) => f.id === id)!.families.map((x) => x.abbr).join('');
    expect(abbrs('hollow')).toBe('조교탄');
    expect(abbrs('shinigami')).toBe('참권귀');
  });

  it('공격 특성은 계열이 있고(종족 설정에 존재), 막기·회복·패시브·파츠는 계열이 없다', () => {
    for (const t of TRAITS) {
      if (t.kind === 'skill' && t.role === 'attack') {
        expect(t.family, t.id).toBeTruthy();
        for (const f of FACTIONS) expect(f.families.some((x) => x.id === t.family), `${f.id}/${t.id}`).toBe(true);
        expect(t.chainBonus, t.id).toBeUndefined();
      } else {
        expect(t.family, t.id).toBeUndefined();
      }
    }
  });

  it('계통마다 약점 계열이 있고 그 계통 공격 특성의 계열과 같다', () => {
    for (const l of LINEAGES) {
      expect(l.family, l.id).toBeTruthy();
      for (const t of TRAITS.filter((x) => x.lineageId === l.id && x.kind === 'skill' && x.role === 'attack')) expect(t.family, t.id).toBe(l.family);
    }
    // 모든 계열에 일반(희귀 아닌) 공격 특성이 하나 이상 있다
    const famIds = FACTIONS[0]!.families.map((f) => f.id);
    for (const id of famIds) expect(TRAITS.some((t) => t.family === id && !t.rare), id).toBe(true);
  });

  it('잘못된 계열 데이터는 거절한다', () => {
    const hollow = FACTIONS.find((f) => f.id === 'hollow')!;
    expect(() => parseFactionConfig({ ...hollow, families: [] })).toThrow(/families/);
    expect(() => parseFactionConfig({ ...hollow, families: [{ ...hollow.families[0], tiers: [] }] })).toThrow(/tiers/);
    expect(() => parseFactionConfig({ ...hollow, families: [{ ...hollow.families[0], abbr: '조교' }] })).toThrow(/abbr/);
    const bad = { ...TRAITS.find((t) => t.role === 'attack')!, family: undefined };
    expect(() => parseTrait(bad)).toThrow(/family/);
    const guard = { ...TRAITS.find((t) => t.role === 'guard')!, family: 'family-a' };
    expect(() => parseTrait(guard)).toThrow(/family/);
  });

  it('기존 세이브(특성 id 목록)는 그대로 열리고 장착 특성이 계열을 얻는다', () => {
    const b = newBuild();
    gainTrait(b, 'trait-c5'); // 옛 세이브에 있던 특성 id
    gainTrait(b, 'trait-a5');
    const skills = equippedSkills(b);
    expect(skills.find((s) => s.id === 'trait-c5')!.family).toBe('family-c');
    expect(skills.find((s) => s.id === 'trait-a5')!.family).toBeNull();
  });
});

// ── ② 전투 엔진: 계열 체인 ──
const CX = BALANCE.provisional.combat;
const target = getEnemy('test-a'); // 약점 계통 B → 약점 계열 family-b
let uid = 5000;
const blk = (traitId: string | null, family: string | null = null, kind: Block['kind'] = 'skill'): Block => ({ uid: uid++, kind, traitId, family });
const mk = (params: Partial<CombatParams> = {}, enemy = target): CombatState => createCombat(1, { enemy, params });
const build = (...ids: string[]) => {
  const b = newBuild();
  for (const id of ids) gainTrait(b, id);
  return buildCombatParams(b, 'hollow');
};
const quiet = (s: CombatState) => {
  s.spawnTimers = s.spawnTimers.map(() => 1e9);
  s.voidTimer = 1e9;
  s.enemy.attackTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  return s;
};

describe('계열 체인 판정 (GDD 17-3)', () => {
  it('같은 계열 공격 블록은 특성이 달라도 연속이면 한 덩어리다', () => {
    const t = [blk('trait-c5', 'family-c'), blk('trait-e4', 'family-c'), blk('trait-c5', 'family-c'), blk('trait-a1', 'family-a')];
    expect(runAt(t, 1)).toEqual([0, 2]);
    expect(chainGroup(t, 0, 3)).toEqual([0, 1, 2]);
    expect(runAt(t, 3)).toEqual([3, 3]);
  });

  it('다른 계열 사이에 끼면 끊긴다 (a c a 는 체인 아님)', () => {
    const t = [blk('trait-a1', 'family-a'), blk('trait-c5', 'family-c'), blk('trait-a1', 'family-a')];
    expect(chainGroup(t, 0, 3)).toEqual([0]);
    expect(chainGroup(t, 2, 3)).toEqual([2]);
  });

  it('막기·회복·기본 블록은 계열이 없어 같은 특성끼리만 묶인다', () => {
    const t = [blk('trait-a5'), blk('trait-b1'), blk('trait-a5'), blk('trait-a5'), blk('basic-skill'), blk('basic-skill')];
    expect(chainGroup(t, 0, 3)).toEqual([0]);
    expect(chainGroup(t, 2, 3)).toEqual([2, 3]);
    expect(chainGroup(t, 4, 3)).toEqual([4, 5]);
    // 공격 계열 블록과 계열 없는 블록은 묶이지 않는다
    expect(chainGroup([blk('trait-c5', 'family-c'), blk('trait-a5')], 0, 3)).toEqual([0]);
  });

  it('4개 이상 붙어 있으면 클릭한 블록을 포함한 최대 3개가 발동한다', () => {
    const t = [blk('trait-c5', 'family-c'), blk('trait-e4', 'family-c'), blk('trait-c5', 'family-c'), blk('trait-e4', 'family-c')];
    expect(chainGroup(t, 0, 3)).toEqual([0, 1, 2]);
    expect(chainGroup(t, 3, 3)).toEqual([1, 2, 3]);
  });

  it('다른 특성 같은 계열 2개를 누르면 체인2: 두 블록 소모, 2단계 배율 ×2.2', () => {
    const s = quiet(mk(build('trait-c5', 'trait-e4')));
    s.tray = [blk('trait-c5', 'family-c'), blk('trait-e4', 'family-c'), blk('trait-a1', 'family-a')];
    expect(applyInput(s, { type: 'use', cell: 1 })).toBe(true);
    expect(s.tray.map((b) => b.traitId)).toEqual(['trait-a1']);
    expect(s.blocksByChain).toEqual([0, 1, 0]);
    expect(s.chainsByFamily).toEqual({ 'family-c': [0, 1, 0] });
    // 클릭한 블록(e4 위력 5)의 2단계: 5 × 2.2 × 기본 공격 10 (test-a 약점은 계열 b 라 약점 아님)
    const ev = s.events.find((e) => e.kind === 'block');
    expect(ev).toMatchObject({ chain: 2, family: 'family-c', weak: false });
    expect(ev && ev.kind === 'block' ? ev.damage : 0).toBeCloseTo(5 * 2.2 * CX.playerAttackDamage);
  });

  it('3단계는 종족 설정의 계열 추가 효과(적 행동 지연)가 붙는다', () => {
    const s = quiet(mk(build('trait-c5', 'trait-e4')));
    s.enemy.attackTimer = 100;
    s.tray = [blk('trait-c5', 'family-c'), blk('trait-e4', 'family-c'), blk('trait-c5', 'family-c')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.blocksByChain).toEqual([0, 0, 1]);
    expect(s.enemy.attackTimer).toBe(100 + ticksOf(s.params, 1.5));
    expect(s.chain3Count).toBe(1);
    // 2단계에는 추가 효과가 없다
    const s2 = quiet(mk(build('trait-c5', 'trait-e4')));
    s2.enemy.attackTimer = 100;
    s2.tray = [blk('trait-c5', 'family-c'), blk('trait-e4', 'family-c')];
    applyInput(s2, { type: 'use', cell: 0 });
    expect(s2.enemy.attackTimer).toBe(100);
  });

  it('약점은 계열 기준이다: 약점 계통의 계열 공격 블록 ×1.5, 같은 계통 아니어도 계열이 맞으면 약점', () => {
    // test-a 약점 계통 B → family-b. d1(계통 d, 계열 b)도 약점이다
    const s = quiet(mk(build('trait-d1')));
    expect(s.enemy.weakFamily).toBe('family-b');
    s.tray = [blk('trait-d1', 'family-b')];
    applyInput(s, { type: 'use', cell: 0 });
    const ev = s.events.find((e) => e.kind === 'block');
    expect(ev).toMatchObject({ weak: true });
    expect(ev && ev.kind === 'block' ? ev.damage : 0).toBeCloseTo(3.5 * 1.5 * CX.playerAttackDamage);
    // 반대로 계통 b 약점인 적에게 계통이 다른 c5(family-c)는 약점이 아니다
    const s2 = quiet(mk(build('trait-c5')));
    s2.tray = [blk('trait-c5', 'family-c')];
    applyInput(s2, { type: 'use', cell: 0 });
    expect(s2.events.find((e) => e.kind === 'block')).toMatchObject({ weak: false });
  });

  it('약점 계열 체인3 은 흡수 조건 (weakChain3Count), 약점 계열 마무리도 조건', () => {
    const s = quiet(mk(build('trait-b4', 'trait-d1')));
    s.enemy.hp = 1e9;
    s.tray = [blk('trait-b4', 'family-b'), blk('trait-d1', 'family-b'), blk('trait-b4', 'family-b')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.weakChain3Count).toBe(1);
    s.enemy.hp = 1;
    s.status = 'playing';
    s.tray = [blk('trait-d1', 'family-b')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.status).toBe('won');
    expect(s.finisher).toMatchObject({ kind: 'skill', family: 'family-b', weak: true });
    expect(absorbReasons(s)).toEqual(['weakness-finisher', 'weakness-chain3']);
  });

  it('블록은 장착한 특성의 계열대로 나온다', () => {
    const s = mk(build('trait-c5', 'trait-a1'));
    for (let i = 0; i < 400 && s.tray.length < 4; i++) step(s);
    const fams = new Set(s.tray.filter((b) => b.kind === 'skill').map((b) => b.family));
    expect(fams).toEqual(new Set(['family-c', 'family-a']));
    for (const b of s.tray) if (b.kind === 'skill') expect(b.family).toBe(b.traitId === 'trait-c5' ? 'family-c' : 'family-a');
  });

  it('같은 계열 특성이 여럿이면 그 계열 블록의 생성 간격이 늘어난다', () => {
    const one = mk(build('trait-c5'));
    const two = mk(build('trait-c5', 'trait-e4'));
    const p = two.params;
    const [c5, e4] = [p.skills[0]!, p.skills[1]!];
    expect(spawnSecondsOfTest(one.params, one.params.skills[0]!)).toBe(CX.blockSpawnSeconds);
    expect(spawnSecondsOfTest(p, c5)).toBe(CX.blockSpawnSeconds * (1 + CX.familySpawnSlowdown));
    expect(spawnSecondsOfTest(p, e4)).toBe(CX.blockSpawnSeconds * (1 + CX.familySpawnSlowdown));
    // 계열이 다르거나 계열이 없는 특성끼리는 느려지지 않는다
    const mixed = mk(build('trait-c5', 'trait-a1', 'trait-a5')).params;
    for (const sk of mixed.skills) expect(spawnSecondsOfTest(mixed, sk)).toBe(CX.blockSpawnSeconds);
  });
});

describe('세이브 마이그레이션 (형식 11 → 12)', () => {
  it('옛 전투 기록에 계열별 체인·콤보 횟수 기본값이 채워지고 빌드·슬롯은 그대로 열린다', () => {
    const save = newSaveData('hollow', 1);
    gainTrait(save.build, 'trait-c5');
    const old = JSON.parse(JSON.stringify(save));
    old.meta.format = 11;
    old.runLog.battles = [{
      runId: 1, lap: 1, turns: 0, matchesByRole: emptyLegacyMatches(), won: true, skillsUsed: [], enemyClass: 'normal', tierIndex: 0, enemyId: 'e',
      factionId: 'hollow', seed: 1, riskGained: 0, absorbGained: 0, lossReason: null, durationSeconds: 30, blocksByTrait: {}, blocksByChain: [0, 0, 0],
      chain3Count: 0, guardSuccesses: 0, voidUsed: 0, specialUsed: false, finisherKind: null, finisherTraitId: null, finisherLineageId: null,
      absorbable: false, storedUsed: 0, storedWasted: 0,
    }];
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.runLog.battles[0]).toMatchObject({ chainsByFamily: {}, combosTriggered: 0, comboBlocksUsed: 0 });
    expect(m.build.slots[0]).toBe('trait-c5');
    expect(emptyRunLog().battles).toEqual([]);
  });
});

// ── ③ 콤보 블록 ──
const RULE2 = { id: 'combo-x', family: 'family-c', minChain: 2, repeat: 2, powerInAttacks: 20 };
const fill = (s: CombatState, ...fams: ('family-c' | 'family-a' | 'void' | 'guard')[]) => {
  s.tray = fams.map((f) => (f === 'void' ? blk(null, null, 'void') : f === 'guard' ? blk('trait-a5') : blk(f === 'family-c' ? 'trait-c5' : 'trait-a1', f)));
};
const comboCombat = (rules = [RULE2]) => quiet(mk({ ...build('trait-c5', 'trait-a1', 'trait-a5'), combos: rules }));
const use = (s: CombatState, cell: number) => applyInput(s, { type: 'use', cell });

describe('콤보 데이터 (진화 단계마다 1개씩 열림, GDD 17-3)', () => {
  it('단계가 오를 때마다 콤보가 하나씩 열린다', () => {
    expect([0, 1, 2, 3, 4].map((t) => combosAtTier(t).length)).toEqual([0, 1, 2, 3, 4]);
    const e = newEvolution();
    expect(comboRulesOf(e)).toEqual([]);
    e.tierIndex = 1;
    expect(comboRulesOf(e)).toEqual([{ id: COMBOS[0]!.id, family: 'family-c', minChain: 2, repeat: 2, powerInAttacks: 20 }]);
    const params: Parameters<typeof applyEvolutionToParams>[0] = {};
    applyEvolutionToParams(params, { ...e, tierIndex: 3 });
    expect(params.combos).toHaveLength(3);
  });

  it('호로는 탄 계열 2체인 연속 2번 → 그랑 레이 세로, 이름은 종족별로 읽는다', () => {
    const c = COMBOS[0]!;
    expect(c).toMatchObject({ family: 'family-c', minChain: 2, repeat: 2 });
    expect(comboName(c.id, 'hollow')).toBe('그랑 레이 세로');
    expect(comboName(c.id, 'shinigami')).not.toBe(comboName(c.id, 'hollow'));
    expect(COMBOS.every((x) => x.provisional)).toBe(true);
  });
});

describe('콤보 발동 (GDD 17-3)', () => {
  it('같은 계열 2체인을 사이에 다른 블록 없이 연속 2번 쓰면 콤보 블록이 바 맨 오른쪽에 생긴다', () => {
    const s = comboCombat();
    fill(s, 'family-c', 'family-c', 'family-a', 'family-c', 'family-c');
    expect(use(s, 0)).toBe(true); // 체인2 (1번째)
    expect(s.comboStreaks['combo-x']).toBe(1);
    expect(s.tray.map((b) => b.kind)).toEqual(['skill', 'skill', 'skill']);
    expect(s.combosTriggered).toBe(0);
    s.events.length = 0;
    expect(use(s, 1)).toBe(true); // 체인2 (2번째): a c c 에서 c c
    // 남은 a 다음, 맨 오른쪽에 콤보 블록
    expect(s.tray.map((b) => b.kind)).toEqual(['skill', 'combo']);
    expect(s.tray[1]).toMatchObject({ kind: 'combo', traitId: 'combo-x' });
    expect(s.comboStreaks['combo-x']).toBe(0);
    expect(s.combosTriggered).toBe(1);
    expect(s.events.some((e) => e.kind === 'combo' && e.comboId === 'combo-x')).toBe(true);
  });

  it('사이에 다른 블록을 쓰면 연속이 끊긴다 (다른 계열·공허·막기·필살·모자란 체인)', () => {
    for (const mid of ['family-a', 'void', 'guard'] as const) {
      const s = comboCombat();
      fill(s, 'family-c', 'family-c', mid, 'family-c', 'family-c');
      use(s, 0);
      expect(s.comboStreaks['combo-x']).toBe(1);
      use(s, 0); // 가운데 블록을 쓴다
      expect(s.comboStreaks['combo-x']).toBe(0);
      use(s, 0); // 체인2 (c c)
      expect(s.comboStreaks['combo-x']).toBe(1);
      expect(s.tray.some((b) => b.kind === 'combo')).toBe(false);
      expect(s.combosTriggered).toBe(0);
    }
    // 체인1 은 2단계에 못 미쳐 연속을 끊는다
    const s = comboCombat();
    fill(s, 'family-c', 'family-c', 'family-a', 'family-c', 'family-a');
    use(s, 0);
    use(s, 1); // a 블록(체인1)
    expect(s.comboStreaks['combo-x']).toBe(0);
    // 필살 블록
    const s2 = comboCombat();
    s2.tray = [blk('trait-c5', 'family-c'), blk('trait-c5', 'family-c'), blk(null, null, 'special'), blk('trait-c5', 'family-c'), blk('trait-c5', 'family-c')];
    use(s2, 0);
    use(s2, 0);
    expect(s2.comboStreaks['combo-x']).toBe(0);
  });

  it('체인 단계가 모자라거나 계열이 다르면 연속으로 세지 않는다 (minChain 3 규칙)', () => {
    const s = comboCombat([{ ...RULE2, minChain: 3 }]);
    fill(s, 'family-c', 'family-c', 'family-a', 'family-c', 'family-c');
    use(s, 0); // 체인2 → minChain 3 에 못 미친다
    expect(s.comboStreaks['combo-x']).toBe(0);
    const t = comboCombat([{ ...RULE2, minChain: 3 }]);
    fill(t, 'family-c', 'family-c', 'family-c', 'family-a', 'family-c', 'family-c', 'family-c');
    use(t, 0);
    expect(t.comboStreaks['combo-x']).toBe(1);
    use(t, 1); // a 가 맨 앞으로 당겨졌다
    expect(t.comboStreaks['combo-x']).toBe(0);
    // 다른 계열의 체인은 이 규칙에 안 센다
    const u = comboCombat();
    fill(u, 'family-a', 'family-a');
    use(u, 0);
    expect(u.comboStreaks['combo-x']).toBe(0);
  });

  it('규칙이 없으면(진화 전) 콤보는 생기지 않는다', () => {
    const s = comboCombat([]);
    fill(s, 'family-c', 'family-c', 'family-c', 'family-c');
    use(s, 0);
    use(s, 0);
    expect(s.tray.some((b) => b.kind === 'combo')).toBe(false);
    expect(s.combosTriggered).toBe(0);
  });

  it('콤보 블록을 쓰면 기본 공격 약 20회분 피해, 마무리 일격 종류 combo, 기록에 남는다', () => {
    const s = comboCombat();
    s.enemy.hp = 1e9;
    s.tray = [{ uid: uid++, kind: 'combo', traitId: 'combo-x', family: null }];
    use(s, 0);
    const ev = s.events.find((e) => e.kind === 'block');
    expect(ev).toMatchObject({ block: 'combo', traitId: 'combo-x', damage: 20 * CX.playerAttackDamage });
    expect(s.comboBlocksUsed).toBe(1);
    expect(s.comboStreaks['combo-x']).toBe(0);
    const k = comboCombat();
    k.enemy.hp = 10;
    k.tray = [{ uid: uid++, kind: 'combo', traitId: 'combo-x', family: null }];
    use(k, 0);
    expect(k.finisher).toMatchObject({ kind: 'combo' });
    const rec = buildBattleRecord(k, { factionId: 'hollow' });
    expect(rec).toMatchObject({ comboBlocksUsed: 1, finisherKind: 'combo', combosTriggered: 0 });
  });

  it('런 로그 BattleRecord 에 계열별 체인 횟수와 콤보 발동 횟수가 담긴다', () => {
    const s = comboCombat();
    s.enemy.hp = 1e9;
    fill(s, 'family-c', 'family-c', 'family-a', 'family-c', 'family-c');
    use(s, 0);
    use(s, 1);
    const rec = buildBattleRecord(s, { factionId: 'hollow' });
    expect(rec.chainsByFamily).toEqual({ 'family-c': [0, 2, 0] });
    expect(rec.combosTriggered).toBe(1);
  });
});

describe('봇은 콤보를 인식한다 (GDD 17-3)', () => {
  const params = (): Partial<CombatParams> => ({ ...build('trait-c5', 'trait-e4'), combos: [RULE2] });
  it('완벽형·사람형 봇이 콤보를 발동하고 콤보 블록을 쓴다', () => {
    let perfect = 0, human = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const a = playCombatBot(createCombat(seed, { enemy: getEnemy('test-elite'), params: params() }));
      perfect += a.combosTriggered;
      expect(a.comboBlocksUsed).toBeLessThanOrEqual(a.combosTriggered);
      const h = playCombatHuman(createCombat(seed, { enemy: getEnemy('test-elite'), params: params() }));
      human += h.combosTriggered;
    }
    expect(perfect).toBeGreaterThan(20);
    expect(human).toBeGreaterThan(5);
  });

  it('같은 시드와 입력 기록이면 콤보가 있어도 같은 결과', () => {
    const a = playCombatBot(createCombat(7, { enemy: getEnemy('test-a'), params: params() }));
    const again = replayCombat(7, { enemy: getEnemy('test-a'), params: params() }, a.inputs);
    expect(again.combosTriggered).toBe(a.combosTriggered);
    expect(again.tick).toBe(a.tick);
    expect(again.enemy.hp).toBe(a.enemy.hp);
  });
});

describe('계열 표시 (④, GDD 17-3)', () => {
  const hollow = battleLabels(getFaction('hollow'));
  const shini = battleLabels(getFaction('shinigami'));
  it('블록 바 계열 약어: 호로 조·교·탄 / 사신 참·권·귀 (종족 설정에서 읽음)', () => {
    expect(['family-a', 'family-b', 'family-c'].map((f) => familyAbbr(hollow, f))).toEqual(['조', '교', '탄']);
    expect(['family-a', 'family-b', 'family-c'].map((f) => familyAbbr(shini, f))).toEqual(['참', '권', '귀']);
    expect(familyAbbr(hollow, null)).toBeUndefined();
  });

  it('체인 단계 기술 이름은 계열·단계로 읽는다 (플로팅 텍스트·로그)', () => {
    expect([1, 2, 3].map((n) => familySkillName(hollow, 'family-c', n))).toEqual(['바라', '세로', '세로 오스쿠라스']);
    expect([1, 2, 3].map((n) => familySkillName(shini, 'family-a', n))).toEqual(['베기', '연참', '대참']);
    expect(familySkillName(hollow, null, 2)).toBeNull();
    expect(familySkillName(hollow, 'family-z', 2)).toBeNull();
  });

  it('약점 계통의 계열 이름과 콤보 블록 이름·약어', () => {
    expect(weakFamilyName(hollow, 'lineage-c')).toBe('탄(彈)');
    expect(weakFamilyName(shini, 'lineage-d')).toBe('권(拳)');
    const b: Block = { uid: 1, kind: 'combo', traitId: 'combo-t2', family: null };
    expect(blockName(b, hollow, 'hollow')).toBe('그랑 레이 세로');
    expect(blockAbbr(b, hollow, 'hollow').length).toBeGreaterThan(0);
    expect(blockName(b, shini, 'shinigami')).toBe('파도의 90 흑관');
  });

  it('도움말 자리표시자 familyList 는 계열 약어를 가운뎃점으로 잇는다', () => {
    expect(helpVars(getFaction('hollow')).familyList).toBe('조·교·탄');
    expect(helpVars(getFaction('shinigami')).familyList).toBe('참·권·귀');
  });
});
