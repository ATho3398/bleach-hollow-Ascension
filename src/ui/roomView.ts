// 메인 방 화면 (GDD 16장, T-1): LCD 창 안의 방 장면. 방 안 물건이 곧 선택 항목이다.
//   문=원정 · 수련장=수련(진화 정보) · 책장=도감(진화체·칭호 탭) · 상자=덱·슬롯 · 장터=장터 화면(상점·온천·떠돌이 상인, C.201 GDD 127장) · 캐릭터=반응 · 캐릭터 머리 위 상태 칩=상태 화면(GDD 18-8). 아래 독(GDD 18-2·18-9)=돌보기 3개 + [더보기 ⋯] 하나(설정·도움말·사진·다마고치·트랙 전환·백업·처음 화면·닫기, GDD 100장).
// 위 한 줄: 원정 이어하기만 (이름표는 상태 칩 위, C.170). 방 모양·물건 이름·위치·말풍선 문구는 종족 설정(room)에서 읽는다 (종족 id 분기 없음).
import { infoTip } from './bha/infoTip';
import { fixParticles } from '../engine/josa';
import { roomStatusInfo } from './bha/statusInfo';
import { petBuddy } from './bha/pet';
import { petName } from '../inventory';
import { BALANCE } from '../config/balance';
import { marketOf, roomOf, ROOM_PROPS, type FactionConfig, type RoomProp, type RoomTalk } from '../engine/faction';
import { artSkinOf, careNest, feedNest, tickCare, type SaveData, artTierIndexOf } from '../game';
import { ownedTileList, placementLimitOf } from '../tilePresets';
import { artUrls } from '../data/art/manifest';
import { animOf } from './bha/animPlayer';
import { button, el, icon, meter, mountApp } from './bha/dom';
import { hpNumbers } from './bha/battle';
import { ACTION_FILL_MS, tween } from './bha/actionFx';
import { fullnessOf } from './bha/fullness';
import { homeMaxHp } from '../home';
import type { Device, SelectItem } from './bha/device';
import { bubbleSpot, characterButton, charTopOffset, layoutOnFloor, propButton, roomCharArt, sceneBox, type FloorEntry } from './bha/room';
import { careTalkKey, dyingClock, idleTalkKey, moodOf, pickLine, statusChips, CARE_STATUS_HINTS, type Mood } from './bha/roomLogic';
import { CARE_STATUS_NAMES, dyingLeftMs, feedsLeft, previewHomeHp, reviveEvLossOf } from '../engine/nest';
import { notice } from './bha/dom';
import { confirmDialog } from './confirmDialog';
import { createDock } from './bha/dock';
import { careFeedback } from './bha/dockLogic';
import { rebirthMark } from './rebirthView';
import { getFaction } from '../data/factions';
import { formDisplayName, playerElementsOf } from '../engine/evolution';
import { shownName } from './displayName';

