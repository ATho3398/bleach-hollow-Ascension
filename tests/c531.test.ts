// C.531 허무(kyo) 재설계 구현 (GDD 8-8 v6.160~v6.168 · 8-2·8-3·7-5·6-7, 사용자 2026-11-23 "허무도 흡수 가능해. 허무기본블록 나오고. … 허무 적도 나를 처형 가능 …" · 2026-11-24 "재설계는 지금 해."):
// ① 허무 블록 = 흡수해서 얻는 계열 없는 1종, 같은 블록끼리 체인, 폭주 블록과 별개 ② 진화 전 허무 블록 = 처형 없음·적 체력 20% 구간 강화
// ③ 허무 적의 처형(3·5·7%, 6초, 원 1.2초·판정 ±0.15초, 막으면 1초 스턴·받는 피해 ×1.2, 실패 = 패배) ④ 허무형 조건 = 허무 블록 10개 + 미루기 3회(c497·c56·evolution 테스트)
// ⑤ 오리지널 블록: 나다 '적막 블록'·공화 '낙화 블록' ⑥ 6-7 ★1~2 기본 0.1 ⑦ 세이브 형식 96 ⑧ 블록 특성 [미정] 자리
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useImmediateHits } from './helpers/hitDelay';
import { BALANCE } from '../src/config/balance';
import { ELEMENTS, HIDDEN_FORM_ONLY_ELEMENT_IDS, NORMAL_FORM_ELEMENT_IDS, canFoeExecute } from '../src/data/elements';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import { validateEvoUniques } from '../src/data/evolution/uniques';
import { TRAITS, getTrait, mergedTraitId, traitName, traitNameWithElement } from '../src/data/traits';
import { buildCombatParams, buildOffer, gainTrait, newBuild } from '../src/engine/absorb';
import {
  applyInput, blockDamage, buildBattleRecord, chainGroup, createCombat, drainCombatEvents, evoExecLinesOf, evoSpecialOf, foeExecuteLineOf, foeExecuteRingOf, foeHpBandMult,
  playCombatBot, scriptSpawnBlock, step, ticksOf, type Block, type CombatEvent, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { specialEnemyGate } from '../src/engine/enemyPool';
import { evoParamsOf } from '../src/engine/evolution';
import { chooseAbsorb, createExpedition, serializeExpedition } from '../src/engine/expedition';
import { createRng } from '../src/engine/rng';
import { migrateMergedBlocks, migrateSave, newSaveData, sanitizeDeck, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, MIN_LOADABLE_SAVE_FORMAT } from '../src/game';
useImmediateHits();

const CX = BALANCE.provisional.combat;
const FX = BALANCE.provisional.foeExecute;
const WON = { status: 'won', finisher: null, chain3Count: 0, weakChain3Count: 0 } as const;
const STILL: Partial<CombatParams> = { critChance: 0, blockCritChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, voidChance: 0 };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
let uid = 90000;
const blk = (traitId: string, over: Partial<Block> = {}): Block => ({ uid: uid++, kind: 'skill', traitId, family: null, element: getTrait(traitId).element, ...over });
const skillsOf = (...ids: string[]) => {
  const b = newBuild();
  for (const id of ids) gainTrait(b, id);
  return buildCombatParams(b);
};
/** 내 공격·블록 생성·적 공격이 끼어들지 않게 멈춘다 */
const quiet = (s: CombatState): CombatState => {
  s.spawnTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.enemy.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  return s;
};
const tick = (s: CombatState, n = 1, input?: Parameters<typeof step>[1]): CombatEvent[] => {
  const out: CombatEvent[] = [];
  for (let i = 0; i < n && s.status === 'playing'; i++) {
    step(s, i === 0 ? input : undefined);
    out.push(...drainCombatEvents(s));
  }
  return out;
};
/** 허무 적과의 전투 — 내 체력을 처형선 바로 아래로 */
const duel = (enemyId = 'kyo-basic', extra: Partial<CombatParams> = {}): CombatState => {
  const s = quiet(createCombat(11, { enemy: getEnemy(enemyId), params: { ...STILL, ...extra } }));
  s.player.hp = s.player.maxHp * 0.02;
  return s;
};
/** 처형 시도가 열릴 때까지(한 틱) 돌리고 그 원을 돌려준다 */
const openRing = (s: CombatState) => {
  const evs = tick(s);
  const ring = foeExecuteRingOf(s)!;
  return { evs, ring };
};

describe('① 허무 블록 = 흡수해서 얻는 계열 없는 1종 (GDD 8-2 v6.161·v6.168)', () => {
  it('데이터: t-kyo 하나 — 계열 없음·공격·적 체력 구간 강화, 옛 허무 조·탄·교 id 는 없다(지금 블록으로 읽힌다)', () => {
    const kyoSkills = TRAITS.filter((t) => t.element === 'kyo' && t.kind === 'skill' && !t.boss);
    expect(kyoSkills.map((t) => t.id)).toEqual(['t-kyo']);
    const t = getTrait('t-kyo');
    expect([t.role, t.family, t.foeHpBands, t.provisional]).toEqual(['attack', undefined, true, true]);
    expect(t.powerInAttacks).toBe(getTrait('t-fire-a').powerInAttacks); // 기본 위력은 다른 속성 블록과 같다 — 구간 배율이 가른다
    for (const old of ['t-kyo-a', 't-kyo-b', 't-kyo-c']) {
      expect(TRAITS.some((x) => x.id === old)).toBe(false);
      expect(mergedTraitId(old)).toBe('t-kyo');
      expect(getTrait(old).id).toBe('t-kyo');
    }
    expect(mergedTraitId('t-fire-a')).toBeNull(); // 계열 있는 블록은 그대로
    expect(mergedTraitId('t-kyo-passive')).toBeNull();
    expect(traitName('t-kyo', 'hollow')).toBe('허무 블록');
    expect(traitNameWithElement('t-kyo', 'shinigami')).toBe('허무 블록');
    expect(t.description['*']).not.toContain('적 전용');
  });
  it('허무 적을 잡으면 허무 블록이 후보에 뜬다 · 가진 뒤에는 고르면 허무 강화만', () => {
    const b = newBuild();
    const o = buildOffer(createRng(3), getEnemy('kyo-basic'), b, WON);
    expect(o.candidates).toEqual(['t-kyo']);
    const s = newSaveData('hollow', 1000);
    const exp = createExpedition({ factionId: 'hollow', seed: 5, hunger: 60, condition: 80, deck: sanitizeDeck(s.tiles, 'hollow'), build: s.build, evolution: s.evolution });
    for (let i = 1; i <= 3; i++) {
      exp.absorbOffer = buildOffer(createRng(i), getEnemy('kyo-basic'), exp.build, WON);
      exp.phase = 'absorb';
      expect(chooseAbsorb(exp, 't-kyo', undefined, i === 2 ? 'trait' : 'both').ok).toBe(true);
    }
    expect(exp.build.owned.filter((id) => id === 't-kyo')).toHaveLength(1);
    expect(exp.build.enhance?.kyo).toBe(3);
    expect(exp.evolution.elementAbsorbs.kyo).toBe(3); // 허무형 조건이 세는 '그 단계 허무 블록 흡수 수'
  });
  it('전투: 허무 블록끼리 체인(같은 속성), 다른 블록과는 안 묶인다 · 폭주 블록과 별개(skill 블록, 리스크 0·경직 없음)', () => {
    const s = quiet(createCombat(3, { enemy: getEnemy('test-e'), params: { ...STILL, ...skillsOf('t-kyo', 't-fire-a') } }));
    for (let i = 0; i < 3; i++) expect(scriptSpawnBlock(s, 't-kyo', null)).toBe(true);
    expect(scriptSpawnBlock(s, 't-fire-a', 'family-a')).toBe(true);
    expect(s.tray.map((b) => [b.kind, b.traitId, b.element])).toEqual([['skill', 't-kyo', 'kyo'], ['skill', 't-kyo', 'kyo'], ['skill', 't-kyo', 'kyo'], ['skill', 't-fire-a', 'fire']]);
    expect(chainGroup(s.tray, 1, 3)).toEqual([0, 1, 2]);
    expect(chainGroup(s.tray, 3, 3)).toEqual([3]);
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    const ev = drainCombatEvents(s).find((e): e is Extract<CombatEvent, { kind: 'block' }> => e.kind === 'block')!;
    expect([ev.block, ev.traitId, ev.element, ev.chain]).toEqual(['skill', 't-kyo', 'kyo', 3]);
    expect(s.riskGained).toBe(0);
    expect(s.voidUsed).toBe(0);
    expect(s.stunTicks ?? 0).toBe(0);
    expect(s.tray.map((b) => b.traitId)).toEqual(['t-fire-a']);
  });
});

describe('② 진화 전 허무 블록 = 처형 없음, 적 체력 20% 구간 강화 (GDD 8-8 v6.162)', () => {
  it('수치(provisional): 100~80% ×0.6 · 80~60 ×0.75 · 60~40 ×0.9 · 40~20 ×1.2 · 20~0 ×1.6 — 40% 초과는 전부 1 미만', () => {
    expect(CX.foeHpBands).toEqual([{ above: 0.8, mult: 0.6 }, { above: 0.6, mult: 0.75 }, { above: 0.4, mult: 0.9 }, { above: 0.2, mult: 1.2 }, { above: 0, mult: 1.6 }]);
    expect([1, 0.81, 0.8, 0.61, 0.6, 0.41, 0.4, 0.21, 0.2, 0.01, 0].map((f) => foeHpBandMult(CX.foeHpBands, f))).toEqual([0.6, 0.6, 0.75, 0.75, 0.9, 0.9, 1.2, 1.2, 1.6, 1.6, 1.6]);
    for (const b of CX.foeHpBands) expect(b.mult < 1).toBe(b.above >= 0.4);
    expect(foeHpBandMult(undefined, 0.5)).toBe(1);
  });
  it('전투: 같은 조건의 다른 블록 대비 배율이 적 체력 구간대로 — 체력이 낮을수록 세다, 적을 처형하지는 않는다', () => {
    const s = quiet(createCombat(3, { enemy: getEnemy('test-e'), params: { ...STILL, ...skillsOf('t-kyo', 't-fire-a') } }));
    const kyo = blk('t-kyo');
    const fire = blk('t-fire-a', { family: 'family-a' });
    const ratioAt = (f: number): number => {
      s.enemy.hp = s.enemy.maxHp * f;
      return blockDamage(s, kyo) / blockDamage(s, fire);
    };
    expect(ratioAt(1)).toBeCloseTo(0.6);
    expect(ratioAt(0.7)).toBeCloseTo(0.75);
    expect(ratioAt(0.5)).toBeCloseTo(0.9);
    expect(ratioAt(0.3)).toBeCloseTo(1.2);
    expect(ratioAt(0.1)).toBeCloseTo(1.6);
    // 처형 없음: 체력 5% 적에게 써도 그 블록 피해만큼만 깎인다 (남은 체력이 피해보다 많으면 살아 있다)
    s.enemy.maxHp *= 100;
    s.enemy.hp = s.enemy.maxHp * 0.05;
    s.tray = [blk('t-kyo')];
    const before = s.enemy.hp;
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    const ev = drainCombatEvents(s).find((e): e is Extract<CombatEvent, { kind: 'block' }> => e.kind === 'block')!;
    expect(before - s.enemy.hp).toBeCloseTo(ev.damage);
    expect(s.status).toBe('playing');
  });
});

describe('③ 허무 적의 처형 (GDD 8-8 v6.160 ④)', () => {
  it('수치(provisional)·데이터: 일반 3%·강적 5%·보스 7%, 6초마다, 원 1.2초·판정 ±0.15초, 막으면 1초 스턴·받는 피해 ×1.2 · 허무 속성 적만', () => {
    expect(FX).toEqual({ hpLine: { normal: 0.03, elite: 0.05, boss: 0.07 }, everySeconds: 6, ringSeconds: 1.2, windowSeconds: 0.15, blockedDamage: 0.3, stunSeconds: 1, stunTakenMult: 1.2 });
    expect(ELEMENTS.filter((e) => e.foeExecute).map((e) => e.id)).toEqual(['kyo']);
    expect(canFoeExecute(['kyo'])).toBe(true);
    expect(canFoeExecute(['blood'])).toBe(false);
    expect(foeExecuteLineOf(duel('kyo-basic'))).toBe(0.03);
    expect(foeExecuteLineOf(duel('kyo-stance'))).toBe(0.05);
    expect(foeExecuteLineOf({ ...duel('kyo-basic'), boss: {} as never })).toBe(0.07);
    expect(foeExecuteLineOf(duel('blood-basic'))).toBe(0);
    expect(foeExecuteLineOf(duel('kyo-basic', { enemyPassive: true }))).toBe(0);
    // 속성이 바뀌는 보스(썬더우드 뇌 → 허무 → 물)는 허무인 동안만
    const shift = duel('blood-basic');
    shift.enemy.def = { ...shift.enemy.def, element: 'kyo' };
    expect(foeExecuteLineOf(shift)).toBe(0.03);
  });
  it('내 체력이 선 이하가 되면 바로 처형 시도: 원이 1.2초 뒤 닿는다 · 그동안 적의 다른 공격은 멈춘다 · 선 위면 시도 없음', () => {
    const high = quiet(createCombat(11, { enemy: getEnemy('kyo-basic'), params: STILL }));
    high.player.hp = high.player.maxHp * 0.031;
    expect(tick(high, 30).some((e) => e.kind === 'foe-execute')).toBe(false);
    const s = duel();
    s.enemy.attackTimer = 3;
    const { evs, ring } = openRing(s);
    expect(evs).toContainEqual({ kind: 'foe-execute', seconds: 1.2, atTick: ring.hitTick, windowSeconds: 0.15 });
    expect(ring.hitTick - ring.startTick).toBe(ticksOf(s.params, 1.2));
    expect(ring.windowTicks).toBe(1); // 0.1초 틱에서 ±0.15초 = ±1틱
    expect(tick(s, 8).some((e) => e.kind === 'enemy-attack')).toBe(false);
    expect(s.enemy.attackTimer).toBe(3);
    expect(s.execution!.attempts).toBe(1);
  });
  it('원이 닿는 순간 누르면 막는다: 그 적 일반 공격 30%만 받고(체력 1 하한) 적은 1초 스턴, 스턴 중 받는 피해 ×1.2', () => {
    const s = duel('kyo-basic', skillsOf('t-fire-a'));
    const { ring } = openRing(s);
    tick(s, ring.hitTick - s.tick - 1);
    expect(s.tick + 1).toBe(ring.hitTick);
    const hp = s.player.hp;
    const foe = s.enemy.def;
    const evs = tick(s, 1, { type: 'execute-guard' });
    const end = evs.find((e): e is Extract<CombatEvent, { kind: 'foe-execute-end' }> => e.kind === 'foe-execute-end')!;
    expect(end.ok).toBe(true);
    expect(end.stunSeconds).toBe(1);
    const raw = foe.attackInAttacks * CX.playerAttackDamage * (CX.attackScale[foe.class] ?? 1) * FX.blockedDamage;
    expect(end.damage).toBeCloseTo(Math.min(raw, hp - 1));
    expect(s.player.hp).toBeCloseTo(hp - end.damage);
    expect(s.player.hp).toBeGreaterThanOrEqual(1);
    expect(s.status).toBe('playing');
    expect(foeExecuteRingOf(s)).toBeNull();
    expect(s.execution).toMatchObject({ attempts: 1, blocked: 1 });
    // 스턴: 1초(10틱) 동안 적 공격 없음 — 이번 틱에 1 줄어 9 남았다
    expect(s.enemy.stunTicks).toBe(ticksOf(s.params, 1) - 1);
    s.enemy.attackTimer = 1;
    expect(tick(s, 3).some((e) => e.kind === 'enemy-attack')).toBe(false);
    // 스턴 중 받는 피해 ×1.2
    s.tray = [blk('t-fire-a', { family: 'family-a' })];
    const before = s.enemy.hp;
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    const b = drainCombatEvents(s).find((e): e is Extract<CombatEvent, { kind: 'block' }> => e.kind === 'block')!;
    expect(before - s.enemy.hp).toBeCloseTo(b.damage * FX.stunTakenMult);
    // 스턴이 끝나면 다시 공격한다
    expect(tick(s, 10).some((e) => e.kind === 'enemy-attack')).toBe(true);
  });
  it('체력 1 하한: 막고 받는 피해로는 쓰러지지 않는다', () => {
    const s = duel();
    s.player.hp = 1.2;
    const { ring } = openRing(s);
    tick(s, ring.hitTick - s.tick - 1);
    tick(s, 1, { type: 'execute-guard' });
    expect(s.player.hp).toBe(1);
    expect(s.status).toBe('playing');
  });
  it('판정 ±1틱 안이면 막기 · 너무 일찍 누르면 처형당한다(패배, 까닭 executed) · 안 누르면 판정이 지난 틱에 처형', () => {
    for (const lead of [-1, 0, 1]) {
      const s = duel();
      const { ring } = openRing(s);
      tick(s, ring.hitTick + lead - s.tick - 1);
      tick(s, 1, { type: 'execute-guard' });
      expect(s.status, `판정 ${lead}`).toBe('playing');
      expect(s.execution!.blocked).toBe(1);
    }
    const early = duel();
    const r1 = openRing(early).ring;
    tick(early, r1.hitTick - 3 - early.tick - 1);
    const evs = tick(early, 1, { type: 'execute-guard' });
    expect(evs).toContainEqual({ kind: 'foe-execute-end', ok: false, damage: 0, stunSeconds: 0 });
    expect([early.status, early.lossReason, early.player.hp]).toEqual(['lost', 'executed', 0]);
    expect(buildBattleRecord(early, { factionId: 'hollow' })).toMatchObject({ won: false, lossReason: 'executed', foeExecutes: { attempts: 1, blocked: 0 } });
    const idle = duel();
    const r2 = openRing(idle).ring;
    tick(idle, r2.hitTick + 1 - idle.tick);
    expect(idle.status).toBe('playing'); // 판정 마지막 틱까지는 살아 있다
    tick(idle);
    expect([idle.status, idle.lossReason]).toEqual(['lost', 'executed']);
  });
  it('되살아남·해방 체력 하한도 처형은 못 막는다 · 시도 중이 아니면 입력은 거절', () => {
    const s = duel('kyo-basic', { abilityEffects: { lastStand: 0.3 } });
    expect(applyInput(s, { type: 'execute-guard' })).toBe(false);
    const { ring } = openRing(s);
    tick(s, ring.hitTick + 2 - s.tick);
    expect([s.status, s.lossReason, s.lastStandUsed ?? false]).toEqual(['lost', 'executed', false]);
  });
  it('기준 이하인 동안 6초마다 다시 시도한다 (앞 시도가 시작된 때부터)', () => {
    const s = duel();
    const first = openRing(s).ring;
    tick(s, first.hitTick - s.tick - 1);
    tick(s, 1, { type: 'execute-guard' });
    s.enemy.attackTimer = 1e9;
    let second: number | null = null;
    for (let i = 0; i < 100 && second === null; i++) if (tick(s).some((e) => e.kind === 'foe-execute')) second = foeExecuteRingOf(s)!.startTick;
    expect(second).toBe(first.startTick + ticksOf(s.params, FX.everySeconds));
    expect(s.execution!.attempts).toBe(2);
  });
  it('강적은 5% 이하부터 · 강공격 시전 중에는 열지 않는다', () => {
    const s = duel('kyo-stance');
    s.player.hp = s.player.maxHp * 0.045;
    expect(openRing(s).evs.some((e) => e.kind === 'foe-execute')).toBe(true);
    const c = duel('kyo-heavy-chain');
    c.enemy.cast = { ticks: 5, total: 5, hitsLeft: 0 };
    c.guard.ticks = 999; // 강공격은 막아 둔다
    expect(tick(c, 4).some((e) => e.kind === 'foe-execute')).toBe(false);
  });
  it('봇은 처형을 늘 막는다 (밸런스 측정 기준) · 전투 기록에 시도·막은 수', () => {
    const s = createCombat(21, { enemy: getEnemy('kyo-basic'), params: { ...STILL, damageTakenMultiplier: 0 } });
    s.player.hp = s.player.maxHp * 0.02;
    playCombatBot(s);
    expect(s.status).toBe('won');
    expect(s.execution!.attempts).toBeGreaterThanOrEqual(1);
    expect(s.execution!.blocked).toBe(s.execution!.attempts);
    expect(buildBattleRecord(s, { factionId: 'hollow' }).foeExecutes).toEqual({ attempts: s.execution!.attempts, blocked: s.execution!.blocked });
    // 처형하지 않는 적의 전투 기록에는 칸이 없다
    const plain = createCombat(21, { enemy: getEnemy('test-a'), params: STILL });
    playCombatBot(plain);
    expect('foeExecutes' in buildBattleRecord(plain, { factionId: 'hollow' })).toBe(false);
  });
  it('화면: 원형 처형 막기 표식 — bha- 클래스·디자인 토큰만(새 색·px 없음), 입력 = execute-guard', () => {
    const view = read('src/ui/battleView.ts');
    expect(view).toContain("el('button', 'bha-execring')");
    expect(view).toContain("queue.push({ type: 'execute-guard' })");
    expect(view).toContain('--bha-execring-scale');
    const css = read('src/ui/bha/battle-scene.css').split('\n').filter((l) => l.includes('.bha-execring'));
    expect(css.length).toBeGreaterThanOrEqual(5);
    for (const line of css) {
      expect(line).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(line).not.toMatch(/rgb\(/);
      expect(line).not.toMatch(/\d+px/);
    }
    expect(css.join('\n')).toContain('var(--bha-el-kyo)');
  });
});

describe('⑤ 진화하면 허무 블록 = 진화체 오리지널 블록 (GDD 8-8 v6.160 ③)', () => {
  it('데이터: 호로 허무·물리(나다) = 적막 블록(생길 차례에 대신), 사신 허무·특수(공화) = 낙화 블록(고정 칸) · 검사 통과', () => {
    expect(validateEvoUniques()).toEqual([]);
    const nada = evoParamsOf(getForm('h4:void'), 'hollow')!;
    expect(nada.ability.originalBlock).toEqual({ element: 'kyo', special: 'silence', mode: 'spawn' });
    expect(nada.ability.specials!.silence!.name).toEqual({ '*': '적막 블록' });
    expect([nada.nums.silenceSeconds, nada.nums.silenceLine]).toEqual([8, 0.03]);
    const gonghwa = evoParamsOf(getForm('h4:void'), 'shinigami')!;
    expect(gonghwa.ability.originalBlock).toEqual({ element: 'kyo', special: 'nil', mode: 'fixed' });
    expect(gonghwa.ability.specials!.nil!.name).toEqual({ '*': '낙화 블록' });
  });
  it('나다: 허무 블록이 생길 차례에 적막 블록이 생긴다 · 쓰면 8초 동안 평타 처형선 +3%p, 피해 없음', () => {
    const s = quiet(createCombat(5, { enemy: getEnemy('test-a'), params: { ...STILL, enemyPassive: true, ...skillsOf('t-kyo'), evo: evoParamsOf(getForm('h4:void'), 'hollow')! } }));
    expect(scriptSpawnBlock(s, 't-kyo', null)).toBe(true);
    expect(s.tray).toHaveLength(1);
    expect(s.tray.some((b) => b.traitId === 't-kyo')).toBe(false);
    expect(evoSpecialOf(s.params, s.tray[0]!.traitId)?.id).toBe('silence');
    const line0 = evoExecLinesOf(s).basic;
    const hp = s.enemy.hp;
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    expect(s.enemy.hp).toBe(hp); // 피해 없는 강화 블록
    expect(s.tray).toHaveLength(0);
    expect(evoExecLinesOf(s).basic).toBeCloseTo(line0 + 0.03);
    tick(s, ticksOf(s.params, 8) - 1);
    expect(evoExecLinesOf(s).basic).toBeCloseTo(line0 + 0.03);
    tick(s, 2);
    expect(evoExecLinesOf(s).basic).toBeCloseTo(line0);
    // 다른 속성 블록·기본 블록은 그대로 생긴다
    const t = quiet(createCombat(5, { enemy: getEnemy('test-a'), params: { ...STILL, enemyPassive: true, ...skillsOf('t-kyo', 't-fire-a'), evo: evoParamsOf(getForm('h4:void'), 'hollow')! } }));
    expect(scriptSpawnBlock(t, 't-fire-a', 'family-a')).toBe(true);
    expect(t.tray[0]!.traitId).toBe('t-fire-a');
  });
  it('공화: 낙화 블록이 고정 칸으로 있고 허무 블록은 더 생기지 않는다 — 그 몫은 다른 블록으로', () => {
    const s = createCombat(5, { enemy: getEnemy('test-a'), params: { ...STILL, enemyPassive: true, enemyImmortal: true, ...skillsOf('t-kyo', 't-fire-a'), evo: evoParamsOf(getForm('h4:void'), 'shinigami')! } });
    s.player.attackTimer = 1e9;
    expect(s.tray.filter((b) => b.fixed && evoSpecialOf(s.params, b.traitId)?.id === 'nil')).toHaveLength(2);
    expect(scriptSpawnBlock(s, 't-kyo', null)).toBe(false);
    tick(s, 400);
    expect(s.tray.some((b) => b.traitId === 't-kyo')).toBe(false);
    expect(s.tray.filter((b) => evoSpecialOf(s.params, b.traitId)?.id === 'nil')).toHaveLength(2);
    expect(s.tray.length).toBe(s.params.trayCapacity); // 허무 몫이 비지 않고 다른 블록으로 바가 찬다
    expect(s.tray.some((b) => b.traitId === 't-fire-a')).toBe(true);
  });
  it('진화 전(고유 능력 없음)·다른 진화체에서는 허무 블록 그대로', () => {
    const s = quiet(createCombat(5, { enemy: getEnemy('test-a'), params: { ...STILL, ...skillsOf('t-kyo') } }));
    expect(scriptSpawnBlock(s, 't-kyo', null)).toBe(true);
    expect(s.tray[0]!.traitId).toBe('t-kyo');
    const o = quiet(createCombat(5, { enemy: getEnemy('test-a'), params: { ...STILL, ...skillsOf('t-kyo'), evo: evoParamsOf(getForm('t4:normal:physical'), 'hollow')! } }));
    expect(scriptSpawnBlock(o, 't-kyo', null)).toBe(true);
    expect(o.tray[0]!.traitId).toBe('t-kyo');
  });
});

describe('⑥ 6-7 특수 속성 적 ★1~2 일반 칸 0 → 0.1 · 허무 일반 진화체는 여전히 없다', () => {
  it('기본 확률 0.1 — 다른 까닭이 있으면 그 값과 최대, 까닭 기록은 다른 까닭만 · 첫 원정 튜토리얼은 0', () => {
    const S = BALANCE.provisional.specialEnemies;
    expect(S).toEqual({ base: 0.1, elite: 0.5, minDifficulty: 3, difficulty: 0.3 });
    expect(specialEnemyGate({ elite: false, difficulty: 2 })).toEqual({ chance: 0.1, gates: ['base'] });
    expect(specialEnemyGate({ elite: true, difficulty: 2 })).toEqual({ chance: 0.5, gates: ['elite'] });
    expect(specialEnemyGate({ elite: false, difficulty: 3 })).toEqual({ chance: 0.3, gates: ['difficulty'] });
    expect(specialEnemyGate({ elite: false, difficulty: 1, noBase: true })).toEqual({ chance: 0, gates: [] });
  });
  it('허무 = 히든 진화체만(일반 4단계 retired) · 고유 능력의 그 속성 블록 기준에서는 빠진다', () => {
    expect(HIDDEN_FORM_ONLY_ELEMENT_IDS).toEqual(['kyo']);
    expect(NORMAL_FORM_ELEMENT_IDS).not.toContain('kyo');
    expect(getForm('t4:kyo:mixed').retired).toBe(true);
    expect(getForm('h4:void').elements).toEqual(['kyo']);
  });
});

describe('⑦ 세이브 형식 96 (95 → 96) — 옛 세이브를 이어 쓴다', () => {
  it('형식 96 · 95 → 96 변환 있음 · 문턱 87 그대로', () => {
    expect(SAVE_FORMAT_VERSION).toBe(96);
    expect(typeof SAVE_MIGRATIONS[95]).toBe('function');
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(87);
  });
  it('형식 95 세이브(C.516 뒤 — 허무 블록이 이미 지워짐): 허무 블록 없이 그대로 이어 쓴다, 다른 빌드·강화는 손대지 않는다', () => {
    const s = newSaveData('hollow', 1000);
    gainTrait(s.build, 't-water-a');
    s.build.enhance = { normal: 5, water: 2 };
    s.meta.format = 95;
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m).not.toBeNull();
    expect(m.meta.format).toBe(96);
    expect(m.build.owned).toEqual(['t-water-a']);
    expect(m.build.slots[0]).toBe('t-water-a');
    expect(m.build.enhance).toEqual({ normal: 5, water: 2 });
    // 이어서 허무 블록을 새로 얻을 수 있다
    expect(gainTrait(m.build, 't-kyo').ok).toBe(true);
  });
  it('형식 95 원정 중간 저장: 허무 적 흡수 화면(옛 blockless·후보 0)에 허무 블록 후보를 돌려준다', () => {
    const s = newSaveData('hollow', 1000);
    const e = createExpedition({ factionId: 'hollow', seed: 3, hunger: 60, condition: 80, deck: sanitizeDeck(s.tiles, 'hollow'), build: s.build, evolution: s.evolution });
    e.absorbOffer = { ...buildOffer(createRng(1), getEnemy('kyo-basic'), e.build, WON), candidates: [], blockless: true };
    e.phase = 'absorb';
    s.activeExpedition = JSON.parse(JSON.stringify(serializeExpedition(e, 1, 1000)));
    s.meta.format = 95;
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.activeExpedition!.exp.absorbOffer!.candidates).toEqual(['t-kyo']);
    expect(m.activeExpedition!.exp.absorbOffer!.blockless).toBeUndefined();
  });
  it('migrateMergedBlocks: 옛 허무 조·탄·교 여럿 → 허무 블록 하나(앞 칸에 남김), 장착 순서는 가장 최근 것', () => {
    const s = newSaveData('hollow', 1000);
    s.build.owned = ['t-kyo-a', 't-fire-a', 't-kyo-b', 't-kyo-c'];
    s.build.slots = ['t-kyo-b', 't-fire-a', 't-kyo-a'];
    s.build.equipOrder = ['t-kyo-b', 't-fire-a', 't-kyo-a'];
    s.build.enhance = { kyo: 7 };
    migrateMergedBlocks(s);
    expect(s.build.owned).toEqual(['t-kyo', 't-fire-a']);
    expect(s.build.slots).toEqual(['t-kyo', 't-fire-a', null]);
    expect(s.build.equipOrder).toEqual(['t-fire-a', 't-kyo']);
    expect(s.build.enhance).toEqual({ kyo: 7 });
  });
});

describe('⑧ 혈·독·허무 블록 특성 1개 = [미정] — 데이터 자리만, 효과 없음·화면에 안 보임', () => {
  it('속성 데이터에 blockTrait: null 자리 (혈·독·허무만) · 화면 코드는 읽지 않는다', () => {
    expect(ELEMENTS.filter((e) => e.blockTrait === null).map((e) => e.id)).toEqual(['blood', 'poison', 'kyo']);
    expect(ELEMENTS.filter((e) => e.kind !== 'special').every((e) => e.blockTrait === undefined)).toBe(true);
    const files = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(`${dir}/${d.name}`) : d.name.endsWith('.ts') ? [`${dir}/${d.name}`] : []));
    for (const f of [...files('src/ui'), ...files('src/engine')]) expect(read(f).includes('blockTrait'), f).toBe(false);
  });
});
