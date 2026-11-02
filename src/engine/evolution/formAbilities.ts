// 진화체 특성 (GDD 39장 → 126-1 수정, C.220): 진화체가 주는 특성 — ① 성향(노력치 최고 능력치) ② 속성(진화체 label 속성, 3단계부터)·전용(히든) ③ 물공 특성.
// 진화체 id·종족 분기 없이 label(kind·elements) → abilities.json kindSlots 규칙으로 정한다. 효과는 전투 엔진 AbilityEffects 종류로, 수치는 BALANCE.provisional.abilities.
// C.220: 특성은 진화할 때 얻어 보유 목록(AbilityLoadout.owned)에 남고(환생해도 유지), 특성 칸(기본 1 + 아란칼화/참백도 구상화 1 + 환생당 1, 최대 4)에 든 것만 효과가 있다.
// C.225 (GDD 147·148장): 3·4단계 진화 때만 대표 특성 1개, 같은 특성 두 번 없음, 받으면 영구(바꿔 끼기 없음).
// C.226 (GDD 149·151장): 4단계 진화 때 3단계 특성이 사라지고 같은 칸에 4단계 특성(el4: 4단계 몫 이름)을 얻는다. 히든 통로·망한 진화체 특성(kindSlots.ability),
// 망한 진화체 특성은 진화해도 남고(permanent) 각성형이면 각성 특성으로(replaces). 특성 칸 +1 = 4단계 진화 때(아란칼화 대신).
import { BALANCE } from '../../config/balance';
import { abilityDescription, abilityName, abilityTextName, elementAbility, elementAbilityName, kindSlot, physElementOf, uniqueAbility, type PhysElementDef } from '../../data/evolution';
import { pickFaction, STAT_IDS, type FormDef, type StatId, type Stats } from '../../data/schema';
import type { AbilityEffects, PhysBlock } from '../combat/combat';
import { makeRoomForEvolution, trimDetached, usedAbilitySlots } from '../traitShop';

const AB = BALANCE.provisional.abilities;
const PB = BALANCE.provisional.physBlocks;

export interface FormAbilities {
  /** 성향 특성 (보통 1개, 실패형 2개 = 노력치 1·2위) */
  dispositions: StatId[];
  /** 속성 특성: 속성과 세기 (3단계 1, 4단계 ×1.5, 융합·허무형 각 ×0.5, 안정형 ×1.5). tier4 = 4단계 몫(이름 name4, GDD 149장 1) */
  elements: { element: string; scale: number; tier4?: boolean }[];
  /** 전용 특성 (4속성형·폭주형·절제형·사냥꾼·각성형 + C.226 히든 통로·망한 진화체·실패형) — uniqueAbilities 키 */
  uniques: string[];
  /** 물공 특수 블록 (GDD 49장, C.103): kindSlots.physical 인 진화체 중 공격 분류 물리·속성 하나이고 physBlocks.json 에 그 속성이 있을 때. 블록은 몸(진화체)에 붙는다 */
  phys: { element: string; def: PhysElementDef } | null;
  /** 물공 특성 (그 블록과 짝인 특성): 진화체가 줄 때는 phys 의 속성, 장착 칸에서는 낀 것만 */
  physAbilities: string[];
}

/** 특성 보유 (GDD 126-1 수정 → 147·148장, C.225): EvolutionState.abilities. 받으면 영구(빼기·바꿔 끼기 없음), 환생해도 그대로 넘긴다(slots 만 다시 센다) */
export interface AbilityLoadout {
  /** 보유 특성 id → 세기. id = el:<속성>(3단계 몫, 융합·허무형은 el:<속성>+<속성>…) · el4:<속성>(4단계 몫) · uniq:<uniqueAbilities 키> (C.225 전 세이브의 disp:·phys: 는 마이그레이션이 뺀다) */
  owned: Record<string, number>;
  /** 칸에 든 특성 id = 보유 특성 전부(얻은 순서, slots 개 이하). 받으면 바로 칸에 들어가고 빠지지 않는다 */
  equipped: string[];
  /** 특성 칸 수 = min(4, 1 + 4단계 진화 1 + 환생 수) */
  slots: number;
  /** 4단계 진화를 한 번이라도 했다 (칸 +1, 영구 — GDD 151장 2. C.226 전 세이브의 ascendedEver 자리) */
  tier4Ever: boolean;
  /** 이번 생 3단계 진화에서 받은 특성 id (GDD 149장 1): 4단계 진화 때 이 자리에 4단계 특성이 들어간다. 4단계 전에 생이 끝났으면 다음 3단계 특성이 이 자리를 바꾼다 */
  pending?: string;
  /** 칸에 끼운 탈착 특성 id (GDD 150장 3, C.227): 특성 상점에서 산 것(보유 = shared.traits). 진화 특성과 같은 칸 수를 나눠 쓰고 방에서 뺄 수 있다 */
  detached?: string[];
}

