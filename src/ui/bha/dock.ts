// 홈 하단 독 (GDD 18-2, 18-9 · 14-3 v6.004): 돌보기 3개(먹이·재우기·교감, 효과 있는 버튼) + [소모품] 빠른 사용 + [더보기 ⋯] 하나. 메뉴는 전부 더보기 안 아이콘+이름 격자.
// 먹이·더보기를 누르면 독 바로 위에 칸이 펼쳐진다(장면 위에 겹침, 장면 크기는 그대로). 먹이 종류를 하나 고르면 바로 먹는다.
// 먹이는 개수제(GDD 23-1): 칸마다 보유 개수, 0개는 비활성.
import { FOOD_IDS, NEST_ACTIONS, type FactionConfig, type FoodId, type NestAction } from '../../engine/faction';
import { foodEffectList, type FoodFx } from '../../engine/nest';
import { foodEffectText, foodFxAmount, foodFxText } from '../../foodText';
import { button, el, icon, provisionalTag } from './dom';
import { CLOSED, togglePanel, type DockPanel } from './dockLogic';
import { registerCancelHook } from './shortcuts';
import { fixParticles } from '../../engine/josa';

export interface DockMenuItem {
  label: string;
  icon: string;
  onClick: () => void;
}

/** 먹이 효과 아이콘 = 상태창·바뀐 값 칩과 같은 아이콘 (changeNote ICONS · 교감은 상태 화면 교감 막대) */
const FOOD_FX_ICON: Record<FoodFx['key'], string> = { hunger: 'i-hunger', cond: 'i-cond', risk: 'i-risk', hp: 'i-heal', bond: 'i-care-pet' };

/** 먹이 카드 효과 줄 (GDD 211장 — 189장 17 '수치 한 개'를 대신함): 지금 먹이면 실제로 움직이는 효과 전부를 아이콘 + 수치로.
 *  가득·상한에 닿은 값은 빠진다(193장 16). 하나도 없으면 '가득' 글. 적힌 것 = 먹인 뒤 바뀐 값 칩 */
export function foodCardFx(list: readonly FoodFx[], faction: Pick<FactionConfig, 'fullnessName'>): HTMLElement {
  const row = el('small', 'bha-homedock__foodfx');
  if (list.length === 0) {
    row.textContent = '가득';
    return row;
  }
  for (const e of list) {
    const fx = el('span', `bha-homedock__fx bha-room__chip--${e.key}`);
    fx.dataset.fx = e.key;
    fx.title = foodFxText(e, faction);
    fx.append(icon(FOOD_FX_ICON[e.key]), foodFxAmount(e));
    row.append(fx);
  }
  return row;
}

/** 소모품 빠른 사용 칸 하나 (GDD 14-3, v6.004): 가방 소모품 중 방에서 고를 수 있는 것. lock = 지금 못 쓰는 이유(흐리게 + 한 줄) */
export interface QuickItem {
  id: string;
  name: string;
  count: number;
  /** 효과 짧은 한 줄 (가방 목록 칸과 같은 글) */
  brief: string;
  lock: string | null;
}

