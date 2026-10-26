// C.128 강적 조우 WARNING 경고 (GDD 76장)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isHiddenElement, nextCellIsElite, warningBandToken, warningKind, warningLine, warningMs, WARNING_MS, WARNING_REDUCED_MS } from '../src/ui/warningLogic';

const read = (p: string) => readFileSync(p, 'utf8');
const enemy = (c: string) => ({ class: c });

describe('76장 강적 조우 WARNING', () => {
  it('경고 대상: 보스 · 강적(강적 타일·조합·포식자 둥지 사냥꾼) — 일반과 첫 원정 튜토리얼은 없음', () => {
    expect(warningKind({ elite: false, enemy: enemy('normal') })).toBeNull();
    expect(warningKind({ elite: true, enemy: enemy('normal') })).toBe('elite');
    expect(warningKind({ elite: false, enemy: enemy('elite') })).toBe('elite');
    expect(warningKind({ boss: 'grandfisher', elite: false, enemy: enemy('elite') })).toBe('boss');
    expect(warningKind({ elite: true, enemy: enemy('elite') }, true)).toBeNull();
  });

  it('히든 속성(혈·독·허)은 특수 속성: 띠 색 = 그 속성 토큰, 아니면 기본 경고색', () => {
    for (const id of ['blood', 'poison', 'kyo']) expect(isHiddenElement(id), id).toBe(true);
    for (const id of ['normal', 'water', 'fire', 'earth', 'thunder']) expect(isHiddenElement(id), id).toBe(false);
    expect(warningBandToken('fire')).toBe('--bha-attack');
    expect(warningBandToken('poison')).toBe('--bha-lin-b');
    expect(warningBandToken('kyo')).toBe('--bha-lin-d');
  });

  it('시간 약 1.5초, 동작 줄이기 0.4초 · 문구', () => {
    expect(WARNING_MS).toBe(1500);
    expect(warningMs(false)).toBe(1500);
    expect(warningMs(true)).toBe(WARNING_REDUCED_MS);
    expect(WARNING_REDUCED_MS).toBe(400);
    expect(warningLine('elite', '상급 호로')).toBe('강적 출현 — 상급 호로');
    expect(warningLine('boss', '그랜드피셔')).toBe('보스 출현 — 그랜드피셔');
  });

  it('걷기: 다음 칸이 강적 소굴·포식자 둥지 타일이면 ⚠, 먹이·휴식·빈 칸은 아님', () => {
    const slots = [null, 'prey-nest-a', 'elite-den-a', 'rest-a', 'hunter-den', null];
    expect(nextCellIsElite({ pos: 1, slots })).toBe(true); // 다음 = 2 강적 소굴
    expect(nextCellIsElite({ pos: 0, slots })).toBe(false); // 다음 = 1 먹이
    expect(nextCellIsElite({ pos: 2, slots })).toBe(false); // 다음 = 3 휴식
    expect(nextCellIsElite({ pos: 3, slots })).toBe(true); // 다음 = 4 포식자 둥지
    expect(nextCellIsElite({ pos: 4, slots })).toBe(false); // 다음 = 5 빈 칸
    expect(nextCellIsElite({ pos: 5, slots })).toBe(false); // 다음 = 0 (다음 바퀴 처음) 빈 칸
  });

  it('연결: 전투 직전 경고 → 끝나면 전투(엔진 변경 없음), 종족 분기 없음, 토큰만', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain('warningKind(p, Boolean(exp.tutorial))');
    expect(app).toContain('playWarning(');
    expect(app).toContain('beginBattle(faction, exp)');
    const view = read('src/ui/warningView.ts');
    expect(view).not.toMatch(/hollow|shinigami|faction\.id\s*===/);
    expect(view).toContain('bha-warn__skip');
    expect(view).toContain('registerLayer(');
    expect(read('src/ui/expeditionView.ts')).toContain('nextCellIsElite(exp)');
    const css = read('src/ui/bha/warning.css');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rgb\(/);
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('var(--bha-attack)');
  });
});
