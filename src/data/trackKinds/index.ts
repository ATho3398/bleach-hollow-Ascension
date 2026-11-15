// 트랙 종류 설정 (GDD 12-1·12-4, C.429): 한 슬롯의 캐릭터 트랙이 무엇을 하고 무엇을 안 하는지. 종족 설정과 같은 방식 — 이 폴더의 *.json 을 빌드 때 모은다.
// 엔진은 트랙 종류 id·초월자 id 로 가르지 않고 이 플래그만 읽는다 (CLAUDE.md 2번). 호로·사신 = character, 초월자 = transcendent(초월자 데이터의 trackKind).
// 새 종류는 json 하나로 추가된다. 필수 필드 누락·id 중복은 파일 이름과 함께 멈춘다.

export interface TrackKindConfig {
  id: string;
  /** 플레이어에게 보이는 종류 이름 (전환 메뉴·이름표). '트랙'이라는 말은 쓰지 않는다 (GDD 12-1) */
  label: string;
  /** 진화 판정을 하나 (false = 진화 없음 — 걸음 수·임박 알림도 없음) */
  evolution: boolean;
  /** 부활할 때 진화를 초기화하나 (false = 퇴화 없음, 진화체 그대로) */
  devolution: boolean;
  /** 접속 안 한 시간·방에 둔 시간에 배부름·컨디션·교감이 줄고 쇠약·빈사가 오나 (false = 수치가 안 닳는다, GDD 12-4) */
  timeDecay: boolean;
  /** 돌봄 요청(쓰다듬기·재우기 배지)이 생기나 */
  careRequests: boolean;
  /** 등급전(번호 쟁탈전·진급 시험) */
  rank: boolean;
  /** 스토리 */
  story: boolean;
  /** 환생 */
  rebirth: boolean;
  /** 합체 재료·두 번째 캐릭터 개방 셈에 드나 */
  fusion: boolean;
  /** 원정 난이도 ★ 전부 열림 */
  allDifficulties: boolean;
  /** 막힌 메뉴를 눌렀을 때 이유 한 줄 */
  lockedReason?: string;
  provisional?: boolean;
}

const BOOLS = ['evolution', 'devolution', 'timeDecay', 'careRequests', 'rank', 'story', 'rebirth', 'fusion', 'allDifficulties'] as const;

export function parseTrackKind(r: unknown): TrackKindConfig {
  const t = (r ?? {}) as Partial<Record<string, unknown>>;
  const errors: string[] = [];
  if (typeof t.id !== 'string' || !t.id) errors.push('id');
  if (typeof t.label !== 'string' || !t.label) errors.push('label');
  for (const k of BOOLS) if (typeof t[k] !== 'boolean') errors.push(k);
  if (t.lockedReason !== undefined && typeof t.lockedReason !== 'string') errors.push('lockedReason');
  if (errors.length > 0) throw new Error(`필수 필드 누락·형식 오류: ${errors.join(', ')}`);
  return t as unknown as TrackKindConfig;
}

export function collectTrackKinds(mods: Record<string, { default: unknown }>): TrackKindConfig[] {
  const list = Object.keys(mods).sort().map((path) => {
    try {
      return parseTrackKind(mods[path]!.default);
    } catch (e) {
      throw new Error(`트랙 종류 설정 ${path}: ${(e as Error).message}`);
    }
  });
  if (new Set(list.map((k) => k.id)).size !== list.length) throw new Error('트랙 종류 id 가 겹친다');
  return list;
}

export const TRACK_KINDS: readonly TrackKindConfig[] = collectTrackKinds(import.meta.glob<{ default: unknown }>('./*.json', { eager: true }));

/** 기본 종류 = 호로·사신 같은 캐릭터 (초월자가 아닌 트랙) */
export const DEFAULT_TRACK_KIND = 'character';

export function getTrackKind(id: string): TrackKindConfig {
  const k = TRACK_KINDS.find((x) => x.id === id) ?? TRACK_KINDS.find((x) => x.id === DEFAULT_TRACK_KIND);
  if (!k) throw new Error(`트랙 종류 설정이 없다: ${id}`);
  return k;
}
