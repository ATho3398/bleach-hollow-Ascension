// C.474: 큰 피해 숫자 + 기술 이름 안 겹침(한 사건 = 한 묶음, 이름 → 숫자 위아래) · 장면 가운데 큰 기술 이름 아래로 · 진화 결과 그림이 판 위로 잘리지 않음
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { afxNameBottomPct, isFloatLabel, stackFloatGroup } from '../src/ui/bha/battle';

const read = (p: string) => readFileSync(p, 'utf8');

/** offset 크기만 가진 가짜 글자 요소 (vitest 는 DOM 없음) */
function fake(w: number, h: number) {
  const cls = new Set<string>();
  return {
    offsetWidth: w,
    offsetHeight: h,
    style: { marginTop: '' },
    classList: { toggle: (c: string, on: boolean) => (on ? cls.add(c) : cls.delete(c)), has: (c: string) => cls.has(c) },
  };
}
type Fake = ReturnType<typeof fake>;
const asEl = (f: Fake) => f as unknown as HTMLElement;
const POP = 0.075;
const TILT = Math.sin((6 * Math.PI) / 180) / 2;
/** 화면에서 차지하는 위·아래 (자리 윗변 = 0): 나타날 때 1.15배로 번지는 몫, 숫자는 기울기 몫까지 */
const span = (f: Fake, tilt: boolean) => {
  const top = parseFloat(f.style.marginTop || '0');
  const grow = f.offsetHeight * POP + (tilt ? f.offsetWidth * TILT : 0);
  return { top: top - grow, bottom: top + f.offsetHeight + f.offsetHeight * POP };
};

describe('피해 숫자 + 기술 이름 묶음 (C.474)', () => {
  it('이름 글자 종류 = 체인·기술 이름·상성 문구, 숫자·받은 피해는 아님', () => {
    expect(['chain', 'strong', 'dull'].every((k) => isFloatLabel(k as never))).toBe(true);
    expect(['attack', 'hurt', 'guard', 'heal', 'void'].some((k) => isFloatLabel(k as never))).toBe(false);
  });

  it('최후의 월아천충(이름 20px + 큰 숫자 100×46): 이름이 위, 숫자가 아래 — 번지고 기울어도 안 겹침, 윗변 = 받은 자리', () => {
    const name = fake(132, 20);
    const num = fake(100, 46);
    stackFloatGroup(asEl(num), [asEl(name)]);
    expect(name.style.marginTop).toBe('0px'); // 위로 올리지 않는다 (필드 윗변·위 칩에 닿지 않게)
    const a = span(name, false);
    const b = span(num, true);
    expect(b.top).toBeGreaterThanOrEqual(a.bottom);
  });

  it('치명 숫자(139×78) + 이름 둘(기술 이름 + 상성 문구): 차례로 쌓여 서로 안 겹침', () => {
    const n1 = fake(62, 16);
    const n2 = fake(110, 18);
    const num = fake(139, 78);
    stackFloatGroup(asEl(num), [asEl(n1), asEl(n2)]);
    const boxes = [span(n1, false), span(n2, false), span(num, true)];
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.top).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom);
  });

  it('숫자만·이름만이면 자리 그대로(올림 없음)', () => {
    const num = fake(100, 46);
    stackFloatGroup(asEl(num), []);
    expect(num.style.marginTop).toBe('0px');
    const name = fake(80, 20);
    stackFloatGroup(null, [asEl(name)]);
    expect(name.style.marginTop).toBe('0px');
  });

  it('장면 가운데 큰 기술 이름 아래 묶음(below): 윗변에도 번지는 틈 + 제자리 애니메이션(.is-under-name)', () => {
    const num = fake(87, 49);
    stackFloatGroup(asEl(num), [], true);
    expect(span(num, true).top).toBeGreaterThanOrEqual(0);
    expect(num.classList.has('is-under-name')).toBe(true);
    stackFloatGroup(asEl(num), [], false);
    expect(num.classList.has('is-under-name')).toBe(false); // 재사용 때 풀린다
    const css = read('src/ui/bha/components/components.css');
    expect(css).toMatch(/\.bha-float\.is-under-name \{ animation-name: bha-float-stay; \}/);
    expect(css).toMatch(/@keyframes bha-float-stay \{[^}]*\}[^@]*/);
    expect(css.match(/@keyframes bha-float-stay[^\n]*/)![0]).not.toContain('translate'); // 떠오르지 않는다
    expect(css).toContain('.bha-float, .bha-float.is-under-name { animation: none; opacity: 1; }'); // 모션 줄이기
  });

  it('afxNameBottomPct: 이름(가운데 기준) 아래 끝을 글자 상자 높이 % 로', () => {
    const rect = (top: number, height: number) => ({ getBoundingClientRect: () => ({ top, height }) });
    const n = { offsetTop: 90, offsetHeight: 44 }; // 변형 전 상자: 가운데 90 → 아래 112
    const layer = { ...rect(35, 196), querySelectorAll: () => [n] } as unknown as HTMLElement;
    const host = rect(35, 196) as unknown as HTMLElement;
    expect(afxNameBottomPct(layer, host)).toBeCloseTo((112 / 196) * 100, 5);
    const empty = { ...rect(35, 196), querySelectorAll: () => [] } as unknown as HTMLElement;
    expect(afxNameBottomPct(empty, host)).toBeNull();
  });

  it('전투 화면: 같은 틱의 숫자·이름은 한 묶음, 기술 이름이 떠 있으면 그 아래로', () => {
    const src = read('src/ui/battleView.ts');
    expect(src).toContain('floatGroup.tick !== s.tick');
    expect(src).toContain('afxNameBottomPct(fxLayer, floats)');
    expect(src).toContain('stackFloatGroup(floatGroup.number, floatGroup.labels, floatGroup.below)');
  });
});

describe('진화 결과 그림 (C.474)', () => {
  it('왼쪽 판은 safe center — 내용이 길어도 위(그림 머리)가 판 밖으로 밀려 잘리지 않는다. 그림 칸·배율은 그대로', () => {
    const css = read('src/ui/bha/absorb-status.css');
    expect(css).toMatch(/\.bha-evolve__resmain \{[^}]*justify-content: safe center;[^}]*overflow-y: auto;/);
    expect(css).toContain('.bha-evolve__fig--result { flex: none; height: 96px; }');
  });

  it('실측(docs/captures/c474/proof.json): 길리안·아쥬커스 모델 7종·4단계 — 칠해진 그림 = 그림 칸 안, 그림 칸 = 판 안 (PC·폰)', () => {
    const pf = 'docs/captures/c474/proof.json';
    expect(existsSync(pf)).toBe(true);
    const facts = JSON.parse(read(pf)).facts as Record<string, { key: string; drawnInFig: boolean; figInPanel: boolean; scrollTop: number }[]>;
    const pc = facts['evolve-pc']!;
    expect(pc.map((m) => m.key)).toEqual(['t2-gillian', 't3-carapace', 't3-stag', 't3-rhino', 't3-wyrm', 't3-panther', 't3-scorpion', 't3-wraith', 't4-fire']);
    for (const m of [...pc, ...facts['evolve-phone']!]) {
      expect(m.drawnInFig, m.key).toBe(true);
      expect(m.figInPanel, m.key).toBe(true);
      expect(m.scrollTop).toBe(0);
    }
  });
});
