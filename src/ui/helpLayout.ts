// 튜토리얼 설명 카드 배치 (GDD 14-2, C.19). DOM 에 의존하지 않는 순수 함수라 화면 크기별로 단위 테스트한다.
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface CardPlacement {
  top: number;
  left: number;
  width: number;
  /** 대상 아래(below)·위(above)·화면 위(top)·화면 아래(bottom)·가운데(center, 대상 없음) */
  side: 'below' | 'above' | 'top' | 'bottom' | 'center';
  /** 대상도 보호 영역(블록 바·버튼)도 가리지 않는가 */
  clear: boolean;
  /** 가리는 넓이(대상은 10배 가중). 0 이면 clear */
  cost: number;
}

/** 여러 요소의 영역을 하나로 합친다 */
export function unionRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  return { top, left, width: right - left, height: bottom - top };
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * 카드를 놓을 자리를 고른다. 후보(대상 아래·위·화면 위·화면 아래)를 모두 화면 안으로 자른 뒤,
 * 대상(가중 10)과 보호 영역(블록 바·저장 필살기 버튼 등)을 가장 적게 가리는 자리를 고른다. 같으면 앞선 후보(아래 → 위)가 이긴다.
 */
export function placeCard(
  target: Rect | null,
  cardHeight: number,
  viewport: { width: number; height: number },
  protectedRects: Rect[] = [],
  margin = 12,
  gap = 10,
  maxWidth = 456,
): CardPlacement {
  const width = Math.min(viewport.width - margin * 2, maxWidth);
  const left = Math.round((viewport.width - width) / 2);
  const maxTop = Math.max(margin, viewport.height - cardHeight - margin);
  const clamp = (t: number) => Math.round(Math.min(maxTop, Math.max(margin, t)));
  const candidates: { side: CardPlacement['side']; top: number }[] = target
    ? [
        { side: 'below', top: target.top + target.height + gap },
        { side: 'above', top: target.top - gap - cardHeight },
        { side: 'top', top: margin },
        { side: 'bottom', top: viewport.height - cardHeight - margin },
      ]
    : [
        { side: 'center', top: (viewport.height - cardHeight) / 2 },
        { side: 'top', top: margin },
        { side: 'bottom', top: viewport.height - cardHeight - margin },
      ];
  let best: CardPlacement | null = null;
  for (const c of candidates) {
    const top = clamp(c.top);
    const card: Rect = { top, left, width, height: cardHeight };
    const cost = (target ? overlapArea(card, target) * 10 : 0) + protectedRects.reduce((sum, r) => sum + overlapArea(card, r), 0);
    if (!best || cost < best.cost) best = { top, left, width, side: c.side, clear: cost === 0, cost };
  }
  return best!;
}

export interface BoxPlacement {
  top: number;
  left: number;
  side: 'below' | 'above' | 'top' | 'bottom' | 'right' | 'left' | 'corner' | 'center';
  clear: boolean;
  cost: number;
}

/**
 * 가로 화면(LCD)용 카드 배치 (T-2): 카드 크기(너비×높이)가 정해져 있을 때, 대상 아래·위·옆(오른쪽·왼쪽)·화면 위·아래·네 모서리를 후보로
 * 대상(가중 10)과 보호 영역을 가장 적게 가리는 자리를 고른다. 같으면 앞선 후보가 이긴다. 모든 후보는 화면 안(margin)으로 잘라 넣는다.
 */
export function placeCardBox(
  target: Rect | null,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  protectedRects: Rect[] = [],
  margin = 8,
  gap = 8,
): BoxPlacement {
  const { width: cw, height: ch } = card;
  const clampX = (x: number) => Math.round(Math.min(Math.max(margin, viewport.width - cw - margin), Math.max(margin, x)));
  const clampY = (y: number) => Math.round(Math.min(Math.max(margin, viewport.height - ch - margin), Math.max(margin, y)));
  const cx = (viewport.width - cw) / 2;
  const left = margin;
  const right = viewport.width - cw - margin;
  const top = margin;
  const bottom = viewport.height - ch - margin;
  const candidates: { side: BoxPlacement['side']; left: number; top: number }[] = target
    ? [
        { side: 'below', left: cx, top: target.top + target.height + gap },
        { side: 'above', left: cx, top: target.top - gap - ch },
        { side: 'right', left: target.left + target.width + gap, top: target.top },
        { side: 'left', left: target.left - gap - cw, top: target.top },
        { side: 'top', left: cx, top },
        { side: 'bottom', left: cx, top: bottom },
        { side: 'corner', left, top },
        { side: 'corner', left: right, top },
        { side: 'corner', left, top: bottom },
        { side: 'corner', left: right, top: bottom },
      ]
    : [
        { side: 'center', left: cx, top: (viewport.height - ch) / 2 },
        { side: 'top', left: cx, top },
        { side: 'bottom', left: cx, top: bottom },
      ];
  let best: BoxPlacement | null = null;
  for (const c of candidates) {
    const l = clampX(c.left);
    const t = clampY(c.top);
    const box: Rect = { top: t, left: l, width: cw, height: ch };
    const cost = (target ? overlapArea(box, target) * 10 : 0) + protectedRects.reduce((sum, r) => sum + overlapArea(box, r), 0);
    if (!best || cost < best.cost) best = { top: t, left: l, side: c.side, clear: cost === 0, cost };
  }
  return best!;
}
