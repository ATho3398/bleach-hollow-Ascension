// C.118 (GDD 62장·66장): 배속 삭제·전투 시간 절반(hpScale) · SP 필살 블록 삭제 · 완전히 같은 블록끼리만 체인 · 방어/회복 출현 절반
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { FACTIONS, getFaction } from '../src/data/factions';
import { BATTLE_HELP_TARGETS, GLOSSARY, TUTORIAL_SCENES, helpVars } from '../src/data/help';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import {
  applyInput, BASIC_GUARD_ID, BASIC_HEAL_ID, BASIC_SKILL_ID, blockPoolOf, chainGroup, createCombat, elapsedSeconds, playCombatHuman, runAt, sameChainKind, step,
  type Block, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { battleLabels } from '../src/ui/labels';
import { actionFor } from '../src/ui/shortcutMap';

const CX = BALANCE.provisional.combat;
const BP = BALANCE.provisional.blockPool;
const LIB = BALANCE.provisional.liberation;
const normal = getEnemy('test-a');
let uid = 7000;
const blk = (traitId: string | null, family: string | null = null, element: string | null = null, kind: Block['kind'] = 'skill'): Block => ({ uid: uid++, kind, traitId, family, element });
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
  return s;
};

describe('62장 ② 전투 시간 절반 — hpScale', () => {
  it('hpScale 0.5 가 적 최대 체력에, playerHpScale 0.7 이 내 최대 체력에 곱해진다 (회복·보호막은 최대 체력 비율이라 같이 준다)', () => {
    expect(CX.hpScale).toBe(0.5);
    expect(CX.playerHpScale).toBe(0.7);
    const half = createCombat(1, { enemy: normal });
    const full = createCombat(1, { enemy: normal, params: { hpScale: 1, playerHpScale: 1 } });
    expect(half.enemy.maxHp).toBeCloseTo(normal.hpInAttacks * CX.hpAttackScale * CX.playerAttackDamage * 0.5);
    expect(full.enemy.maxHp).toBeCloseTo(half.enemy.maxHp * 2);
    expect(full.player.maxHp).toBeCloseTo(half.player.maxHp / 0.7);
    expect(half.player.maxHp).toBeCloseTo(CX.playerMaxHp * 0.7);
    // 회복(전투 소모품 회복약, C.177)은 최대 체력 비율이라 같이 준다
    const s = quiet(createCombat(1, { enemy: normal, params: { battleItem: { id: 'battle-potion', effect: 'heal', fraction: 0.25 } } }));
    s.player.hp = 1;
    applyInput(s, { type: 'item' });
    expect(s.player.hp - 1).toBeCloseTo(s.player.maxHp * 0.25, 6);
  });

  it('사람형 봇 일반 적 처치 시간이 hpScale 1 의 약 절반(0.4~0.65배)이고, 블록 생성 타이머·틱은 그대로', () => {
    let half = 0;
    let full = 0;
    for (let seed = 1; seed <= 12; seed++) {
      half += elapsedSeconds(playCombatHuman(createCombat(seed, { enemy: normal, params: build('t-thunder-c') })));
      full += elapsedSeconds(playCombatHuman(createCombat(seed, { enemy: normal, params: { ...build('t-thunder-c'), hpScale: 1, playerHpScale: 1, blockSpawnMultiplier: 1 / 1.7 } })));
    }
    const ratio = half / full;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.65);
    expect(CX.tickSeconds).toBe(0.1);
    // 블록 타이머는 ÷1.7 (6.5 → 3.8 · 3.2 → 1.9 · 물공 6 → 3.5 · 혈 3 → 1.8): 체력만 반으로 줄이면 블록·체인이 적어 강적 승률이 무너져서
    expect(CX.blockSpawnSeconds).toBe(4.6); // C.132: 3.8 → 5.4 → C.133: 4.0 (GDD 80장 v5.166 기본 몫 45·25·15% 와 함께 칸별 블록 총량 맞춤) → C.134: 4.6 (GDD 83장 해방)
    expect(BP.basicSpawnSeconds).toBe(3.24); // C.136: 3.24 (막기·회복 고정 몫이 따로 붙어 빈 몸 총량 유지, GDD 84장 7번). C.133: 1.9 → 2.1 (1칸 몸보다 빈 몸이 블록을 더 많이 내지 않게, GDD 80장 v5.166) → C.134: 2.7 (흡수 타이머 4.7 에 맞춤)
    expect(BALANCE.provisional.physBlocks.spawnSeconds).toBe(3.5);
    expect(BALANCE.provisional.physBlocks.spawnSecondsByElement.blood).toBe(1.8);
  });
});

