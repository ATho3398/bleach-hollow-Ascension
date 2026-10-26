// 진화체 특성 (GDD 39장, C.89): 칸 2개 — ① 성향(노력치 최고 능력치, 20-5·v4.0) ② 속성(진화체 label 속성, 4단계부터)·전용(특별 진화체 5종).
// 진화체 id·종족 분기 없이 label(kind·elements) → abilities.json kindSlots 규칙으로 정한다. 효과는 전투 엔진 AbilityEffects 종류로, 수치는 BALANCE.provisional.abilities.
import { BALANCE } from '../../config/balance';
import { abilityDescription, abilityName, elementAbility, kindSlot, physElementOf, uniqueAbility, type PhysElementDef } from '../../data/evolution';
import { pickFaction, STAT_IDS, type FormDef, type FormKind, type StatId, type Stats } from '../../data/schema';
import type { AbilityEffects, PhysBlock } from '../combat/combat';

const AB = BALANCE.provisional.abilities;
const PB = BALANCE.provisional.physBlocks;

export interface FormAbilities {
  /** 성향 특성 (보통 1개, 실패형 2개 = 노력치 1·2위) */
  dispositions: StatId[];
  /** 속성 특성: 속성과 세기 (4단계 1, 5단계 ×1.5, 융합 각 ×0.6, 특수·순수 ×1.5) */
  elements: { element: string; scale: number }[];
  /** 전용 특성 (완전형·한계·억제·사냥꾼·환생) — 있으면 속성 특성 대신 */
  unique: FormKind | null;
  /** 물공 특수 블록·특성 1칸 (GDD 49장, C.103): kindSlots.physical 인 진화체 중 공격 분류 물리·속성 하나이고 physBlocks.json 에 그 속성이 있을 때 */
  phys: { element: string; def: PhysElementDef } | null;
}

/** 노력치 순위 (동률이면 진화체 종족값 → STAT_IDS 순). abilityFor 와 같은 규칙 */
export function rankedStats(ev: Stats, form: FormDef): StatId[] {
  return [...STAT_IDS].sort((a, b) => ev[b] - ev[a] || form.stats[b] - form.stats[a] || STAT_IDS.indexOf(a) - STAT_IDS.indexOf(b));
}

/** 이 진화체의 특성 칸. ability = 진화 때 정한 성향(저장값), 실패형 2위는 지금 노력치에서 (새 저장 없음) */
export function formAbilitiesOf(form: FormDef | null, ev: Stats, ability: StatId | null): FormAbilities {
  const out: FormAbilities = { dispositions: ability ? [ability] : [], elements: [], unique: null, phys: null };
  if (!form) return out;
  const slot = kindSlot(form.label.kind);
  if (slot.physical && form.label.category === 'physical' && form.label.elements.length === 1) {
    const element = form.label.elements[0]!;
    const def = physElementOf(element);
    if (def) out.phys = { element, def };
  }
  const want = slot.dispositions ?? 1;
  if (ability && want > 1) out.dispositions.push(...rankedStats(ev, form).filter((s) => s !== ability).slice(0, want - 1));
  if (slot.element === 'unique') out.unique = form.label.kind;
  else if (slot.element === 'label') {
    const scale = (AB.scale.tier[form.tier] ?? 1) * (slot.scale ? AB.scale[slot.scale] : 1);
    out.elements = form.label.elements.map((element) => ({ element, scale }));
  }
  return out;
}

