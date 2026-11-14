// C.454 (GDD v6.069 12-4): 이치고 기본 모드 — 호로화 = 리스크 게이지(모험 출발·보스전 100, 깎이기만) · 참월(월아천충 블록 → 다음 평타 충전, 체인별 −10/15/19·+12/18/23) ·
// 각호고(만해, 블록은 안 깎고 월아천충 평타마다 −20, 0 이면 풀림) · 무월수련(평타 +2·블록 +4) · 무월(10스택 → 최후의 월아천충 ×8 + 남은 블록당 ×1.0) → 호로화 100.
// 엔진은 장치(riskDrain·mastery·chargeShot·chainRiskCost·chainGauge)만 본다 — 초월자 id 분기 없음.
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { BOSSES } from '../src/data/bosses';
import { TRANSCENDENTS } from '../src/data/transcendents';
import {
  applyInput, buildBattleRecord, canLiberate, createCombat, drainCombatEvents, kitBasicShot, kitBlockOf, kitMasteryOn, kitRiskOf, kitSecondOn, KIT_TRAIT_PREFIX,
  liberationActive, spawnTableOf, step, ticksOf, blockMotionBusy, type CombatEvent, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { buildCombatParams } from '../src/engine/absorb/build';
import { changeRisk } from '../src/engine/absorb/risk';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { kitRiskDrainOf } from '../src/engine/transcendKit';
import { testGrantTranscendent } from '../src/engine/testMode';
import { advance, createExpedition, finishBattle, startBattle } from '../src/engine/expedition/expedition';
import { migrateSave, newSaveData, SAVE_FORMAT_VERSION, type SaveData } from '../src/game';
import { useImmediateHits } from './helpers/hitDelay';

useImmediateHits();

const K = BALANCE.provisional.transcendentKits.ichigo!;
const RD = K.riskDrain!;
const normal = getEnemy('test-a');
const id = (b: string) => KIT_TRAIT_PREFIX + b;
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];

function ichigoSave(): SaveData {
  const s = newSaveData('shinigami', 1000);
  expect(testGrantTranscendent(s, 'ichigo', 2000)).toBe('added');
  return s;
}
function ichigoParams(): Partial<CombatParams> {
  const s = ichigoSave();
  const p: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
  applyEvolutionToParams(p, s.evolution, s.factionId, 0, false);
  return p;
}
/** 조용한 전투 (생성·적 공격·내 평타 멈춤, 치명 없음, 적 체력 무한) */
const mk = (params: Partial<CombatParams> = ichigoParams()): CombatState => {
  const s = createCombat(1, { enemy: normal, params });
  s.spawnTimer = 1e9;
  s.enemy.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.params.timeLimitSeconds = 1e9;
  s.params.critChance = 0;
  s.params.critChanceMax = 0;
  s.enemy.hp = 1e12;
  return s;
};
const getsuga = (s: CombatState) => ({ uid: s.nextUid++, kind: 'skill' as const, traitId: id('getsuga'), family: null, element: null });
/** 블록 n개(체인 n)를 한 번에 쓴다 */
function use(s: CombatState, n: number): void {
  s.tray = Array.from({ length: n }, () => getsuga(s));
  expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
  expect(s.tray.length).toBe(0);
}
/** 평타 한 대가 나갈 때까지 틱을 돌리고 그 평타 사건을 돌려준다 */
function swing(s: CombatState): Extract<CombatEvent, { kind: 'player-attack' }> {
  drainCombatEvents(s);
  for (let i = 0; i < 400; i++) {
    s.player.attackTimer = 1;
    step(s);
    const ev = drainCombatEvents(s).find((e): e is Extract<CombatEvent, { kind: 'player-attack' }> => e.kind === 'player-attack');
    if (ev) {
      s.player.attackTimer = 1e9;
      return ev;
    }
  }
  throw new Error('평타가 안 나감');
}

