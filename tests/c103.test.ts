// C.103 물공 특수 블록·특성 (GDD 49장·49-1): 5단계 물리(조·참) 단일 속성 6종(흙·혈·불·물·뇌·노멀)의 기본 공격 블록 3계열 전부 + 특성 1칸.
// 효과는 엔진(종족 무관), 이름은 데이터(종족별), 수치는 BALANCE.provisional.physBlocks
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { FORM_TABLE, PHYS_ELEMENT_IDS, getForm, physAbilityName, physBlockName, physProcText, validatePhysBlocks } from '../src/data/evolution';
import { getFaction } from '../src/data/factions';
import {
  BASIC_GUARD_ID, BASIC_HEAL_ID, BASIC_SKILL_ID, applyInput, basicPowerOf, basicSources, blockDamage, blockPoolOf, buildBattleRecord, createCombat, drainCombatEvents, step, ticksOf,
  type Block, type CombatEvent, type CombatParams, type CombatState, type PhysBlock,
} from '../src/engine/combat';
import { abilityEffectsOf, abilityLines, applyEvolutionToParams, formAbilitiesOf, newEvolution, physBlockOf, zeroStats } from '../src/engine/evolution';
import { battleLabels } from '../src/ui/labels';
import { blockName } from '../src/ui/battleView';
import { abilityProcText } from '../src/ui/evolutionPanel';

const PB = BALANCE.provisional.physBlocks;
const normal = getEnemy('test-a');
let uid = 9000;
const blk = (traitId: string, family: string | null = 'family-a'): Block => ({ uid: uid++, kind: 'skill', traitId, family });
/** 흔들림 없는 전투: 치명·적 피해 흔들림 0 */
const STILL: Partial<CombatParams> = { critChance: 0, enemyCritChance: 0, enemyDamageVariance: 0 };
const physOf = (id: string): PhysBlock | null => physBlockOf(formAbilitiesOf(getForm(id), zeroStats(), 'atk'));
const fxOf = (id: string) => abilityEffectsOf(formAbilitiesOf(getForm(id), zeroStats(), 'atk')).effects;
const mk = (extra: Partial<CombatParams>, seed = 1, enemy = normal) => createCombat(seed, { enemy, params: { ...STILL, ...extra } });
const run = (s: CombatState, seconds: number): CombatEvent[] => {
  const evs: CombatEvent[] = [];
  for (let i = 0; i < ticksOf(s.params, seconds) && s.status === 'playing'; i++) {
    step(s);
    evs.push(...drainCombatEvents(s));
  }
  return evs;
};
/** 다음 평타 한 번(사건 player-attack 들)을 기다린다: 평타가 나올 때까지 틱을 돌리고 그 틱의 사건을 돌려준다 */
const nextBasic = (s: CombatState): Extract<CombatEvent, { kind: 'player-attack' }>[] => {
  for (let i = 0; i < 100 && s.status === 'playing'; i++) {
    step(s);
    const evs = drainCombatEvents(s).filter((e): e is Extract<CombatEvent, { kind: 'player-attack' }> => e.kind === 'player-attack');
    if (evs.length > 0) return evs;
  }
  return [];
};
const use = (s: CombatState, cell = 0) => {
  const ok = applyInput(s, { type: 'use', cell });
  const evs = drainCombatEvents(s);
  return { ok, evs };
};

