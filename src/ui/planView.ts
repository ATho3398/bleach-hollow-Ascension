// 카드 배치 단계 (GDD 17-1): 원정을 시작하기 직전, 덱의 지형 타일을 12칸 길에 놓는다. 길 순서가 보이는 두 곳 중 하나(다른 하나는 바퀴 끝 팝업).
// 엔진 상태는 이 화면이 닫힐 때까지 저장하지 않는다 — 취소하면 이어하던 원정은 그대로 남는다.
import { beginPlanning, finishPlanning, type ExpeditionState } from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import { tileName } from '../data/tiles';
import { button, el, icon, mountApp } from './bha/dom';
import { roadPlanner } from './bha/road';

export interface PlanViewHandlers {
  /** [출발]: 배치가 끝났다 (손은 이미 비웠다). 원정 시작 */
  onStart: (placed: number) => void;
  onHelp: () => void;
}

export function planView(root: HTMLElement, faction: FactionConfig, exp: ExpeditionState, h: PlanViewHandlers): void {
  beginPlanning(exp);
  const planner = roadPlanner({ exp, tileName: (id) => tileName(id, faction.id) });

  const title = el('h2', 'bha-plan__title');
  title.append(icon('i-deck'), `${faction.huntingGroundName} — 길에 타일 놓기`);
  const help = button({ label: '도움말', icon: 'i-help', iconOnly: true, variant: 'ghost', size: 'small', onClick: h.onHelp });
  const head = el('div', 'bha-exp__head');
  head.append(title, help);

  const start = button({
    label: '출발', icon: 'i-play', variant: 'primary', size: 'lg',
    onClick: () => h.onStart(finishPlanning(exp)),
  });
  start.dataset.sc = 'go';
  const sub = el('p', 'bha-plan__sub', '덱의 타일을 길 위의 칸에 놓는다. 안 놓은 칸에는 떠돌이 적이 나온다. [출발]을 누르기 전에는 놓은 타일을 눌러 고친다: 선택한 뒤 빈 칸을 누르면 이동, 다른 놓은 타일을 누르면 서로 교체, 같은 칸을 다시 누르면 손으로 돌아온다.');
  const main = mountApp(root, { fixed: true, cls: 'bha-plan' }, head, sub, planner.el, start);
  main.dataset.screen = 'expedition-plan';
}
