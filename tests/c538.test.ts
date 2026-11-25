/** C.538 튜토리얼 '다음 할 일' 카드에서 수련 해금 문장 삭제 (GDD 13절 v6.202,
 *  사용자 2026-11-24 "튜토리얼에 본능수련은 바스트로데가 되면 열린다. 이거 필요 없잖아")
 *  카드는 자동(first-run-room)·도움말 [안내 다시 보기] 모두 GUIDES['first-run-room'] 한 곳을 쓴다. 수련장 안 자물쇠 알림(trainingLockedText)은 그대로. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GUIDES, guideVars, helpVars, renderHelpText } from '../src/data/help';
import { FACTIONS } from '../src/data/factions';
import { trainingLockedText } from '../src/ui/trainingView';
import { PATCH_LABEL } from '../src/version';

describe('C.538 다음 할 일 카드', () => {
  it.each(FACTIONS.map((f) => [f.id, f] as const))('%s: 카드 본문에 \'되면 열린다\' 없음 · 첫 문장 그대로', (_id, f) => {
    const cards = GUIDES['first-run-room'];
    expect(cards).toHaveLength(1);
    const body = renderHelpText(cards[0]!.body, { ...helpVars(f), ...guideVars(f) });
    expect(body).not.toContain('{');
    expect(body).not.toContain('되면 열린다');
    expect(body).not.toContain(f.training.title);
    expect(body).toMatch(/^.+ 챙기고 .+의 훈련 인형으로 손을 풀며 다시 모험을 떠나자\.$/);
    expect(body).not.toContain('\n');
  });
  it('도움말 다시 보기도 같은 카드(first-run-room) · 수련장 자물쇠 알림은 그대로', () => {
    expect(readFileSync('src/ui/app.ts', 'utf8')).toContain("chain(['first-run', 'first-absorb', 'first-run-room'])");
    for (const f of FACTIONS) expect(trainingLockedText(f)).toContain('되면');
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(538);
  });
});
