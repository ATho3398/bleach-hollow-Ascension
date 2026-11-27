// C.563 펫 자리 = 기본 정지 모습 기준 고정 (GDD 9-4 v6.243, 사용자 "펫 끼면 호로 움직임 맞춰서 프레임이 한 2~3번 왼쪽으로 움직임 …
// 기본 아이들 정지 모델 기준으로 펫 위치를 잡고, 그 뒤에 종이인형이 아이들 모션으로 움직여도 펫은 그대로 있어야지").
// 원인: fitPetToBody 가 붙인 뒤 0~2.5초에 여러 번 불리며 그때그때 그려진 종이인형 동작 프레임의 몸 끝을 다시 재 펫을 옮겼다.
// 고침: 종이인형은 기본 정지 모습(대기 첫 자세) 스냅숏으로 재고, 같은 몸이면 다시 재지 않는다. 몸이 바뀌면(진화·외형) 새로 잰다.
// DOM 이 없는 시험 환경이라 필요한 만큼만 가짜 객체로 만든다.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fitPetToBody, PET_BODY_GAP } from '../src/ui/bha/pet';
import { rigRestSnapshot, setRigRestSnapshot } from '../src/ui/bha/rigAnim';

type Span = { l: number; r: number };
const g = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};

/** 가짜 캔버스: __span = 불투명 칸이 가로로 어디서 어디까지인가 (0~1) */
class FakeCanvas {
  tagName = 'CANVAS';
  className = 'bha-rigcanvas';
  width = 96;
  height = 96;
  offsetWidth = 200;
  constructor(public __span: Span) {}
  closest() { return null; }
  getBoundingClientRect() { return { left: 320, top: 110, width: 200, height: 200, right: 520, bottom: 310 }; }
}
class FakeImage extends FakeCanvas {
  override tagName = 'IMG';
}

beforeAll(() => {
  for (const k of ['HTMLCanvasElement', 'document', 'getComputedStyle', 'DOMMatrixReadOnly']) saved[k] = g[k];
  g.HTMLCanvasElement = FakeCanvas;
  g.getComputedStyle = () => ({ transform: 'none' });
  g.DOMMatrixReadOnly = class { a = 1; };
  // opaqueSpanX 가 쓰는 작업 캔버스: drawImage 로 받은 그림의 __span 을 알파로 돌려준다
  g.document = {
    createElement: () => {
      let src: FakeCanvas | null = null;
      return {
        width: 0,
        height: 0,
        getContext() {
          const c = this as unknown as { width: number; height: number };
          return {
            drawImage: (s: FakeCanvas) => { src = s; },
            getImageData: () => {
              const d = new Uint8ClampedArray(c.width * c.height * 4);
              const sp = src?.__span ?? { l: 0, r: 0 };
              for (let y = 0; y < c.height; y++) for (let x = Math.floor(sp.l * c.width); x < Math.ceil(sp.r * c.width); x++) d[(y * c.width + x) * 4 + 3] = 255;
              return { data: d };
            },
          };
        },
      };
    },
  };
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) g[k] = v;
});

function scene(art: FakeCanvas) {
  const host = {
    offsetWidth: 138,
    getBoundingClientRect: () => ({ left: 340, top: 150, width: 138, height: 150 }),
    querySelector: () => null,
    querySelectorAll: () => [art],
  };
  const buddy = {
    parentElement: host,
    isConnected: true,
    dataset: { dx: '0', dy: '-42' } as Record<string, string>,
    classList: { contains: () => false },
    style: { translate: '' },
    getBoundingClientRect: () => ({ left: 478, top: 250, width: 82, height: 82 }),
  };
  return { host, buddy: buddy as unknown as HTMLElement & { style: { translate: string } } };
}
const shiftOf = (t: string) => Number(t.split('px')[0]);