/** 특성 칸 → 전투 효과 (+ 치명타 확률 가산). 같은 효과가 겹치면 더한다 */
export function abilityEffectsOf(fa: FormAbilities): { effects: AbilityEffects; critChance: number } {
  const fx: AbilityEffects = {};
  let critChance = 0;
  for (const { element, scale } of fa.elements) {
    const v = AB.element[element] ?? {};
    switch (elementAbility(element).effect) {
      case 'blockPower': fx.blockPower = (fx.blockPower ?? 0) + v.blockPower! * scale; break;
      case 'crit': critChance += v.critChance! * scale; break;
      case 'ignoreDefense': fx.ignoreDefense = (fx.ignoreDefense ?? 0) + v.ignoreDefense! * scale; break;
      case 'thorns': fx.thorns = { threshold: v.thornsThreshold!, ret: (fx.thorns?.ret ?? 0) + v.thornsReturn! * scale }; break;
      case 'doubleHit': fx.doubleHit = (fx.doubleHit ?? 0) + v.doubleHitChance! * scale; break;
      case 'bloodlust': fx.bloodlust = { max: (fx.bloodlust?.max ?? 0) + v.bloodlustMax! * scale, fullAt: v.bloodlustFullAt! }; break;
      case 'corrode': fx.corrode = { per: v.corrodePer! * scale, everySeconds: v.corrodeEverySeconds!, max: v.corrodeMax! * scale }; break;
      case 'chainHaste': fx.chainHaste = (fx.chainHaste ?? 0) + v.chainHastePerChain! * scale; break;
    }
  }
  if (fa.phys) {
    switch (fa.phys.def.ability.effect) {
      case 'hardFist': fx.hardFist = { ...PB.hardFist }; break;
      case 'bloodScent': fx.bloodScent = PB.bloodScent.drainMultiplier; break;
      case 'emberStack': fx.emberStack = { element: fa.phys.element, ...PB.emberStack }; break;
      case 'current': fx.current = { ...PB.current }; break;
      case 'charge': fx.charge = PB.charge.every; break;
      case 'tempering': fx.tempering = { ...PB.tempering }; break;
    }
  }
  if (fa.unique) {
    const v = AB.unique[fa.unique] ?? {};
    switch (uniqueAbility(fa.unique).effect) {
      case 'noWeak': fx.noWeak = true; break;
      case 'desperate': fx.desperate = { below: v.desperateBelow!, bonus: v.desperateBonus! }; break;
      case 'rampUp': fx.rampUp = { per: v.rampPer!, everySeconds: v.rampEverySeconds!, max: v.rampMax! }; break;
      case 'eliteSlayer': fx.eliteSlayer = v.eliteBonus!; break;
      case 'lastStand': fx.lastStand = v.lastStandHp!; break;
    }
  }
  return { effects: fx, critChance };
}

/** 물공 특수 블록 전투 파라미터 (GDD 49-1 2번): 그 몸의 기본 공격 블록 3계열이 전부 이 블록이 된다. 물공 칸이 없으면 null */
export function physBlockOf(fa: Pick<FormAbilities, 'phys'>): PhysBlock | null {
  if (!fa.phys) return null;
  const element = fa.phys.element;
  const power = PB.power[element] ?? 1;
  const damage = PB.damageByElement[element] ?? PB.damage;
  const pb = physBlockEffectOf(fa.phys.def.block.effect, element, power);
  return damage === 1 ? pb : { ...pb, damage };
}

function physBlockEffectOf(effect: NonNullable<FormAbilities['phys']>['def']['block']['effect'], element: string, power: number): PhysBlock {
  switch (effect) {
    case 'stoneStance': return { element, power, effect: 'stoneStance', ...PB.stoneStance };
    case 'knockback': return { element, power, effect: 'knockback', ...PB.knockback };
    case 'ember': return { element, power, effect: 'ember' };
    case 'wave': return { element, power, effect: 'wave', ...PB.wave };
    case 'flash': return { element, power, effect: 'flash', ...PB.flash };
    case 'shout': return { element, power, effect: 'shout' };
  }
}

