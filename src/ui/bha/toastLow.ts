// 상태창이 위에 있는 화면(방·온천)의 공용 알림 띠 자리 (GDD 209장 보충, 마스터 결정 15:0x): 위 가장자리 띠('새 트랙 … 열렸다' 등)가 이름표·상태창을 덮지 않게
// 그 화면에서만 띠를 장면 아래쪽 — 하단 버튼 줄(없으면 장면 아래 끝) 바로 위, 물건 이름표·버튼·체력 막대와 안 겹치는 높이 — 에 띄운다.
// 다른 화면은 지금 자리(lcd.css 맨 위 가운데) 그대로. 누름 통과·머무는 시간은 공용 그대로. 종족 무관.
import { getOverlayHost } from './overlayHost';

type Rect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;
const hits = (a: Rect, b: Rect): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/**
 * 띠 자리 (화면 좌표): 아래 끝 = floor(하단 버튼 줄 위 끝) − gap 에서 시작. 그 높이 줄에서 걸리는 것들을 피해 가운데(cx)에 가장 가까운 가로 자리를 찾고,
 * 없으면 걸린 것들 위 끝 − gap 으로 올려 다시. 띠 크기 w × h, 가로는 [minX, maxX] 안. 장면 위 끝(ceil) 밖이면 null
 */
export function lowToastSpot(o: { w: number; h: number; cx: number; minX: number; maxX: number; floor: number; ceil: number; gap: number; blockers: readonly Rect[] }): { bottom: number; left: number } | null {
  let bottom = o.floor - o.gap;
  const want = o.cx - o.w / 2;
  for (let i = 0; i < 20; i++) {
    const top = bottom - o.h;
    if (top < o.ceil) return null;
    const band = o.blockers.filter((b) => b.top < bottom && b.bottom > top);
    const cands = [want, ...band.flatMap((b) => [b.right + o.gap, b.left - o.gap - o.w])].filter((x) => x >= o.minX && x + o.w <= o.maxX);
    cands.sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
    const left = cands.find((x) => !band.some((b) => hits({ left: x, right: x + o.w, top, bottom }, b)));
    if (left !== undefined) return { bottom, left };
    bottom = Math.min(...band.map((b) => b.top)) - o.gap;
  }
  return null;
}

/**
 * screen 이 화면에 있는 동안 공용 알림 띠(.bha-toast, 가운데 띠 제외)를 아래쪽 자리로 옮긴다. 이미 떠 있는 띠도.
 * floor = 하단 버튼 줄 위 끝(y), blockers = 피할 것(물건 버튼·이름표·체력 막대 등). 먼저 뜬 아래 띠도 피해 위로 쌓인다
 */
export function keepToastsLow(screen: HTMLElement, o: { floor: () => number; ceil: () => number; blockers: () => readonly HTMLElement[] }): () => void {
  const host = getOverlayHost();
  const place = (t: HTMLElement) => {
    if (!screen.isConnected || t.classList.contains('bha-toast--center')) return;
    // 막 붙은 띠는 들어오는 연출(transform) 중이라 화면 좌표 대신 레이아웃 크기로. 기준 = 띠의 위치 기준 상자, 가로 기본 = 그 가운데(left 50% · translateX −50%)
    const base = (t.offsetParent as HTMLElement | null) ?? host;
    const hr = base.getBoundingClientRect();
    const w = t.offsetWidth, h = t.offsetHeight;
    if (!w || !hr.height) return;
    const others = [...host.querySelectorAll<HTMLElement>('.bha-toast.is-low')].filter((x) => x !== t && !x.classList.contains('is-out'));
    const rects = [...o.blockers(), ...others].filter((b) => b.isConnected && b.offsetWidth > 0).map((b) => b.getBoundingClientRect());
    const gap = parseFloat(getComputedStyle(t).getPropertyValue('--bha-sp-1')) || 2;
    const sr = screen.getBoundingClientRect();
    const cx = hr.left + hr.width / 2;
    const borderB = parseFloat(getComputedStyle(base).borderBottomWidth) || 0; // bottom 은 기준 상자의 안쪽(테두리 안)에서 잰다
    const floor = Math.min(o.floor(), hr.bottom - borderB, sr.bottom); // 장면이 창보다 길어도(온천) 보이는 안쪽까지만
    const spot = lowToastSpot({ w, h, cx, minX: Math.max(hr.left, sr.left) + gap, maxX: Math.min(hr.right, sr.right) - gap, floor, ceil: o.ceil(), gap, blockers: rects });
    if (!spot) return; // 자리가 없으면 예전 자리(위) 그대로
    t.classList.add('is-low');
    t.style.setProperty('--toast-bottom', `${Math.round(hr.bottom - borderB - spot.bottom)}px`);
    t.style.setProperty('--toast-dx', `${Math.round(spot.left - (cx - w / 2))}px`);
  };
  const each = () => host.querySelectorAll<HTMLElement>('.bha-toast:not(.is-low)').forEach(place);
  each();
  if (typeof MutationObserver === 'undefined') return () => {};
  const mo = new MutationObserver(() => {
    if (!screen.isConnected) return mo.disconnect();
    each();
  });
  mo.observe(host, { childList: true });
  return () => mo.disconnect();
}
