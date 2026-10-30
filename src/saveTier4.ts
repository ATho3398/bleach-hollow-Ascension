// 세이브 형식 56 → 57 (C.220, GDD 142장 9·126장 11): 진화 5단계 → 4단계.
// 옛 5단계(아란칼/수석 대원) → 같은 속성·타입 4단계 + 아란칼화/참백도 구상화를 깬 것으로(이미 레스렉시온/만해·아란칼 모습이었다),
// 옛 4단계(바스트로데/평대원 속성) → 4단계에 그대로 머물되 타입은 장착 최다 공격 분류로, 옛 4단계 히든 → 가장 가까운 새 4단계 진화체,
// 옛 3단계(아쥬커스/견습 대원 base) → 3단계 속성 진화체(장착 최다 속성). 옛 특성(그 몸이 쓰던 특성) → 보유 목록 + 칸(새 규칙 수).
// 런 로그·도감·칭호의 옛 진화체 id 는 문맥 없이 옮긴다(remapOldFormId): 옛 4단계 → 새 3단계 꼴, 옛 5단계 → 새 4단계.
import { tryGetForm } from './data/evolution';
import { NORMAL_ELEMENT } from './data/elements';
import { getFaction } from './data/factions';
import type { BuildState } from './engine/absorb/build';
import { abilityFor, abilityIdsOf, abilitySlotCount, dominantCategory, formAbilitiesOf, gainEvolutionAbility, newAbilityLoadout, tier3Element, type AbilityLoadout, type EvolutionState } from './engine/evolution';
import { pickFormLook } from './engine/evolution/tierLook';

/** 옛 5단계 행동 히든 → 새 4단계 히든 */
const OLD_T5_HIDDEN: Record<string, string> = { 'h5:limit': 'h4:frenzy', 'h5:restraint': 'h4:restraint', 'h5:hunter': 'h4:hunter', 'h5:reborn': 'h4:awakened' };

/** 옛 특수 속성 바스트로데(h4:special:<속성>) → 그 속성 하나뿐인 새 4단계 */
function specialTier4(el: string): string | null {
  const f = ['physical', 'special', 'mixed'].map((c) => `t4:${el}:${c}`).find((id) => tryGetForm(id) !== undefined);
  return f ?? null;
}

/** 옛 5단계 일반 id (t5:<속성>:<분류>) → 새 4단계. 그 속성에 그 분류가 없으면(혈 특수 등) 그 속성 하나뿐인 타입 */
function oldT5ToT4(id: string): string {
  const [, el, cat] = id.split(':') as [string, string, string];
  const same = `t4:${el}:${cat}`;
  return tryGetForm(same) ? same : (specialTier4(el) ?? `t4:${NORMAL_ELEMENT}:mixed`);
}

/** 런 로그·도감·칭호용 문맥 없는 id 옮기기. 이미 새 id 거나 모르는 id 는 그대로 */
export function remapOldFormId<T extends string | null | undefined>(id: T): T {
  if (typeof id !== 'string') return id;
  if (id === 't3:base') return 't3:normal' as T;
  if (/^t4:[a-z]+$/.test(id)) return (tryGetForm(`t3:${id.slice(3)}`) ? `t3:${id.slice(3)}` : 'h3:passage') as T;
  if (/^t5:[a-z]+:[a-z]+$/.test(id)) return oldT5ToT4(id) as T;
  if (id in OLD_T5_HIDDEN) return OLD_T5_HIDDEN[id] as T;
  if (id === 'h4:fail') return 'h3:fail' as T;
  if (id === 'h4:pure') return 't3:normal' as T;
  if (id.startsWith('h4:fusion:') || id === 'h4:complete' || id.startsWith('h4:special:')) return 'h3:passage' as T;
  return id;
}

/** 옛 4단계(바스트로데) 진화체가 4단계에 머물 때 가장 가까운 새 4단계 진화체 */
function oldT4StayId(id: string, build: BuildState, factionId: string): string {
  if (id.startsWith('h4:fusion:') || id === 'h4:complete' || id === 'h4:fail') return tryGetForm(id) ? id : 'h4:fail';
  if (id.startsWith('h4:special:')) return specialTier4(id.slice('h4:special:'.length)) ?? `t4:${NORMAL_ELEMENT}:mixed`;
  const el = id === 'h4:pure' ? NORMAL_ELEMENT : id.slice(3);
  return tryGetForm(`t4:${el}:${dominantCategory(build, factionId)}`) ? `t4:${el}:${dominantCategory(build, factionId)}` : `t4:${NORMAL_ELEMENT}:mixed`;
}

/** 옛 4단계 진화체 → 새 3단계 기록 칸 (5단계까지 간 몸의 지나온 길) */
function oldT4PassedId(id: string | undefined, build: BuildState): string {
  if (!id) return `t3:${tier3Element(build)}`;
  if (id === 'h4:fail') return 'h3:fail';
  if (id === 'h4:pure') return `t3:${NORMAL_ELEMENT}`;
  if (/^t4:[a-z]+$/.test(id) && tryGetForm(`t3:${id.slice(3)}`)) return `t3:${id.slice(3)}`;
  return 'h3:passage';
}

