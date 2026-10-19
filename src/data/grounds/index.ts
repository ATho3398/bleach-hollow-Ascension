// 사냥터 (GDD 24-2, 수치 provisional). 종족 무관 데이터 — 사냥터를 늘리려면 grounds.json 에 한 항목만 더하고 종족 설정 huntingGrounds 에 이름을 넣는다.
// 엔진(enemyPool·원정)은 id 로 분기하지 않고 여기 값(주 속성·가중치·강도 배율·먹이 표)만 읽는다. 첫 항목이 기본 사냥터(옛 세이브·이어하기 기본값).
import { BALANCE } from '../../config/balance';
import { FOOD_IDS } from '../../engine/faction';
import { isElement } from '../elements';
import raw from './grounds.json';

/** 전투 먹이 드롭 표 (GDD 23-1 과 같은 꼴). 없으면 BALANCE.provisional.food 기본값 */
export interface GroundFoodTable {
  normalDropChance: number;
  normalTable: Record<string, number>;
  eliteExtraChance: number;
  eliteTable: Record<string, number>;
}

export interface GroundDef {
  id: string;
  /** 이 진화 단계(tierIndex, 0 = 1단계)에 닿으면 열린다 */
  unlockTierIndex: number;
  /** 자주 나오는 속성 2~3종: 출현 풀에서 이 속성 적의 가중치에 elementWeight 를 곱한다 */
  elements: string[];
  elementWeight: number;
  /** 적 체력·공격 배율 (바퀴 강화에 곱한다) */
  strength: { hp: number; attack: number };
  food: GroundFoodTable;
}

const isPos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

function foodTableOk(t: unknown): boolean {
  if (typeof t !== 'object' || t === null) return false;
  const entries = Object.entries(t as Record<string, unknown>);
  return entries.length > 0 && entries.every(([k, v]) => (FOOD_IDS as readonly string[]).includes(k) && isPos(v));
}

export function parseGround(r: unknown): GroundDef {
  const g = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof g.id !== 'string' || !g.id) errors.push('id');
  if (!Number.isInteger(g.unlockTierIndex) || (g.unlockTierIndex as number) < 0) errors.push('unlockTierIndex: 0 이상 정수');
  if (!Array.isArray(g.elements) || g.elements.length < 2 || g.elements.length > 3 || !g.elements.every(isElement)) errors.push('elements: 있는 속성 2~3개');
  if (!isPos(g.elementWeight) || (g.elementWeight as number) < 1) errors.push('elementWeight: 1 이상');
  const st = (g.strength ?? {}) as Record<string, unknown>;
  if (!isPos(st.hp) || !isPos(st.attack)) errors.push('strength: { hp, attack } 양수');
  const DF = BALANCE.provisional.food;
  const f = (g.food ?? { normalDropChance: DF.normalDropChance, normalTable: DF.normalTable, eliteExtraChance: DF.eliteExtraChance, eliteTable: DF.eliteTable }) as Record<string, unknown>;
  const chance = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1;
  if (!chance(f.normalDropChance) || !chance(f.eliteExtraChance)) errors.push('food.*Chance: 0~1');
  if (!foodTableOk(f.normalTable) || !foodTableOk(f.eliteTable)) errors.push('food.*Table: { 먹이 종류: 양수 가중치 }');
  if (errors.length > 0) throw new Error(`사냥터 데이터 오류 (${String(g.id ?? '?')}): ${errors.join(', ')}`);
  return {
    id: g.id as string, unlockTierIndex: g.unlockTierIndex as number, elements: [...(g.elements as string[])], elementWeight: g.elementWeight as number,
    strength: { hp: st.hp as number, attack: st.attack as number }, food: f as unknown as GroundFoodTable,
  };
}

export function parseGrounds(list: unknown): GroundDef[] {
  if (!Array.isArray(list) || list.length === 0) throw new Error('사냥터 데이터 오류: 사냥터 1곳 이상');
  const out = list.map(parseGround);
  const ids = new Set(out.map((g) => g.id));
  if (ids.size !== out.length) throw new Error('사냥터 데이터 오류: id 가 겹친다');
  if (out[0]!.unlockTierIndex !== 0) throw new Error('사냥터 데이터 오류: 첫 사냥터(기본)는 처음부터 열려 있어야 한다 (unlockTierIndex 0)');
  return out;
}

export const GROUNDS: readonly GroundDef[] = parseGrounds(raw.grounds);
export const GROUNDS_PROVISIONAL: boolean = raw.provisional;
/** 기본 사냥터 (첫 항목) */
export const DEFAULT_GROUND_ID: string = GROUNDS[0]!.id;

export function getGround(id: string | undefined): GroundDef {
  return GROUNDS.find((g) => g.id === id) ?? GROUNDS[0]!;
}

export function isGroundId(id: unknown): id is string {
  return typeof id === 'string' && GROUNDS.some((g) => g.id === id);
}

/** 이 진화 단계에서 열린 사냥터 (데이터 순서) */
export function openGrounds(tierIndex: number): GroundDef[] {
  return GROUNDS.filter((g) => tierIndex >= g.unlockTierIndex);
}
