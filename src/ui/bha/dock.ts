// 홈 하단 독 (GDD 18-2, 18-9): 돌보기 3개(먹이·재우기·교감, 효과 있는 버튼) + [더보기 ⋯] 하나. 메뉴는 전부 더보기 안 아이콘+이름 격자.
// 먹이·더보기를 누르면 독 바로 위에 칸이 펼쳐진다(장면 위에 겹침, 장면 크기는 그대로). 먹이 종류를 하나 고르면 바로 먹는다.
// 먹이는 개수제(GDD 23-1): 칸마다 보유 개수, 0개는 비활성.
import { FOOD_IDS, NEST_ACTIONS, type FactionConfig, type FoodId, type NestAction } from '../../engine/faction';
import { foodEffect } from '../../engine/nest';
import { button, el, icon, provisionalTag } from './dom';
import { CLOSED, togglePanel, type DockPanel } from './dockLogic';
import { registerCancelHook } from './shortcuts';

export interface DockMenuItem {
  label: string;
  icon: string;
  onClick: () => void;
}

export interface DockOpts {
  faction: FactionConfig;
  /** 돌보기 실행 (먹이는 고른 종류와 함께) */
  onCare: (action: NestAction, food?: FoodId) => void;
  /** 먹이 종류별 보유 개수 (GDD 23-1): 먹이 칸에 개수를 보이고 0개는 비활성 */
  foodCount: (food: FoodId) => number;
  /** 먹이 한도 (GDD 109장 6): 지금 더 먹일 수 있는 개수와 한도. 먹이 버튼 옆에 작게 '2/3' */
  feedsLeft?: () => { left: number; max: number };
  /** 더보기 격자에 펼치는 항목 (아이콘 + 짧은 이름, 이 순서대로) */
  more: DockMenuItem[];
  /** 대기 보상 시계 버튼 (GDD 98장 A3): ⋯ 옆, 글자 없음, 쌓인 시간은 작은 배지. 누르면 대기 보상 창 */
  idle?: { badge: string | null; onOpen: () => void };
  /** 펼침 상태가 바뀌어 선택 가능 항목이 달라졌을 때 */
  onItemsChange: () => void;
}

export interface Dock {
  root: HTMLElement;
  /** 지금 누를 수 있는 항목 순서 (펼친 칸 → 돌보기 → 더보기) */
  items: () => HTMLElement[];
  panel: () => DockPanel;
  close: () => void;
  /** 돌봄 요청 강조 (GDD 82장): 캐릭터가 청한 돌보기 버튼만 강조, null 이면 모두 해제 */
  setRequest: (action: NestAction | null) => void;
  /** 먹이 남은 개수 표시를 다시 그린다 (먹인 뒤·1분마다) */
  refreshFeeds: () => void;
}

const CARE_META: Record<NestAction, { icon: string; cls: string }> = {
  feed: { icon: 'i-care-feed', cls: 'feed' },
  sleep: { icon: 'i-care-sleep', cls: 'sleep' },
  pet: { icon: 'i-care-pet', cls: 'pet' },
};

