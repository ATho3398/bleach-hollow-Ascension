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
  /** 앞 단계 창 쪽 (GDD 169장 3): 'above' 면 위를 먼저 (같으면 앞선 후보가 이긴다) */
  prefer: 'below' | 'above' = 'below',
): CardPlacement {
  const width = Math.min(viewport.width - margin * 2, maxWidth);
  const left = Math.round((viewport.width - width) / 2);
  const maxTop = Math.max(margin, viewport.height - cardHeight - margin);
  const clamp = (t: number) => Math.round(Math.min(maxTop, Math.max(margin, t)));
  const candidates: { side: CardPlacement['side']; top: number }[] = target
    ? [
        ...(prefer === 'above'
          ? [{ side: 'above' as const, top: target.top - gap - cardHeight }, { side: 'below' as const, top: target.top + target.height + gap }]
          : [{ side: 'below' as const, top: target.top + target.height + gap }, { side: 'above' as const, top: target.top - gap - cardHeight }]),
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

export type BoxSide = 'below' | 'above' | 'top' | 'bottom' | 'right' | 'left' | 'corner' | 'center';

export interface BoxPlacement {
  top: number;
  left: number;
  side: BoxSide;
  clear: boolean;
  /** 가리면 안 되는 것(대상·보호 영역)을 가리는 넓이. 0 이면 clear */
  cost: number;
}

export interface BoxFit extends BoxPlacement {
  /** 고른 카드 크기 (후보 크기 중 하나) */
  width: number;
  height: number;
  /** 되도록 피할 영역(캐릭터 등)을 가리는 넓이 */
  soft: number;
}

export interface BoxOptions {
  /** 되도록 피할 영역 (GDD 169장 2): 캐릭터·상태 칩 등. 가려도 되지만 덜 가리는 자리를 고른다 — 대상 옆을 떠날 만큼은 아니다 */
  soft?: Rect[];
  /** 앞 단계 창이 대상의 어느 쪽이었나 (GDD 169장 3): 같은 쪽을 먼저 쓰고, 위↔아래 뒤집기는 그 쪽이 가리면 안 되는 것을 가릴 때만 */
  prefer?: BoxSide | null;
  /** 앞 단계 창 자리 (GDD 169장 4): 대상 없는 카드가 가운데를 못 쓰면 이 자리와 가까운 쪽으로 */
  prev?: Rect | null;
  margin?: number;
  gap?: number;
}

/** 대상 옆 네 자리 순서 (GDD 169장 1): 아래 → 위 → 오른쪽 → 왼쪽 */
const NEAR_RANK: Partial<Record<BoxSide, number>> = { below: 0, above: 1, right: 2, left: 3 };
const OPPOSITE: Partial<Record<BoxSide, BoxSide>> = { below: 'above', above: 'below', right: 'left', left: 'right' };

/** box 가 대상의 그 쪽(아래·위·오른쪽·왼쪽)에 겹치지 않게 붙어 있고, 다른 축으로는 대상과 걸쳐 있는가 */
function besideOf(box: Rect, t: Rect, side: BoxSide): boolean {
  const spanX = Math.min(box.left + box.width, t.left + t.width) - Math.max(box.left, t.left) > 0;
  const spanY = Math.min(box.top + box.height, t.top + t.height) - Math.max(box.top, t.top) > 0;
  if (side === 'below') return box.top >= t.top + t.height && spanX;
  if (side === 'above') return box.top + box.height <= t.top && spanX;
  if (side === 'right') return box.left >= t.left + t.width && spanY;
  if (side === 'left') return box.left + box.width <= t.left && spanY;
  return false;
}

/** 두 영역 사이 빈 거리 (겹치면 0) */
export function rectGap(a: Rect, b: Rect): number {
  const gx = Math.max(0, b.left - (a.left + a.width), a.left - (b.left + b.width));
  const gy = Math.max(0, b.top - (a.top + a.height), a.top - (b.top + b.height));
  return Math.hypot(gx, gy);
}

/**
 * 가로 화면(LCD)용 카드 배치 (T-2 → GDD 169장): 카드 크기 후보(너비×높이) 중에서 자리와 크기를 함께 고른다.
 * 1) 대상 바로 옆(아래 → 위 → 오른쪽 → 왼쪽, 간격 gap)에 붙이고, 가로·세로 위치도 대상 쪽으로 맞춘다(화면 밖으로는 안 나가게).
 * 2) 대상·보호 영역(protectedRects: 눌러야 할 버튼·열린 창)은 가리지 않는다. 캐릭터 같은 soft 영역은 '되도록' 피한다.
 * 3) 앞 단계와 같은 쪽(prefer)을 먼저 — 위↔아래 뒤집기는 그 쪽이 가리면 안 되는 것을 가릴 때만.
 * 4) 화면 맨 위·맨 아래·모서리는 대상 옆 자리가 전부 막혔을 때만 쓰는 마지막 수단.
 * 대상이 없으면 가운데, 가운데가 soft 에 걸리면 앞 창 자리(prev)와 가까운 쪽.
 */
export function placeCardFit(
  target: Rect | null,
  cards: readonly { width: number; height: number }[],
  viewport: { width: number; height: number },
  protectedRects: Rect[] = [],
  opts: BoxOptions = {},
): BoxFit {
  const margin = opts.margin ?? 8;
  const gap = opts.gap ?? 8;
  const soft = opts.soft ?? [];
  const prefer = opts.prefer ?? null;
  const all: { fit: BoxFit; tier: number; score: number }[] = [];
  cards.forEach((card, sizeIdx) => {
    const { width: cw, height: ch } = card;
    const clampX = (x: number) => Math.round(Math.min(Math.max(margin, viewport.width - cw - margin), Math.max(margin, x)));
    const clampY = (y: number) => Math.round(Math.min(Math.max(margin, viewport.height - ch - margin), Math.max(margin, y)));
    const cx = (viewport.width - cw) / 2;
    const top = margin;
    const bottom = viewport.height - ch - margin;
    const left = margin;
    const right = viewport.width - cw - margin;
    const cands: { side: BoxSide; left: number; top: number; align: number }[] = [];
    if (target) {
      const tcx = target.left + target.width / 2 - cw / 2;
      const tcy = target.top + target.height / 2 - ch / 2;
      // 아래·위: 가로는 대상 가운데 → 대상 왼쪽 끝 맞춤 → 오른쪽 끝 맞춤 → 화면 왼쪽·오른쪽 끝까지 밀기(대상 옆은 그대로, 캐릭터를 비킬 때)
      const xs = [tcx, target.left, target.left + target.width - cw, left, right];
      const ys = [tcy, target.top, target.top + target.height - ch, top, bottom];
      xs.forEach((x, a) => cands.push({ side: 'below', left: x, top: target.top + target.height + gap, align: a }));
      xs.forEach((x, a) => cands.push({ side: 'above', left: x, top: target.top - gap - ch, align: a }));
      ys.forEach((y, a) => cands.push({ side: 'right', left: target.left + target.width + gap, top: y, align: a }));
      ys.forEach((y, a) => cands.push({ side: 'left', left: target.left - gap - cw, top: y, align: a }));
      // 마지막 수단: 화면 위·아래(가로는 대상 쪽) · 네 모서리
      cands.push({ side: 'top', left: tcx, top, align: 0 }, { side: 'bottom', left: tcx, top: bottom, align: 0 });
      cands.push({ side: 'corner', left, top, align: 0 }, { side: 'corner', left: right, top, align: 0 }, { side: 'corner', left, top: bottom, align: 0 }, { side: 'corner', left: right, top: bottom, align: 0 });
    } else {
      cands.push({ side: 'center', left: cx, top: (viewport.height - ch) / 2, align: 0 });
      cands.push({ side: 'top', left: cx, top, align: 0 }, { side: 'bottom', left: cx, top: bottom, align: 0 });
      // 가운데·위·아래가 다 보호 영역(캐릭터·열린 창)에 걸리면 네 모서리 (GDD 162장 1)
      cands.push({ side: 'corner', left, top, align: 0 }, { side: 'corner', left: right, top, align: 0 }, { side: 'corner', left, top: bottom, align: 0 }, { side: 'corner', left: right, top: bottom, align: 0 });
    }
    for (const c of cands) {
      const l = clampX(c.left);
      const t = clampY(c.top);
      const box: Rect = { top: t, left: l, width: cw, height: ch };
      const hard = (target ? overlapArea(box, target) * 10 : 0) + protectedRects.reduce((sum, r) => sum + overlapArea(box, r), 0);
      const softA = soft.reduce((sum, r) => sum + overlapArea(box, r), 0);
      // 대상 옆 자리는 화면 안으로 잘라 넣은 뒤에도 정말 그 쪽에 붙어 있어야 한다(대각선·떨어진 곳이면 마지막 수단으로 친다)
      const side = target && NEAR_RANK[c.side] !== undefined && !besideOf(box, target, c.side) ? 'corner' : c.side;
      const near = NEAR_RANK[side] !== undefined;
      // 등급: 0 = 대상 옆·안 가림 / 1 = 마지막 수단 자리·안 가림 / 2 = 어디든 가림(가장 덜 가리는 곳)
      const tier = hard > 0 ? 2 : !target || near ? 0 : 1;
      let score = softA + sizeIdx * 600 + c.align * 150;
      if (target) {
        score += (NEAR_RANK[side] ?? 4) * 400 + rectGap(box, target) * 20;
      } else {
        if (side !== 'center') score += 3000;
        if (opts.prev) score += Math.hypot(l - opts.prev.left, t - opts.prev.top) * 8;
      }
      if (tier === 2) score = hard * 1000 + score;
      const fit: BoxFit = { top: t, left: l, side, clear: hard === 0, cost: hard, width: cw, height: ch, soft: softA };
      all.push({ fit, tier, score });
    }
  });
  // 앞 단계 쪽이 대상 옆·안 가림으로 쓸 수 있으면 그 쪽을 먼저 — 다른 옆자리는 큰 벌점, 위↔아래 뒤집기는 사실상 금지 (GDD 169장 3)
  const keepSide = !!target && !!prefer && all.some((x) => x.tier === 0 && x.fit.side === prefer);
  let best: { fit: BoxFit; tier: number; score: number } | null = null;
  for (const x of all) {
    let score = x.score;
    if (keepSide && x.fit.side !== prefer) score += OPPOSITE[prefer!] === x.fit.side && (prefer === 'below' || prefer === 'above') ? 1e7 : 15000;
    if (!best || x.tier < best.tier || (x.tier === best.tier && score < best.score)) best = { ...x, score };
  }
  return best!.fit;
}

/** 카드 크기가 하나일 때 (placeCardFit 의 한 크기판) */
export function placeCardBox(
  target: Rect | null,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  protectedRects: Rect[] = [],
  opts: BoxOptions = {},
): BoxPlacement {
  const { top, left, side, clear, cost } = placeCardFit(target, [card], viewport, protectedRects, opts);
  return { top, left, side, clear, cost };
}