describe('C.103 데이터·매핑 (GDD 49-1 1~3번)', () => {
  it('물공 속성 6종(흙·혈·불·물·뇌·노멀), 데이터 검사 통과, 이름은 종족별', () => {
    expect(validatePhysBlocks()).toEqual([]);
    expect([...PHYS_ELEMENT_IDS].sort()).toEqual(['blood', 'earth', 'fire', 'normal', 'thunder', 'water']);
    expect(physBlockName('earth', 'hollow')).toBe('바위 자세');
    expect(physBlockName('earth', 'shinigami')).toBe('암반 베기');
    expect(physBlockName('blood', 'hollow')).toBe('피 튀기기');
    expect(physBlockName('blood', 'shinigami')).toBe('혈참');
    expect(physAbilityName('earth', 'hollow')).toBe('굳은 주먹');
    expect(physProcText('knockback', 'hollow')).toBe('넉백!');
    expect(physProcText('shout', 'shinigami')).toBe('기합!');
    expect(physBlockName('poison', 'hollow')).toBeNull();
  });
  it('5단계 물리 단일 속성 6종만 물공 칸이 있다 (특수·혼합·독·허·히든·4단계는 없음)', () => {
    const withPhys = FORM_TABLE.filter((f) => formAbilitiesOf(f, zeroStats(), 'atk').phys).map((f) => f.id).sort();
    expect(withPhys).toEqual(['t5:blood:physical', 't5:earth:physical', 't5:fire:physical', 't5:normal:physical', 't5:thunder:physical', 't5:water:physical']);
    expect(physOf('t5:fire:special')).toBeNull();
    expect(physOf('t5:poison:physical')).toBeNull();
    expect(physOf('t4:fire')).toBeNull();
  });
  it('블록 파라미터: 속성·효과·피해 배율(표)', () => {
    expect(physOf('t5:earth:physical')).toEqual({ element: 'earth', effect: 'stoneStance', power: PB.power.earth!, ...PB.stoneStance });
    expect(physOf('t5:blood:physical')).toEqual({ element: 'blood', effect: 'knockback', power: PB.power.blood!, ...PB.knockback });
    expect(physOf('t5:fire:physical')).toEqual({ element: 'fire', effect: 'ember', power: PB.power.fire! });
    expect(physOf('t5:water:physical')).toEqual({ element: 'water', effect: 'wave', power: PB.power.water!, ...PB.wave });
    expect(physOf('t5:thunder:physical')).toEqual({ element: 'thunder', effect: 'flash', power: PB.power.thunder!, ...PB.flash });
    expect(physOf('t5:normal:physical')).toEqual({ element: 'normal', effect: 'shout', power: PB.power.normal! });
    // 표(GDD 49장 3판)의 블록 피해 배율: 흙·혈·불·물 0.7, 뇌 0.6, 노멀 0.8
    expect([PB.power.earth, PB.power.blood, PB.power.fire, PB.power.water, PB.power.thunder, PB.power.normal]).toEqual([0.7, 0.7, 0.7, 0.7, 0.6, 0.8]);
  });
  it('특성 효과: 속성 특성(39장)은 그대로 두고 물공 특성이 1칸 더', () => {
    const earth = fxOf('t5:earth:physical');
    expect(earth.thorns).toBeDefined();
    expect(earth.hardFist).toEqual(PB.hardFist);
    expect(fxOf('t5:blood:physical').bloodScent).toBe(PB.bloodScent.drainMultiplier);
    expect(fxOf('t5:fire:physical').emberStack).toEqual({ element: 'fire', ...PB.emberStack });
    expect(fxOf('t5:water:physical').current).toEqual(PB.current);
    expect(fxOf('t5:thunder:physical').charge).toBe(PB.charge.every);
    expect(fxOf('t5:normal:physical').tempering).toEqual(PB.tempering);
    expect(fxOf('t5:earth:mixed').hardFist).toBeUndefined();
  });
  it('상태 화면 특성 줄: 성향 + 속성 + 물공(블록 이름 포함) 3줄', () => {
    const lines = abilityLines(formAbilitiesOf(getForm('t5:earth:physical'), zeroStats(), 'atk'), 'hollow');
    expect(lines.map((l) => l.slot)).toEqual(['성향', '속성', '물공']);
    expect(lines[2]!.name).toBe('굳은 주먹');
    expect(lines[2]!.description).toContain('바위 자세');
    expect(lines[2]!.description).toContain(`×${PB.power.earth}`);
    const sh = abilityLines(formAbilitiesOf(getForm('t5:earth:physical'), zeroStats(), 'atk'), 'shinigami');
    expect(sh[2]!.description).toContain('암반 베기');
  });
  it('applyEvolutionToParams: 물공 몸은 params.physBlock + 특성, 아니면 null', () => {
    const p: Partial<CombatParams> = {};
    applyEvolutionToParams(p, { ...newEvolution(), tierIndex: 4, formId: 't5:thunder:physical', ability: 'atk' }, 'hollow');
    expect(p.physBlock).toMatchObject({ element: 'thunder', effect: 'flash' });
    expect(p.abilityEffects?.charge).toBe(PB.charge.every);
    const q: Partial<CombatParams> = {};
    applyEvolutionToParams(q, { ...newEvolution(), tierIndex: 4, formId: 't5:thunder:mixed', ability: 'atk' }, 'hollow');
    expect(q.physBlock).toBeNull();
  });
});