export interface DockOpts {
  faction: FactionConfig;
  /** 돌보기 실행 (먹이는 고른 종류와 함께) */
  onCare: (action: NestAction, food?: FoodId) => void;
  /** 먹이 종류별 보유 개수 (GDD 23-1): 먹이 칸에 개수를 보이고 0개는 비활성 */
  foodCount: (food: FoodId) => number;
  /** 지금 먹이면 실제로 움직이는 효과 (GDD 193장 16 · 211장, engine foodEffectsNow): 카드에 이것만 보인다. 없으면 효과 전부 */
  foodEffectsNow?: (food: FoodId) => FoodFx[];
  /** 먹이 한도 (GDD 109장 6): 지금 더 먹일 수 있는 개수와 한도. 먹이 버튼 옆에 작게 '2/3' */
  feedsLeft?: () => { left: number; max: number };
  /** [소모품] 빠른 사용 (GDD 14-3, v6.004): 있으면 돌보기 3개 옆 버튼 — 누르면 독 위에 소모품 줄, 칸을 누르면 바로 쓴다(줄은 열어 둔다) */
  items?: { label: string; list: () => QuickItem[]; onUse: (id: string) => void };
  /** 더보기 격자에 펼치는 항목 (아이콘 + 짧은 이름, 이 순서대로) */
  more: DockMenuItem[];
  /** 대기 보상 시계 버튼 (GDD 98장 A3): ⋯ 옆, 글자 없음, 쌓인 시간은 작은 배지. 누르면 대기 보상 창 */
  idle?: { badge: string | null; onOpen: () => void };
  /** 펼침 상태가 바뀌어 선택 가능 항목이 달라졌을 때. focus = 기기 초점을 둘 버튼(누른 돌보기·펼친 줄을 연 버튼, GDD 176장 4). null = 기본(펼친 줄 첫 칸) */
  onItemsChange: (focus: HTMLElement | null) => void;
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
      if (a === 'feed') return setPanel(togglePanel(panel, 'food'), b);
      setPanel(CLOSED, b); // 누른 돌보기 버튼에 초점 그대로 (GDD 176장 4)
      o.onCare(a);
    };
    careBtns.set(a, b);
    care.append(b);
  }
  // [소모품] 빠른 사용 (GDD 14-3, v6.004): 돌보기 줄 끝 같은 모양 버튼 — 가방을 거치지 않고 약 등을 바로 쓴다
  let itemsBtn: HTMLButtonElement | null = null;
  if (o.items) {
    const b = el('button', 'bha-homedock__carebtn bha-homedock__carebtn--items');
    b.type = 'button';
    b.dataset.dock = 'items';
    b.dataset.sc = 'dock.items';
    b.setAttribute('aria-expanded', 'false');
    b.append(icon('i-heal'), el('span', '', o.items.label));
    b.title = `${o.items.label} 바로 쓰기`;
    b.onclick = () => setPanel(togglePanel(panel, 'items'), b);
    itemsBtn = b;
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
  const moreBtn = button({ label: '더보기', icon: 'i-more', iconOnly: true, variant: 'ghost', onClick: () => setPanel(togglePanel(panel, 'more'), moreBtn) });
  moreBtn.dataset.dock = 'more';
  moreBtn.dataset.sc = 'dock.more';
  moreBtn.setAttribute('aria-expanded', 'false');
  const menuBtns: HTMLButtonElement[] = [moreBtn];
  menu.append(moreBtn);
  if (o.idle) {
    const idleBtn = button({ label: '대기 보상', icon: 'i-timer', iconOnly: true, variant: 'ghost', onClick: () => { setPanel(CLOSED, idleBtn); o.idle!.onOpen(); } });
    idleBtn.dataset.sc = 'idle-reward'; // 1분마다 refreshIdleBadge 가 이 버튼의 배지를 고친다
    idleBtn.classList.add('bha-homedock__idle');
    // 대기 보상 아이콘 = 초시계(i-timer 옛 스프라이트) — GDD 241-A 5: C.284 선물상자 롤백
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
      tray.setAttribute('aria-label', `${faction.nestActionsShort?.feed ?? faction.nestActions.feed} 고르기`);
      tray.dataset.scList = '';
      // 먹이 12종 (GDD 235장): 가진 것만 칸으로 — 없는 종류까지 다 늘어놓으면 줄이 넘친다. 하나도 없으면 빈 줄 안내
      const owned = FOOD_IDS.filter((id) => o.foodCount(id) > 0);
      if (owned.length === 0) tray.append(el('p', 'bha-homedock__traynote bha-faint', fixParticles(`${faction.foodGroupName}이(가) 없다`)));
      for (const id of owned) {
        const b = el('button', 'bha-homedock__food');
        b.type = 'button';
        b.dataset.food = id;
        const have = o.foodCount(id);
        b.disabled = have <= 0;
        const all = foodEffectText(id, faction); // 효과 전부 (GDD 211장) — aria·title
        const name = el('span', 'bha-homedock__foodname', faction.foodNames[id]);
        name.append(' ', el('b', 'bha-num', `×${have}`));
        b.setAttribute('aria-label', `${faction.foodNames[id]} ${have}개, ${all}`);
        b.title = all;
        b.append(name, foodCardFx(o.foodEffectsNow?.(id) ?? foodEffectList(id), faction));
        b.onclick = () => {
          if (o.foodCount(id) <= 0) return;
          o.onCare('feed', id);
          // 먹인 뒤에도 목록은 열어 둔다 (GDD 243장 6 — 176장 4 '먹인 뒤 닫힘' 대체): 개수·효과만 새로, 초점은 같은 먹이(다 떨어졌으면 첫 칸, 없으면 [먹이])
          if (panel !== 'food' || !root.isConnected) return;
          fillTray();
          o.onItemsChange(trayBtns.find((x) => x.dataset.food === id) ?? trayBtns[0] ?? careBtns.get('feed')!);
        };
        trayBtns.push(b);
        tray.append(b);
      }
      // 임시 배지 = 카드 아래 줄 (GDD 189장 17: 카드 위에 얹혀 ×n 과 겹치던 것)
      const note = el('div', 'bha-homedock__traynote');
      note.append(provisionalTag());
      note.hidden = note.firstElementChild!.hasAttribute('hidden');
      tray.append(note);
    } else if (panel === 'items' && o.items) {
      const it = o.items;
      tray.setAttribute('aria-label', `${it.label} 고르기`);
      tray.dataset.scList = '';
      const list = it.list();
      if (list.length === 0) tray.append(el('p', 'bha-homedock__traynote bha-faint', fixParticles(`${it.label}이(가) 없다. 상점에서 사면 여기에 들어온다.`)));
      for (const q of list) {
        // 먹이 칸과 같은 모양: 이름 ×n + 아래 짧은 효과. 못 쓰면(전투 전용 등) 흐리게 + 효과 자리에 이유 한 줄
        const b = el('button', 'bha-homedock__food bha-homedock__item');
        b.type = 'button';
        b.dataset.item = q.id;
        const name = el('span', 'bha-homedock__foodname', q.name);
        name.append(' ', el('b', 'bha-num', `×${q.count}`));
        b.append(name, el('small', '', q.lock ?? q.brief));
        b.setAttribute('aria-label', `${q.name} ${q.count}개, ${q.lock ? `못 씀: ${q.lock}` : q.brief}`);
        b.disabled = q.lock !== null;
        b.title = q.lock ?? q.brief;
        b.onclick = () => {
          if (q.lock) return;
          it.onUse(q.id);
          // 쓴 뒤에도 줄은 열어 둔다 (먹이 줄과 같음): 개수·잠김만 새로, 초점은 같은 칸(다 떨어졌으면 첫 칸, 없으면 [소모품])
          if (panel !== 'items' || !root.isConnected) return;
          fillTray();
          o.onItemsChange(trayBtns.find((x) => x.dataset.item === q.id) ?? trayBtns[0] ?? itemsBtn!);
        };
        trayBtns.push(b);
        tray.append(b);
      }
    } else if (panel === 'more') {
      tray.setAttribute('aria-label', '더보기');
      tray.dataset.scList = '';
      for (const m of o.more) {
        // 아이콘(위) + 짧은 이름(아래) 칸
        const b = el('button', 'bha-homedock__moreitem');
        b.type = 'button';
        b.setAttribute('aria-label', m.label);
        b.append(icon(m.icon), el('span', '', m.label));
        b.onclick = () => { setPanel(CLOSED, moreBtn); m.onClick(); };
        trayBtns.push(b);
        tray.append(b);
      }
      // [닫기] 칸 없음 (GDD 124장 2, C.198): ··· 다시 누르기·뒤로·장면 누르기로 닫힌다
    }
    // 펼친 줄은 장면 위에 떠 있으니 기기 버튼 선택에서 먼저 (보이는 위치 순서 안에서도 맨 앞 묶음, GDD 63장)
    for (const b of trayBtns) b.setAttribute('data-dev-order', '-1');
  }

  /** opener = 이 펼침을 바꾼 버튼. 줄이 닫히면 거기에 기기 초점을 둔다(열리면 펼친 줄 첫 칸) */
  function setPanel(next: DockPanel, opener: HTMLElement | null = null): void {
    const was = panel;
    panel = next;
    tray.hidden = panel === CLOSED;
    root.classList.toggle('is-open', panel !== CLOSED);
    careBtns.get('feed')!.classList.toggle('is-active', panel === 'food');
    careBtns.get('feed')!.setAttribute('aria-expanded', String(panel === 'food'));
    itemsBtn?.classList.toggle('is-active', panel === 'items');
    itemsBtn?.setAttribute('aria-expanded', String(panel === 'items'));
    moreBtn.classList.toggle('is-active', panel === 'more');
    moreBtn.setAttribute('aria-expanded', String(panel === 'more'));
    fillTray();
    // 줄을 닫으면(뒤로 포함) 그 줄을 열었던 버튼으로 초점 (GDD 176장 4·8)
    const back = was === 'food' ? careBtns.get('feed')! : was === 'items' ? itemsBtn : was === 'more' ? moreBtn : null;
    o.onItemsChange(panel === CLOSED ? opener ?? back : null);
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
    items: () => [...trayBtns.filter((b) => !(b as HTMLButtonElement).disabled), ...careBtns.values(), ...(itemsBtn ? [itemsBtn] : []), ...menuBtns],
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
