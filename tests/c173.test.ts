// C.173 (GDD 101장): 공허 블록 패널티화 — 블록 하나가 공허로 바뀌는 몫 · 피해 1회분(히든 진화체 8회분) · 폭주 받는 피해 ×1.6 + 회피 20%
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { createCombat, defaultCombatParams, drainCombatEvents, spawnTableOf, step, type CombatEvent, type CombatParams, type CombatState } from '../src/engine/combat';
import { applyEvolutionToParams, newEvolution } from '../src/engine/evolution';
import { applyFrenzy } from '../src/engine/expedition';

const CX = BALANCE.provisional.combat;
const RX = BALANCE.provisional.risk;

function playOut(s: CombatState): CombatEvent[] {
  const out: CombatEvent[] = [];
  while (s.status === 'playing') {
    step(s, s.tray.length > 0 ? { type: 'use', cell: 0 } : null);
    out.push(...drainCombatEvents(s));
  }
  return out;
}

describe('C.173 공허 블록 (GDD 101장)', () => {
  it('수치: 기본 몫 10% · 상한 50% · 피해 1회분 · 히든 8회분 · 별도 공허 시계 없음', () => {
    expect(CX.voidChance).toBe(0.1);
    expect(CX.voidChanceMax).toBe(0.5);
    expect(CX.voidPowerInAttacks).toBe(1);
    expect(CX.voidPowerHiddenInAttacks).toBe(8);
    expect('voidCheckSeconds' in CX).toBe(false);
  });

  it('공허는 블록 간격을 줄이지 않고 그 자리를 차지한다 (몫 = 공허 확률, 상한 50%)', () => {
    const p = defaultCombatParams();
    const none = spawnTableOf({ ...p, voidChance: 0 });
    const t = spawnTableOf(p);
    expect(t.seconds).toBeCloseTo(none.seconds);
    expect(t.entries.find((e) => e.kind === 'void')!.chance).toBeCloseTo(CX.voidChance);
    expect(t.entries.reduce((a, e) => a + e.chance, 0)).toBeCloseTo(1);
    const capped = spawnTableOf({ ...p, voidChanceBonus: 2 });
    expect(capped.entries.find((e) => e.kind === 'void')!.chance).toBeCloseTo(0.5);
  });

  it('히든 진화체 몸이면 공허 피해 8회분, 일반 진화체는 1회분 (진화체 데이터 hidden 으로 판별)', () => {
    const on = (formId: string) => {
      const p: Partial<CombatParams> = {};
      applyEvolutionToParams(p, { ...newEvolution(), tierIndex: 3, formId, formHistory: [], ability: 'atk' }, 'hollow');
      return p.voidPowerInAttacks;
    };
    expect(on('t4:water')).toBe(CX.voidPowerInAttacks);
    expect(on('h4:complete')).toBe(CX.voidPowerHiddenInAttacks);
  });

  it('공허 블록 피해 = 기본 공격 1회분 수준 (히든 몸 대비 1/8)', () => {
    const dmg = (voidPowerInAttacks: number) => {
      const s = createCombat(5, { enemy: getEnemy('test-a'), params: { critChance: 0, enemyCritChance: 0, voidChance: 0.5, voidChanceMax: 0.5, liberationEnabled: false, voidPowerInAttacks } });
      s.enemy.hp = s.enemy.maxHp = 1e9;
      s.player.hp = s.player.maxHp = 1e9;
      s.params.timeLimitSeconds = 30;
      const v = playOut(s).filter((e): e is Extract<CombatEvent, { kind: 'block' }> => e.kind === 'block' && e.block === 'void');
      expect(v.length).toBeGreaterThan(0);
      return v[0]!.damage;
    };
    expect(dmg(8) / dmg(1)).toBeCloseTo(8, 6);
  });

  it('폭주: 주는 ×1.3 · 받는 ×1.6 · 회피 20% — 회피하면 적 공격 피해가 통째로 없다', () => {
    expect(RX.frenzyDamageDealt).toBe(1.3);
    expect(RX.frenzyDamageTaken).toBe(1.6);
    expect(RX.frenzyEvadeChance).toBe(0.2);
    const params: Partial<CombatParams> = {};
    applyFrenzy(params);
    expect(params.evadeChance).toBe(0.2);
    const s = createCombat(9, { enemy: getEnemy('test-a'), params: { critChance: 0, enemyCritChance: 0, voidChance: 0, liberationEnabled: false, evadeChance: 0.2 } });
    s.enemy.hp = s.enemy.maxHp = 1e9;
    s.player.hp = s.player.maxHp = 1e9;
    s.params.timeLimitSeconds = 600;
    const ev = playOut(s);
    const evades = ev.filter((e) => e.kind === 'evade').length;
    const hits = ev.filter((e) => e.kind === 'enemy-attack').length;
    const share = evades / (evades + hits);
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.25);
    expect(s.evades).toBe(evades);
  });

  it('회피 확률 0 이면 회피 없음', () => {
    const s = createCombat(9, { enemy: getEnemy('test-a'), params: { voidChance: 0, liberationEnabled: false } });
    s.player.hp = s.player.maxHp = 1e9;
    expect(playOut(s).some((e) => e.kind === 'evade')).toBe(false);
  });

  it('화면: 회피 글자 · 도움말 공허 설명이 새 규칙', () => {
    expect(readFileSync('src/ui/battleView.ts', 'utf8')).toContain("spawnFloat('guard', '회피')");
    const g = readFileSync('src/data/help/glossary.json', 'utf8');
    expect(g).toContain('{voidChancePct}');
    expect(g).toContain('{voidHiddenAttacks}');
  });
});