describe('C.103 기본 공격 블록 3계열 → 물공 블록 (49-1 2번)', () => {
  it('공격 생성원만 바뀐다: 속성·물리 분류·피해 배율. 막기·회복·계열 가중은 그대로', () => {
    const s = mk({ physBlock: physOf('t5:earth:physical')!, families: { 'family-a': { tiers: [{ multiplier: 1 }] }, 'family-b': { tiers: [{ multiplier: 1 }] }, 'family-c': { tiers: [{ multiplier: 1 }] } } });
    const [atk, guard, heal] = basicSources(s.params);
    expect(atk).toMatchObject({ id: BASIC_SKILL_ID, element: 'earth', category: 'physical', powerMultiplier: 0.7, role: 'attack' });
    expect(guard).toMatchObject({ id: BASIC_GUARD_ID, element: null, role: 'guard' });
    expect(heal).toMatchObject({ id: BASIC_HEAL_ID, element: null, role: 'heal' });
    const pool = blockPoolOf(s.params);
    expect(pool.filter((e) => e.source.id === BASIC_SKILL_ID).map((e) => e.family).sort()).toEqual(['family-a', 'family-b', 'family-c']);
  });
  it('물공 블록 피해 = 보통 기본 블록 × 배율 × 자속성 보정 (물리 분류 비, 노멀 속성 상성 없음)', () => {
    const plain = mk({ playerElements: ['normal'] });
    const phys = mk({ playerElements: ['normal'], physBlock: physOf('t5:normal:physical')! });
    const b = blk(BASIC_SKILL_ID);
    // 노멀 vs 불 적: 상성 없음. 보통 기본 블록은 혼합 분류, 물공 블록은 물리 분류 — 능력치가 모두 같아 비는 1
    expect(blockDamage(phys, b)).toBeCloseTo(blockDamage(plain, b) * PB.power.normal! * phys.params.stabMultiplier);
  });
  it('화면 이름: 물공 몸의 기본 공격 블록은 표 이름(종족별), 막기·회복은 그대로', () => {
    const hollow = getFaction('hollow');
    const s = mk({ playerElements: ['earth'], physBlock: physOf('t5:earth:physical')! });
    expect(blockName(blk(BASIC_SKILL_ID), battleLabels(hollow), 'hollow', s.params)).toBe('바위 자세');
    expect(blockName(blk(BASIC_SKILL_ID), battleLabels(getFaction('shinigami')), 'shinigami', s.params)).toBe('암반 베기');
    expect(blockName(blk(BASIC_GUARD_ID, null), battleLabels(hollow), 'hollow', s.params)).toBe('흙_막기');
    const plain = mk({ playerElements: ['earth'] });
    expect(blockName(blk(BASIC_SKILL_ID), battleLabels(hollow), 'hollow', plain.params)).toBe('흙_조');
  });
});

