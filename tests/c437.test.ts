// C.437 (GDD 12-4 v6.043): Unknown;03398 조각 모델 — 조각이 쉬지 않고 무작위로 계속 바뀜 + 모노톤·흑백 조각 · 몸 전체 흑백/모노톤
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTranscendent, TRANSCENDENTS } from '../src/data/transcendents';
import { mosaicChurn, mosaicDelays, mosaicFrozenCells, mosaicLayout, mosaicPickTone, mosaicTonePixels, parseHexColor } from '../src/ui/bha/glitchMosaic';

const read = (p: string) => readFileSync(p, 'utf8');
const def = TRANSCENDENTS.find((d) => d.model)!;
const model = def.model!;
const lcg = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

describe('움직임 수치 = 데이터', () => {
  it('0.15~0.4초 · 1~3조각 · 모노 15% · 몸 전체 4~8초마다 0.3~0.8초 · 토큰 색 (provisional)', () => {
    expect(model).toMatchObject({ churnMs: [150, 400], swap: [1, 3], monoChance: 0.15, fullMonoEveryMs: [4000, 8000], fullMonoHoldMs: [300, 800], provisional: true });
    const tokens = read('src/ui/bha/design-system/tokens.css');
    for (const k of model.monoTokens) expect(tokens).toMatch(new RegExp(`${k}:\\s*#[0-9a-f]{6}`, 'i'));
    expect(() => parseTranscendent({ ...def, model: { ...model, monoChance: 2 } })).toThrow(/model/);
    expect(() => parseTranscendent({ ...def, model: { ...model, churnMs: [400, 150] } })).toThrow(/model/);
    expect(() => parseTranscendent({ ...def, model: { ...model, monoTokens: ['red'] } })).toThrow(/model/);
  });
  it('간격 = 데이터 범위 안', () => {
    const r = lcg(5);
    for (let k = 0; k < 200; k++) {
      const d = mosaicDelays(model, r);
      expect(d.churn).toBeGreaterThanOrEqual(150); expect(d.churn).toBeLessThanOrEqual(400);
      expect(d.fullEvery).toBeGreaterThanOrEqual(4000); expect(d.fullEvery).toBeLessThanOrEqual(8000);
      expect(d.fullHold).toBeGreaterThanOrEqual(300); expect(d.fullHold).toBeLessThanOrEqual(800);
    }
  });
});

describe('계속 바뀜 (기본으로 돌아가지 않음)', () => {
  it('교체를 쌓으면 기본 모습에서 멀어진다 · 모노/흑백 조각 비율 약 15% · 흑백과 모노톤 둘 다', () => {
    const base = mosaicLayout(model, 40);
    const cells = [...base];
    const r = lcg(7);
    let swapped = 0, mono = 0, gray = 0, tint = 0;
    for (let k = 0; k < 2000; k++) {
      const g = mosaicChurn(model, 40, r);
      g.at.forEach((i, j) => { cells[i] = g.cells[j]!; });
      for (const c of g.cells) { swapped++; if (c.tone !== undefined) { mono++; if (c.tone < 0) gray++; else { tint++; expect(c.tone).toBeLessThan(model.monoTokens.length); } } }
    }
    expect(cells.filter((c, i) => c !== base[i]).length).toBeGreaterThan(base.length * 0.9);
    expect(mono / swapped).toBeGreaterThan(0.11); expect(mono / swapped).toBeLessThan(0.19);
    expect(gray).toBeGreaterThan(0); expect(tint).toBeGreaterThan(0);
    for (let k = 0; k < 50; k++) expect(mosaicPickTone(model, r)).toBeGreaterThanOrEqual(-1);
  });
  it('캡처 고정 장면 = 시드 고정, 흑백·모노톤 조각 섞임', () => {
    const base = mosaicLayout(model, 40);
    const a = mosaicFrozenCells(model, base, 40);
    expect(a).toEqual(mosaicFrozenCells(model, base, 40));
    expect(a.some((c) => c.tone === -1)).toBe(true);
    expect(a.some((c) => c.tone === 0)).toBe(true);
  });
});

describe('화소 처리', () => {
  it('흑백 = r=g=b, 모노톤 = 그 색 한 색조 (어둠→색→밝음), 투명도 그대로', () => {
    const px = new Uint8ClampedArray([200, 40, 40, 255, 10, 200, 30, 77]);
    mosaicTonePixels(px, null);
    expect(px[0]).toBe(px[1]); expect(px[1]).toBe(px[2]); expect(px[4]).toBe(px[6]); expect(px[7]).toBe(77);
    const mid = new Uint8ClampedArray([128, 128, 128, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
    mosaicTonePixels(mid, [79, 143, 138]);
    [79, 143, 138].forEach((v, k) => expect(Math.abs(mid[k]! - v)).toBeLessThanOrEqual(2));
    expect([mid[4], mid[5], mid[6]]).toEqual([0, 0, 0]);
    expect([mid[8], mid[9], mid[10]]).toEqual([255, 255, 255]);
    expect(parseHexColor(' #4f8f8a')).toEqual([79, 143, 138]);
    expect(parseHexColor('#abc')).toEqual([170, 187, 204]);
    expect(parseHexColor('rgb(1,2,3)')).toBeNull();
  });
});

describe('화면 연결', () => {
  it('바뀐 칸만 다시 그림 · 동작 줄이기 = 기본 고정 · 캡처 고정 · 화면 밖 멈춤 · 스무딩 끔 · id 분기 없음', () => {
    const m = read('src/ui/bha/glitchMosaic.ts');
    expect(m).toContain('drawCells(d, srcs, d.cells, g.at)');
    expect(m).toContain('if (prefersReducedMotion()) {');
    expect(m).toContain('d.cells = [...d.base]');
    expect(m).toContain('if (glitchFrozen()) return;');
    expect(m).toContain('if (d.imgs.size === 0) { d.timer = 0; return; }');
    expect(m).toContain('imageSmoothingEnabled = false');
    expect(m).not.toMatch(/'rift-wanderer'|'hollow'|'shinigami'/);
    expect(m).not.toMatch(/\b(150|400|4000|8000)\b/); // 수치는 데이터
  });
});
