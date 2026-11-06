// C.309 (GDD 193장 3 보충): 바퀴 끝 뽑기 카드 — 이름은 한 줄(꺾지 않고 넘치면 글자 줄임 → 말줄임 + title), '새 타일'·'이벤트' 표시는 카드 위 테두리에 걸쳐 이름을 안 덮는다.
// 실제 화면 확인은 scripts/c309-proof.cjs (docs/captures/c309/proof.json 의 draft 줄: oneLine·cut·tagOverName).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/ui/bha/walk-scene.css', 'utf8');
const shared = readFileSync('src/ui/bha/components/v2-shared.css', 'utf8');
const view = readFileSync('src/ui/expeditionView.ts', 'utf8');
const road = readFileSync('src/ui/bha/road.ts', 'utf8');
const rule = (src: string, sel: string): string => {
  const i = src.indexOf(`${sel} {`);
  expect(i, sel).toBeGreaterThanOrEqual(0);
  return src.slice(i, src.indexOf('}', i));
};

describe('C.309 뽑기 카드 이름·표시', () => {
  it('이름은 fitOneLine 으로 한 줄 (뽑기 카드·타일 카드)', () => {
    expect(view).toMatch(/fitOneLine\(el\('b', 'bha-draft__name'/);
    expect(road).toMatch(/fitOneLine\(el\('b', 'bha-tilecard__name'/);
    expect(rule(shared, '.bha-fit1')).toMatch(/white-space: nowrap/);
    expect(rule(css, '.bha-draft__name')).not.toMatch(/overflow-wrap|word-break/);
    expect(rule(shared, '.bha-tilecard__name')).not.toMatch(/overflow-wrap|word-break/);
  });
  it('이름은 카드 폭 전부(옆 아이콘 칸 없음)', () => {
    expect(rule(css, '.bha-lcd .bha-exp .bha-draft__row > .bha-draft__card')).toMatch(/grid-template-columns: minmax\(0, 1fr\);/);
    expect(view).not.toMatch(/bha-tilechip__icon/);
  });
  it("'새 타일' 표시는 아래 끝을 카드 위쪽 여백 안에 고정 (글자가 커지면 위로 자란다)", () => {
    const tag = rule(css, '.bha-lcd .bha-exp .bha-draft__card > .bha-draft__tag');
    expect(tag).toMatch(/top: auto; bottom: calc\(100% - 7px\)/);
    expect(tag).toMatch(/min-height: 0/);
  });
});
