// 초월자 6종 (GDD 22-3, 종족 무관 공용 데이터). 이름·조건 수치는 provisional, 오리지널 3종 이름은 자리 표시. 외형은 그림 대기.
// 결정 규칙(GDD 12-4 v6.037) = 두 캐릭터 진화체 분류 조합(combo) 하나에 초월자 하나 — 엔진(src/engine/transcend.ts)이 조합만 본다. 이 파일은 데이터와 검증만.
import { ATTACK_CATEGORIES, type AttackCategory } from '../schema';
import raw from './transcendents.json';

/** 초월자 결정 조합 (GDD 12-4 v6.037): 두 캐릭터 진화체 공격 분류(물리·특수·혼합) 한 쌍 — 순서 무관. 6가지 조합에 초월자 하나씩 */
export type TranscendentCombo = readonly [AttackCategory, AttackCategory];

/** 순서 무관 조합 키 (분류 이름 순) */
export function comboKey(a: AttackCategory, b: AttackCategory): string {
  return [a, b].sort().join('+');
}

export interface TranscendentDef {
  id: string;
  /** 도감 순서 (작을수록 앞) */
  order: number;
  name: string;
  concept: string;
  /** 오리지널(원작 밖) 초월자 */
  original?: boolean;
  /** 캐릭터 그림 키 (GDD 12-4, C.430): public/art/<키의 . → ->/idle-n 프레임 — 초월자 트랙의 방·상태·전투 몸, 도감·합체 결과 그림. 없으면 자리 표시 */
  art?: string;
  /** 이름 글리치 (GDD 12-4 v6.027, C.430): 화면에 찍히는 이름 일부가 잠깐씩 깨진 글자로 바뀐다. 저장값·읽기 이름은 원래 이름 */
  nameGlitch?: boolean;
  /** 자기 방 (GDD 12-4 v6.032, C.432): 방 목록(src/data/rooms)의 방 키. 없으면 바탕 종족 방 */
  room?: string;
  /** 만든 모델 (GDD 12-4 v6.029, C.431): glitchMosaic = 게임의 캐릭터·적 도트 그림에서 사각 조각을 잘라 모은 네모 도트 하나(시드 고정 기본 모습) + 조각 글리치.
   *  tile = 조각 한 변(64칸 기준 원본 화소), grid = [가로, 세로] 조각 수, scale = 화면 표시 배율(GDD 12-4 v6.037 '지금의 2/3', 없으면 1) */
  model?: { kind: 'glitchMosaic'; seed: number; tile: number; grid: [number, number]; scale?: number };
  /** 이 초월자가 나오는 두 캐릭터 진화체 분류 조합 (GDD 12-4 v6.037, provisional 대응) */
  combo: TranscendentCombo;
  /** 합체 뒤 이 초월자 트랙의 종류 (GDD 12-4 v6.028 — src/data/trackKinds/<id>.json: 진화 없음·시간 감소 없음 등) */
  trackKind: string;
  provisional: true;
}

export function parseTranscendent(r: unknown): TranscendentDef {
  const t = (r ?? {}) as Partial<TranscendentDef>;
  const errors: string[] = [];
  if (typeof t.id !== 'string' || !t.id) errors.push('id');
  if (!Number.isInteger(t.order)) errors.push('order');
  if (typeof t.name !== 'string' || !t.name) errors.push('name');
  if (typeof t.concept !== 'string') errors.push('concept');
  const combo = t.combo as unknown;
  if (!(Array.isArray(combo) && combo.length === 2 && combo.every((c) => (ATTACK_CATEGORIES as readonly string[]).includes(c as string)))) errors.push('combo (물리·특수·혼합 두 개)');
  if (typeof t.trackKind !== 'string' || !t.trackKind) errors.push('trackKind');
  if (t.art !== undefined && (typeof t.art !== 'string' || !t.art.startsWith('char.'))) errors.push('art (char.<이름>)');
  if (t.nameGlitch !== undefined && typeof t.nameGlitch !== 'boolean') errors.push('nameGlitch');
  if (t.room !== undefined && (typeof t.room !== 'string' || !t.room)) errors.push('room');
  const m = t.model as Partial<NonNullable<TranscendentDef['model']>> | undefined;
  if (m !== undefined && !(m.kind === 'glitchMosaic' && Number.isInteger(m.seed) && Number.isInteger(m.tile) && (m.tile as number) > 0
    && Array.isArray(m.grid) && m.grid.length === 2 && m.grid.every((v) => Number.isInteger(v) && v > 0)
    && (m.scale === undefined || (typeof m.scale === 'number' && m.scale > 0 && m.scale <= 2)))) errors.push('model (glitchMosaic seed·tile·grid·scale)');
  if (t.provisional !== true) errors.push('provisional (22-3 수치·이름 provisional)');
  if (errors.length > 0) throw new Error(`초월자 데이터 오류 (${String(t.id ?? '?')}): ${errors.join(', ')}`);
  return t as TranscendentDef;
}

/** 도감 순서대로 */
export const TRANSCENDENTS: readonly TranscendentDef[] = (raw as unknown[]).map(parseTranscendent).sort((a, b) => a.order - b.order);

if (new Set(TRANSCENDENTS.map((t) => t.id)).size !== TRANSCENDENTS.length) throw new Error('초월자 id 가 겹친다');
if (new Set(TRANSCENDENTS.map((t) => comboKey(t.combo[0], t.combo[1]))).size !== TRANSCENDENTS.length) throw new Error('초월자 조합이 겹친다 (조합 하나에 초월자 하나)');

export function tryGetTranscendent(id: string): TranscendentDef | undefined {
  return TRANSCENDENTS.find((t) => t.id === id);
}
