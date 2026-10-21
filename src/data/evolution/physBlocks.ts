// 물공 특수 블록·특성 데이터 (GDD 49장·49-1, C.103): 5단계 물리(조·참) 단일 속성 진화체의 기본 공격 블록 3계열이 전부 그 속성 물공 블록으로 바뀌고 특성 1칸이 더해진다.
// 효과 종류(effect)는 엔진이 알고, 이름·설명·발동 글자는 여기(종족별 `{ hollow, shinigami }` 또는 `{ "*" }`), 수치는 BALANCE.provisional.physBlocks. 종족 분기 없음.
import { ELEMENT_IDS } from '../elements';
import { pickFaction, type PerFaction } from '../schema';
import raw from './physBlocks.json';

/** 물공 블록 효과 종류 (엔진 combat.ts 가 처리) */
export const PHYS_BLOCK_EFFECTS = ['stoneStance', 'knockback', 'ember', 'wave', 'flash', 'shout'] as const;
export type PhysBlockEffect = (typeof PHYS_BLOCK_EFFECTS)[number];
/** 물공 특성 효과 종류 (엔진 AbilityEffects 의 키) */
export const PHYS_ABILITY_EFFECTS = ['hardFist', 'bloodScent', 'emberStack', 'current', 'charge', 'tempering'] as const;
export type PhysAbilityEffect = (typeof PHYS_ABILITY_EFFECTS)[number];

export interface PhysText<E extends string> {
  effect: E;
  name: PerFaction<string>;
  /** 전투 중 발동 작은 글자 (예 "넉백!") */
  proc: PerFaction<string>;
  description: PerFaction<string>;
}
export interface PhysElementDef {
  block: PhysText<PhysBlockEffect>;
  ability: PhysText<PhysAbilityEffect>;
}
interface PhysFile {
  provisional: boolean;
  elements: Record<string, PhysElementDef>;
}

const DATA = raw as unknown as PhysFile;

/** 데이터 검사: 속성 id 가 실제 속성이고, 효과 종류가 엔진이 아는 것이며, 이름이 있다 */
export function validatePhysBlocks(d: PhysFile = DATA): string[] {
  const errors: string[] = [];
  for (const [el, def] of Object.entries(d.elements)) {
    if (!ELEMENT_IDS.includes(el)) errors.push(`물공 블록: 모르는 속성 ${el}`);
    if (!def.block || !(PHYS_BLOCK_EFFECTS as readonly string[]).includes(def.block.effect)) errors.push(`물공 블록 ${el}: 블록 효과 없음/모름`);
    if (!def.ability || !(PHYS_ABILITY_EFFECTS as readonly string[]).includes(def.ability.effect)) errors.push(`물공 블록 ${el}: 특성 효과 없음/모름`);
    for (const part of [def.block, def.ability]) {
      if (!part) continue;
      if (!part.name || Object.keys(part.name).length === 0) errors.push(`물공 블록 ${el}: ${part.effect} 이름 없음`);
      if (!part.proc || Object.keys(part.proc).length === 0) errors.push(`물공 블록 ${el}: ${part.effect} 발동 글자 없음`);
    }
  }
  return errors;
}
{
  const errors = validatePhysBlocks();
  if (errors.length > 0) throw new Error(`물공 블록 데이터 오류:\n- ${errors.join('\n- ')}`);
}

export const PHYS_BLOCKS_PROVISIONAL: boolean = DATA.provisional;
/** 물공 블록이 정의된 속성 목록 (GDD 49-1: 노멀·물·불·흙·뇌·혈) */
export const PHYS_ELEMENT_IDS: readonly string[] = Object.keys(DATA.elements);

/** 그 속성의 물공 블록·특성 정의 (없으면 null) */
export function physElementOf(element: string): PhysElementDef | null {
  return DATA.elements[element] ?? null;
}

/** 물공 블록 이름 (종족별). 그 속성에 없으면 null */
export function physBlockName(element: string, factionId: string): string | null {
  const d = physElementOf(element);
  return d ? pickFaction(d.block.name, factionId) : null;
}

/** 물공 특성 이름 (종족별). 없으면 null */
export function physAbilityName(element: string, factionId: string): string | null {
  const d = physElementOf(element);
  return d ? pickFaction(d.ability.name, factionId) : null;
}

/** 효과 종류(블록 또는 특성) → 발동 글자. 없으면 null */
export function physProcText(effect: string, factionId: string): string | null {
  for (const d of Object.values(DATA.elements)) {
    if (d.block.effect === effect) return pickFaction(d.block.proc, factionId);
    if (d.ability.effect === effect) return pickFaction(d.ability.proc, factionId);
  }
  return null;
}