describe('데이터·수치 (provisional)', () => {
  it('이치고 kit = 월아천충 블록 하나 · 각호고 · 호로화 · 무월수련/무월/최후의 월아천충 · 모드 자리(기본만)', () => {
    const t = TRANSCENDENTS.find((x) => x.id === 'ichigo')!;
    expect(t.kit?.blocks.map((b) => [b.id, b.short, b.chargeShot, b.noMotion])).toEqual([['getsuga', '월', true, true]]); // C.455: 몸동작 없음 = 데이터 표시
    expect(t.kit?.liberationName).toBe('각호고');
    expect(t.kit?.riskGaugeName).toBe('호로화');
    expect(t.kit?.mastery).toEqual({ gaugeName: '무월수련', releaseName: '무월', finisherName: '최후의 월아천충' });
    expect(t.kit?.modes?.map((m) => m.id)).toEqual(['basic']); // 천년혈전 [미정]
    // GDD v6.070~v6.074 추천안
    expect(K.blocks.getsuga).toMatchObject({ chargeShot: 2.0, chainRiskCost: [5, 8, 10], chainGauge: [6, 9, 11] });
    expect(RD).toEqual({ shotCost: 5, tickSeconds: 1, tickCost: 4, mastery: { perBasic: 2, perBlock: 4, full: 100, damageMult: 1.5 }, final: { stacks: 10, power: 30, perBlock: 4 }, bonusBlockEvery: 5 });
    expect(kitRiskDrainOf('ichigo')).toBe(true);
    expect(kitRiskDrainOf('aizen')).toBe(false);
  });
  it('출현표 = 월아천충만 (공허 블록 없음), 전투 시작 호로화 100', () => {
    const s = mk();
    s.params.voidChance = 0.3;
    const t = spawnTableOf(s.params, false, kitRiskOf(s));
    expect(t.entries.map((e) => e.source?.id ?? e.kind)).toEqual([id('getsuga')]);
    expect(t.entries[0]!.chance).toBeCloseTo(1, 9);
    expect(kitRiskOf(s)).toBe(100);
    expect(s.params.kit?.riskDrain).toEqual({ limit: BALANCE.provisional.risk.limit, shotCost: 5, tickSeconds: 1, tickCost: 4 });
    expect(s.params.kit?.bonusBlockEvery).toBe(5);
  });
});

describe('참월', () => {
  it('체인 1·2·3 = 호로화 −5/−8/−10 · 만해 게이지 +6/+9/+11 · 충전 = 쓴 블록 수 · 블록 자체 피해 없음 · 몸동작 없음', () => {
    for (const [n, cost, gain] of [[1, 5, 6], [2, 8, 9], [3, 10, 11]] as const) {
      const s = mk();
      const g0 = s.liberation.gauge;
      const hp0 = s.enemy.hp;
      use(s, n);
      expect(kitRiskOf(s)).toBe(100 - cost);
      expect(s.liberation.gauge).toBe(g0 + gain);
      expect(s.kit!.charges).toBe(n);
      expect(s.enemy.hp).toBe(hp0);
      expect(drainCombatEvents(s).find((e) => e.kind === 'block')).toMatchObject({ kitName: '월아천충', kitCharge: n, damage: 0, chain: n });
      expect(blockMotionBusy(s)).toBe(false); // v6.073: 평타가 안 멈춘다
    }
  });
  it('충전 평타 = 월아천충(기본 공격 ×2.0), 충전이 다 떨어지면 보통 평타', () => {
    const s = mk();
    const plain = swing(s);
    expect(plain.kitShot).toBeUndefined();
    use(s, 2);
    const a = swing(s);
    expect(a.kitShot).toBe('월아천충');
    expect(a.damage).toBeCloseTo(plain.damage * 2, 6);
    expect(s.kit!.charges).toBe(1);
    expect(swing(s).kitShot).toBe('월아천충');
    expect(swing(s).kitShot).toBeUndefined();
    expect(kitRiskOf(s)).toBe(92); // 각호고 밖 평타는 호로화를 안 깎는다
  });
  it('평타 5대마다 월아천충 블록 1개 추가 (생성 타이머와 무관)', () => {
    const s = mk();
    for (let i = 0; i < 4; i++) swing(s);
    expect(s.tray.length).toBe(0);
    swing(s);
    expect(s.tray.map((b) => b.traitId)).toEqual([id('getsuga')]);
    for (let i = 0; i < 5; i++) swing(s);
    expect(s.tray.length).toBe(2);
  });
});

