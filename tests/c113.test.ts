import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/bha/components/components.css', 'utf8');
const rule = (sel: string): string => {
  const i = css.indexOf(`${sel} {`);
  expect(i, sel).toBeGreaterThanOrEqual(0);
  return css.slice(i, css.indexOf('}', i));
};

describe('C.113 도감 단계 탭: 한 어절이 줄 가운데서 끊기지 않는다 (GDD 57)', () => {
  it('쌓은 탭은 한 줄 유지·한국어 어절 단위, 칸 폭은 이름 폭 아래로 줄지 않는다', () => {
    const item = rule('.bha-seg--stack .bha-seg__item');
    expect(item).toContain('white-space: nowrap');
    expect(item).toContain('word-break: keep-all');
    expect(item).toContain('overflow-wrap: normal');
    expect(rule('.bha-seg--stack')).toContain('minmax(max-content, 1fr)');
  });
  it('도감 단계 탭은 쌓은 탭(stack)을 쓴다', () => {
    expect(readFileSync('src/ui/dexView.ts', 'utf8')).toMatch(/\{ stack: true \}/);
  });
});
