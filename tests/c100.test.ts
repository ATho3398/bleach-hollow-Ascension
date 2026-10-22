// C.100 다마고치 모드 버튼 3배 · 디자인 고르기 큰 창 (GDD 47장)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BODY, tamaLayout } from '../src/ui/bha/tamagoLogic';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const rule = (css: string, sel: string) => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)) + 1);
const css = read('src/ui/bha/tamago.css');
const ts = read('src/ui/bha/tamago.ts');

describe('조작 줄 버튼 (GDD 47장 1번 → 69장 C.122: 64px, 화면 아래 한 줄)', () => {
  it('버튼 한 변 = 64px(C.122 에서 108px → 64px), 아이콘·글자 크기는 토큰 안', () => {
    expect(css).toContain('--tama-btn: 64px');
    const btn = rule(css, '.bha-tama__bar .bha-btn');
    expect(btn).toContain('width: var(--tama-btn)');
    expect(btn).toContain('height: var(--tama-btn)');
    expect(btn).toContain('font-size: var(--bha-fs-md)');
    expect(css).toMatch(/\.bha-tama__bar \.bha-btn \.bha-icon \{ width: 28px; height: 28px; \}/);
  });
  it('기기 바깥 화면 아래 가장자리 한 줄: 가로도 세로 회전 출력도 (오른쪽 세로 줄은 없앴다)', () => {
    expect(rule(css, '.bha-tama__bar')).toContain('position: fixed');
    expect(rule(css, '.bha-tama__bar')).toContain('bottom: max(');
    expect(css).not.toContain('.bha-tama__bar[data-pos="right"]');
    expect(css).toContain('.bha-tama__bar[data-pos="rotated"]');
    expect(ts).toContain("ctrl.dataset.pos = f.rotated ? 'rotated' : 'bottom'");
    expect(ts).toContain('document.body.append(ctrl)');
  });
  it('세 버튼 모두 작은 버튼(size small)을 더 쓰지 않는다', () => {
    const seg = ts.slice(ts.indexOf("const ctrl = el('div', 'bha-tama__bar')"), ts.indexOf('document.body.append(ctrl)'));
    expect(seg).not.toContain("size: 'small'");
    for (const k of ['design', 'flip', 'zoom-in']) expect(seg).toContain(`dataset.tama = '${k}'`);
  });
  it('조작 줄이 차지하는 폭을 기기 배치에서 비워 기기를 가리지 않는다', () => {
    const w = 844, h = 390;
    const a = tamaLayout(w, h);
    const b = tamaLayout(w, h, null, 0, undefined, BODY.barPx);
    expect(b.zoom).toBeLessThanOrEqual(a.zoom);
    // 남은 칸(w − 예약) 안에 상자가 들어간다: 상자 오른쪽 끝(스테이지 변환 뒤)이 예약 칸을 넘지 않는다
    expect(b.box.w * b.zoom).toBeLessThanOrEqual(w - BODY.barPx + 0.5);
  });
});

describe('[디자인] 큰 창 (GDD 47장 2번)', () => {
  const fn = ts.slice(ts.indexOf('function openDesigns'), ts.indexOf('// 뒤집기 (GDD 31장 1, C.71)'));
  it('LCD 안이 아니라 브라우저 화면(document.body)에 붙인다', () => {
    expect(fn).toContain('document.body.append(layer)');
    expect(fn).not.toContain('getOverlayHost');
  });
  it('카드마다 기기 앞면 큰 그림·이름·착용 표시', () => {
    expect(fn).toContain('bha-designs__img');
    expect(fn).toContain('bha-designs__name');
    expect(fn).toContain("'착용 중'");
    expect(fn).toContain('deviceArt(c)');
  });
  it('고르면 바로 바뀌고, [닫기]·바깥 탭·Esc 로 닫힌다', () => {
    expect(fn).toContain('pick(e.id)');
    expect(fn).toContain('hooks.persist');
    expect(fn).toContain("label: '닫기'");
    expect(fn).toContain('e.target === layer');
    expect(fn).toContain("e.key === 'Escape'");
  });
  it('창은 화면의 약 90%', () => {
    const win = rule(css, '.bha-designs__win');
    expect(win).toContain('width: 90vw');
    expect(win).toContain('height: 90dvh');
  });
});
