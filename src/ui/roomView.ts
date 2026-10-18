// 메인 방 화면 (GDD 16장, T-1): LCD 창 안의 방 장면. 방 안 물건이 곧 선택 항목이다.
//   문=원정 · 제단=진화 · 책=도감 · 상자=덱·슬롯 · 창문=칭호 · 훈련 인형=전투 연습 · 캐릭터=반응 · 캐릭터 머리 위 상태 칩=상태 화면(GDD 18-8). 아래 독(GDD 18-2·18-9)=돌보기 3개 + [더보기 ⋯] 하나(설정·도움말·튜토리얼·종족 바꾸기·백업·처음 화면).
// 위 한 줄: 컨디션·리스크 바 + 원정 이어하기. 방 모양·물건 이름·위치·말풍선 문구는 종족 설정(room)에서 읽는다 (종족 id 분기 없음).
import { BALANCE } from '../config/balance';
import { applyIdle, doNestAction } from '../engine/nest';
import { roomOf, ROOM_PROPS, type FactionConfig, type RoomProp } from '../engine/faction';
import { sanitizeDeck, type SaveData } from '../game';
import { artUrls } from '../data/art/manifest';
import { button, el, icon, mountApp } from './bha/dom';
import type { Device, SelectItem } from './bha/device';
import { characterButton, propButton, roomCharArt, sceneBox } from './bha/room';
import { moodOf, pickLine, statusChips, type Mood } from './bha/roomLogic';
import { createDock } from './bha/dock';
import { careFeedback } from './bha/dockLogic';

export interface RoomHandlers {
  onDepart: () => void;
  onAltar: () => void;
  onBook: () => void;
  onChest: () => void;
  onWindow: () => void;
  onStatus: () => void;
  onPractice: () => void;
  onChangeFaction: () => void;
  onSettings: () => void;
  onHelp: () => void;
  /** 독 '더보기' 항목 */
  onTutorial: () => void;
  onBackup: () => void;
  onTitle: () => void;
  persist: () => void;
  resume: { info: string; onResume: () => void } | null;
  resumeNote: string;
}

/** 마지막으로 방에 있을 때의 기분: 바뀌었으면 돌아왔을 때 캐릭터가 한마디 한다 (화면 사이에 남는 UI 상태) */
let lastMood: Mood | null = null;
const IDLE_TALK_MS = 14000;

