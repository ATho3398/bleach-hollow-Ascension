// 캐릭터 변경 창 (GDD 12-1 v6.129, C.498 — 사용자 2026-11-19 "더보기에는 트랙 변경만 만들고, 그거 누르면, 카드 형식으로 호로, 사신, 내가 해금한 초월자 쭉 이어져있는 식으로"):
// 방 ··· 더보기의 [캐릭터 변경] 한 칸 → 이 창. 카드가 가로로 쭉(넘치면 가로 넘김 — 손가락·마우스 끌기, PC 휠·←→ 키).
// 순서 = 데이터 순서(종족 설정 FACTIONS → 초월자 데이터 TRANSCENDENTS). 카드 = 지금 그림·이름·단계, 지금 캐릭터 표시, 누르면 기존 전환(switchTrack).
// 아직 안 열린 종족 = 자물쇠·흐림 + 여는 조건 한 줄, 안 연 초월자 = 카드 없음. 종족·초월자 id 로 가르지 않는다 — 트랙 종류 설정·종족 설정만 본다.
// 플레이어 문구에는 '트랙'을 쓰지 않는다 (12-1).
import { BALANCE } from '../config/balance';
import { FACTIONS, getFaction } from '../data/factions';
import { TRANSCENDENTS, tryGetTranscendent } from '../data/transcendents';
import { allTracks, characterTracks, noEvolutionLabel, trackIdOf, trackNameOf, trackRulesOf, type SaveData, type TrackKey } from '../game';
import { button, el, icon } from './bha/dom';
import { dexCard } from './bha/dexGrid';
import { edgeCue, enableDragScrollX, revealInRow } from './bha/dragScroll';
import { trapModalFocus } from './bha/modalFocus';
import { getOverlayHost, registerLayer } from './bha/overlayHost';
import { trackArt, transcendentArt } from './hogyokuView';

type Track = Pick<SaveData, TrackKey>;

/** 아직 안 열린 종족 카드의 여는 조건 (GDD 12-1: 두 번째 종족은 붕옥이 등장할 때 = 어느 종족이든 한 종족 스토리 전부 클리어) */
export const CHARACTER_LOCK_TEXT = '한 종족 스토리를 전부 깨면 열린다';
/** 창 제목·더보기 칸 이름 */
export const CHARACTER_PICK_LABEL = '캐릭터 변경';

export interface CharacterCard {
  /** 카드 키: 열린 캐릭터 = trackIdOf(그 트랙), 안 열린 종족 = 종족 id */
  key: string;
  name: string;
  /** 단계 줄 ('3단계 아쥬커스'), 진화 없는 트랙(초월자) = 트랙 종류 이름, 잠김 = 여는 조건 */
  sub: string;
  current: boolean;
  locked: boolean;
  track: Track | null;
}

/** 카드 목록 (데이터 순서): 종족마다 그 종족 캐릭터 카드(없으면 칸이 남았을 때만 잠긴 카드) → 초월자 데이터 순서로 연 초월자 → 데이터에 없는 나머지 트랙 */
export function characterCards(save: SaveData, factions: readonly { id: string; name: string }[] = FACTIONS, transcendents: readonly { id: string }[] = TRANSCENDENTS): CharacterCard[] {
  const curId = trackIdOf(save);
  const tracks = allTracks(save);
  const used = new Set<Track>();
  const out: CharacterCard[] = [];
  const add = (t: Track): void => {
    used.add(t);
    const id = trackIdOf(t);
    out.push({ key: id, name: trackNameOf(t), sub: stageLine(t), current: id === curId, locked: false, track: t });
  };
  const room = characterTracks(save).length < BALANCE.provisional.twoTrack.maxTracks;
  for (const f of factions) {
    const t = tracks.find((x) => trackRulesOf(x).fusion && x.factionId === f.id);
    if (t) add(t);
    else if (room) out.push({ key: f.id, name: f.name, sub: CHARACTER_LOCK_TEXT, current: false, locked: true, track: null });
  }
  for (const d of transcendents) {
    const t = tracks.find((x) => !used.has(x) && x.transcendentId === d.id);
    if (t) add(t);
  }
  for (const t of tracks) if (!used.has(t)) add(t);
  return out;
}

/** 단계 줄: '3단계 아쥬커스' (단계 이름 = 종족 설정 tierNames). 진화가 없는 트랙 = 트랙 종류 이름('초월자') */
function stageLine(t: Track): string {
  const nl = noEvolutionLabel(t);
  if (nl) return nl.kind;
  const i = t.evolution.tierIndex;
  return `${i + 1}단계 ${getFaction(t.factionId).tierNames[i] ?? ''}`.trim();
}

