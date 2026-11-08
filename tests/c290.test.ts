// C.290 (GDD 183장 화면 F, 코딩204): 상태·설정·스토리 v2 레이아웃
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('C.290 리디자인 v2 화면 F', () => {
  it('상태: 아래 고정 [진화체 도감][도움말][환생], 환생 못 하면 흐리게 자리 유지, 버전 문단 없음', () => {
    const s = read('src/ui/lcdScreens.ts');
    expect(s).toContain("variant: 'danger', disabled: !rebirthOk, onClick: hd.onRebirth");
    expect(s).toContain("const evoBtns = h('div', 'bha-care__actions');");
    expect(s).not.toContain('versionLabel()');
  });
  it('설정: 탭 = v2 .bha-tabs, 줄 = .bha-setrow 두 열', () => {
    const s = read('src/ui/settingsView.ts');
    expect(s).toContain("el('div', 'bha-tabs bha-settings__tabs')");
    expect(s).toContain("el('section', 'bha-setgroup')");
    expect(read('src/ui/bha/screens-lcd.css')).toContain('.bha-setgroup { display: contents; }');
  });
  it('스토리: 잠긴 장·화 = 그림 흐림 + 자물쇠 + 열리는 조건 + [도전] 흐리게 자리 유지', () => {
    const s = read('src/ui/storyView.ts');
    expect(s).toContain("`bha-art bha-art--frame bha-story-art${locked ? ' is-locked' : ''}`");
    expect(s).toContain("el('span', 'bha-lock')");
    expect(s).toContain('`열리는 조건: ${why}`');
    expect(s).toContain("b.setAttribute('aria-disabled', 'true');");
  });
  it('화면 F CSS 에 그라데이션·glow 없음', () => {
    expect(read('src/ui/bha/training.css')).not.toMatch(/gradient|glow|text-shadow/);
    const story = read('src/ui/bha/story.css');
    expect(story).not.toMatch(/\.bha-dialogue[^{]*\{[^}]*gradient/);
  });
});
