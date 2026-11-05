// C.169 (사용자 "1번으로 가고, 블록 무조건 정사각형으로 맞춰"): 영력 해방 → 범례 줄 오른쪽 알약 버튼, 블록 칸은 언제나 정사각형
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/ui/bha/v2/bha.css', 'utf8');
const sec = css.slice(css.indexOf('(C.169'));
const parts = readFileSync('src/ui/bha/v2/battle.ts', 'utf8');

describe('C.169 해방 버튼 자리 · 블록 정사각형', () => {
  it('블록 칸은 정사각형이고 폭은 칸 수로 나눈 값과 66px 중 작은 값', () => {
    expect(sec).toContain('.bha-root .bha-v2cell{height:auto;aspect-ratio:1/1}');
    expect(sec).toMatch(/grid-template-columns:repeat\(var\(--cap,8\),min\(66px,/);
    // 칸 폭을 인라인 1fr 로 박지 않는다 (루트 폭이 늘면 블록이 가로로 늘어나 각인 컷이 찌그러졌다)
    expect(parts).not.toContain('minmax(0, 1fr)');
    expect(parts).toContain("setProperty('--cap'");
  });
  it('블록 줄엔 블록만: 바는 스킬창 좌우 끝까지, 해방은 범례 줄 높이 28 알약', () => {
    expect(sec).toContain('.bha-root .bha-blockbar.bha-v2tray{left:8px;right:8px;');
    expect(sec).toMatch(/\.bha-root \.bha-v2rel\{top:3px;bottom:auto;right:8px;width:184px;height:28px;/);
    expect(sec).toContain('.bha-root .bha-v2legendrow{right:200px}');
  });
  it('아이콘은 옛 CSS(flex:1)에 늘어나지 않는다', () => {
    expect(sec).toContain('.bha-block__icon{flex:none;height:30px;');
  });
});
