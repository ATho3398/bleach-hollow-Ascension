// C.282 (GDD 183장 1 ①): UI 리디자인 v2 공용 부품 — 토큰 값·새 토큰·Silkscreen·아이콘 매핑·속성 색
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { V2_ICON, V2_ICON_NAMES, V2_ICON_PROVISIONAL, spriteSymbol } from '../src/ui/bha/iconMap';

const read = (p: string) => readFileSync(p, 'utf8');
const tokens = read('src/ui/bha/design-system/tokens.css');
const hollow = read('src/ui/bha/design-system/theme-hollow.css');
const soul = read('src/ui/bha/design-system/theme-shinigami.css');
const design = read('docs/design/redesign-v2/bha.css');

describe('토큰 (PROMPT v2 3절)', () => {
  it('새 공통 토큰이 있고 값은 디자인 v2 그대로, --bha-app-w 480 · 공허 속성 토큰 없음', () => {
    for (const t of ['--bha-el-normal: #8c8478', '--bha-el-fire: #c0643a', '--bha-el-blood: #84343a', '--bha-el-kyo: #7a6496', '--bha-tint-sage: #7f9c7a',
      '--bha-btn-h: 44px', '--bha-btn-h-sm: 36px', '--bha-btn-h-lg: 48px', '--bha-head-h: 44px', '--bha-dock-h: 56px', '--bha-skill-h: 130px',
      '--bha-toast-bg: #2e2717', '--bha-caret: 10px', '--bha-app-w: 480px', '--bha-gutter: 10px', '--bha-block-h: 52px', '--bha-shell-lcd: transparent']) expect(tokens).toContain(t);
    expect(tokens).not.toContain('--bha-el-void');
    expect(tokens).toContain('--bha-font-num: "Silkscreen"');
    expect(tokens).toContain('--bha-art-outline'); // 프로젝트 토큰(그림 윤곽, 182장 4)은 남긴다
  });
  it('테마 = 루트 클래스·data 속성 둘 다, 기기 껍데기 기본값 포함', () => {
    expect(hollow).toMatch(/\.bha-theme-hollow,\s*\[data-bha-theme="hollow"\]/);
    expect(soul).toMatch(/\.bha-theme-shinigami,\s*\[data-bha-theme="shinigami"\]/);
    for (const [css, v] of [[hollow, '--bha-shell-body: #2a211e'], [hollow, '--bha-primary-lo: #9d8b70'], [soul, '--bha-shell-body: #1c222b'], [soul, '--bha-lcd-bezel: #090c10']] as const) expect(css).toContain(v);
  });
  it('토큰 값은 디자인 원본과 같다 (원본에 있는 이름 전부)', () => {
    const vals = (t: string) => new Map([...t.matchAll(/^\s*(--bha-[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1]!, m[2]!.trim()]));
    const root = design.slice(design.indexOf(':root {'), design.indexOf('/* ============================== 테마: 호로'));
    const mine = vals(tokens);
    const diff = [...vals(root)].filter(([k, v]) => mine.get(k) !== v && k !== '--bha-font-body').map(([k]) => k);
    expect(diff).toEqual([]);
  });
});

describe('Silkscreen 숫자 글꼴', () => {
  it('woff2·라이선스 파일이 있고 @font-face 로 싣는다', () => {
    expect(existsSync('src/ui/bha/fonts/silkscreen-latin-400-normal.woff2')).toBe(true);
    expect(existsSync('src/ui/bha/fonts/Silkscreen-OFL.txt')).toBe(true);
    expect(tokens).toMatch(/@font-face \{ font-family: "Silkscreen"; src: url\("\.\.\/fonts\/silkscreen-latin-400-normal\.woff2"\)/);
  });
  it('고정 폭 숫자 칸 .bha-num--w2~w6', () => {
    const css = read('src/ui/bha/components/bha-v2.css');
    for (const n of [2, 3, 4, 5, 6]) expect(css).toContain(`.bha-num--w${n} { width: ${n}ch; }`);
  });
});

describe('아이콘 매핑 (GDD 183장 3)', () => {
  const sprite = read('src/ui/bha/sprite.svg');
  const ids = [...new Set([...sprite.matchAll(/<symbol id="(i-[a-z0-9-]+)"/g)].map((m) => m[1]!))];
  it('게임 i-* 아이콘 전부(fx-* 제외)에 v2 짝이 있고, 짝 이름은 v2 150개 안에 있다', () => {
    const want = ids.filter((id) => !id.startsWith('i-fx-'));
    expect(want.filter((id) => !V2_ICON[id])).toEqual([]);
    expect(Object.values(V2_ICON).filter((n) => !V2_ICON_NAMES.includes(n))).toEqual([]);
    expect(V2_ICON_NAMES.length).toBe(150);
  });
  it('fx-*·적 실루엣은 옛 그림 그대로, 나머지는 v2 심볼', () => {
    expect(spriteSymbol('i-fx-claw')).toBe('i-fx-claw');
    expect(spriteSymbol('foe-a')).toBe('foe-a');
    expect(spriteSymbol('i-guard')).toBe('v2-shield');
    const sym = read('src/ui/bha/icons/icons-v2.svg');
    for (const n of V2_ICON_NAMES) expect(sym).toContain(`<symbol id="v2-${n}"`);
  });
  it('임시 매핑 목록은 매핑표 안의 이름만', () => {
    expect(V2_ICON_PROVISIONAL.filter((id) => !V2_ICON[id])).toEqual([]);
  });
});

describe('속성 색 (GDD 183장 2 데이터 예외)', () => {
  it('elements.json 의 color = --bha-el-<id> 8개', () => {
    const els = JSON.parse(read('src/data/elements/elements.json')) as { id: string; color: string }[];
    expect(els.map((e) => e.color)).toEqual(els.map((e) => `--bha-el-${e.id}`));
    expect(els).toHaveLength(8);
  });
});