/** 진화 상태 하나를 옮긴다 (트랙·진행 중 원정 사본 모두). rebirths = 그 트랙 환생 횟수(특성 칸 수) */
export function migrateEvolutionTo4(e: EvolutionState, build: BuildState, factionId: string, rebirths: number): void {
  const old = e.tierIndex;
  const hist = Array.isArray(e.formHistory) ? e.formHistory : [];
  const oldT4 = hist.find((id) => id.startsWith('t4:') || id.startsWith('h4:'));
  const oldT5 = hist.find((id) => id.startsWith('t5:') || id.startsWith('h5:'));
  const next: string[] = [];
  if (old >= 1) next.push('t2:base');
  if (old >= 2) next.push(oldT4PassedId(old >= 3 ? oldT4 : undefined, build));
  if (old >= 4 && oldT5) next.push(oldT5.startsWith('h5:') ? (OLD_T5_HIDDEN[oldT5] ?? 'h4:fail') : oldT5ToT4(oldT5));
  else if (old >= 3 && oldT4) next.push(oldT4StayId(oldT4, build, factionId));
  // 이미 망한 진화체를 거쳤다면 4단계도 실패형 줄기 (GDD 126장 7 실패형 '3단계 망한 진화체에서')
  if (next[1] === 'h3:fail' && next[2] !== undefined && next[2] !== 'h4:fail' && !tryGetForm(next[2])?.hidden) next[2] = 'h4:fail';
  e.tierIndex = Math.min(old, 3);
  e.formHistory = next.filter((id) => tryGetForm(id) !== undefined);
  e.formId = e.formHistory[e.formHistory.length - 1] ?? null;
  // 옛 5단계 = 이미 아란칼/수석 대원 (레스렉시온/만해·아란칼 모습) → 아란칼화/참백도 구상화를 깬 것으로
  const ascended = old >= 4;
  if (ascended) e.ascended = true;
  const form = e.formId ? tryGetForm(e.formId) : undefined;
  if (ascended && form) {
    const fac = getFaction(factionId);
    if (fac.ascension.lookChange) e.look = pickFormLook(fac, form.id, e.stageSeed) ?? e.look ?? null;
  } else if (old >= 3 && e.look && !getFaction(factionId).tierLooks?.[String(e.tierIndex + 1)]) {
    // 옛 4단계에 고정된 외형이 새 단계 표에 없으면 기본 단계 그림으로
    e.look = null;
  }
  if (form && !e.ability) e.ability = abilityFor(e.ev, form);
  // 특성: 그 몸이 쓰던 특성을 보유 목록에, 칸은 새 규칙(기본 1 + 아란칼화 + 환생)
  const l = newAbilityLoadout();
  l.ascendedEver = ascended;
  l.slots = abilitySlotCount(rebirths, ascended);
  // C.220 그때 규칙(진화체 특성 전부·칸은 앞에서부터). 형식 59(C.225)가 148장 규칙으로 다시 만든다
  if (form) for (const g of abilityIdsOf(formAbilitiesOf(form, e.ev, e.ability))) l.owned[g.id] = Math.max(l.owned[g.id] ?? 0, g.scale);
  l.equipped = Object.keys(l.owned).slice(0, l.slots);
  e.abilities = l;
  // 흡수 칸: 새 최대(3 + 단계)를 넘는 칸은 뒤에서부터 비워 없앤다(특성은 보유에 남는다)
  const maxSlots = 3 + e.tierIndex;
  if (Array.isArray(build.slots) && build.slots.length > maxSlots) build.slots = build.slots.slice(0, maxSlots);
}

/**
 * 세이브 형식 58 → 59 (C.225, GDD 148장 7): 특성 = 3·4단계 진화 때만 1개. 보유 특성 중 성향(disp:)·물공(phys:)·융합 조각(세기 1 미만 el:)은 빼고,
 * 지금 생의 3·4단계 진화체로 148장 규칙을 다시 밟는다(같은 루트면 강화 1개, 이미 가진 것은 그대로). 칸이 넘치면 먼저 얻은 것부터 남긴다.
 */
export function migrateAbilities148(e: EvolutionState, rebirths: number): void {
  const raw = (typeof e.abilities === 'object' && e.abilities !== null ? e.abilities : newAbilityLoadout()) as Partial<AbilityLoadout>;
  const ascendedEver = raw.ascendedEver === true || e.ascended === true;
  const l: AbilityLoadout = { owned: {}, equipped: [], slots: abilitySlotCount(rebirths, ascendedEver), ascendedEver };
  const owned = typeof raw.owned === 'object' && raw.owned !== null ? raw.owned : {};
  for (const [id, v] of Object.entries(owned)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue;
    if (id.startsWith('uniq:') || (id.startsWith('el:') && v >= 1)) l.owned[id] = v;
  }
  const history = Array.isArray(e.formHistory) ? e.formHistory.map((id) => tryGetForm(id)) : [];
  // 넘친 칸을 먼저 자르고(먼저 얻은 것부터) 다시 밟는다 — 다시 밟을 때 칸 수를 지킨다
  for (const id of Object.keys(l.owned).slice(l.slots)) delete l.owned[id];
  history.forEach((f, i) => {
    if (f) gainEvolutionAbility(l, f, history[i - 1]);
  });
  l.equipped = Object.keys(l.owned);
  e.abilities = l;
}
