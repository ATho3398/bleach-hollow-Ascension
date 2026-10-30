// 시장 화면 (GDD 130장 3, 옛 127장 장터): 월드맵 [시장]으로 들어오는 따로 된 공간. 이름은 종족 설정 market.name (두 종족 모두 "시장").
// 안에 온천·상점(방에서 옮김)과 떠돌이 상인(와 있을 때만 서 있음, 누르면 떠돌이 상인 창). 뒤로·[방으로 돌아가기](왼쪽 위, 온천과 같은 자리 — GDD 129-1) = 방.
// 배경 그림 키 scene.market·자리 그림(prop.spa·prop.shop·prop.wanderer)은 사용자 그림 대기 — 없으면 임시 배경(좌판 줄)과 아이콘.
import { artUrls } from '../data/art/manifest';
import { marketOf, MARKET_SPOTS, type FactionConfig, type MarketSpot } from '../engine/faction';
import type { SaveData } from '../game';
import { el, mountApp } from './bha/dom';
import type { Device, SelectItem } from './bha/device';
import { layoutOnFloor, propButton, sceneBox, spaceBackButton, type FloorEntry } from './bha/room';

export interface MarketHandlers {
  onSpa: () => void;
  onShop: () => void;
  /** 떠돌이 상인 창 (와 있을 때만 불린다) */
  onWanderer: () => void;
  /** [방으로 돌아가기] — 뒤로와 같다 */
  onBack: () => void;
  /** 왼쪽 위 버튼 이름 (월드맵 켬 = '월드맵으로', GDD 130장 3). 없으면 '방으로 돌아가기' */
  backLabel?: string;
}

/** 지금 장터에 서 있는 자리: 떠돌이 상인은 와 있을 때만 (GDD 127장 2) */
export function marketSpots(save: Pick<SaveData, 'shared'>): MarketSpot[] {
  return MARKET_SPOTS.filter((p) => p !== 'wanderer' || save.shared.wanderer.visit !== null);
}

export function marketView(dev: Device, faction: FactionConfig, save: SaveData, hd: MarketHandlers): void {
  const mk = marketOf(faction);
  const here = save.shared.wanderer.visit !== null;

  // ── 위 한 줄: [방으로 돌아가기](왼쪽 위 작게, 온천과 같은 모양·자리 — GDD 129-1) · 이름 · 떠돌이 상인 소식 ──
  const hud = el('header', 'bha-room__hud bha-market__hud');
  const titles = el('div', 'bha-market__titles');
  titles.append(el('h1', 'bha-market__title', mk.name), el('p', 'bha-small bha-market__sub', here ? `${mk.props.wanderer}이 와 있다. 다음 원정에서 돌아오면 떠난다.` : `${mk.props.wanderer}은 원정을 돌다 보면 가끔 들른다.`));
  const backBtn = spaceBackButton(hd.onBack, hd.backLabel);
  hud.append(backBtn, titles);

  // ── 장면: 방과 같은 물건 단추·바닥 배치 ──
  const scene = sceneBox(mk);
  scene.classList.add('bha-market__scene');
  const act: Record<MarketSpot, () => void> = { spa: hd.onSpa, shop: hd.onShop, wanderer: hd.onWanderer };
  const spots = marketSpots(save);
  const floor: FloorEntry[] = [];
  const btns: HTMLButtonElement[] = [];
  for (const p of spots) {
    const b = propButton({ prop: p, name: mk.props[p], ...mk.layout[p], art: !!artUrls(`prop.${p}`).src });
    b.dataset.spot = p;
    b.onclick = act[p];
    scene.append(b);
    btns.push(b);
    floor.push({ el: b, foot: mk.layout[p], kind: 'prop' });
  }
  if (here) scene.dataset.wanderer = '';
  const place = () => layoutOnFloor(scene, mk.floor, floor);
  place();
  requestAnimationFrame(place);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(scene);

  const body = el('div', 'bha-room__body');
  body.append(scene);
  const main = mountApp(dev.view, { cls: 'bha-room bha-market' }, hud, body);
  main.dataset.devLayout = 'visual';
  // 기기 버튼 (GDD 122장): ▲▼ = [방으로 돌아가기](화면 위치 순서 — 왼쪽 위) → 자리들(왼 → 오), ✓ = 누름, 뒤로 = 방
  const items: SelectItem[] = [{ el: backBtn }, ...btns.map((b) => ({ el: b }))];
  btns[0]?.focus({ preventScroll: true }); // 첫 선택 = 온천 (기기는 초점 있는 항목부터 고른다)
  dev.setItems(items, main);
}
