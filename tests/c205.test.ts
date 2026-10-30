// C.205 (사용자 "물 들어갈 때 … 몸에다가 물 들어가는 식으로 색 … 몸이랑 물 표면 나뉘는 느낌"): 온천에 앉으면 물 높이 아래 몸이 비치고 그 높이에 물결 띠
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/ui/bha/spa.css', 'utf8');
const view = readFileSync('src/ui/spaView.ts', 'utf8');

describe('C.205 온천 물에 잠김', () => {
  it('앉은 몸에 물 높이 마스크 — CSS 와 화면 코드의 물 높이가 같다', () => {
    const cssWl = Number(/--bha-spa-wl: (\d+)%/.exec(css)?.[1]);
    const tsWl = Number(/SPA_WATERLINE = ([\d.]+)/.exec(view)?.[1]);
    expect(cssWl).toBeGreaterThan(0);
    expect(tsWl * 100).toBeCloseTo(cssWl, 5);
    expect(css).toMatch(/\.bha-spa__actor\.is-wading \.bha-char__body \{\s*-webkit-mask-image: linear-gradient/);
  });
  it('물결 띠는 앉은 뒤에만, 움직임 줄이기 설정이면 멈춘다', () => {
    expect(view).toContain('bha-spa__ripple bha-spa__ripple--${side}');
    // 뒤 반은 몸 뒤(몸을 뚫고 보이지 않게), 앞 반은 몸 앞
    expect(css).toMatch(/\.bha-spa__ripple--back \{ z-index: 0; clip-path: inset\([^)]*50%/);
    expect(css).toMatch(/\.bha-spa__ripple--front \{ z-index: 2; clip-path: inset\(50%/);
    expect(css).toMatch(/\.bha-spa__ripple \{[^}]*display: none/);
    expect(css).toContain('.bha-spa__actor.is-wading .bha-spa__ripple { display: block;');
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.bha-spa__ripple/);
  });
});
