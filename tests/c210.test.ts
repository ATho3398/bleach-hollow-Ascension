// C.210 (GDD 133장 2): 가로 강제 전환(세로 폰 → 전체 화면 + 가로 고정) 뒤 다마고치 기기 버튼(▲▼✓◀) 위치 어긋남.
// 원인: 크기가 바뀐 맞춤(resize)마다 stageOf 가 배치(layout)는 새로 셌지만, 그림 기기 누름 영역·몸체·고리 DOM 은 relayout() 을 부를 때만 놓았다
// → 세로(주소창 보이는 크기)에서 켠 뒤 가로 전체 화면이 되면 누름 영역이 옛 크기 자리에 남음(실측 13~17px, scripts/c210-proof.cjs).
// DOM 배치는 브라우저에서 잰다(proof). 여기서는 고친 연결이 빠지지 않게 소스와 버전만 지킨다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PATCH_LABEL } from '../src/version';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('C.210 기기 버튼 위치 — 맞춤마다 다시 놓기', () => {
  const tama = src('src/ui/bha/tamago.ts');
  it('stageOf(모든 맞춤에서 불림)가 배치를 센 뒤 place() 로 DOM 을 다시 놓는다', () => {
    const stageOf = tama.slice(tama.indexOf('const stageOf ='), tama.indexOf('function relayout'));
    expect(stageOf).toContain('layout = tamaLayout(');
    expect(stageOf.indexOf('place();')).toBeGreaterThan(stageOf.indexOf('layout = tamaLayout('));
  });
  it('relayout 은 다시 맞춤만(→ stageOf → place) — place 는 restage 를 부르지 않는다(되먹임 없음)', () => {
    const relayout = tama.slice(tama.indexOf('function relayout'), tama.indexOf('function place'));
    expect(relayout).toContain('dev.restage()');
    const place = tama.slice(tama.indexOf('function place'), tama.indexOf('dev.setStage(stageOf)'));
    expect(place).not.toContain('restage');
    expect(place).toContain('box(hb, artBox.buttons[b])');
  });
  it('기기 맞춤은 orientationchange 말고도 screen.orientation change·fullscreenchange 뒤 늦은 크기까지 다시 맞춘다', () => {
    const dev = src('src/ui/bha/device.ts');
    expect(dev).toMatch(/so\?\.addEventListener\?\.\('change', refit\)/);
    expect(dev).toContain("document.addEventListener('fullscreenchange', refit)");
    expect(dev).toContain("document.addEventListener('webkitfullscreenchange', refit)");
    expect(dev).toContain("document.removeEventListener('fullscreenchange', refit)");
  });
  it('버전', () => {
    expect(PATCH_LABEL).toMatch(/^C\.2(1\d|[1-9]\d)$/);
  });
});
