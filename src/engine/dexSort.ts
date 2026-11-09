// 도감 정렬 (GDD 220장 2): 진화체 도감·적 도감 목록 위 정렬 버튼 — 누를 때마다 다음 기준. 고른 기준은 세이브(dexSort)에 남는다.
// 미발견은 어느 기준이든 맨 뒤(그 안은 기본 순서). 같은 값끼리는 기본 순서(안정 정렬). 종족 무관 — 이름·속성 순서는 부르는 쪽이 넘긴다.

export const FORM_DEX_SORTS = ['default', 'name', 'element', 'found'] as const;
export const ENEMY_DEX_SORTS = ['default', 'name', 'element', 'kind', 'kills'] as const;
export type FormDexSort = (typeof FORM_DEX_SORTS)[number];
export type EnemyDexSort = (typeof ENEMY_DEX_SORTS)[number];
export type DexSortKey = FormDexSort | EnemyDexSort;

/** 정렬 버튼에 보이는 기준 이름 */
export const DEX_SORT_LABEL: Record<DexSortKey, string> = { default: '기본', name: '이름', element: '속성', found: '발견 순', kind: '종류', kills: '많이 잡은 순' };

/** 세이브의 도감 정렬 기준 (형식 68) */
export interface DexSortState {
  forms: FormDexSort;
  enemies: EnemyDexSort;
}

export const newDexSortState = (): DexSortState => ({ forms: 'default', enemies: 'default' });

/** 세이브 보정: 모르는 값은 기본 */
export function sanitizeDexSort(raw: unknown): DexSortState {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    forms: (FORM_DEX_SORTS as readonly unknown[]).includes(r.forms) ? (r.forms as FormDexSort) : 'default',
    enemies: (ENEMY_DEX_SORTS as readonly unknown[]).includes(r.enemies) ? (r.enemies as EnemyDexSort) : 'default',
  };
}

/** 다음 기준 (마지막 다음은 처음) */
export function nextDexSort<K extends DexSortKey>(list: readonly K[], cur: K): K {
  const i = list.indexOf(cur);
  return list[(i + 1) % list.length]!;
}

/** 정렬에 쓰는 값 한 묶음. element·kind·found = 작을수록 앞(없으면 Infinity), kills = 클수록 앞 */
export interface DexSortFacts {
  known: boolean;
  name: string;
  element: number;
  kind?: number;
  kills?: number;
  /** 발견 순서 (먼저 발견한 것이 작다) */
  found?: number;
  /** 기본 정렬의 묶음 (진화체 = 단계, 적 = 종류): 기본 정렬에서는 미발견도 자기 묶음 맨 뒤 — 머리줄('아쥬커스 2/7')이 한 번씩만 */
  group?: number;
}

/** items 는 기본 순서로 넘긴다. 미발견은 맨 뒤(기본 정렬은 묶음 안 맨 뒤), 같은 값은 기본 순서 */
export function sortDex<T>(items: readonly T[], key: DexSortKey, facts: (t: T) => DexSortFacts): T[] {
  const rows = items.map((t, i) => ({ t, i, f: facts(t) }));
  const num = (v: number | undefined): number => (v === undefined || Number.isNaN(v) ? Infinity : v);
  const cmp = (a: (typeof rows)[number], b: (typeof rows)[number]): number => {
    if (key === 'default' && (a.f.group ?? 0) !== (b.f.group ?? 0)) return cmpNum(a.f.group ?? 0, b.f.group ?? 0);
    if (a.f.known !== b.f.known) return a.f.known ? -1 : 1;
    if (!a.f.known) return 0;
    switch (key) {
      case 'name': return a.f.name.localeCompare(b.f.name, 'ko');
      case 'element': return cmpNum(num(a.f.element), num(b.f.element));
      case 'kind': return cmpNum(num(a.f.kind), num(b.f.kind));
      case 'kills': return cmpNum(-(a.f.kills ?? 0), -(b.f.kills ?? 0));
      case 'found': return cmpNum(num(a.f.found), num(b.f.found));
      default: return 0;
    }
  };
  return rows.sort((a, b) => cmp(a, b) || a.i - b.i).map((r) => r.t);
}

function cmpNum(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}
