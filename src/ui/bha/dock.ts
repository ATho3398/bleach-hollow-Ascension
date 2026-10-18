// 홈 하단 독 (GDD 18-2): 돌보기 3개(먹이·재우기·쓰다듬기, 효과 있는 버튼) + 메뉴(아이콘 버튼) + 더보기.
// 먹이·더보기를 누르면 독 바로 위에 줄이 펼쳐진다(장면 위에 겹침, 장면 크기는 그대로). 먹이 종류를 하나 고르면 바로 먹는다.
import { FOOD_IDS, NEST_ACTIONS, type FactionConfig, type FoodId, type NestAction } from '../../engine/faction';
import { foodEffect } from '../../engine/nest';
import { button, el, icon } from './dom';
import { CLOSED, togglePanel, type DockPanel } from './dockLogic';

export interface DockMenuItem {
  label: string;
  icon: string;
  onClick: () => void;
}

export interface DockOpts {
  faction: FactionConfig;
  /** 돌보기 실행 (먹이는 고른 종류와 함께) */
  onCare: (action: NestAction, food?: FoodId) => void;
  /** 독에 늘 보이는 메뉴 (아이콘 버튼) */
  menu: DockMenuItem[];
  /** 더보기 줄에 펼치는 항목 */
  more: DockMenuItem[];
  /** 펼침 상태가 바뀌어 선택 가능 항목이 달라졌을 때 */
  onItemsChange: () => void;
}

export interface Dock {
  root: HTMLElement;
  /** 지금 누를 수 있는 항목 순서 (펼친 줄 → 돌보기 → 메뉴) */
  items: () => HTMLElement[];
  panel: () => DockPanel;
  close: () => void;
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
    b.append(icon(CARE_META[a].icon), el('span', '', faction.nestActions[a]));
    b.onclick = () => {
      if (a === 'feed') return setPanel(togglePanel(panel, 'food'));
      setPanel(CLOSED);
      o.onCare(a);
    };
    careBtns.set(a, b);
    care.append(b);
  }

  // ── 메뉴: 아이콘만 있는 보조 버튼 ──
  const menu = el('div', 'bha-homedock__menu');
  const menuBtns: HTMLButtonElement[] = [];
  for (const m of o.menu) {
    const b = button({ label: m.label, icon: m.icon, iconOnly: true, variant: 'ghost', onClick: () => { setPanel(CLOSED); m.onClick(); } });
    b.dataset.sc = `dock.${menuBtns.length + 1}`;
    menuBtns.push(b);
    menu.append(b);
  }
  const moreBtn = button({ label: '더보기', icon: 'i-grip', iconOnly: true, variant: 'ghost', onClick: () => setPanel(togglePanel(panel, 'more')) });
  moreBtn.dataset.dock = 'more';
  moreBtn.dataset.sc = `dock.${menuBtns.length + 1}`;
  moreBtn.setAttribute('aria-expanded', 'false');
  menuBtns.push(moreBtn);
  menu.append(moreBtn);

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
        const eff = [`허기 −${f.hunger}`];
        if (f.condition !== 0) eff.push(`컨디션 ${f.condition > 0 ? '+' : '−'}${Math.abs(f.condition)}`);
        b.append(el('span', 'bha-homedock__foodname', faction.foodNames[id]), el('small', '', eff.join(' · ')));
        b.onclick = () => {
          setPanel(CLOSED);
          o.onCare('feed', id);
        };
        trayBtns.push(b);
        tray.append(b);
      }
      tray.append(el('span', 'bha-tag bha-tag--provisional', '임시'));
    } else if (panel === 'more') {
      tray.setAttribute('aria-label', '더보기');
      tray.dataset.scList = '';
      for (const m of o.more) {
        const b = button({ label: m.label, icon: m.icon, size: 'small', variant: 'ghost', onClick: () => { setPanel(CLOSED); m.onClick(); } });
        b.classList.add('bha-homedock__moreitem');
        trayBtns.push(b);
        tray.append(b);
      }
    }
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

  return {
    root,
    items: () => [...trayBtns, ...careBtns.values(), ...menuBtns],
    panel: () => panel,
    close: () => { if (panel !== CLOSED) setPanel(CLOSED); },
  };
}