describe('C.103 흙 — 바위 자세 · 굳은 주먹', () => {
  const earth = () => mk({ playerElements: ['earth'], physBlock: physOf('t5:earth:physical')!, abilityEffects: fxOf('t5:earth:physical') });
  const ST = PB.stoneStance;
  it('쓰면 n초 동안 받는 피해 감소, 맞을 때마다 다음 평타 보너스 쌓임(상한), 평타 한 번에 다 쓴다', () => {
    const a = earth();
    const b = earth();
    a.tray.push(blk(BASIC_SKILL_ID));
    const { ok, evs } = use(a);
    expect(ok).toBe(true);
    expect(evs.some((e) => e.kind === 'ability' && e.effect === 'stoneStance')).toBe(true);
    expect(a.stoneStance).toEqual({ ticks: ticksOf(a.params, ST.seconds), stacked: 0 });
    // 같은 시드·같은 적: 첫 적 공격 피해를 비교 (b 는 자세 없음)
    const hitA = run(a, 3).find((e) => e.kind === 'enemy-attack') as Extract<CombatEvent, { kind: 'enemy-attack' }>;
    const hitB = run(b, 3).find((e) => e.kind === 'enemy-attack') as Extract<CombatEvent, { kind: 'enemy-attack' }>;
    expect(hitA.damage).toBeCloseTo(hitB.damage); // 사건의 피해 값은 같고(적이 때린 양)
    expect(a.player.maxHp - a.player.hp).toBeLessThan(b.player.maxHp - b.player.hp); // 실제 깎인 체력은 적다
    expect(a.stoneStance!.stacked).toBeCloseTo(ST.perHit);
    expect(basicPowerOf(a)).toBeCloseTo(1 + ST.perHit);
    // 다음 평타가 나가면 쌓인 것을 다 쓴다
    nextBasic(a);
    expect(a.stoneStance!.stacked).toBe(0);
  });
  it('실제 깎인 체력 = (1 − 감소) · 시간이 지나면 풀린다 · 쌓임 상한', () => {
    const a = earth();
    a.tray.push(blk(BASIC_SKILL_ID));
    use(a);
    const before = a.player.hp;
    const taken = run(a, 3).filter((e): e is Extract<CombatEvent, { kind: 'enemy-attack' }> => e.kind === 'enemy-attack').reduce((sum, e) => sum + e.damage, 0);
    expect(taken).toBeGreaterThan(0);
    expect(before - a.player.hp).toBeCloseTo(taken * (1 - ST.takenReduction), 5);
    run(a, ST.seconds);
    expect(a.stoneStance!.ticks).toBe(0);
    a.stoneStance = { ticks: 50, stacked: ST.max - ST.perHit / 2 };
    a.player.attackTimer = 1000; // 평타가 쌓임을 쓰지 않게
    run(a, 1.6); // 적 공격 1.5초
    expect(a.stoneStance!.stacked).toBeCloseTo(ST.max);
  });
  it('굳은 주먹: 되갚기가 터지면 다음 평타 n회 피해 +', () => {
    const a = earth();
    // 되갚기 문턱을 바로 넘기게 쌓아 둔다
    a.thornsStored = a.player.maxHp * a.params.abilityEffects.thorns!.threshold;
    const evs = run(a, 2);
    expect(evs.some((e) => e.kind === 'ability' && e.effect === 'thorns')).toBe(true);
    expect(evs.some((e) => e.kind === 'ability' && e.effect === 'hardFist')).toBe(true);
    expect(a.basicBuffs!.some((x) => x.bonus === PB.hardFist.bonus)).toBe(true);
    const hits = a.basicBuffs!.find((x) => x.bonus === PB.hardFist.bonus)!.hits;
    expect(hits).toBeGreaterThanOrEqual(1);
    expect(hits).toBeLessThanOrEqual(PB.hardFist.hits);
  });
});

