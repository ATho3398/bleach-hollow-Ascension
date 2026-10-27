// 메인 방 화면 (GDD 16장, T-1): LCD 창 안의 방 장면. 방 안 물건이 곧 선택 항목이다.
//   문=원정 · 수련장=수련(진화 정보) · 책장=도감(진화체·칭호 탭) · 상자=덱·슬롯 · 훈련 인형=전투 연습 · 상점=상점(C.63, 이름은 두 종족 공통 GDD 34-2) · 캐릭터=반응 · 캐릭터 머리 위 상태 칩=상태 화면(GDD 18-8). 아래 독(GDD 18-2·18-9)=돌보기 3개 + [더보기 ⋯] 하나(설정·도움말·사진·다마고치·트랙 전환·백업·처음 화면·닫기, GDD 100장).
// 위 한 줄: 원정 이어하기만 (이름표는 상태 칩 위, C.170). 방 모양·물건 이름·위치·말풍선 문구는 종족 설정(room)에서 읽는다 (종족 id 분기 없음).
import { petBuddy } from './bha/pet';
import { petName } from '../inventory';
import { BALANCE } from '../config/balance';
import { roomOf, ROOM_PROPS, type FactionConfig, type RoomProp, type RoomTalk } from '../engine/faction';
import { artSkinOf, careNest, feedNest, tickCare, type SaveData } from '../game';
import { ownedTileList, placementLimitOf } from '../tilePresets';
import { artUrls } from '../data/art/manifest';
import { animOf } from './bha/animPlayer';
import { button, el, icon, mountApp } from './bha/dom';
import type { Device, SelectItem } from './bha/device';
import { locoOf } from './bha/loco';
import { characterButton, charTopOffset, layoutOnFloor, propButton, roomCharArt, sceneBox, type FloorEntry } from './bha/room';
import { careTalkKey, moodOf, pickLine, statusChips, type Mood } from './bha/roomLogic';
import { createDock } from './bha/dock';
import { careFeedback } from './bha/dockLogic';
import { rebirthMark } from './rebirthView';
import { getFaction } from '../data/factions';
import { formDisplayName, playerElementsOf } from '../engine/evolution';
import { shownName } from './displayName';

export interface RoomHandlers {
  onDepart: () => void;
  onAltar: () => void;
  onBook: () => void;
  onChest: () => void;
  onStatus: () => void;
  /** 트랙 전환 (GDD 22-3): 쉬는 트랙 종족 id 로. 다른 트랙이 아직 안 열렸으면(5단계 전) null — 다른 종족으로 가는 유일한 길 (C.63) */
  onSwitchTrack: ((factionId: string) => void) | null;
  /** 붕옥 탭 (GDD 22-3): 열렸을 때만 독 더보기에 */
  onHogyoku: (() => void) | null;
  onSettings: () => void;
  onHelp: () => void;
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
  /** 대기 보상 아이콘 (GDD 92장 1번): 쌓인 시간 배지(없으면 null) · 누르면 대기 모드 창 */
  idle?: { badge: string | null; onOpen: () => void };
  /** 들어오자마자 한 번 할 말 (GDD 24-1: 꺼 둔 동안 배고파졌으면 'hungry' — 문구는 종족 설정 room.talk) */
  greet?: RoomTalk | null;
}

/** 마지막으로 방에 있을 때의 기분: 바뀌었으면 돌아왔을 때 캐릭터가 한마디 한다 (화면 사이에 남는 UI 상태) */
let lastMood: Mood | null = null;
const IDLE_TALK_MS = 14000;
let idleTimer = 0;