export interface RoomHandlers {
  onBook: () => void;
  onChest: () => void;
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
  /** 빈사 남은 시간 칸 (혼잣말 타이머가 고친다) */
  let dyingClockEl: HTMLElement | null = null;
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
  // 빈사·사망 (GDD 102-3·102-7·102장 수정): 위 줄에 큰 안내 + 할 수 있는 일. 사망이면 [부활](확인 창 기본 = 아니오), 빈사면 남은 시간(시:분) + [상점] [보관함]
  if (n.dead) {
    const reviveBtn = button({ label: '부활', icon: 'i-return', size: 'small', variant: 'danger', onClick: () => askRevive() });
    hud.append(notice('danger', '할 수 있는 건 부활뿐이다.', { title: `${CARE_STATUS_NAMES.dead} — 오래 돌보지 않아 숨이 끊어졌다`, icon: 'i-broken' }), reviveBtn);
    hud.classList.add('is-care');
    items.push({ el: reviveBtn });
  } else if (n.collapsed) {
    const shopBtn = button({ label: marketOf(faction).shopsLabel, icon: 'i-rare', size: 'small', variant: 'primary', onClick: hd.onShop });
    const chestBtn = button({ label: room.props.chest, icon: 'i-deck', size: 'small', onClick: hd.onChest });
    const box = notice('danger', CARE_STATUS_HINTS.collapsed, { title: `${CARE_STATUS_NAMES.collapsed} — 구급상자가 필요하다 · 남은 시간 `, icon: 'i-broken' });
    dyingClockEl = el('b', 'bha-num', dyingClock(dyingLeftMs(n, Date.now()) ?? 0));
    box.querySelector('.bha-notice__title')?.append(dyingClockEl);
    hud.append(box, shopBtn, chestBtn);
    hud.classList.add('is-care');
    items.push({ el: shopBtn }, { el: chestBtn });
  }
  /** 부활 확인 창 (GDD 102-3·102-7): 잃는 것 목록, 되돌릴 수 없어 기본 선택 = 아니오(danger) */
  function askRevive(): void {
    const loss = Math.round(reviveEvLossOf(n.bond) * 100);
    const list = el('ul', 'bha-riskexplain__list');
    for (const t of [
      `노력치 전부 −${loss}% (교감 ${Math.round(n.bond)} 기준)`,
      `진화 초기화 — 1단계 ${faction.tierNames[0]}(으)로 다시 시작`,
      fixParticles(`${faction.fullnessName}·컨디션·${faction.stabilityName}은(는) 시작값`),
      '가진 물건·골드·타일·흡수 특성·도감·칭호·스킨은 그대로',
      fixParticles(`${faction.rebirth.name}과(와) 다르다 — 보상·횟수 없음`),
    ]) list.append(el('li', '', t));
    confirmDialog({ title: '부활한다', body: '되돌릴 수 없다.', content: list, yes: '부활', no: '아니오', danger: true, onYes: () => hd.onRevive?.() });
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
  // 장비는 가방 첫 탭 (GDD 109장 4번, C.180): 방의 따로 된 [장비] 버튼은 없앴다
  if (n.dead) scene.classList.add('is-dead'); // 사망 = 어두운 방 (GDD 102-7)
  const bubble = el('div', 'bha-room__bubble');
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  bubble.hidden = true;
  let bubbleTimer = 0;
  /** 말풍선 자리 (C.194, GDD 120장 2): 머리 위가 기본. 방 위 끝을 넘으면 방 위 끝 안쪽, 캐릭터 상자 옆(방 가운데 쪽)에 둔다 — 아래로 끌어내려 머리를 가리지 않는다 */
  const placeBubble = () => {
    bubble.classList.remove('is-side', 'is-left');
    scene.style.setProperty('--char-half', `${char.offsetWidth / 2}px`);
    // offsetTop·offsetLeft 는 transform 을 빼고 잰다: 말풍선 top = 아래 끝(translate −100%), 캐릭터 상자 left = 가운데(translate −50%)
    const spot = bubbleSpot(bubble.offsetTop, bubble.offsetHeight, char.offsetLeft, scene.clientWidth);
    if (spot === 'above') return;
    bubble.classList.add('is-side');
    if (spot === 'left') bubble.classList.add('is-left');
  };
  const say = (text: string, ms = 3000) => {
    bubble.textContent = text;
    // 말풍선은 캐릭터 머리 위 가운데 (C.176, GDD 104장 1 — C.170 의 '옆 허리 높이'는 캐릭터 오른쪽에 떠 보였다). 대사 동안 상태 칩은 잠깐 숨긴다
    scene.classList.add('is-saying');
    bubble.hidden = false;
    bubble.classList.remove('is-pop');
    void bubble.offsetWidth;
    bubble.classList.add('is-pop');
    placeBubble();
    window.clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(() => {
      bubble.hidden = true;
      scene.classList.remove('is-saying');
    }, ms);
  };

  // 수련장(altar)은 방에 없다 — 월드맵 장소 (GDD 158장 1). 이름(room.props.altar)만 월드맵이 쓴다
  const act: Record<Exclude<RoomProp, 'altar'>, () => void> = {
    book: hd.onBook,
    chest: hd.onChest,
    outside: hd.onOutside, // 월드맵 물건 (GDD 130장 1·158장 2): 옛 모험 문·장터 자리 (137장 3 고정)
  };
  // 위/아래 순서: 위쪽 줄(책장) → 월드맵 → 상자 → 상태 칩 → 캐릭터 → 독 메뉴
  const order: RoomProp[] = ['book', 'outside', 'chest'];
  const props = new Map<RoomProp, HTMLButtonElement>();
  const floorEntries: FloorEntry[] = []; // 바닥 위에 놓일 것 전부 (GDD 95장 A1): 물건·캐릭터는 여기 등록해야 바닥 밖으로 안 나간다
  for (const p of ROOM_PROPS) {
    if (p === 'altar') continue;
    const b = propButton({ prop: p, name: room.props[p], ...room.layout[p], art: !!artUrls(`prop.${p}`).src, fallbackArt: p === 'outside' ? 'prop.door' : undefined });
    b.onclick = act[p];
    props.set(p, b);
    scene.append(b);
    floorEntries.push({ el: b, foot: room.layout[p], kind: 'prop' });
  }
  const charArtUrls = roomCharArt(room, faction.id, artTierIndexOf(save), artSkinOf(save));
  const char = characterButton(charArtUrls, '캐릭터');
  if (n.collapsed || n.dead) char.classList.add('is-collapsed'); // 쓰러진 모습 (그림이 없어 캐릭터를 눕히고 흐리게, GDD 102-7)
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
  // 머리 위 상태 칩 (허기·컨디션·리스크 게이지, 쇠약이면 그 이름). 누르면 상태 화면. 돌보기를 하면 그 자리에서 다시 그린다
  const statusBtn = el('button', 'bha-room__status');
  statusBtn.type = 'button';
  statusBtn.dataset.sc = 'status';
  scene.style.setProperty('--head-y', `${charTopOffset(charArtUrls)}px`); // 장면에 둬서 상태 칩과 말풍선이 같이 읽는다 (C.160)
  statusBtn.onclick = hd.onStatus;
  /** over = 연출 중 칩 값 덮어쓰기 (GDD 132장 3: 돌보기 뒤 막대가 천천히 참) */
  const paintGauges = (over?: Partial<Record<string, number>>) => {
    const chips = statusChips(n, faction).map((c) => (over?.[c.kind] !== undefined && c.value !== null ? { ...c, value: over[c.kind]! } : c));
    statusBtn.setAttribute('aria-label', `상태 보기: ${chips.map((c) => (c.value === null ? c.label : `${c.label} ${c.value}`)).join(', ')}`);
    // 상태 칩(쇠약·피곤·쓰러짐) 풀리는 법 한 줄 툴팁 (GDD 102-7)
    statusBtn.title = chips.filter((c) => c.hint).map((c) => `${c.label}: ${c.hint}`).join('\n');
    // 글자·숫자 없이 아이콘 + 가는 게이지 바 한 줄씩 (GDD 18-10 v3.1). 위험 구간 줄만 danger 색
    statusBtn.replaceChildren(...chips.map((c) => {
      const row = el('span', `bha-room__gauge bha-room__gauge--${c.kind}${c.danger ? ' is-danger' : ''}`);
      const fill = el('span', 'bha-room__gaugefill');
      fill.style.width = `${c.value === null ? 100 : Math.max(0, Math.min(100, c.value))}%`;
      const track = el('span', 'bha-room__gaugetrack');
      track.append(fill);
      // 숫자 한 칸 (GDD 100장 #12): 아이콘 · 막대 · 값
      // 상태 칩은 숫자 대신 이름 (막대는 가득)
      row.append(icon(c.icon), track, el('span', 'bha-room__gaugenum bha-num', c.value === null ? c.label : String(Math.round(c.value))));
      if (c.hint) row.title = c.hint;
      return row;
    }));
    if (nameTag) statusBtn.prepend(nameTag);
  };
  paintGauges();
  requestAnimationFrame(() => scene.style.setProperty('--chip-h', `${statusBtn.offsetHeight + (nameTag?.offsetHeight ?? 0)}px`)); // 칩이 방 위 끝에 붙지 않게 (room.css)
  // 상태 ⓘ (C.176, GDD 104장 2): 칩 오른쪽 위. 누르면(폰)·올리면(PC) 지금 칩마다 무슨 뜻인지·풀리는 법이 창으로 뜬다
  const statusInfoBtn = infoTip('상태', () => roomStatusInfo(statusChips(n, faction), faction));
  statusInfoBtn.classList.add('bha-room__statusinfo');
  // 발밑 체력 막대 (GDD 123장 3): 홈 체력 '현재 / 최대' — 기존 체력 막대(meter player), 30% 아래면 위험 색. 대기 회복은 아래 타이머가 다시 그린다
  const hpBox = el('div', 'bha-room__hp');
  const maxHp = homeMaxHp(save);
  /** 행동 연출 중이면 1분 시계가 막대를 덮어 그리지 않는다 */
  let fxOn = false;
  const paintHp = (fraction?: number) => {
    const f = fraction ?? previewHomeHp(n, Date.now()).fraction;
    const { now, max } = hpNumbers(f * maxHp, maxHp);
    hpBox.replaceChildren(meter({ kind: 'player', label: '체력', icon: 'i-heal', value: now, max, compact: true, inside: true, zoneLow: 0.3, danger: f < 0.3, valueText: `${now} / ${max}` }));
  };
  paintHp();
  scene.append(char, hpBox, statusBtn, statusInfoBtn, bubble);
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
    feedsLeft: () => ({ left: feedsLeft(n, Date.now()), max: BALANCE.provisional.nest.feedLimit.max }),
    onCare: (action, food) => {
      const before = { hunger: n.hunger, condition: n.condition, stability: n.stability, risk: n.risk };
      const hpBefore = previewHomeHp(n, Date.now()).fraction;
      // 먹이는 개수제 (GDD 23-1): 그 먹이가 있어야 먹고 하나 쓴다
      if (n.dead) return say(pickLine(room.talk, 'collapsed')); // 사망: 돌보기 안 됨 (GDD 102-3)
      if (action === 'feed') {
        const fed = food ? feedNest(save, food) : null;
        if (!fed) return say('먹을 것이 없다. 원정에서 적을 이기면 먹이를 얻는다.');
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
      const from = { hunger: fullnessOf(before.hunger), cond: before.condition, stab: before.stability, risk: before.risk };
      const to = { hunger: fullnessOf(n.hunger), cond: n.condition, stab: n.stability, risk: n.risk };
      const hpAfter = previewHomeHp(n, Date.now()).fraction;
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      fxOn = true;
      tween(ACTION_FILL_MS, (t) => {
        if (!main.isConnected) return;
        paintGauges({ hunger: lerp(from.hunger, to.hunger, t), cond: lerp(from.cond, to.cond, t), stab: lerp(from.stab, to.stab, t), risk: lerp(from.risk, to.risk, t) });
        paintHp(lerp(hpBefore, hpAfter, t)); // 먹이 체력 회복 (GDD 123장 4)
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
  if (hd.forceOutside) main.classList.add('is-force-out'); // 첫 모험 강제 (GDD 131장 2): 월드맵 물건 말고는 흐린 잠김 (room.css)
  main.dataset.tiles = `${tileCount}/${placementLimitOf(save)}`;
  if (save.shared.wanderer.visit) main.dataset.wanderer = ''; // 떠돌이 상인이 와 있다 (GDD 85장 5번·127장 3) — 배지는 월드맵 시장에 (130장 2)

  // 선택 항목: 이어하기 → 물건 → 캐릭터 → 독(펼친 줄이 있으면 그것 먼저)
  function registerItems(): void {
    const list: SelectItem[] = [...items];
    for (const p of order) list.push({ el: props.get(p)! });
    list.push({ el: statusBtn }, { el: statusInfoBtn }, { el: char });
    const tray = dock.items().filter((b) => b.closest('.bha-homedock__tray'));
    // 펼친 줄(더보기·먹이)이 방 물건을 덮으므로, 펼친 동안은 물건·캐릭터를 고르지 않는다 — 덮인 칸에 하이라이트가 가던 문제 (C.182 UI 검수)
    dev.setItems([...tray.map((b) => ({ el: b })), ...(tray.length > 0 ? [] : list), ...dock.items().filter((b) => !b.closest('.bha-homedock__tray')).map((b) => ({ el: b }))], main);
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
    if (dyingClockEl) dyingClockEl.textContent = dyingClock(dyingLeftMs(n, Date.now()) ?? 0); // 빈사 남은 시간
    // 돌봄 요청 시계 (GDD 82장): 방에 있는 동안 요청이 생기거나 사라진다
    const had = n.careRequest;
    const created = tickCare(save);
    if (created || had !== n.careRequest) { hd.persist(); dock.setRequest(n.careRequest?.action ?? null); }
    if (created) return react(askLine()!, 4200);
    if (Math.random() < 0.5) say(askLine() ?? pickLine(room.talk, mood === 'idle' ? idleTalkKey(n.bond) : mood));
  }, IDLE_TALK_MS);
}
