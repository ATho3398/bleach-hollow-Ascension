// 체인 계열 개편 (GDD 17-3, R-3 C.34): 데이터 모델
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { ELEMENTS } from '../src/data/elements';
import { TRAITS, parseTrait } from '../src/data/traits';
import { FAMILY_TIERS, parseFactionConfig } from '../src/engine/faction';
import { BALANCE } from '../src/config/balance';
import { absorbReasons, buildCombatParams, equippedSkills, gainTrait, newBuild } from '../src/engine/absorb';
import { applyInput, createCombat, runAt, spawnSecondsOf as spawnSecondsOfTest, BASIC_SKILL_ID, step, ticksOf, type Block, type CombatParams, type CombatState } from '../src/engine/combat';
/** C.136 블록 플레이 보정(GDD 84장 3번)을 끈다 — 이 파일은 옛 피해 공식(체인·상성·환경 배율)만 본다. 보정 자체는 tests/c136.test.ts */
const NO_BLOCK_PLAY = { blockPlayDamage: 1, blockPlayCrit: 0 };
import { chainGroup } from '../src/engine/combat/tray';
import { getEnemy } from '../src/data/enemies';
import { combosAtTier, COMBOS, comboName } from '../src/data/evolution';
import { applyEvolutionToParams, comboRulesOf, newEvolution } from '../src/engine/evolution';
import { buildBattleRecord, playCombatBot, playCombatHuman, replayCombat } from '../src/engine/combat';
import { emptyLegacyMatches, emptyRunLog } from '../src/engine/runLog';
import { loadSave, migrateSave, newSaveData, recordBattle, SAVE_FORMAT_VERSION, writeSave } from '../src/game';
import { battleLabels, familyAbbr, familySkillName } from '../src/ui/labels';
import { blockAbbr, blockName } from '../src/ui/battleView';
import { helpVars } from '../src/data/help';
import { getFaction } from '../src/data/factions';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

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

  it('속성마다 세 계열(물리·특수·혼합) 공격 특성이 모두 있다 (C.47: 블록 = 계열 글자 + 속성 색)', () => {
    const famIds0 = FACTIONS[0]!.families.map((f) => f.id);
    for (const l of ELEMENTS) {
      const attacks = TRAITS.filter((x) => x.element === l.id && x.kind === 'skill' && x.role === 'attack' && !x.rare);
      for (const fam of famIds0) expect(attacks.some((t) => t.family === fam), `${l.id}/${fam}`).toBe(true);
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
    // C.136: 막기·회복 속성 특성은 데이터에서 삭제(GDD 84장 7번) — 규칙 확인용으로 공격 특성을 막기로 바꿔 만든다
    const guard = { ...TRAITS.find((t) => t.role === 'attack')!, role: 'guard', chainBonus: { kind: 'reflect', value: 1 }, family: 'family-a' };
    expect(() => parseTrait(guard)).toThrow(/family/);
  });

  it('기존 세이브(특성 id 목록)는 그대로 열리고 장착 특성이 계열을 얻는다', () => {
    const b = newBuild();
    gainTrait(b, 't-thunder-c'); // 옛 세이브에 있던 특성 id
    gainTrait(b, 't-fire-a');
    const skills = equippedSkills(b);
    expect(skills.find((s) => s.id === 't-thunder-c')!.family).toBe('family-c');
    expect(skills.find((s) => s.id === 't-fire-a')!.family).toBe('family-a');
  });
});

// ── ② 전투 엔진: 계열 체인 ──
const CX = BALANCE.provisional.combat;
const target = getEnemy('test-a'); // 불 속성 → 물 속성 블록이 상성 우위
let uid = 5000;
const blk = (traitId: string | null, family: string | null = null, kind: Block['kind'] = 'skill'): Block => ({ uid: uid++, kind, traitId, family });
const mk = (params: Partial<CombatParams> = {}, enemy = target): CombatState => createCombat(1, { enemy, params: { ...NO_BLOCK_PLAY, ...params } });
const build = (...ids: string[]) => {
  const b = newBuild();
  for (const id of ids) gainTrait(b, id);
  return buildCombatParams(b, 'hollow');
};
const quiet = (s: CombatState) => {
  s.spawnTimer = 1e9;
  s.params.voidChance = s.params.voidChanceBonus = 0;
  s.enemy.attackTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  return s;
};

