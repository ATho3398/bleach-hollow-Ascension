// C.324 (코딩232): 설정 기타 탭 글·버튼 겹침 — 버전 줄 한 번만 · 조작 칸이 줄어 단추가 설명 위로 넘치지 않게 · 넘치면 '▼ 더 있음'
// 실제 겹침·잘림은 scripts/c324-proof.cjs 가 PC 844·폰 796·글자 1.15 × 처음 화면/둥지 설정 4탭에서 잰다 (docs/captures/c324/proof.json).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('C.324 설정 겹침', () => {
  it('정보: 버전 글은 한 줄만 — 같은 글을 단추로 또 그리지 않고, 그 글 줄이 7번 누름을 받는다', () => {
    const s = read('src/ui/settingsView.ts');
    expect(s).toContain("const verLine = el('p', 'bha-faint', versionLabel());");
    expect(s).toContain('...testInfoNodes(verLine)');
    const t = read('src/ui/testMode.ts');
    expect(t).not.toContain('button({ label: versionLabel()');
    expect(t).toContain("ver.classList.add('bha-testver');");
  });
  it('설정 줄 조작 칸은 줄지 않는다 (단추가 왼쪽 설명 위로 넘치던 것)', () => {
    const c = read('src/ui/bha/components/v2-shared.css');
    expect(c).toMatch(/\.bha-setrow__ctl \{ flex: 0 0 auto; max-width: 60%;/);
  });
  it('본문이 길면 바닥 \'▼ 더 있음\' (공용 띠, 끝까지 내리면 숨김)', () => {
    const s = read('src/ui/settingsView.ts');
    // GDD 241-A 6: 띠는 스크롤 칸 밖(본문 위 겹침) — 숨길 때 스크롤 높이가 바뀌지 않는다
    expect(s).toContain("el('div', 'bha-more bha-settings__more', '▼ 더 있음')");
    expect(s).toContain('(scroller.parentElement ?? scroller).append(more);');
    expect(s).toContain("scroller.addEventListener('scroll', syncMore, { passive: true });");
  });
});