export function roomView(dev: Device, faction: FactionConfig, save: SaveData, hd: RoomHandlers): void {
  tickCare(save); // 돌봄 요청 (GDD 82장): 꺼 두었다 와도 최대 1개
  hd.persist();
  const room = roomOf(faction, save.wear.talk); // 말풍선 팩 (GDD 25-11): 입은 팩이 혼잣말 문구를 덮는다
  const n = save.nest;
  const RX = BALANCE.provisional.risk;
  // 덱 없음 (GDD 85장 11번, C.140): 출발 때 가진 타일 전부에서 놓는다. 타일이 없어도 빈 길로 떠날 수 있다
  const tileCount = ownedTileList(save.tiles, faction.id).length;
  const mood = moodOf({ weakened: n.weakened, condition: n.condition, risk: n.risk, riskLimit: RX.limit });

  // ── 위 한 줄 ── (원정 이어하기만. 상태는 캐릭터 머리 위 칩)
  const hud = el('header', 'bha-room__hud');
  const items: SelectItem[] = [];
  let resumeBtn: HTMLButtonElement | null = null;
  // 환생 표시 (GDD 22-7): 환생했으면 이름(진화체 또는 단계 이름) 옆에 ★.
  // C.170 (GDD 100장 #8): 방 위 이름+[트랙 전환] 줄은 없앴다 — 이름은 상태 칩 위 작은 이름표, 트랙 전환은 ··· 더보기의 한 칸('호로 트랙'/'사신 트랙', #9)
  const stars = rebirthMark(save.rebirth.count);
  const others = hd.onSwitchTrack ? save.otherTracks : [];
  // 이름표 테 꾸밈(GDD 25-9)을 입었거나 환생·투트랙이면 이름표를 보인다
  let nameTag: HTMLElement | null = null;
  if (stars || others.length > 0 || save.wear.plate) {
    nameTag = el('span', 'bha-small bha-room__name', shownName(formDisplayName(save.evolution, faction.id)));
    if (stars) nameTag.append(' ', stars);
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
  const say = (text: string, ms = 3000) => {
    bubble.textContent = text;
    // 말풍선은 캐릭터 옆 허리 높이 (GDD 100장 #13, 머리 위 상태 칩과 떨어뜨림): 캐릭터가 오른쪽 절반이면 왼쪽, 아니면 오른쪽
    bubble.classList.toggle('is-left', parseFloat(scene.style.getPropertyValue('--char-x')) > 55);
    bubble.hidden = false;
    bubble.classList.remove('is-pop');
    void bubble.offsetWidth;
    bubble.classList.add('is-pop');
    window.clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(() => (bubble.hidden = true), ms);
  };

  const act: Record<RoomProp, () => void> = {
    door: () => hd.onDepart(),
    altar: hd.onAltar,
    book: hd.onBook,
    chest: hd.onChest,
    shop: hd.onShop, // 상점 (C.63, GDD 28장 9번: 더보기 → 방 물건)
  };
  // 위/아래 순서: 위쪽 줄(책장·수련장) → 문 → 상자 → 인형 → 상태 칩 → 캐릭터 → 독 메뉴
  const order: RoomProp[] = ['book', 'altar', 'door', 'chest', 'shop'];
  const props = new Map<RoomProp, HTMLButtonElement>();
  const floorEntries: FloorEntry[] = []; // 바닥 위에 놓일 것 전부 (GDD 95장 A1): 물건·캐릭터는 여기 등록해야 바닥 밖으로 안 나간다
  for (const p of ROOM_PROPS) {
    const b = propButton({ prop: p, name: room.props[p], ...room.layout[p], art: !!artUrls(`prop.${p}`).src, alert: p === 'shop' && save.shared.wanderer.visit !== null });
    b.onclick = act[p];
    if (p === 'altar') b.dataset.sc = 'altar'; // 수련장(훈련 인형 모양) = 단축키 T
    props.set(p, b);
    scene.append(b);
    floorEntries.push({ el: b, foot: room.layout[p], kind: 'prop' });
  }
  const charArtUrls = roomCharArt(room, faction.id, save.evolution.tierIndex, artSkinOf(save));
  const loco = locoOf(faction, save.evolution.formId, charArtUrls);
  const char = characterButton(charArtUrls, '캐릭터', loco);
  // 데리고 다니는 펫 (GDD 90장): 캐릭터 옆 발치에 작게 (그림이 없으면 아이콘 원)
  const buddy = petBuddy(save.shared.pets.active, petName(save.shared.pets.active ?? '', faction));
  if (buddy) char.append(buddy);
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
  scene.style.setProperty('--head-y', `${charTopOffset(charArtUrls, loco)}px`); // 장면에 둬서 상태 칩과 말풍선이 같이 읽는다 (C.160)
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
      // 숫자 한 칸 (GDD 100장 #12): 아이콘 · 막대 · 값
      row.append(icon(c.icon), track, el('span', 'bha-room__gaugenum bha-num', c.value === null ? '' : String(Math.round(c.value))));
      return row;
    }));
    if (nameTag) statusBtn.prepend(nameTag);
  };
  paintGauges();
  requestAnimationFrame(() => scene.style.setProperty('--chip-h', `${statusBtn.offsetHeight + (nameTag?.offsetHeight ?? 0)}px`)); // 칩이 방 위 끝에 붙지 않게 (room.css)
  scene.append(char, statusBtn, bubble);
  // 이름표는 칩 위에 얹힌다: 칩이 방 위 끝에 붙지 않게 잴 때 이름표 높이도 넣는다
  floorEntries.push({ el: char, foot: room.characterFoot, kind: 'char' });
  const place = () => layoutOnFloor(scene, room.floor, floorEntries);
  place(); // 붙기 전이라 크기를 못 재면 기준 크기로, 붙은 뒤 다시 잰 값으로 놓는다
  requestAnimationFrame(place);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(scene);

  // ── 하단 독 (GDD 18-2): 돌보기 3개 + 메뉴 아이콘 + 더보기 ──
  const dock = createDock({
    faction,
    foodCount: (food) => save.shared.food[food],
    onCare: (action, food) => {
      const before = { hunger: n.hunger, condition: n.condition, stability: n.stability, risk: n.risk };
      // 먹이는 개수제 (GDD 23-1): 그 먹이가 있어야 먹고 하나 쓴다
      if (action === 'feed') {
        if (!food || !feedNest(save, food)) return say('먹을 것이 없다. 원정에서 적을 이기면 먹이를 얻는다.');
      } else if (careNest(save, action) === 'refused') {
        // 요청이 없거나 다른 것을 청했을 때: 거절 말풍선, 효과 없음 (GDD 82장)
        hd.persist();
        dock.setRequest(n.careRequest?.action ?? null);
        return say(pickLine(room.talk, careTalkKey('refuse', action)));
      }
      dock.setRequest(n.careRequest?.action ?? null);
      hd.persist();
      paintGauges();
      say(careFeedback(faction, action, food ?? null, { hunger: n.hunger - before.hunger, condition: n.condition - before.condition, stability: n.stability - before.stability, risk: n.risk - before.risk }));
      // 먹기·잠 애니가 있으면 그것을, 없으면 기존 뛰는 반응 (다른 동작 애니로 대신하지 않는다)
      const clip = action === 'feed' ? 'eat' : action === 'sleep' ? 'sleep' : null;
      if (!(clip && playAnim(clip))) hopChar();
    },
    more: [
      // C.170 (GDD 100장 #17·#80): 4열 — 설정·도움말·사진·다마고치 / 백업·처음 화면·닫기. '첫 걸음 목표'는 도움말 안 [목표]로
      { label: '설정', icon: 'i-settings', onClick: hd.onSettings },
      { label: '도움말', icon: 'i-help', onClick: hd.onHelp },
      { label: '사진', icon: 'i-frame', onClick: hd.onPhoto },
      { label: '다마고치', icon: 'i-nest', onClick: hd.onTamago },
      // 트랙 전환 (GDD 22-3·100장 #8·#9): '사신 트랙'처럼 조사 없이 (종족 이름은 설정 파일)
      ...others.map((t) => ({ label: `${getFaction(t.factionId).name} 트랙`, icon: 'i-swap', onClick: () => hd.onSwitchTrack!(t.factionId) })),
      ...(hd.onHogyoku ? [{ label: '붕옥', icon: 'i-evolve', onClick: hd.onHogyoku }] : []),
      ...(hd.onTest ? [{ label: '테스트', icon: 'i-settings', onClick: hd.onTest }] : []),
      ...(hd.onBackup ? [{ label: '백업·불러오기', icon: 'i-deck', onClick: hd.onBackup }] : []),
      { label: '처음 화면', icon: 'i-quit', onClick: hd.onTitle },
    ],
    idle: hd.idle,
    onItemsChange: () => registerItems(),
  });

  const body = el('div', 'bha-room__body');
  body.append(scene);
  const warn = hd.resumeNote ? el('p', 'bha-room__note', `이어하기를 숨겼다: ${hd.resumeNote}`) : null;
  const main = mountApp(dev.view, { cls: 'bha-room' }, ...(hud.childElementCount > 0 ? [hud] : []), ...(warn ? [warn] : []), body, dock.root);
  main.dataset.devLayout = 'visual'; // 기기 버튼 선택 순서 = 화면에 보이는 위치 순서 (GDD 63장)
  main.dataset.tiles = `${tileCount}/${placementLimitOf(save)}`;
  if (save.shared.wanderer.visit) main.dataset.wanderer = ''; // 떠돌이 상인이 와 있다 (GDD 85장 5번) — 상점 물건에 알림 점

  // 선택 항목: 이어하기 → 물건 → 캐릭터 → 독(펼친 줄이 있으면 그것 먼저)
  function registerItems(): void {
    const list: SelectItem[] = [...items];
    for (const p of order) list.push({ el: props.get(p)! });
    list.push({ el: statusBtn }, { el: char });
    dev.setItems([...dock.items().filter((b) => b.closest('.bha-homedock__tray')).map((b) => ({ el: b })), ...list, ...dock.items().filter((b) => !b.closest('.bha-homedock__tray')).map((b) => ({ el: b }))], main);
  }
  dock.setRequest(n.careRequest?.action ?? null);
  // 첫 선택 (GDD 100장 #11): 모험(문). 돌봄 요청 중이면 그 돌보기 버튼 — 기기는 새 화면에서 초점 있는 항목부터 고른다
  const firstPick = n.careRequest ? dock.items().find((b) => b.dataset.care === n.careRequest!.action) : props.get('door');
  firstPick?.focus({ preventScroll: true });
  registerItems();
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
