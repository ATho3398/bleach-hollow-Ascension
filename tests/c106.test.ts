// C.106 (GDD 49-7·49-8): 특수 속성(혈·독·허) 숨기기 · 4단계 일반 5종 · 실패형 줄기 낮춤·이름 · 종족별 특별 태그 '최초의 호로'
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { ELEMENTAL_IDS, NORMAL_ELEMENT, SPECIAL_ELEMENT_IDS } from '../src/data/elements';
import { FORM_TABLE, formsOfTier, getForm } from '../src/data/evolution';
import { failLineTotal } from '../src/data/evolution/generate';
import { getFaction } from '../src/data/factions';
import { STAT_IDS } from '../src/data/schema';
import { TITLES, titleName, titlesForFaction } from '../src/data/titles';
import { gainTrait, newBuild } from '../src/engine/absorb';
import {
  applyEvolutionToParams, baseStatsOf, currentStats, evolutionCandidates, formDisplayName, isFailLine, newEvolution, tierDisplayName, type EvolutionState,
} from '../src/engine/evolution';
import { checkTitles, migrateSave, newSaveData, remapSpecialVastoId, SAVE_FORMAT_VERSION, statBonusOf } from '../src/game';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const SX = BALANCE.provisional.stats;
const FL = BALANCE.provisional.evolution.failLine;
const sum = (s: Record<string, number>) => STAT_IDS.reduce((a, k) => a + s[k]!, 0);

function evo(path: string[], tierIndex = path.length): EvolutionState {
  return { ...newEvolution(7), tierIndex, formHistory: [...path], formId: path[path.length - 1] ?? null, ability: 'atk' };
}

// 49-7 ① 특성 숨김은 C.127 (GDD 75장)에서 적 등장 숨김으로 옮김 — tests/c127.test.ts

describe('49-7 ② → GDD 126장 6 (C.220): 3단계 일반 = 노멀 + 원소 4종, 혈·독·허는 4단계에서 타입 하나씩', () => {
  it('3단계 일반 5종, 특수 속성은 3단계에 없고 4단계에 단일 타입(혈 물리·독 특수·허 혼합)만', () => {
    expect(formsOfTier(3).filter((f) => !f.hidden).map((f) => f.id).sort()).toEqual([NORMAL_ELEMENT, ...ELEMENTAL_IDS].map((el) => `t3:${el}`).sort());
    for (const el of SPECIAL_ELEMENT_IDS) {
      expect(FORM_TABLE.some((f) => f.id === `t3:${el}`)).toBe(false);
      expect(formsOfTier(4).filter((f) => !f.hidden && f.label.elements[0] === el)).toHaveLength(1);
    }
  });
  it('혈 특성을 가장 많이 장착해도 3단계 일반 후보는 그다음 일반 속성(없으면 노멀)', () => {
    const b = newBuild();
    gainTrait(b, 't-blood-a');
    gainTrait(b, 't-blood-c');
    const ctx = { factionId: 'hollow', build: b, hunger: 0, condition: 100 };
    const e = evo(['t2:base'], 1);
    expect(evolutionCandidates(e, ctx).normal.id).toBe('t3:normal');
    gainTrait(b, 't-fire-a');
    expect(evolutionCandidates(e, ctx).normal.id).toBe('t3:fire');
  });
});