describe('순환 전체: 참월 → 각호고 → 무월수련 → 무월 → 최후의 월아천충 → 호로화 100', () => {
  it('한 전투에서 한 바퀴', () => {
    const s = mk();
    s.params.kit = { ...s.params.kit!, bonusBlockEvery: 0 }; // 바를 직접 보는 시험이라 추가 생성은 끈다(위 시험이 따로 본다)
    const atk0 = s.player.stats.atk;
    const plain0 = swing(s).damage;
    // ── 참월: 1블록 연타로 만해 게이지를 채운다 (40 + 6 × 10 = 100), 호로화 100 − 5 × 10 = 50
    expect(s.params.liberationEnabled).toBe(true);
    s.liberation.gauge = 40;
    for (let i = 0; i < 10; i++) use(s, 1);
    expect(s.liberation.gauge).toBe(100);
    expect(kitRiskOf(s)).toBe(50);
    expect(canLiberate(s)).toBe(true);
    // ── 각호고: 만해 수치, 지속 시간 없음, 1초마다 −4, 블록은 호로화를 안 깎고 월아천충 평타마다 −5
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    s.tray = []; // 해방 순간 지급 블록은 비운다
    expect(liberationActive(s)).toBe(true);
    expect(s.liberation.endless).toBe(true);
    expect(s.player.stats.atk).toBeCloseTo(atk0 * s.params.liberationStatMultiplier, 6);
    for (let i = 0; i < ticksOf(s.params, 1); i++) step(s);
    expect(kitRiskOf(s)).toBe(46);
    for (let i = 0; i < ticksOf(s.params, 2); i++) step(s);
    expect(kitRiskOf(s)).toBe(38);
    expect(liberationActive(s)).toBe(true);
    s.kit!.drainTimer = 1e9; // 아래는 평타 몫만 본다
    use(s, 3);
    expect(kitRiskOf(s)).toBe(38);
    expect(s.kit!.charges).toBe(13); // 참월 10 + 3
    s.kit!.risk = 10;
    s.kit!.charges = 2;
    expect(swing(s).kitShot).toBe('월아천충');
    expect(kitRiskOf(s)).toBe(5);
    expect(liberationActive(s)).toBe(true);
    expect(swing(s).kitShot).toBe('월아천충');
    // ── 호로화 0 → 각호고 풀림 · 무월수련 시작 (0 으로 만든 평타는 수련에 안 침)
    expect(kitRiskOf(s)).toBe(0);
    expect(liberationActive(s)).toBe(false);
    expect(s.player.stats.atk).toBeCloseTo(atk0, 6);
    expect(kitMasteryOn(s)).toBe(true);
    expect(s.kit!.mastery).toBe(0);
    expect(canLiberate(s)).toBe(false);
    // ── 무월수련: 평타 +2 · 블록 1개당 +4 · 주는 피해 ×1.5 (호로화는 0 그대로)
    expect(swing(s).damage).toBeCloseTo(plain0 * 1.5, 6);
    expect(s.kit!.mastery).toBe(2);
    use(s, 3);
    expect(s.kit!.mastery).toBe(14);
    expect(kitRiskOf(s)).toBe(0);
    s.kit!.charges = 0;
    for (let i = 0; i < 21; i++) use(s, 1); // 14 + 84 = 98
    expect(s.kit!.mastery).toBe(98);
    s.kit!.charges = 0;
    swing(s);
    expect(s.kit!.mastery).toBe(100);
    expect(canLiberate(s)).toBe(true);
    // ── 무월: 수동 해방, 만해 수치, 평타 1대마다 스택 +1 (월아천충 평타 포함), 수련 피해 ×1.5 는 끝
    drainCombatEvents(s);
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    expect(drainCombatEvents(s).find((e) => e.kind === 'liberate')).toMatchObject({ endless: true, name: '무월' });
    s.tray = [];
    expect(kitSecondOn(s)).toBe(true);
    expect(s.player.stats.atk).toBeCloseTo(atk0 * s.params.liberationStatMultiplier, 6);
    use(s, 1); // 무월 중에도 월아천충 블록을 쓸 수 있다
    expect(s.kit!.charges).toBe(1);
    const shot = swing(s);
    expect(shot.kitShot).toBe('월아천충');
    expect(s.kit!.finalStack).toBe(1);
    let plain = 0;
    for (let i = 0; i < 9; i++) plain = swing(s).damage;
    expect(s.kit!.finalStack).toBe(10);
    expect(kitRiskOf(s)).toBe(0);
    for (let i = 0; i < 400; i++) step(s); // 무월은 시간으로 안 깎이고 안 풀린다
    expect(kitSecondOn(s)).toBe(true);
    // ── 최후의 월아천충: 기본 공격 × (30 + 바의 월아천충 3개 × 4), 그 블록 소모 → 무월 풀림 · 호로화 100 · 무월수련 0
    s.tray = [getsuga(s), getsuga(s), getsuga(s)];
    expect(kitBasicShot(s)).toEqual({ power: 42, name: '최후의 월아천충', final: true });
    const fin = swing(s);
    expect(fin).toMatchObject({ kitShot: '최후의 월아천충', kitFinisher: true });
    expect(fin.damage).toBeCloseTo(plain * 42, 6);
    expect(s.tray.length).toBe(0);
    expect(liberationActive(s)).toBe(false);
    expect(kitSecondOn(s)).toBe(false);
    expect(kitRiskOf(s)).toBe(100);
    expect(s.kit!.mastery).toBe(0);
    expect(s.player.stats.atk).toBeCloseTo(atk0, 6);
    // ── 런 로그: 각호고 진입 1 · 무월 진입 1 · 최후의 월아천충 1
    s.status = 'won';
    expect(buildBattleRecord(s, { factionId: 'shinigami', runId: 1, lap: 1, tierIndex: 0 }).kit).toMatchObject({ id: 'ichigo', modeEnters: 1, modeExits: 1, secondEnters: 1, finals: 1 });
  });
  it('참월에서 블록으로 호로화를 다 써도 무월수련으로 바뀐다', () => {
    const s = mk();
    s.kit!.risk = 8;
    use(s, 2);
    expect(kitRiskOf(s)).toBe(0);
    expect(kitMasteryOn(s)).toBe(true);
    expect(s.kit!.mastery).toBe(0);
    use(s, 1);
    expect(s.kit!.mastery).toBe(4);
  });
  it('각호고를 블록 없이 버텨도 시간으로 풀린다 (호로화 30 → 1초마다 −4 → 약 7.5초)', () => {
    const s = mk();
    s.kit!.risk = 30;
    s.liberation.gauge = 100;
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    let n = 0;
    while (liberationActive(s) && n < 2000) { step(s); n++; }
    expect(liberationActive(s)).toBe(false);
    expect(kitRiskOf(s)).toBe(0);
    expect(n * s.params.tickSeconds).toBeCloseTo(8, 1);
  });
});

