// C.199 (GDD 123장 5): 첫 원정 첫 전투 각본 — 순서 고정·난수 없음·두 종족
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import {
  playScriptedCombat, scriptAck, scriptPrompt, scriptStep, type CombatEvent, type CombatState, type ScriptStage,
} from '../src/engine/combat';
import { advance, createExpedition, playExpedition, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { guidePending } from '../src/engine/tutorial';
import { absenceOf, newSaveData, nextRunId, recordExpedition, tickIdle } from '../src/game';
import { homeHp, HP_POTION_ID } from '../src/home';
import { CURE_ITEM_ID, recoverCure, recoverFeed, recoverGrantBag, recoverSpa, recoverStep } from '../src/recoverTutorial';

const TS = BALANCE.provisional.tutorialScript;
const TR = BALANCE.provisional.tutorialRecover;

const tutorialBattle = (factionId: string, seed = 7): { exp: ExpeditionState; s: CombatState } => {
  const save = newSaveData(factionId, 1);
  const exp = createExpedition({
    factionId, seed, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition, deck: [], risk: save.nest.risk, stability: save.nest.stability,
    build: save.build, evolution: save.evolution, tutorial: true,
  });
  while (exp.phase === 'moving') advance(exp);
  return { exp, s: startBattle(exp) };
};

/** 기다리는 단계를 만날 때마다 기록하며 끝까지 (사람이 ✓·막기·블록을 누른 것과 같은 순서) */
const runLog = (s: CombatState) => {
  const prompts: ScriptStage[] = [];
  const events: CombatEvent[] = [];
  let last: ScriptStage | null = null;
  let n = 0;
  while (s.status === 'playing' && n++ < 1e5) {
    const p = scriptPrompt(s);
    if (p && p.stage !== last) prompts.push(p.stage);
    last = p?.stage ?? null;
    if (p?.wait === 'ack') scriptAck(s);
    else if (p?.wait === 'guard') scriptStep(s, { type: 'guard' });
    else if (p?.wait === 'use') scriptStep(s, { type: 'use', cell: 0 });
    else scriptStep(s);
    events.push(...s.events.splice(0));
  }
  return { prompts, events };
};

describe('123장 5: 첫 원정 첫 전투 = 각본 전투', () => {
  for (const f of ['hollow', 'shinigami']) {
    it(`${f}: ①자동 ${TS.autoHits}대(설명 없음) → ②강공격·막기 → 막기 성공 → ③${TS.autoHits2}대 → ④못 막는 강공격(죽기 직전)·블록 1개 → 좋아! → ⑤같은 블록 3개 체인 처치 (GDD 157장 2)`, () => {
      const { s } = tutorialBattle(f);
      expect(s.script?.stage).toBe('auto');
      const { prompts, events } = runLog(s);
      expect(prompts).toEqual(['guard-now', 'guard-ok', 'hurt', 'nice', 'chain-use']);
      expect(s.status).toBe('won');
      // 사건 순서: 평타 3 → 예고 → 막기 → 막은 착탄 → 평타 2 → 예고 → 못 막은 착탄 → 블록 1 → 체인 3
      const seq = events.filter((e) => ['player-attack', 'heavy-cast', 'heavy-hit', 'block', 'enemy-attack'].includes(e.kind)).map((e) =>
        e.kind === 'heavy-hit' ? (e.guarded ? 'heavy-guarded' : 'heavy-hit') : e.kind === 'block' ? (e.role === 'guard' ? 'guard' : `block${e.chain}`) : e.kind);
      expect(seq.filter((x) => x !== 'player-attack')).toEqual(['heavy-cast', 'guard', 'heavy-guarded', 'heavy-cast', 'heavy-hit', 'block1', `block${TS.chainLength}`]);
      const at = (k: string) => seq.indexOf(k);
      expect(seq.slice(0, at('heavy-cast')).length).toBe(TS.autoHits); // ② 자동 공격 3대 뒤 예고
      expect(seq.slice(at('heavy-guarded') + 1, seq.lastIndexOf('heavy-cast')).length).toBeGreaterThanOrEqual(TS.autoHits2); // 막아 낸 모습(잠깐 흐름) + 막기 성공 카드 뒤 2대 더 → 예고
      expect(seq).not.toContain('enemy-attack'); // 적 일반 공격 없음
      expect(s.finisher?.kind).toBe('skill');
      expect(s.chain3Count).toBe(1);
      expect(s.guardSuccesses).toBe(1);
      // 죽기 직전 체력 (대략, 빈사 아님): 최대 체력의 leaveHpFraction
      expect(s.player.hp / s.player.maxHp).toBeCloseTo(TS.leaveHpFraction, 2);
      expect(s.player.hp).toBeGreaterThan(0);
    });
  }

  it('난수 없이 결정적: 시드가 달라도 단계·끝 체력·처치 블록이 같다', () => {
    const a = tutorialBattle('hollow', 1).s;
    const b = tutorialBattle('hollow', 999).s;
    const pa: ScriptStage[] = [];
    const pb: ScriptStage[] = [];
    playScriptedCombat(a, (x) => pa.push(x));
    playScriptedCombat(b, (x) => pb.push(x));
    expect(pa).toEqual(pb);
    expect(a.status).toBe('won');
    expect(b.status).toBe('won');
    expect(a.player.hp / a.player.maxHp).toBeCloseTo(b.player.hp / b.player.maxHp, 6);
    expect(a.crits).toBe(0);
  });

  it('기다리는 단계에서는 시간이 흐르지 않고, 기다리는 입력 말고는 받지 않는다', () => {
    const { s } = tutorialBattle('shinigami');
    while (scriptPrompt(s)?.stage !== 'guard-now') {
      if (scriptPrompt(s)?.wait === 'ack') scriptAck(s);
      else scriptStep(s);
    }
    const t1 = s.tick;
    expect(scriptStep(s, { type: 'liberate' })).toEqual([false]);
    expect(scriptStep(s, { type: 'item' })).toEqual([false]);
    expect(s.tick).toBe(t1);
    expect(scriptPrompt(s)?.stage).toBe('guard-now'); // 막기를 해야 진행
    expect(scriptStep(s, { type: 'guard' })).toEqual([true]);
    expect(s.script?.stage).toBe('guard-hold');
    while (scriptPrompt(s)?.stage !== 'guard-ok') scriptStep(s);
    const t2 = s.tick;
    expect(scriptStep(s, { type: 'guard' })).toEqual([false]); // 막기 성공 카드: [다음] 말고는 안 받음
    expect(s.tick).toBe(t2);
  });

  it('157장 2: 강공격 카드는 예고 게이지가 거의 찼을 때, 막기 성공 카드는 막아 낸 뒤, 위기 카드는 블록 1개와 함께', () => {
    for (const f of ['hollow', 'shinigami']) {
      const { s } = tutorialBattle(f);
      while (!scriptPrompt(s)) scriptStep(s);
      expect(scriptPrompt(s)?.stage).toBe('guard-now');
      expect(s.enemy.cast!.ticks).toBeLessThanOrEqual(2);
      expect(s.guardFilled).toBe(true);
      scriptStep(s, { type: 'guard' });
      while (!scriptPrompt(s)) scriptStep(s);
      expect(scriptPrompt(s)?.stage).toBe('guard-ok');
      expect(s.guardSuccesses).toBe(1);
      scriptAck(s);
      while (!scriptPrompt(s)) scriptStep(s);
      expect(scriptPrompt(s)).toEqual({ stage: 'hurt', wait: 'use' });
      expect(s.tray).toHaveLength(1);
      expect(s.player.hp / s.player.maxHp).toBeCloseTo(TS.leaveHpFraction, 2);
      scriptStep(s, { type: 'use', cell: 0 });
      while (!scriptPrompt(s)) scriptStep(s);
      expect(scriptPrompt(s)).toEqual({ stage: 'nice', wait: 'ack' });
      scriptAck(s);
      while (!scriptPrompt(s)) scriptStep(s);
      expect(scriptPrompt(s)).toEqual({ stage: 'chain-use', wait: 'use' });
      expect(s.tray).toHaveLength(TS.chainLength);
    }
  });

  it('⑤ 강공격은 막을 수 없다 (막기 게이지가 0)', () => {
    const { s } = tutorialBattle('hollow');
    let sawHeavy2 = false;
    playScriptedCombat(s, () => undefined);
    // 다시: heavy2 단계 동안 게이지 확인
    const { s: t } = tutorialBattle('hollow');
    let n = 0;
    while (t.status === 'playing' && n++ < 1e5) {
      const p = scriptPrompt(t);
      if (t.script?.stage === 'heavy2') {
        sawHeavy2 = true;
        expect(t.guardGauge).toBe(0);
        expect(scriptStep(t, { type: 'guard' })[0]).toBe(false);
        continue;
      }
      if (p?.wait === 'ack') scriptAck(t);
      else if (p?.wait === 'guard') scriptStep(t, { type: 'guard' });
      else if (p?.wait === 'use') scriptStep(t, { type: 'use', cell: 0 });
      else scriptStep(t);
    }
    expect(sawHeavy2).toBe(true);
    expect(s.status).toBe('won');
  });

  it('튜토리얼이 아닌 원정 전투에는 각본이 없다', () => {
    const save = newSaveData('hollow', 1);
    const exp = createExpedition({ factionId: 'hollow', seed: 3, runId: nextRunId(save), hunger: 80, condition: 100, deck: [], build: save.build, evolution: save.evolution });
    let n = 0;
    while (exp.phase !== 'battle' && exp.phase !== 'ended' && n++ < 500) advance(exp);
    if (exp.phase === 'battle') expect(startBattle(exp).script).toBeUndefined();
    expect(getFaction('hollow').id).toBe('hollow');
  });
});

describe('123장 5 수정(v5.280): 튜토리얼 원정 뒤 회복 안내', () => {
  const afterTutorial = (factionId: string) => {
    const save = newSaveData(factionId, 1000);
    const exp = createExpedition({
      factionId, seed: 5, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition, deck: [], risk: save.nest.risk, stability: save.nest.stability,
      build: save.build, evolution: save.evolution, tutorial: true,
    });
    playExpedition(exp, { returnAfterLap: 1, absorb: 'absorb' });
    recordExpedition(save, exp, 2000);
    return save;
  };
  for (const f of ['hollow', 'shinigami']) {
    it(`${f}: 빈사 복귀 → 구급상자 → 온천 → 먹이 = 배부름·체력 100% → '다음 할 일' 차례`, () => {
      const s = afterTutorial(f);
      expect(s.nest.collapsed).toBe(true);
      expect(recoverStep(s)).toBe('dying');
      expect(guidePending(s.help, 'first-run-room')).toBe(false);
      expect(s.runLog.vitals?.some((v) => v.kind === 'collapse' && v.cause === 'tutorial')).toBe(true);
      const start = BALANCE.provisional.startItems[CURE_ITEM_ID]!; // 시작 구급상자 (GDD 134장 1, C.211) + 안내용 1개 따로
      recoverGrantBag(s);
      recoverGrantBag(s); // 다시 열어도 한 번만
      expect(s.shared.items[CURE_ITEM_ID]).toBe(start + 1);
      expect(s.shared.items[HP_POTION_ID]).toBeUndefined(); // 방 포션 지급·단계 삭제 (C.223, GDD 144장 4)
      expect(recoverCure(s, 3000)).toBe(true);
      expect(s.nest.collapsed).toBe(false);
      expect(s.shared.items[CURE_ITEM_ID]).toBe(start);
      expect(recoverStep(s)).toBe('spa');
      const full0 = 100 - s.nest.hunger;
      expect(recoverSpa(s, 3200)).toBe(true);
      expect(s.nest.spa).toBeNull();
      expect(homeHp(s).fraction).toBeCloseTo(TR.spaTo, 6);
      expect(100 - s.nest.hunger).toBeLessThan(full0); // 온천 = 배부름 줄어듦
      expect(recoverStep(s)).toBe('feed');
      recoverFeed(s, 3300);
      expect(100 - s.nest.hunger).toBe(100);
      expect(homeHp(s).fraction).toBe(1);
      expect(recoverStep(s)).toBeNull();
      expect(s.help.guides.recover).toBe('done');
      expect(guidePending(s.help, 'first-run-room')).toBe(true);
    });
  }

  it('회복 안내 중에는 빈사 사망 시계가 흐르지 않는다 (꺼 둔 동안·켜 둔 동안)', () => {
    const s = afterTutorial('hollow');
    const later = 2000 + 400 * 3_600_000;
    absenceOf(s, later);
    expect(s.nest.dead).toBe(false);
    expect(s.nest.collapsed).toBe(true);
    tickIdle(s, later + 300 * 3_600_000);
    expect(s.nest.dead).toBe(false);
  });

  it('세이브 왕복 뒤에도 같은 단계부터 (진행은 세이브 값에서 읽는다)', () => {
    const s = afterTutorial('shinigami');
    recoverCure(s, 3000);
    const back = JSON.parse(JSON.stringify(s));
    expect(recoverStep(back)).toBe('spa') // 포션 단계 삭제 (C.223);
  });
});
