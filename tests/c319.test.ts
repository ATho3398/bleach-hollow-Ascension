import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('C.319 걷기 왼쪽 위 = C.281 능력치 상태창 (GDD 197장 3)', () => {
  const view = read('src/ui/expeditionView.ts');
  const css = read('src/ui/bha/walk-scene.css');

  it('판 = 목표 · 사냥터(폭주·강적 칩) · 막대 줄 · 슬롯 줄 (C.281 순서), 아이콘은 C.281 그림', () => {
    expect(view).toContain('chips.append(goal, where, meters, makeSlotsLine());');
    expect(view).toContain('where.append(frenzyChip, aheadChip);');
    expect(view).toContain('keepOldIcons(chips);');
    expect(view).not.toContain('bha-exp__plate');
    expect(view).not.toContain('bha-exp__warn');
  });

  it('막대 줄 = 바퀴 · 배부름 · 컨디션(+공허) · 리스크 게이지 — 이름은 종족 설정, 체력은 발밑 막대에만', () => {
    const block = view.slice(view.indexOf('meters.replaceChildren('), view.indexOf('const hpPct'));
    expect(block).toContain("kind: 'sp', label: '바퀴'");
    expect(block).toContain('label: faction.fullnessName');
    expect(block).toContain("kind: 'cond', label: '컨디션'");
    expect(block).toContain('label: faction.riskGaugeName');
    expect(block).not.toContain("kind: 'player'");
    expect(view).toContain("const hpBox = el('div', 'bha-exp__hp');");
    expect(view).not.toMatch(/faction\.id === '(hollow|shinigami)'/);
  });

  it('판 CSS = C.281 값(폭 min(180px, 34%) · 여백 sp-3/sp-4 · 모서리 r-md), 배경은 토큰만', () => {
    const rule = css.slice(css.indexOf('.bha-exp__chips {'), css.indexOf('}', css.indexOf('.bha-exp__chips {')));
    expect(rule).toContain('width: min(180px, 34%)');
    expect(rule).toContain('padding: var(--bha-sp-3) var(--bha-sp-4)');
    expect(rule).toContain('border-radius: var(--bha-r-md); background: var(--bha-scene-box)');
    expect(rule).not.toMatch(/rgb\(|#[0-9a-fA-F]{3,6}/);
    expect(css).toContain('.bha-exp__chips .bha-meter--compact .bha-meter__track { height: 6px; }');
  });
});
