// 물건 획득 알림 규칙 (GDD 161장, C.239): 소모품·일반 장비·일반 물건은 얻어도 노란 알림(토스트)을 띄우지 않는다.
// 가방(보관함)에는 그대로 들어가고, 결과 화면 목록 같은 기록 화면도 그대로다.
// 남기는 알림: 진화·승급·도감 목표 달성·새 장소/트랙 열림 같은 진행 알림, 경고(저장 공간·보관함 가득 등), 내가 누른 행동의 결과(구매·장착·사용).
import { GEAR_GRADES, type GearGrade } from '../data/gear';

export const NOTIFY = {
  /** 장비 획득 알림을 띄울 최소 등급 (161장 2번). null = 어떤 등급도 안 띄움 (지금). 나중에 높은 등급만 알리려면 'legendary' 처럼 적는다 */
  gearToastMinGrade: null as GearGrade | null,
  /** 튜토리얼 목표 달성 보상 알림 (161장 1번: 첫 모험 출발 직후 뜨던 '튜토리얼 달성 — 보상 주먹밥 3 · 영옥 1'). 목표·보상은 책장 > 튜토리얼에서 본다 */
  tutorialGoalToast: false,
  /** 보상 알림(도감 목표 달성)에 소모품(먹이)을 적는가 (161장 1번). 알림은 남기고 소모품 줄만 뺀다 */
  consumablesInRewardToast: false,
} as const;

/** 이 등급 장비를 얻었을 때 알림을 띄우나 */
export function gearToastWanted(grade: GearGrade, minGrade: GearGrade | null = NOTIFY.gearToastMinGrade): boolean {
  return minGrade !== null && GEAR_GRADES.indexOf(grade) >= GEAR_GRADES.indexOf(minGrade);
}
