// 세이브 형식 13 → 14 마이그레이션 (C.47, GDD 20장): 계통 A~E → 속성 8종, 진화 테이블 → 속성 트리, 흡수 횟수 → 걸음 수.
// 옛 데이터(계통·특성·진화체 id)는 지금 데이터 파일에 없으므로 대응표를 여기 고정해 둔다. 새 데이터가 바뀌어도 이 표는 그대로 둔다.
import { tryGetForm } from './data/evolution';
import { TRAITS } from './data/traits';
import { dominantCategory, abilityFor, newEvolution, nextStageSeed, type EvolutionState } from './engine/evolution';
import type { BuildState } from './engine/absorb';

/** 옛 계통 → 속성 (계통 성향을 닮은 원소로 근사): A 공격 → 불, B 받는 피해 → 흙, C 속도 → 뇌, D 받는 피해 → 물, E 공격 → 혈 */
export const LEGACY_LINEAGE_ELEMENT: Readonly<Record<string, string>> = {
  'lineage-a': 'fire', 'lineage-b': 'earth', 'lineage-c': 'thunder', 'lineage-d': 'water', 'lineage-e': 'blood',
};

/** 옛 특성 id → 새 특성 id (같은 종류·역할·계열, 계통은 위 표의 속성으로) */
export const LEGACY_TRAIT_MAP: Readonly<Record<string, string>> = {
  'trait-a1': 't-fire-a', 'trait-a2': 't-fire-passive', 'trait-a3': 't-fire-part', 'trait-a4': 't-fire-rare', 'trait-a5': 't-fire-guard', 'trait-a6': 't-fire-b',
  'trait-b1': 't-earth-guard', 'trait-b2': 't-earth-passive', 'trait-b3': 't-earth-part', 'trait-b4': 't-earth-rare', 'trait-b5': 't-earth-heal', 'trait-b6': 't-earth-a', 'trait-b7': 't-earth-c',
  'trait-c1': 't-thunder-heal', 'trait-c2': 't-thunder-passive', 'trait-c3': 't-thunder-part', 'trait-c4': 't-thunder-rare', 'trait-c5': 't-thunder-c', 'trait-c6': 't-thunder-a',
  'trait-d1': 't-water-b', 'trait-d2': 't-water-passive', 'trait-d3': 't-water-part', 'trait-d4': 't-water-rare', 'trait-d5': 't-water-guard', 'trait-d6': 't-water-c',
  'trait-e1': 't-blood-guard', 'trait-e2': 't-blood-passive', 'trait-e3': 't-blood-part', 'trait-e4': 't-blood-rare', 'trait-e5': 't-blood-heal', 'trait-e6': 't-blood-a', 'trait-e7': 't-blood-b',
};

const KNOWN = new Set(TRAITS.map((t) => t.id));

/** 특성 id 하나를 지금 데이터로: 지금 있는 id 는 그대로, 옛 id 는 대응표, 모르는 id 는 null */
export function migrateTraitId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (KNOWN.has(id)) return id;
  const m = LEGACY_TRAIT_MAP[id];
  return m && KNOWN.has(m) ? m : null;
}

/** 빌드: 보유·슬롯의 옛 특성 id 를 바꾸고(겹치면 하나만), 장착 순서는 슬롯 순서로 채운다. 슬롯 칸 수는 그대로 */
export function migrateBuild(raw: Partial<BuildState> | undefined, slotCount: number): BuildState {
  const owned: string[] = [];
  for (const id of raw?.owned ?? []) {
    const m = migrateTraitId(id);
    if (m && !owned.includes(m)) owned.push(m);
  }
  const slots: (string | null)[] = [];
  for (const id of raw?.slots ?? []) {
    const m = migrateTraitId(id);
    slots.push(m && !slots.includes(m) ? m : null);
    if (m && !owned.includes(m)) owned.push(m);
  }
  while (slots.length < slotCount) slots.push(null);
  return { owned, slots, equipOrder: slots.filter((x): x is string => x !== null) };
}

/** 옛 진화체 id 의 첫 계통 → 속성 (예 "t4:triple@lineage-a+lineage-b+lineage-c" → fire). 계통이 없으면(기본형·균형형 등) 노멀 */
export function legacyFormElement(formId: string | null | undefined): string {
  const lin = formId?.split('@')[1]?.split('+')[0];
  return (lin && LEGACY_LINEAGE_ELEMENT[lin]) || 'normal';
}

/**
 * 진화 상태: 단계는 유지하고 진화 경로를 새 트리의 대응 형태로 (2·3단계 = base, 4단계 = 옛 4단계 진화체 첫 계통의 속성, 5단계 = 그 속성 × 지금 장착 최다 분류).
 * 옛 계통 누적은 버린다(노력치 0, 걸음 0부터). 고유 특성은 노력치가 없으므로 진화체 종족값 최고 능력치 방향
 */
export function migrateEvolution(old: { tierIndex?: number; formHistory?: string[]; formId?: string | null } | undefined, build: BuildState, factionId: string, seed: number): EvolutionState {
  const tierIndex = Math.max(0, Math.min(4, Math.floor(old?.tierIndex ?? 0)));
  const e = newEvolution(nextStageSeed(seed >>> 0, tierIndex));
  e.tierIndex = tierIndex;
  const oldHistory = old?.formHistory ?? [];
  const el4 = legacyFormElement(oldHistory[2] ?? (tierIndex === 3 ? old?.formId : null));
  const path = ['t2:base', 't3:base', `t4:${el4}`, `t5:${el4}:${dominantCategory(build, factionId)}`].slice(0, tierIndex);
  // 옛 5단계 트리의 id 그대로 둔다 — 형식 56 → 57(C.220, src/saveTier4.ts)이 새 4단계 트리로 옮긴다
  e.formHistory = path;
  e.formId = e.formHistory[e.formHistory.length - 1] ?? null;
  e.tierIndex = e.formHistory.length;
  const form = e.formId ? tryGetForm(e.formId) : undefined;
  e.ability = form ? abilityFor(e.ev, form) : null;
  return e;
}
