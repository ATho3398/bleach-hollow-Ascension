// 첫 플레이 튜토리얼 상태 머신 (GDD 14-2, C.19). DOM 에 의존하지 않는 순수 함수라 단위 테스트한다.
// 튜토리얼은 전투 엔진 시간을 멈추는 화면 쪽 덮개일 뿐이다: 엔진 상태·시드·입력 기록을 건드리지 않는다.

/** 세이브에 들어가는 도움말 플래그 (형식 11). 튜토리얼을 끝까지 보거나 건너뛰면 true.
 *  guides (형식 37, C.120 GDD 64·67장): 한 번만 뜨는 안내(첫 원정·타일)의 상태 — id → 'done'(봤다) / 'pending'(띄울 차례). 없으면 아직 아님 */
export interface HelpState {
  tutorialSeen: boolean;
  guides: Record<string, GuideMark>;
}

export type GuideMark = 'pending' | 'done';

/** 한 번만 뜨는 안내 id (GDD 64·67장, 74장 'birth', 123장 5 'recover'). 화면 문구는 src/data/help/guides.json */
/** 'home-intro' = 처음 켰을 때 홈 안내 → 첫 모험 강제 (GDD 131장, C.207). 새 세이브는 'first-run' 과 같이 pending */
/** 'recover-cure' = 회복 안내용 치료제를 이미 넣었다 (GDD 134장 1, C.211 — 시작 치료제와 따로 한 번만, 상태만 저장) */
export const GUIDE_IDS = ['first-run', 'first-run-room', 'tile-intro', 'tile-plan', 'tile-draw', 'birth', 'recover', 'home-intro', 'recover-cure'] as const;
export type GuideId = (typeof GUIDE_IDS)[number];
/** 문구가 있는 안내 (birth 는 첫 시작 탄생 연출 — 상태만 저장, 문구 없음. GDD 74장 C.126 · recover 는 튜토리얼 회복 안내 — 문구는 tutorial.json recover, GDD 123장 5 C.199) */
export type TextGuideId = Exclude<GuideId, 'birth' | 'recover' | 'home-intro' | 'recover-cure'>;

export function newHelpState(): HelpState {
  return { tutorialSeen: false, guides: {} };
}

/** 저장된 값이 깨졌거나 없으면 "아직 안 봄"으로 되돌린다 */
export function sanitizeHelpState(raw: unknown): HelpState {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as { tutorialSeen?: unknown; guides?: unknown };
  const guides: Record<string, GuideMark> = {};
  if (typeof r.guides === 'object' && r.guides !== null && !Array.isArray(r.guides)) {
    for (const [k, v] of Object.entries(r.guides as Record<string, unknown>)) if ((GUIDE_IDS as readonly string[]).includes(k) && (v === 'pending' || v === 'done')) guides[k] = v;
  }
  return { tutorialSeen: r.tutorialSeen === true, guides };
}

/** 첫 전투 직전에 자동으로 보여 줄까: 한 번만 */
export function shouldAutoShowTutorial(help: HelpState): boolean {
  return !help.tutorialSeen;
}

export function markTutorialSeen(help: HelpState): void {
  help.tutorialSeen = true;
}

/** 이 안내를 띄울 차례인가 (pending) */
export function guidePending(help: HelpState, id: GuideId): boolean {
  return help.guides[id] === 'pending';
}

/** 안내를 띄울 차례로 (이미 봤으면 그대로) */
export function queueGuide(help: HelpState, id: GuideId): void {
  if (help.guides[id] !== 'done') help.guides[id] = 'pending';
}

export function markGuideDone(help: HelpState, id: GuideId): void {
  help.guides[id] = 'done';
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
