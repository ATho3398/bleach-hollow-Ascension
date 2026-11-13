// 붕옥 개발 표시 데이터 (GDD 12-2·12-3 v6.015, C.425 provisional): 재료·강화 트랙·단계 이름. 두 종족 공통(슬롯 공유)이라 종족 설정이 아니라 여기 둔다.
// 키 = 강화 트랙 id(BALANCE.provisional.hogyoku.trackCost 키). 세이브 키(shared.soulCrystals·hogyokuShards·resonanceEssence)는 옛 이름 그대로 — 이름만 여기서 바꾼다.
// 수치는 BALANCE.provisional.hogyoku·hogyokuDrops — 이 파일은 이름만.
import type { AttackCategory } from '../schema';
import type { TranscendentCombo } from '../transcendents';
import type { HogyokuTrackId } from '../../engine/transcend';

/** 붕옥 재료 이름 (사용자 2026-11-12): soul 고순도 윤활제(세공용) · shard 혼백 여과기(정제용) · essence 영압 결정(주입용) */
export const HOGYOKU_MATERIAL_NAMES: Readonly<Record<HogyokuTrackId, string>> = { soul: '고순도 윤활제', shard: '혼백 여과기', essence: '영압 결정' };
/** 강화 트랙 이름 (사용자 2026-11-12): 세공 · 정제 · 주입 */
export const HOGYOKU_TRACK_NAMES: Readonly<Record<HogyokuTrackId, string>> = { soul: '세공', shard: '정제', essence: '주입' };
/** 얻는 곳 한 줄 (GDD 12-3 v6.015: 사냥 + 우라하라뿐) */
export const HOGYOKU_MATERIAL_SOURCE = '사냥(모험 전투 승리 드롭 — 강적·보스는 확정) · 우라하라 · 특수던전(주간던전·보스전)';

/** 개발 단계 이름 (i = 개발 % (i+1)×10% 구간). provisional */
export const HOGYOKU_STEP_NAMES: readonly string[] = [
  '미약한 맥동', '금 간 껍질', '깨어나는 핵', '영압 흡수', '반쪽의 각성',
  '두 영압의 공명', '경계 융해', '의지의 발아', '초월의 문턱', '완전 각성',
];

/** 붕옥 상태 이름 (GDD 244장 2, 안 B 단계 띠) */
export const HOGYOKU_STAGE_NAMES = { half: '반각성', resonance: '공명', ready: '합체 가능' } as const;

/** 진화체 공격 분류 쉬운 말 (GDD 137장 1 — 블록 이름 대신) */
export const ATTACK_CATEGORY_WORDS: Readonly<Record<AttackCategory, string>> = { physical: '물리', special: '특수', mixed: '혼합' };

/** 초월자 조합 한 줄 (GDD 12-4 v6.037): "두 캐릭터 진화체 분류 물리 + 특수" */
export function transcendentComboText(c: TranscendentCombo): string {
  return `두 캐릭터 진화체 분류 ${ATTACK_CATEGORY_WORDS[c[0]]} + ${ATTACK_CATEGORY_WORDS[c[1]]}`;
}
