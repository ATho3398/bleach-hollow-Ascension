// 시장 화면 (GDD 130장 3, 옛 127장 장터): 월드맵 [시장]으로 들어오는 따로 된 공간. 이름은 종족 설정 market.name (두 종족 모두 "시장").
// 방(홈)과 같은 틀 (GDD 158장 3): 상점 4곳(150장 2)·대장장이(153장 2)·떠돌이 상인(와 있을 때만)을 장면 곳곳에 앞뒤 깊이로 놓고 화면 전체를 쓴다.
// 나가기 = 방과 같은 월드맵 물건(이름 room.props.outside) — 위 [월드맵으로] 버튼은 없앴다. 뒤로 = 월드맵. 캐릭터는 월드맵 물건 옆에 서 있다(보기만).
// 배경 그림 키 scene.market·자리 그림(prop.shop·prop.gearShop·prop.skinShop·prop.traitShop·prop.smith·prop.wanderer)은 사용자 그림 대기 — 없으면 임시 배경(좌판 줄)과 아이콘.
import { artUrls } from '../data/art/manifest';
import { fixParticles } from '../engine/josa';
import { marketOf, roomOf, MARKET_SPOTS, type FactionConfig, type MarketSpot } from '../engine/faction';
import { artSkinOf, artTierIndexOf, type SaveData } from '../game';
import type { ShopKind } from '../data/shop';
import { el, mountApp } from './bha/dom';
import type { Device, SelectItem } from './bha/device';
import { applyCarePose, characterButton, extraPropButtons, layoutOnFloor, propButton, roomCharArt, sceneBox, type FloorEntry } from './bha/room';

export interface MarketHandlers {
  /** 상점 4곳 중 하나 (GDD 150장 2) */
  onShop: (kind: ShopKind) => void;
  /** 대장장이 (GDD 153장 2): 기능은 사용자가 나중에 정한다 — 지금은 안내 한 줄 */
  onSmith: () => void;
  /** 떠돌이 상인 창 (와 있을 때만 불린다) */
  onWanderer: () => void;
  /** 월드맵 물건 (GDD 158장 3) — 뒤로와 같다 */
  onBack: () => void;
}

/** 캐릭터 발 자리: 월드맵 물건 오른쪽 옆 (방에서 막 들어온 모습) */
export const MARKET_CHAR_DX = 13;

/** 지금 장터에 서 있는 자리: 떠돌이 상인은 와 있을 때만 (GDD 127장 2). 온천은 월드맵 장소로 옮겨 장터에 없다 (GDD 153장 1 — 이름 market.props.spa 만 남김) */
export function marketSpots(save: Pick<SaveData, 'shared'>): MarketSpot[] {
  return MARKET_SPOTS.filter((p) => p !== 'spa' && (p !== 'wanderer' || save.shared.wanderer.visit !== null));
}

export function marketView(dev: Device, faction: FactionConfig, save: SaveData, hd: MarketHandlers): void {
  const mk = marketOf(faction);
  const room = roomOf(faction);
  const here = save.shared.wanderer.visit !== null;

  // ── 위 한 줄: 이름 · 떠돌이 상인 소식 (나가기는 장면 안 월드맵 물건 — GDD 158장 3) ──
  const hud = el('header', 'bha-room__hud bha-market__hud');
  const titles = el('div', 'bha-market__titles');
  titles.append(el('h1', 'bha-market__title', mk.name), el('p', 'bha-small bha-market__sub', fixParticles(here ? `${mk.props.wanderer}이(가) 와 있다. 다음 모험에서 돌아오면 떠난다.` : `${mk.props.wanderer}은(는) 모험을 돌다 보면 가끔 들른다.`)));
  hud.append(titles);

  // ── 장면: 방과 같은 물건 단추·바닥 배치 ──
  const scene = sceneBox(mk);
  scene.classList.add('bha-market__scene');
  const act: Record<Exclude<MarketSpot, 'spa'>, () => void> = {
    wanderer: hd.onWanderer, smith: hd.onSmith,
    shop: () => hd.onShop('consumable'), gearShop: () => hd.onShop('gear'), skinShop: () => hd.onShop('skin'), traitShop: () => hd.onShop('trait'),
  };
  const floor: FloorEntry[] = [];
  // 월드맵 물건 (GDD 158장 3): 방의 월드맵 물건과 같은 그림·이름 — 누르면 월드맵으로
  // 그림 = 지도(prop.worldmap, 사용자 2026-11-03 "월드맵 아이콘으로 변경 (대원실에서 나가기 아이콘은 지금 그대로)") — 없으면 방과 같은 문 그림
  const exitArt = artUrls('prop.worldmap').src ? 'prop.worldmap' : 'prop.outside';
  const exit = propButton({ prop: 'outside', name: room.props.outside, ...mk.exit, artKey: exitArt, art: !!artUrls(exitArt).src, fallbackArt: 'prop.door' });
  exit.dataset.exit = '';
  exit.onclick = hd.onBack;
  scene.append(exit);
  floor.push({ el: exit, foot: mk.exit, kind: 'prop' });
  if (mk.exit.hidden) exit.hidden = true; // UI 배치 도구로 숨김 (GDD 175장) — 나가기는 뒤로로도 된다
  const btns: HTMLButtonElement[] = [];
  for (const p of marketSpots(save)) {
    if (mk.layout[p].hidden) continue; // UI 배치 도구로 숨긴 자리 (GDD 175장)
    const b = propButton({ prop: p, name: mk.props[p], ...mk.layout[p], art: !!artUrls(`prop.${p}`).src });
    b.dataset.spot = p;
    b.onclick = act[p as Exclude<MarketSpot, 'spa'>];
    scene.append(b);
    btns.push(b);
    floor.push({ el: b, foot: mk.layout[p], kind: 'prop' });
  }
  btns.push(...extraPropButtons(scene, mk.extras, floor)); // 새 물건 (GDD 175장): 아이콘만, 누르면 '준비 중'
  // 캐릭터: 방 그림 그대로 월드맵 물건 옆에 서 있다 (보기만 — 기기 선택 대상 아님)
  const char = characterButton(roomCharArt(roomOf(faction, save.wear.talk), faction.id, artTierIndexOf(save), artSkinOf(save)), '캐릭터');
  char.disabled = true;
  char.setAttribute('aria-hidden', 'true');
  char.classList.add('bha-market__char');
  applyCarePose(char, save.nest); // 돌봄 상태 자세 (GDD 171장)
  scene.append(char);
  floor.push({ el: char, foot: { x: Math.min(96, mk.exit.x + MARKET_CHAR_DX), y: mk.exit.y + 4 }, kind: 'char' });
  if (here) scene.dataset.wanderer = '';
  const place = () => layoutOnFloor(scene, mk.floor, floor);
  place();
  requestAnimationFrame(place);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(scene);

  const body = el('div', 'bha-room__body');
  body.append(scene);
  const main = mountApp(dev.view, { cls: 'bha-room bha-market' }, hud, body);
  main.dataset.devLayout = 'visual';
  // 기기 버튼 (GDD 122장): ▲▼ = 월드맵 물건·자리들(화면 위치 순서), ✓ = 누름, 뒤로 = 월드맵
  const items: SelectItem[] = [{ el: exit }, ...btns.map((b) => ({ el: b }))];
  if (exit.hidden) items.shift(); // 숨긴 월드맵 물건은 고르지 않는다 (GDD 175장)
  btns[0]?.focus({ preventScroll: true }); // 첫 선택 = 첫 상점 (기기는 초점 있는 항목부터 고른다)
  dev.setItems(items, main);
}