export function newAbilityLoadout(): AbilityLoadout {
  return { owned: {}, equipped: [], slots: abilitySlotCount(0, false), tier4Ever: false };
}

/** 특성 칸 수 (GDD 126-1 수정 2 → 151장 2): 기본 1 + 4단계 진화 1 + 환생 1회당 1, 최대 4 */
export function abilitySlotCount(rebirths: number, tier4Ever: boolean): number {
  const AS = BALANCE.provisional.abilitySlots;
  return Math.min(AS.max, AS.base + (tier4Ever ? AS.perTier4 : 0) + Math.max(0, Math.floor(rebirths)) * AS.perRebirth);
}

/** 진화체가 주는 특성 id 와 세기 (C.220 옛 규칙 — 성향·물공 포함 전부. 지금 받는 특성은 representativeAbility) */
export function abilityIdsOf(fa: FormAbilities): { id: string; scale: number }[] {
  return [
    ...fa.uniques.map((k) => ({ id: `uniq:${k}`, scale: 1 })),
    ...fa.elements.map((x) => ({ id: `el:${x.element}`, scale: x.scale })),
    ...fa.physAbilities.map((el) => ({ id: `phys:${el}`, scale: 1 })),
    ...fa.dispositions.map((d) => ({ id: `disp:${d}`, scale: 1 })),
  ];
}

/** 속성 특성 id 머리: 4단계 진화체 몫은 el4 (GDD 149장 1 — 3단계 특성과 다른 특성) */
const elPrefix = (tier: number) => (tier >= 4 ? 'el4' : 'el');

/**
 * 진화체가 주는 대표 특성 1개 (GDD 148장 1 → 149장, provisional — 진화체 초안이 오면 표로): kindSlots.ability(히든 통로·망한 진화체·실패형) → 전용 → 속성
 * (융합·허무형은 속성 여럿을 한 특성으로, 4단계는 el4). 성향 특성은 받지 않는다. 없으면 null
 */
export function representativeAbility(form: FormDef): { id: string; scale: number } | null {
  const key = kindSlot(form.label.kind).ability?.[String(form.tier)];
  if (key) return { id: `uniq:${key}`, scale: 1 };
  const fa = formAbilitiesOf(form, zeroEv(), null);
  if (fa.uniques.length > 0) return { id: `uniq:${fa.uniques[0]!}`, scale: 1 };
  if (fa.elements.length > 0) return { id: `${elPrefix(form.tier)}:${fa.elements.map((x) => x.element).join('+')}`, scale: fa.elements[0]!.scale };
  return null;
}

/** 그 루트의 4단계 특성 id (GDD 149장 5): 속성 3단계 → 같은 속성 el4, kindSlots.ability 에 4단계 몫이 있으면 그것. 정해지지 않으면(히든 통로·망한 진화체 — 151장 4 실패형 특성 없음) null */
export function routeTier4AbilityId(third: FormDef): string | null {
  const key = kindSlot(third.label.kind).ability?.['4'];
  if (key) return `uniq:${key}`;
  const r = representativeAbility(third);
  return r?.id.startsWith('el:') ? `el4:${r.id.slice(3)}` : null;
}

