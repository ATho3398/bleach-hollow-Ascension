// C.244 (GDD 163장): 흡수 갈래 = 고르기 → 설명 칸 → 실행. 설명 칸 값(능력치·리스크 게이지·받는 것)은 엔진 previewAbsorb 그대로 = 실제 실행 결과와 같다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { STAT_IDS } from '../src/data/schema';
import { advance, chooseAbsorb, chooseRelease, createExpedition, finishBattle, previewAbsorb, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { ABSORB_MODES, absorbDescLines, absorbModeText, gaugeDelta } from '../src/ui/absorbView';

const RX = BALANCE.provisional.risk;
const S = getFaction('shinigami');
const H = getFaction('hollow');
const AX = BALANCE.provisional.absorb;
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const read = (p: string) => readFileSync(p, 'utf8');

function toAbsorb(factionId: string, o: { tutorial?: boolean; risk?: number } = {}): ExpeditionState {
  const exp = createExpedition({ factionId, seed: 7, hunger: 40, condition: 100, deck: DECK, ...(o.tutorial ? { tutorial: true } : {}) } as Parameters<typeof createExpedition>[0]);
  exp.wildCells = [exp.pos + 1];
  advance(exp);
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  b.finisher = { kind: 'basic-attack', traitId: null, element: null };
  b.params = { ...b.params, skills: [{ id: 't-fire-a', element: 'fire', category: 'physical', role: 'attack', powerInAttacks: 1, chainBonus: { kind: 'stagger', value: 1 }, powerMultiplier: 1 }] };
  b.riskGained = 0;
  finishBattle(exp, b);
  expect(exp.phase).toBe('absorb');
  if (o.risk !== undefined) exp.risk = o.risk;
  return exp;
}

const evDiff = (a: ExpeditionState, b: ExpeditionState) => Object.fromEntries(STAT_IDS.map((s) => [s, Math.round((b.evolution.ev[s] - a.evolution.ev[s]) * 100) / 100]).filter(([, v]) => (v as number) > 0));

describe('흡수 미리보기 = 실제 (GDD 163장 2)', () => {
  for (const m of ABSORB_MODES) {
    it(`${m}: 능력치·리스크·타일·안정도가 실제 실행과 같고, 원래 상태는 안 바뀐다`, () => {
      const exp = toAbsorb('shinigami', { risk: 5 });
      const before = JSON.stringify(exp);
      const p = previewAbsorb(exp, m);
      expect(JSON.stringify(exp)).toBe(before);
      const real = structuredClone(exp);
      const r = m === 'none' ? chooseRelease(real) : chooseAbsorb(real, null, undefined, m);
      expect(r.ok).toBe(true);
      expect(p.ev).toEqual(evDiff(exp, real));
      expect(p.riskTo).toBe(real.risk);
      expect(p.tiles).toBe(real.hand.length - exp.hand.length);
      expect(p.stabilityTo).toBe(real.stability);
      expect(real.hunger).toBe(exp.hunger); // GDD 163장 5: 흡수해도 배부름 그대로
      if (m === 'trait' || m === 'none') expect(p.ev).toEqual({});
      if (m === 'none') expect(p.riskTo).toBeLessThan(p.riskFrom);
      else expect(p.riskTo).toBeGreaterThan(p.riskFrom);
    });
  }
  it('한계를 넘는 갈래는 폭주(호로화) 경고 줄이 붙는다', () => {
    const exp = toAbsorb('shinigami', { risk: RX.limit - 0.5 });
    expect(previewAbsorb(exp, 'both').frenzy).toBe(true);
    expect(previewAbsorb(exp, 'none').frenzy).toBe(false);
    const lines = absorbDescLines(S, exp, 'both');
    expect(lines.find((l) => l.kind === 'warn')?.text).toBe(`한계(${RX.limit})에 닿아 호로화 상태가 된다.`);
    expect(absorbDescLines(S, exp, 'none').some((l) => l.kind === 'warn')).toBe(false);
  });
  it('첫 흡수 연습: 어느 갈래든 모든 능력치 +n, 리스크 게이지 그대로 (엔진 tutorialAbsorb 그대로)', () => {
    const exp = toAbsorb('hollow', { tutorial: true });
    for (const m of ABSORB_MODES) {
      const p = previewAbsorb(exp, m);
      expect(p.riskTo).toBe(p.riskFrom);
      expect(Object.keys(p.ev)).toHaveLength(STAT_IDS.length);
      expect(absorbDescLines(H, exp, m).find((l) => l.kind === 'stat')?.text).toBe(`능력치: 모두 +${BALANCE.provisional.tutorialRun.statEv}`);
    }
  });
});

describe('설명 칸 줄 (GDD 163장 2)', () => {
  it('정화 흡수: 뭔지 / 능력치 실제 값 / 호로화 +n (a → b) / 받는 것 타일 (배부름 없음 — 163장 5)', () => {
    const exp = toAbsorb('shinigami', { risk: 5 });
    const p = previewAbsorb(exp, 'both');
    const lines = absorbDescLines(S, exp, 'both');
    expect(lines.map((l) => l.kind)).toEqual(['what', 'stat', 'risk', 'gain']);
    expect(lines[0]!.text).toBe(absorbModeText(S).both.sub);
    expect(lines[2]!.text).toBe(`호로화: +${Math.round(p.riskTo) - 5} (5 → ${Math.round(p.riskTo)})`);
    expect(lines[3]!.text).toBe('받는 것: 타일 +1');
    for (const s of Object.keys(p.ev)) expect(lines[1]!.text).toContain(`+${p.ev[s as keyof typeof p.ev]}`);
  });
  it('놓아주기: 호로화 −n, 영압 안정도 오름, 타일 없음', () => {
    const exp = toAbsorb('shinigami', { risk: 5 });
    const lines = absorbDescLines(S, exp, 'none');
    expect(lines.find((l) => l.kind === 'risk')!.text).toBe(`호로화: −${RX.releaseRelief} (5 → ${5 - RX.releaseRelief})`);
    const gain = lines.find((l) => l.kind === 'gain')!.text;
    expect(gain).toContain('영압 안정도 +');
    expect(gain).not.toContain('타일');
    expect(lines.some((l) => l.kind === 'stat')).toBe(false);
  });
  it('호로판도 종족 이름(리스크 게이지·배부름)을 json 에서', () => {
    const exp = toAbsorb('hollow', { risk: 5 });
    const lines = absorbDescLines(H, exp, 'stat');
    expect(lines.find((l) => l.kind === 'risk')!.text.startsWith(`${H.riskGaugeName}: +`)).toBe(true);
    expect(lines[0]!.text).toBe(absorbModeText(H).stat.sub);
  });
  it('gaugeDelta: 그대로 / 빼기 기호', () => {
    expect(gaugeDelta(5, 5.2)).toBe('그대로 (5)');
    expect(gaugeDelta(5, 4)).toBe('−1 (5 → 4)');
  });
});

describe('흡수 배부름 효과 삭제 (GDD 163장 5)', () => {
  it('밸런스에 허기 리셋 값이 없고, 흡수해도 배부름(허기)이 그대로', () => {
    expect('hungerAfterAbsorb' in AX).toBe(false);
    const exp = toAbsorb('shinigami');
    exp.hunger = 70;
    expect(chooseAbsorb(exp, null, undefined, 'both').ok).toBe(true);
    expect(exp.hunger).toBe(70);
  });
});

describe('화면 (GDD 163장 1·3·4)', () => {
  const a = read('src/ui/absorbView.ts');
  it('버튼 = 갈래 이름만(리스크 게이지 작은 글씨 없음), 버튼 위 배부름 줄 삭제', () => {
    expect(a).not.toContain('const sub = (b: HTMLButtonElement'); // 버튼 아래 작은 글씨 헬퍼 삭제
    expect(a).not.toMatch(/button\(\{ label: names\[m\]\.label[^)]*\}\)[^;]*riskGaugeName/);
    expect(a).not.toContain('가득 · 타일 +1.');
  });
  it('첫 누름 = 고르기, 같은 버튼 다시 = 실행, 기기 ▲▼ 하이라이트 = 고르기, 첫 갈래가 골라진 채 시작', () => {
    expect(a).toContain("b.addEventListener('bha-select', () => {");
    // 손가락: 기기가 pointerdown 에서 하이라이트(=고르기)를 먼저 옮기므로, 누르기 시작할 때 이미 골라져 있던 갈래만 실행
    expect(a).toContain("b.addEventListener('pointerdown', () => { armed = sel === m && fresh !== m ? m : null; });");
    expect(a).toContain('const again = e.detail > 0 ? armed === m : sel === m;');
    expect(a).toContain('let sel: AbsorbChoice = ABSORB_MODES[0];');
    expect(a).toContain('first = picker.first;');
  });
  it('첫 흡수 연습도 같은 갈래 버튼·설명 칸, 안내 2장은 갈래 줄을 가리킨다', () => {
    expect(read('src/ui/guideView.ts')).toContain('absorbModePicker(faction, exp');
    const g = JSON.parse(read('src/data/help/guides.json')).guides['first-absorb'][1];
    expect(g.targets).toEqual(['@.bha-absorb__pick']);
  });
});