describe('계열 체인 판정 (GDD 17-3 → 66장 C.118: 완전히 같은 블록끼리만)', () => {
  it('같은 계열이라도 특성이 다르면 끊기고, 같은 특성이 연속이면 한 덩어리다', () => {
    const t = [blk('t-thunder-c', 'family-c'), blk('t-blood-rare', 'family-c'), blk('t-thunder-c', 'family-c'), blk('t-fire-a', 'family-a')];
    expect(runAt(t, 1)).toEqual([1, 1]);
    expect(chainGroup(t, 0, 3)).toEqual([0]);
    expect(runAt(t, 3)).toEqual([3, 3]);
    const same = [blk('t-thunder-c', 'family-c'), blk('t-thunder-c', 'family-c'), blk('t-thunder-c', 'family-c'), blk('t-fire-a', 'family-a')];
    expect(runAt(same, 1)).toEqual([0, 2]);
    expect(chainGroup(same, 0, 3)).toEqual([0, 1, 2]);
    // 같은 특성·계열이라도 속성이 다르면(조 + 불 조) 끊긴다
    const a: Block = { uid: 1, kind: 'skill', traitId: 'basic-skill', family: 'family-a', element: null };
    const b: Block = { uid: 2, kind: 'skill', traitId: 'basic-skill', family: 'family-a', element: 'fire' };
    expect(runAt([a, b], 0)).toEqual([0, 0]);
    expect(runAt([a, { ...a, uid: 3 }], 0)).toEqual([0, 1]);
  });

  it('다른 계열 사이에 끼면 끊긴다 (a c a 는 체인 아님)', () => {
    const t = [blk('t-fire-a', 'family-a'), blk('t-thunder-c', 'family-c'), blk('t-fire-a', 'family-a')];
    expect(chainGroup(t, 0, 3)).toEqual([0]);
    expect(chainGroup(t, 2, 3)).toEqual([2]);
  });

  it('막기·회복·기본 블록은 계열이 없어 같은 특성끼리만 묶인다', () => {
    const t = [blk('basic-guard'), blk('basic-heal'), blk('basic-guard'), blk('basic-guard'), blk('basic-skill'), blk('basic-skill')];
    expect(chainGroup(t, 0, 3)).toEqual([0]);
    expect(chainGroup(t, 2, 3)).toEqual([2, 3]);
    expect(chainGroup(t, 4, 3)).toEqual([4, 5]);
    // 공격 계열 블록과 계열 없는 블록은 묶이지 않는다
    expect(chainGroup([blk('t-thunder-c', 'family-c'), blk('basic-guard')], 0, 3)).toEqual([0]);
  });

  it('4개 이상 붙어 있으면 앞에서부터 3개씩 묶인다 (같은 블록만, GDD 19-2)', () => {
    const t = [blk('t-blood-rare', 'family-c'), blk('t-blood-rare', 'family-c'), blk('t-blood-rare', 'family-c'), blk('t-blood-rare', 'family-c')];
    expect(chainGroup(t, 0, 3)).toEqual([0, 1, 2]);
    expect(chainGroup(t, 3, 3)).toEqual([3]);
    // 특성이 다른 같은 계열이 끼면 거기서 끊긴다 (C.118)
    const mixed = [blk('t-thunder-c', 'family-c'), blk('t-blood-rare', 'family-c'), blk('t-thunder-c', 'family-c'), blk('t-blood-rare', 'family-c')];
    expect(chainGroup(mixed, 0, 3)).toEqual([0]);
    expect(chainGroup(mixed, 3, 3)).toEqual([3]);
  });

  it('같은 블록 2개를 누르면 체인2: 두 블록 소모, 2단계 배율 ×2.2 — 다른 특성 같은 계열은 1개씩만 (C.118)', () => {
    const s = quiet(mk(build('t-thunder-c', 't-blood-rare')));
    s.tray = [blk('t-blood-rare', 'family-c'), blk('t-blood-rare', 'family-c'), blk('t-fire-a', 'family-a')];
    expect(applyInput(s, { type: 'use', cell: 1 })).toBe(true);
    expect(s.tray.map((b) => b.traitId)).toEqual(['t-fire-a']);
    expect(s.blocksByChain).toEqual([0, 1, 0]);
    expect(s.chainsByFamily).toEqual({ 'family-c': [0, 1, 0] });
    // 클릭한 블록(희귀 혈 위력 6)의 2단계: 6 × 2.2 × 기본 공격 10 (혈은 상성 없음, test-a 불은 약점 속성이 있어 우위 아님)
    const ev = s.events.find((e) => e.kind === 'block');
    expect(ev).toMatchObject({ chain: 2, family: 'family-c', weak: false, matchup: 'neutral' });
    expect(ev && ev.kind === 'block' ? ev.damage : 0).toBeCloseTo(6 * 2.2 * CX.playerAttackDamage);
    // 다른 특성 같은 계열(뇌 탄 + 혈 탄)은 붙어 있어도 누른 블록 하나만 나간다 (체인 보상 수치는 그대로)
    const s2 = quiet(mk(build('t-thunder-c', 't-blood-rare')));
    s2.tray = [blk('t-thunder-c', 'family-c'), blk('t-blood-rare', 'family-c'), blk('t-fire-a', 'family-a')];
    expect(applyInput(s2, { type: 'use', cell: 1 })).toBe(true);
    expect(s2.tray.map((b) => b.traitId)).toEqual(['t-thunder-c', 't-fire-a']);
    expect(s2.blocksByChain).toEqual([1, 0, 0]);
    expect(s2.params.chainMultipliers).toEqual([1, 2.2, 3.6]);
  });

  it('3단계는 종족 설정의 계열 추가 효과(적 행동 지연)가 붙는다', () => {
    const s = quiet(mk(build('t-thunder-c', 't-blood-rare')));
    s.enemy.attackTimer = 100;
    s.tray = [blk('t-thunder-c', 'family-c'), blk('t-thunder-c', 'family-c'), blk('t-thunder-c', 'family-c')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.blocksByChain).toEqual([0, 0, 1]);
    expect(s.enemy.attackTimer).toBe(100 + ticksOf(s.params, 1.5));
    expect(s.chain3Count).toBe(1);
    // 2단계에는 추가 효과가 없다
    const s2 = quiet(mk(build('t-thunder-c', 't-blood-rare')));
    s2.enemy.attackTimer = 100;
    s2.tray = [blk('t-thunder-c', 'family-c'), blk('t-thunder-c', 'family-c')];
    applyInput(s2, { type: 'use', cell: 0 });
    expect(s2.enemy.attackTimer).toBe(100);
  });

  it('우위는 계열이 아니라 속성 상성이다 (C.47): 불 적에게 물 블록은 계열과 무관하게 ×1.2, 뇌 블록은 보통', () => {
    expect(target.element).toBe('fire');
    const s = quiet(mk(build('t-water-b')));
    s.tray = [blk('t-water-b', 'family-b')];
    applyInput(s, { type: 'use', cell: 0 });
    const ev = s.events.find((e) => e.kind === 'block');
    expect(ev).toMatchObject({ weak: true, matchup: 'strong', element: 'water' });
    expect(ev && ev.kind === 'block' ? ev.damage : 0).toBeCloseTo(4.2 * BALANCE.elements.strong * CX.playerAttackDamage);
    const s2 = quiet(mk(build('t-thunder-c')));
    s2.tray = [blk('t-thunder-c', 'family-c')];
    applyInput(s2, { type: 'use', cell: 0 });
    expect(s2.events.find((e) => e.kind === 'block')).toMatchObject({ weak: false, matchup: 'neutral' });
  });

  it('약점 속성이 없는 적(노멀)에게는 아무 스킬 블록이나 우위(흡수 조건)지만 상성 배율은 없다', () => {
    const s = quiet(mk(build('t-thunder-c'), getEnemy('test-e')));
    expect(getEnemy('test-e').element).toBe('normal');
    s.tray = [blk('t-thunder-c', 'family-c')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.events.find((e) => e.kind === 'block')).toMatchObject({ weak: true, matchup: 'neutral' });
  });

  it('약점 계열 체인3 은 weakChain3Count 로 세고(런 로그), 약점 계열 마무리는 weak — 흡수는 C.125 부터 조건 없이 승리면 가능', () => {
    const s = quiet(mk(build('t-water-rare', 't-water-b')));
    s.enemy.hp = 1e9;
    s.tray = [blk('t-water-rare', 'family-b'), blk('t-water-rare', 'family-b'), blk('t-water-rare', 'family-b')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.weakChain3Count).toBe(1);
    s.enemy.hp = 1;
    s.status = 'playing';
    s.tray = [blk('t-water-b', 'family-b')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.status).toBe('won');
    expect(s.finisher).toMatchObject({ kind: 'skill', family: 'family-b', weak: true });
    expect(absorbReasons(s)).toEqual(['victory']);
  });

  it('흡수 블록은 장착한 특성의 계열대로, 기본 공격 블록은 종족 계열 표의 계열로 나온다', () => {
    const s = mk(build('t-thunder-c', 't-fire-a'));
    s.player.hp = 1e9;
    for (let i = 0; i < 4000 && s.tray.length < 8; i++) step(s);
    for (const b of s.tray) {
      if (b.kind !== 'skill') continue;
      if (b.traitId === 't-thunder-c') expect(b.family).toBe('family-c');
      else if (b.traitId === 't-fire-a') expect(b.family).toBe('family-a');
      else if (b.traitId === BASIC_SKILL_ID) expect(Object.keys(s.params.families)).toContain(b.family);
      else expect(b.family ?? null).toBeNull();
    }
  });

  it('같은 계열 특성이 여럿이면 그 계열 블록의 생성 간격이 늘어난다', () => {
    const one = mk(build('t-thunder-c'));
    const two = mk(build('t-thunder-c', 't-blood-rare'));
    const p = two.params;
    const [c5, e4] = [p.skills[0]!, p.skills[1]!];
    // C.98 (GDD 44-2): 2칸부터 칸당 absorbedSlowdownPerSlot 만큼 모든 흡수 타이머가 늘어나고, 같은 계열 겹침은 그 위에 곱한다
    const slots = (n: number) => CX.blockSpawnSeconds * (1 + BALANCE.provisional.blockPool.absorbedSlowdownPerSlot * (n - 1));
    expect(spawnSecondsOfTest(one.params, one.params.skills[0]!)).toBe(CX.blockSpawnSeconds);
    expect(spawnSecondsOfTest(p, c5)).toBeCloseTo(slots(2) * (1 + CX.familySpawnSlowdown));
    expect(spawnSecondsOfTest(p, e4)).toBeCloseTo(slots(2) * (1 + CX.familySpawnSlowdown));
    // 계열이 다르거나 계열이 없는 특성끼리는 (칸 수 보정 말고는) 느려지지 않는다
    const mixed = mk(build('t-thunder-c', 't-fire-a', 't-earth-b')).params;
    for (const sk of mixed.skills) expect(spawnSecondsOfTest(mixed, sk)).toBeCloseTo(slots(3));
  });
});

