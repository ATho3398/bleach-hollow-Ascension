// C.169 (사용자 "1번으로 가고, 블록 무조건 정사각형으로 맞춰"): 영력 해방 → 범례 줄 오른쪽 알약 버튼, 블록 칸은 언제나 정사각형
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/ui/bha/v2/bha.css', 'utf8');
const sec = css; // C.285 (GDD 183장 화면 C): 한 벌로 다시 씀
const parts = readFileSync('src/ui/bha/v2/battle.ts', 'utf8');

describe('C.169 해방 버튼 자리 · 블록 정사각형', () => {
  it('블록 칸은 정사각형 (C.285: 한 변 = --bha-block-h 52, 디자인 v2)', () => {
    expect(sec).toMatch(/\.bha-root \.bha-v2cell\{[^}]*width:var\(--bha-block-h\);height:var\(--bha-block-h\)/);
    expect(sec).toContain('grid-template-columns:repeat(var(--cap,8),var(--bha-block-h));grid-auto-rows:var(--bha-block-h)');
    // 칸 폭을 인라인 1fr 로 박지 않는다 (루트 폭이 늘면 블록이 가로로 늘어나 각인 컷이 찌그러졌다)
    expect(parts).not.toContain('minmax(0, 1fr)');
    expect(parts).toContain("setProperty('--cap'");
  });
  it('블록 줄엔 블록만: 스킬창 = 범례 16 → 버튼 줄 36 → 블록 바(가운데) (C.285, PROMPT 6절 S09). 해방 카드 없음(캐릭터 누르기)', () => {
    expect(sec).toMatch(/\.bha-root \.bha-blockbar\.bha-v2tray\{position:relative;flex:none;align-self:center;/);
    expect(sec).toMatch(/\.bha-root \.bha-v2legendrow\{flex:none;height:16px;/);
    expect(sec).toMatch(/\.bha-root \.bha-v2roles\{flex:none;height:var\(--bha-btn-h-sm\)/);
    expect(sec).not.toContain('.bha-v2rel');
  });
  it('계열 모양은 블록 칸 안 가운데(절대 위치) — 옛 CSS(flex:1)에 늘어나지 않는다', () => {
    expect(sec).toMatch(/\.bha-root \.bha-block__icon\{position:absolute;inset:6px;/);
  });
});
