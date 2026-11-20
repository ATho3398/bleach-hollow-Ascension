// C.513 (GDD v6.151 폭주 블록, 사용자 2026-11-20 "그리고 폭주블록은 광기에 나오는거고, 컨디션은 다른거잖아;;; 컨디션은 왜 폭주 달아놨냐."):
// 폭주 블록 몫 가산 = 리스크 게이지(광기/호로화) 비율 × riskGaugeVoidBonusMax(15%p) — 컨디션 가산 폐기. 경화수월·붕옥도 같은 공식을 따른다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getFaction } from '../src/data/factions';
import { riskText, riskZones, zoneLines } from '../src/data/help/riskText';
import { buildCombatParams } from '../src/engine/absorb/build';
import { createCombat, KIT_TRAIT_PREFIX, spawnTableOf, voidChanceOf, type CombatParams } from '../src/engine/combat';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { advance, createExpedition, riskBonus, startBattle } from '../src/engine/expedition';
import { testGrantTranscendent } from '../src/engine/testMode';
import { newSaveData } from '../src/game';
import { statusInfo } from '../src/ui/bha/statusInfo';

const PX = BALANCE.provisional.expedition;
const RX = BALANCE.provisional.risk;
const CX = BALANCE.provisional.combat;
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const mkExp = (condition: number, risk: number, factionId = 'hollow') => createExpedition({ factionId, seed: 40, hunger: 10, condition, risk, deck: DECK });
/** 첫 야생 전투의 폭주 블록 가산 */
const battleBonus = (condition: number, risk: number, factionId = 'hollow') => {
  const e = mkExp(condition, risk, factionId);
  e.wildCells = [1];
  advance(e);
  return startBattle(e).params.voidChanceBonus;
};

describe('C.513 폭주 블록 = 리스크 게이지, 컨디션과 상관없음', () => {
  it('수치: riskGaugeVoidBonusMax 0.15, 옛 conditionRiskBonusMax 삭제', () => {
    expect(PX.riskGaugeVoidBonusMax).toBe(0.15);
    expect('conditionRiskBonusMax' in PX).toBe(false);
  });

  it('컨디션 0~100 을 바꿔도 폭주 블록 몫이 같다 (두 종족)', () => {
    for (const f of ['hollow', 'shinigami']) {
      for (const risk of [0, 50]) {
        const vals = [0, 25, 50, 75, 100].map((c) => battleBonus(c, risk, f));
        for (const v of vals) expect(v).toBeCloseTo(vals[0]!, 12);
      }
    }
  });

  it('리스크 0 / 절반 / 가득 → +0 / +7.5 / +15%p (1바퀴, 폭주 전)', () => {
    expect(riskBonus(mkExp(100, 0))).toBeCloseTo(0, 12);
    expect(riskBonus(mkExp(100, RX.limit / 2))).toBeCloseTo(0.075, 12);
    expect(riskBonus(mkExp(100, RX.limit))).toBeCloseTo(0.15, 12);
    // 전투 시작 때 그대로 실린다
    expect(battleBonus(30, RX.limit / 2)).toBeCloseTo(0.075, 12);
    // 게이지가 한계를 넘어도 가득 이상으로 늘지 않는다
    const over = mkExp(100, 0);
    over.risk = RX.limit * 2;
    expect(riskBonus(over)).toBeCloseTo(0.15, 12);
  });

  it('바퀴·폭주 가산은 그대로 더하고, 블록 확률은 상한 50%', () => {
    const e = mkExp(0, RX.limit);
    e.lap = PX.lateLapStart + 1;
    const late = 2 * PX.lateLapRiskBonusPerLap;
    expect(riskBonus(e)).toBeCloseTo(0.15 + late, 12);
    const p = { ...createCombat(1, { enemy: getEnemy('test-a') }).params, voidChanceBonus: 0.15 + 0.2 + 0.3 };
    expect(CX.voidChanceMax).toBe(0.5);
    expect(voidChanceOf(p)).toBe(0.5);
    expect(voidChanceOf({ ...p, voidChanceBonus: 0.15 })).toBeCloseTo(CX.voidChance + 0.15, 12);
  });

  it('경화수월·붕옥도 폭주 블록 공식을 따라 리스크가 찰수록 늘고, 컨디션은 상관없다', () => {
    const s = newSaveData('hollow', 1000);
    expect(testGrantTranscendent(s, 'aizen', 2000)).toBe('added');
    const base: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
    applyEvolutionToParams(base, s.evolution, s.factionId, 0, false);
    const at = (risk: number, condition: number) => {
      const p = createCombat(1, { enemy: getEnemy('test-a'), params: { ...base, voidChanceBonus: riskBonus(mkExp(condition, risk)) } }).params;
      const e = spawnTableOf(p, false, 20).entries;
      const c = (b: string) => e.find((x) => x.source?.id === KIT_TRAIT_PREFIX + b)?.chance ?? 0;
      return { hogyoku: c('hogyoku'), kyoka: c('kyoka') };
    };
    const low = at(0, 100);
    const full = at(RX.limit, 100);
    expect(low.hogyoku).toBeCloseTo(0.15 + CX.voidChance, 9);
    expect(full.hogyoku).toBeCloseTo(0.15 + CX.voidChance + 0.15, 9);
    expect(full.kyoka).toBeCloseTo((1 - full.hogyoku) * (0.12 + CX.voidChance + 0.15), 9);
    expect(at(0, 0)).toEqual(low);
    expect(at(RX.limit, 0)).toEqual(full);
  });

  it('화면 문구: 컨디션 ⓘ 에 폭주 블록 줄이 없고, 리스크 게이지 ⓘ·도움말에 "찰수록 폭주 블록 (가득 +15%p)" (두 종족)', () => {
    for (const id of ['hollow', 'shinigami']) {
      const f = getFaction(id);
      const cond = statusInfo('cond', f, 10);
      expect([cond.lead, ...cond.groups.flatMap((g) => g.lines)].join('\n')).not.toContain('폭주 블록');
      const risk = statusInfo('risk', f, 50);
      const all = [risk.lead, ...risk.groups.flatMap((g) => g.lines)].join('\n');
      expect(all).toContain('폭주 블록이 자주 나온다(가득이면 +15%p)');
      expect(riskText(f).riskDoes[0]).toContain('+15%p');
      expect(zoneLines(riskZones(f)).join('\n')).toContain('폭주 블록 확률 +15%p');
    }
  });

  it('걷기 화면: 폭주 블록 +n% 는 컨디션 막대가 아니라 리스크 게이지 막대에 (같은 riskBonus)', () => {
    const src = readFileSync('src/ui/expeditionView.ts', 'utf8');
    expect(src).toMatch(/kind: 'cond'[^\n]*valueText: `\$\{condNow\}` \}/);
    expect(src).toMatch(/kind: 'risk'[\s\S]{0,400}BLOCK_WORDS\.void\} 블록 \+\$\{Math\.round\(bonus \* 100\)\}%/);
  });
});
