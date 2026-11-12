// C.438 (GDD 12-4 v6.045): Unknown;03398 조각 모델 — 교체 조각도 '그림 40% 이상' 검사 + 칸 바탕 채움(늘 꽉 찬 네모 덩어리)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTranscendent, TRANSCENDENTS } from '../src/data/transcendents';
import { mosaicChurn, mosaicFillCell, mosaicLayout, mosaicTonePixels } from '../src/ui/bha/glitchMosaic';

const def = TRANSCENDENTS.find((d) => d.model)!;
const model = def.model!;
const lcg = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

describe('교체 조각 = 기본 배치와 같은 그림 검사', () => {
  it('5분치 교체(0.275초 평균 → 약 1100번)를 돌려도 칸마다 그림으로 찬 조각 — 거의 빈 조각 비율 1% 미만', () => {
    // 가짜 검사: 원본 조각의 절반만 그림(tx 짝수). 검사 없이 고르면 약 50%가 빈 조각
    const solid = (_s: number, tx: number) => tx % 2 === 0;
    const cells = mosaicLayout(model, 40, solid);
    const r = lcg(9);
    let picked = 0, empty = 0;
    for (let k = 0; k < 1100; k++) {
      const g = mosaicChurn(model, 40, r, solid);
      g.at.forEach((i, j) => { cells[i] = g.cells[j]!; });
      for (const c of g.cells) { picked++; if (!solid(c.src, c.tx)) empty++; }
    }
    expect(empty / picked).toBeLessThan(0.01);
    expect(cells.filter((c) => !solid(c.src, c.tx)).length).toBeLessThanOrEqual(1);
    // 비교: 검사 없이는 빈 조각이 많다
    const r2 = lcg(9);
    let raw = 0;
    for (let k = 0; k < 300; k++) for (const c of mosaicChurn(model, 40, r2).cells) if (!solid(c.src, c.tx)) raw++;
    expect(raw).toBeGreaterThan(100);
  });
});

describe('칸 바탕 채움', () => {
  it('데이터 cellBgDarken 0.45 (provisional) · 검증', () => {
    expect(model.cellBgDarken).toBe(0.45);
    expect(() => parseTranscendent({ ...def, model: { ...model, cellBgDarken: 2 } })).toThrow(/model/);
  });
  it('투명 화소 → 그림 평균색 × darken 바탕, 모든 화소 불투명 · 모노톤/흑백도 바탕까지', () => {
    const px = new Uint8ClampedArray([200, 100, 50, 255, 0, 0, 0, 0, 200, 100, 50, 255, 9, 9, 9, 0]);
    mosaicFillCell(px, 0.5);
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
    expect([px[0], px[1], px[2]]).toEqual([200, 100, 50]);
    expect([px[4], px[5], px[6]]).toEqual([100, 50, 25]);
    expect([px[12], px[13], px[14]]).toEqual([100, 50, 25]);
    mosaicTonePixels(px, null);
    expect(px[4]).toBe(px[5]);
    expect(px[7]).toBe(255);
    const none = new Uint8ClampedArray(16);
    mosaicFillCell(none, 0.5);
    expect([...none]).toEqual([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
  });
  it('화면: 칸마다 채운 뒤 색 처리 · 교체도 같은 검사(d.solid, 결과 기억)', () => {
    const m = readFileSync('src/ui/bha/glitchMosaic.ts', 'utf8');
    expect(m).toContain('mosaicFillCell(data.data, model.cellBgDarken)');
    expect(m).toContain('mosaicChurn(d.model, srcs.length, Math.random, d.solid)');
    expect(m).toContain('mosaicLayout(drv.model, srcs.length, drv.solid)');
    expect(m).toContain('memo.set(key, v)');
  });
});
