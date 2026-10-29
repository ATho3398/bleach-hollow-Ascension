// C.203 (GDD 129-1): 튜토리얼 흐름에서 저절로 뜨는 안내 카드 = 회색 덮개 없음(다시 보기만 덮개) · 공간 화면 '방으로 돌아가기' = 왼쪽 위 같은 자리
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const src = (p: string) => readFileSync(p, 'utf8');

describe('129-1 1 튜토리얼 안내 카드 회색 덮개 없음', () => {
  const ov = src('src/ui/tutorialOverlay.ts');
  const guide = src('src/ui/guideView.ts');
  const app = src('src/ui/app.ts');
  const battle = src('src/ui/battleView.ts');
  const css = src('src/ui/bha/screens-lcd.css');
  it('덮개는 도움말에서 직접 연 다시 보기(replay)일 때만 — 기본은 is-nodim', () => {
    expect(ov).toContain("if (opts.replay && !opts.script) layer.dataset.replay = '';");
    expect(ov).toContain("else layer.classList.add('is-nodim');");
    expect(css).toMatch(/\.bha-tut\.is-nodim \.bha-tut__hole \{ box-shadow: none; \}/);
    expect(css).toMatch(/\.bha-tut\.is-nodim \.bha-tut__hole\.is-none \{ display: none; \}/);
  });
  it('저절로 뜨는 안내(showGuide)는 replay 없이, 도움말 안내 다시 보기만 replay: true', () => {
    expect(guide).toContain('replay: o.replay,');
    const replays = app.match(/replay: true/g) ?? [];
    expect(replays.length).toBe(1);
    expect(app).toMatch(/showGuide\(faction, ids\[i\]!, \{ finishLabel: [^}]*replay: true/);
    expect(app).toContain("el('div', 'bha-tut is-script is-nodim')");
  });
  it('첫 전투 저절로 뜬 튜토리얼 = 덮개·멈춘 모습 없음, 도움말 다시 보기 = 덮개', () => {
    expect(battle).toContain('} else if (opts.tutorial) startTutorial(true);');
    expect(battle).toContain('startTutorial(false); } });');
    expect(battle).toContain('replay: !auto,');
    expect(battle).toContain('(tutorialOpen && !tutorialPractice && !tutorialAuto)');
  });
});

describe("129-1 2 공간 화면 '방으로 돌아가기' 자리", () => {
  const room = src('src/ui/bha/room.ts');
  const market = src('src/ui/marketView.ts');
  const spa = src('src/ui/spaView.ts');
  const mcss = src('src/ui/bha/market.css');
  it('장터·온천이 같은 버튼(spaceBackButton)을 쓴다', () => {
    expect(room).toContain("label = '방으로 돌아가기'): HTMLButtonElement"); // C.204: 이름은 바꿀 수 있고 기본은 그대로
    expect(room).toContain("button({ label, icon: 'i-return', size: 'small'");
    expect(room).toContain('b.dataset.spaceBack');
    expect(market).toContain('spaceBackButton(hd.onBack, hd.backLabel)');
    expect(spa).toContain('spaceBackButton(hd.onBack, hd.backLabel)');
    expect(market).not.toContain("label: '방으로',");
  });
  it('장터: 버튼이 위 줄 맨 왼쪽, 기기 ▲▼ 순서도 화면 위치 순서(버튼 먼저)', () => {
    expect(market).toContain('hud.append(backBtn, titles);');
    expect(market).toContain('const items: SelectItem[] = [{ el: backBtn }, ...btns.map((b) => ({ el: b }))];');
    expect(mcss).toContain('.bha-market__hud { justify-content: flex-start; align-items: flex-start;');
  });
  it('ui-audit 에 두 검사가 있다', () => {
    const a = src('scripts/ui-audit/audit.cjs');
    expect(a).toContain("kind: '튜토리얼 안내 회색 덮개'");
    expect(a).toContain("kind: '공간 화면 방으로 자리 다름'");
    expect(src('scripts/ui-audit/screens.cjs')).toContain("name: '튜토리얼 안내'");
  });
});
