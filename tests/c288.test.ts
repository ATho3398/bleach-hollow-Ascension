// C.288 (GDD 183장 화면 E, 코딩203): 리디자인 v2 — 가방·상점류·상세 창·걷기 가방
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('화면 E 리디자인 v2', () => {
  const css = read('src/ui/bha/shop.css');
  const ui = read('src/ui/bha/itemUi.ts');
  it('화면 CSS: hex·그라데이션·glow 없음', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(body).not.toMatch(/gradient\(/);
    expect(body).not.toMatch(/--bha-glow/);
  });
  it('카드 = v2 .bha-card · 오른쪽 위 작은 수 · 가격은 화폐 아이콘 + 숫자, 격자 4열', () => {
    expect(ui).toContain("el('button', `bha-card bha-itemcard");
    expect(ui).toContain("'bha-count bha-itemcard__badge'");
    expect(ui).toContain("'bha-card-price bha-itemcard__foot bha-itemcard__price'");
    expect(css).toMatch(/\.bha-itemgrid \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    expect(read('src/ui/shopView.ts')).toContain("const CUR_ICON: Record<ShopRow['currency'], string> = { gold: 'v2-coin', jade: 'v2-gem' };");
  });
  it('탭 = v2 .bha-tabs/.bha-tab (+ 아이콘), 튜토리얼·키 조작이 찾는 role=tab·data-tab 그대로', () => {
    expect(ui).toContain("'bha-tabs bha-itemtabs'");
    expect(ui).toContain("`bha-tab bha-itemtab${");
    expect(ui).toContain("b.setAttribute('role', 'tab')");
    expect(ui).toContain('b.dataset.tab = t.id');
  });
  it('상세 창 = 머리(그림·이름·×) / 본문 스크롤 + 더 있음 / 아래 고정 [닫기][행동], 튜토리얼 대상 data-item-dialog·data-act 그대로', () => {
    expect(ui).toContain("'bha-win-head bha-itemmodal__headrow'");
    expect(ui).toContain("'bha-win-foot bha-itemmodal__acts'");
    expect(ui).toContain("x.classList.add('bha-itemmodal__close')"); // app.ts 튜토리얼이 누르는 닫기
    expect(ui).toContain('layer.dataset.itemDialog = s.id');
    expect(ui).toContain('if (a.key) b.dataset.act = a.key');
    expect(ui).toContain('moreHint(desc, descBox)');
  });
  it('가방 장비: 자리 60×66, 능력치 줄 없음(상세 창 비교), 아래 고정 줄은 화면 맨 아래', () => {
    expect(css).toMatch(/\.bha-eqslot \{[^}]*width: 60px; height: 66px;/);
    const eq = read('src/ui/equipView.ts');
    expect(eq).not.toContain("h('div', 'bha-eqstats')");
    expect(eq).toContain('return { left, right, foot, restore };');
    expect(read('src/ui/lcdScreens.ts')).toContain('page.app.append(t.foot);');
  });
  it('장비 분류 탭은 글자 폭만큼 (전투 소모품·칼자루 장식 넘침 고침)', () => {
    expect(css).toMatch(/\.bha-equip-page \.bha-eqright \.bha-itemtab \{ flex: 1 0 auto;/);
  });
});
