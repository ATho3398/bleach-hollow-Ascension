// C.317 (GDD 197장 1·2): 흡수 갈래 버튼 아래·설명 칸 리스크 줄 = 바뀔 때만('그대로' 줄 없음), 첫 흡수 연습 = 전부 숨김(놓아주기 포함).
// 줄이 빠져도 버튼 높이 그대로(173장 2) = 빈 자리 줄(.bha-absorb__risk--none, visibility hidden)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { advance, createExpedition, finishBattle, previewAbsorb, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { ABSORB_MODES, absorbDescLines, absorbResultLine, modeRiskText, showRiskLine } from '../src/ui/absorbView';

const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const CHOICES = [...ABSORB_MODES] as const;

function toAbsorb(factionId: string, o: { tutorial?: boolean; risk?: number } = {}): ExpeditionState {
  const exp = createExpedition({ factionId, seed: 7, hunger: 40, condition: 100, deck: DECK, ...(o.tutorial ? { tutorial: true } : {}) } as Parameters<typeof createExpedition>[0]);
  exp.wildCells = [exp.pos + 1];
  advance(exp);
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  b.finisher = { kind: 'basic-attack', traitId: null, element: null };
  b.riskGained = 0;
  finishBattle(exp, b);
  expect(exp.phase).toBe('absorb');
  if (o.risk !== undefined) exp.risk = o.risk;
  return exp;
}

for (const id of ['hollow', 'shinigami']) {
  const f = getFaction(id);
  describe(`${id}: 리스크 줄 (GDD 197장)`, () => {
    it('첫 흡수 연습 = 갈래 버튼 줄·설명 칸 리스크 줄 전부 없음 (놓아주기 포함)', () => {
      const exp = toAbsorb(id, { tutorial: true });
      for (const m of CHOICES) {
        expect(showRiskLine(exp, m)).toBe(false);
        expect(modeRiskText(f, exp, m)).toBe('');
        expect(absorbDescLines(f, exp, m).some((l) => l.kind === 'risk')).toBe(false);
      }
    });
    it("평소 흡수 = 바뀌는 갈래만 줄, '그대로' 줄은 어디에도 없음. 게이지 이름은 종족 설정", () => {
      for (const risk of [0, 5, 40]) {
        const exp = toAbsorb(id, { risk });
        for (const m of CHOICES) {
          const p = previewAbsorb(exp, m);
          const changes = Math.round(p.riskTo) !== Math.round(p.riskFrom); // 놓아주기도 0 이면 숨김 (C.318)
          const btn = modeRiskText(f, exp, m);
          const desc = absorbDescLines(f, exp, m).find((l) => l.kind === 'risk')?.text;
          expect(Boolean(btn)).toBe(changes);
          expect(Boolean(desc)).toBe(changes);
          expect(btn).not.toContain('그대로');
          expect(desc ?? '').not.toContain('그대로');
          if (changes) expect(btn.startsWith(f.riskGaugeName)).toBe(true);
          // 흡수 뒤 한 줄도 같은 판정 (C.318)
          const line = absorbResultLine(f, exp, m);
          expect(line.includes(f.riskGaugeName)).toBe(changes);
          expect(line).not.toContain('그대로');
        }
      }
    });
    it('그대로인 갈래 줄: 리스크가 0 에서 안 오르는 갈래가 있으면 버튼 줄이 빈다', () => {
      const exp = toAbsorb(id, { risk: 5 });
      for (const m of ABSORB_MODES) {
        const p = previewAbsorb(exp, m);
        if (Math.round(p.riskTo) === Math.round(p.riskFrom)) expect(modeRiskText(f, exp, m)).toBe('');
      }
    });
  });
}

describe('첫 흡수 연습 글 = 리스크 문장 없음 (C.318)', () => {
  it('연습 화면 오른쪽 글·first-absorb 안내 첫 장에 리스크 게이지 이름·releaseRelief 없음', () => {
    const gv = readFileSync('src/ui/guideView.ts', 'utf8');
    expect(gv).not.toContain('riskGaugeName}은(는) 그대로다');
    const guides = JSON.parse(readFileSync('src/data/help/guides.json', 'utf8')) as { guides: Record<string, { body: string }[]> };
    for (const c of guides.guides['first-absorb']!) {
      expect(c.body).not.toContain('{riskGaugeName}');
      expect(c.body).not.toContain('{releaseRelief}');
    }
  });
});

describe('버튼 높이 그대로 (GDD 173장 2)', () => {
  it('줄이 없을 때도 같은 small 줄을 두고 visibility hidden 으로 숨긴다', () => {
    const src = readFileSync('src/ui/absorbView.ts', 'utf8');
    expect(src).toContain("sm.classList.add('bha-absorb__risk--none')");
    const css = readFileSync('src/ui/bha/absorb-status.css', 'utf8');
    expect(css).toMatch(/\.bha-absorb__risk--none \{ visibility: hidden; \}/);
  });
});
