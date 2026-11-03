// C.266 (사용자 2026-11-04 "타일 배치는 탭으로 따로 빼서, 탭 눌러서 배치하게 … 기존 모험 준비 화면에선 프리셋이랑 타일 배치 수정만" → 시안 B "b로 가자")
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const pv = read('src/ui/planView.ts');
const css = read('src/ui/bha/expedition.css');

describe('C.266 모험 준비 화면 탭 [준비] / [타일 배치]', () => {
  it('옛 손패/프리셋 토글 대신 [준비]/[타일 배치] 탭, 처음은 준비', () => {
    expect(pv).toContain("label: k === 'prep' ? '준비' : '타일 배치'");
    expect(pv).not.toContain("label: k === 'hand' ? '손패' : '프리셋'");
    expect(pv).toContain("setMode?.('prep');");
  });
  it('준비 = 프리셋만 보이고 가진 타일은 숨김, 타일 배치 = 가진 타일만 (프리셋 숨김) + 화면 클래스 is-place', () => {
    expect(pv).toContain("hand.hidden = k !== 'place';");
    expect(pv).toContain("presetEl.hidden = k !== 'prep';");
    expect(pv).toContain("classList.toggle('is-place', k === 'place')");
  });
  it('준비 탭에서 길 칸을 누르면 타일 배치 탭으로', () => {
    expect(pv).toMatch(/querySelector\('\.bha-road'\)\?\.addEventListener\('click'[\s\S]*setMode\?\.\('place'\)/);
  });
  it('타일 배치 탭: 사냥터·난이도·설명 숨김, 길과 가진 타일은 두 열 전체 폭, [출발]은 그대로', () => {
    expect(css).toContain('.bha-lcd .bha-app.bha-plan.is-place > .bha-plan__difficulty');
    expect(css).toContain('.bha-lcd .bha-app.bha-plan.is-place .bha-road { grid-column: 1 / -1; grid-row: 3; }');
    expect(css).toContain('.bha-lcd .bha-app.bha-plan.is-place .bha-road__hand { grid-column: 1 / -1; grid-row: 9; }'); // C.267 [출발] 위 남은 높이만
    expect(css).not.toMatch(/is-place[^{]*bha-plan__go[^{]*\{[^}]*display: none/);
  });
});

// C.267 (마스터AE: 배치 탭 카드 둘째 줄이 [출발] 띠 밑에 깔림) — 목록은 [출발] 위 남은 높이에서만 스크롤, 바닥 '▼ 더 있음'
describe('C.267 가진 타일 목록 스크롤', () => {
  it("배치판 손 목록 바닥에 '▼ 더 있음'(끝까지 내리면 숨김), 바퀴 끝 창(가로 한 줄)에선 숨김", () => {
    const road = read('src/ui/bha/road.ts');
    expect(road).toContain("const handMore = el('div', 'bha-pop__more bha-road__more', '▼ 더 있음');");
    expect(road).toContain('handMore.hidden = hand.scrollTop + hand.clientHeight >= hand.scrollHeight - 2;');
    expect(css).toContain('.bha-sheet .bha-road__more { display: none; }');
  });
});
