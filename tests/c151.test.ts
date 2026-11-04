// C.151 (사용자 "bha.css를 프로젝트에 들여오고 공통 컴포넌트를 만든다"): 핸드오프 CSS 를 .bha-root 한정으로 들이고 공통 컴포넌트 DOM 을 만든다
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { v2RootClass, v2Scale, V2_H, V2_W } from '../src/ui/bha/v2/root';
import { clampPct, v2ButtonClass } from '../src/ui/bha/v2/components';

const read = (p: string) => readFileSync(p, 'utf8');
const cssAll = read('src/ui/bha/v2/bha.css');
/** 핸드오프에서 옮긴 부분 / 우리 쪽 어댑터 (마지막 "프로젝트 어댑터" 구역) */
const ADAPTER_AT = cssAll.indexOf('/* ───────── 프로젝트 어댑터');
const css = cssAll.slice(0, ADAPTER_AT);
const adapter = cssAll.slice(ADAPTER_AT);
const orig = read('docs/bha-ui-handoff/design/bha.css');
const SHEET_ONLY = new Set(['bha-sheet', 'bha-table', 'bha-sw', 'bha-cap', 'bha-code']);
const classesOf = (t: string): Set<string> => new Set([...t.matchAll(/\.(bha-[a-z0-9_-]+)/g)].map((m) => m[1]!));
/** 최상위 규칙의 선택자 목록 (주석 제외, 중첩 없음) */
function selectors(t: string): string[] {
  const body = t.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...body.matchAll(/(^|\})\s*([^{}]+)\{/g)].flatMap((m) => m[2]!.split(',').map((s) => s.trim()));
}

describe('C.151 핸드오프 CSS (src/ui/bha/v2/bha.css)', () => {
  it('모든 선택자가 .bha-root 로 시작한다 — 옛 화면의 같은 이름 클래스와 섞이지 않는다', () => {
    expect(selectors(css).filter((s) => !s.startsWith('.bha-root'))).toEqual([]);
    // 어댑터는 .bha-v2host(우리 틀)와 그 안 .bha-root 만 건드린다
    expect(selectors(adapter).filter((s) => !s.startsWith('.bha-v2host') && !s.startsWith('.bha-root'))).toEqual([]);
  });
  it('핸드오프의 클래스 이름이 그대로 들어 있다 (시트용 5개 + 블록 안 체인 원(GDD 137장 4, C.215)만 뺌)', () => {
    const want = [...classesOf(orig)].filter((c) => !SHEET_ONLY.has(c) && c !== 'bha-block__pips');
    const have = classesOf(css);
    expect(want.filter((c) => !have.has(c))).toEqual([]);
  });
  it('C.282 (GDD 183장 1 ①): 토큰은 전역 한 벌 — .bha-root 는 옛 이름 별칭만, 테마 블록·색 값 없음', () => {
    expect(css).not.toMatch(/\.bha-root\.bha-(hollow|soul|shinigami)\s*\{/);
    expect(cssAll).not.toMatch(/data-faction|\[data-bha-theme/);
    expect(v2RootClass({ theme: 'hollow' })).toBe('bha-root bha-hollow');
    expect(v2RootClass({ theme: 'shinigami' })).toBe('bha-root bha-shinigami');
    for (const v of ['--bha-atk:var(--bha-attack)', '--bha-attr-fire:var(--bha-el-fire)', '--bha-attr-blood:var(--bha-el-blood)', '--bha-edge:var(--bha-hi)']) expect(css).toContain(v);
    const tokBlock = css.slice(css.indexOf('.bha-root{'), css.indexOf('}', css.indexOf('.bha-root{')));
    expect(tokBlock).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
  it('main.ts 가 v2 CSS 를 싣고, 갤러리는 개발 전용 분기 안에서만 불린다', () => {
    const main = read('src/main.ts');
    expect(main).toContain("import './ui/bha/v2/bha.css'");
    expect(main).toMatch(/import\.meta\.env\.DEV[\s\S]*v2gallery/);
  });
});

describe('C.151 루트·공통 컴포넌트', () => {
  it('LCD 640×330 좌표계를 창 크기에 맞춘다 (1을 넘기지 않고, 가로·세로 중 빡빡한 쪽에 맞춤)', () => {
    expect([V2_W, V2_H]).toEqual([640, 330]);
    expect(v2Scale(646, 360)).toBe(1);
    expect(v2Scale(480, 360)).toBeCloseTo(0.75);
    expect(v2Scale(646, 165)).toBeCloseTo(0.5);
    expect(v2Scale(0, 100)).toBe(1);
  });
  it('버튼 클래스: 4종(+강조·밝은) · 작은 · 비활성 · 포커스', () => {
    expect(v2ButtonClass({})).toBe('bha-btn');
    expect(v2ButtonClass({ kind: 'accent', small: true })).toBe('bha-btn bha-btn--accent bha-btn--sm');
    expect(v2ButtonClass({ kind: 'danger', disabled: true, focus: true })).toBe('bha-btn bha-btn--danger is-disabled is-focus');
    expect(v2ButtonClass({ kind: 'ghost' }, 'bha-iconbtn')).toBe('bha-btn bha-btn--ghost bha-iconbtn');
  });
  it('게이지 값은 0~100 으로 자른다', () => {
    expect([clampPct(-5), clampPct(42), clampPct(250), clampPct(NaN)]).toEqual([0, 42, 100, 0]);
  });
  it('컴포넌트 7종이 핸드오프 클래스 이름으로 DOM 을 만든다', () => {
    const src = read('src/ui/bha/v2/components.ts');
    for (const k of ['bha-btn', 'bha-iconbtn', 'bha-chip', 'bha-tabs', 'bha-tab', 'bha-gauge', 'bha-panel', 'bha-modal', 'bha-scrim', 'bha-toast', 'bha-notice', 'bha-titletoggle']) expect(src).toContain(k);
    // 모달은 공용 모달 초점 규칙(포커스 가두기·기기 선택 레이어)을 쓴다
    expect(src).toContain('trapModalFocus(layer)');
    expect(src).toContain('registerLayer(layer, close)');
  });
});