/** 진화 때 특성 받은 결과 (진화 화면 한 줄·런 로그) */
export type AbilityGain =
  /** 새 특성을 칸에 받았다. bumped = 칸을 비우려고 보유 목록으로 뺀 탈착 특성 (GDD 150장 3) */
  | { kind: 'new'; id: string; bumped?: string }
  /** from 이 사라지고 같은 칸에 새 특성을 받았다 (GDD 149장 1: 3단계 특성, 151장 3: 각성형 → 허우적). gone = 함께 사라진 3단계 특성 */
  | { kind: 'replaced'; id: string; from: string; gone?: string[] }
  /** 이미 가진 특성이라 다시 받지 않았다 (그 루트 4단계 특성을 가졌을 때 포함). gone = 그래도 사라진 특성(3단계 특성·각성형이면 허우적) */
  | { kind: 'owned'; id: string; gone?: string[] }
  /** 특성 칸이 없어 받지 못했다 */
  | { kind: 'full'; id: string }
  /** 이 진화는 특성을 주지 않는다 (2단계 진화·특성 없는 진화체) */
  | { kind: 'none' };

/** 같은 루트 (GDD 148장 2): 3단계와 4단계의 속성이 같다(타입 무관) · 히든 통로 → 4단계 히든 · 망한 진화체 → 실패형. C.226 부터 특성 규칙에는 쓰지 않는다(149장 1 — 루트와 상관없이 교체) */
export function sameRoute(third: FormDef, fourth: FormDef): boolean {
  const k = (f: FormDef) => [...f.label.elements].sort().join('+');
  if (third.label.kind === 'passage') return fourth.hidden === true;
  if (third.label.kind === 'fail') return fourth.label.kind === 'fail';
  return k(third) === k(fourth);
}

/** 칸 = 보유 특성 전부(얻은 순서) — 받으면 영구라 따로 고르지 않는다 */
function syncEquipped(l: AbilityLoadout): void {
  l.equipped = Object.keys(l.owned);
}

/** 보유 목록에서 from 자리에 to 를 넣는다 (얻은 순서 그대로) */
function replaceOwned(l: AbilityLoadout, from: string, to: string, scale: number): void {
  l.owned = Object.fromEntries(Object.entries(l.owned).map(([id, v]) => (id === from ? [to, scale] : [id, v])));
}

/** 보유 목록에서 뺀다 */
function dropOwned(l: AbilityLoadout, id: string): void {
  const { [id]: _drop, ...rest } = l.owned;
  l.owned = rest;
}

/** uniq: 특성의 데이터 (permanent·replaces). 속성 특성이면 null */
function uniqueDef(id: string): ReturnType<typeof uniqueAbility> | null {
  return id.startsWith('uniq:') ? uniqueAbility(id.slice(5)) : null;
}

/**
 * 진화해서 특성을 받는다 (GDD 148장 → 149·151장): 3·4단계 진화 때만 대표 특성 1개.
 * 3단계: 그 특성이나 그 루트의 4단계 특성을 이미 가졌으면 안 받는다. 받으면 pending 에 적는다(진화해도 남는 특성 — 허우적 — 은 안 적음).
 *   전생에 4단계 전에 끝난 3단계 특성(pending)이 있으면 그 자리에.
 * 4단계: 처음이면 특성 칸 +1(151장 2). 3단계 특성(pending)이 사라지고 같은 칸에 4단계 특성 — 루트와 상관없이. 4단계 특성이 replaces 로 바꾸는 특성(각성형 → 허우적)을
 *   가졌으면 그 자리에 들어가고 3단계 특성은 그냥 사라진다. 4단계 특성을 이미 가졌으면 사라질 것만 사라진다.
 * 칸이 꽉 차면 못 받는다(교체는 칸을 더 쓰지 않아 된다). prev 는 예전 인자(지금 규칙은 pending 만 본다)
 */