describe('C.103 혈 — 피 튀기기(넉백) · 피 냄새', () => {
  const blood = () => mk({ playerElements: ['blood'], physBlock: physOf('t5:blood:physical')!, abilityEffects: fxOf('t5:blood:physical') });
  const KB = PB.knockback;
  it('넉백 동안 적 공격 타이머가 멈춘다 · 다음 평타 n회 피해 +', () => {
    const a = blood();
    a.tray.push(blk(BASIC_SKILL_ID));
    const { evs } = use(a);
    expect(evs.some((e) => e.kind === 'ability' && e.effect === 'knockback')).toBe(true);
    expect(a.knockbackTicks).toBe(ticksOf(a.params, KB.seconds));
    expect(a.basicBuffs).toEqual([{ hits: KB.hits, bonus: KB.bonus }]);
    expect(basicPowerOf(a)).toBeCloseTo(1 + KB.bonus);
    const timer = a.enemy.attackTimer;
    run(a, KB.seconds);
    expect(a.enemy.attackTimer).toBe(timer); // 넉백 틱 동안 그대로
    expect(a.knockbackTicks).toBe(0);
    step(a);
    expect(a.enemy.attackTimer).toBe(timer - 1); // 풀리면 다시 줄어든다
  });
  it('버프는 평타 n회 뒤 사라진다 (피의 갈증 없이 비교)', () => {
    const a = mk({ playerElements: ['blood'], physBlock: physOf('t5:blood:physical')!, abilityEffects: { bloodScent: 2 } });
    const b = mk({ playerElements: ['blood'] });
    a.enemy.hp = a.enemy.maxHp = 1e12; // C.118: 적 체력이 절반이라 40회 평타 전에 죽는다 — 버프 지속만 본다
    const plainHit = nextBasic(b)[0]!.damage;
    a.tray.push(blk(BASIC_SKILL_ID));
    use(a);
    for (let k = 0; k < KB.hits; k++) {
      const h = nextBasic(a);
      expect(h[0]!.damage).toBeCloseTo(plainHit * (1 + KB.bonus), 3);
    }
    expect(a.basicBuffs).toEqual([]);
    expect(nextBasic(a)[0]!.damage).toBeCloseTo(plainHit, 3);
  });
  it('피 냄새: 넉백 중인 적에게 평타 흡혈 ×배율 (넉백이 아니면 ×1)', () => {
    const a = blood();
    a.player.hp = a.player.maxHp * 0.3;
    const hitA = nextBasic(a)[0]!;
    // 같은 몸, 넉백 중: 흡혈이 두 배
    const c = blood();
    c.player.hp = c.player.maxHp * 0.3;
    c.knockbackTicks = 100;
    const hitC = nextBasic(c)[0]!;
    expect(hitC.damage).toBeCloseTo(hitA.damage, 3);
    expect(c.player.drained!).toBeCloseTo(a.player.drained! * PB.bloodScent.drainMultiplier, 3);
    expect(a.player.drained!).toBeCloseTo(hitA.damage * a.params.drainFraction, 3);
  });
});

describe('C.103 불 — 잔불(약한 불 블록) · 불씨 모으기', () => {
  const EM = PB.emberStack;
  it('바에 쌓인 불 공격 블록 1개당 평타 +per (최대 max), 막기·회복은 세지 않는다', () => {
    const a = mk({ playerElements: ['fire'], physBlock: physOf('t5:fire:physical')!, abilityEffects: fxOf('t5:fire:physical') });
    expect(basicPowerOf(a)).toBe(1);
    a.tray.push(blk(BASIC_SKILL_ID), blk(BASIC_SKILL_ID, 'family-b'), blk(BASIC_SKILL_ID, 'family-c'), blk(BASIC_GUARD_ID, null), blk(BASIC_HEAL_ID, null));
    expect(basicPowerOf(a)).toBeCloseTo(1 + Math.min(EM.max, 3 * EM.per));
    a.tray.length = 0;
    for (let k = 0; k < 8; k++) a.tray.push(blk(BASIC_SKILL_ID));
    expect(basicPowerOf(a)).toBeCloseTo(1 + Math.min(EM.max, 8 * EM.per));
    expect(8 * EM.per).toBeLessThanOrEqual(EM.max + 1e-9); // 바 8칸이 상한
    // 잔불 블록 자체는 ×0.7 피해의 불 공격 블록(효과 없음) — 쓰면 발동 글자 없이 사라진다
    const { ok, evs } = use(a);
    expect(ok).toBe(true);
    expect(evs.some((e) => e.kind === 'ability')).toBe(false);
    expect(a.tray).toHaveLength(5); // 같은 계열 8개 → 체인3 으로 3개 소모
    expect(basicPowerOf(a)).toBeCloseTo(1 + Math.min(EM.max, 5 * EM.per));
  });
});

