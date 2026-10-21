import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { logoCssUrl, logoUrl } from '../src/ui/bha/logo';
import { designsLayerPlace } from '../src/ui/bha/tamagoLogic';

describe('C.111 종족 로고가 배포본에서 보이게', () => {
  it('상대 경로 배포(base ./)에서도 문서 기준 절대 주소로 만든다 — 커스텀 속성 안 url() 은 CSS 파일(/assets/) 기준으로 풀려 404 가 났다', () => {
    const rel = logoUrl({ logo: 'logo-hollow' }, './')!;
    expect(rel).toBe('./art/logo-hollow.png');
    expect(logoCssUrl(rel, 'https://atho3398.github.io/bleach-hollow-Ascension/')).toBe('url("https://atho3398.github.io/bleach-hollow-Ascension/art/logo-hollow.png")');
    expect(logoCssUrl(rel, 'https://atho3398.github.io/bleach-hollow-Ascension/index.html')).toBe('url("https://atho3398.github.io/bleach-hollow-Ascension/art/logo-hollow.png")');
    expect(logoCssUrl('/art/x.png')).toBe('url("/art/x.png")'); // 문서가 없으면(테스트) 그대로
  });
});

describe('C.111 다마고치 모드 가로 기준 (GDD 16-6)', () => {
  it('[디자인] 큰 창: 가로 폰·PC 는 기본 배치, 세로 폰은 (세로 × 가로) 크기를 시계 방향 90도로', () => {
    expect(designsLayerPlace({ rotated: false, vw: 844, vh: 390 })).toBeNull();
    expect(designsLayerPlace({ rotated: true, vw: 390, vh: 844 })).toEqual({ width: 844, height: 390, padX: 42, padY: 20, transform: 'translate(390px, 0) rotate(90deg)' });
  });
  it('조작 줄: 세로 폰은 칸을 제자리에서 90도 돌리고 기기 위쪽 = 화면 오른쪽 순서', () => {
    const css = readFileSync('src/ui/bha/tamago.css', 'utf8');
    expect(css).toMatch(/\.bha-tama__bar\[data-pos="bottom"\]\s*\{\s*flex-direction:\s*row-reverse/);
    expect(css).toMatch(/\.bha-tama__bar\[data-pos="bottom"\] \.bha-btn\s*\{\s*rotate:\s*90deg/);
    expect(css).toMatch(/\.bha-designs\.is-rotated/);
  });
});
