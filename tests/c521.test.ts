// C.521 호로 추파카브라 출현 제외 = 고정 저장 블록만 (마스터AR 11-23 — docs/drafts/evo-impl-1121.md 29행 "혈 블록 1개가 바 첫 칸에 고정(쓰면 사라지지 않음, 더 생기지 않음 — 다른 블록은 평소처럼 나옴)")
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { evoFormEntry, evoText } from '../src/data/evolution/uniques';
import { EVO_BAL_KNOWN } from '../scripts/lib/evoUniqueBalance';

describe('C.521 추파카브라', () => {
  const a = evoFormEntry('t4:blood:physical', 'hollow')!.ability!;
  it('혈 속성 출현 제외 없음 — 고정 블록(fixed)만 1칸, 써도 남음', () => {
    expect(a.spawnExclude ?? []).toEqual([]);
    expect(a.specials?.vessel?.fixed).toBe('fixed');
    expect(a.specials?.vessel?.keep).toBe(true);
    expect((BALANCE.provisional.evoUniques.forms['t4:blood:physical'] as Record<string, Record<string, unknown>>).hollow!.fixed).toBe(1);
  });
  it('설명 = 고정 블록은 더 생기지 않고, 혈 블록도 평소대로', () => {
    const d = evoText(a.description, 'hollow');
    expect(d).toContain('이 고정 블록은 더 생기지 않고');
    expect(d).toContain('혈 블록도 평소대로');
    expect(d).not.toContain('다른 혈 블록은 저절로 생기지 않고');
  });
  it('여전히 목표 미달(가드 경고) — 사유에 남은 원인·시도·대안이 적혀 있다', () => {
    const why = EVO_BAL_KNOWN['t4:blood:physical/hollow']!;
    expect(why).toContain('C.521');
    expect(why).toContain('목표 미달');
    expect(why).toContain('사용 문턱');
  });
  it('사용자 확정값 그대로: 저장 100% · 피해 ×1.0', () => {
    expect(BALANCE.provisional.evoUniques.forms['t4:blood:physical']!.hollow).toMatchObject({ store: 1, useMult: 1 });
  });
});
