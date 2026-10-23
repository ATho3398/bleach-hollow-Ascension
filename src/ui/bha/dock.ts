// 홈 하단 독 (GDD 18-2, 18-9): 돌보기 3개(먹이·재우기·쓰다듬기, 효과 있는 버튼) + [더보기 ⋯] 하나. 메뉴는 전부 더보기 안 아이콘+이름 격자.
// 먹이·더보기를 누르면 독 바로 위에 칸이 펼쳐진다(장면 위에 겹침, 장면 크기는 그대로). 먹이 종류를 하나 고르면 바로 먹는다.
// 먹이는 개수제(GDD 23-1): 칸마다 보유 개수, 0개는 비활성.
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
  /** 먹이 종류별 보유 개수 (GDD 23-1): 먹이 칸에 개수를 보이고 0개는 비활성 */
  foodCount: (food: FoodId) => number;
  /** 더보기 격자에 펼치는 항목 (아이콘 + 짧은 이름, 이 순서대로) */
  more: DockMenuItem[];
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

  // ── 더보기: 메뉴 전부가 들어 있는 버튼 하나 (⋯) ──
  const menu = el('div', 'bha-homedock__menu');
  const moreBtn = button({ label: '더보기', icon: 'i-more', iconOnly: true, variant: 'ghost', onClick: () => setPanel(togglePanel(panel, 'more')) });
  moreBtn.dataset.dock = 'more';
  moreBtn.dataset.sc = 'dock.more';
  moreBtn.setAttribute('aria-expanded', 'false');
  const menuBtns: HTMLButtonElement[] = [moreBtn];
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
      tray.append(el('span', 'bha-tag bha-tag--provisional', '임시'));
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

  return {
    root,
    items: () => [...trayBtns.filter((b) => !(b as HTMLButtonElement).disabled), ...careBtns.values(), ...menuBtns],
    panel: () => panel,
    close: () => { if (panel !== CLOSED) setPanel(CLOSED); },
    setRequest: (action) => {
      for (const [a, b] of careBtns) {
        const on = a === action;
        b.classList.toggle('is-requested', on);
        if (on) b.dataset.requested = ''; else delete b.dataset.requested;
        b.setAttribute('aria-label', on ? `${faction.nestActions[a]} (요청 중)` : faction.nestActions[a]);
      }
    },
  };
}
