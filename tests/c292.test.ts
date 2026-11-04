// C.292 (GDD 183장 화면 F 보충, 코딩204): 설정 흔들림 설명 · 음악 목록 한 판
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('C.292 설정 보충', () => {
  const s = read('src/ui/settingsView.ts');
  it('흔들림 설명 = 실제 조건, 옛말 저장 필살기 없음', () => {
    expect(s).toContain("hintLine('강공격에 맞을 때, 해방할 때, 체인 3 블록을 쓸 때만 짧게 흔들린다.')");
    expect(s).not.toContain('필살기');
  });
  it('음악 목록 = 한 판 (머리 하나 → 지금 곡·반복·다음 곡 줄 → 목록)', () => {
    expect(s).toContain("box.append(el('b', 'bha-setrow__label', '음악 목록'), bar, listBox, hint);");
    expect(s).not.toContain("panel('음악 목록'");
    expect(read('src/ui/bha/screens-lcd.css')).toContain('.bha-setrow--music { grid-column: 1 / -1;');
  });
});