describe('62장 ① 배속 삭제 — 1배 고정', () => {
  it('전투 단축키 E(배속)가 없고, 전투 배속 기억 함수도 없다', async () => {
    expect(actionFor('battle', 'KeyE')).toBe('gear'); // C.177: E = 장비 발동 (GDD 105장 수정 6)
    expect(actionFor('battle', 'Space')).toBe('pause');
    const battle: Record<string, unknown> = await import('../src/ui/bha/battle');
    expect(battle.loadBattleSpeed).toBeUndefined();
    expect(battle.saveBattleSpeed).toBeUndefined();
    expect(battle.BATTLE_SPEEDS).toBeUndefined();
  });
  it('원정 화면은 배속 getter 를 내보내지 않는다 (setSpeed 는 테스트 모드 전용)', async () => {
    const mod: Record<string, unknown> = await import('../src/ui/expeditionView');
    expect(mod.getSpeed).toBeUndefined();
    expect(typeof mod.setSpeed).toBe('function');
  });
});

describe('66장 1번 SP 필살 블록 삭제 — 필살기는 저장형만', () => {
  it('전투 상태·수치·종족 설정·표시 이름·도움말에서 SP 와 필살 블록이 빠졌다', () => {
    const s = createCombat(1, { enemy: normal });
    expect('sp' in s).toBe(false);
    expect('specialUsed' in s).toBe(false);
    expect('spMax' in CX).toBe(false);
    expect('spPerBlock' in CX).toBe(false);
    expect('specialPowerInAttacks' in CX).toBe(false);
    for (const f of FACTIONS) {
      expect('spName' in f).toBe(false);
      expect('specialBlockName' in f).toBe(false);
      const l = battleLabels(f);
      expect('sp' in l).toBe(false);
      expect('specialBlock' in l).toBe(false);
      expect('storedSkill' in l).toBe(false); // 저장 필살도 C.134 에 삭제 (GDD 83장)
      const vars = helpVars(f);
      expect('specialBlockName' in vars).toBe(false);
      expect('spName' in vars).toBe(false);
    }
    expect(GLOSSARY.map((g) => g.id)).not.toEqual(expect.arrayContaining(['sp']));
    expect(GLOSSARY.map((g) => g.id)).not.toEqual(expect.arrayContaining(['special-block']));
    expect(GLOSSARY.map((g) => g.id)).toEqual(expect.arrayContaining(['liberation']));
    expect(TUTORIAL_SCENES.map((t) => t.id)).not.toContain('sp');
    expect(TUTORIAL_SCENES.map((t) => t.id)).toContain('liberation');
    expect(BATTLE_HELP_TARGETS as readonly string[]).not.toContain('battle.sp');
  });

  it('블록을 100개 써도 바에 필살 블록이 생기지 않고 해방 게이지만 찬다 (C.134: 저장 게이지 → 해방 게이지, 100 에서 멈춤)', () => {
    const s = quiet(createCombat(2, { enemy: normal }));
    s.enemy.hp = s.enemy.maxHp = 1e12;
    for (let i = 0; i < 100; i++) {
      s.tray = [blk(BASIC_SKILL_ID)];
      applyInput(s, { type: 'use', cell: 0 });
      step(s);
    }
    expect(s.tray.every((b) => b.kind === 'skill' || b.kind === 'void')).toBe(true);
    expect(s.liberation.gauge).toBe(BALANCE.provisional.liberation.gaugeMax);
  });

  it('정화(cleanse) 체인 효과는 SP 대신 해방 게이지 +value (C.118 저장 게이지 → C.134 해방 게이지)', () => {
    const s = quiet(createCombat(1, { enemy: normal, params: build() })); // C.136: 회복 속성 특성 삭제 — 기본 회복 블록
    s.sealTicks = 30;
    s.liberation.gauge = 0;
    s.params.liberationGaugePerDealt = 0; // 블록 몫만 본다 (C.154: 피해로도 참)
    s.tray = [blk('basic-heal'), blk('basic-heal'), blk('basic-heal')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.sealTicks).toBe(0);
    expect(s.liberation.gauge).toBe(3 * LIB.gaugePerBlock + LIB.chainBonus[2]! + BP.basicRoleBlocks.heal.chainBonus.value);
  });
});