export function roomView(dev: Device, faction: FactionConfig, save: SaveData, hd: RoomHandlers): void {
  applyIdle(save.nest, Date.now());
  save.tiles.deck = sanitizeDeck(save.tiles, faction.id);
  hd.persist();
  const room = roomOf(faction);
  const n = save.nest;
  const RX = BALANCE.provisional.risk;
  const deckSize = BALANCE.provisional.expedition.deckSize;
  const deckCount = save.tiles.deck.length;
  const mood = moodOf({ weakened: n.weakened, condition: n.condition, risk: n.risk, riskLimit: RX.limit });

  // ── 위 한 줄 ── (원정 이어하기만. 상태는 캐릭터 머리 위 칩)
  const hud = el('header', 'bha-room__hud');
  const items: SelectItem[] = [];
  let resumeBtn: HTMLButtonElement | null = null;
  if (hd.resume) {
    resumeBtn = button({ label: '원정 이어하기', icon: 'i-return', size: 'small', variant: 'primary', onClick: hd.resume.onResume });
    resumeBtn.title = hd.resume.info;
    resumeBtn.append(el('small', 'bha-room__resumeinfo', hd.resume.info));
    hud.append(resumeBtn);
    items.push({ el: resumeBtn });
  }

  // ── 장면 ──
  const scene = sceneBox(room);
  const bubble = el('div', 'bha-room__bubble');
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  bubble.hidden = true;
  let bubbleTimer = 0;
  const say = (text: string, ms = 2600) => {
    bubble.textContent = text;
    bubble.hidden = false;
    bubble.classList.remove('is-pop');
    void bubble.offsetWidth;
    bubble.classList.add('is-pop');
    window.clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(() => (bubble.hidden = true), ms);
  };

  const act: Record<RoomProp, () => void> = {
    door: () => (deckCount === 0 ? say('덱이 비어 있다. 상자에서 타일을 넣어야 출발할 수 있다.', 3600) : hd.onDepart()),
    altar: hd.onAltar,
    book: hd.onBook,
    chest: hd.onChest,
    window: hd.onWindow,
    dummy: hd.onPractice, // 훈련 인형 = 전투 연습 (GDD 18-3)
  };
  // 위/아래 순서: 위쪽 줄(창문·책·제단) → 문 → 상자 → 인형 → 상태 칩 → 캐릭터 → 독 메뉴
  const order: RoomProp[] = ['window', 'book', 'altar', 'door', 'chest', 'dummy'];
  const props = new Map<RoomProp, HTMLButtonElement>();
  for (const p of ROOM_PROPS) {
    const b = propButton({ prop: p, name: room.props[p], ...room.layout[p], art: !!artUrls(`prop.${p}`).src, alert: p === 'door' && deckCount === 0 });
    b.onclick = act[p];
    if (p === 'dummy') b.dataset.sc = 'dummy';
    props.set(p, b);
    scene.append(b);
  }
  const char = characterButton(roomCharArt(room, faction.id, save.evolution.tierIndex), '캐릭터');
  let hop = 0;
  const react = (line?: string) => {
    char.classList.remove('is-react');
    void char.offsetWidth;
    char.classList.add('is-react');
    window.clearTimeout(hop);
    hop = window.setTimeout(() => char.classList.remove('is-react'), 700);
    say(line ?? pickLine(room.talk, mood === 'idle' && Math.random() < 0.4 ? 'happy' : mood));
  };
  char.onclick = () => react();
  // 머리 위 상태 칩 (허기·컨디션·리스크 게이지, 쇠약이면 그 이름). 누르면 상태 화면. 돌보기를 하면 그 자리에서 다시 그린다
  const statusBtn = el('button', 'bha-room__status');
  statusBtn.type = 'button';
  statusBtn.dataset.sc = 'status';
  statusBtn.onclick = hd.onStatus;
  const paintGauges = () => {
    const chips = statusChips(n, faction);
    statusBtn.setAttribute('aria-label', `상태 보기: ${chips.map((c) => (c.value === null ? c.label : `${c.label} ${c.value}`)).join(', ')}`);
    statusBtn.replaceChildren(...chips.map((c) => {
      const chip = el('span', `bha-chip bha-room__chip bha-room__chip--${c.kind}${c.danger ? ' bha-chip--danger' : ''}`);
      chip.append(icon(c.icon), c.value === null ? c.label : `${c.label} ${c.value}`);
      return chip;
    }));
  };
  paintGauges();
  scene.append(char, statusBtn, bubble);

  // ── 하단 독 (GDD 18-2): 돌보기 3개 + 메뉴 아이콘 + 더보기 ──
  const dock = createDock({
    faction,
    onCare: (action, food) => {
      const before = { hunger: n.hunger, condition: n.condition, stability: n.stability, risk: n.risk };
      doNestAction(n, action, food);
      hd.persist();
      paintGauges();
      say(careFeedback(faction, action, food ?? null, { hunger: n.hunger - before.hunger, condition: n.condition - before.condition, stability: n.stability - before.stability, risk: n.risk - before.risk }), 3200);
      char.classList.remove('is-react');
      void char.offsetWidth;
      char.classList.add('is-react');
    },
    more: [
      { label: '설정', icon: 'i-settings', onClick: hd.onSettings },
      { label: '도움말', icon: 'i-help', onClick: hd.onHelp },
      { label: '튜토리얼', icon: 'i-play', onClick: hd.onTutorial },
      { label: '종족 바꾸기', icon: 'i-swap-species', onClick: hd.onChangeFaction },
      { label: '백업·불러오기', icon: 'i-deck', onClick: hd.onBackup },
      { label: '처음 화면', icon: 'i-quit', onClick: hd.onTitle },
    ],
    onItemsChange: () => registerItems(),
  });

  const body = el('div', 'bha-room__body');
  body.append(scene);
  const warn = hd.resumeNote ? el('p', 'bha-room__note', `이어하기를 숨겼다: ${hd.resumeNote}`) : null;
  const main = mountApp(dev.view, { cls: 'bha-room' }, hud, ...(warn ? [warn] : []), body, dock.root);
  main.dataset.deck = `${deckCount}/${deckSize}`;

  // 선택 항목: 이어하기 → 물건 → 캐릭터 → 독(펼친 줄이 있으면 그것 먼저)
  function registerItems(): void {
    const list: SelectItem[] = [...items.slice(0, resumeBtn ? 1 : 0)];
    for (const p of order) list.push({ el: props.get(p)! });
    list.push({ el: statusBtn }, { el: char });
    dev.setItems([...dock.items().filter((b) => b.closest('.bha-homedock__tray')).map((b) => ({ el: b })), ...list, ...dock.items().filter((b) => !b.closest('.bha-homedock__tray')).map((b) => ({ el: b }))], main);
  }
  registerItems();
  // 독 밖(장면)을 누르면 펼친 줄을 닫는다
  scene.addEventListener('pointerdown', () => dock.close());

  // ── 반응: 상태가 바뀌어 돌아왔을 때, 가끔 혼잣말 ──
  if (lastMood !== null && lastMood !== mood && mood !== 'idle') window.setTimeout(() => main.isConnected && react(pickLine(room.talk, mood)), 500);
  lastMood = mood;
  const idle = window.setInterval(() => {
    if (!main.isConnected) return window.clearInterval(idle);
    if (Math.random() < 0.5) say(pickLine(room.talk, mood));
  }, IDLE_TALK_MS);
}
