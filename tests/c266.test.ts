// C.266 (사용자 2026-11-04 "타일 배치는 탭으로 따로 빼서, 탭 눌러서 배치하게 … 기존 모험 준비 화면에선 프리셋이랑 타일 배치 수정만" → 시안 B "b로 가자")
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const pv = read('src/ui/planView.ts');
const css = read('src/ui/bha/expedition.css');

describe('C.266 모험 준비 화면 탭 [준비] / [타일 배치]', () => {
  it('옛 손패/프리셋 토글 대신 [준비]/[타일 배치] 탭, 처음은 준비', () => {
    expect(pv).toContain("k === 'prep' ? '준비' : '타일 배치'");
    expect(pv).not.toContain("label: k === 'hand' ? '손패' : '프리셋'");
    expect(pv).toContain("setMode?.('prep');");
  });
  // GDD 193장 12 (C.307): 프리셋 판은 [타일 배치] 탭으로 옮김 — 준비 탭은 프리셋·가진 타일 모두 숨김
  it('준비 = 프리셋·가진 타일 숨김, 타일 배치 = 가진 타일 + 프리셋 판 + 화면 클래스 is-place', () => {
    expect(pv).toContain("hand.hidden = k !== 'place';");
    expect(pv).toContain("presetEl.hidden = k !== 'place';");
    expect(pv).toContain("classList.toggle('is-place', k === 'place')");
  });
  it('준비 탭 길 = 작은 네모 12개(6개씩 2줄, 타일 색만·누를 수 없음) + 놓은 타일 n/최대 — C.298 (GDD 189장)', () => {
    expect(pv).toContain("const mini = el('div', 'bha-plan__mini');");
    expect(pv).toContain("miniText.append('놓은 타일 ', miniCount);");
    const css = read('src/ui/bha/expedition.css');
    expect(css).toMatch(/\.bha-plan__mini \{[^}]*grid-template-columns: repeat\(6, 10px\);[^}]*pointer-events: none;/);
    expect(css).toContain('.bha-lcd .bha-app.bha-plan:not(.is-place) .bha-road { display: none; }');
  });
  it('타일 배치 탭: 사냥터·난이도·설명 숨김, 길과 가진 타일은 두 열 전체 폭, [출발]은 그대로', () => {
    // 리디자인 v2 (GDD 183장 S07): 사냥터·난이도 줄·설명 숨김, 길 = 전체 폭 한 줄, 가진 타일 = [출발] 띠 위 남은 높이(4열)
    expect(css).toContain('.bha-lcd .bha-app.bha-plan.is-place > .bha-plan__row,');
    expect(css).toContain('.bha-lcd .bha-app.bha-plan.is-place > .bha-plan__desc { display: none; }');
    expect(css).toContain('.bha-lcd .bha-app.bha-plan.is-place .bha-road { position: absolute; left: 10px; right: 10px;');
    expect(css).toMatch(/\.bha-app\.bha-plan\.is-place \.bha-road__hand \{[^}]*right: 220px;[^}]*bottom: 60px;[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/); // C.267 [출발] 위 남은 높이만 · C.307 오른쪽 프리셋 판 자리(3열)
    expect(css).not.toMatch(/is-place[^{]*bha-plan__go[^{]*\{[^}]*display: none/);
  });
});

// C.267 (마스터AE: 배치 탭 카드 둘째 줄이 [출발] 띠 밑에 깔림) — 목록은 [출발] 위 남은 높이에서만 스크롤, 바닥 '▼ 더 있음'
describe('C.267 가진 타일 목록 스크롤', () => {
  it("배치판 손 목록 바닥에 '▼ 더 있음'(끝까지 내리면 숨김), 바퀴 끝 창(가로 한 줄)에선 숨김", () => {
    const road = read('src/ui/bha/road.ts');
    expect(road).toContain("const handMore = el('div', 'bha-more bha-more--sticky bha-road__more', '▼ 더 있음');"); // C.296 공용 띠
    expect(road).toContain('handMore.hidden = hand.scrollTop + hand.clientHeight >= hand.scrollHeight - 2;');
    expect(read('src/ui/bha/walk-scene.css')).toContain('.bha-nestsheet__body .bha-road__more { display: none; }');
  });
});
