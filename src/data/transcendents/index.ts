// 초월체 6종 (GDD 22-3, 종족 무관 공용 데이터). 이름·조건 수치는 provisional, 오리지널 3종 이름은 자리 표시. 외형은 그림 대기.
// 결정 규칙은 엔진(src/engine/transcend.ts)이 order 순서대로 조건을 본다 — 이 파일은 데이터와 검증만.
import { ATTACK_CATEGORIES, type AttackCategory } from '../schema';
import raw from './transcendents.json';

/** 초월체 조건: 합체 순간 두(모든) 캐릭터의 상태로 판정한다 */
export type TranscendentCondition =
  /** 모든 캐릭터의 환생 횟수 합이 min 이상 */
  | { type: 'rebirthSum'; min: number }
  /** 모든 캐릭터가 히든 진화체 */
  | { type: 'allHidden' }
  /** 모든 캐릭터의 속성이 겹친다 (모두가 가진 속성이 하나 이상) */
  | { type: 'sameElement' }
  /** 모든 캐릭터의 공격 분류가 이것 */
  | { type: 'allCategory'; category: AttackCategory }
  /** 그 밖 (늘 맞음) */
  | { type: 'otherwise' };

export interface TranscendentDef {
  id: string;
  /** 판정 순서 (작을수록 먼저). 조건 맞는 미보유가 없으면 미보유 중 큰 것부터 채운다 */
  order: number;
  name: string;
  concept: string;
  /** 오리지널(원작 밖) 초월체 */
  original?: boolean;
  condition: TranscendentCondition;
  provisional: true;
}

const TYPES = ['rebirthSum', 'allHidden', 'sameElement', 'allCategory', 'otherwise'];

export function parseTranscendent(r: unknown): TranscendentDef {
  const t = (r ?? {}) as Partial<TranscendentDef>;
  const c = (t.condition ?? {}) as Partial<{ type: string; min: number; category: string }>;
  const errors: string[] = [];
  if (typeof t.id !== 'string' || !t.id) errors.push('id');
  if (!Number.isInteger(t.order)) errors.push('order');
  if (typeof t.name !== 'string' || !t.name) errors.push('name');
  if (typeof t.concept !== 'string') errors.push('concept');
  if (!TYPES.includes(c.type as string)) errors.push('condition.type');
  if (c.type === 'rebirthSum' && !(Number.isInteger(c.min) && (c.min as number) > 0)) errors.push('condition.min');
  if (c.type === 'allCategory' && !(ATTACK_CATEGORIES as readonly string[]).includes(c.category as string)) errors.push('condition.category');
  if (t.provisional !== true) errors.push('provisional (22-3 수치·이름 provisional)');
  if (errors.length > 0) throw new Error(`초월체 데이터 오류 (${String(t.id ?? '?')}): ${errors.join(', ')}`);
  return t as TranscendentDef;
}

/** 판정 순서대로 */
export const TRANSCENDENTS: readonly TranscendentDef[] = (raw as unknown[]).map(parseTranscendent).sort((a, b) => a.order - b.order);

if (new Set(TRANSCENDENTS.map((t) => t.id)).size !== TRANSCENDENTS.length) throw new Error('초월체 id 가 겹친다');

export function tryGetTranscendent(id: string): TranscendentDef | undefined {
  return TRANSCENDENTS.find((t) => t.id === id);
}
