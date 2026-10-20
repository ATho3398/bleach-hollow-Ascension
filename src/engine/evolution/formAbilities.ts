// 진화체 특성 (GDD 39장, C.89): 칸 2개 — ① 성향(노력치 최고 능력치, 20-5·v4.0) ② 속성(진화체 label 속성, 4단계부터)·전용(특별 진화체 5종).
// 진화체 id·종족 분기 없이 label(kind·elements) → abilities.json kindSlots 규칙으로 정한다. 효과는 전투 엔진 AbilityEffects 종류로, 수치는 BALANCE.provisional.abilities.
import { BALANCE } from '../../config/balance';
import { abilityDescription, abilityName, elementAbility, kindSlot, uniqueAbility } from '../../data/evolution';
import { pickFaction, STAT_IDS, type FormDef, type FormKind, type StatId, type Stats } from '../../data/schema';
import type { AbilityEffects } from '../combat/combat';

const AB = BALANCE.provisional.abilities;

export interface FormAbilities {
  /** 성향 특성 (보통 1개, 실패형 2개 = 노력치 1·2위) */
  dispositions: StatId[];
  /** 속성 특성: 속성과 세기 (4단계 1, 5단계 ×1.5, 융합 각 ×0.6, 특수·순수 ×1.5) */
  elements: { element: string; scale: number }[];
  /** 전용 특성 (완전형·한계·억제·사냥꾼·환생) — 있으면 속성 특성 대신 */
  unique: FormKind | null;
}

/** 노력치 순위 (동률이면 진화체 종족값 → STAT_IDS 순). abilityFor 와 같은 규칙 */
function rankedStats(ev: Stats, form: FormDef): StatId[] {
  return [...STAT_IDS].sort((a, b) => ev[b] - ev[a] || form.stats[b] - form.stats[a] || STAT_IDS.indexOf(a) - STAT_IDS.indexOf(b));
}

/** 이 진화체의 특성 칸. ability = 진화 때 정한 성향(저장값), 실패형 2위는 지금 노력치에서 (새 저장 없음) */
export function formAbilitiesOf(form: FormDef | null, ev: Stats, ability: StatId | null): FormAbilities {
  const out: FormAbilities = { dispositions: ability ? [ability] : [], elements: [], unique: null };
  if (!form) return out;
  const slot = kindSlot(form.label.kind);
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
      case 'burn': fx.burn = { fraction: (fx.burn?.fraction ?? 0) + v.burnFraction! * scale, seconds: v.burnSeconds! }; break;
      case 'thorns': fx.thorns = { threshold: v.thornsThreshold!, ret: (fx.thorns?.ret ?? 0) + v.thornsReturn! * scale }; break;
      case 'doubleHit': fx.doubleHit = (fx.doubleHit ?? 0) + v.doubleHitChance! * scale; break;
      case 'bloodlust': fx.bloodlust = { max: (fx.bloodlust?.max ?? 0) + v.bloodlustMax! * scale, fullAt: v.bloodlustFullAt! }; break;
      case 'corrode': fx.corrode = { per: v.corrodePer! * scale, everySeconds: v.corrodeEverySeconds!, max: v.corrodeMax! * scale }; break;
      case 'chainHaste': fx.chainHaste = (fx.chainHaste ?? 0) + v.chainHastePerChain! * scale; break;
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

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

/** 효과 수치 한 줄 (화면용, 효과 종류별 — 종족 무관) */
function effectSummary(fx: AbilityEffects, critChance: number): string {
  const parts: string[] = [];
  if (critChance > 0) parts.push(`치명타 확률 +${pct(critChance)}p`);
  if (fx.blockPower) parts.push(`블록 위력 +${pct(fx.blockPower)}`);
  if (fx.burn) parts.push(`화상 ${fx.burn.seconds}초 (블록 피해의 ${pct(fx.burn.fraction)})`);
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
  return parts.join(' · ');
}

export interface AbilityLine {
  /** 칸 이름: 성향 / 속성 / 전용 */
  slot: '성향' | '속성' | '전용';
  name: string;
  description: string;
}

/** 표시용 특성 줄 (상태 화면·진화 결과·도감): 성향 줄들 + 속성/전용 줄 1개(융합은 이름 둘을 '·'로) */
export function abilityLines(fa: FormAbilities, factionId: string): AbilityLine[] {
  const lines: AbilityLine[] = fa.dispositions.map((d) => ({ slot: '성향', name: abilityName(d, factionId), description: abilityDescription(d, factionId) }));
  const { effects, critChance } = abilityEffectsOf({ ...fa, dispositions: [] });
  const summary = effectSummary(effects, critChance);
  if (fa.unique) lines.push({ slot: '전용', name: pickFaction(uniqueAbility(fa.unique).name, factionId), description: summary });
  else if (fa.elements.length > 0) lines.push({ slot: '속성', name: fa.elements.map((x) => pickFaction(elementAbility(x.element).name, factionId)).join('·'), description: summary });
  return lines;
}
