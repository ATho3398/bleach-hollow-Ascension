// C.562 (GDD 13절 v6.243 '튜토리얼 각본 전투의 블록 = 호로 탄 / 사신 참', 사용자 2026-11-27 "사신은 참으로 해"):
// 각본 블록 계열 = 종족 설정 tutorial.blockFamily(호로 family-c 탄 · 사신 family-a 참). 엔진은 각본(newCombatScript)에 넣어 준 값만 쓰고 종족을 모른다.
// 옛 C.559 balance 공통 키 provisional.tutorialScript.blockFamily 는 삭제. 첫 모험 각본 전투와 도움말 '다시 보기' 체험 전투 둘 다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { newCombatScript, scriptAck, scriptBlockOf, scriptPrompt, scriptStep, type CombatEvent, type CombatState } from '../src/engine/combat';
import { advance, createExpedition, startBattle } from '../src/engine/expedition';
import { parseFactionConfig } from '../src/engine/faction';
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

const run = (s: CombatState) => {
  const blocks: Extract<CombatEvent, { kind: 'block' }>[] = [];
  const steps: { stage: string | null; tick: number }[] = [];
  for (let g = 0; s.status === 'playing' && g < 1e6; g++) {
    const p = scriptPrompt(s);
    if (p) steps.push({ stage: p.stage, tick: s.tick });
    if (p?.wait === 'ack') scriptAck(s);
    else if (p?.wait === 'guard') scriptStep(s, { type: 'guard' });
    else if (p?.wait === 'use') scriptStep(s, { type: 'use', cell: 0 });
    else if (p?.wait === 'liberate') scriptStep(s, { type: 'liberate' });
    else scriptStep(s);
    for (const e of s.events.splice(0)) if (e.kind === 'block' && e.role === 'attack') blocks.push(e);
  }
  return { blocks, steps };
};

describe('C.562 튜토리얼 각본 블록 = 호로 탄 / 사신 참 (종족 설정, GDD 13절 v6.243)', () => {
  it('종족 설정 값: 호로 tutorial.blockFamily = 탄, 사신 = 참', () => {
    const h = getFaction('hollow');
    const sh = getFaction('shinigami');
    expect(h.families.find((f) => f.id === h.tutorial!.blockFamily)!.abbr).toBe('탄');
    expect(sh.families.find((f) => f.id === sh.tutorial!.blockFamily)!.abbr).toBe('참');
  });

  it('balance 공통 키(C.559) 삭제, BALANCE_VERSION 176 이상', () => {
    expect('blockFamily' in TS).toBe(false);
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(176);
  });

  it('설정 검사: blockFamily 는 그 종족 families 의 id 여야 한다', () => {
    const raw = JSON.parse(readFileSync('src/data/factions/shinigami.json', 'utf8'));
    expect(() => parseFactionConfig(raw)).not.toThrow();
    expect(() => parseFactionConfig({ ...raw, tutorial: { blockFamily: 'family-z' } })).toThrow(/tutorial\.blockFamily/);
  });

  it('엔진: 각본에 넣어 준 계열만 쓴다 (없으면 키 없음 → 옛 규칙)', () => {
    expect(newCombatScript('family-a').blockFamily).toBe('family-a');
    expect('blockFamily' in newCombatScript()).toBe(false);
  });

  for (const fid of ['hollow', 'shinigami']) {
    it(`${fid}: 첫 모험 각본 전투 ④ 1체인·⑧ ${TS.chainLength}체인 = 설정 계열, 각본 단계·처치 그대로`, () => {
      const want = getFaction(fid).tutorial!.blockFamily!;
      const s = tutorialBattle(fid);
      expect(s.script?.blockFamily).toBe(want);
      expect(scriptBlockOf(s).family).toBe(want);
      const { blocks, steps } = run(s);
      expect(s.status).toBe('won');
      expect(blocks.map((b) => [b.family, b.chain])).toEqual([[want, 1], [want, TS.chainLength]]);
      expect(s.finisher?.kind).toBe('skill');
      expect(s.chain3Count).toBe(1);
      expect([...new Set(steps.map((x) => x.stage))]).toEqual(['auto-intro', 'guard-now', 'guard-ok', 'hurt', 'nice', 'lib-now', 'lib-explain', 'chain-use']);
    });
  }

  it('각본 타이밍은 계열과 무관: 호로·사신 단계 틱이 같다(블록 뒤 보여 주기 afterSkillSeconds 포함)', () => {
    const a = run(tutorialBattle('hollow')).steps;
    const b = run(tutorialBattle('shinigami')).steps;
    // 단계마다 처음 멈춘 틱
    const firstTick = (xs: typeof a) => {
      const m = new Map<string | null, number>();
      for (const x of xs) if (!m.has(x.stage)) m.set(x.stage, x.tick);
      return [...m.entries()];
    };
    expect(firstTick(a)).toEqual(firstTick(b));
  });

  it('도움말 다시 보기 체험 전투도 종족 설정 값, 엔진·expedition 에 종족 분기 없음, 기획서 13절', () => {
    const app = readFileSync('src/ui/app.ts', 'utf8');
    expect(app).toMatch(/script: newCombatScript\(faction\.tutorial\?\.blockFamily\)/);
    const exp = readFileSync('src/engine/expedition/expedition.ts', 'utf8');
    expect(exp).toMatch(/newCombatScript\(getFaction\(exp\.factionId\)\.tutorial\?\.blockFamily\)/);
    const src = readFileSync('src/engine/combat/script.ts', 'utf8') + exp;
    expect(src).not.toMatch(/faction(Id)? === '(hollow|shinigami)'/);
    expect(readFileSync('docs/GDD.md', 'utf8')).toMatch(/튜토리얼 각본 전투의 블록 = 호로 탄 \/ 사신 참/);
  });
});
