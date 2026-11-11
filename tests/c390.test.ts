// C.390 (GDD 238장): 방 상태 박스 한 덩어리 — 줄마다 같은 [아이콘 | 막대 | 숫자] 열(subgrid), 푸는 법은 막대 열 시작, ⓘ 는 박스 안
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/bha/room.css', import.meta.url), 'utf8');
const view = readFileSync(new URL('../src/ui/roomView.ts', import.meta.url), 'utf8');

describe('238장 상태 박스', () => {
  it('박스 = 3열 격자, 줄 = subgrid (상태이상 줄도 같은 열)', () => {
    expect(css).toContain('grid-template-columns: 14px minmax(0, 1fr) auto;');
    expect(css).toContain('> .bha-room__gauge { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid;');
  });
  it("'모험 1번'(푸는 법)은 막대 열 시작에 맞춘 왼쪽 정렬", () => {
    expect(css).toContain('> .bha-room__gauge > .bha-room__gaugehint { grid-column: 2 / -1; text-align: left; }');
  });
  it('ⓘ 는 박스 안 오른쪽 아래 (옛 바깥 자리·옆자리 바깥 규칙 없음), 박스 반폭에 ⓘ 를 더하지 않는다', () => {
    expect(css).toContain('.bha-room__chips > .bha-info.bha-room__statusinfo { position: absolute; left: auto; right: var(--bha-sp-1); bottom: var(--bha-sp-1);');
    expect(css).not.toContain('.bha-room__chips.is-side.is-right > .bha-room__statusinfo');
    expect(view).not.toContain('chipRow.offsetWidth / 2 + statusInfoBtn.offsetWidth');
  });
});