describe('66장 2번 완전히 같은 블록끼리만 체인 (보상 수치는 그대로)', () => {
  it('같은 특성·계열·속성이면 묶이고, 하나라도 다르면 안 묶인다', () => {
    const a = blk('t-fire-a', 'family-a', 'fire');
    expect(sameChainKind(a, blk('t-fire-a', 'family-a', 'fire'))).toBe(true);
    expect(sameChainKind(a, blk('t-water-a', 'family-a', 'water'))).toBe(false); // 같은 계열, 다른 속성·특성
    expect(sameChainKind(a, blk(BASIC_SKILL_ID, 'family-a', 'fire'))).toBe(false); // 같은 계열·속성, 기본 블록 (특성 다름)
    expect(sameChainKind(blk(BASIC_SKILL_ID, 'family-a', null), blk(BASIC_SKILL_ID, 'family-a', 'fire'))).toBe(false); // 조 + 불 조
    expect(sameChainKind(blk(BASIC_SKILL_ID, 'family-a', null), blk(BASIC_SKILL_ID, 'family-a', null))).toBe(true);
    expect(sameChainKind(blk(BASIC_SKILL_ID, 'family-a'), blk(BASIC_SKILL_ID, 'family-b'))).toBe(false);
    expect(sameChainKind(blk(BASIC_GUARD_ID), blk(BASIC_GUARD_ID))).toBe(true);
    expect(sameChainKind(blk(BASIC_GUARD_ID), blk(BASIC_HEAL_ID))).toBe(false); // C.136: 막기·회복 속성 특성 삭제 — 막기 ≠ 회복
    // 사슬 표시(runAt)도 같은 판정
    const t = [blk('t-thunder-c', 'family-c', 'thunder'), blk('t-blood-rare', 'family-c', 'blood'), blk('t-thunder-c', 'family-c', 'thunder'), blk('t-thunder-c', 'family-c', 'thunder')];
    expect(runAt(t, 0)).toEqual([0, 0]);
    expect(runAt(t, 2)).toEqual([2, 3]);
    expect(chainGroup(t, 3, 3)).toEqual([2, 3]);
  });

  it('생성된 블록은 속성을 가진다: 흡수 특성 블록은 그 특성 속성, 기본 블록은 물공 속성(없으면 null)', () => {
    const s = createCombat(3, { enemy: normal, params: { ...build('t-thunder-c'), voidChance: 0, voidChanceMax: 0 } });
    s.player.hp = 1e9;
    s.enemy.hp = s.enemy.maxHp = 1e12;
    for (let i = 0; i < 400 && s.tray.length < 8; i++) step(s);
    const trait = s.tray.filter((b) => b.traitId === 't-thunder-c');
    const basic = s.tray.filter((b) => b.traitId === BASIC_SKILL_ID);
    expect(trait.length).toBeGreaterThan(0);
    expect(basic.length).toBeGreaterThan(0);
    for (const b of trait) expect(b.element).toBe('thunder');
    for (const b of basic) expect(b.element).toBeNull();
  });

  it('체인 보상 수치는 바꾸지 않았다 (사용자 11:22)', () => {
    expect(CX.chainMultipliers).toEqual([1, 2.2, 3.6]);
    expect(CX.chainBonusFromChain).toBe(3);
    expect(BALANCE.provisional.liberation.chainBonus).toEqual([0, 4, 10]); // 옛 storedChainBonus (C.134 에 해방 게이지로)
    const p: CombatParams = createCombat(1, { enemy: normal }).params;
    expect(p.chainMultipliers).toEqual([1, 2.2, 3.6]);
  });
});

describe('66장 3번 방어·회복 블록 출현 약 절반', () => {
  it('기본 가중 공격 10 × 3 (막기·회복 가중은 C.174 GDD 105장 뒤 쓰지 않음 — 버튼)', () => {
    expect(BP.basicWeights).toEqual({ attack: 10, guard: 3, heal: 3 });
    const p = createCombat(1, { enemy: normal }).params;
    const pool = blockPoolOf(p);
    const share = (id: string) => pool.filter((e) => e.source.id === id).reduce((a, e) => a + e.chance, 0);
    // C.174 (GDD 105장): 막기·회복은 블록에서 빠져 버튼 — 기본 블록 풀은 공격뿐
    const gh = share(BASIC_GUARD_ID) + share(BASIC_HEAL_ID);
    expect(gh).toBe(0);
    expect(share(BASIC_SKILL_ID)).toBeCloseTo(1, 6);
  });
});