/** 캐릭터 변경 창을 연다. onSwitch = 기존 전환 흐름(트랙 키). 지금 캐릭터 카드를 누르면 그냥 닫힌다. 돌려주는 함수는 창을 닫는다 */
export function characterPickerDialog(save: SaveData, onSwitch: (trackId: string) => void): () => void {
  const cards = characterCards(save);
  const layer = el('div', 'bha-overlay bha-overlay--in-app bha-itemdialog bha-charpick');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', CHARACTER_PICK_LABEL);
  const modal = el('div', 'bha-modal bha-win bha-itemmodal bha-charpick__win');
  let closed = false;
  let untrap: () => void = () => {};
  let unregister: () => void = () => {};
  const close = (): void => {
    if (closed) return;
    closed = true;
    unregister();
    layer.remove();
    untrap();
  };
  // ── 머리: 아이콘 · 제목 · ✕ ──
  const head = el('div', 'bha-win-head bha-itemmodal__headrow');
  const headArt = el('span', 'bha-itemmodal__icon');
  headArt.append(icon('i-swap'));
  const titles = el('div', 'bha-itemmodal__titles');
  titles.append(el('small', 'bha-itemmodal__heading', '캐릭터'), el('h3', 'bha-itemmodal__name', CHARACTER_PICK_LABEL));
  const x = button({ label: '닫기', iconOnly: true, icon: 'i-close', variant: 'ghost', onClick: close });
  x.classList.add('bha-itemmodal__close');
  head.append(headArt, titles, x);
  // ── 본문: 카드 줄 + 안내 한 줄 ──
  const body = el('div', 'bha-win-body bha-charpick__body');
  const strip = el('div', 'bha-charpick__strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', CHARACTER_PICK_LABEL);
  const note = el('p', 'bha-charpick__note', '카드를 누르면 그 캐릭터로 바뀐다.');
  note.setAttribute('role', 'status');
  const btns = cards.map((c) => {
    const marks = el('span', 'bha-charpick__sub', c.sub);
    const art = c.track ? cardArt(c.track) : lockArt();
    const b = dexCard({
      name: c.name,
      art,
      marks,
      unknown: c.locked,
      ...(c.current ? { badge: '지금' } : {}),
      cls: ['bha-charpick__card', c.current ? 'is-current' : '', c.locked ? 'is-locked' : ''].filter(Boolean).join(' '),
      onOpen: () => {
        if (c.locked) {
          note.textContent = `${c.name} — ${CHARACTER_LOCK_TEXT}.`;
          return;
        }
        close();
        if (!c.current) onSwitch(c.key);
      },
    });
    b.dataset.char = c.key;
    b.addEventListener('bha-select', () => revealInRow(strip, b)); // 기기 ▲▼ 하이라이트가 줄 밖 카드로 가면 보이게
    if (c.locked) b.setAttribute('aria-disabled', 'true');
    if (c.current) b.dataset.current = ''; // aria-current 는 기기 선택 표시가 쓴다
    return b;
  });
  strip.append(...btns);
  body.append(strip, note);
  // ── 아래 고정 줄: [닫기] ──
  const acts = el('div', 'bha-win-foot bha-itemmodal__acts');
  const closeBtn = button({ label: '닫기', onClick: close });
  closeBtn.classList.add('bha-itemmodal__closebtn');
  closeBtn.dataset.act = 'close';
  acts.append(closeBtn);
  modal.append(head, body, acts);
  layer.append(modal);
  layer.addEventListener('click', (e) => { if (e.target === layer) close(); });
  // 가로 넘김: 손가락·마우스 끌기(기기 안 좌표 — 세로 폰 90° 돌림에도 맞게)·PC 휠, ←→ 키 = 옆 카드로 초점. 초점이 간 카드는 보이게 민다
  enableDragScrollX(strip);
  edgeCue(strip); // 넘친 쪽 끝 띠
  strip.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const next = btns[Math.max(0, Math.min(btns.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))];
    e.preventDefault();
    next?.focus({ preventScroll: true });
  });
  strip.addEventListener('focusin', (e) => {
    const card = (e.target as HTMLElement).closest?.('.bha-charpick__card') as HTMLElement | null;
    if (card) revealInRow(strip, card);
  });
  getOverlayHost().append(layer);
  untrap = trapModalFocus(layer);
  unregister = registerLayer(layer, close);
  // 새 창은 시작 칸에 초점 (GDD 14-4) — 지금 캐릭터 카드
  const start = btns[cards.findIndex((c) => c.current)] ?? btns[0];
  start?.focus({ preventScroll: true });
  if (start) requestAnimationFrame(() => { if (start.isConnected) revealInRow(strip, start); });
  return close;
}

/** 잠긴 종족 카드 그림 자리: 자물쇠 */
function lockArt(): HTMLElement {
  const box = el('span', 'bha-dexart is-silhouette');
  box.append(icon('i-lock'));
  return box;
}

/** 카드 그림 (C.502 마스터 확인): 캐릭터 = 지금 진화 외형·스킨(합체 창과 같은 trackArt).
 *  초월자 = 그 초월자의 진짜 그림(데이터 art·조각 모델)만 — 없으면 자리 표시 아이콘. 진화체 그림을 빌려 보이지 않는다(초월자 도감 transcendentArt 와 같은 규칙) */
function cardArt(t: Track): HTMLElement {
  if (!t.transcendentId) return trackArt(t);
  return transcendentArt(true, tryGetTranscendent(t.transcendentId));
}
