// C.122 다마고치 모드 조작 줄: 기기 아래 한 줄 · 줌과 상관없이 같은 크기 (GDD 69장)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BODY, tamaLayout } from '../src/ui/bha/tamagoLogic';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = read('src/ui/bha/tamago.css');
const ts = read('src/ui/bha/tamago.ts');
const bar = css.slice(css.indexOf('.bha-tama__bar {'), css.indexOf('}', css.indexOf('.bha-tama__bar {')) + 1);

describe('조작 줄: 화면 아래 한 줄, 크기 고정 (GDD 69장)', () => {
  it('줄은 문서 맨 위 고정 요소라 기기 줌·뒤집기 변환을 받지 않는다 (버튼 크기 = 늘 64px)', () => {
    expect(ts).toContain('document.body.append(ctrl)');
    expect(bar).toContain('position: fixed');
    expect(bar).toContain('--tama-btn: 64px');
    expect(bar).not.toMatch(/scale\(|zoom:/);
    // 기기 줌 무대 변환은 dev(.bha-dev)에만 붙는다 — 줄(ctrl)에는 style.transform 을 쓰지 않는다
    expect(ts).not.toMatch(/ctrl\.style\.transform/);
  });
  it('줄이 차지하는 두께 BODY.barPx 는 버튼 64 + 여백 (이전 124 → 80)', () => {
    expect(BODY.barPx).toBe(80);
    expect(BODY.barPx).toBeGreaterThanOrEqual(64);
  });
  it('가로 화면: 기기 아래(+y)를 비워 기기·키링이 남은 높이 안에 들어간다', () => {
    const w = 844, h = 390;
    const full = tamaLayout(w, h);
    const res = tamaLayout(w, h, null, 0, undefined, 0, BODY.barPx);
    expect(res.zoom).toBeLessThanOrEqual(full.zoom);
    expect(res.box.h * res.zoom).toBeLessThanOrEqual(h - BODY.barPx + 0.5);
    // 줄 자리를 뺀 칸의 가운데에 놓인다: 무대 이동 y = (h - 예약) / 2
    expect(res.stage).toContain(`translate(${Math.round((w / 2) * 100) / 100}px, ${(h - BODY.barPx) / 2}px)`);
  });
  it('세로 회전 출력: 화면 아래 = 기기 +x 쪽을 비운다(예약 x), 높이는 그대로', () => {
    const w = 844, h = 390;
    const r = tamaLayout(w, h, null, 0, undefined, BODY.barPx, 0);
    expect(r.box.w * r.zoom).toBeLessThanOrEqual(w - BODY.barPx + 0.5);
    expect(r.stage).toContain(`translate(${(w - BODY.barPx) / 2}px, ${h / 2}px)`);
  });
  it('조작 줄 자리는 줌 상자에서 빠졌다 (기기가 더 크게 보인다)', () => {
    const l = tamaLayout(844, 390);
    expect(l.box.y + l.box.h).toBeCloseTo(Math.max(l.body.y + l.body.h, l.ring.y + BODY.charmL), 5);
  });
  it('쓸 수 있는 칸: 핀치·휠·끌기도 줄을 뺀 칸 기준 (usable)', () => {
    expect(ts).toContain('const usable = (f: Fit)');
    expect(ts).not.toMatch(/layout\.box, fit\.w, fit\.h/);
  });
});