describe('C.103 물 — 물결 가르기(평타 가속) · 물살', () => {
  const water = () => mk({ playerElements: ['water'], physBlock: physOf('t5:water:physical')!, abilityEffects: fxOf('t5:water:physical') });
  const WV = PB.wave;
  it('쓰면 n초 동안 평타 간격 −haste: 그동안 평타가 더 많이 나간다', () => {
    const a = water();
    const b = mk({ playerElements: ['water'] });
    a.tray.push(blk(BASIC_SKILL_ID));
    const { evs } = use(a);
    expect(evs.some((e) => e.kind === 'ability' && e.effect === 'wave')).toBe(true);
    expect(a.basicHaste).toEqual({ ticks: ticksOf(a.params, WV.seconds), haste: WV.haste });
    const count = (list: CombatEvent[]) => list.filter((e) => e.kind === 'player-attack').length;
    const na = count(run(a, WV.seconds));
    const nb = count(run(b, WV.seconds));
    expect(nb).toBe(WV.seconds); // 1.0초 간격
    expect(na).toBe(Math.round(WV.seconds / (1 - WV.haste))); // 간격 × (1 − haste)
    expect(a.basicHaste!.ticks).toBe(0);
  });
  it('물살: 평타가 연속으로 맞을 때마다 +per (최대 max), 내가 맞으면 0', () => {
    const CU = PB.current;
    const a = water();
    nextBasic(a);
    expect(a.currentHits).toBe(1);
    expect(basicPowerOf(a)).toBeCloseTo(1 + CU.per);
    a.currentHits = 1000;
    expect(basicPowerOf(a)).toBeCloseTo(1 + CU.max);
    run(a, 2); // 적 공격(1.5초)이 들어온다
    expect(a.currentHits).toBeLessThan(20);
  });
});

describe('C.103 뇌 — 전광(두 번 때림) · 충전', () => {
  const thunder = () => mk({ playerElements: ['thunder'], physBlock: physOf('t5:thunder:physical')!, abilityEffects: { ...fxOf('t5:thunder:physical'), doubleHit: 0 } });
  const FL = PB.flash;
  it('쓰면 다음 평타 n회는 두 번 때림(각 each), 그 뒤 보통 평타', () => {
    const a = thunder();
    const b = mk({ playerElements: ['thunder'] });
    const plainHit = nextBasic(b)[0]!.damage;
    a.tray.push(blk(BASIC_SKILL_ID));
    const { evs } = use(a);
    expect(evs.some((e) => e.kind === 'ability' && e.effect === 'flash')).toBe(true);
    expect(a.flashHits).toBe(FL.hits);
    for (let k = 0; k < FL.hits; k++) {
      const hits = nextBasic(a);
      expect(hits).toHaveLength(2);
      for (const h of hits) expect(h.damage).toBeCloseTo(plainHit * FL.each, 3);
    }
    expect(a.flashHits).toBe(0);
    const after = nextBasic(a);
    expect(after).toHaveLength(1);
    expect(after[0]!.damage).toBeCloseTo(plainHit, 3);
  });
  it('충전: 평타 n회마다 블록 1개가 바로 생긴다 (기본 풀에서)', () => {
    const a = thunder();
    const every = PB.charge.every;
    const evs = run(a, every + 0.5);
    const charges = evs.filter((e) => e.kind === 'ability' && e.effect === 'charge');
    expect(charges).toHaveLength(1);
    expect(a.basicCount).toBe(every);
    const idx = evs.findIndex((e) => e.kind === 'ability' && e.effect === 'charge');
    expect(evs[idx + 1]?.kind === 'spawn' || evs[idx - 1]?.kind === 'spawn').toBe(true);
    const rec = buildBattleRecord(a, { factionId: 'hollow' });
    expect(rec.abilityProcs?.charge).toBe(1);
  });
});

