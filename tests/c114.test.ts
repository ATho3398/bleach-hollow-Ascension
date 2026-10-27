import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOOK_TABS } from '../src/ui/bookView';

const read = (p: string): string => readFileSync(p, 'utf8');

describe('C.114 책장 머리 제목 토글 (GDD 58)', () => {
  it('도감 목록은 진화체 도감 · 칭호 도감 둘 (제목에 지금 도감 이름 + ▾)', () => {
    expect(BOOK_TABS).toEqual([{ id: 'dex', label: '진화체 도감' }, { id: 'titles', label: '칭호 도감' }]);
  });
  it('책장은 제목 토글(viewTitle)로 바꾸고, 머리의 탭 2개 줄(seg)은 더 쓰지 않는다 — 두 도감이 같은 제목 요소를 받는다', () => {
    const book = read('src/ui/bookView.ts');
    expect(book).toContain('viewTitle(');
    expect(book).not.toMatch(/seg\(/);
    expect(read('src/ui/dexView.ts')).toMatch(/title: string \| Node = '진화체 도감'/);
    expect(read('src/ui/titleDexView.ts')).toMatch(/title: string \| Node = '칭호 도감'/);
    // 머리 aside 에는 단계/종류 탭만 남는다 (옛 lead 탭줄 없음)
    // C.171(GDD 100장 #73): 진화체 도감은 단계 탭 대신 한 목록 + 단계 머리줄 — 머리 aside 없음
    expect(read('src/ui/dexView.ts')).not.toContain('aside:');
    expect(read('src/ui/titleDexView.ts')).toContain('aside: [selectLast(tabs)]');
  });
  it('토글: 같은 도감을 누르면 닫기만, 바깥 누르면 닫힘, 화면이 사라지면 리스너를 푼다', () => {
    const t = read('src/ui/bha/viewtitle.ts');
    expect(t).toContain("if (o.id !== now.id) onPick(o.id);");
    expect(t).toContain("document.addEventListener('pointerdown', outside, true)");
    expect(t).toContain('if (!root.isConnected) return stop();');
    expect(t).toContain("setAttribute('aria-expanded'");
  });
  it('모양은 bha 토큰만(새 색·간격 없음): .bha-viewtitle 규칙에 직접 색 값이 없다', () => {
    const css = read('src/ui/bha/screens-lcd.css');
    const i = css.indexOf('.bha-viewtitle {');
    expect(i).toBeGreaterThan(0);
    const block = css.slice(i);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
    expect(block).toContain('.bha-viewtitle__list[hidden]');
  });
});
