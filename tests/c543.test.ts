/** C.543 도움말 '콤보 블록' 방향 문구 (GDD 7절 v6.209, 마스터AT — [블록 생성 위치 반전](C.541)과 상관없이 맞는 말)
 *  "블록 바 맨 왼쪽에" → "블록 바에서 새 블록이 들어오는 쪽 끝에". 엔진·표시 동작은 그대로. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLOSSARY, helpVars, renderHelpText } from '../src/data/help';
import { FACTIONS } from '../src/data/factions';
import { PATCH_LABEL } from '../src/version';

describe('C.543 콤보 블록 도움말 문구', () => {
  it.each(FACTIONS.map((f) => [f.id, f] as const))('%s: 방향(맨 왼쪽·맨 오른쪽) 없이 새 블록이 들어오는 쪽 끝', (_id, f) => {
    const term = GLOSSARY.find((t) => t.id === 'combo');
    expect(term).toBeDefined();
    const body = renderHelpText(term!.body, helpVars(f));
    expect(body).not.toContain('{');
    expect(body).not.toMatch(/맨 왼쪽|맨 오른쪽/);
    expect(body).toContain('블록 바에서 새 블록이 들어오는 쪽 끝에 큰 피해를 주는 콤보 블록이 생긴다.');
  });
  it('도움말·튜토리얼 데이터에 블록 바 방향을 못 박은 말이 없다 · 기획서 7절 콤보 줄도 같이', () => {
    for (const file of ['glossary.json', 'guides.json', 'screens.json', 'tutorial.json']) {
      const text = readFileSync(`src/data/help/${file}`, 'utf8');
      expect(text, file).not.toMatch(/블록 바 맨 (왼|오른)쪽/);
    }
    const comboLine = readFileSync('docs/GDD.md', 'utf8').split('\n').find((l) => l.startsWith('- 콤보 블록(임시·provisional)'));
    expect(comboLine).toContain('바 끝(새 블록이 들어오는 쪽 끝)에 콤보 블록이 생긴다');
    expect(comboLine).not.toContain('화면 맨 왼쪽');
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(543);
  });
});
