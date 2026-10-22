// 강적 조우 WARNING 경고의 판단 (GDD 76장, C.128): 어떤 전투에 띄우나·띠 색·시간·문구. DOM 이 없어 단위 테스트한다. 화면 = ui/warningView.ts
import { getElement } from '../data/elements';
import { getTile } from '../data/tiles';

export type WarningKind = 'elite' | 'boss';

/** 전투 직전 경고를 띄울까: 보스 → boss, 강적(강적 타일·조합·포식자 둥지 사냥꾼) → elite, 일반은 없음. 첫 원정 튜토리얼 적은 일반이라 해당 없다 */
export function warningKind(p: { boss?: string | null; elite: boolean; enemy: { class: string } }, tutorial = false): WarningKind | null {
  if (tutorial) return null;
  if (p.boss) return 'boss';
  return p.elite || p.enemy.class === 'elite' ? 'elite' : null;
}

/** 히든 속성(혈·독·허 — 특수 속성)인가 */
export function isHiddenElement(id: string): boolean {
  return getElement(id).kind === 'special';
}

/** 띠 색 토큰: 히든 속성이면 그 속성 색 토큰, 아니면 기본 경고색(--bha-attack) */
export function warningBandToken(elementId: string): string {
  return isHiddenElement(elementId) ? getElement(elementId).color : '--bha-attack';
}

/** 경고가 떠 있는 시간: 평소 약 1.5초, 동작 줄이기면 0.4초 정지 표시 */
export const WARNING_MS = 1500;
export const WARNING_REDUCED_MS = 400;
export const warningMs = (reduced: boolean): number => (reduced ? WARNING_REDUCED_MS : WARNING_MS);

/** 가운데 글: "강적 출현 — 이름" / "보스 출현 — 이름" */
export function warningLine(kind: WarningKind, name: string): string {
  return `${kind === 'boss' ? '보스' : '강적'} 출현 — ${name}`;
}

/** 걷는 중 다음 칸이 강적 칸인가 (타일로 미리 알 수 있을 때: 강적 소굴·포식자 둥지). 조합으로 강적이 되는 칸은 미리 알 수 없어 제외 */
export function nextCellIsElite(exp: { pos: number; slots: (string | null)[] }): boolean {
  const next = (exp.pos + 1) % Math.max(1, exp.slots.length);
  const id = exp.slots[next] ?? null;
  if (id === null) return false;
  const e = getTile(id).effect;
  return e.type === 'spawn' && e.enemyClass === 'elite';
}