describe('49-8 1·2번 실패형 줄기 (C.220: 3단계 망한 진화체부터)', () => {
  it('종족값 합계: 3단계 망한 진화체 = 2단계 + 오름분 × 30%, 4단계도 같은 낮춤 (일반 줄기는 그대로)', () => {
    const t3 = failLineTotal(SX.tierTotals, FL.gainRatio, 3, 3);
    const t4 = failLineTotal(SX.tierTotals, FL.gainRatio, 4, 3);
    expect(t3).toBe(Math.round(SX.tierTotals[1]! + (SX.tierTotals[2]! - SX.tierTotals[1]!) * FL.gainRatio));
    expect(t4).toBe(Math.round(SX.tierTotals[1]! + (SX.tierTotals[3]! - SX.tierTotals[1]!) * FL.gainRatio));
    expect(sum(getForm('h3:fail').stats)).toBe(t3);
    const fail4 = evo(['t2:base', 'h3:fail', 't4:normal:physical']);
    const norm4 = evo(['t2:base', 't3:normal', 't4:normal:physical']);
    expect(sum(baseStatsOf(fail4, 'hollow'))).toBe(t4);
    expect(sum(baseStatsOf(norm4, 'hollow'))).toBe(SX.tierTotals[3]);
    // 비율(쏠림)은 그대로: 물리형은 힘 > 지능
    const s = baseStatsOf(fail4, 'hollow');
    expect(s.atk).toBeGreaterThan(s.int);
    expect(isFailLine(fail4)).toBe(true);
    expect(isFailLine(norm4)).toBe(false);
  });
  it('블록 관련 피해 ×0.5 (실패형 줄기만)', () => {
    const p1: Record<string, unknown> = {};
    applyEvolutionToParams(p1, evo(['t2:base', 'h3:fail', 't4:normal:mixed']), 'hollow');
    expect(p1.blockDamageMultiplier).toBe(FL.blockDamage);
    const p2: Record<string, unknown> = {};
    applyEvolutionToParams(p2, evo(['t2:base', 't3:fire']), 'hollow');
    expect(p2.blockDamageMultiplier).toBe(1);
  });
  it('이름·단계 표시 = 종족 설정 1단계 이름 (호로 / 혼백)', () => {
    for (const fid of ['hollow', 'shinigami']) {
      const first = getFaction(fid).tierNames[0]!;
      for (const path of [['t2:base', 'h3:fail'], ['t2:base', 'h3:fail', 't4:fire:special'], ['t2:base', 't3:fire', 'h4:fail']]) {
        const e = evo(path);
        expect(formDisplayName(e, fid)).toBe(first);
        expect(tierDisplayName(e, fid)).toBe(first);
      }
      const n = evo(['t2:base', 't3:fire']);
      expect(tierDisplayName(n, fid)).toBe(getFaction(fid).tierNames[2]);
      expect(formDisplayName(n, fid)).not.toBe(first);
    }
    expect(getFaction('hollow').tierNames[0]).toBe('호로');
    expect(getFaction('shinigami').tierNames[0]).toBe('혼백');
  });
});

describe('49-8 3번 특별 태그 종족별 · 최초의 호로', () => {
  const failSave = (fid: string, carry: number) => {
    const s = newSaveData(fid, 0);
    Object.assign(s.evolution, evo(['t2:base', 'h3:fail', 't4:normal:physical']));
    s.evolution.carry = Object.fromEntries(STAT_IDS.map((k) => [k, carry])) as never;
    return s;
  };
  it('tag-1 은 호로 전용(최초의 호로), 은밀기동대장은 사신 전용 별개 태그(옛 조건 유지)', () => {
    const t1 = TITLES.find((t) => t.id === 'tag-1')!;
    const ts = TITLES.find((t) => t.id === 'tag-1-shinigami')!;
    expect(t1.factions).toEqual(['hollow']);
    expect(titleName(t1, 'hollow')).toBe('최초의 호로');
    expect(ts.factions).toEqual(['shinigami']);
    expect(titleName(ts, 'shinigami')).toBe('은밀기동대장');
    expect(ts.condition).toEqual({ type: 'or', any: [{ type: 'survivedBreakthroughs', min: 1 }, { type: 'chain3Total', min: 30 }] });
    expect(titlesForFaction('hollow').some((t) => t.id === 'tag-1-shinigami')).toBe(false);
    expect(titlesForFaction('shinigami').some((t) => t.id === 'tag-1')).toBe(false);
    expect(t1.hidden).toBe(true);
  });
  it('실패형 줄기 4단계(C.220) + 능력치 합계 tierTotals[3] 이상이면 지급, 모자라면 안 줌. 런 로그에 지급 기록', () => {
    const low = failSave('hollow', 0);
    expect(sum(currentStats(low.evolution, 'hollow', statBonusOf(low).total))).toBeLessThan(SX.tierTotals[3]!);
    expect(checkTitles(low, 'load', 1).map((d) => d.id)).not.toContain('tag-1');
    const high = failSave('hollow', 40);
    expect(checkTitles(high, 'evolution', 5).map((d) => d.id)).toContain('tag-1');
    const rec = high.runLog.titleUnlocks!.find((r) => r.titleId === 'tag-1')!;
    expect(rec).toMatchObject({ at: 5, factionId: 'hollow', trigger: 'evolution', tierIndex: 3 });
    expect(rec.statTotal).toBeGreaterThanOrEqual(SX.tierTotals[3]!);
    expect(rec.formHistory).toContain('h3:fail');
  });
  it('일반 줄기는 합계가 넘어도 안 주고, 사신 트랙은 같은 상태여도 tag-1 이 없다', () => {
    const n = newSaveData('hollow', 0);
    Object.assign(n.evolution, evo(['t2:base', 't3:fire', 't4:fire:physical']));
    expect(checkTitles(n, 'load', 1).map((d) => d.id)).not.toContain('tag-1');
    expect(checkTitles(failSave('shinigami', 40), 'load', 1).map((d) => d.id)).not.toContain('tag-1');
  });
});

