// C.511 (점검C 남은 것, GDD v6.149): 빈사 중 패배·탈진으로 사망한 귀환은 결과 문구가 '빈사로 돌아왔다'가 아니라 사망 안내.
// (결과 화면 연결·가방 첫 탭은 빌드 미리보기로 확인: docs/captures/c511/proof.json)
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { endReasonText } from '../src/ui/labels';

describe('C.511 사망 귀환 결과 문구', () => {
  for (const f of FACTIONS) {
    it(`${f.id}: 빈사 중 패배 = 사망 안내, 평소 패배 = 빈사 안내 그대로`, () => {
      const died = endReasonText('battle-lost', f, true);
      expect(died).toContain('[부활]');
      expect(died).not.toContain('구급상자');
      expect(died).toContain(f.defeatStateName);
      const alive = endReasonText('battle-lost', f);
      expect(alive).toContain('빈사 상태로');
      expect(alive).toContain('구급상자');
    });
    it(`${f.id}: 탈진 사망도 사망 안내, 다른 이유는 died 를 무시`, () => {
      expect(endReasonText('exhausted', f, true)).toContain('[부활]');
      expect(endReasonText('returned', f, true)).toBe(endReasonText('returned', f));
    });
  }
});