describe('C.103 노멀 — 기합(즉시 평타) · 단련', () => {
  const plainBody = () => mk({ playerElements: ['normal'], physBlock: physOf('t5:normal:physical')!, abilityEffects: fxOf('t5:normal:physical') });
  it('기합: 쓰는 순간 평타 1회가 바로 나가고 평타 타이머는 처음부터', () => {
    const a = plainBody();
    run(a, 0.4);
    a.tray.push(blk(BASIC_SKILL_ID));
    const timerBefore = a.player.attackTimer;
    expect(timerBefore).toBeLessThan(ticksOf(a.params, 1));
    const { evs } = use(a);
    const kinds = evs.map((e) => e.kind);
    expect(kinds.indexOf('block')).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf('player-attack')).toBeGreaterThan(kinds.indexOf('block'));
    expect(evs.some((e) => e.kind === 'ability' && e.effect === 'shout')).toBe(true);
    expect(a.player.attackTimer).toBe(ticksOf(a.params, 1));
    expect(a.basicCount).toBe(1);
  });
  it('단련: 스킬 블록 1개마다 평타 +per (최대 max), 체인은 블록 수만큼', () => {
    const TM = PB.tempering;
    const a = plainBody();
    a.tray.push(blk(BASIC_SKILL_ID), blk(BASIC_SKILL_ID), blk(BASIC_SKILL_ID));
    use(a); // 체인3
    expect(a.temperingBlocks).toBe(3);
    expect(basicPowerOf(a)).toBeCloseTo(1 + Math.min(TM.max, 3 * TM.per));
    a.temperingBlocks = 1000;
    expect(basicPowerOf(a)).toBeCloseTo(1 + TM.max);
  });
});

describe('C.103 전투 로그·런 로그', () => {
  it('발동 글자: 데이터 proc (넉백! / 바위 자세! / 암반 자세!) · 옛 특성은 이름!', () => {
    expect(abilityProcText('knockback', 'hollow')).toBe('넉백!');
    expect(abilityProcText('stoneStance', 'hollow')).toBe('바위 자세!');
    expect(abilityProcText('stoneStance', 'shinigami')).toBe('암반 자세!');
    expect(abilityProcText('doubleHit', 'hollow')).toBe('연타!');
  });
  it('런 로그 abilityProcs 에 물공 발동 횟수가 남는다', () => {
    const a = mk({ playerElements: ['blood'], physBlock: physOf('t5:blood:physical')!, abilityEffects: fxOf('t5:blood:physical') });
    a.tray.push(blk(BASIC_SKILL_ID));
    use(a);
    run(a, 1);
    a.tray.push(blk(BASIC_SKILL_ID));
    use(a);
    expect(buildBattleRecord(a, { factionId: 'hollow' }).abilityProcs?.knockback).toBe(2);
  });
  it('물공 블록이 없는 몸은 옛 규칙 그대로 (기본 블록 혼합·무속성, 효과 없음)', () => {
    const a = mk({ playerElements: ['earth'] });
    expect(basicSources(a.params)[0]).toMatchObject({ element: null, category: 'mixed', powerMultiplier: 1 });
    a.tray.push(blk(BASIC_SKILL_ID));
    const { evs } = use(a);
    expect(evs.some((e) => e.kind === 'ability')).toBe(false);
    expect(a.stoneStance).toBeUndefined();
    expect(basicPowerOf(a)).toBe(1);
  });
});
