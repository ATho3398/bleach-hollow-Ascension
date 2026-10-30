// 월드맵 (GDD 130장 2, C.204): 방 물건 [밖으로]로 나오는 하이앵글 지도 한 장. 이름은 종족 설정(worldmap.name — 호로 '웨코문도' / 사신 '소울 소사이어티').
// 장소 3개 = 홈(방, 이름 nestName) · 시장(온천·상점·떠돌이 상인) · 모험(출발 준비 화면).
// 고르면(✓) 캐릭터가 지금 자리에서 그 장소까지 걸어가고, 닿을 즈음 화면이 어두워졌다가(페이드아웃) 그 화면이 밝아진다(페이드인) — GDD 137장 3.
// 걷는 동안 입력 잠금, 뒤로 = 취소하고 제자리.
// 캐릭터는 방 그림 그대로 지금 있던 장소 위에 서 있다(보기만, GDD 132장 2). 배경 그림 키 scene.worldmap 은 사용자 그림 대기 — 없으면 임시 지도 배경.
// 옛 방 모험 문·장터 물건 경로와 기능 스위치는 폐기했다 (GDD 137장 3, C.215).
import { artUrls } from '../data/art/manifest';
import { roomOf, worldMapOf, WORLD_PLACES, type FactionConfig, type WorldPlace } from '../engine/faction';
import { artSkinOf, type SaveData } from '../game';
import { el, icon, mountApp } from './bha/dom';
import type { Device, SelectItem } from './bha/device';
import { characterButton, layoutOnFloor, propButton, roomCharArt, sceneBox, spaceBackButton, type FloorEntry } from './bha/room';
import { fixParticles } from '../engine/josa';

export interface WorldMapHandlers {
  onHome: () => void;
  onMarket: () => void;
  onAdventure: () => void;
  /** 잠긴 장소 (GDD 131장 2 첫 모험 강제): 이 장소들은 흐리게 잠기고 눌러도 onLocked */
  locked?: readonly WorldPlace[];
  onLocked?: (p: WorldPlace) => void;
  /** 캐릭터가 서 있는 장소 = 지금 있던 곳 (GDD 132장 2: 홈에서 열면 홈 위, 시장에서 돌아오면 시장 위). 없으면 홈 */
  at?: WorldPlace;
  /** 처음 기기 초점 장소 (없으면 at). 첫 모험 강제 중 = 모험 */
  focus?: WorldPlace;
}

/** 장소에 선 캐릭터 발 자리: 장소 발 자리 바로 뒤(조금 위) — 캐릭터는 장소 단추 뒤에 그려져 장소 모양·이름표를 가리지 않고 몸 위쪽이 그 위로 보인다 */
export const WORLD_STAND_DY = -3;
export function standFoot(layout: { x: number; y: number }): { x: number; y: number } {
  return { x: layout.x, y: Math.max(0, Math.min(98, layout.y + WORLD_STAND_DY)) };
}

/** 걷기 속도(장면 % 1당 ms)·최소/최대 걷기 시간 · 페이드 시작(걷기 진행 비율) · 페이드 시간. 화면 연출값이라 balance 밖 */
export const WORLD_WALK_MS_PER_PCT = 16;
export const WORLD_WALK_MIN_MS = 450;
export const WORLD_WALK_MAX_MS = 1300;
export const WORLD_FADE_AT = 0.7;
export const WORLD_FADE_MS = 320;
/** 두 장소 사이 걷기 시간 (같은 자리면 0 — 바로 페이드) */
export function worldWalkMs(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  if (d < 0.5) return 0;
  return Math.round(Math.min(WORLD_WALK_MAX_MS, Math.max(WORLD_WALK_MIN_MS, d * WORLD_WALK_MS_PER_PCT)));
}

/** 지금 떠 있는 월드맵의 걷기 (뒤로 = 취소를 바깥(화면 스택)에서 부른다) */
let live: { walking: () => boolean; cancel: () => void } | null = null;
/** 걷는 중이면 취소하고 제자리로 돌린 뒤 true (GDD 137장 3: 뒤로 = 취소). 아니면 false */
export function worldMapCancelWalk(): boolean {
  if (!live?.walking()) return false;
  live.cancel();
  return true;
}

