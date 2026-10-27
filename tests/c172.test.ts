// C.172 (GDD 100장 v5.220): 원정 전투 일시정지 [귀환] · 탑/스토리 목표 '포식'(종족 설정) · 피해 숫자 필드 안
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { abortExpedition, advance, canAbort, canAbortBattle, createExpedition, summarize, type ExpeditionState } from '../src/engine/expedition';
import { newSaveData, recordExpedition } from '../src/game';
import { getFaction } from '../src/data/factions';
import { objectiveText } from '../src/ui/storyView';
import { FLOAT_SPOTS, HURT_SPOTS } from '../src/ui/bha/battle';

const read = (p: string) => readFileSync(p, 'utf8');
const mk = (tutorial = false): ExpeditionState =>
  createExpedition({ factionId: 'hollow', seed: 7, hunger: 10, condition: 100, deck: [], difficulty: 1, groundId: 'forest', tutorial });
const toBattle = (e: ExpeditionState): ExpeditionState => {
  for (let i = 0; i < 400 && e.phase !== 'battle'; i++) {
    if (e.phase !== 'moving') e.phase = 'moving';
    advance(e);
  }
  return e;
};

describe('원정 전투 일시정지 [귀환] (엔진)', () => {
  it('전투 중에만 canAbortBattle, 튜토리얼 원정은 안 됨', () => {
    const e = mk();
    expect(canAbortBattle(e)).toBe(false);
    toBattle(e);
    expect(e.phase).toBe('battle');
    expect(canAbortBattle(e)).toBe(true);
    expect(canAbort(e)).toBe(false); // 걷기 [귀환하기] 버튼은 그대로 전투 중 숨김
    expect(canAbortBattle({ phase: 'battle', tutorial: mk(true).tutorial })).toBe(false);
  });
  it('걷기 중간 귀환과 같은 처리: 패배 아님 · 얻은 것 유지 · 런 로그 종료 사유 abort', () => {
    const e = toBattle(mk());
    e.goldLoot.push({ amount: 20, lap: e.lap });
    abortExpedition(e);
    expect(e.phase).toBe('ended');
    expect(e.outcome).toBe('returned');
    expect(e.endReason).toBe('abort');
    expect(e.pending).toBeNull();
    const sum = summarize(e);
    expect(sum.keptGold).toBe(20);
    expect(sum.lost).toEqual([]);
    const s = newSaveData('hollow', 10);
    const runs = s.runLog.runs.length;
    recordExpedition(s, e);
    expect(s.runLog.runs).toHaveLength(runs + 1);
    expect(s.runLog.runs.at(-1)!.endReason).toBe('abort');
    expect(s.runLog.runs.at(-1)!.outcome).toBe('returned');
  });
});

describe('원정 전투 일시정지 [귀환] (화면)', () => {
  it('원정 전투만 onReturn, 확인 창 기본 = 귀환하기 · 결과 카드는 걷기 귀환 코드 그대로', () => {
    const b = read('src/ui/battleView.ts');
    expect(b).toContain("label: '귀환', icon: 'i-return'");
    expect(b).toContain("yes: '귀환하기'");
    expect(b).not.toContain('danger: true'); // 기본 선택 = 주 버튼(귀환하기)
    const a = read('src/ui/app.ts');
    expect(a).toContain('...(canAbortBattle(exp) ? { onReturn: () => {');
    expect(a).toContain("exp.endReason === 'abort'");
    expect(a.match(/onReturn/g)).toHaveLength(1); // 탑·훈련 인형·쟁탈전은 그대로
  });
});

describe('남은 점검 항목', () => {
  it("탑 카드·스토리 목표의 '흡수' → 종족 설정 행동 이름", () => {
    const H = getFaction('hollow');
    const S = getFaction('shinigami');
    expect(objectiveText({ type: 'absorb', enemyClass: 'elite', count: 1 }, H)).toBe(`강적 1마리 ${H.absorbActionName}`);
    expect(objectiveText({ type: 'absorb', enemyClass: 'normal', count: 2 }, S)).toBe(`일반 적 2마리 ${S.absorbActionName}`);
    expect(read('src/ui/towerView.ts')).toContain('${faction.absorbActionName} 없음');
    expect(read('src/ui/towerView.ts')).not.toContain('흡수 없음');
  });
  it('피해 숫자는 위 막대 아래 필드 안에서만 (잘라 냄) · 맞은 쪽 머리 위', () => {
    expect(read('src/ui/bha/v2/bha.css')).toContain('.bha-root .bha-battle__floats{top:46px;overflow:hidden}');
    for (const s of [...FLOAT_SPOTS, ...HURT_SPOTS]) expect(s.top).toBeGreaterThanOrEqual(28);
  });
});
