// 메인 방 화면 (GDD 16장, T-1): LCD 창 안의 방 장면. 방 안 물건이 곧 선택 항목이다.
//   문=원정 · 제단=진화 · 책=도감 · 상자=덱·슬롯 · 창문=칭호 · 돌보기 자리=상태·돌보기 · 캐릭터=반응, 가장자리 아이콘=연습·종족·설정·도움말.
// 위 한 줄: 컨디션·리스크 바 + 원정 이어하기. 방 모양·물건 이름·위치·말풍선 문구는 종족 설정(room)에서 읽는다 (종족 id 분기 없음).
import { BALANCE } from '../config/balance';
import { applyIdle } from '../engine/nest';
import { roomOf, ROOM_PROPS, type FactionConfig, type RoomProp } from '../engine/faction';
import { sanitizeDeck, type SaveData } from '../game';
import { artUrls } from '../data/art/manifest';
import { button, el, icon, meter, mountApp } from './bha/dom';
import type { Device, SelectItem } from './bha/device';
import { characterButton, propButton, roomCharArt, sceneBox } from './bha/room';
import { moodOf, pickLine, type Mood } from './bha/roomLogic';

export interface RoomHandlers {
  onDepart: () => void;
  onAltar: () => void;
  onBook: () => void;
  onChest: () => void;
  onWindow: () => void;
  onCare: () => void;
  onPractice: () => void;
  onChangeFaction: () => void;
  onSettings: () => void;
  onHelp: () => void;
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

  // ── 위 한 줄 ──
  const hud = el('header', 'bha-room__hud');
  hud.append(
    meter({ kind: 'cond', label: '컨디션', icon: 'i-cond', value: Math.round(n.condition), max: 100, compact: true, thin: true, danger: n.condition < 40 }),
    meter({ kind: 'risk', label: faction.riskGaugeName, icon: 'i-risk', value: Math.round(n.risk), max: RX.limit, compact: true, thin: true, zone: 60 / RX.limit, danger: n.risk >= 60 }),
  );
  const items: SelectItem[] = [];
  if (n.weakened) {
    const w = el('span', 'bha-chip bha-chip--danger');
    w.append(icon('i-broken'), faction.defeatStateName);
    hud.append(w);
  }
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
    care: hd.onCare,
  };
  // 위/아래 순서: 위쪽 줄(창문·책·제단) → 문 → 상자 → 돌보기 → 캐릭터 → 가장자리 아이콘
  const order: RoomProp[] = ['window', 'book', 'altar', 'door', 'chest', 'care'];
  const props = new Map<RoomProp, HTMLButtonElement>();
  for (const p of ROOM_PROPS) {
    const b = propButton({ prop: p, name: room.props[p], ...room.layout[p], art: !!artUrls(`prop.${p}`).src, alert: p === 'door' && deckCount === 0 });
    b.onclick = act[p];
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
  scene.append(char, bubble);

  // ── 가장자리 아이콘 한 줄 (왼쪽 세로): 연습·종족·설정·도움말 ──
  const edge = el('nav', 'bha-room__edge');
  edge.setAttribute('aria-label', '메뉴');
  const edgeBtn = (label: string, ic: string, fn: () => void) => {
    const b = button({ label, icon: ic, iconOnly: true, variant: 'ghost', onClick: fn });
    edge.append(b);
    return b;
  };
  const edgeBtns = [
    edgeBtn('전투 연습', 'i-practice', hd.onPractice),
    edgeBtn('종족 바꾸기', 'i-swap-species', hd.onChangeFaction),
    edgeBtn('설정', 'i-settings', hd.onSettings),
    edgeBtn('도움말', 'i-help', hd.onHelp),
  ];

  const body = el('div', 'bha-room__body');
  body.append(edge, scene);
  const warn = hd.resumeNote ? el('p', 'bha-room__note', `이어하기를 숨겼다: ${hd.resumeNote}`) : null;
  const main = mountApp(dev.view, { cls: 'bha-room' }, hud, ...(warn ? [warn] : []), body);
  main.dataset.deck = `${deckCount}/${deckSize}`;

  for (const p of order) items.push({ el: props.get(p)! });
  items.push({ el: char }, ...edgeBtns.map((b) => ({ el: b as HTMLElement })));
  dev.setItems(items, main);

  // ── 반응: 상태가 바뀌어 돌아왔을 때, 가끔 혼잣말 ──
  if (lastMood !== null && lastMood !== mood && mood !== 'idle') window.setTimeout(() => main.isConnected && react(pickLine(room.talk, mood)), 500);
  lastMood = mood;
  const idle = window.setInterval(() => {
    if (!main.isConnected) return window.clearInterval(idle);
    if (Math.random() < 0.5) say(pickLine(room.talk, mood));
  }, IDLE_TALK_MS);
}
