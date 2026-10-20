// 카드 배치 단계 (GDD 17-1): 원정을 시작하기 직전, 덱의 지형 타일을 12칸 길에 놓는다. 길 순서가 보이는 두 곳 중 하나(다른 하나는 바퀴 끝 팝업).
// 엔진 상태는 이 화면이 닫힐 때까지 저장하지 않는다 — 취소하면 이어하던 원정은 그대로 남는다.
import { beginPlanning, chooseGround, finishPlanning, type ExpeditionState } from '../engine/expedition';
import { groundName, type FactionConfig } from '../engine/faction';
import { GROUNDS, type GroundDef } from '../data/grounds';
import { elementName } from '../data/elements';
import { synergyName, tileName } from '../data/tiles';
import { button, el, icon, mountApp } from './bha/dom';
import { roadPlanner } from './bha/road';
import { departTabs } from './storyView';

export interface PlanViewHandlers {
  /** [출발]: 배치가 끝났다 (손은 이미 비웠다). 원정 시작 */
  onStart: (placed: number) => void;
  onHelp: () => void;
  /** [스토리] 탭 (GDD 25-7): 있으면 머리에 [자유 원정]/[스토리] 탭을 보인다 */
  onStory?: () => void;
}

/** 사냥터 한 줄 설명: 종족 설정 설명 + 자주 나오는 속성 + 적 강도 (데이터에서 조합, GDD 24-2) */
export function groundInfo(faction: FactionConfig, g: GroundDef): string {
  const els = g.elements.map((id) => elementName(id, faction.id)).join('·');
  const hp = Math.round(g.strength.hp * 100);
  const atk = Math.round(g.strength.attack * 100);
  const desc = faction.huntingGrounds?.[g.id]?.desc;
  return `${desc ? `${desc} ` : ''}자주 나오는 속성 ${els}${hp !== 100 || atk !== 100 ? ` · 적 체력 ${hp}%·공격 ${atk}%` : ''}`;
}

export function planView(root: HTMLElement, faction: FactionConfig, exp: ExpeditionState, tierIndex: number, h: PlanViewHandlers): void {
  beginPlanning(exp);
  const planner = roadPlanner({ exp, tileName: (id) => tileName(id, faction.id), synergyName: (id) => synergyName(id, faction.id) });

  const title = el('h2', 'bha-plan__title');
  title.append(icon('i-deck'), '길에 타일 놓기');

  // 사냥터 고르기 (GDD 24-2): 열린 곳만 고를 수 있고, 잠긴 곳은 열리는 단계를 보인다
  const grounds = el('div', 'bha-plan__grounds');
  grounds.setAttribute('role', 'group');
  grounds.setAttribute('aria-label', '사냥터');
  const gInfo = el('p', 'bha-plan__sub');
  const gBtns = GROUNDS.map((g, i) => {
    const open = tierIndex >= g.unlockTierIndex;
    const b = button({ label: groundName(faction, g.id, i), icon: open ? undefined : 'i-lock', size: 'small', disabled: !open, onClick: () => pick(g) });
    if (!open) b.title = `${g.unlockTierIndex + 1}단계(${faction.tierNames[g.unlockTierIndex] ?? ''})에 열린다`;
    b.dataset.ground = g.id;
    return b;
  });
  const pick = (g: GroundDef) => {
    chooseGround(exp, g.id);
    gBtns.forEach((b, i) => {
      const on = GROUNDS[i]!.id === g.id;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    gInfo.textContent = `${groundName(faction, g.id, GROUNDS.indexOf(g))}: ${groundInfo(faction, g)}`;
  };
  grounds.append(...gBtns);
  pick(GROUNDS.find((g) => g.id === exp.groundId) ?? GROUNDS[0]!);
  const help = button({ label: '도움말', icon: 'i-help', iconOnly: true, variant: 'ghost', size: 'small', onClick: h.onHelp });
  const head = el('div', `bha-exp__head${h.onStory ? ' bha-depart-head' : ''}`);
  // [자유 원정]/[스토리] 탭이 있으면 제목 자리를 대신한다 (머리 한 줄 높이를 지킨다)
  head.append(h.onStory ? departTabs('free', () => h.onStory!()) : title, grounds, help);

  const start = button({
    label: '출발', icon: 'i-play', variant: 'primary', size: 'lg',
    onClick: () => h.onStart(finishPlanning(exp)),
  });
  start.dataset.sc = 'go';
  // 한 줄 설명: 고른 사냥터(이름·설명·자주 나오는 속성·강도) + 배치 요령 (화면 높이가 낮아 두 줄 안에 둔다)
  const sub = el('p', 'bha-plan__sub', '덱의 타일을 길 위 칸에 놓는다. 안 놓은 칸에는 떠돌이 적이 나온다. 붙여 놓으면 시너지가 생긴다. 놓은 타일을 누른 뒤 빈 칸 = 이동, 다른 타일 = 교체, 같은 칸 = 손으로.');
  const main = mountApp(root, { fixed: true, cls: 'bha-plan' }, head, gInfo, sub, planner.el, start);
  main.dataset.screen = 'expedition-plan';
}
