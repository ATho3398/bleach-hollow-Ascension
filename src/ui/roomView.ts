// 메인 방 화면 (GDD 16장, T-1): LCD 창 안의 방 장면. 방 안 물건이 곧 선택 항목이다.
//   문=원정 · 수련장=수련(진화 정보) · 책장=도감(진화체·칭호 탭) · 상자=덱·슬롯 · 훈련 인형=전투 연습 · 상점=상점(C.63, 이름은 두 종족 공통 GDD 34-2) · 캐릭터=반응 · 캐릭터 머리 위 상태 칩=상태 화면(GDD 18-8). 아래 독(GDD 18-2·18-9)=돌보기 3개 + [더보기 ⋯] 하나(설정·도움말·튜토리얼·사진·다마고치 모드·백업·처음 화면).
// 위 한 줄: 컨디션·리스크 바 + 원정 이어하기. 방 모양·물건 이름·위치·말풍선 문구는 종족 설정(room)에서 읽는다 (종족 id 분기 없음).
import { BALANCE } from '../config/balance';
import { roomOf, ROOM_PROPS, type FactionConfig, type RoomProp, type RoomTalk } from '../engine/faction';
import { artSkinOf, careNest, deckSizeOf, feedNest, sanitizeDeck, tickCare, type SaveData } from '../game';
import { artUrls } from '../data/art/manifest';
import { animOf } from './bha/animPlayer';
import { button, el, icon, mountApp } from './bha/dom';
import type { Device, SelectItem } from './bha/device';
import { locoOf } from './bha/loco';
import { characterButton, charTopOffset, propButton, roomCharArt, sceneBox } from './bha/room';
import { careTalkKey, moodOf, pickLine, statusChips, type Mood } from './bha/roomLogic';
import { createDock } from './bha/dock';
import { careFeedback } from './bha/dockLogic';
import { toward } from './bha/nestLogic';
import { rebirthMark } from './rebirthView';
import { formName, tryGetForm } from '../data/evolution';
import { getFaction } from '../data/factions';
import { formDisplayName, playerElementsOf } from '../engine/evolution';

export interface RoomHandlers {
  onDepart: () => void;
  onAltar: () => void;
  onBook: () => void;
  onChest: () => void;
  onStatus: () => void;
  onPractice: () => void;
  /** 등급전 (GDD 21장): 독 더보기 항목 */
  onRank: () => void;
  /** 트랙 전환 (GDD 22-3): 쉬는 트랙 종족 id 로. 다른 트랙이 아직 안 열렸으면(5단계 전) null — 다른 종족으로 가는 유일한 길 (C.63) */
  onSwitchTrack: ((factionId: string) => void) | null;
  /** 붕옥 탭 (GDD 22-3): 열렸을 때만 독 더보기에 */
  onHogyoku: (() => void) | null;
  onSettings: () => void;
  onHelp: () => void;
  /** 독 '더보기' 항목: 튜토리얼 목록(GDD 23-3) */
  onTutorial: () => void;
  /** 상점 (GDD 25-9): 방 물건 shop (C.63, 더보기에서 옮김) */
  onShop: () => void;
  /** 사진 (GDD 25-11): 독 더보기 항목 */
  onPhoto: () => void;
  /** 다마고치 모드 켜기 (GDD 27장): 줌아웃해 기기 전체를 본다 */
  onTamago: () => void;
  /** null = 숨김 (테스트 모드, GDD 38-2) */
  onBackup: (() => void) | null;
  /** 테스트 패널 (GDD 38-4): 테스트 모드에서만, 아니면 null */
  onTest?: (() => void) | null;
  onTitle: () => void;
  persist: () => void;
  resume: { info: string; onResume: () => void } | null;
  resumeNote: string;
  /** 들어오자마자 한 번 할 말 (GDD 24-1: 꺼 둔 동안 배고파졌으면 'hungry' — 문구는 종족 설정 room.talk) */
  greet?: RoomTalk | null;
}

/** 마지막으로 방에 있을 때의 기분: 바뀌었으면 돌아왔을 때 캐릭터가 한마디 한다 (화면 사이에 남는 UI 상태) */
let lastMood: Mood | null = null;
const IDLE_TALK_MS = 14000;
let idleTimer = 0;