describe('시간 검증 (C.455 — 블록 초당 약 0.7개, 평타 0.7초, 1블록씩)', () => {
  /** sec 초 동안 블록이 1/0.7초마다 하나 나와 바로 쓰고, 평타는 0.7초마다. 조건이 되면 그 시각(초) */
  function run(s: CombatState, until: (s: CombatState) => boolean, maxSec = 60): number {
    const blockEvery = ticksOf(s.params, 1 / 0.7);
    const swingEvery = ticksOf(s.params, 0.7);
    for (let t = 1; t <= ticksOf(s.params, maxSec); t++) {
      if (t % blockEvery === 0) use(s, 1);
      s.player.attackTimer = t % swingEvery === 0 ? 1 : 1e9;
      step(s);
      if (until(s)) return t * s.params.tickSeconds;
    }
    throw new Error('시간 안에 안 됨');
  }
  it('참월 → 각호고 준비까지 약 20초 (만해 게이지 시작값에서, 블록 1개 +6)', () => {
    const s = mk();
    s.params.kit = { ...s.params.kit!, bonusBlockEvery: 0 };
    s.liberation.gauge = BALANCE.provisional.liberation.startGauge;
    const sec = run(s, (x) => canLiberate(x));
    // 블록 몫만이면 13개 × 1.4초 = 18.2초, 평타가 준 피해로 차는 공통 몫(gaugePerDealt)이 더해져 시험 적(test-a) 기준 약 15초
    expect(sec).toBeGreaterThan(13);
    expect(sec).toBeLessThan(22);
    expect(kitRiskOf(s)).toBeGreaterThan(30); // 각호고에 들어가는 호로화 (블록 11~13개 −55~−65 → 35~45)
  });
  it('호로화 30 에서 각호고 → 1초 −4 + 월아천충 평타 −5 로 약 4초에 풀린다', () => {
    const s = mk();
    s.params.kit = { ...s.params.kit!, bonusBlockEvery: 0 };
    s.kit!.risk = 30;
    s.liberation.gauge = 100;
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    s.tray = [];
    const sec = run(s, (x) => !liberationActive(x));
    expect(kitRiskOf(s)).toBe(0);
    expect(sec).toBeGreaterThan(3.3);
    expect(sec).toBeLessThan(4.7);
  });
});