export function createDock(o: DockOpts): Dock {
  const { faction } = o;
  let panel: DockPanel = CLOSED;

  const root = el('footer', 'bha-homedock');
  const tray = el('div', 'bha-homedock__tray');
  tray.hidden = true;
  const bar = el('nav', 'bha-homedock__bar');
  bar.setAttribute('aria-label', '홈 독');

  // ── 돌보기: 효과가 있는 버튼 (색 테두리 + 글자) ──
  const care = el('div', 'bha-homedock__care');
  care.setAttribute('role', 'group');
  care.setAttribute('aria-label', '돌보기');
  const careBtns = new Map<NestAction, HTMLButtonElement>();
  for (const a of NEST_ACTIONS) {
    const b = el('button', `bha-homedock__carebtn bha-homedock__carebtn--${CARE_META[a].cls}`);
    b.type = 'button';
    b.dataset.care = a;
    b.dataset.sc = `care.${a}`;
    // 독 버튼 글은 짧은 이름 (GDD 100장 #14, 종족 설정 nestActionsShort). 요청 중이면 작은 느낌표 배지 (#15, 대기 보상 배지와 같은 모양)
    b.append(icon(CARE_META[a].icon), el('span', '', faction.nestActionsShort?.[a] ?? faction.nestActions[a]));
    b.title = faction.nestActions[a];
    b.onclick = () => {
      if (a === 'feed') return setPanel(togglePanel(panel, 'food'));
      setPanel(CLOSED);
      o.onCare(a);
    };
    careBtns.set(a, b);
    care.append(b);
  }
  // 먹이 남은 개수 (GDD 109장 6): 버튼 글 옆 작은 숫자, 0 이면 흐리게
  const feedLeft = el('small', 'bha-homedock__feedleft bha-num');
  if (o.feedsLeft) careBtns.get('feed')!.append(feedLeft);
  const refreshFeeds = () => {
    if (!o.feedsLeft) return;
    const { left, max } = o.feedsLeft();
    feedLeft.textContent = `${left}/${max}`;
    feedLeft.classList.toggle('is-empty', left <= 0);
    careBtns.get('feed')!.title = `${faction.nestActions.feed} (10분에 ${max}개까지 — 지금 ${left}개 더)`;
  };
  refreshFeeds();

  // ── 더보기: 메뉴 전부가 들어 있는 버튼 하나 (⋯) ──
  const menu = el('div', 'bha-homedock__menu');
  const moreBtn = button({ label: '더보기', icon: 'i-more', iconOnly: true, variant: 'ghost', onClick: () => setPanel(togglePanel(panel, 'more')) });
  moreBtn.dataset.dock = 'more';
  moreBtn.dataset.sc = 'dock.more';
  moreBtn.setAttribute('aria-expanded', 'false');
  const menuBtns: HTMLButtonElement[] = [moreBtn];
  menu.append(moreBtn);
  if (o.idle) {
    const idleBtn = button({ label: '대기 보상', icon: 'i-timer', iconOnly: true, variant: 'ghost', onClick: () => { setPanel(CLOSED); o.idle!.onOpen(); } });
    idleBtn.dataset.sc = 'idle-reward'; // 1분마다 refreshIdleBadge 가 이 버튼의 배지를 고친다
    idleBtn.classList.add('bha-homedock__idle');
    if (o.idle.badge) {
      idleBtn.append(el('small', 'bha-room__idlebadge', o.idle.badge));
      idleBtn.title = `대기 보상 ${o.idle.badge} 쌓임`;
    }
    menuBtns.push(idleBtn);
    menu.prepend(idleBtn);
  }

  bar.append(care, el('span', 'bha-homedock__sep'), menu);
  root.append(tray, bar);

  let trayBtns: HTMLElement[] = [];
  function fillTray(): void {
    tray.replaceChildren();
    trayBtns = [];
    delete tray.dataset.scList;
    tray.className = `bha-homedock__tray bha-homedock__tray--${panel}`;
    if (panel === 'food') {
      tray.setAttribute('aria-label', '먹이 고르기');
      tray.dataset.scList = '';
      for (const id of FOOD_IDS) {
        const f = foodEffect(id);
        const b = el('button', 'bha-homedock__food');
        b.type = 'button';
        b.dataset.food = id;
        const have = o.foodCount(id);
        b.disabled = have <= 0;
        const eff = [`${faction.fullnessName} +${f.hunger}`];
        if (f.condition !== 0) eff.push(`컨디션 ${f.condition > 0 ? '+' : '−'}${Math.abs(f.condition)}`);
        const name = el('span', 'bha-homedock__foodname', faction.foodNames[id]);
        name.append(' ', el('b', 'bha-num', `×${have}`));
        b.setAttribute('aria-label', `${faction.foodNames[id]} ${have}개`);
        b.append(name, el('small', '', eff.join(' · ')));
        b.onclick = () => {
          if (o.foodCount(id) <= 0) return;
          setPanel(CLOSED);
          o.onCare('feed', id);
        };
        trayBtns.push(b);
        tray.append(b);
      }
      tray.append(provisionalTag());
    } else if (panel === 'more') {
      tray.setAttribute('aria-label', '더보기');
      tray.dataset.scList = '';
      for (const m of o.more) {
        // 아이콘(위) + 짧은 이름(아래) 칸
        const b = el('button', 'bha-homedock__moreitem');
        b.type = 'button';
        b.setAttribute('aria-label', m.label);
        b.append(icon(m.icon), el('span', '', m.label));
        b.onclick = () => { setPanel(CLOSED); m.onClick(); };
        trayBtns.push(b);
        tray.append(b);
      }
      // 닫기 칸 (GDD 100장 #17): ··· 다시 누르기·뒤로 말고도 닫을 수 있게
      const x = el('button', 'bha-homedock__moreitem');
      x.type = 'button';
      x.dataset.dock = 'close';
      x.setAttribute('aria-label', '닫기');
      x.append(icon('i-close'), el('span', '', '닫기'));
      x.onclick = () => setPanel(CLOSED);
      trayBtns.push(x);
      tray.append(x);
    }
    // 펼친 줄은 장면 위에 떠 있으니 기기 버튼 선택에서 먼저 (보이는 위치 순서 안에서도 맨 앞 묶음, GDD 63장)
    for (const b of trayBtns) b.setAttribute('data-dev-order', '-1');
  }

  function setPanel(next: DockPanel): void {
    panel = next;
    tray.hidden = panel === CLOSED;
    root.classList.toggle('is-open', panel !== CLOSED);
    careBtns.get('feed')!.classList.toggle('is-active', panel === 'food');
    careBtns.get('feed')!.setAttribute('aria-expanded', String(panel === 'food'));
    moreBtn.classList.toggle('is-active', panel === 'more');
    moreBtn.setAttribute('aria-expanded', String(panel === 'more'));
    fillTray();
    o.onItemsChange();
  }

  // 뒤로(◀·Esc·폰 뒤로): 펼친 먹이·더보기 칸이 있으면 그것만 닫는다 (C.176, GDD 104장 7). 독이 화면에서 사라지면 등록을 지운다
  let shown = false;
  registerCancelHook((top) => {
    if (root.isConnected) shown = true;
    else return shown ? 'gone' : false;
    if (top || panel === CLOSED) return false;
    setPanel(CLOSED);
    return true;
  }, { button: true });

  return {
    root,
    items: () => [...trayBtns.filter((b) => !(b as HTMLButtonElement).disabled), ...careBtns.values(), ...menuBtns],
    panel: () => panel,
    close: () => { if (panel !== CLOSED) setPanel(CLOSED); },
    refreshFeeds,
    setRequest: (action) => {
      for (const [a, b] of careBtns) {
        const on = a === action;
        b.classList.toggle('is-requested', on);
        if (on) b.dataset.requested = ''; else delete b.dataset.requested;
        b.querySelector('.bha-room__idlebadge')?.remove();
        if (on) b.append(el('small', 'bha-room__idlebadge bha-homedock__askbadge', '!'));
        b.setAttribute('aria-label', on ? `${faction.nestActions[a]} (요청 중)` : faction.nestActions[a]);
      }
    },
  };
}
