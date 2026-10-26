// C.162 (GDD 99장 4·5): 전투 화면 비율(레터박스 없음·필드 크게·해방 카드·블록 칸 축소) · 공격 몸통박치기 복구
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leftInCommon } from '../src/ui/attackFx';
import { FX_REACH_FIELD, REACH_RATIO } from '../src/ui/attackFxConfig';
import { v2Size, V2_H, V2_W } from '../src/ui/bha/v2/root';

const read = (p: string) => readFileSync(p, 'utf8');

describe('C.162 레터박스 없음 (v2Size)', () => {
  it('남는 쪽은 논리 크기를 늘려 창을 가득 채운다', () => {
    expect(v2Size(646, 360)).toEqual({ scale: 1, w: 646, h: 360 }); // PC LCD: 위아래 15px 띠가 필드로
    expect(v2Size(692, 380)).toEqual({ scale: 1, w: 692, h: 380 }); // 긴 폰
    const small = v2Size(540, 384); // 작은 폰: 폭에 맞춰 줄이고 높이를 늘린다
    expect(small.scale).toBeCloseTo(540 / 640);
    expect(small.w).toBeCloseTo(640);
    expect(small.h).toBeCloseTo(384 / (540 / 640));
    expect(v2Size(0, 0)).toEqual({ scale: 1, w: V2_W, h: V2_H });
  });
  it('루트 크기는 변수로, 필드 = 스킬창(110) 위 전부, 해방 카드 96·블록 58', () => {
    const css = read('src/ui/bha/v2/bha.css');
    expect(css).toContain('.bha-v2host>.bha-root{width:calc(var(--v2-w,640) * 1px);height:calc(var(--v2-h,330) * 1px)}');
    expect(css).toContain('.bha-root.bha-battle .bha-field{height:auto;bottom:110px}');
    expect(css).toContain('.bha-root.bha-battle .bha-skillpanel{top:auto;height:110px}');
    expect(css).toContain('width:96px');
    expect(css).toContain('.bha-root .bha-v2tray__grid,.bha-root .bha-v2cell,.bha-root .bha-v2cell>.bha-block{height:58px}');
  });
});

describe('C.162 몸통박치기 복구', () => {
  it('간격은 공통 offsetParent 까지 더해 잰다 (서로 다른 유닛 칸 안이어도)', () => {
    const P = { offsetLeft: 0, offsetParent: null } as unknown as HTMLElement;
    const ua = { offsetLeft: 70, offsetParent: P } as unknown as HTMLElement;
    const ub = { offsetLeft: 392, offsetParent: P } as unknown as HTMLElement;
    const a = { offsetLeft: 10, offsetParent: ua } as unknown as HTMLElement;
    const b = { offsetLeft: 10, offsetParent: ub } as unknown as HTMLElement;
    expect(leftInCommon(a, b)).toBe(80);
    expect(leftInCommon(b, a)).toBe(402);
  });
  it('돌진 상한 = 필드 폭 18% (적까지 가지 않음)', () => {
    expect(FX_REACH_FIELD).toBeGreaterThanOrEqual(0.15);
    expect(FX_REACH_FIELD).toBeLessThanOrEqual(0.2);
    expect(REACH_RATIO).toBe(0.82);
    expect(read('src/ui/battleView.ts')).toContain('maxReach: () => arena.offsetWidth * FX_REACH_FIELD');
    expect(read('src/ui/attackFx.ts')).toContain('Math.min(reachOf(gapOf(from, to)), opts.maxReach?.() ?? Infinity)');
  });
});