/** 물공 생성원 타이머 간격(초) (GDD 49-11, C.105b): 속성별 값이 있으면 그 값, 없으면 공통 spawnSeconds */
export function physSpawnSecondsFor(element: string | null): number {
  return (element && PB.spawnSecondsByElement[element]) || PB.spawnSeconds;
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

/** 물공 블록 효과 한 줄 (화면용, 종족 무관) */
export function physBlockSummary(pb: PhysBlock): string {
  const head = `블록 피해 ×${pb.power}`;
  switch (pb.effect) {
    case 'stoneStance': return `${head}, 쓴 뒤 ${pb.seconds}초 동안 받는 피해 −${pct(pb.takenReduction)} · 그동안 맞을 때마다 다음 기본 공격 +${pct(pb.perHit)}(최대 +${pct(pb.max)})`;
    case 'knockback': return `${head}, 쓴 뒤 다음 기본 공격 ${pb.hits}회 +${pct(pb.bonus)} · 적을 ${pb.seconds}초 동안 멈춤(넉백)`;
    case 'ember': return `${head} (바에 쌓아 두는 용)`;
    case 'wave': return `${head}, 쓴 뒤 ${pb.seconds}초 동안 기본 공격 간격 −${pct(pb.haste)}`;
    case 'flash': return `${head}, 쓴 뒤 다음 기본 공격 ${pb.hits}회는 두 번 때림(각 ${pct(pb.each)})`;
    case 'shout': return `${head}, 쓰는 순간 기본 공격 1회가 바로 나간다`;
  }
}

/** 효과 수치 한 줄 (화면용, 효과 종류별 — 종족 무관) */
function effectSummary(fx: AbilityEffects, critChance: number): string {
  const parts: string[] = [];
  if (critChance > 0) parts.push(`치명타 확률 +${pct(critChance)}p(상한도 +${pct(critChance)}p)`);
  if (fx.blockPower) parts.push(`블록 위력 +${pct(fx.blockPower)}`);
  if (fx.ignoreDefense) parts.push(`적 방어·정신력 ${pct(fx.ignoreDefense)} 무시`);
  if (fx.thorns) parts.push(`받은 피해가 최대 체력 ${pct(fx.thorns.threshold)} 쌓이면 ${pct(fx.thorns.ret)} 되돌림`);
  if (fx.doubleHit) parts.push(`기본 공격 ${pct(fx.doubleHit)} 확률 한 번 더`);
  if (fx.bloodlust) parts.push(`체력 ${pct(fx.bloodlust.fullAt)} 이하에서 공격 최대 +${pct(fx.bloodlust.max)}`);
  if (fx.corrode) parts.push(`${fx.corrode.everySeconds}초마다 적이 받는 피해 +${pct(fx.corrode.per)} (최대 +${pct(fx.corrode.max)})`);
  if (fx.chainHaste) parts.push(`체인 단계당 다음 블록 ${pct(fx.chainHaste)} 빨리`);
  if (fx.noWeak) parts.push('상성 불리 없음');
  if (fx.desperate) parts.push(`체력 ${pct(fx.desperate.below)} 아래에서 피해 +${pct(fx.desperate.bonus)}`);
  if (fx.rampUp) parts.push(`${fx.rampUp.everySeconds}초마다 공격 +${pct(fx.rampUp.per)} (최대 +${pct(fx.rampUp.max)})`);
  if (fx.eliteSlayer) parts.push(`강적·보스에게 피해 +${pct(fx.eliteSlayer)}`);
  if (fx.lastStand) parts.push(`전투마다 1번 체력 ${pct(fx.lastStand)}로 버팀`);
  if (fx.hardFist) parts.push(`되갚기가 터지면 다음 기본 공격 ${fx.hardFist.hits}회 +${pct(fx.hardFist.bonus)}`);
  if (fx.bloodScent) parts.push(`넉백 중인 적에게 기본 공격 흡혈 ×${fx.bloodScent}`);
  if (fx.emberStack) parts.push(`바에 쌓인 공격 블록 1개당 기본 공격 +${pct(fx.emberStack.per)} (최대 +${pct(fx.emberStack.max)})`);
  if (fx.current) parts.push(`기본 공격이 연속으로 맞을 때마다 +${pct(fx.current.per)} (최대 +${pct(fx.current.max)}, 맞으면 0)`);
  if (fx.charge) parts.push(`기본 공격 ${fx.charge}회마다 블록 1개`);
  if (fx.tempering) parts.push(`블록 1개 쓸 때마다 기본 공격 +${pct(fx.tempering.per)} (최대 +${pct(fx.tempering.max)})`);
  return parts.join(' · ');
}

export interface AbilityLine {
  /** 칸 이름: 성향 / 속성 / 전용 / 물공(GDD 49장 특수 블록 + 특성 1칸) */
  slot: '성향' | '속성' | '전용' | '물공';
  name: string;
  description: string;
}

/** 표시용 특성 줄 (상태 화면·진화 결과·도감): 성향 줄들 + 속성/전용 줄 1개(융합은 이름 둘을 '·'로) */
export function abilityLines(fa: FormAbilities, factionId: string): AbilityLine[] {
  const lines: AbilityLine[] = fa.dispositions.map((d) => ({ slot: '성향', name: abilityName(d, factionId), description: abilityDescription(d, factionId) }));
  const { effects, critChance } = abilityEffectsOf({ ...fa, dispositions: [], phys: null });
  const summary = effectSummary(effects, critChance);
  if (fa.unique) lines.push({ slot: '전용', name: pickFaction(uniqueAbility(fa.unique).name, factionId), description: summary });
  else if (fa.elements.length > 0) lines.push({ slot: '속성', name: fa.elements.map((x) => pickFaction(elementAbility(x.element).name, factionId)).join('·'), description: summary });
  // 물공 칸 (GDD 49장): 특성 이름 — 특성 효과 · 블록 「이름」: 블록 효과
  if (fa.phys) {
    const physFx = abilityEffectsOf({ dispositions: [], elements: [], unique: null, phys: fa.phys }).effects;
    const pb = physBlockOf(fa);
    const blockText = pb ? ` · 블록 「${pickFaction(fa.phys.def.block.name, factionId)}」 ${physBlockSummary(pb)}` : '';
    lines.push({ slot: '물공', name: pickFaction(fa.phys.def.ability.name, factionId), description: `${effectSummary(physFx, 0)}${blockText}` });
  }
  return lines;
}
