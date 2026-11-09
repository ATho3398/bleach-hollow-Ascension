// C.332 적 도감 상세 보충 (GDD 200장 보충): 흡수 줄 2칸 × 2줄 격자(칸 = 이름·숫자, 0 칸 자리 고정) · 머리 줄 칩 묶음 · 진화체 도감 '여러 값 한 줄' 칸 덩어리
// 화면 배치(PC·폰·글자 1.15 실측)는 scripts/c332-proof.cjs. 여기서는 소스·CSS 구조와 칸 나누기 함수만 본다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { ABSORB_KINDS } from '../src/engine/enemyDex';
import { absorbsText } from '../src/ui/enemyDexView';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('흡수 줄 격자 (200장 9 보충)', () => {
  const view = read('src/ui/enemyDexView.ts');
  const css = read('src/ui/bha/screens-lcd.css');
  it('상세 흡수 줄은 글자 한 줄이 아니라 갈래마다 칸(이름·숫자) 4개 격자', () => {
    expect(view).toMatch(/line\('흡수', absorbsGrid\(faction, entry\)\)/);
    expect(view).toMatch(/for \(const k of ABSORB_KINDS\)/);
    expect(ABSORB_KINDS).toHaveLength(4);
    expect(css).toMatch(/\.bha-edex__absorbs \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(2, max-content\)/);
    expect(css).toMatch(/\.bha-edex__ab \{[^}]*justify-content: space-between;[^}]*white-space: nowrap;/);
  });
  it('읽기 글자(aria-label)는 예전 한 줄 글자와 같다 — 0 갈래도 자리 고정', () => {
    for (const id of ['hollow', 'shinigami']) {
      const f = getFaction(id);
      const t = absorbsText(f, { absorbs: { both: 2, trait: 0, stat: 0, none: 0 } });
      expect(t.split(' · ')).toHaveLength(4);
      expect(t.endsWith(`${f.absorbModeNames.none} 0`)).toBe(true);
    }
  });
});

describe('머리 줄 칩 묶음', () => {
  it('그림 | [이름 + 칩 묶음] — 칩은 한 덩어리(줄바꿈 없음), 머리 줄은 그림 아래로 접히지 않는다', () => {
    const view = read('src/ui/enemyDexView.ts');
    const css = read('src/ui/bha/screens-lcd.css');
    // C.363(GDD 220장 1): 이름·그림은 상세 창 머리(공용 창 틀), 본문 첫 줄 = 칩 묶음
    expect(view).toMatch(/id\.append\(chips\)/);
    expect(view).toMatch(/art: enemyArtBox\(card\.id, true, 'bha-edex__art--hero'\)/);
    expect(css).toMatch(/\.bha-edex__head \{ flex-wrap: nowrap;/);
    expect(css).toMatch(/\.bha-edex__chips \{[^}]*flex-wrap: nowrap;/);
    expect(css).toMatch(/\.bha-edex__id \{[^}]*flex-wrap: wrap;/);
  });
});

describe('진화체 도감 여러 값 한 줄', () => {
  it("' · ' 로 이은 줄은 칸마다 줄바꿈 없는 덩어리 (DOM 실측은 proof)", () => {
    const dex = read('src/ui/dexView.ts');
    expect(dex).toMatch(/line\.split\(' · '\)/);
    expect(dex).toMatch(/h\('span', 'bha-mddetail__pair', p\)/);
    expect(dex).toMatch(/body\.append\(h\('br'\), \.\.\.pairsOf\(line\)\)/);
    expect(read('src/ui/bha/screens-lcd.css')).toMatch(/\.bha-mddetail__pair \{ white-space: nowrap; \}/);
  });
});
