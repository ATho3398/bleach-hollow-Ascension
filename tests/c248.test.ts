// C.248 (GDD 169장): 튜토리얼 안내 창 = 설명하는 대상 바로 옆, 같은 쪽 유지, 화면 끝·모서리는 마지막 수단
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { placeCardFit, rectGap, type Rect } from '../src/ui/helpLayout';

const vp = { width: 628, height: 358 };
const sizes = [{ width: 456, height: 96 }, { width: 280, height: 130 }, { width: 240, height: 150 }];
const box = (p: { left: number; top: number; width: number; height: number }): Rect => ({ left: p.left, top: p.top, width: p.width, height: p.height });
const overlaps = (a: Rect, b: Rect) => Math.min(a.left + a.width, b.left + b.width) > Math.max(a.left, b.left) && Math.min(a.top + a.height, b.top + b.height) > Math.max(a.top, b.top);

// 방 화면 비슷한 배치: 위 칩 줄 · 가운데 캐릭터 · 아래 독
const charR: Rect = { left: 250, top: 110, width: 130, height: 150 };
const icons: Rect[] = [
  { left: 12, top: 300, width: 44, height: 44 }, // 독 왼쪽 끝 아이콘
  { left: 120, top: 300, width: 44, height: 44 },
  { left: 470, top: 300, width: 44, height: 44 },
  { left: 560, top: 12, width: 52, height: 30 }, // 오른쪽 위 칩
  { left: 20, top: 12, width: 120, height: 30 }, // 왼쪽 위 칩
];

describe('169장 1 대상 바로 옆', () => {
  it('아이콘마다 창이 대상에 붙고(간격 ≤ 12px) 대상을 가리지 않는다, 화면 위·아래·모서리로 안 간다', () => {
    for (const t of icons) {
      const p = placeCardFit(t, sizes, vp, [], { soft: [charR] });
      expect(['below', 'above', 'right', 'left']).toContain(p.side);
      expect(p.clear).toBe(true);
      expect(overlaps(box(p), t)).toBe(false);
      expect(rectGap(box(p), t)).toBeLessThanOrEqual(12);
    }
  });
  it('가로 위치도 대상 쪽: 왼쪽 끝 아이콘의 창은 화면 왼쪽에, 오른쪽 아이콘은 오른쪽에', () => {
    const a = placeCardFit(icons[0]!, sizes, vp, [], {});
    expect(a.left).toBeLessThanOrEqual(icons[0]!.left);
    const b = placeCardFit(icons[2]!, sizes, vp, [], {});
    expect(b.left + b.width).toBeGreaterThanOrEqual(icons[2]!.left + icons[2]!.width);
  });
  it('캐릭터(soft)는 되도록 피하지만, 피하려고 대상 옆을 떠나지는 않는다', () => {
    // 대상 아래·위·옆 어디든 캐릭터에 조금 걸리는 자리
    const t: Rect = { left: 280, top: 60, width: 60, height: 40 };
    const p = placeCardFit(t, sizes, vp, [], { soft: [{ left: 0, top: 0, width: 628, height: 358 }] });
    expect(['below', 'above', 'right', 'left']).toContain(p.side);
    expect(rectGap(box(p), t)).toBeLessThanOrEqual(12);
  });
  it('대상 옆 네 자리가 전부 가리면 안 되는 것에 막혔을 때만 화면 끝·모서리', () => {
    const t: Rect = { left: 200, top: 140, width: 228, height: 60 };
    const prot: Rect[] = [{ left: 0, top: 100, width: 628, height: 30 }, { left: 0, top: 210, width: 628, height: 30 }, { left: 0, top: 100, width: 190, height: 140 }, { left: 438, top: 100, width: 190, height: 140 }];
    const p = placeCardFit(t, sizes, vp, prot, {});
    expect(['top', 'bottom', 'corner']).toContain(p.side);
    expect(p.clear).toBe(true);
  });
});

describe('169장 3 같은 쪽 유지', () => {
  it('앞 단계가 위였으면, 아래가 비어 있어도 위', () => {
    const t: Rect = { left: 200, top: 170, width: 60, height: 40 };
    expect(placeCardFit(t, sizes, vp, [], {}).side).toBe('below');
    expect(placeCardFit(t, sizes, vp, [], { prefer: 'above' }).side).toBe('above');
  });
  it('캐릭터를 조금 덜 가린다고 위↔아래를 뒤집지 않는다', () => {
    const t: Rect = { left: 200, top: 150, width: 60, height: 40 };
    const p = placeCardFit(t, sizes, vp, [], { prefer: 'below', soft: [{ left: 0, top: 200, width: 628, height: 60 }] });
    expect(p.side).not.toBe('above');
  });
  it('같은 쪽이 대상을 가릴 때(화면 아래 끝 대상)만 뒤집는다', () => {
    const p = placeCardFit(icons[1]!, sizes, vp, [], { prefer: 'below' });
    expect(p.side).toBe('above');
    expect(p.clear).toBe(true);
  });
});

describe('169장 4 대상 없는 카드', () => {
  it('가운데, 가운데가 캐릭터에 걸리면 앞 창 자리와 가까운 쪽', () => {
    expect(placeCardFit(null, sizes, vp, [], {}).side).toBe('center');
    const prev: Rect = { left: 8, top: 200, width: 280, height: 130 };
    const p = placeCardFit(null, sizes, vp, [], { soft: [charR, { left: 0, top: 0, width: 628, height: 60 }], prev });
    expect(p.soft).toBe(0);
    expect(p.left).toBeLessThan(vp.width / 2);
    expect(p.top).toBeGreaterThan(vp.height / 3);
  });
});

describe('공용 처리 연결', () => {
  it('tutorialOverlay 는 placeCardFit 에 가리면 안 되는 것/되도록 피할 것/앞 단계 쪽을 넘긴다', () => {
    const o = readFileSync('src/ui/tutorialOverlay.ts', 'utf8');
    expect(o).toContain('placeCardFit(keep, sizes, vp, protectedRects(), { soft: softRects(), prefer:');
    expect(o).toContain('let lastPlaced');
  });
});
