// C.294 (GDD 187장, 코딩206): 전투 [막기] 왼쪽 블록 생성 게이지 이름표 = '블록' (옛 '생성'·'다음 블록'). 봉인 = '봉인' + 남은 초 그대로
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('블록 게이지 이름 (187장)', () => {
  it('전투 게이지 이름표 = 블록, 봉인 이름표 그대로', () => {
    const v = read('src/ui/battleView.ts');
    // C.302 (GDD 190장 2): 전투 화면을 C.281 모양(.bha-v2role 알약)으로 되돌림 — 이름표만 '블록'/'봉인' 유지
    expect(v).toContain("el('span', 'bha-v2role__name bha-v2role__name--block', '블록')");
    expect(v).toContain("el('span', 'bha-v2role__name bha-v2role__name--seal', '봉인')");
    expect(v).not.toContain("'다음 블록')");
    expect(v).not.toContain("'bha-v2role__name', '생성'");
    expect(v).toContain(": sg.state === 'off' ? `블록 게이지`");
  });
  it('도움말도 같은 이름 (같은 종류 전부)', () => {
    const g = read('src/data/help/glossary.json');
    expect(g).toContain("'블록' 게이지");
    expect(g).not.toContain("'생성' 게이지");
  });
});
