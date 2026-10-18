// 첫 플레이 튜토리얼 상태 머신 (GDD 14-2, C.19). DOM 에 의존하지 않는 순수 함수라 단위 테스트한다.
// 튜토리얼은 전투 엔진 시간을 멈추는 화면 쪽 덮개일 뿐이다: 엔진 상태·시드·입력 기록을 건드리지 않는다.

/** 세이브에 들어가는 도움말 플래그 (형식 11). 튜토리얼을 끝까지 보거나 건너뛰면 true */
export interface HelpState {
  tutorialSeen: boolean;
}

export function newHelpState(): HelpState {
  return { tutorialSeen: false };
}

/** 저장된 값이 깨졌거나 없으면 "아직 안 봄"으로 되돌린다 */
export function sanitizeHelpState(raw: unknown): HelpState {
  const seen = typeof raw === 'object' && raw !== null && (raw as { tutorialSeen?: unknown }).tutorialSeen === true;
  return { tutorialSeen: seen };
}

/** 첫 전투 직전에 자동으로 보여 줄까: 한 번만 */
export function shouldAutoShowTutorial(help: HelpState): boolean {
  return !help.tutorialSeen;
}

export function markTutorialSeen(help: HelpState): void {
  help.tutorialSeen = true;
}

export type TutorialStatus = 'active' | 'completed' | 'skipped';

export interface TutorialState {
  /** 지금 장면 번호 (0부터) */
  index: number;
  count: number;
  status: TutorialStatus;
}

/** 처음부터 시작(다시 보기도 같다). 장면이 없으면 곧바로 끝난 상태 */
export function startTutorial(count: number): TutorialState {
  return { index: 0, count, status: count > 0 ? 'active' : 'completed' };
}

export function isTutorialActive(s: TutorialState): boolean {
  return s.status === 'active';
}

/** 다음 장면. 마지막 장면에서 누르면 끝(completed) */
export function tutorialNext(s: TutorialState): TutorialState {
  if (s.status !== 'active') return s;
  return s.index + 1 >= s.count ? { ...s, status: 'completed' } : { ...s, index: s.index + 1 };
}

export function tutorialPrev(s: TutorialState): TutorialState {
  if (s.status !== 'active') return s;
  return { ...s, index: Math.max(0, s.index - 1) };
}

export function tutorialSkip(s: TutorialState): TutorialState {
  return s.status === 'active' ? { ...s, status: 'skipped' } : s;
}

/** 화면 프레임 하나가 엔진에 줄 틱 수. 멈춰 있으면(일시정지·튜토리얼·도움말) 시간이 쌓이지도 않는다 → 멈춤이 전투 결과에 영향을 주지 않는다 */
export function frameTicks(acc: number, dtMs: number, speed: number, tickMs: number, halted: boolean, maxTicks = 40): { acc: number; ticks: number } {
  if (halted) return { acc, ticks: 0 };
  let a = acc + dtMs * speed;
  let ticks = 0;
  while (a >= tickMs && ticks < maxTicks) {
    a -= tickMs;
    ticks++;
  }
  return { acc: a, ticks };
}