export function roomView(dev: Device, faction: FactionConfig, save: SaveData, hd: RoomHandlers): void {
  save.tiles.deck = sanitizeDeck(save.tiles, faction.id, deckSizeOf(save));
  tickCare(save); // 돌봄 요청 (GDD 82장): 꺼 두었다 와도 최대 1개
  hd.persist();
  const room = roomOf(faction, save.wear.talk); // 말풍선 팩 (GDD 25-11): 입은 팩이 혼잣말 문구를 덮는다
  const n = save.nest;
  const RX = BALANCE.provisional.risk;
  const deckSize = deckSizeOf(save);
  const deckCount = save.tiles.deck.length;
  // 첫 진화 전(타일 잠김, GDD 64장)에는 덱 없이 빈 길로 떠난다
  const deckEmpty = deckCount === 0 && save.tiles.unlocked;
  const mood = moodOf({ weakened: n.weakened, condition: n.condition, risk: n.risk, riskLimit: RX.limit });

  // ── 위 한 줄 ── (원정 이어하기만. 상태는 캐릭터 머리 위 칩)
  const hud = el('header', 'bha-room__hud');
  const items: SelectItem[] = [];
  let resumeBtn: HTMLButtonElement | null = null;
  // 환생 표시 (GDD 22-7): 환생했으면 이름(진화체 또는 단계 이름) 옆에 ★. 투트랙이면(GDD 22-3) 이름표 옆에 트랙 전환 버튼
  const stars = rebirthMark(save.rebirth.count);
  const others = hd.onSwitchTrack ? save.otherTracks : [];
  // 이름표 테 꾸밈(GDD 25-9)을 입었으면 이름표를 늘 보인다
  if (stars || others.length > 0 || save.wear.plate) {
    const form = save.evolution.formId ? tryGetForm(save.evolution.formId) : undefined;
    const name = el('span', 'bha-small bha-room__name', formDisplayName(save.evolution, faction.id));
    if (stars) name.append(' ', stars);
    for (const t of others) {
      const to = getFaction(t.factionId);
      const sw = button({ label: toward(to.name), icon: 'i-swap', size: 'small', variant: 'ghost', onClick: () => hd.onSwitchTrack!(t.factionId) });
      sw.title = `${to.name} 트랙으로 바꾸기`;
      sw.dataset.sc = 'track-switch';
      sw.dataset.track = t.factionId;
      name.append(' ', sw);
      items.push({ el: sw });
    }
    hud.append(name);
  }
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
    door: () => (deckEmpty ? say('덱이 비어 있다. 상자에서 타일을 넣어야 출발할 수 있다.', 3600) : hd.onDepart()),
    altar: hd.onAltar,
    book: hd.onBook,
    chest: hd.onChest,
    dummy: hd.onPractice, // 훈련 인형 = 전투 연습 (GDD 18-3)
    shop: hd.onShop, // 상점 (C.63, GDD 28장 9번: 더보기 → 방 물건)
  };
  // 위/아래 순서: 위쪽 줄(책장·수련장) → 문 → 상자 → 인형 → 상태 칩 → 캐릭터 → 독 메뉴
  const order: RoomProp[] = ['book', 'altar', 'door', 'chest', 'shop', 'dummy'];
  const props = new Map<RoomProp, HTMLButtonElement>();
  for (const p of ROOM_PROPS) {
    const b = propButton({ prop: p, name: room.props[p], ...room.layout[p], art: !!artUrls(`prop.${p}`).src, alert: p === 'door' && deckEmpty });
    b.onclick = act[p];
    if (p === 'dummy') b.dataset.sc = 'dummy';
    props.set(p, b);
    scene.append(b);
  }
  const charArtUrls = roomCharArt(room, faction.id, save.evolution.tierIndex, artSkinOf(save));
  const loco = locoOf(faction, save.evolution.formId, charArtUrls);
  const char = characterButton(charArtUrls, '캐릭터', loco);
  const charAnim = animOf(char);
  /** 프레임 애니가 있는 동작이면 재생하고 true (GDD 26-3). 끝나면(hold·반복은 잠시 뒤) 대기로 돌아간다. 없으면 false = 기존 뛰는 반응 */
  let animTimer = 0;
  const playAnim = (action: 'win' | 'eat' | 'sleep'): boolean => {
    if (!charAnim?.has(action)) return false;
    window.clearTimeout(animTimer);
    charAnim.play(action, { onEnd: () => (animTimer = window.setTimeout(() => charAnim.stop(), 700)) });
    if (action === 'sleep') animTimer = window.setTimeout(() => charAnim.stop(), 3200); // 반복 동작: 말풍선 시간만큼
    return true;
  };
  const hopChar = () => {
    char.classList.remove('is-react');
    void char.offsetWidth;
    char.classList.add('is-react');
  };
  let hop = 0;
  const react = (line?: string, ms?: number) => {
    if (!playAnim('win')) {
      hopChar();
      window.clearTimeout(hop);
      hop = window.setTimeout(() => char.classList.remove('is-react'), 700);
    }
    say(line ?? pickLine(room.talk, mood === 'idle' && Math.random() < 0.4 ? 'happy' : mood), ms);
  };
  /** 지금 살아 있는 돌봄 요청의 말풍선 (GDD 82장) */
  const askLine = (): string | null => (n.careRequest ? pickLine(room.talk, careTalkKey('ask', n.careRequest.action)) : null);
  char.onclick = () => react(askLine() ?? undefined);
  // 머리 위 상태 칩 (허기·컨디션·리스크 게이지, 쇠약이면 그 이름). 누르면 상태 화면. 돌보기를 하면 그 자리에서 다시 그린다
  const statusBtn = el('button', 'bha-room__status');
  statusBtn.type = 'button';
  statusBtn.dataset.sc = 'status';
  statusBtn.style.setProperty('--head-y', `${charTopOffset(charArtUrls, loco)}px`);
  statusBtn.onclick = hd.onStatus;
  const paintGauges = () => {
    const chips = statusChips(n, faction);
    statusBtn.setAttribute('aria-label', `상태 보기: ${chips.map((c) => (c.value === null ? c.label : `${c.label} ${c.value}`)).join(', ')}`);
    // 글자·숫자 없이 아이콘 + 가는 게이지 바 한 줄씩 (GDD 18-10 v3.1). 위험 구간 줄만 danger 색
    statusBtn.replaceChildren(...chips.map((c) => {
      const row = el('span', `bha-room__gauge bha-room__gauge--${c.kind}${c.danger ? ' is-danger' : ''}`);
      const fill = el('span', 'bha-room__gaugefill');
      fill.style.width = `${c.value === null ? 100 : Math.max(0, Math.min(100, c.value))}%`;
      const track = el('span', 'bha-room__gaugetrack');
      track.append(fill);
      row.append(icon(c.icon), track);
      return row;
    }));
  };
  paintGauges();
  requestAnimationFrame(() => statusBtn.style.setProperty('--chip-h', `${statusBtn.offsetHeight}px`)); // 칩이 방 위 끝에 붙지 않게 (room.css)
  scene.append(char, statusBtn, bubble);

  // ── 하단 독 (GDD 18-2): 돌보기 3개 + 메뉴 아이콘 + 더보기 ──
  const dock = createDock({
    faction,
    foodCount: (food) => save.shared.food[food],
    onCare: (action, food) => {
      const before = { hunger: n.hunger, condition: n.condition, stability: n.stability, risk: n.risk };
      // 먹이는 개수제 (GDD 23-1): 그 먹이가 있어야 먹고 하나 쓴다
      if (action === 'feed') {
        if (!food || !feedNest(save, food)) return say('먹을 것이 없다. 원정에서 적을 이기면 먹이를 얻는다.', 3200);
      } else if (careNest(save, action) === 'refused') {
        // 요청이 없거나 다른 것을 청했을 때: 거절 말풍선, 효과 없음 (GDD 82장)
        hd.persist();
        dock.setRequest(n.careRequest?.action ?? null);
        return say(pickLine(room.talk, careTalkKey('refuse', action)), 3200);
      }
      dock.setRequest(n.careRequest?.action ?? null);
      hd.persist();
      paintGauges();
      say(careFeedback(faction, action, food ?? null, { hunger: n.hunger - before.hunger, condition: n.condition - before.condition, stability: n.stability - before.stability, risk: n.risk - before.risk }), 3200);
      // 먹기·잠 애니가 있으면 그것을, 없으면 기존 뛰는 반응 (다른 동작 애니로 대신하지 않는다)
      const clip = action === 'feed' ? 'eat' : action === 'sleep' ? 'sleep' : null;
      if (!(clip && playAnim(clip))) hopChar();
    },
    more: [
      { label: faction.rankBattleName, icon: 'i-title', onClick: hd.onRank },
      { label: '설정', icon: 'i-settings', onClick: hd.onSettings },
      { label: '도움말', icon: 'i-help', onClick: hd.onHelp },
      { label: '튜토리얼', icon: 'i-play', onClick: hd.onTutorial },
      ...(hd.onHogyoku ? [{ label: '붕옥', icon: 'i-evolve', onClick: hd.onHogyoku }] : []),
      { label: '사진', icon: 'i-frame', onClick: hd.onPhoto },
      { label: '다마고치 모드', icon: 'i-nest', onClick: hd.onTamago },
      ...(hd.onTest ? [{ label: '테스트', icon: 'i-settings', onClick: hd.onTest }] : []),
      ...(hd.onBackup ? [{ label: '백업·불러오기', icon: 'i-deck', onClick: hd.onBackup }] : []),
      { label: '처음 화면', icon: 'i-quit', onClick: hd.onTitle },
    ],
    onItemsChange: () => registerItems(),
  });

  const body = el('div', 'bha-room__body');
  body.append(scene);
  const warn = hd.resumeNote ? el('p', 'bha-room__note', `이어하기를 숨겼다: ${hd.resumeNote}`) : null;
  const main = mountApp(dev.view, { cls: 'bha-room' }, hud, ...(warn ? [warn] : []), body, dock.root);
  main.dataset.devLayout = 'visual'; // 기기 버튼 선택 순서 = 화면에 보이는 위치 순서 (GDD 63장)
  main.dataset.deck = `${deckCount}/${deckSize}`;

  // 선택 항목: 이어하기 → 물건 → 캐릭터 → 독(펼친 줄이 있으면 그것 먼저)
  function registerItems(): void {
    const list: SelectItem[] = [...items];
    for (const p of order) list.push({ el: props.get(p)! });
    list.push({ el: statusBtn }, { el: char });
    dev.setItems([...dock.items().filter((b) => b.closest('.bha-homedock__tray')).map((b) => ({ el: b })), ...list, ...dock.items().filter((b) => !b.closest('.bha-homedock__tray')).map((b) => ({ el: b }))], main);
  }
  registerItems();
  dock.setRequest(n.careRequest?.action ?? null);
  // 독 밖(장면)을 누르면 펼친 줄을 닫는다
  scene.addEventListener('pointerdown', () => dock.close());

  // ── 반응: 상태가 바뀌어 돌아왔을 때, 가끔 혼잣말 ──
  const greet = hd.greet;
  const ask = askLine();
  if (greet) window.setTimeout(() => main.isConnected && react(pickLine(room.talk, greet), 5200), 500);
  // 돌봄 요청이 있으면 (인사 뒤에) 요청 말풍선, 없으면 기분이 바뀌었을 때 한마디
  if (ask) window.setTimeout(() => main.isConnected && react(askLine() ?? ask, 4200), greet ? 5900 : 500);
  else if (!greet && lastMood !== null && lastMood !== mood && mood !== 'idle') window.setTimeout(() => main.isConnected && react(pickLine(room.talk, mood)), 500);
  lastMood = mood;
  // 방을 다시 그릴 때 이전 방의 혼잣말 타이머를 바로 끈다 (C.70: 화면을 빠르게 오가면 떨어진 방 DOM 이 최대 14초씩 쌓였다)
  window.clearInterval(idleTimer);
  const idle = idleTimer = window.setInterval(() => {
    if (!main.isConnected) return window.clearInterval(idle);
    // 돌봄 요청 시계 (GDD 82장): 방에 있는 동안 요청이 생기거나 사라진다
    const had = n.careRequest;
    const created = tickCare(save);
    if (created || had !== n.careRequest) { hd.persist(); dock.setRequest(n.careRequest?.action ?? null); }
    if (created) return react(askLine()!, 4200);
    if (Math.random() < 0.5) say(askLine() ?? pickLine(room.talk, mood));
  }, IDLE_TALK_MS);
}
