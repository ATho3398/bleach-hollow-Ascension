// C.473 (GDD v6.102 12-4·15-6): 최후의 월아천충 연출(무적·적 정지·무월 인형 skill 동작·자막 2줄·피해 = 동작 타격 시각) ·
// 해방 중 만해 오라 없음 · 패배 = 쓰러짐 한 번 → 쓰러짐 숨(downIdle) 반복 · 합성음(낮은 울림·베기음).
// 엔진은 장치(kit.mastery.cine)만 본다 — 초월자 id 분기 없음.
import './helpers/rigMotions'; // 종이인형 동작 데이터 채우기 (C.509 — 게임에선 따로 받는 덩어리)
import { describe, expect, it } from 'vitest';
import { getEnemy } from '../src/data/enemies';
import { TRANSCENDENTS } from '../src/data/transcendents';
import {
  applyInput, createCombat, drainCombatEvents, halted, kitCineOn, kitSecondOn, KIT_TRAIT_PREFIX, liberationActive, step, type CombatEvent, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { buildCombatParams } from '../src/engine/absorb/build';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { testGrantTranscendent } from '../src/engine/testMode';
import { newSaveData } from '../src/game';
import { rigPack, type Motion } from '../src/data/art/rig/pose';
import { createRigPlayer, RIG_HOLD_THEN } from '../src/ui/bha/rigAnim';
import { cineCaptionAt } from '../src/ui/bha/finisherCine';
import { BANKAI_AURA, bankaiAuraPhase, bankaiAuraSheetName } from '../src/ui/bha/bankaiAura';
import { cueOf } from '../src/ui/fx';
import mugetsuDraft from '../docs/design/rig-draft/mugetsu-motions.json';

const normal = getEnemy('test-a');
const CINE = TRANSCENDENTS.find((x) => x.id === 'ichigo')!.kit!.mastery!.finisherCine!;

function ichigoParams(): Partial<CombatParams> {
  const s = newSaveData('shinigami', 1000);
  expect(testGrantTranscendent(s, 'ichigo', 2000)).toBe('added');
  const p: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
  applyEvolutionToParams(p, s.evolution, s.factionId, 0, false);
  return p;
}
/** 무월 중 최후의 월아천충 직전 (스택 가득), 적은 죽지 않고 조용히 */
function readyFinal(): CombatState {
  const s = createCombat(7, { enemy: normal, params: ichigoParams() });
  s.spawnTimer = 1e9;
  s.enemy.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.params.timeLimitSeconds = 1e9;
  s.params.critChance = 0;
  s.params.critChanceMax = 0;
  s.enemy.hp = 1e12;
  s.kit!.risk = 0;
  s.kit!.mastery = s.params.kit!.mastery!.full;
  expect(applyInput(s, { type: 'liberate' })).toBe(true);
  expect(kitSecondOn(s)).toBe(true);
  s.tray = [];
  s.kit!.finalStack = s.params.kit!.mastery!.stacks;
  drainCombatEvents(s);
  return s;
}
const ticks = (s: CombatState, sec: number) => Math.ceil(sec / s.params.tickSeconds - 1e-6);

describe('데이터 = 종이인형 작업본 동작과 같은 시각 (kit.mastery.finisherCine)', () => {
  it('동작 skill: 길이 4.1초 · 타격 3.08초 · 자막 2줄(0.15초 \'…월아가 되는 것이다.\' → 2.9초 \'무월—\') — 작업본·게임 동작 파일과 같다', () => {
    const draft = (mugetsuDraft as unknown as Record<string, Motion & { captions: [number, string][] }>).skill!;
    const game = rigPack('mugetsu').motions.skill as Motion & { captions?: [number, string][] };
    for (const m of [draft, game]) {
      expect(m.duration).toBe(CINE.seconds * 1000);
      expect(m.hit).toBe(CINE.hitSeconds * 1000);
      expect(m.captions).toEqual(CINE.captions.map(([at, text]) => [Math.round(at * 1000), text]));
    }
    expect(CINE.motion).toBe('skill');
    expect(CINE.captions[0]![1]).toBe('최후의 월아천충은, 나 자신이 월아가 되는 것이다.');
    expect(CINE.captions[1]![1]).toBe('무월—');
    // '무월—' 은 첫 자막 뒤 약 0.5초 쉼 다음 (첫 줄이 다 읽히고 나서), 내려 베기는 '무월—' 바로 뒤
    expect(CINE.hitSeconds - CINE.captions[1]![0]).toBeCloseTo(0.18, 2);
    // 제 속도 (무월 인형 motionSpeed 1.5 배속에서 뺌) · 쓰러짐 숨도
    expect(rigPack('mugetsu').rig.motionSpeedExcept).toEqual(expect.arrayContaining(['skill', 'downIdle']));
  });
});

describe('최후의 월아천충 연출 (엔진)', () => {
  it('쏘는 순간 연출 시작 → 피해는 동작 타격 시각(3.08초)에, 기존 수치 그대로', () => {
    const s = readyFinal();
    const t0 = s.tick;
    s.player.attackTimer = 1;
    step(s);
    const ev0 = drainCombatEvents(s);
    expect(ev0.find((e) => e.kind === 'kit-cine')).toMatchObject({ seconds: CINE.seconds, hitSeconds: CINE.hitSeconds });
    const sw = ev0.find((e): e is Extract<CombatEvent, { kind: 'swing' }> => e.kind === 'swing');
    expect(sw?.hit).toMatchObject({ kind: 'player-attack', kitShot: '최후의 월아천충', kitFinisher: true, kitMotion: 'skill' });
    expect(kitCineOn(s)).toBe(true);
    expect(s.kit!.cine).toEqual({ start: t0 + 1, hit: t0 + 1 + ticks(s, CINE.hitSeconds), end: t0 + 1 + ticks(s, CINE.seconds) });
    // 자막과 대사 띠 '최후의 월아천충!' 은 겹치지 않는다 (연출이 있으면 자막이 대신)
    expect(ev0.some((e) => e.kind === 'kit-line')).toBe(false);
    const hp0 = s.enemy.hp;
    let landedAt = -1;
    let dmg = 0;
    for (let i = 0; i < 100 && landedAt < 0; i++) {
      step(s);
      const hit = drainCombatEvents(s).find((e): e is Extract<CombatEvent, { kind: 'player-attack' }> => e.kind === 'player-attack' && !!e.landed);
      if (hit) { landedAt = s.tick; dmg = hit.damage; }
    }
    expect(landedAt).toBe(s.kit!.cine!.hit);
    expect(hp0 - s.enemy.hp).toBeCloseTo(dmg, 6);
    expect((sw!.hit as { damage: number }).damage).toBeCloseTo(dmg, 6);
  });

  it('연출 동안 무적(받는 피해 0)·적 정지·내 평타·블록 생성·블록 사용 멈춤, 끝나면 무월이 풀리고 호로화 100', () => {
    const s = readyFinal();
    // 이미 날아오던 적 공격 하나 + 연출 중 적 타이머가 다 된 상태
    s.player.attackTimer = 1;
    step(s);
    drainCombatEvents(s);
    const hp = s.player.hp;
    s.enemy.attackTimer = 1;
    s.enemy.actionTimer = 1;
    s.spawnTimer = 1;
    s.pendingHits = [...(s.pendingHits ?? []), { target: 'player', amount: 999, atTick: s.tick + 1, event: { kind: 'enemy-attack', damage: 999, guarded: false, matchup: 'neutral' } } as never];
    expect(halted(s)).toBe(true);
    s.tray = [{ uid: s.nextUid++, kind: 'skill', traitId: KIT_TRAIT_PREFIX + 'getsuga', family: null, element: null }];
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(false);
    const evs: CombatEvent[] = [];
    const taken0 = s.damageTaken ?? 0;
    let minHp = hp;
    let frozen = true;
    while (s.kit!.cine) {
      step(s);
      evs.push(...drainCombatEvents(s));
      if (s.kit!.cine) {
        minHp = Math.min(minHp, s.player.hp);
        frozen &&= s.enemy.attackTimer === 1 && s.enemy.actionTimer === 1 && s.spawnTimer === 1 && s.tray.length === 1;
      }
    }
    expect(minHp).toBe(hp); // 연출 동안 체력 그대로 (끝나면 만해 최대 체력이 원래로 — 그 깎임은 피해가 아님)
    expect(s.damageTaken ?? 0).toBe(taken0);
    expect(evs.filter((e) => e.kind === 'enemy-attack' && e.landed).every((e) => (e as { damage: number }).damage === 0)).toBe(true);
    expect(evs.filter((e) => e.kind === 'swing' && e.hit.kind === 'enemy-attack').length).toBeLessThanOrEqual(1); // 새 적 공격은 연출이 끝난 틱에야
    expect(evs.filter((e) => e.kind === 'player-attack' && e.landed)).toHaveLength(1); // 내 평타는 최후의 월아천충 한 번뿐
    expect(frozen).toBe(true); // 연출 동안 적 타이머·블록 생성이 멈춰 있었다 (블록 사용도 막힘)
    // 끝: 무월 풀림 · 호로화 100 · 무월수련 0
    expect(liberationActive(s)).toBe(false);
    expect(kitSecondOn(s)).toBe(false);
    expect(s.kit!.risk).toBe(100);
    expect(s.kit!.mastery).toBe(0);
    expect(evs.some((e) => e.kind === 'liberation-end')).toBe(true);
    // 연출이 끝난 틱부터 적이 다시 움직인다
    expect(s.enemy.attackTimer).not.toBe(1);
    // 다시 무월수련을 채우면 또 무월 (한 전투에 여러 번)
    s.kit!.risk = 0;
    s.kit!.mastery = s.params.kit!.mastery!.full;
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    expect(kitSecondOn(s)).toBe(true);
  });

  it('피해로 적이 쓰러져도 호로화 100 · 무월수련 0 (원정이 받는 끝 값)', () => {
    const s = readyFinal();
    s.enemy.hp = 1;
    s.player.attackTimer = 1;
    for (let i = 0; i < 100 && s.status === 'playing'; i++) step(s);
    expect(s.status).toBe('won');
    expect(s.kit!.risk).toBe(100);
    expect(s.kit!.mastery).toBe(0);
    expect(s.kit!.finals).toBe(1);
  });

  it('연출 데이터가 없는 kit 은 옛 동작 그대로 (바로 풀림, 대사 띠)', () => {
    const s = readyFinal();
    delete s.params.kit!.mastery!.cine;
    s.player.attackTimer = 1;
    step(s);
    const ev = drainCombatEvents(s);
    expect(ev.some((e) => e.kind === 'kit-cine')).toBe(false);
    expect(ev.find((e) => e.kind === 'kit-line')).toMatchObject({ text: '최후의 월아천충!', tone: 'finisher' });
    expect(kitSecondOn(s)).toBe(false);
    expect(kitCineOn(s)).toBe(false);
  });
});

describe('자막 순서 (화면)', () => {
  it('첫 자막 전엔 없음 → 0.15초 첫 줄(다음 자막까지 2.75초) → 2.9초 \'무월—\'(연출 끝까지 1.2초)', () => {
    const at = (sec: number) => cineCaptionAt(CINE.captions, CINE.seconds, sec);
    expect(at(0)).toBeNull();
    expect(at(0.15)).toEqual({ index: 0, text: CINE.captions[0]![1], holdMs: 2750 });
    expect(at(2.5)?.index).toBe(0);
    expect(at(2.9)).toEqual({ index: 1, text: '무월—', holdMs: 1200 });
    expect(at(4.0)?.index).toBe(1);
  });
});

describe('사운드 (합성음 — 추천안)', () => {
  it('연출 시작 = 낮은 울림, 최후의 월아천충이 닿는 순간 = 베기음. 평범한 평타는 소리 없음', () => {
    expect(cueOf({ kind: 'kit-cine', seconds: 4.1, hitSeconds: 3.08 }, 3)).toBe('rumble');
    expect(cueOf({ kind: 'player-attack', damage: 10, matchup: 'neutral', kitShot: '최후의 월아천충', kitFinisher: true, landed: true }, 3)).toBe('slash');
    expect(cueOf({ kind: 'player-attack', damage: 10, matchup: 'neutral', kitShot: '최후의 월아천충', kitFinisher: true }, 3)).toBeNull();
    expect(cueOf({ kind: 'player-attack', damage: 10, matchup: 'neutral', landed: true }, 3)).toBeNull();
  });
});

describe('해방 중 만해 오라 없음 (GDD 15-6 v6.102)', () => {
  it('해방 가능 = 오라 시트, 해방 중 = 단계는 active 지만 시트 없음(모든 속성)', () => {
    expect(bankaiAuraPhase(true, true, false)).toBe('ready');
    expect(bankaiAuraPhase(true, false, true)).toBe('active');
    expect(BANKAI_AURA.active).toBeNull();
    for (const el of BANKAI_AURA.elements) {
      expect(bankaiAuraSheetName('ready', el)).toBe(`custom-bankai-aura-${el}`);
      expect(bankaiAuraSheetName('active', el)).toBeNull();
    }
  });
});

describe('패배 = 쓰러짐 한 번 → 쓰러짐 숨 반복 (115-A 167)', () => {
  const pack = rigPack('mugetsu');
  it('무월 인형: lose → down(끝 자세) → downIdle 이 끝나지 않고 돈다', () => {
    expect(RIG_HOLD_THEN.down).toBe('downIdle');
    const down = pack.motions.down!;
    const idle = pack.motions.downIdle!;
    expect(down.hold).toBe(true);
    expect(idle.loop).toBe(true);
    const p = createRigPlayer(pack.rig, pack.motions);
    let ended = 0;
    p.play('lose', { onEnd: () => ended++ });
    expect(p.pose().motion).toBe(down);
    p.advance(down.duration + 10);
    expect(ended).toBe(1);
    expect(p.pose().motion).toBe(idle);
    expect(p.playing).toBe('lose');
    const t1 = p.pose().t;
    p.advance(idle.duration * 3 + 7);
    expect(p.pose().motion).toBe(idle); // 계속 숨
    expect(p.pose().t).toBeGreaterThan(t1);
    // 패배 중엔 늦게 온 '맞음' 이 덮지 않는다
    p.play('hit');
    expect(p.pose().motion).toBe(idle);
    p.stop();
    expect(p.playing).not.toBe('lose');
  });
  it('쓰러짐 숨이 없는 몸은 쓰러짐 끝 자세에서 멈춤 그대로', () => {
    const { downIdle: _drop, ...rest } = pack.motions;
    const p = createRigPlayer(pack.rig, rest as Record<string, Motion>);
    p.play('lose');
    p.advance(pack.motions.down!.duration + 500);
    expect(p.pose().motion).toBe(pack.motions.down);
    expect(p.pose().t).toBe(pack.motions.down!.duration);
  });
});
