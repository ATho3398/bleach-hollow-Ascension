import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('C.316 처음 화면 아래 안내 줄이 폰 판 안에 든다 (GDD 195장 아래)', () => {
  const view = read('src/ui/startView.ts');
  const css = read('src/ui/bha/screens-lcd.css');

  it('자동 다시 시작 안내 = 버전 줄 안(같은 줄)에 붙는다 — 아래 새 줄 금지', () => {
    expect(view).toContain("ver.append(el('span', 'bha-start__update', '새 버전으로 다시 시작한다…'))");
    expect(view).not.toContain('ver.after(');
    expect(css).toMatch(/\.bha-start--title \.bha-start__ver \{[^}]*white-space: nowrap;/);
    expect(css).toContain(".bha-start__update::before { content: '·';");
  });

  it('경고 줄(note)이 있으면 메뉴를 한 줄로 (열 수 없는 세이브 알림과 같은 모양)', () => {
    expect(view).toContain("note ? ' bha-start--note' : ''");
    expect(css).toContain('.bha-start--note .bha-start__menu { flex-direction: row;');
    expect(css).not.toMatch(/\.bha-start--note[^{]*\{[^}]*#[0-9a-fA-F]{3,6}/);
  });

  it('점검용 안내 띄우기는 다시 시작하지 않는다', () => {
    const pwa = read('src/pwa.ts');
    const body = pwa.slice(pwa.indexOf('export const showAutoRestartNoticeForTest'));
    expect(body.slice(0, body.indexOf('};'))).not.toContain('restartToLatest');
  });
});
