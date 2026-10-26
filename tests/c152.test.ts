// C.152 (사용자 "전투 화면을 필드(위 200px)/스킬창(아래 130px)으로 나누고 스킬 블록을 '각인 컷' 규칙대로 구현한다")
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { V2_GLYPH, V2_PATH, v2AttackKind, v2FamilyPath } from '../src/ui/bha/v2/battle';

const read = (p: string) => readFileSync(p, 'utf8');
const view = read('src/ui/battleView.ts');
const parts = read('src/ui/bha/v2/battle.ts');
const css = read('src/ui/bha/v2/bha.css');

describe('C.152 전투 v2', () => {
  it('속성 id → 블록 종류: 모르는 속성은 노멀', () => {
    expect(v2AttackKind('fire')).toBe('fire');
    expect(v2AttackKind('kyo')).toBe('kyo');
    expect(v2AttackKind('???')).toBe('normal');
    expect(v2AttackKind(null)).toBe('normal');
  });
  it('계열 아이콘: fx → 경로, 모르면 발톱', () => {
    expect(v2FamilyPath('bite')).toBe(V2_PATH.bite);
    expect(v2FamilyPath('nope')).toBe(V2_PATH.claw);
    expect(v2FamilyPath(undefined)).toBe(V2_PATH.claw);
  });
  it('역할 글자는 README 규칙 그대로 (방·회·허·콤·해·봉)', () => {
    expect(V2_GLYPH).toEqual({ guard: '방', heal: '회', void: '허', combo: '콤', release: '해', seal: '봉' });
  });
  it('마크업 순서 face → pips → icon → glyph → name, 이름은 aria-label 로만', () => {
    const order = ['bha-block__face', 'bha-block__pips', 'bha-block__icon', 'bha-block__glyph', 'bha-block__name'];
    const at = order.map((c) => parts.indexOf(c));
    expect(at.every((n) => n > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(parts).toContain('aria-label');
  });
  it('전투 화면은 .bha-root 안에서 필드/스킬창으로 나뉜다', () => {
    expect(view).toContain('mountV2Root');
    expect(view).toContain('bha-field');
    expect(view).toContain('bha-skillpanel');
    expect(parts).toContain('bha-chain');
  });
  it('필드 위 UI 패널을 없앤다 — 배속·필살·SP 마크업 없음', () => {
    expect(view).not.toMatch(/배속 ?[x×0-9]/);
    expect(view).not.toContain('bha-sp-');
  });
  it('체인 색: 2 금색 / 3 주황, 봉 칸 색 폴백 정의', () => {
    expect(css).toMatch(/\.bha-root \.bha-chain--3/);
    expect(css).toMatch(/\.bha-block--kyo\s*\{/);
  });
});
