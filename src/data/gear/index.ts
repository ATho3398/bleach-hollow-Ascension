// 장비 (GDD 91장 v5.187 확정, C.150 가칭·provisional → 241-D C.397): 칸 6개(무기·방어구·신발·장신구 1·2·3) · 종류 4(장신구 두 칸은 같은 종류) · 등급 4 · 영웅·전설 특수 효과 1줄.
// 칸 이름은 종족 설정(faction json gearSlotNames), 수치는 balance.ts provisional.gear, 그림 없으면 종류 아이콘(아이콘 스프라이트). 여기는 종류·칸·특수 효과 종류만.
import raw from './gear.json';

export const GEAR_KINDS = ['weapon', 'armor', 'shoes', 'accessory'] as const;
export type GearKind = (typeof GEAR_KINDS)[number];
export const GEAR_SLOTS = ['weapon', 'armor', 'shoes', 'acc1', 'acc2', 'acc3'] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];
/** 등급 (GDD 91장 3번): 블록 등급과 같은 4단계. 표시 이름은 공통 */
export const GEAR_GRADES = ['normal', 'rare', 'epic', 'legendary'] as const;
export type GearGrade = (typeof GEAR_GRADES)[number];
export const GEAR_GRADE_NAMES: Record<GearGrade, string> = { normal: '노멀', rare: '레어', epic: '영웅', legendary: '전설' };
/** 특수 효과 종류 (GDD 91장 4번 예: 조 블록 피해 +10%, 강적에게 피해 +8%): family = 그 계열 블록 피해, elite = 강적·보스에게 피해, critDamage = 치명 피해, shield = 전투 시작 보호막 */
/** activeShield·activeBurst = 전투 [장비] 버튼 발동 효과 (GDD 105장 수정 4, C.177) */
export const GEAR_SPECIAL_EFFECTS = ['family', 'elite', 'critDamage', 'shield', 'activeShield', 'activeBurst'] as const;
/** 전투 [장비] 버튼이 쓰는 발동 효과인가 */
export const isActiveGearEffect = (e: GearSpecialEffect): boolean => e === 'activeShield' || e === 'activeBurst';
export type GearSpecialEffect = (typeof GEAR_SPECIAL_EFFECTS)[number];

export interface GearSpecialDef {
  id: string;
  effect: GearSpecialEffect;
  /** effect 'family' 의 계열 id (종족 설정 families[].id — 이름은 종족 설정) */
  family?: string;
  /** 발동 효과 이름 (전투 [장비] 버튼·상세 창) */
  name?: string;
}

const isIn = <T extends string>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v);

function parse(): { icons: Record<GearKind, string>; factions: Record<GearKind, readonly string[]>; slotKind: Record<GearSlot, GearKind>; specials: GearSpecialDef[] } {
  const errors: string[] = [];
  const icons = {} as Record<GearKind, string>;
  const factions = {} as Record<GearKind, readonly string[]>;
  for (const k of raw.kinds as { id?: unknown; icon?: unknown; factions?: unknown }[]) {
    if (!isIn(GEAR_KINDS, k.id) || typeof k.icon !== 'string') errors.push(`kinds: ${String(k.id)}`);
    else {
      icons[k.id] = k.icon;
      factions[k.id] = Array.isArray(k.factions) ? k.factions.filter((f): f is string => typeof f === 'string') : [];
    }
  }
  const slotKind = {} as Record<GearSlot, GearKind>;
  for (const s of raw.slots) {
    if (!isIn(GEAR_SLOTS, s.id) || !isIn(GEAR_KINDS, s.kind)) errors.push(`slots: ${String(s.id)}`);
    else slotKind[s.id] = s.kind;
  }
  for (const k of GEAR_KINDS) if (!icons[k]) errors.push(`kinds 에 ${k} 없음`);
  for (const s of GEAR_SLOTS) if (!slotKind[s]) errors.push(`slots 에 ${s} 없음`);
  const specials: GearSpecialDef[] = [];
  for (const r of raw.specials as { id?: unknown; effect?: unknown; family?: unknown; name?: unknown }[]) {
    if (typeof r.id !== 'string' || !isIn(GEAR_SPECIAL_EFFECTS, r.effect) || (r.effect === 'family' && typeof r.family !== 'string')) errors.push(`specials: ${String(r.id)}`);
    else specials.push({ id: r.id, effect: r.effect, ...(typeof r.family === 'string' ? { family: r.family } : {}), ...(typeof r.name === 'string' ? { name: r.name } : {}) });
  }
  if (errors.length) throw new Error(`장비 데이터 오류: ${errors.join(', ')}`);
  return { icons, factions, slotKind, specials };
}

const P = parse();
export const GEAR_PROVISIONAL: boolean = raw.provisional;
/** 종류 → 아이콘 id (그림이 없을 때 카드·칸 그림) */
export const GEAR_KIND_ICONS: Readonly<Record<GearKind, string>> = P.icons;
/** 칸 → 받는 종류 (장신구 1·2 는 같은 종류) */
export const GEAR_SLOT_KIND: Readonly<Record<GearSlot, GearKind>> = P.slotKind;
/** 종족 전용 장비 칸 (GDD 241-D 1, 구조만): 비면 두 종족 공용. 지금은 모두 비어 있다 — 종족 전용 장비는 나중에 데이터로 */
export const GEAR_KIND_FACTIONS: Readonly<Record<GearKind, readonly string[]>> = P.factions;
/** 이 종족이 이 종류 장비를 쓸 수 있나 (faction 제한이 비면 공용) */
export function gearKindAllowed(kind: GearKind, factionId: string): boolean {
  const f = GEAR_KIND_FACTIONS[kind];
  return !f || f.length === 0 || f.includes(factionId);
}
export const GEAR_SPECIALS: readonly GearSpecialDef[] = P.specials;

/** 장비 해금 때 주는 낡은 장비 (GDD 243장 3, provisional): 종류마다 노멀 1개 · 종족 공통 이름 */
export const STARTER_GEAR: readonly { kind: GearKind; name: string }[] = ((raw as { starter?: unknown }).starter as { kind?: unknown; name?: unknown }[] | undefined ?? []).map((r) => {
  if (!isIn(GEAR_KINDS, r.kind) || typeof r.name !== 'string' || !r.name) throw new Error(`장비 데이터 오류: starter ${String(r.kind)}`);
  return { kind: r.kind, name: r.name };
});

export function getGearSpecial(id: string): GearSpecialDef | undefined {
  return GEAR_SPECIALS.find((s) => s.id === id);
}
export const isGearKind = (v: unknown): v is GearKind => isIn(GEAR_KINDS, v);
export const isGearSlot = (v: unknown): v is GearSlot => isIn(GEAR_SLOTS, v);
export const isGearGrade = (v: unknown): v is GearGrade => isIn(GEAR_GRADES, v);
/** 이 종류를 받는 칸들 (장신구 = 세 칸) */
export function slotsForKind(kind: GearKind): GearSlot[] {
  return GEAR_SLOTS.filter((s) => GEAR_SLOT_KIND[s] === kind);
}
