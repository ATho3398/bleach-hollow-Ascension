// 월드맵 (GDD 130장 2, C.204): 방 물건 [밖으로]로 나오는 하이앵글 지도 한 장. 이름은 종족 설정(worldmap.name — 호로 '웨코문도' / 사신 '소울 소사이어티').
// 장소 3개 = 홈(방, 이름 nestName) · 시장(온천·상점·떠돌이 상인) · 모험(출발 준비 화면). 누르면 바로 그 화면으로(걷는 연출 없음).
// 캐릭터는 방 그림 그대로 홈 옆에 서 있다(보기만). 배경 그림 키 scene.worldmap 은 사용자 그림 대기 — 없으면 임시 지도 배경.
// 기능 스위치 FEATURES.WORLD_MAP 이 꺼지면 이 화면은 쓰이지 않는다(옛 방 문·장터 그대로, GDD 130장 6).
import { artUrls } from '../data/art/manifest';
import { roomOf, worldMapOf, WORLD_PLACES, type FactionConfig, type WorldPlace } from '../engine/faction';
import { artSkinOf, type SaveData } from '../game';
import { el, icon, mountApp } from './bha/dom';
import type { Device, SelectItem } from './bha/device';
import { characterButton, layoutOnFloor, propButton, roomCharArt, sceneBox, type FloorEntry } from './bha/room';

export interface WorldMapHandlers {
  onHome: () => void;
  onMarket: () => void;
  onAdventure: () => void;
  /** 잠긴 장소 (GDD 131장 2 첫 모험 강제): 이 장소들은 흐리게 잠기고 눌러도 onLocked */
  locked?: readonly WorldPlace[];
  onLocked?: (p: WorldPlace) => void;
}

export function worldMapView(dev: Device, faction: FactionConfig, save: SaveData, hd: WorldMapHandlers): void {
  const wm = worldMapOf(faction);
  const here = save.shared.wanderer.visit !== null;

  // ── 위 한 줄: 지도 이름 ──
  const hud = el('header', 'bha-room__hud bha-worldmap__hud');
  hud.append(el('h1', 'bha-worldmap__title', wm.name));

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
    b.onclick = locked ? () => hd.onLocked?.(p) : act[p];
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
  // 캐릭터: 방 그림 그대로, 홈 옆에 서 있다 (보기만 — 기기 선택 대상 아님)
  const char = characterButton(roomCharArt(roomOf(faction, save.wear.talk), faction.id, save.evolution.tierIndex, artSkinOf(save)), '캐릭터');
  char.disabled = true;
  char.setAttribute('aria-hidden', 'true');
  char.classList.add('bha-worldmap__char');
  if (save.nest.collapsed || save.nest.dead) char.classList.add('is-collapsed');
  scene.append(char);
  floor.push({ el: char, foot: wm.characterFoot, kind: 'char' });
  const place = () => layoutOnFloor(scene, wm.floor, floor);
  place();
  requestAnimationFrame(place);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(scene);

  const body = el('div', 'bha-room__body');
  body.append(scene);
  const main = mountApp(dev.view, { cls: 'bha-room bha-worldmap' }, hud, body);
  // 선택 순서 = DOM 순서(홈 → 시장 → 모험, 지도 왼쪽 → 오른쪽). 'visual'(위 → 아래)을 쓰면 가운데 위 시장이 먼저 와서 쓰지 않는다
  if (here) main.dataset.wanderer = '';
  // 기기 버튼 (GDD 122장): ▲▼ = 장소(홈 → 시장 → 모험), ✓ = 이동, 뒤로 = 홈. 첫 선택 = 모험 (옛 방 첫 선택 = 문, 100장 #11)
  const items: SelectItem[] = WORLD_PLACES.map((p) => ({ el: btns.get(p)! }));
  btns.get('adventure')?.focus({ preventScroll: true });
  dev.setItems(items, main);
}
