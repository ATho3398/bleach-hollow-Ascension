// C.413 (GDD 244장 1): 슬롯 삭제 확인 창 — 입력칸에 자동 초점을 주지 않는다(폰 자판이 안내를 가리지 않게)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('C.413 삭제 입력칸 자판', () => {
  const src = read('src/ui/confirmDialog.ts');
  it('입력칸 focus() 를 부르지 않고 초점은 [아니요]/[네] 버튼으로 옮긴다', () => {
    expect(src).not.toContain('typed.focus(');
    expect(src).toContain('if (typed) (noBtn ?? yesBtn).focus({ preventScroll: true });');
  });
  it('초점 옮김은 trapModalFocus(첫 항목 = 입력칸) 뒤에 온다', () => {
    expect(src.indexOf('untrap = trapModalFocus(layer)')).toBeLessThan(src.indexOf('(noBtn ?? yesBtn).focus'));
  });
});