export function gainEvolutionAbility(l: AbilityLoadout, form: FormDef, _prev?: FormDef): AbilityGain {
  const AG = BALANCE.provisional.abilityGain;
  if (!AG.tiers.includes(form.tier)) return { kind: 'none' };
  const isThird = form.tier < Math.max(...AG.tiers);
  if (!isThird && !l.tier4Ever) {
    const AS = BALANCE.provisional.abilitySlots;
    l.tier4Ever = true;
    l.slots = Math.min(AS.max, l.slots + AS.perTier4);
  }
  const pend = l.pending !== undefined && l.pending in l.owned ? l.pending : undefined;
  if (l.pending !== undefined && pend === undefined) delete l.pending;
  const got = representativeAbility(form);
  if (!got) {
    if (!isThird && pend) {
      dropOwned(l, pend);
      delete l.pending;
      syncEquipped(l);
    }
    return { kind: 'none' };
  }
  const def = uniqueDef(got.id);
  const done = (g: AbilityGain): AbilityGain => {
    syncEquipped(l);
    return g;
  };
  if (isThird) {
    const route4 = routeTier4AbilityId(form);
    const ownedId = got.id in l.owned ? got.id : route4 && route4 in l.owned ? route4 : null;
    if (ownedId) return { kind: 'owned', id: ownedId };
    const mark = () => {
      if (def?.permanent) delete l.pending;
      else l.pending = got.id;
    };
    if (pend) {
      replaceOwned(l, pend, got.id, got.scale);
      mark();
      return done({ kind: 'replaced', id: got.id, from: pend });
    }
    const bumped = makeRoomForEvolution(l); // 진화 특성 우선 (GDD 150장 3)
    if (usedAbilitySlots(l) >= l.slots) return { kind: 'full', id: got.id };
    l.owned[got.id] = got.scale;
    mark();
    return done({ kind: 'new', id: got.id, ...(bumped ? { bumped } : {}) });
  }
  // 4단계
  delete l.pending;
  const target = (def?.replaces ?? []).map((k) => `uniq:${k}`).find((id) => id in l.owned);
  const gone = (ids: (string | undefined)[]) => {
    const list = ids.filter((x): x is string => x !== undefined);
    for (const id of list) dropOwned(l, id);
    return list.length > 0 ? { gone: list } : {};
  };
  if (got.id in l.owned) return done({ kind: 'owned', id: got.id, ...gone([target, pend]) });
  const slot = target ?? pend;
  if (slot) {
    replaceOwned(l, slot, got.id, got.scale);
    return done({ kind: 'replaced', id: got.id, from: slot, ...gone([slot === target ? pend : undefined]) });
  }
  const bumped = makeRoomForEvolution(l); // 진화 특성 우선 (GDD 150장 3)
  if (usedAbilitySlots(l) >= l.slots) return { kind: 'full', id: got.id };
  l.owned[got.id] = got.scale;
  return done({ kind: 'new', id: got.id, ...(bumped ? { bumped } : {}) });
}

/** 칸 수를 다시 정한다(환생·아란칼화). 받은 특성은 빠지지 않는다 */
export function setAbilitySlots(l: AbilityLoadout, slots: number): void {
  l.slots = slots;
  syncEquipped(l);
  trimDetached(l); // 넘치면 탈착 특성부터 보유 목록으로 (GDD 150장 3)
}

/** 노력치 얻는 양 배율 (GDD 149장 3·4: 허우적·마구잡이 — 칸에 든 evGain 특성의 곱) */
export function evGainMultOf(l: Pick<AbilityLoadout, 'equipped'> | undefined): number {
  let m = 1;
  for (const id of l?.equipped ?? []) {
    if (!id.startsWith('uniq:')) continue;
    const key = id.slice(5);
    const v = AB.unique[key]?.evGainMult;
    if (v !== undefined) m *= v;
  }
  return m;
}

/** 장착 칸 → 특성 묶음 (전투·상태 화면). 물공 블록은 진화체에서(form), 특성은 낀 것만 */
export function equippedAbilitiesOf(form: FormDef | null, l: AbilityLoadout): FormAbilities {
  const out: FormAbilities = { dispositions: [], elements: [], uniques: [], phys: form ? formAbilitiesOf(form, zeroEv(), null).phys : null, physAbilities: [] };
  for (const id of l.equipped) {
    const [kind, key] = id.split(':') as [string, string];
    const scale = l.owned[id] ?? 1;
    if (kind === 'disp' && (STAT_IDS as readonly string[]).includes(key)) out.dispositions.push(key as StatId);
    else if (kind === 'el' || kind === 'el4') for (const element of key.split('+')) out.elements.push({ element, scale, ...(kind === 'el4' ? { tier4: true } : {}) });
    else if (kind === 'uniq') out.uniques.push(key);
    else if (kind === 'phys' && physElementOf(key)) out.physAbilities.push(key);
  }
  return out;
}

const zeroEv = (): Stats => ({ hp: 0, atk: 0, int: 0, def: 0, spr: 0, spd: 0 });