describe('세이브 마이그레이션 (형식 11 → 12)', () => {
  it('옛 전투 기록에 계열별 체인·콤보 횟수 기본값이 채워지고 빌드·슬롯은 그대로 열린다', () => {
    const save = newSaveData('hollow', 1);
    gainTrait(save.build, 't-thunder-c');
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
    expect(m.build.slots[0]).toBe('t-thunder-c');
    expect(emptyRunLog().battles).toEqual([]);
  });
});

// ── ③ 콤보 블록 ──
const RULE2 = { id: 'combo-x', family: 'family-c', minChain: 2, repeat: 2, powerInAttacks: 20 };
const fill = (s: CombatState, ...fams: ('family-c' | 'family-a' | 'void' | 'guard')[]) => {
  s.tray = fams.map((f) => (f === 'void' ? blk(null, null, 'void') : f === 'guard' ? blk('basic-guard') : blk(f === 'family-c' ? 't-thunder-c' : 't-fire-a', f)));
};
const comboCombat = (rules = [RULE2]) => quiet(mk({ ...build('t-thunder-c', 't-fire-a', 't-earth-b'), combos: rules }));
const use = (s: CombatState, cell: number) => applyInput(s, { type: 'use', cell });

describe('콤보 데이터 (진화 단계마다 1개씩 열림, GDD 17-3)', () => {
  it('단계가 오를 때마다 콤보가 하나씩 열린다', () => {
    expect([0, 1, 2, 3, 4].map((t) => combosAtTier(t).length)).toEqual([0, 1, 2, 3, 4]);
    const e = newEvolution();
    expect(comboRulesOf(e)).toEqual([]);
    e.tierIndex = 1;
    expect(comboRulesOf(e)).toEqual([{ id: COMBOS[0]!.id, family: 'family-c', minChain: 2, repeat: 2, powerInAttacks: 20 }]);
    const params: Parameters<typeof applyEvolutionToParams>[0] = {};
    applyEvolutionToParams(params, { ...e, tierIndex: 3 }, 'hollow');
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

  it('사이에 다른 블록을 쓰면 연속이 끊긴다 (다른 계열·공허·모자란 체인. 막기는 C.174 GDD 105장부터 블록이 아닌 버튼)', () => {
    for (const mid of ['family-a', 'void'] as const) {
      const s = comboCombat();
      fill(s, 'family-c', 'family-c', mid, 'family-c', 'family-c');
      use(s, 0);
      expect(s.comboStreaks['combo-x']).toBe(1);
      use(s, 0); // 가운데 블록을 쓴다
      expect(s.comboStreaks['combo-x']).toBe(0);
      s.stunTicks = 0; // 공허 경직 중에는 블록을 못 쓴다 (C.174 GDD 105장 1번)
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
    // 공허 블록 (SP 필살 블록은 C.118 에 삭제)
    const s2 = comboCombat();
    s2.tray = [blk('t-thunder-c', 'family-c'), blk('t-thunder-c', 'family-c'), blk(null, null, 'void'), blk('t-thunder-c', 'family-c'), blk('t-thunder-c', 'family-c')];
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
  // C.98: 같은 계열 2칸의 흡수 타이머가 8초 → 13초로 늘어 콤보가 드물어졌다. 이 테스트는 봇의 콤보 '인식'을 보는 것이라 옛 간격 4초로 고정한다
  const params = (): Partial<CombatParams> => ({ ...build('t-thunder-c', 't-blood-rare'), combos: [RULE2], blockSpawnSeconds: 4, hpScale: 1, playerHpScale: 1 }); // C.118: 콤보 인식 시험이라 옛 전투 길이로
  it('완벽형·사람형 봇이 콤보를 발동하고 콤보 블록을 쓴다', () => {
    let perfect = 0, human = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const a = playCombatBot(createCombat(seed, { enemy: getEnemy('test-elite'), params: params() }));
      perfect += a.combosTriggered;
      expect(a.comboBlocksUsed).toBeLessThanOrEqual(a.combosTriggered);
      const h = playCombatHuman(createCombat(seed, { enemy: getEnemy('test-elite'), params: params() }));
      human += h.combosTriggered;
    }
    // C.118: 체인이 완전히 같은 블록끼리만 되어(뇌 탄 + 혈 탄 안 묶임) 20판 콤보 수가 줄었다(완벽형 16+ → 한 자릿수). 봇이 콤보를 '낸다'는 것만 본다
    expect(perfect).toBeGreaterThanOrEqual(3);
    expect(human).toBeGreaterThanOrEqual(3);
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
    expect([1, 2, 3].map((n) => familySkillName(hollow, 'family-c', n))).toEqual(['바라', '세로', '세로 오스큐라스']);
    expect([1, 2, 3].map((n) => familySkillName(shini, 'family-a', n))).toEqual(['베기', '연참', '대참']);
    expect(familySkillName(hollow, null, 2)).toBeNull();
    expect(familySkillName(hollow, 'family-z', 2)).toBeNull();
  });

  it('상성 문구(종족 설정)와 콤보 블록 이름·약어', () => {
    expect(hollow.matchupText.strong).toBe('효과가 굉장하다!');
    expect(shini.matchupText.weak.length).toBeGreaterThan(0);
    const b: Block = { uid: 1, kind: 'combo', traitId: 'combo-t2', family: null };
    // 콤보 블록 표시 = `콤보_계열` (GDD 20장 v5.4), 콤보 기술 이름은 콤보 데이터에 그대로
    const params = { ...createCombat(1, { enemy: getEnemy('test-a') }).params, combos: comboRulesOf({ tierIndex: 4 }) };
    expect(blockName(b, hollow, 'hollow', params)).toBe('콤보_탄');
    expect(blockAbbr(b, hollow, 'hollow', params)).toBe('콤보_탄');
    expect(blockName(b, shini, 'shinigami', params)).toBe('콤보_귀');
    expect(comboName('combo-t2', 'hollow')).toBe('그랑 레이 세로');
  });

  it('도움말 자리표시자 familyList 는 계열 약어를 가운뎃점으로 잇는다', () => {
    expect(helpVars(getFaction('hollow')).familyList).toBe('조·교·탄');
    expect(helpVars(getFaction('shinigami')).familyList).toBe('참·권·귀');
  });
});

describe('런 로그: 계열별 체인·콤보 횟수 (⑤)', () => {
  it('전투 기록이 저장·불러오기를 거쳐도 계열별 체인과 콤보 횟수가 남는다', () => {
    const save = newSaveData('hollow', 0);
    for (const id of ['t-thunder-c', 't-blood-rare']) gainTrait(save.build, id);
    save.evolution.tierIndex = 1;
    const params: Partial<CombatParams> = { ...buildCombatParams(save.build, 'hollow') };
    applyEvolutionToParams(params, save.evolution, 'hollow');
    expect(params.combos).toHaveLength(1);
    let triggered = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = playCombatBot(createCombat(seed, { enemy: getEnemy('test-elite'), params }));
      triggered += s.combosTriggered;
      recordBattle(save, buildBattleRecord(s, { factionId: 'hollow' }));
    }
    const store: Record<string, string> = {};
    const storage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    writeSave(storage, save);
    const back = loadSave(storage)!;
    expect(back.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(back.runLog.battles).toHaveLength(6);
    const chains = back.runLog.battles.reduce((a, b) => a + (b.chainsByFamily['family-c']?.reduce((x, y) => x + y, 0) ?? 0), 0);
    expect(chains).toBeGreaterThan(6);
    expect(back.runLog.battles.reduce((a, b) => a + b.combosTriggered, 0)).toBe(triggered);
    // 계열 체인 횟수(체인 단계별 합)는 전투의 blocksByChain 과 같다 (계열 공격만 썼으므로)
    for (const b of back.runLog.battles) {
      const fam = b.chainsByFamily['family-c'] ?? [0, 0, 0];
      expect(fam[0]! + fam[1]! + fam[2]!).toBeLessThanOrEqual(b.blocksByChain[0] + b.blocksByChain[1] + b.blocksByChain[2]);
    }
  });
});
