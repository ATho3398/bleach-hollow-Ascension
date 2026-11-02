// C.222 (GDD 146장): 튜토리얼 마무리 체인 = 동작 → 스킬 연출이 닿음 → 그 순간 피해 → 쓰러짐
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { HUMANOID, MOTION_SETS, MOTIONS, resolveMotions } from '../src/data/art/rig/pose';
import { scriptAck, scriptLand, scriptPrompt, scriptStep, type CombatEvent, type CombatState } from '../src/engine/combat';
import { advance, createExpedition, startBattle } from '../src/engine/expedition';
import { newSaveData, nextRunId } from '../src/game';
import { AttackQueue, castPlan, landAtMs, lungePlan, type AttackCue } from '../src/ui/attackFx';
import { ATTACK_FX, FAMILY_MOTION, FAMILY_STAGE_FX } from '../src/ui/attackFxConfig';

const TS = BALANCE.provisional.tutorialScript;

const tutorialBattle = (factionId: string): CombatState => {
  const save = newSaveData(factionId, 1);
  const exp = createExpedition({
    factionId, seed: 7, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition, deck: [], risk: save.nest.risk, stability: save.nest.stability,
    build: save.build, evolution: save.evolution, tutorial: true,
  });
  while (exp.phase === 'moving') advance(exp);
  return startBattle(exp);
};

/** 마무리 체인을 쓰기 직전(chain-use 를 기다리는 때)까지 */
const toChainUse = (s: CombatState): void => {
  let n = 0;
  while (s.status === 'playing' && n++ < 1e5) {
    const p = scriptPrompt(s);
    if (p?.stage === 'chain-use') break;
    if (p?.wait === 'ack') scriptAck(s);
    else if (p?.wait === 'guard') scriptStep(s, { type: 'guard' });
    else if (p?.wait === 'use') scriptStep(s, { type: 'use', cell: 0 });
    else scriptStep(s);
  }
  s.events.splice(0);
};

describe('146장: 튜토리얼 3체인은 연출이 닿는 순간 피해', () => {
  for (const f of ['hollow', 'shinigami']) {
    it(`${f}: 쓰는 순간에는 체력 그대로 → 화면이 착탄을 알리면 피해 → 쓰러짐`, () => {
      const s = tutorialBattle(f);
      toChainUse(s);
      const hp0 = s.enemy.hp;
      expect(scriptStep(s, { type: 'use', cell: 0 })).toEqual([true]);
      expect(s.script?.stage).toBe('chain-hit');
      expect(s.enemy.hp).toBe(hp0); // ① 동작 중: 적 체력 그대로
      const used = s.events.splice(0);
      const block = used.find((e): e is Extract<CombatEvent, { kind: 'block' }> => e.kind === 'block')!;
      expect(block.chain).toBe(TS.chainLength);
      expect(used.some((e) => e.kind === 'end')).toBe(false);
      // 연출이 날아가는 동안 몇 틱 흘러도 피해·기본 공격·쓰러짐 없음
      for (let i = 0; i < 5; i++) scriptStep(s);
      expect(s.enemy.hp).toBe(hp0);
      expect(s.status).toBe('playing');
      expect(s.events.some((e) => e.kind === 'player-attack' || e.kind === 'end')).toBe(false);
      // ② 닿는 순간: 피해 숫자(script-impact) → ③ 쓰러짐(end)
      expect(scriptLand(s)).toBe(true);
      const kinds = s.events.map((e) => e.kind);
      expect(kinds.indexOf('script-impact')).toBeGreaterThanOrEqual(0);
      expect(kinds.indexOf('end')).toBeGreaterThan(kinds.indexOf('script-impact'));
      const impact = s.events.find((e): e is Extract<CombatEvent, { kind: 'script-impact' }> => e.kind === 'script-impact')!;
      expect(impact.damage).toBeCloseTo(block.damage);
      expect(s.status).toBe('won');
      expect(s.finisher?.kind).toBe('skill');
      expect(scriptLand(s)).toBe(false); // 두 번은 안 들어간다
    });

    it(`${f}: 화면이 알리지 않으면(헤드리스) chainHitMaxSeconds 뒤에 들어간다`, () => {
      const s = tutorialBattle(f);
      toChainUse(s);
      scriptStep(s, { type: 'use', cell: 0 });
      const ticks = Math.max(1, Math.round(TS.chainHitMaxSeconds / s.params.tickSeconds));
      for (let i = 0; i < ticks - 1; i++) scriptStep(s);
      expect(s.status).toBe('playing');
      scriptStep(s);
      expect(s.status).toBe('won');
    });
  }
});

describe('146장: 연출 도달 시점 ≤ 피해 시점', () => {
  const stage = FAMILY_STAGE_FX.length; // 3체인 = 3단계
  it('닿는 순간은 동작이 닿는 때(hitAtMs) 이후 — 마지막 타격', () => {
    for (const hit of [0, 205, 800]) {
      expect(landAtMs(hit, stage)).toBeGreaterThanOrEqual(hit);
      expect(landAtMs(hit, null)).toBe(hit);
    }
  });
  it('가장 긴 동작(종이인형·돌진·발사)의 마지막 타격도 착탄 최대 대기 안 (헤드리스 대기가 연출을 끊지 않는다)', () => {
    const lands: number[] = [];
    const bodies = [undefined, ...Object.keys(HUMANOID.bodyMotions ?? {})];
    for (const body of bodies) {
      const ms = resolveMotions(HUMANOID, MOTIONS, MOTION_SETS, body);
      for (const m of Object.values(ms)) if (m.hit !== undefined) lands.push(landAtMs(m.hit, stage));
    }
    const lv = ATTACK_FX.chain3;
    for (const fm of Object.values(FAMILY_MOTION)) {
      const plan = fm.move === 'cast' ? castPlan(lv, -1, fm.travelMs) : lungePlan(lv, -1, 100);
      lands.push(landAtMs(plan.hitAtMs, stage));
    }
    expect(lands.length).toBeGreaterThan(0);
    expect(Math.max(...lands)).toBeLessThanOrEqual(TS.chainHitMaxSeconds * 1000);
  });
  it('마무리 체인 연출(windup)은 재생 중인 연출을 기다리지 않는다', () => {
    const started: AttackCue[] = [];
    const q = new AttackQueue((cue) => void started.push(cue));
    q.push({ side: 'player', tier: 'chain1', guarded: false, instant: true });
    expect(q.push({ side: 'player', tier: 'chain3', guarded: false, instant: true, windup: true })).toBe('started');
    expect(started.at(-1)?.windup).toBe(true);
  });
});
