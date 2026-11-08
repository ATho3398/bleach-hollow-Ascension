// C.312 (GDD 193장 5·13, 코딩220): 흡수 후보 블록마다 다른 점 한 줄(데이터 차이) · 슬롯 가득일 때 한 화면(바꿀 칸·보유에만 넣기·포기)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { TRAITS } from '../src/data/traits';
import { gainTrait, newBuild } from '../src/engine/absorb';
import { advance, chooseAbsorb, createExpedition, finishBattle, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { PASSIVE_STAT_TEXT, chainBonusText, traitDiffLine } from '../src/ui/traitDiff';

const read = (p: string) => readFileSync(p, 'utf8');
const H = getFaction('hollow');
const S = getFaction('shinigami');
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const ofEl = (id: string) => TRAITS.filter((t) => t.element === id).map((t) => t.id);
const A = ofEl('fire');

function toAbsorb(exp: ExpeditionState, element: string): void {
  exp.wildCells = [exp.pos + 1];
  advance(exp);
  exp.pending!.enemy = { ...exp.pending!.enemy, element };
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  b.finisher = { kind: 'basic-attack', traitId: null, element: null };
  b.params = { ...b.params, skills: [{ id: 't-fire-a', element: 'fire', category: 'physical', family: 'family-a', role: 'attack', powerInAttacks: 1, chainBonus: { kind: 'stagger', value: 1 }, powerMultiplier: 1 }] };
  finishBattle(exp, b);
}

describe('193장 5: 블록마다 다른 점 한 줄 (traitDiffLine)', () => {
  it('같은 속성 공격 블록 조·교·탄(참·권·귀)은 서로 다른 줄 — 계열 이름 · 1→2→3단계 기술 · 3단계 추가 효과 (두 종족)', () => {
    for (const f of [H, S]) {
      for (const el of ['earth', 'fire', 'water']) {
        const atk = TRAITS.filter((t) => t.element === el && t.kind === 'skill' && t.role === 'attack' && !t.boss).map((t) => traitDiffLine(f, t.id));
        expect(atk.length).toBe(3);
        expect(new Set(atk).size).toBe(3);
        for (const line of atk) {
          expect(line).toMatch(/계열 · .+ → .+ → .+ · 3단계 적 행동 [\d.]+초 지연$/);
          expect(line).not.toMatch(/\.$/); // 한 줄 = 마침표 없음 (text-style 2장)
          expect(line).not.toMatch(/회분|×/); // 수치(위력·배율)는 흡수 화면에 안 보인다 (158장 4)
        }
      }
    }
    expect(traitDiffLine(H, 't-earth-a')).toBe('조(爪) 계열 · 할퀴기 → 갈퀴 연타 → 맹조 난무 · 3단계 적 행동 1.5초 지연');
    expect(traitDiffLine(S, 't-fire-c')).toBe('귀(鬼) 계열 · 파도 1 충 → 파도 2 백뢰 → 파도 금강폭 · 3단계 적 행동 1.5초 지연');
    expect(traitDiffLine(H, 'boss-sand-maw')).toBe(traitDiffLine(H, 't-earth-a')); // 보스 특성도 계열 줄 (같은 계열이면 같은 줄)
    expect(traitDiffLine(H, 't-earth-b', { short: true })).toBe('교(咬) 계열 · 3단계 적 행동 2초 지연'); // 좁은 슬롯 줄용
  });
  it('패시브 = 오르는 능력치 종류(수치 없음), 외형 파츠 = 표시만, 치명타 특성은 한 토막 더', () => {
    expect(traitDiffLine(H, 't-fire-passive')).toBe(`${PASSIVE_STAT_TEXT.attackPower}이 오른다`);
    expect(traitDiffLine(S, 't-earth-passive')).toBe(`${PASSIVE_STAT_TEXT.damageTaken}가 준다`);
    expect(traitDiffLine(H, 't-thunder-passive')).toBe(`${PASSIVE_STAT_TEXT.attackSpeed}가 오른다`);
    expect(traitDiffLine(H, 't-poison-passive')).toBe(`${PASSIVE_STAT_TEXT.blockSpawn}가 오른다`);
    expect(traitDiffLine(H, 't-fire-part')).toBe('외형만 바뀐다');
    expect(traitDiffLine(H, 't-thunder-part')).toBe('외형만 바뀐다 · 치명타 확률이 오른다');
    expect(chainBonusText({ kind: 'reflect', value: 1 })).toBe('피해 반사');
    expect(chainBonusText({ kind: 'cleanse', value: 20 })).toBe('봉인 해제');
    expect(chainBonusText(undefined)).toBeNull();
  });
  it('흡수 후보 카드·슬롯 가득 한 화면의 넣을 곳 줄·고른 후보 설명이 이 한 줄을 읽는다 (종족 분기 없음)', () => {
    const a = read('src/ui/absorbView.ts');
    expect(a).toContain("el('span', 'bha-cand__diff', traitDiffLine(faction, id))");
    expect(a).toContain("el('span', 'bha-slot__diff', traitDiffLine(faction, id!, { short: true }))");
    expect(a).toContain("el('b', 'bha-absorb__diff', traitDiffLine(faction, id))");
    expect(read('src/ui/traitDiff.ts')).not.toMatch(/faction(Id)?\s*===\s*'(hollow|shinigami)'/);
    // '1/100' → '강화 1/100' (개선점 5 추천): 후보 카드·슬롯 줄·왼쪽 슬롯 현황
    expect(a).toContain("`강화 ${enhanceFraction(exp.build, t.element)}`");
    expect(a).toContain("`강화 ${enhanceFraction(b, t.element)}`");
  });
});

describe('193장 13: 슬롯 가득 — 보유에만 넣기 (엔진)', () => {
  it("gainTrait(…, 'owned') = 보유 목록에만, 슬롯은 그대로 (빈 칸이 있어도 안 낀다)", () => {
    const b = newBuild();
    for (const id of A.slice(0, 3)) gainTrait(b, id);
    expect(b.slots).toEqual(A.slice(0, 3));
    expect(gainTrait(b, 't-water-a', 'owned')).toEqual({ ok: true });
    expect(b.owned).toContain('t-water-a');
    expect(b.slots).toEqual(A.slice(0, 3));
    expect(gainTrait(b, 't-water-a', 'owned').ok).toBe(false); // 이미 가진 특성
    const c = newBuild();
    expect(gainTrait(c, 't-water-b', 'owned')).toEqual({ ok: true });
    expect(c.slots.every((s) => s === null)).toBe(true);
    expect(c.owned).toEqual(['t-water-b']);
  });
  it('원정 흡수: 가득일 때 보유에만 넣기 — 흡수 규칙·수치·런 로그는 교체와 같고 슬롯만 그대로', () => {
    const mk = () => {
      const exp = createExpedition({ factionId: 'hollow', seed: 5, hunger: 10, condition: 100, deck: DECK });
      exp.build.owned.push(...A.slice(0, 3));
      exp.build.slots = A.slice(0, 3);
      toAbsorb(exp, 'water');
      return exp;
    };
    const keep = mk();
    const swap = mk();
    const cand = keep.absorbOffer!.candidates[0]!;
    expect(swap.absorbOffer!.candidates[0]).toBe(cand);
    expect(chooseAbsorb(keep, cand, 'owned')).toEqual({ ok: true });
    expect(chooseAbsorb(swap, cand, 1)).toEqual({ ok: true });
    expect(keep.build.slots).toEqual(A.slice(0, 3));
    expect(swap.build.slots[1]).toBe(cand);
    expect(keep.build.owned).toContain(cand);
    expect(keep.acquiredTraits).toEqual(swap.acquiredTraits);
    expect(keep.absorbRecords).toEqual(swap.absorbRecords);
    expect(keep.risk).toBe(swap.risk);
    expect(keep.evolution.ev).toEqual(swap.evolution.ev);
    expect(keep.phase).toBe('moving');
  });
});

describe('193장 13: 흡수 화면 흐름 — 2단계 한 화면', () => {
  const a = read('src/ui/absorbView.ts');
  it('교체 3단계 화면이 없다: 단계 = 1 갈래 · 2 특성, 뒤로 = 2단계 → 1단계', () => {
    expect(a).toContain("const STEP_LABELS = ['갈래', '블록'] as const;");
    expect(a).not.toMatch(/step === 'replace'|function replaceStep|bha-absorbv2--replace/);
    expect(a).toMatch(/if \(step === 'pick'\) step = 'choose';\s*else \{/);
  });
  it('가득이면 후보 버튼 줄(고르기만) → 넣을 곳 = 칸마다 [이것과 바꾸기] + [보유에만 넣기], 아래 줄 [포기] 자리 그대로', () => {
    expect(a).toContain("const full = isFull(exp.build) && fresh.length > 0;");
    expect(a).toContain("'bha-absorb__actions bha-absorb__candbtns'");
    expect(a).toContain("chooseAbsorb(exp, picked, 'owned', mode)");
    expect(a).toContain("'보유에만 넣기'");
    expect(a).toContain("lab.append('포기', el('span', 'bha-btn__sub', `블록 없이 ${act}`));");
    expect(a).toContain('이것과 바꾸기');
    // 가진 블록 후보는 가득이어도 교체 없이 강화만 (106장 1) — 버튼을 누르면 바로
    expect(a).toContain("if (have) b.onclick = () => finish(chooseAbsorb(exp, id, undefined, mode), true);");
  });
  it('CSS: 후보 버튼 줄·넣을 곳 줄 = 토큰만', () => {
    const css = read('src/ui/bha/absorb-status.css');
    expect(css).toContain('.bha-absorbv2 .bha-absorb__candbtns {');
    expect(css).toContain('.bha-absorbv2 .bha-slot__diff {');
    const v2 = css.slice(css.indexOf('흡수 화면 리디자인 v2')).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(v2).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});
