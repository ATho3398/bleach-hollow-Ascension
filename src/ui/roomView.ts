// 메인 방 화면 (GDD 16장, T-1): LCD 창 안의 방 장면. 방 안 물건이 곧 선택 항목이다.
//   문=원정 · 수련장=수련(진화 정보) · 책장=도감(진화체·칭호 탭) · 상자=덱·슬롯 · 장터=장터 화면(상점·온천·떠돌이 상인, C.201 GDD 127장) · 캐릭터=반응 · 캐릭터 머리 위 상태 칩=상태 화면(GDD 18-8). 아래 독(GDD 18-2·18-9)=돌보기 3개 + [더보기 ⋯] 하나(설정·도움말·사진·다마고치·트랙 전환·백업·처음 화면·닫기, GDD 100장).
// 위 한 줄: 원정 이어하기만 (이름표는 상태 칩 위, C.170). 방 모양·물건 이름·위치·말풍선 문구는 종족 설정(room)에서 읽는다 (종족 id 분기 없음).
import { fixParticles } from '../engine/josa';
import { petBuddy } from './bha/pet';
import { petName } from '../inventory';
import { BALANCE } from '../config/balance';
import { roomOf, ROOM_PROPS, type FactionConfig, type RoomProp, type RoomTalk } from '../engine/faction';
import { artSkinOf, careNest, feedNest, foodReactionFor, tickCare, type SaveData, artTierIndexOf } from '../game';
import type { FoodReaction } from '../engine/foodPref';
import { ownedTileList, placementLimitOf } from '../tilePresets';
import { artUrls } from '../data/art/manifest';
import { animOf } from './bha/animPlayer';
import { button, el, mountApp } from './bha/dom';
import { keepToastsLow } from './bha/toastLow';
import { applyBlink, blinkGauges, changedKeys, GAUGE_BLINK_AFTER, GAUGE_BLINK_PERIOD_MS } from './bha/gaugeBlink';
import { ACTION_FILL_MS, tween } from './bha/actionFx';
import { fullnessOf } from './bha/fullness';
import { homeMaxHp } from '../home';
import type { Device, SelectItem } from './bha/device';
import { artTopRatio, changeChip, changeItems, changeNoteBox, drawnHeadY, horiz, loadArtTopRatio, noteLift, placeChangeNote, setChangeSay, showChangeNote, type ChangeItem } from './bha/changeNote';
import { applyCarePose, bubbleClear, bubbleSpot, characterButton, charHeadOffset, charTopOffset, extraPropButtons, layoutOnFloor, lockProp, propButton, roomCharArt, sceneBox, type FloorEntry } from './bha/room';
import { careTalkKey, idleTalkKey, moodOf, pickLine, statusChips, type Mood } from './bha/roomLogic';
import { chipsAt, homeHpMeter, lerpShown, nestShown, paintStatusBox, rememberShown, riseFrom, shownBefore, statusInfoButton, statusNameTag, type GaugeShown } from './bha/statusBox';
import { feedsLeft, foodEffectsNow, previewHomeHp, reviveEvLossOf } from '../engine/nest';
import { confirmDialog } from './confirmDialog';
import { createDock } from './bha/dock';
import { careFeedback } from './bha/dockLogic';
import { getFaction } from '../data/factions';
import { playerElementsOf } from '../engine/evolution';

export interface RoomHandlers {
  onBook: () => void;
  onChest: () => void;
  /** 수련장 물건 (GDD 241-C 3, C.394): 책장 아래(옛 진급 시험 자리) — 훈련 인형 화면, 뒤로 = 방. 잠금 표시 없음(241-C 2) */
  onTraining: () => void;
  onStatus: () => void;
  /** 트랙 전환 (GDD 22-3): 쉬는 트랙 종족 id 로. 다른 트랙이 아직 안 열렸으면(5단계 전) null — 다른 종족으로 가는 유일한 길 (C.63) */
  onSwitchTrack: ((factionId: string) => void) | null;
  /** 붕옥 탭 (GDD 22-3): 열렸을 때만 독 더보기에 */
  onHogyoku: (() => void) | null;
  onSettings: () => void;
  onHelp: () => void;
  /** 상점 (GDD 25-9): 장터 안 (C.201, GDD 127장 2). 방에서는 빈사 안내 줄의 바로 가기만 */
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
  /** 사망 상태의 [부활] (GDD 102-3): 확인 창에서 [부활]을 고르면 부른다 */
  onRevive?: () => void;
  /** 월드맵 (GDD 130장 1, C.204 · 158장 2): 방 물건 outside — 월드맵(홈·시장·수련장·모험·탑·온천) */
  onOutside: () => void;
  /** 첫 모험 강제 (GDD 131장 2, C.207): 켜지면 월드맵 물건만 누를 수 있고 나머지 방 버튼은 흐린 잠김 */
  forceOutside?: boolean;
  /** 먹이를 먹인 직후 (막대 연출 전): 튜토리얼 회복 안내가 각본 값을 넣는다 (GDD 132장 3) */
  onFed?: () => void;
}

/** 마지막으로 방에 있을 때의 기분: 바뀌었으면 돌아왔을 때 캐릭터가 한마디 한다 (화면 사이에 남는 UI 상태) */
let lastMood: Mood | null = null;
const IDLE_TALK_MS = 14000;
let idleTimer = 0;
/** 발밑 체력 막대 다시 그리기 간격 (대기 회복 1분 2% — 몇 초마다 보이게) */
const HP_PAINT_MS = 3000;
let hpTimer = 0;

