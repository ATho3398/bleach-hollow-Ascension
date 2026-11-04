// C.286 (GDD 183장, 화면 G 코딩205): 리디자인 v2 — 처음 화면·슬롯·종족·확인/고르기 창·튜토리얼 카드·노란 알림·다마고치·경고·폭주·설치·탭 막힘 모양
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const lcd = read('src/ui/bha/screens-lcd.css');
const mine = ['tamago', 'warning', 'install', 'birth', 'guide'].map((n) => [n, read(`src/ui/bha/${n}.css`)] as const);

describe('화면 G 꾸밈 규칙 (PROMPT v2 2절·7절)', () => {
  it('화면 G CSS 에 번지는 빛(흐린 그림자·글자 빛)·색 그라데이션 없음 — 남는 것은 컷인 사선 띠(경고)와 점 무늬(스피커 구멍·줄)뿐', () => {
    for (const [n, css] of mine) {
      expect(css, n).not.toMatch(/(?<!repeating-)linear-gradient/);
      expect(css, n).not.toMatch(/box-shadow:[^;]*\b0 0 [1-9]\d*px [0-9]/); // 0 0 22px 6px 같은 번지는 빛
      expect(css, n).not.toMatch(/text-shadow: 0 0 [1-9]/);
      expect(css, n).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      for (const m of css.matchAll(/radial-gradient\(([^;]*)\)/g)) expect(m[1], n).toMatch(/transparent [0-9.]+px/); // 딱 끊기는 점 무늬만
    }
  });
  it('확인·고르기 창 = v2 창 (머리 48 · 왼쪽 제목 · 아래 버튼 줄 같은 폭), 걷기 가방 창은 그대로', () => {
    expect(lcd).toContain('.bha-lcd .bha-confirm:not(.bha-healbag) .bha-modal__title {');
    expect(lcd).toMatch(/\.bha-confirm:not\(\.bha-healbag\) \.bha-modal__title \{[^}]*min-height: 48px/);
    expect(lcd).toMatch(/\.bha-confirm:not\(\.bha-healbag\) \.bha-modal__actions > \.bha-btn \{ flex: 1 1 0/);
    expect(read('src/ui/pickDialog.ts')).not.toContain("variant: 'primary'"); // 고를 것은 같은 어두운 버튼, 고른 것은 초점 하나로
  });
  it('튜토리얼 카드 = 한 칸 밝은 면 + 2px 테두리, 단계 숫자 글꼴 · 노란 알림 = 글 길이만큼 30px 띠 · 누름 통과는 공용 규칙 그대로', () => {
    expect(lcd).toMatch(/\.bha-lcd \.bha-tut \.bha-tut__card \{[^}]*background: var\(--bha-bg-2\)[^}]*0 0 0 2px var\(--bha-text-2\)/);
    expect(lcd).toMatch(/\.bha-lcd \.bha-tut \.bha-tut__step \{[^}]*var\(--bha-font-num\)/);
    expect(lcd).toMatch(/\.bha-lcd \.bha-toast:where\(:not\(\.bha-v2 \*\)\) \{[^}]*width: max-content[^}]*height: 30px/);
    expect(lcd).not.toMatch(/\.bha-toast[^{]*\{[^}]*pointer-events: auto/);
  });
  it('폭주 화면 = 번지는 빛 없이, 탭 막힘 = 가운데 창', () => {
    expect(lcd).toMatch(/\.bha-break \.bha-break__cracks path \{ filter: none; \}/);
    expect(read('src/ui/tabBlockedView.ts')).toContain("cls: 'bha-tabblocked'");
  });
});
