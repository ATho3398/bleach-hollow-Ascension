// C.556 펫 위치 (사용자 "펫 위치가 이상해 봐줘"): 그림 펫을 몸 옆으로 옮기는 값(translate)은 host 안 px 인데, 옛 코드는 화면 px 차이를 그대로 넣었다.
// 기기 배율(C.554 한 배율 맞춤)·PC 2배(zoom)·세로 폰 90° 회전에서 펫이 몸에서 멀어지거나(세로 폰 32px → 195px) 다른 자리로 갔다.
// hostAxisX 로 화면 사각형을 host 안 가로 좌표로 바꾸면 어느 화면 크기에서든 같은 값이 나온다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hostAxisX, PET_BODY_GAP } from '../src/ui/bha/pet';
import { computeFit, computePcFit, type Fit } from '../src/ui/bha/viewport';

/** 기기 안 사각형(논리 px) → 화면 사각형 (fitTransform 과 같은 순서: 축소 → 회전 → 여백) */
function screenRect(f: Fit, x: number, y: number, w: number, h: number) {
  const ox = f.ox ?? 0, oy = f.oy ?? 0;
  const p = (lx: number, ly: number) => (f.rotated ? { x: f.vw - oy - ly * f.scale, y: ox + lx * f.scale } : { x: ox + lx * f.scale, y: oy + ly * f.scale });
  const a = p(x, y), b = p(x + w, y + h);
  const left = Math.min(a.x, b.x), top = Math.min(a.y, b.y), right = Math.max(a.x, b.x), bottom = Math.max(a.y, b.y);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** fitPetToBody 와 같은 계산: 몸 오른쪽 끝(불투명 비율 spanRight) + 틈 − 펫 왼쪽 → host 안 px */
function shiftFor(f: Fit): number {
  const host = { x: 340, y: 150, w: 138, h: 150 }; // 방 캐릭터 상자 (기기 안 px)
  const art = screenRect(f, host.x - 20, host.y - 40, 200, 200); // 몸 그림 (host 보다 크다)
  const buddy = screenRect(f, host.x + host.w, host.y + 100, 82, 82); // CSS 기본 자리: host 오른쪽
  const hr = screenRect(f, host.x, host.y, host.w, host.h);
  const ax = hostAxisX({ offsetWidth: host.w }, hr, f.rotated);
  const bodyRight = ax.lo(art) + 0.78 * ax.len(art);
  return (bodyRight - ax.lo(buddy)) * ax.k + PET_BODY_GAP;
}

const FITS: [string, Fit][] = [
  ['폰 844×390', computeFit(844, 390)],
  ['폰 20:9 915×412', computeFit(915, 412)],
  ['태블릿 1024×768', computeFit(1024, 768)],
  ['세로 폰 390×844', computeFit(390, 844)],
  ['작은 폰 667×375', computeFit(667, 375)],
  ['PC 1배', computePcFit(1366, 768, 1, 844, 390)],
  ['PC 2배', computePcFit(1920, 1080, 2, 844, 390)],
];

describe('C.556 펫 옆 이동 = host 안 px (화면 배율·회전과 무관)', () => {
  const ref = shiftFor(computeFit(844, 390));
  it('기준 화면(844×390)에서 몸 오른쪽 끝 + 틈', () => {
    // 몸 그림 왼쪽 320 + 200 × 0.78 = 476 → 펫 왼쪽 478 에서 −2 + 틈 4
    expect(ref).toBeCloseTo(476 - 478 + PET_BODY_GAP, 6);
  });
  for (const [name, f] of FITS) {
    it(`${name}: 기준과 같은 값`, () => {
      expect(shiftFor(f)).toBeCloseTo(ref, 6);
    });
  }
  it('k = host 안 px ÷ 화면 px, 돌린 화면은 세로(top·height)로 잰다', () => {
    const ax = hostAxisX({ offsetWidth: 100 }, { width: 50, height: 200 }, true);
    expect(ax.k).toBe(0.5);
    expect(ax.lo({ left: 10, top: 30 })).toBe(30);
    expect(ax.len({ width: 50, height: 200 })).toBe(200);
    const flat = hostAxisX({ offsetWidth: 100 }, { width: 200, height: 50 }, false);
    expect(flat.k).toBe(0.5);
    expect(flat.lo({ left: 10, top: 30 })).toBe(10);
    expect(hostAxisX({ offsetWidth: 0 }, { width: 0, height: 0 }, false).k).toBe(1);
  });
  it('fitPetToBody 는 화면 px 차이를 그대로 넣지 않는다 (1번째·2번째 펫 모두)', () => {
    const src = readFileSync('src/ui/bha/pet.ts', 'utf8');
    expect(src).toContain('hostAxisX(host, host.getBoundingClientRect(), currentFit().rotated)');
    expect(src).not.toContain('bodyRight + PET_BODY_GAP - buddy.getBoundingClientRect().left');
    expect(src).not.toContain('lead.getBoundingClientRect().right + PET_BODY_GAP');
    expect(src.match(/\* ax\.k \+ PET_BODY_GAP/g)?.length).toBe(2);
  });
});