export function roomView(dev: Device, faction: FactionConfig, save: SaveData, hd: RoomHandlers): void {
  tickCare(save); // 돌봄 요청 (GDD 82장): 꺼 두었다 와도 최대 1개
  hd.persist();
  const room = roomOf(faction, save.wear.talk); // 말풍선 팩 (GDD 25-11): 입은 팩이 혼잣말 문구를 덮는다
  const n = save.nest;
  const RX = BALANCE.provisional.risk;
  // 덱 없음 (GDD 85장 11번, C.140): 출발 때 가진 타일 전부에서 놓는다. 타일이 없어도 빈 길로 떠날 수 있다
  const tileCount = ownedTileList(save.tiles, faction.id).length;
  const mood = moodOf({ weakened: n.weakened, tired: n.tired, collapsed: n.collapsed, condition: n.condition, risk: n.risk, riskLimit: RX.limit });

  // ── 위 한 줄 ── (원정 이어하기만. 상태는 캐릭터 머리 위 칩)
  const hud = el('header', 'bha-room__hud');
  const items: SelectItem[] = [];
  let resumeBtn: HTMLButtonElement | null = null;
  // 환생 표시 (GDD 22-7): 환생했으면 이름(진화체 또는 단계 이름) 옆에 ★.
  // C.170 (GDD 100장 #8): 방 위 이름+[트랙 전환] 줄은 없앴다 — 이름은 상태 칩 위 작은 이름표, 트랙 전환은 ··· 더보기의 한 칸('호로 트랙'/'사신 트랙', #9)
  const others = hd.onSwitchTrack ? save.otherTracks : [];
  // 이름표 테 꾸밈(GDD 25-9)을 입었거나 환생·투트랙이면 이름표를 보인다 (공용 statusBox — 온천도 같은 것)
  const nameTag = statusNameTag(save, faction, !!hd.onSwitchTrack);
  // 빈사·사망 (GDD 177장 — 102-3·102-7 의 방 위 큰 안내 띠는 삭제): 상태는 머리 위 칩으로만, 남은 시간·푸는 법은 칩 ⓘ. 방 장면은 늘 같은 크기.
  // 사망이면 할 수 있는 일([부활], 확인 창 기본 = 아니오)이 장면 왼쪽 위에 따로 — 아무 안내 없이 막히지 않게 (177장 3)
  let reviveBtn: HTMLButtonElement | null = null;
  if (n.dead) {
    reviveBtn = button({ label: '부활', icon: 'i-return', size: 'small', variant: 'danger', onClick: () => askRevive() });
    reviveBtn.classList.add('bha-room__revive');
    items.push({ el: reviveBtn });
  }
  /** 부활 확인 창 (GDD 102-3·102-7): 잃는 것 목록, 되돌릴 수 없어 기본 선택 = 아니오(danger) */
  function askRevive(): void {
    const loss = Math.round(reviveEvLossOf(n.bond) * 100);
    const list = el('ul', 'bha-riskexplain__list');
    for (const t of [
      `노력치 전부 −${loss}% (교감 ${Math.round(n.bond)} 기준)`,
      `진화 초기화 — 1단계 ${faction.tierNames[0]}(으)로 다시 시작`,
      fixParticles(`${faction.fullnessName}·컨디션은(는) 시작값`),
      `가진 물건·골드·타일·${faction.absorbActionName} 블록·도감·칭호·스킨은 그대로`,
      fixParticles(`${faction.rebirth.name}과(와) 다르다 — 보상·횟수 없음`),
    ]) list.append(el('li', '', t));
    confirmDialog({ title: '부활한다', body: '되돌릴 수 없다.', content: list, yes: '부활', no: '아니오', danger: true, onYes: () => hd.onRevive?.() });
  }
  if (hd.resume) {
    resumeBtn = button({ label: '모험 이어하기', icon: 'i-return', size: 'small', variant: 'primary', onClick: hd.resume.onResume });
    resumeBtn.title = hd.resume.info;
    resumeBtn.append(el('small', 'bha-room__resumeinfo', hd.resume.info));
    hud.append(resumeBtn);
    items.push({ el: resumeBtn });
  }

  // ── 장면 ──
  const scene = sceneBox(room);
  // 장비는 가방 첫 탭 (GDD 109장 4번, C.180): 방의 따로 된 [장비] 버튼은 없앴다
  if (n.dead) scene.classList.add('is-dead'); // 사망 = 어두운 방 (GDD 102-7)
  const bubble = el('div', 'bha-room__bubble');
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  bubble.hidden = true;
  let bubbleTimer = 0;
  /** 상태 값이 바뀌는 중(차오름 + 깜빡임)이 끝나는 시각 (GDD 208장 0·1): 이때까지는 말풍선이 떠도 상태창을 숨기지 않는다 */
  let statusBusyUntil = 0;
  const markStatusBusy = (ms: number) => (statusBusyUntil = Math.max(statusBusyUntil, Date.now() + ms + GAUGE_BLINK_PERIOD_MS * GAUGE_BLINK_AFTER));
  /** 말풍선 자리 (C.194, GDD 120장 2 · 208장 2): 머리 위가 기본. 방 위 끝을 넘으면 캐릭터 옆(방 가운데 쪽).
   *  keep(상태 값이 바뀌는 순간 — 상태창을 숨기지 않음)이면 상태창(박스·ⓘ·이름표)·방 물건 버튼과 겹치지 않는 자리를 찾는다: 머리 위 → 옆(밀어내기) → 반대쪽 옆,
   *  다 막히면 말풍선을 생략한다(GDD 233장 5 — 알림 띠로 돌리지 않는다). 생략했으면 false */
  const placeBubble = (keep: boolean): boolean => {
    bubble.classList.remove('is-side', 'is-left');
    scene.style.setProperty('--bubble-shift', '0px');
    scene.style.setProperty('--char-half', `${char.offsetWidth / 2}px`);
    // offsetTop·offsetLeft 는 transform 을 빼고 잰다: 말풍선 top = 아래 끝(translate −100%), 캐릭터 상자 left = 가운데(translate −50%)
    const first = bubbleSpot(bubble.offsetTop, bubble.offsetHeight, char.offsetLeft, scene.clientWidth);
    if (!keep || scene.clientWidth === 0) {
      // 그냥 대화(값 변화 없음) = 예전 자리 그대로, 상태창은 잠깐 숨는다 (208장 0 사용자 정정). 붙기 전(잴 수 없음)도 기본 자리
      if (first !== 'above') bubble.classList.add('is-side', ...(first === 'left' ? ['is-left'] : []));
      return true;
    }
    const sideFirst: 'left' | 'right' = first === 'above' ? (char.offsetLeft > scene.clientWidth / 2 ? 'left' : 'right') : first;
    const spots: ('above' | 'left' | 'right')[] = [...(first === 'above' ? ['above' as const] : []), sideFirst, sideFirst === 'left' ? 'right' : 'left'];
    const sceneBox = scene.getBoundingClientRect();
    // 피할 것: 상태창 박스·ⓘ·이름표(박스 위로 삐져나옴)·방 물건 버튼·떠 있는 알림 띠
    const blockers = [statusBtn, statusInfoBtn, ...(nameTag ? [nameTag] : []), ...(note.hidden ? [] : [note]), ...props.values(), ...extras, ...document.querySelectorAll<HTMLElement>('.bha-toast')]
      .filter((b) => b.isConnected && b.offsetWidth > 0).map((b) => b.getBoundingClientRect());
    const gap = parseFloat(getComputedStyle(scene).getPropertyValue('--bha-sp-2')) || 4;
    for (const spot of spots) {
      bubble.classList.toggle('is-side', spot !== 'above');
      bubble.classList.toggle('is-left', spot === 'left');
      scene.style.setProperty('--bubble-shift', '0px');
      let r = bubble.getBoundingClientRect();
      if (bubbleClear(r, sceneBox, blockers)) return true;
      if (spot === 'above') continue;
      // 옆 자리가 상태창·이름표에 걸리면 걸린 것 바깥까지 캐릭터에서 더 떨어뜨린다
      const hits = blockers.filter((b) => r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom);
      const shift = Math.max(0, ...hits.map((b) => (spot === 'right' ? b.right - r.left : r.right - b.left) + gap));
      scene.style.setProperty('--bubble-shift', `${Math.ceil(shift)}px`);
      r = bubble.getBoundingClientRect();
      if (bubbleClear(r, sceneBox, blockers)) return true;
    }
    scene.style.setProperty('--bubble-shift', '0px');
    bubble.classList.remove('is-side', 'is-left');
    bubble.hidden = true; // 말풍선을 못 띄우면 그냥 생략 — 대신 띄우던 알림 띠는 뺐다 (GDD 233장 5)
    return false;
  };
  /** keep = 상태 값이 바뀌는 순간의 말(돌보기 결과 등). 아니어도 값이 바뀌는 중(차오름·깜빡임)이면 keep (GDD 208장 0·1) */
  const say = (text: string, ms = 3000, keep = false) => {
    // 값이 바뀌는 중(바뀐 값 알림이 떠 있음)에 하는 말은 말풍선 대신 그 알림 위 줄로 (GDD 209장 4-1 — 상태창 옆·위 구석으로 보내지 않는다).
    // 자리가 정말 모자라면 칩만 남기고 글은 생략
    if (!note.hidden) {
      setChangeSay(note, text);
      if (placeNote()) return;
    }
    const keepStatus = keep || Date.now() < statusBusyUntil;
    bubble.textContent = text;
    // 말풍선은 캐릭터 머리 위 가운데 (C.176, GDD 104장 1). 그냥 대화 동안 상태 칩은 잠깐 숨긴다(208장 0 정정 — 그대로).
    // 상태 값이 바뀔 때는 상태창을 숨기지 않고(208장 1) 말풍선을 상태창과 안 겹치는 자리로(208장 2)
    scene.classList.toggle('is-saying', !keepStatus);
    dev.refresh(); // 말풍선 동안 숨은 상태 칩은 기기 초점에서 빠진다 (GDD 176장 4)
    bubble.hidden = false;
    bubble.classList.remove('is-pop');
    void bubble.offsetWidth;
    bubble.classList.add('is-pop');
    window.clearTimeout(bubbleTimer);
    if (!placeBubble(keepStatus)) {
      scene.classList.remove('is-saying');
      dev.refresh();
      return;
    }
    bubbleTimer = window.setTimeout(() => {
      bubble.hidden = true;
      scene.classList.remove('is-saying');
      dev.refresh();
    }, ms);
  };

  // 번호 쟁탈전·진급 시험(rank)은 방에 없다 — 월드맵 장소 (GDD 241-C 3). 이름(room.props.rank)만 월드맵이 쓴다
  const act: Record<Exclude<RoomProp, 'rank'>, () => void> = {
    book: hd.onBook,
    chest: hd.onChest,
    outside: hd.onOutside, // 월드맵 물건 (GDD 130장 1·158장 2): 옛 모험 문·장터 자리 (137장 3 고정)
    altar: hd.onTraining, // 수련장 (GDD 241-C 3): 책장 아래
    hogyoku: () => hd.onHogyoku?.(), // 붕옥 아이콘 (GDD 242장 2): 등장한 뒤에만 선다
  };
  // 위/아래 순서: 위쪽 줄(책장) → 월드맵 → 상자 → 수련장(책장 아래) → 상태 칩 → 캐릭터 → 독 메뉴
  const order: RoomProp[] = ['book', 'outside', 'hogyoku', 'chest', 'altar'];
  const props = new Map<RoomProp, HTMLButtonElement>();
  const floorEntries: FloorEntry[] = []; // 바닥 위에 놓일 것 전부 (GDD 95장 A1): 물건·캐릭터는 여기 등록해야 바닥 밖으로 안 나간다
  for (const p of ROOM_PROPS) {
    if (p === 'rank') continue;
    if (p === 'hogyoku' && !hd.onHogyoku) continue; // 붕옥은 등장 전에는 안 보인다 (GDD 242장 2 — 잠금 아이콘 아님)
    if (room.layout[p].hidden) continue; // UI 배치 도구로 숨긴 물건 (GDD 175장)
    const b = propButton({ prop: p, name: room.props[p], ...room.layout[p], art: !!artUrls(`prop.${p}`).src, fallbackArt: p === 'outside' ? 'prop.door' : undefined });
    b.onclick = act[p];
    props.set(p, b);
    scene.append(b);
    floorEntries.push({ el: b, foot: room.layout[p], kind: 'prop' });
  }
  const extras = extraPropButtons(scene, room.extras, floorEntries); // 새 물건 (GDD 175장): 아이콘만, 누르면 '준비 중'
  const charArtUrls = roomCharArt(room, faction.id, artTierIndexOf(save), artSkinOf(save));
  const char = characterButton(charArtUrls, '캐릭터');
  applyCarePose(char, n, { home: true }); // 돌봄 상태 자세 (GDD 171장): 종이인형 = 빈사·쇠약·피곤 → 빈사 자세, 사망 → 쓰러짐, 평소 → 홈 대기. 아니면 눕히고 흐리게(GDD 102-7)
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
    say(line ?? pickLine(room.talk, mood === 'idle' ? idleTalkKey(n.bond) : mood), ms);
  };
  /** 지금 살아 있는 돌봄 요청의 말풍선 (GDD 82장) */
  const askLine = (): string | null => (n.careRequest ? pickLine(room.talk, careTalkKey('ask', n.careRequest.action)) : null);
  char.onclick = () => react(askLine() ?? undefined);
  // 머리 위 상태 박스 (GDD 189장 4 · 190장 3 — C.281 모양 그대로): 어두운 박스 안 줄마다 아이콘·막대·숫자 + 박스 오른쪽 바깥 ⓘ 하나. 누르면 상태 화면. 돌보기를 하면 그 자리에서 다시 그린다
  const chipRow = el('div', 'bha-room__chips');
  const statusBtn = el('button', 'bha-room__status');
  statusBtn.type = 'button';
  statusBtn.dataset.sc = 'status';
  scene.style.setProperty('--head-y', `${charTopOffset(charArtUrls)}px`); // 장면에 둬서 상태 칩과 말풍선이 같이 읽는다 (C.160)
  statusBtn.onclick = hd.onStatus;
  /** 지금 상태창 값 한 벌 (GDD 201장: 방을 다시 열 때 오른 값을 차오르게 비교) */
  const shownNow = (): GaugeShown => nestShown(n, previewHomeHp(n, Date.now()).fraction);
  /** over = 연출 중 칩 값 덮어쓰기 (GDD 132장 3 · 201장: 돌보기·회복 뒤 막대가 0.8초 동안 차오르고 숫자도 따라 오름). 덮어쓰기가 없으면 보여 준 값을 기억 */
  const paintGauges = (over?: GaugeShown) => {
    const chips = over ? chipsAt(statusChips(n, faction), over) : statusChips(n, faction);
    // 목록형 상태 게이지 (GDD 189장 4 · 190장 3, C.281 모양) — 공용 부품(statusBox, 온천도 같은 것). 자세한 뜻은 ⓘ · 누르면 상태 화면
    paintStatusBox(statusBtn, chips, nameTag, '상태 보기: ');
    applyBlink(scene); // 바뀌는 값 깜빡임은 다시 그려도 이어진다 (GDD 208장 3)
    if (!over) rememberShown(n, shownNow());
  };
  // 방에 들어올 때 (GDD 201장 1·3): 지난번 방·온천·가방에서 보여 준 값보다 오른 값(진화로 가득·부활·쉬는 동안 회복 등)은 이전 값에서 차오른다
  const enterBefore = shownBefore(n);
  const enterFrom = riseFrom(enterBefore, shownNow());
  paintGauges(enterFrom ?? undefined);
  /** 칩 줄 크기: 방 위 끝에 붙지 않게(--chip-h, 이름표 포함) · 장면 끝에서 잘리지 않게(--chips-half) — room.css */
  const measureChips = () => {
    scene.style.setProperty('--chip-h', `${chipRow.offsetHeight + (nameTag?.offsetHeight ?? 0)}px`);
    scene.style.setProperty('--chips-half', `${Math.ceil(chipRow.offsetWidth / 2) + 6}px`); // 박스 반폭 (ⓘ 는 박스 안, GDD 238장)
  };
  requestAnimationFrame(measureChips);
  // 상태 ⓘ (C.176, GDD 104장 2): 칩 오른쪽 위. 누르면(폰)·올리면(PC) 지금 칩마다 무슨 뜻인지·풀리는 법이 창으로 뜬다
  const statusInfoBtn = statusInfoButton(() => statusChips(n, faction), faction, n);
  // '무엇이 바뀌나' 알림 (GDD 209장): 상태창 박스 바로 아래 ~ 캐릭터 머리 위 빈 공간, 바뀐 값만 칩 한 줄. 깜빡임이 끝나면 사라진다
  const note = changeNoteBox();
  // 한 줄 높이 재기용 숨은 칩 (상태창을 올릴 거리 — 글자 크기 1.15 등에 따라 달라진다)
  const probe = el('span', 'bha-room__changerow bha-room__changeprobe');
  probe.append(changeChip({ key: 'hunger', label: '', icon: 'i-hunger', up: true, good: true, delta: 20, unit: '' }));
  chipRow.append(statusBtn, statusInfoBtn, note, probe);
  /** 알림 자리 (209장 1 · 마스터 결정): 늘 상태창 아래 ~ 머리 위 한 곳. 상태창·ⓘ·이름표·물건 버튼·그린 머리와 겹치면 가로로만 밀고, 그래도 안 되면 숨기고 false */
  const placeNote = (): boolean => placeChangeNote(note, {
    scene, head: { ...horiz(char.getBoundingClientRect()), y: drawnHeadY(char) ?? scene.getBoundingClientRect().top + char.offsetTop + charHeadOffset(charArtUrls) }, // 그린 머리 윗변 (실제 픽셀 → 못 읽으면 계산식) · 캐릭터 상자 좌우
    blockers: [statusBtn, statusInfoBtn, ...(nameTag ? [nameTag] : []), ...props.values(), ...extras],
  });
  /**
   * 상태창 묶음 자리 (C.350 마스터 결정 — C.347 의 '늘 위로 올리기' 대신): 박스 아래 끝 = 그린 머리 윗변 − (알림 한 줄 + 위아래 여백). 그 이상 올리지 않는다.
   * 알림이 없을 때도 같은 자리(값이 바뀔 때 박스가 안 움직임). 그 자리가 장면 위 끝 하한을 넘으면(사람 종이인형처럼 머리가 높을 때) 그때만 박스를 조이고(.is-tight),
   * 그래도 모자라면 하한에 둔다 — 알림 줄은 박스 바로 아래, 머리 윗 몇 px 와 살짝 겹친다(NOTE_HEAD_OVERLAP). 머리 높이 = 그려진 캔버스의 첫 안 투명한 줄(못 읽으면 정지 그림 — 처음 한 번 읽어 두고, 읽은 뒤 다시 놓는다)
   */
  const liftForNote = () => {
    const src = charArtUrls.src;
    if (!src || !scene.isConnected || scene.clientWidth === 0) return;
    const ratio = artTopRatio(src);
    if (ratio === undefined) {
      void loadArtTopRatio(src).then(() => main.isConnected && place());
      return;
    }
    const art = char.querySelector<HTMLElement>('.bha-char__body canvas, .bha-char__body img');
    const ar = art?.getBoundingClientRect();
    if (ratio === null || !ar || !ar.height) return;
    const drawnTop = drawnHeadY(char) ?? ar.top + ratio * ar.height; // 실제로 그려진 머리(움직이는 캔버스) — 아직 안 그려졌으면 정지 그림의 첫 안 투명한 줄
    const gap = parseFloat(getComputedStyle(scene).getPropertyValue('--bha-sp-1')) || 2;
    /** 지금 모양(tight)에서: 안 옮긴 박스 아래 끝 · 끝까지 올린 아래 끝(위 끝 하한)까지 거리 · 머리 위 자리까지 옮길 거리(+ 위, − 아래) */
    const measure = (tight: boolean) => {
      chipRow.classList.toggle('is-tight', tight);
      measureChips();
      scene.style.setProperty('--note-lift', '0px');
      const natural = statusBtn.getBoundingClientRect().bottom;
      scene.style.setProperty('--note-lift', '9999px');
      const room = natural - statusBtn.getBoundingClientRect().bottom;
      return { room, need: noteLift({ statusBottom: natural, drawnTop, noteH: probe.offsetHeight, gap, lift: 0 }) };
    };
    // 1) 머리 위 자리 그대로 → 2) 위 끝 하한에 막히면 박스를 조인다 → 3) 그래도 모자라면 하한(알림은 머리 윗 몇 px 와 겹침)
    let m = measure(false);
    if (m.need > m.room) m = measure(true);
    scene.style.setProperty('--note-lift', `${Math.min(m.need, m.room)}px`);
    scene.dataset.noteRoom = `${Math.round(m.need)}/${Math.round(m.room)}`; // 옮길 거리 / 올릴 수 있는 거리 (proof 용)
  };

  /** 바뀐 값 알림을 띄운다 — 떴으면 true (그럼 말풍선에서 수치 변화 문장을 뺀다, 209장 4) */
  const noteChanges = (items: readonly ChangeItem[], ms: number, sayText?: string): boolean => {
    if (!showChangeNote(note, items, ms, { say: sayText ?? null })) return false;
    // 떠 있던 말풍선(요청·혼잣말)은 닫는다 — 알림과 겹치지 않게, 그냥 대화로 숨은 상태창(과 그 아래 알림)이 다시 보이게 (209장 4-1)
    window.clearTimeout(bubbleTimer);
    bubble.hidden = true;
    scene.classList.remove('is-saying');
    dev.refresh();
    return placeNote();
  };
  // 발밑 체력 막대 (GDD 123장 3): 홈 체력 '현재 / 최대' — 기존 체력 막대(meter player), 30% 아래면 위험 색. 대기 회복은 아래 타이머가 다시 그린다
  const hpBox = el('div', 'bha-room__hp');
  const maxHp = homeMaxHp(save);
  /** 행동 연출 중이면 1분 시계가 막대를 덮어 그리지 않는다 */
  let fxOn = false;
  // C.281 모양 그대로 (GDD 192장 2): 기존 체력 막대(meter player) 하나, 숫자 '현재 / 최대' 는 막대 안 가운데, 30% 아래 위험 구간·위험 색
  const paintHp = (fraction?: number) => {
    const f = fraction ?? previewHomeHp(n, Date.now()).fraction;
    hpBox.replaceChildren(homeHpMeter(f, maxHp));
    applyBlink(scene);
  };
  paintHp(enterFrom?.hp);
  // 지난번에 보여 준 값에서 바뀐 값(오름·내림)만 깜빡임 (GDD 208장 3·4) — 오른 값은 차오르는 동안 + 끝난 뒤
  const enterChanged = changedKeys(enterBefore, shownNow());
  blinkGauges(scene, enterChanged, enterFrom ? ACTION_FILL_MS : 0);
  if (enterChanged.length > 0) markStatusBusy(enterFrom ? ACTION_FILL_MS : 0);
  const enterItems = changeItems(enterBefore, shownNow(), faction, enterChanged); // 방 들어올 때 바뀐 값 알림 (209장 3) — 장면이 붙은 뒤 자리를 재고 띄운다
  if (enterFrom) {
    const to = shownNow();
    fxOn = true;
    tween(ACTION_FILL_MS, (t) => {
      if (!hpBox.isConnected && t < 1) return;
      const v = lerpShown(enterFrom, to, t);
      paintGauges(v);
      paintHp(v.hp);
    }, () => {
      fxOn = false;
      paintGauges();
      paintHp();
    }, false);
  }
  scene.append(char, hpBox, chipRow, bubble);
  // 이름표는 칩 위에 얹힌다: 칩이 방 위 끝에 붙지 않게 잴 때 이름표 높이도 넣는다
  floorEntries.push({ el: char, foot: room.characterFoot, kind: 'char' });
  // 빈사·쓰러짐 자세 (GDD 176장): 머리 위에 칩 자리가 없어 칩이 머리로 내려오면(띠로 방이 낮아짐) 칩·ⓘ 를 캐릭터 옆 위로
  const lowPose = n.collapsed || n.dead || !!n.weakened || !!n.tired;
  const placeStatus = () => {
    chipRow.classList.remove('is-side', 'is-right');
    if (scene.isConnected) measureChips();
    if (!lowPose || !scene.isConnected || scene.clientWidth === 0) return;
    const cs = getComputedStyle(scene);
    const natural = parseFloat(cs.getPropertyValue('--char-y')) + charTopOffset(charArtUrls) - (parseFloat(cs.getPropertyValue('--bha-sp-4')) || 0);
    const lowered = Math.max(0, -(parseFloat(scene.style.getPropertyValue('--note-lift')) || 0)); // 머리 위 알림 자리로 내린 거리 (C.350)
    if (!(chipRow.offsetTop > natural + lowered + 1)) return; // 머리 위에 들어간다
    scene.style.setProperty('--char-half', `${char.offsetWidth / 2}px`);
    const right = char.offsetLeft < scene.clientWidth * 0.35; // 캐릭터가 왼쪽에 있으면 오른쪽 옆
    chipRow.classList.add('is-side', ...(right ? ['is-right'] : []));
  };
  const place = () => {
    layoutOnFloor(scene, room.floor, floorEntries);
    liftForNote();
    placeStatus();
  };
  if (enterItems.length > 0) requestAnimationFrame(() => main.isConnected && noteChanges(enterItems, enterFrom ? ACTION_FILL_MS : 0));
  place(); // 붙기 전이라 크기를 못 재면 기준 크기로, 붙은 뒤 다시 잰 값으로 놓는다
  requestAnimationFrame(place);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(scene);

  // ── 하단 독 (GDD 18-2): 돌보기 3개 + 메뉴 아이콘 + 더보기 ──
  const dock = createDock({
    faction,
    foodCount: (food) => save.shared.food[food],
    foodEffectsNow: (food) => foodEffectsNow(food, n, Date.now()), // 카드 = 지금 먹이면 실제로 움직이는 효과 전부 (GDD 211장)
    feedsLeft: () => ({ left: feedsLeft(n, Date.now()), max: BALANCE.provisional.nest.feedLimit.max }),
    onCare: (action, food) => {
      const before = { hunger: n.hunger, condition: n.condition, risk: n.risk };
      let reaction: FoodReaction = null;
      const hpBefore = previewHomeHp(n, Date.now()).fraction;
      // 먹이는 개수제 (GDD 23-1): 그 먹이가 있어야 먹고 하나 쓴다
      if (n.dead) return say(pickLine(room.talk, 'collapsed')); // 사망: 돌보기 안 됨 (GDD 102-3)
      if (action === 'feed') {
        reaction = food ? foodReactionFor(save, food) : null; // 선호·비선호·싸구려 반응 (GDD 235장 2·3) — 먹기 전에 정한다
        const fed = food ? feedNest(save, food) : null;
        if (!fed) return say(fixParticles(`먹을 것이 없다. 모험에서 적을 이기면 ${faction.foodGroupName}을(를) 얻는다.`));
        if (fed === 'refused') {
          // 같은 먹이 10분에 2개를 넘김 (GDD 234장 3): 먹이 그대로·효과·교감 없음 — 돌봄 거절처럼 말풍선만
          hd.persist();
          dock.refreshFeeds();
          return say(pickLine(room.talk, 'picky'));
        }
        if (fed === 'spat') {
          // 10분에 3개를 넘김 (GDD 109장 6): 먹이는 없어지고 효과 없음 — 뱉는 모션 + 말풍선
          hd.persist();
          dock.refreshFeeds();
          char.classList.remove('is-spit', 'is-react');
          void char.offsetWidth;
          char.classList.add('is-spit');
          window.setTimeout(() => char.classList.remove('is-spit'), 700);
          return say(pickLine(room.talk, 'spit'));
        }
        hd.onFed?.(); // 튜토리얼 회복 안내: 먹인 순간 각본 값(배부름·체력 가득)을 넣어 연출이 그 값까지 차게 (GDD 132장 3)
        dock.refreshFeeds();
      } else if (careNest(save, action) === 'refused') {
        // 요청이 없거나 다른 것을 청했을 때: 거절 말풍선, 효과 없음 (GDD 82장)
        hd.persist();
        dock.setRequest(n.careRequest?.action ?? null);
        return say(pickLine(room.talk, careTalkKey('refuse', action)));
      }
      dock.setRequest(n.careRequest?.action ?? null);
      hd.persist();
      // 행동 진행 연출 (GDD 132장 3): 값은 이미 저장 — 막대가 ACTION_FILL_MS 동안 전 값에서 새 값으로 차오르고 숫자도 따라 오른다
      const from = nestShown(before, hpBefore);
      const to = shownNow();
      fxOn = true;
      const changed = changedKeys(from, to);
      blinkGauges(scene, changed); // 바뀐 값(오름·내림)의 막대·아이콘만 깜빡임 (GDD 208장 3)
      if (changed.length > 0) markStatusBusy(ACTION_FILL_MS); // 그동안 뜨는 말풍선은 상태창을 숨기지 않는다 (208장 1)
      const delta = { hunger: n.hunger - before.hunger, condition: n.condition - before.condition, risk: n.risk - before.risk };
      // 바뀐 값 알림 (209장 2·3) + 위 줄 행동 글(4-1: 수치 문장 없이 행동 이름 — 예전 결과 말풍선 대신)
      const noted = noteChanges(changeItems(from, to, faction, changed), ACTION_FILL_MS, careFeedback(faction, action, food ?? null, delta, false));
      tween(ACTION_FILL_MS, (t) => {
        if (!main.isConnected) return;
        const v = lerpShown(from, to, t);
        paintGauges(v);
        paintHp(v.hp); // 먹이 체력 회복 (GDD 123장 4)
      }, () => {
        fxOn = false;
        if (main.isConnected) {
          paintGauges();
          paintHp();
        }
      });
      if (action === 'feed') {
        // 먹는 모션: 먹기 애니가 없으면 막대가 차는 동안 우물우물 (room.css is-eating)
        char.classList.add('is-eating');
        window.setTimeout(() => char.classList.remove('is-eating'), ACTION_FILL_MS);
      }
      const reactKey = reaction === 'like' ? 'foodLike' : reaction === 'dislike' ? 'foodDislike' : reaction === 'cheap' ? 'foodCheap' : null;
      if (reactKey) say(pickLine(room.talk, reactKey)); // 먹이 반응 말풍선 (GDD 235장 2 — 선호·비선호는 표 없이 이것으로만 드러남)
      else if (!noted) say(careFeedback(faction, action, food ?? null, delta)); // 알림이 못 뜬 때(값이 안 바뀜·자리 없음)만 예전 결과 말풍선 (수치 문장 포함)
      // 먹기·잠 애니가 있으면 그것을, 없으면 기존 뛰는 반응 (다른 동작 애니로 대신하지 않는다)
      const clip = action === 'feed' ? 'eat' : action === 'sleep' ? 'sleep' : null;
      if (!(clip && playAnim(clip))) hopChar();
      // 반응 동작 (GDD 235장 사용자 추가 — 선호 = 기쁨 · 비선호 = 싫음): 먹고 난 뒤 좋아하면 한 번 더 뛰고, 싫어하면 뱉을 때처럼 고개를 젓는다
      if (reaction === 'like') window.setTimeout(() => main.isConnected && hopChar(), ACTION_FILL_MS);
      else if (reaction === 'dislike') {
        window.setTimeout(() => { if (!main.isConnected) return; char.classList.add('is-spit'); window.setTimeout(() => char.classList.remove('is-spit'), 700); }, ACTION_FILL_MS);
      }
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
    onItemsChange: (focus) => registerItems(focus),
  });

  const body = el('div', 'bha-room__body');
  body.append(scene);
  if (reviveBtn) body.append(reviveBtn); // 장면 밖(어두운 사망 장면 필터를 안 받게), 장면 왼쪽 위에 겹쳐 둔다 (GDD 177장 3)
  const warn = hd.resumeNote ? el('p', 'bha-room__note', hd.resumeNote) : null; // C.311: 이어 하지 못한 모험 안내 한 줄 (GDD 192장 1)
  const main = mountApp(dev.view, { cls: 'bha-room bha-room--home bha-v2' }, ...(hud.childElementCount > 0 ? [hud] : []), ...(warn ? [warn] : []), body, dock.root);
  // 위 가장자리 공용 알림 띠는 방에서는 아래쪽(하단 버튼 줄 바로 위)으로 — 이름표·상태창을 덮지 않게 (GDD 209장 보충)
  keepToastsLow(main, {
    floor: () => dock.root.getBoundingClientRect().top,
    ceil: () => scene.getBoundingClientRect().top,
    blockers: () => [...props.values(), ...extras, ...(reviveBtn ? [reviveBtn] : []), ...(resumeBtn ? [resumeBtn] : [])], // 물건 이름표(물건 버튼)·버튼. 발밑 체력 막대는 2.6초 잠깐 덮을 수 있음(폰은 그 줄에 자리가 없다)
  });
  main.dataset.devLayout = 'visual'; // 기기 버튼 선택 순서 = 화면에 보이는 위치 순서 (GDD 63장)
  if (hd.forceOutside) main.classList.add('is-force-out'); // 첫 모험 강제 (GDD 131장 2): 월드맵 물건 말고는 흐린 잠김 (room.css)
  main.dataset.tiles = `${tileCount}/${placementLimitOf(save)}`;
  if (save.shared.wanderer.visit) main.dataset.wanderer = ''; // 떠돌이 상인이 와 있다 (GDD 85장 5번·127장 3) — 배지는 월드맵 시장에 (130장 2)

  // 선택 항목: 이어하기 → 물건 → 캐릭터 → 독(펼친 줄이 있으면 그것 먼저)
  function registerItems(focus: HTMLElement | null = null): void {
    const list: SelectItem[] = [...items];
    for (const p of order) {
      const b = props.get(p);
      if (b) list.push({ el: b });
    }
    for (const b of extras) list.push({ el: b });
    list.push({ el: statusBtn }, { el: statusInfoBtn }, { el: char });
    const tray = dock.items().filter((b) => b.closest('.bha-homedock__tray'));
    // 펼친 줄(더보기·먹이)이 방 물건을 덮으므로, 펼친 동안은 물건·캐릭터를 고르지 않는다 — 덮인 칸에 하이라이트가 가던 문제 (C.182 UI 검수)
    dev.setItems([...tray.map((b) => ({ el: b })), ...(tray.length > 0 ? [] : list), ...dock.items().filter((b) => !b.closest('.bha-homedock__tray')).map((b) => ({ el: b }))], main, undefined, focus);
  }
  dock.setRequest(n.careRequest?.action ?? null);
  // 첫 선택 (GDD 100장 #11): 월드맵 물건(옛 모험 문 자리). 돌봄 요청 중이면 그 돌보기 버튼 — 기기는 새 화면에서 초점 있는 항목부터 고른다
  const firstPick = n.careRequest ? dock.items().find((b) => b.dataset.care === n.careRequest!.action) : props.get('outside');
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
  window.clearInterval(hpTimer);
  const hpTick = hpTimer = window.setInterval(() => (main.isConnected ? fxOn || paintHp() : window.clearInterval(hpTick)), HP_PAINT_MS);
  const idle = idleTimer = window.setInterval(() => {
    if (!main.isConnected) return window.clearInterval(idle);
    dock.refreshFeeds(); // 먹이 한도가 10분 뒤 다시 열린다 (GDD 109장 6)
    // 돌봄 요청 시계 (GDD 82장): 방에 있는 동안 요청이 생기거나 사라진다
    const had = n.careRequest;
    const created = tickCare(save);
    if (created || had !== n.careRequest) { hd.persist(); dock.setRequest(n.careRequest?.action ?? null); }
    if (created) return react(askLine()!, 4200);
    if (Math.random() < 0.5) say(askLine() ?? pickLine(room.talk, mood === 'idle' ? idleTalkKey(n.bond) : mood));
  }, IDLE_TALK_MS);
}