/** 페이드 막: 기기 LCD(화면들이 바뀌어도 남는 틀) 위에 깔아 화면 전환을 넘어 이어진다 */
function fadeVeil(view: HTMLElement): HTMLElement {
  const host = view.parentElement ?? view;
  host.querySelector(':scope > .bha-worldmap__fade')?.remove();
  const v = el('div', 'bha-worldmap__fade');
  v.setAttribute('aria-hidden', 'true');
  v.style.setProperty('--bha-wm-fade', `${WORLD_FADE_MS}ms`);
  host.append(v);
  return v;
}

export function worldMapView(dev: Device, faction: FactionConfig, save: SaveData, hd: WorldMapHandlers): void {
  const wm = worldMapOf(faction);
  const here = save.shared.wanderer.visit !== null;

  // ── 위 한 줄: 왼쪽 위 [둥지로]/[대원실로](다른 공간 화면과 같은 모양·자리 — GDD 129-1 2) · 지도 이름 ──
  const hud = el('header', 'bha-room__hud bha-worldmap__hud');
  const homeLocked = hd.locked?.includes('home') ?? false;
  const backBtn = spaceBackButton(() => (walking ? cancelWalk() : homeLocked ? hd.onLocked?.('home') : hd.onHome()), fixParticles(`${wm.places.home}(으)로`));
  if (homeLocked) backBtn.setAttribute('aria-disabled', 'true'); // 첫 모험 강제 중 (GDD 131장 2)
  hud.append(backBtn, el('h1', 'bha-worldmap__title', wm.name));

  // ── 장면: 방과 같은 물건 단추·바닥 배치 ──
  const scene = sceneBox(wm);
  scene.classList.add('bha-worldmap__scene');
  const act: Record<WorldPlace, () => void> = { home: hd.onHome, market: hd.onMarket, adventure: hd.onAdventure };
  const floor: FloorEntry[] = [];
  const btns = new Map<WorldPlace, HTMLButtonElement>();
  for (const p of WORLD_PLACES) {
    const b = propButton({ prop: p, name: wm.places[p], ...wm.layout[p], art: !!artUrls(`prop.${p}`).src });
    b.dataset.place = p;
    const locked = hd.locked?.includes(p) ?? false;
    b.onclick = () => {
      if (walking) return; // 걷는 동안 입력 잠금 (GDD 137장 3)
      if (locked) return hd.onLocked?.(p);
      walkTo(p);
    };
    if (locked) {
      b.classList.add('is-locked');
      b.setAttribute('aria-disabled', 'true');
    }
    // 떠돌이 상인이 와 있으면 시장에 배지 (GDD 130장 2 — 옛 방 장터 물건 배지 자리를 옮김)
    if (p === 'market' && here) {
      b.classList.add('has-visitor');
      b.querySelector('.bha-prop__shape')?.append(el('span', 'bha-room__idlebadge bha-prop__badge', '상인'));
    }
    // 사망이면 모험 잠김 표시 (GDD 102-7 — 옛 방 문 자리를 옮김). 눌러도 막힘 안내는 onAdventure 쪽
    if (p === 'adventure' && save.nest.dead) {
      b.classList.add('is-locked');
      b.append(icon('i-lock'));
    }
    scene.append(b);
    btns.set(p, b);
    floor.push({ el: b, foot: wm.layout[p], kind: 'prop' });
  }
  // 캐릭터: 방 그림 그대로, 지금 있던 장소 위에 서 있다 (보기만 — 기기 선택 대상 아님, GDD 132장 2)
  const at = hd.at ?? 'home';
  const char = characterButton(roomCharArt(roomOf(faction, save.wear.talk), faction.id, save.evolution.tierIndex, artSkinOf(save)), '캐릭터');
  char.disabled = true;
  char.setAttribute('aria-hidden', 'true');
  char.classList.add('bha-worldmap__char');
  if (save.nest.collapsed || save.nest.dead) char.classList.add('is-collapsed');
  scene.insertBefore(char, btns.get(WORLD_PLACES[0]!) ?? null); // 장소 단추 뒤 층 — 장소 모양·이름표가 캐릭터 앞에 보인다
  char.dataset.at = at;
  const charEntry: FloorEntry = { el: char, foot: standFoot(wm.layout[at]), kind: 'char' };
  floor.push(charEntry);
  const place = () => layoutOnFloor(scene, wm.floor, floor);
  place();
  requestAnimationFrame(place);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(scene);

  const body = el('div', 'bha-room__body');
  body.append(scene);
  const main = mountApp(dev.view, { cls: 'bha-room bha-worldmap' }, hud, body);
  // 선택 순서 = DOM 순서(홈 → 시장 → 모험, 지도 왼쪽 → 오른쪽). 'visual'(위 → 아래)을 쓰면 가운데 위 시장이 먼저 와서 쓰지 않는다
  if (here) main.dataset.wanderer = '';
  // 기기 버튼 (GDD 122장): ▲▼ = 장소(홈 → 시장 → 모험), ✓ = 이동, 뒤로 = 홈. 첫 선택 = 지금 있던 장소 (GDD 132장 2 — 옛 130장 '모험' 대체), 첫 모험 강제 중 = 모험
  const items: SelectItem[] = [{ el: backBtn }, ...WORLD_PLACES.map((p) => ({ el: btns.get(p)! }))]; // 화면 위치 순서: 왼쪽 위 돌아가기 먼저
  btns.get(hd.focus ?? at)?.focus({ preventScroll: true });
  dev.setItems(items, main);

  // ── 걷기 → 페이드아웃 → 그 화면 → 페이드인 (GDD 137장 3) ──
  let walking = false;
  let raf = 0;
  let veil: HTMLElement | null = null;
  const stopWalk = () => {
    cancelAnimationFrame(raf);
    walking = false;
    main.classList.remove('is-walking');
    char.classList.remove('is-walking', 'is-walk-right');
  };
  /** 취소: 제자리(걷기 전 장소)로 돌리고 페이드도 걷는다 */
  function cancelWalk(): void {
    stopWalk();
    charEntry.foot = standFoot(wm.layout[at]);
    place();
    veil?.remove();
    veil = null;
  }
  function arrive(p: WorldPlace): void {
    stopWalk();
    const v = veil;
    veil = null;
    act[p]();
    // 다른 화면으로 갔으면 그 화면 위에서 페이드인, 못 갔으면(확인 창·막힘 알림) 제자리로 돌리고 걷는다
    if (main.isConnected && v) {
      charEntry.foot = standFoot(wm.layout[at]);
      place();
    }
    if (!v) return;
    requestAnimationFrame(() => {
      v.classList.remove('is-on');
      window.setTimeout(() => v.remove(), WORLD_FADE_MS + 40);
    });
  }
  function walkTo(p: WorldPlace): void {
    const from = standFoot(wm.layout[at]);
    const to = standFoot(wm.layout[p]);
    const ms = worldWalkMs(from, to);
    walking = true;
    main.classList.add('is-walking');
    char.classList.toggle('is-walk-right', to.x > from.x); // 그림은 왼쪽을 본다 — 오른쪽으로 가면 뒤집는다
    if (ms > 0) char.classList.add('is-walking');
    let fadeStarted = false;
    let fadeEnd = 0;
    const startFade = (now: number) => {
      fadeStarted = true;
      fadeEnd = now + WORLD_FADE_MS;
      veil = fadeVeil(dev.view);
      void veil.offsetWidth; // 처음 불투명도 0 을 먼저 그린 뒤 켠다
      veil.classList.add('is-on');
    };
    const t0 = performance.now();
    const frame = (now: number) => {
      if (!main.isConnected) return stopWalk();
      const k = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
      charEntry.foot = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      place();
      if (!fadeStarted && k >= WORLD_FADE_AT) startFade(now);
      if (k >= 1) char.classList.remove('is-walking');
      if (k >= 1 && fadeStarted && now >= fadeEnd) return arrive(p);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  live = { walking: () => walking && main.isConnected, cancel: cancelWalk };
}