describe('세이브 형식 32 마이그레이션', () => {
  it('옛 t4 특수 속성 진화체 → 같은 속성 h4 특수형 (진화 상태·기록·도감), 사신 tag-1 → tag-1-shinigami', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(32); // C.109 에서 33 (형식 33 검사는 c109.test.ts)
    expect(remapSpecialVastoId('t4:blood')).toBe('h4:special:blood');
    expect(remapSpecialVastoId('t3:fire')).toBe('t3:fire');
    const old = JSON.parse(JSON.stringify(newSaveData('shinigami', 0)));
    old.meta.format = 31;
    Object.assign(old.evolution, { tierIndex: 4, formId: 't5:poison:mixed', formHistory: ['t2:base', 't3:base', 't4:poison', 't5:poison:mixed'] });
    old.formDex = ['t2:base', 't3:base', 't4:poison', 't5:poison:mixed'];
    old.runLog.tiers.evolutions.push({ fromTier: 2, toTier: 3, fromFormId: 't3:base', toFormId: 't4:poison', formId: 't4:poison', at: 1 });
    old.titles = [{ titleId: 'tag-1', at: 1, trigger: 'load', seen: true, snapshot: { runs: 0, returned: 0, defeated: 0, absorbs: 0, maxLap: 0, tierIndex: 3, formId: 't4:poison', factionId: 'shinigami' } }];
    const s = migrateSave(old)!;
    expect(s.meta.format).toBe(SAVE_FORMAT_VERSION);
    // 형식 32 가 h4:special:poison 으로 옮긴 뒤 형식 57(C.220)이 4단계 개편: 옛 4단계 특수형 → 3단계 히든 통로, 옛 5단계 독 혼합 → 독 하나뿐인 특수형
    expect(s.evolution.formHistory).toEqual(['t2:base', 'h3:passage', 't4:poison:special']);
    expect(s.formDex).toContain('h3:passage');
    expect(s.formDex).not.toContain('t4:poison');
    expect(s.runLog.tiers.evolutions[0]).toMatchObject({ toFormId: 'h3:passage', formId: 'h3:passage' });
    expect(s.titles.map((t) => t.titleId)).toEqual(['tag-1-shinigami']);
    expect(s.titles[0]!.snapshot.formId).toBe('h4:special:poison');
  });
  it('호로 트랙의 옛 tag-1 해금은 그대로 둔다 (한 번 해금하면 지우지 않는다)', () => {
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 0)));
    old.meta.format = 31;
    old.titles = [{ titleId: 'tag-1', at: 1, trigger: 'load', seen: true, snapshot: { runs: 0, returned: 0, defeated: 0, absorbs: 0, maxLap: 0, tierIndex: 0, formId: null, factionId: 'hollow' } }];
    expect(migrateSave(old)!.titles.map((t) => t.titleId)).toEqual(['tag-1']);
  });
});
