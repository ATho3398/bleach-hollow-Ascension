// C.287 (GDD 183장 화면 D, 리디자인 v2): 흡수 S11 · 결과 S13 · 진화 연출 — 모양만 v2 틀로, 기능·흐름·문구 뜻 그대로. 실제 자리·넘침은 docs/captures/c287/proof.json (Playwright)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const a = read('src/ui/absorbView.ts');
const r = read('src/ui/resultView.ts');
const e = read('src/ui/evolutionPanel.ts');
const css = read('src/ui/bha/absorb-status.css');
const v2css = css.slice(css.indexOf('흡수 화면 리디자인 v2'));

describe('흡수 S11', () => {
  it('화면 루트 bha-v2 + 머리·왼쪽 판·오른쪽·아래 줄, 단계 1 갈래 · 2 특성', () => {
    expect(a).toContain("mountApp(root, { cls: `bha-v2 bha-absorbv2 bha-absorbv2--${step}` }, head, left, right, dock)");
    expect(a).toContain("const STEP_LABELS = ['갈래', '블록'] as const;"); // 3 교체는 C.312(193장 13)에 2단계 한 화면으로
    expect(a).toContain("el('header', 'bha-head bha-absorb__head')");
    expect(a).not.toContain("'bha-row'"); // .bha-row 는 v2 루트 안에서 목록 줄 — 슬롯 머리는 제 이름
  });
  it('갈래 버튼 아래 리스크 변화 한 줄(종족 이름), 놓아주기 = 늘 −n', () => {
    expect(a).toContain('b.append(modeRiskLine(faction, exp, m));');
    expect(a).toContain("if (m === 'none') return `${faction.riskGaugeName} ${MINUS}${RX.releaseRelief}`;");
  });
  it('[○○하기] = 아래 줄 오른쪽 44×200 (너무 크지 않게), 아래 줄 왼쪽 = 고른 갈래', () => {
    expect(v2css).toMatch(/\.bha-absorbv2 \.bha-absorb__go, \.bha-absorbv2 \.bha-absorb__run \{ width: var\(--bha-dock-btn-w\); height: var\(--bha-btn-h\);/); // 200 = 공용 토큰 (C.296)
    expect(a).toContain("selLine.append('고른 갈래: ', picked_);");
    expect(a).toContain('dock: [selLine, go]');
  });
  it('설명 칸 = 고정 높이, 안에서 스크롤 + 바닥 더 있음 (문구는 그대로, 첫 ": " 에서 두 열로 나눠 보이기만)', () => {
    expect(v2css).toContain('.bha-absorbv2 .bha-absorb__desc { position: relative; flex: 1 1 0; min-height: 0; overflow-y: auto;');
    expect(a).toContain("'bha-more bha-more--sticky bha-absorb__more'"); // 공용 '더 있음' 띠 (C.296)
    expect(read('src/ui/bha/components/v2-shared.css')).toMatch(/\.bha-more--sticky:where\(:not\(\.bha-root \*\)\) \{ position: sticky; [^}]*bottom: 0;/);
    expect(a).toContain("l.text.slice(0, at)), el('b', 'bha-absorb__v', l.text.slice(at + 2))");
  });
});

describe('결과 S13 · 진화 연출', () => {
  it('승리/패배 톤 = 맨 위 4px 띠 + 제목 색만, [둥지로] 아래 줄 오른쪽 200', () => {
    expect(r).toContain("mountApp(root, { cls: `bha-v2 bha-resultv2 bha-resultv2--${win ? 'win' : 'lose'}` }, band, head, left, right, dock)");
    expect(v2css).toContain('.bha-result__band { position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--bha-sp); }');
    expect(v2css).toContain('.bha-resultv2 .bha-result__home { width: var(--bha-dock-btn-w);');
    expect(read('src/ui/bha/design-system/tokens.css')).toContain('--bha-dock-btn-w: 200px;');
    expect(r).toContain("info.className = 'bha-result__info';"); // v2 루트 안 .bha-info = ⓘ 버튼이라 이름을 바꿈
  });
  it('진화: [건너뛰기]·[둥지로] 같은 자리, 흐린 빛(burst) 끔, blur 없는 등장', () => {
    expect(e).toContain("skip.classList.add('bha-evolve__go');");
    expect(e).toContain("home.classList.add('bha-evolve__go');");
    expect(v2css).toContain('.bha-evolvev2 .bha-evolve__burst { display: none; }');
    expect(v2css).toMatch(/@keyframes bha-evo2-line \{ from \{ opacity: 0; transform: translateY\(8px\); \}/);
  });
  it('화면 CSS = 토큰만 (hex·그라데이션·흐린 빛 없음)', () => {
    const rules = v2css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rules).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(rules).not.toMatch(/gradient|blur\(/);
  });
});
