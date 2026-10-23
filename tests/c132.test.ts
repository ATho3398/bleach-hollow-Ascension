// C.132 (S-23, GDD 78·80·81장): 시작 외형 스탯 편향 삭제 · 슬롯 하나마다 기본 블록 몫 ×0.75 · 원정 도중 [귀환하기]
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { FACTIONS } from '../src/data/factions';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import { basicShareOf, createCombat, spawnRatesOf, type CombatParams } from '../src/engine/combat';
import { currentStats } from '../src/engine/evolution';
import { abortExpedition, advance, canAbort, createExpedition, summarize, type ExpeditionState } from '../src/engine/expedition';
import { applyStartLook, migrateSave, newSaveData, recordExpedition } from '../src/game';
import { snapshotOf } from '../src/engine/titles/evaluate';

const hollow = FACTIONS.find((f) => f.id === 'hollow')!;

describe('78장 시작 외형 = 그림만, 능력치 편향 없음', () => {
  it('호로 시작 외형 5종 모두 능력치가 같다 (기본 외형·편향 없는 새 세이브와 같음)', () => {
    const plain = currentStats(newSaveData('hollow', 1000).evolution, 'hollow');
    const looks = new Set<string | null>();
    for (const r of [0, 0.25, 0.45, 0.65, 0.9]) {
      const s = newSaveData('hollow', 1000);
      looks.add(applyStartLook(s, hollow, r));
      expect(currentStats(s.evolution, 'hollow')).toEqual(plain);
      expect('bias' in s.evolution).toBe(false);
    }
    expect(looks.size).toBe(5); // 그림은 그대로 5종
  });
  it('종족 설정·balance 에 편향 표가 없다', () => {
    for (const f of FACTIONS) expect('startLookBias' in f).toBe(false);
    expect('startBias' in BALANCE.provisional.stats).toBe(false);
  });
  it('옛 세이브(C.108~C.131)의 bias 는 형식 그대로 불러올 때 버린다', () => {
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 0)));
    old.evolution.bias = { hp: -2, atk: -2, int: -2, def: -2, spr: -2, spd: 10 };
    const m = migrateSave(old)!;
    expect(m).not.toBeNull();
    expect('bias' in m.evolution).toBe(false);
    expect(currentStats(m.evolution, 'hollow')).toEqual(currentStats(newSaveData('hollow', 0).evolution, 'hollow'));
  });
  it('상태 화면에 "시작 외형 편향" 문구가 없다', () => {
    expect(readFileSync('src/ui/lcdScreens.ts', 'utf8')).not.toContain('시작 외형 편향');
  });
});

describe('80장 기본 블록 몫 — 본체 슬롯 하나마다 ×0.75', () => {
  const IDS = ['t-poison-c', 't-earth-guard', 't-thunder-heal'];
  const paramsOf = (n: number): CombatParams => {
    const b = newBuild();
    for (const id of IDS.slice(0, n)) gainTrait(b, id);
    return createCombat(1, { enemy: getEnemy('test-a'), params: buildCombatParams(b, 'hollow') }).params;
  };
  it('0칸 100% · 1칸 75% · 2칸 56% · 3칸 42% (초당 생성 기대치)', () => {
    const want = [1, 0.75, 0.5625, 0.421875];
    for (let n = 0; n <= 3; n++) {
      const p = paramsOf(n);
      expect(p.skills).toHaveLength(n);
      expect(basicShareOf(p)).toBeCloseTo(want[n]!);
      expect(1 - spawnRatesOf(p).absorbedShare).toBeCloseTo(want[n]!, 2);
    }
  });
  it('줄어든 몫은 장착 특성 블록 쪽으로 (특성 몫 = 1 − 기본 몫)', () => {
    for (let n = 1; n <= 3; n++) expect(spawnRatesOf(paramsOf(n)).absorbedShare).toBeCloseTo(1 - 0.75 ** n, 2);
  });
  it('체인 보상 수치는 그대로 (66장)', () => {
    expect(BALANCE.provisional.combat.basicBlockChainBonus).toBeDefined();
    expect(readFileSync('src/config/balance.ts', 'utf8')).toContain('basicShareDecayPerSlot: 0.75');
  });
});

describe('81장 원정 도중 [귀환하기]', () => {
  const mk = (opt: { tutorial?: boolean; difficulty?: number } = {}): ExpeditionState =>
    createExpedition({ factionId: 'hollow', seed: 7, hunger: 10, condition: 100, deck: [], difficulty: opt.difficulty ?? 1, groundId: 'forest', tutorial: opt.tutorial });
  it('걷기·휴식 중만 가능, 전투·둥지 칸·튜토리얼은 안 됨', () => {
    const e = mk();
    expect(e.phase).toBe('moving');
    expect(canAbort(e)).toBe(true);
    e.phase = 'rest';
    expect(canAbort(e)).toBe(true);
    for (const ph of ['battle', 'nest-choice', 'event', 'ended'] as const) {
      e.phase = ph;
      expect(canAbort(e)).toBe(false);
      expect(() => abortExpedition(e)).toThrow();
    }
    expect(canAbort(mk({ tutorial: true }))).toBe(false);
  });
  it('모은 것은 지키고 이번 바퀴 완주 보상은 없다, 런 로그 종료 사유 abort', () => {
    const e = mk();
    e.slots = e.slots.map(() => null);
    e.wildCells = [];
    for (let i = 0; i < 3; i++) advance(e);
    e.goldLoot.push({ amount: 30, lap: e.lap });
    e.foodLoot.push({ food: 'snack', lap: e.lap });
    e.acquired.push({ tileId: 'rest', lap: e.lap } as ExpeditionState['acquired'][number]);
    abortExpedition(e);
    expect(e.phase).toBe('ended');
    expect(e.outcome).toBe('returned');
    expect(e.endReason).toBe('abort');
    const sum = summarize(e);
    expect(sum.keptGold).toBe(30);
    expect(sum.keptFood).toContain('snack');
    expect(sum.lost).toEqual([]);
    expect(sum.laps).toBe(0); // 바퀴를 마치지 않았다 → 완주 보상 타일 없음
    const s = newSaveData('hollow', 10);
    s.difficulty.streak = { star: 1, count: 4 };
    const runs = s.runLog.runs.length;
    recordExpedition(s, e);
    expect(s.runLog.runs).toHaveLength(runs + 1);
    expect(s.runLog.runs.at(-1)!.endReason).toBe('abort');
    expect(s.difficulty.streak).toEqual({ star: 1, count: 0 }); // 연속 클리어 끊김
    expect(snapshotOf(s.runLog, s as never).returned).toBe(0); // 칭호 '귀환' 수에 안 셈
  });
  it('화면: 기존 bha- 버튼·확인창 문구, 걷기 화면에서 canAbort 로 숨김', () => {
    const src = readFileSync('src/ui/expeditionView.ts', 'utf8');
    expect(src).toContain("label: '귀환하기'");
    expect(src).toContain("title: '지금 귀환할까요?'");
    expect(src).toContain("body: '이번 바퀴 완주 보상은 없어요'");
    expect(src).toContain('abortBtn.hidden = !canAbort(exp)');
    expect(readFileSync('src/ui/app.ts', 'utf8')).toContain("exp.endReason === 'abort'");
  });
});