/** 노력치 순위 (동률이면 진화체 종족값 → STAT_IDS 순). abilityFor 와 같은 규칙 */
export function rankedStats(ev: Stats, form: FormDef): StatId[] {
  return [...STAT_IDS].sort((a, b) => ev[b] - ev[a] || form.stats[b] - form.stats[a] || STAT_IDS.indexOf(a) - STAT_IDS.indexOf(b));
}

/** 이 진화체의 특성 칸. ability = 진화 때 정한 성향(저장값), 실패형 2위는 지금 노력치에서 (새 저장 없음) */
export function formAbilitiesOf(form: FormDef | null, ev: Stats, ability: StatId | null): FormAbilities {
  const out: FormAbilities = { dispositions: ability ? [ability] : [], elements: [], uniques: [], phys: null, physAbilities: [] };
  if (!form) return out;
  const slot = kindSlot(form.label.kind);
  if (slot.physical && form.label.category === 'physical' && form.label.elements.length === 1) {
    const element = form.label.elements[0]!;
    const def = physElementOf(element);
    if (def) {
      out.phys = { element, def };
      out.physAbilities = [element];
    }
  }
  const want = slot.dispositions ?? 1;
  if (ability && want > 1) out.dispositions.push(...rankedStats(ev, form).filter((s) => s !== ability).slice(0, want - 1));
  if (slot.element === 'unique') out.uniques = [form.label.kind];
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
  for (const element of fa.physAbilities) {
    const def = physElementOf(element);
    if (!def) continue;
    switch (def.ability.effect) {
      case 'hardFist': fx.hardFist = { ...PB.hardFist }; break;
      case 'bloodScent': fx.bloodScent = PB.bloodScent.drainMultiplier; break;
      case 'emberStack': fx.emberStack = { element, ...PB.emberStack }; break;
      case 'current': fx.current = { ...PB.current }; break;
      case 'charge': fx.charge = PB.charge.every; break;
      case 'tempering': fx.tempering = { ...PB.tempering }; break;
    }
  }
  for (const u of fa.uniques) {
    const v = AB.unique[u] ?? {};
    switch (uniqueAbility(u).effect) {
      case 'noWeak': fx.noWeak = true; break;
      case 'desperate': fx.desperate = { below: v.desperateBelow!, bonus: v.desperateBonus! }; break;
      case 'rampUp': fx.rampUp = { per: v.rampPer!, everySeconds: v.rampEverySeconds!, max: v.rampMax! }; break;
      case 'eliteSlayer': fx.eliteSlayer = v.eliteBonus!; break;
      case 'lastStand': fx.lastStand = v.lastStandHp!; break;
      case 'mutation': fx.mutation = { dealt: (fx.mutation?.dealt ?? 0) + v.dealtBonus!, taken: (fx.mutation?.taken ?? 0) + v.takenReduction! }; break;
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

/** 특성 칸 화면 이름: '물공' 칸은 데이터 키일 뿐 화면에는 '기본 공격' (블록 타입 숨김, GDD 137장 1) */
export const ABILITY_SLOT_LABEL: Record<AbilityLine['slot'], string> = { 성향: '성향', 속성: '속성', 전용: '전용', 물공: '기본 공격' };

/** 물공 블록 효과 한 줄 (화면용, 종족 무관) */
export function physBlockSummary(pb: PhysBlock): string {
  const head = `블록 피해 ×${pb.power}`;
  switch (pb.effect) {
    case 'stoneStance': return `${head}, 쓴 뒤 ${pb.seconds}초 동안 받는 피해 −${pct(pb.takenReduction)} · 그동안 맞을 때마다 다음 기본 공격 +${pct(pb.perHit)}(최대 +${pct(pb.max)})`;
    case 'knockback': return `${head}, 쓴 뒤 다음 기본 공격 ${pb.hits}회 +${pct(pb.bonus)} · 적 ${pb.seconds}초 정지(넉백)`;
    case 'ember': return `${head} (바에 쌓아 두는 용)`;
    case 'wave': return `${head}, 쓴 뒤 ${pb.seconds}초 동안 기본 공격 간격 −${pct(pb.haste)}`;
    case 'flash': return `${head}, 쓴 뒤 다음 기본 공격 ${pb.hits}회 2연타(각 ${pct(pb.each)})`;
    case 'shout': return `${head}, 쓰는 순간 기본 공격 1회가 바로 나간다`;
  }
}

/** 효과 수치 한 줄 (화면용, 효과 종류별 — 종족 무관) */
function effectSummary(fx: AbilityEffects, critChance: number): string {
  const parts: string[] = [];
  if (critChance > 0) parts.push(`치명타 확률 +${pct(critChance)}p(상한도 +${pct(critChance)}p)`);
  if (fx.blockPower) parts.push(`블록 위력 +${pct(fx.blockPower)}`);
  if (fx.ignoreDefense) parts.push(`적 방어·정신력 ${pct(fx.ignoreDefense)} 무시`);
  if (fx.thorns) parts.push(`받은 피해가 최대 체력 ${pct(fx.thorns.threshold)} 쌓이면 ${pct(fx.thorns.ret)} 반사`);
  if (fx.doubleHit) parts.push(`기본 공격 ${pct(fx.doubleHit)} 확률 한 번 더`);
  if (fx.bloodlust) parts.push(`체력 ${pct(fx.bloodlust.fullAt)} 이하에서 공격 최대 +${pct(fx.bloodlust.max)}`);
  if (fx.corrode) parts.push(`${fx.corrode.everySeconds}초마다 적이 받는 피해 +${pct(fx.corrode.per)} (최대 +${pct(fx.corrode.max)})`);
  if (fx.chainHaste) parts.push(`체인 단계당 다음 블록 생성 ${pct(fx.chainHaste)} 빠르게`);
  if (fx.noWeak) parts.push('상성 불리 없음');
  if (fx.desperate) parts.push(`체력 ${pct(fx.desperate.below)} 아래에서 피해 +${pct(fx.desperate.bonus)}`);
  if (fx.rampUp) parts.push(`${fx.rampUp.everySeconds}초마다 공격 +${pct(fx.rampUp.per)} (최대 +${pct(fx.rampUp.max)})`);
  if (fx.eliteSlayer) parts.push(`강적·보스에게 피해 +${pct(fx.eliteSlayer)}`);
  if (fx.lastStand) parts.push(`전투마다 1번 체력 ${pct(fx.lastStand)}로 버티기`);
  if (fx.mutation) parts.push(`주는 피해 +${pct(fx.mutation.dealt)} · 받는 피해 −${pct(fx.mutation.taken)}`);
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
  const none: FormAbilities = { dispositions: [], elements: [], uniques: [], phys: null, physAbilities: [] };
  for (const u of fa.uniques) {
    const { effects, critChance } = abilityEffectsOf({ ...none, uniques: [u] });
    const evMult = AB.unique[u]?.evGainMult;
    const description = evMult !== undefined ? `노력치 얻는 양 ×${evMult}` : effectSummary(effects, critChance);
    lines.push({ slot: '전용', name: abilityTextName(uniqueAbility(u), factionId), description });
  }
  if (fa.elements.length > 0) {
    const { effects, critChance } = abilityEffectsOf({ ...none, elements: fa.elements });
    lines.push({ slot: '속성', name: fa.elements.map((x) => elementAbilityName(x.element, factionId, x.tier4)).join('·'), description: effectSummary(effects, critChance) });
  }
  // 물공 칸 (GDD 49장): 특성 이름 — 특성 효과 · 블록 「이름」: 블록 효과 (블록은 몸에 붙어 있을 때만)
  for (const element of fa.physAbilities) {
    const def = physElementOf(element);
    if (!def) continue;
    const physFx = abilityEffectsOf({ ...none, physAbilities: [element] }).effects;
    const pb = fa.phys?.element === element ? physBlockOf(fa) : null;
    const blockText = pb && fa.phys ? ` · 블록 「${pickFaction(fa.phys.def.block.name, factionId)}」 ${physBlockSummary(pb)}` : '';
    lines.push({ slot: '물공', name: pickFaction(def.ability.name, factionId), description: `${effectSummary(physFx, 0)}${blockText}` });
  }
  return lines;
}

/** 보유 특성 하나의 화면 줄 (특성 칸 화면, C.220): 칸 종류·이름·설명. 모르는 id 면 null */
export function abilityIdLine(id: string, scale: number, factionId: string): AbilityLine | null {
  const fa = equippedAbilitiesOf(null, { owned: { [id]: scale }, equipped: [id], slots: 1, tier4Ever: false });
  return abilityLines(fa, factionId)[0] ?? null;
}