describe('C.563 펫 자리 = 기본 정지 모습 기준, 대기 동작 중 그대로', () => {
  it('종이인형: 지금 프레임이 아니라 기본 정지 모습으로 재고, 동작 프레임이 바뀌어 다시 불려도 펫은 그대로', () => {
    const live = new FakeCanvas({ l: 0.25, r: 0.75 }); // 지금 그려진 대기 동작 프레임
    const rest = new FakeCanvas({ l: 0.25, r: 0.8 }); // 기본 정지 모습 (팔이 조금 더 바깥)
    setRigRestSnapshot(live, () => rest as unknown as HTMLCanvasElement);
    const { buddy } = scene(live);
    expect(fitPetToBody(buddy)).toBe(true);
    const first = buddy.style.translate;
    // 몸 끝 = 320 + 200 × 0.8 = 480 → 펫 왼쪽 478 에서 +2 + 틈
    expect(shiftOf(first)).toBe(480 - 478 + PET_BODY_GAP);
    expect(first).toBe(`${480 - 478 + PET_BODY_GAP}px -42px`);
    // 대기 동작이 돌며 몸 끝이 바뀐다 (C.487 의 0·150·500·1200·2500·5000ms 다시 맞추기)
    for (const r of [0.7, 0.72, 0.68, 0.75, 0.71]) {
      live.__span = { l: 0.25, r };
      expect(fitPetToBody(buddy)).toBe(true);
      expect(buddy.style.translate).toBe(first);
    }
  });
  it('몸이 바뀌면(진화·외형 = 새 스냅숏) 새로 잰다', () => {
    const art = new FakeCanvas({ l: 0.2, r: 0.7 });
    setRigRestSnapshot(art, () => new FakeCanvas({ l: 0.2, r: 0.7 }) as unknown as HTMLCanvasElement);
    const { buddy, host } = scene(art);
    fitPetToBody(buddy);
    const a = buddy.style.translate;
    const next = new FakeCanvas({ l: 0.2, r: 0.9 });
    setRigRestSnapshot(next, () => new FakeCanvas({ l: 0.2, r: 0.9 }) as unknown as HTMLCanvasElement);
    host.querySelectorAll = () => [next];
    fitPetToBody(buddy);
    expect(buddy.style.translate).not.toBe(a);
    expect(Math.abs(shiftOf(buddy.style.translate) - shiftOf(a) - 200 * 0.2)).toBeLessThanOrEqual(2); // 몸 끝 재기는 96칸 표본 (±1칸)
  });
  it('부위 그림이 오기 전(스냅숏 없음)·캔버스로 바뀌기 전 정지 그림 img 는 재지 않는다 (나중 다시 맞추기에서)', () => {
    const art = new FakeCanvas({ l: 0.2, r: 0.7 });
    setRigRestSnapshot(art, () => null);
    const { buddy } = scene(art);
    expect(fitPetToBody(buddy)).toBe(false);
    expect(buddy.style.translate).toBe('');
    const still = new FakeImage({ l: 0.2, r: 0.7 });
    setRigRestSnapshot(still, () => new FakeCanvas({ l: 0.2, r: 0.7 }) as unknown as HTMLCanvasElement);
    const s2 = scene(still);
    expect(fitPetToBody(s2.buddy)).toBe(false);
  });
  it('종이인형이 아닌 그림은 그 그림 그대로 (스냅숏 없음)', () => {
    expect(rigRestSnapshot({})).toBeUndefined();
    const art = new FakeCanvas({ l: 0.3, r: 0.6 });
    const { buddy } = scene(art);
    expect(fitPetToBody(buddy)).toBe(true);
    expect(Math.abs(shiftOf(buddy.style.translate) - (320 + 120 - 478 + PET_BODY_GAP))).toBeLessThanOrEqual(2);
  });
});

describe('C.563 코드', () => {
  it('bindRigAnim 이 원본 img·캔버스 둘 다에 대기 첫 자세 스냅숏을 단다 (이펙트 없음, t = 0)', () => {
    const r = readFileSync('src/ui/bha/rigAnim.ts', 'utf8');
    expect(r).toContain("rigMotionIds('idle', motions)[0]");
    expect(r).toContain('samplePose(rig, motion, 0, 0)');
    expect(r).toContain('setRigRestSnapshot(img, restSnap);');
    expect(r).toContain('setRigRestSnapshot(canvas, restSnap);');
  });
  it('기획서 9-4 줄', () => {
    expect(readFileSync('docs/GDD.md', 'utf8')).toContain('펫 자리 = 기본 정지 모습 기준 고정');
  });
});
