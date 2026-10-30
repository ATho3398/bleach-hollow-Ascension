// 진화체 특성 데이터 (GDD 20-3·v4.0 성향 6종 + 39장 속성 8종·전용 5종). 이름·설명·효과 종류·진화체 종류별 칸 규칙은 abilities.json, 수치는 BALANCE.provisional.abilities
import { ELEMENT_IDS } from '../elements';
import { FORM_KINDS, pickFaction, STAT_IDS, type FormKind, type PerFaction, type StatId } from '../schema';
import { getFaction } from '../factions';
import raw from './abilities.json';

export interface AbilityText {
  name: PerFaction<string>;
  description: PerFaction<string>;
}
export interface EffectAbilityText extends AbilityText {
  /** 전투 엔진 효과 종류 (AbilityEffects 의 키 또는 crit) */
  effect: string;
}
/** 진화체 종류별 특성 칸 규칙 (39장 1·3·4번): element = 속성 칸을 label 속성으로 / 전용 / 없음, scale = 세기 배율 이름, dispositions = 성향 특성 개수(실패형 2) */
export interface KindSlot {
  element: 'label' | 'unique' | 'none';
  scale?: 'fusion' | 'boosted';
  dispositions?: number;
  /** true 면 공격 분류가 물리이고 속성이 하나인 진화체에 물공 특수 블록·특성(GDD 49장, physBlocks.json)이 붙는다 */
  physical?: boolean;
}

interface AbilitiesFile {
  provisional: boolean;
  abilities: Record<StatId, AbilityText>;
  elementAbilities: Record<string, EffectAbilityText>;
  uniqueAbilities: Record<string, EffectAbilityText>;
  kindSlots: Record<FormKind, KindSlot>;
}

const DATA = raw as AbilitiesFile;

/** 데이터 검사: 성향 6종·속성 8종 모두 있고, 모든 진화체 종류에 칸 규칙이 있고, 전용 칸 종류마다 전용 특성이 있다 */
export function validateAbilities(d: AbilitiesFile = DATA): string[] {
  const errors: string[] = [];
  for (const k of STAT_IDS) if (!d.abilities[k]) errors.push(`성향 특성 ${k} 없음`);
  for (const el of ELEMENT_IDS) if (!d.elementAbilities[el]?.effect) errors.push(`속성 특성 ${el} 없음`);
  for (const kind of FORM_KINDS) {
    const slot = d.kindSlots[kind];
    if (!slot) errors.push(`진화체 종류 ${kind} 의 특성 칸 규칙 없음`);
    else if (slot.element === 'unique' && !d.uniqueAbilities[kind]?.effect) errors.push(`전용 특성 ${kind} 없음`);
  }
  return errors;
}
{
  const errors = validateAbilities();
  if (errors.length > 0) throw new Error(`특성 데이터 오류:\n- ${errors.join('\n- ')}`);
}

export const ABILITIES_PROVISIONAL: boolean = DATA.provisional;

export function kindSlot(kind: FormKind): KindSlot {
  return DATA.kindSlots[kind];
}

export function elementAbility(element: string): EffectAbilityText {
  const a = DATA.elementAbilities[element];
  if (!a) throw new Error(`속성 특성 없음: ${element}`);
  return a;
}

export function uniqueAbility(kind: string): EffectAbilityText {
  const a = DATA.uniqueAbilities[kind];
  if (!a) throw new Error(`전용 특성 없음: ${kind}`);
  return a;
}

export function abilityName(stat: StatId, factionId: string): string {
  return abilityTextName(DATA.abilities[stat], factionId);
}

export function abilityDescription(stat: StatId, factionId: string): string {
  return pickFaction(DATA.abilities[stat].description, factionId);
}

/** 특성 표시 이름: '{frenzyName}' 은 종족 설정의 폭주 상태 이름으로 채운다 (C.213, GDD 136장 2 — 옛 이름 폐기, 종족 분기 없음) */
export function abilityTextName(a: AbilityText, factionId: string): string {
  return pickFaction(a.name, factionId).replace('{frenzyName}', getFaction(factionId).frenzyName);
}

/** 효과 종류 → 그 효과를 가진 특성 이름 (전투 중 발동 글자). 없으면 null */
export function abilityNameByEffect(effect: string, factionId: string): string | null {
  const all = [...Object.values(DATA.elementAbilities), ...Object.values(DATA.uniqueAbilities)];
  const a = all.find((x) => x.effect === effect);
  return a ? abilityTextName(a, factionId) : null;
}
