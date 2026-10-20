// C.74 (Q-4 후속): 도움말 등급 낱말 종족 설정화·진화 연출 태그 중복·단계별 최대 체력 확인
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { GLOSSARY, helpVars, renderHelpText } from '../src/data/help';
import { currentStats, evolve, refStatOf } from '../src/engine/evolution';
import { newSaveData } from '../src/game';
import { PATCH_LABEL } from '../src/version';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('버전 (C.74)', () => {
  it('패치 번호 C.74 이상', () => {
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(74);
  });
});

describe('도움말 등급전 설명의 등급 낱말 = 종족 설정 rankUnitName', () => {
  it('호로 번호 / 사신 석차, 사신 도움말에 "번호" 가 없다', () => {
    expect(getFaction('hollow').rankUnitName).toBe('번호');
    expect(getFaction('shinigami').rankUnitName).toBe('석차');
    const raw = src('src/data/help/glossary.json');
    expect(raw).toContain('{rankUnitName}');
    expect(raw).not.toContain('그 번호를');
    const rank = GLOSSARY.find((g) => g.id === 'rank')!;
    expect(renderHelpText(rank.body, helpVars(getFaction('shinigami')))).toContain('그 석차을(를) 빼앗고');
    expect(renderHelpText(rank.body, helpVars(getFaction('shinigami')))).not.toContain('번호');
    expect(renderHelpText(rank.body, helpVars(getFaction('hollow')))).toContain('그 번호을(를) 빼앗고');
  });
});

describe('진화 연출 "제안 문구" 태그는 한 번만', () => {
  it('본문에 "제안 문구" 를 다시 쓰지 않는다', () => {
    expect(src('src/ui/evolutionPanel.ts')).not.toMatch(/'연출 문구는 제안 문구 '/);
  });
});

describe('단계별 최대 체력 = 기본 체력 × (체력 능력치 ÷ 그 단계 기준 능력치) (GDD 20-3, 의도된 정규화)', () => {
  it('실제 진화 경로에서 체력 종족값 = 기준 능력치면 단계가 올라도 최대 체력이 기본값 그대로', () => {
    const base = BALANCE.provisional.combat.playerMaxHp;
    const need = BALANCE.provisional.evolution.stepsNeeded;
    const save = newSaveData('hollow', 1);
    const e = save.evolution;
    const hpAt: number[] = [];
    for (let t = 0; t <= 4; t++) {
      const st = currentStats(e, 'hollow', 0);
      hpAt.push(base * (st.hp / refStatOf(e.tierIndex)));
      if (t < 4) {
        e.steps = need[t]!;
        expect(evolve(e, save.build, { factionId: 'hollow', hunger: 30, condition: 80, rebirths: 0 }, 1)).not.toBeNull();
      }
    }
    expect(e.tierIndex).toBe(4);
    expect(hpAt[0]).toBeCloseTo(base);
    expect(hpAt[4]).toBeCloseTo(base); // 5단계 체력 70 ÷ 기준 70
    expect(refStatOf(4)).toBeGreaterThan(refStatOf(0));
  });
});
