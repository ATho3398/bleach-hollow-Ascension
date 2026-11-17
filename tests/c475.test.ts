// C.475: 진화 결과 왼쪽 판 = 그림·단계 줄·이유·새 진화체 상자가 스크롤 없이 전부 (PC 844×390 · 폰 796×384), 호로·사신 모든 단계
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('진화 결과 왼쪽 판 (C.475)', () => {
  it('CSS: 여백·줄 간격은 토큰, 새 진화체 상자 = 한 흐름 줄, 줄어드는 것은 그림 칸뿐(최대 96)', () => {
    const css = read('src/ui/bha/absorb-status.css');
    expect(css).toContain('padding: var(--bha-sp-4) var(--bha-sp-5); gap: var(--bha-sp-2); align-items: stretch; justify-content: safe center;');
    expect(css).toContain('.bha-lcd .bha-evolvev2 .bha-evolve__resmain > * { flex-shrink: 0; }');
    expect(css).toContain('.bha-lcd .bha-evolvev2 .bha-evolve__resmain > .bha-evolve__fig--result { flex: 0 1 96px; min-height: 0; }');
    expect(css).toContain('.bha-lcd .bha-evolvev2 .bha-evolve__resmain > .bha-evolve__new { display: block; text-align: center; line-height: var(--bha-lh-tight); }');
    expect(css).toContain('.bha-evolve__fig--result { flex: none; height: 96px; }'); // 다른 곳(이 판 밖)의 그림 칸 규칙은 그대로
  });

  it('실측(docs/captures/c475/proof.json, 진짜 진화 판정): 새 진화체 상자 판 안 · 스크롤 없음 · 그림 칸 안 — 호로 길리안·아쥬커스 7·4단계, 사신 2·3·4단계, PC·폰', () => {
    const pf = 'docs/captures/c475/proof.json';
    expect(existsSync(pf)).toBe(true);
    type M = { key: string; newLine: string; drawnInFig: boolean; figInPanel: boolean; newInPanel: boolean; noScroll: boolean; fig: { top: number; bottom: number } };
    const facts = JSON.parse(read(pf)).facts as Record<string, M[]>;
    const pc = facts['evolve-pc']!;
    const phone = facts['evolve-phone']!;
    expect(pc.map((m) => m.key)).toEqual(['t2-gillian', 't3-carapace', 't3-stag', 't3-rhino', 't3-wyrm', 't3-panther', 't3-scorpion', 't3-wraith', 't4', 's-t2', 's-t3', 's-t4']);
    expect(phone.map((m) => m.key)).toEqual(['t2-gillian', 't3-rhino', 't3-wyrm', 't4', 's-t3']);
    for (const m of [...pc, ...phone]) {
      expect(m.newInPanel, m.key).toBe(true);
      expect(m.noScroll, m.key).toBe(true);
      expect(m.drawnInFig, m.key).toBe(true);
      expect(m.figInPanel, m.key).toBe(true);
      expect(m.newLine, m.key).toContain('새 진화체:');
    }
    // 아쥬커스 모델은 그림 칸이 줄지 않는다(PC 96)
    for (const m of pc.filter((x) => x.key.startsWith('t3-'))) expect(m.fig.bottom - m.fig.top, m.key).toBe(96);
    expect(pc.find((m) => m.key === 't3-rhino')!.newLine).toContain('외팔형 아쥬커스');
  });
});
