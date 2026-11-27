// C.559 (GDD 13절 v6.240 '튜토리얼 각본 전투의 블록 = 탄 계열', 사용자 2026-11-27 "튜토에서 쓰는 블록은 탄으로 하자. 1체인이랑 3체인 이펙트 차이 제일 잘보이니까"):
// ④ 위기의 블록 1개와 ⑧ 체인의 같은 블록 3개 = provisional tutorialScript.blockFamily 'family-c'(호로 탄 · 사신 귀 — 두 종족 공통 키, 표시명은 종족 설정).
// 도움말 '다시 보기' 체험 전투도 같은 각본(scriptBlockOf)이라 같이. 각본 순서·처치(3체인 마무리)는 그대로.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { scriptAck, scriptBlockOf, scriptPrompt, scriptStep, type CombatEvent, type CombatState } from '../src/engine/combat';
import { advance, createExpedition, startBattle } from '../src/engine/expedition';
import { newSaveData, nextRunId } from '../src/game';

const TS = BALANCE.provisional.tutorialScript;

const tutorialBattle = (factionId: string, seed = 7): CombatState => {
  const save = newSaveData(factionId, 1);
  const exp = createExpedition({
    factionId, seed, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition, deck: [], risk: save.nest.risk,
    build: save.build, evolution: save.evolution, tutorial: true,
  });
  while (exp.phase === 'moving') advance(exp);
  return startBattle(exp);
};

/** 끝까지 진행하며 블록 사건·쌓인 트레이 계열을 모은다 */
const run = (s: CombatState) => {
  const blocks: Extract<CombatEvent, { kind: 'block' }>[] = [];
  const trayFamilies: (string | null | undefined)[] = [];
  for (let g = 0; s.status === 'playing' && g < 1e6; g++) {
    const p = scriptPrompt(s);
    if (p?.wait === 'use') trayFamilies.push(...s.tray.map((b) => b.family));
    if (p?.wait === 'ack') scriptAck(s);
    else if (p?.wait === 'guard') scriptStep(s, { type: 'guard' });
    else if (p?.wait === 'use') scriptStep(s, { type: 'use', cell: 0 });
    else if (p?.wait === 'liberate') scriptStep(s, { type: 'liberate' });
    else scriptStep(s);
    for (const e of s.events.splice(0)) if (e.kind === 'block' && e.role === 'attack') blocks.push(e); // 막기(basic-guard) 사건은 빼고
  }
  return { blocks, trayFamilies };
};

describe('C.559 튜토리얼 각본 블록 = 탄 계열 (GDD 13절 v6.240)', () => {
  it('balance: tutorialScript.blockFamily = family-c, BALANCE_VERSION 174 이상', () => {
    expect(TS.blockFamily).toBe('family-c');
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(174);
  });

  it('계열 표시명은 종족 설정: 호로 family-c = 탄, 사신 family-c = 귀', () => {
    expect(getFaction('hollow').families.find((f) => f.id === 'family-c')!.abbr).toBe('탄');
    expect(getFaction('shinigami').families.find((f) => f.id === 'family-c')!.abbr).toBe('귀');
  });

  for (const fid of ['hollow', 'shinigami']) {
    it(`${fid}: ④ 위기 블록 1개·⑧ 체인 블록 ${TS.chainLength}개 모두 family-c, 각본 끝까지 그대로 처치(3체인 마무리)`, () => {
      const s = tutorialBattle(fid);
      expect(scriptBlockOf(s).family).toBe('family-c');
      const { blocks, trayFamilies } = run(s);
      expect(s.status).toBe('won');
      expect(blocks.map((b) => [b.family, b.chain])).toEqual([['family-c', 1], ['family-c', TS.chainLength]]);
      expect(trayFamilies.length).toBe(1 + TS.chainLength);
      expect(trayFamilies.every((f) => f === 'family-c')).toBe(true);
      expect(s.finisher?.kind).toBe('skill');
      expect(s.chain3Count).toBe(1);
    });
  }

  it('그 몸에 없는 계열 키면 옛 규칙(출현표 기본 블록 계열)으로', () => {
    const s = tutorialBattle('hollow');
    const fams = s.params.families;
    const { ['family-c']: _c, ...rest } = fams as Record<string, unknown>;
    s.params.families = rest as typeof fams;
    expect(scriptBlockOf(s).family).not.toBe('family-c');
  });

  it('엔진에 종족 분기 없음, 기획서 13절 줄', () => {
    const src = readFileSync('src/engine/combat/script.ts', 'utf8');
    expect(src).not.toMatch(/faction(Id)? === '(hollow|shinigami)'/);
    expect(src).toMatch(/TS\.blockFamily/);
    expect(readFileSync('docs/GDD.md', 'utf8')).toMatch(/튜토리얼 각본 전투의 블록 = 탄 계열/);
  });
});
