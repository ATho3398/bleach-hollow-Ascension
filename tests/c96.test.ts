// C.96 화면 손질 묶음 (GDD 43장): 알림 띠 CSS 규칙 · 결과 화면 무대 이름 · 더보기 아이콘
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { stageTitle } from '../src/ui/resultView';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const rule = (css: string, sel: string) => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)) + 1);

describe('결과 화면 무대 이름 (GDD 43장 3번)', () => {
  for (const fid of ['hollow', 'shinigami']) {
    const f = getFaction(fid);
    it(`${fid}: 자유 원정 = 사냥터 이름, 세계 이름 아님`, () => {
      const t = stageTitle({ story: null, factionId: fid, groundId: 'outskirts' }, f);
      expect(t).toBe(f.huntingGrounds?.outskirts?.name);
      expect(t).not.toBe(f.huntingGroundName);
    });
    it(`${fid}: 스토리 = n장 m화 · 화 이름`, () => {
      const t = stageTitle({ story: { chapterId: 'ch2', episodeId: 'ep3' } as never, factionId: fid, groundId: 'canyon' }, f);
      expect(t).toMatch(/^2장 3화 · .+/);
    });
  }
});

describe('알림 띠 (GDD 43장 1·2번)', () => {
  const css = read('src/ui/bha/components/components.css');
  const toast = rule(css, '.bha-toast');
  it('위 가장자리 한 줄 띠: 칸마다 쌓고, 글은 한 줄로 자르며, 누름을 막지 않는다', () => {
    expect(toast).toContain('top: calc(env(safe-area-inset-top, 0px)');
    expect(toast).toContain('--toast-i');
    expect(toast).toContain('pointer-events: none');
    expect(rule(css, '.bha-toast__text')).toContain('white-space: nowrap');
  });
  it('토스트는 최대 2개만 보이고 나머지는 대기열', () => {
    const ts = read('src/ui/bha/nest.ts');
    expect(ts).toContain('const TOAST_VISIBLE = 2;');
    expect(ts).toContain('st.queue.push(show)');
  });
  it('새 트랙 알림도 같은 showToast 를 쓴다', () => {
    expect(read('src/ui/app.ts')).toMatch(/eyebrow: '새 트랙'[\s\S]*showToast\(n, i/);
  });
});

describe('더보기 아이콘 (GDD 43장 4번)', () => {
  const room = read('src/ui/roomView.ts');
  it('사진·다마고치 모드는 이름 글자가 붙고 맞는 아이콘을 쓴다', () => {
    expect(room).toContain("{ label: '사진', icon: 'i-frame'");
    expect(room).toContain("{ label: '다마고치 모드', icon: 'i-nest'");
  });
  it('더보기 칸은 아이콘 아래 이름 글자(span) 형식', () => {
    expect(read('src/ui/bha/dock.ts')).toContain("b.append(icon(m.icon), el('span', '', m.label))");
  });
});