describe('원정: 호로화 = 리스크 게이지', () => {
  function expedition() {
    const s = ichigoSave();
    const exp = createExpedition({ seed: 3, factionId: s.factionId, build: s.build, evolution: s.evolution, hunger: 10, condition: 100, deck: DECK, risk: 7 });
    return exp;
  }
  it('모험 출발 = 100 · 깎이기만(타일·흡수 등 상승 없음) · 패널티(폭주) 없음', () => {
    const exp = expedition();
    expect(exp.risk).toBe(100);
    expect(exp.breakthrough).toBeNull();
    changeRisk(exp, -30, 'kit-release');
    changeRisk(exp, 25, 'void-block');
    expect(exp.risk).toBe(70);
  });
  it('전투 끝 값(호로화·무월수련)이 원정에 이어지고, 보스전 시작 때 호로화 100 · 무월수련 0', () => {
    const exp = expedition();
    for (let i = 0; i < 200 && exp.phase !== 'battle'; i++) advance(exp);
    const b = startBattle(exp);
    expect(kitRiskOf(b)).toBe(100);
    b.kit!.risk = 0;
    b.kit!.mastery = 40;
    b.enemy.hp = 0;
    b.status = 'won';
    b.finisher = { kind: 'basic-attack', traitId: null, element: null };
    finishBattle(exp, b);
    expect(exp.risk).toBe(0);
    expect(exp.kitMastery).toBe(40);
    // 다음 보통 전투는 이어서 (호로화 0 · 무월수련 40), 보스전은 호로화 100 · 무월수련 0
    exp.phase = 'moving';
    const phase = (): string => exp.phase;
    for (let i = 0; i < 400 && phase() !== 'battle'; i++) advance(exp);
    expect(phase()).toBe('battle');
    expect(exp.pending?.boss ?? null).toBeNull();
    const b2 = startBattle(exp);
    expect(kitRiskOf(b2)).toBe(0);
    expect(b2.kit!.mastery).toBe(40);
    b2.enemy.hp = 0;
    b2.status = 'won';
    b2.finisher = { kind: 'basic-attack', traitId: null, element: null };
    finishBattle(exp, b2);
    expect(exp.kitMastery).toBe(40);
    exp.phase = 'moving';
    const next = exp.pos + 1;
    expect(next).toBeLessThan(BALANCE.expedition.loopTiles);
    exp.freeBoss = { beaten: [], appear: { bossId: BOSSES[0]!.id, lap: exp.lap, cell: next }, result: null };
    advance(exp);
    expect(phase()).toBe('battle');
    expect(exp.pending?.boss).toBe(BOSSES[0]!.id);
    expect(exp.risk).toBe(100);
    expect(exp.kitMastery).toBe(0);
    const b3 = startBattle(exp);
    expect(kitRiskOf(b3)).toBe(100);
    expect(b3.kit!.mastery).toBe(0);
  });
});

describe('세이브 형식 88', () => {
  it('87 → 88 은 구조 보정 없이 올라간다', () => {
    const s = newSaveData('hollow', 1000);
    expect(SAVE_FORMAT_VERSION).toBe(88);
    const old = JSON.parse(JSON.stringify(s));
    old.meta.format = 87;
    expect(migrateSave(old)?.meta.format).toBe(88);
  });
});
