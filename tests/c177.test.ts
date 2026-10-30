// C.177 (GDD 105장 수정 v5.233·106장 4·107장·108장 3번): 막기 게이지 0.5초 강공격 막기 · 회복 버튼 없음 · [소모품]·[장비] 버튼 · 해방 = 평소 출현표 · 원정 체력 이어 가기
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { applyInput, canGuard, canUseGear, canUseItem, createCombat, drainCombatEvents, halted, playCombatHuman, replayCombat, spawnTableOf, defaultCombatParams, step, ticksOf, type CombatParams } from '../src/engine/combat';
import { carryOfItems, applyGearToParams } from '../src/engine/gear';
import { createExpedition, finishBattle, finishRest, hpFractionOf, playExpedition, startBattle, advance } from '../src/engine/expedition';
import { BATTLE_ITEM_IDS, battleItemEffectOf, spendBattleItem } from '../src/inventory';
import { newSaveData, SAVE_FORMAT_VERSION, MIN_LOADABLE_SAVE_FORMAT } from '../src/game';
import { actionFor } from '../src/ui/shortcutMap';

const CX = BALANCE.provisional.combat;
const quiet = (params: Partial<CombatParams> = {}) => {
  const s = createCombat(1, { enemy: getEnemy('test-a'), params: { timeLimitSeconds: 1e9, voidChance: 0, ...params } });
  s.spawnTimer = 1e9;
  s.player.hp = s.player.maxHp = 1e9;
  s.enemy.hp = s.enemy.maxHp = 1e9;
  s.enemy.attackTimer = 1e9;
  return s;
};
const potion = { id: 'battle-potion', effect: 'heal' as const, fraction: 0.25 };
const haste = { id: 'battle-haste', effect: 'haste' as const, seconds: 5, spawnMult: 2 };

describe('105장 수정 2 막기 = 게이지 하나', () => {
  it('0 에서 guardGaugeSeconds 에 걸쳐 다 차고, 다 차야 누른다. 쓰면 0 부터', () => {
    const s = quiet();
    expect(s.guardGauge).toBe(0);
    expect(canGuard(s)).toBe(false);
    for (let i = 0; i < ticksOf(s.params, CX.guardGaugeSeconds) - 1; i++) step(s);
    expect(canGuard(s)).toBe(false);
    step(s);
    expect(s.guardGauge).toBe(1);
    expect(applyInput(s, { type: 'guard' })).toBe(true);
    expect(s.guardGauge).toBe(0);
    expect(s.guard.ticks).toBe(ticksOf(s.params, 0.5));
    // 막기 중에는 게이지가 차지 않는다
    step(s);
    expect(s.guardGauge).toBe(0);
  });

  it('강공격은 완전히 막고(guarded, 피해 0), 일반 공격은 줄지 않는다', () => {
    const s = quiet();
    s.guardGauge = 1;
    applyInput(s, { type: 'guard' });
    s.enemy.attackTimer = 1;
    const hp = s.player.hp;
    step(s);
    const ev = drainCombatEvents(s).find((e) => e.kind === 'enemy-attack');
    expect(ev && ev.kind === 'enemy-attack' && ev.damage).toBeGreaterThan(0);
    expect(s.player.hp).toBeLessThan(hp);
    const h = createCombat(2, { enemy: getEnemy('fire-heavy-seal'), params: { timeLimitSeconds: 1e9 } });
    h.enemy.attackTimer = 1e9;
    h.player.hp = h.player.maxHp = 1e9;
    h.enemy.cast = { ticks: 3, total: 20, hitsLeft: 0 };
    h.guardGauge = 1;
    applyInput(h, { type: 'guard' });
    const before = h.player.hp;
    for (let i = 0; i < 4; i++) step(h);
    const hit = drainCombatEvents(h).find((e) => e.kind === 'heavy-hit');
    expect(hit && hit.kind === 'heavy-hit' && hit.guarded).toBe(true);
    expect(h.player.hp).toBe(before);
  });

  it('공허 경직 중에도 막기는 누를 수 있고, 블록·소모품·장비는 못 쓴다 (105장 1번)', () => {
    const s = quiet({ battleItem: potion, activeGear: { id: 'sp-active-burst', effect: 'burst', powerInAttacks: 5 }, gearStartCooldown: 0 });
    s.tray = [{ uid: 1, kind: 'skill', traitId: 'basic-skill', family: null, element: null }];
    s.stunTicks = 10;
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(false);
    expect(canUseItem(s)).toBe(false);
    expect(canUseGear(s)).toBe(false);
    s.guardGauge = 1;
    expect(applyInput(s, { type: 'guard' })).toBe(true);
    s.stunTicks = 0;
    expect(halted(s)).toBe(true);
    while (s.guard.ticks > 0) step(s);
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
  });

  it('회복 버튼 입력은 없다 · 출현표에 막기·회복 블록이 없다', () => {
    const t = spawnTableOf(defaultCombatParams());
    expect(t.entries.some((e) => e.source?.role === 'guard' || e.source?.role === 'heal')).toBe(false);
  });
});

describe('105장 수정 3 [소모품] · 108장 3번 소모품 칸', () => {
  it('회복약: 최대 체력 25% × 회복 보정, 전투당 1번, 폭주(noHealSpawn)면 못 씀', () => {
    const s = quiet({ battleItem: potion });
    s.player.hp = s.player.maxHp * 0.5;
    expect(applyInput(s, { type: 'item' })).toBe(true);
    expect(s.player.hp).toBeCloseTo(s.player.maxHp * 0.75, 3);
    expect(applyInput(s, { type: 'item' })).toBe(false);
    const f = quiet({ battleItem: potion, noHealSpawn: true });
    expect(canUseItem(f)).toBe(false);
    expect(canUseItem(quiet())).toBe(false); // 칸이 비었으면 비활성
  });

  it('전투 각성제: 5초 동안 블록 생성 간격 ÷ 2', () => {
    const s = createCombat(3, { enemy: getEnemy('test-a'), params: { battleItem: haste, voidChance: 0, timeLimitSeconds: 1e9 } });
    s.enemy.hp = s.enemy.maxHp = 1e12;
    s.player.hp = s.player.maxHp = 1e12;
    const plain = structuredClone(s);
    plain.params.battleItem = null;
    applyInput(s, { type: 'item' });
    for (let i = 0; i < 50; i++) { step(s); step(plain); }
    expect(s.tray.length).toBeGreaterThan(plain.tray.length);
    expect(s.hasteTicks).toBe(0);
  });

  it('보관함: 전투용 2종, 칸에 들고 개수가 있어야 실린다, 쓰면 1개 줄어든다', () => {
    expect(BATTLE_ITEM_IDS).toEqual(['battle-potion', 'battle-haste']);
    const save = newSaveData('hollow', 1);
    expect(battleItemEffectOf(save)).toBeNull();
    save.shared.battleItem = 'battle-potion';
    expect(battleItemEffectOf(save)).toBeNull(); // 0개
    save.shared.items['battle-potion'] = 2;
    expect(battleItemEffectOf(save)).toEqual(potion);
    spendBattleItem(save, 'battle-potion');
    expect(save.shared.items['battle-potion']).toBe(1);
    spendBattleItem(save, 'battle-potion');
    expect(save.shared.items['battle-potion']).toBeUndefined();
    expect(save.shared.battleItem).toBe('battle-potion'); // 칸은 그대로(흐리게)
  });
});

describe('105장 수정 4 [장비] 발동', () => {
  it('발동 장비 = 칸 순서 첫 장비 하나, 전투 파라미터로 실린다', () => {
    const c = carryOfItems([
      { stats: {}, plus: 0, special: { id: 'sp-elite', value: 0.1 } },
      { stats: {}, plus: 0, special: { id: 'sp-active-shield', value: 0.4 } },
      { stats: {}, plus: 0, special: { id: 'sp-active-burst', value: 5 } },
    ]);
    expect(c.active).toEqual({ id: 'sp-active-shield', effect: 'activeShield', value: 0.4 });
    const p: Partial<CombatParams> = {};
    applyGearToParams(p, c);
    expect(p.activeGear).toEqual({ id: 'sp-active-shield', effect: 'shield', seconds: BALANCE.provisional.gear.activeShieldSeconds, reduction: 0.4 });
  });

  it('쿨다운 20초, 전투 시작 때 절반. 방패 = 받는 피해 −40%, 폭발 = 피해', () => {
    const s = quiet({ activeGear: { id: 'sp-active-shield', effect: 'shield', seconds: 3, reduction: 0.4 } });
    expect(s.gearCooldown).toBe(ticksOf(s.params, CX.gearCooldownSeconds * CX.gearStartCooldown));
    expect(canUseGear(s)).toBe(false);
    s.gearCooldown = 0;
    expect(applyInput(s, { type: 'gear' })).toBe(true);
    expect(s.gearCooldown).toBe(ticksOf(s.params, 20));
    expect(s.gearShieldTicks).toBe(ticksOf(s.params, 3));
    const b = quiet({ activeGear: { id: 'sp-active-burst', effect: 'burst', powerInAttacks: 5 }, critChance: 0 });
    b.gearCooldown = 0;
    const hp = b.enemy.hp;
    applyInput(b, { type: 'gear' });
    expect(b.enemy.hp).toBeLessThan(hp);
    expect(canUseGear(quiet())).toBe(false); // 발동 장비 없음
  });
});

describe('105장 수정 5 강공격 약 20% · 버튼 입력 결정성', () => {
  it('강공격 한 방 = 권장 단계(★1 = 1단계 몸) 최대 체력 약 20%, 연속 강공격 세 타 합도 같은 비율', () => {
    const shot = (id: string) => {
      const s = createCombat(4, { enemy: getEnemy(id), params: { critChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, timeLimitSeconds: 1e9 } });
      s.enemy.attackTimer = 1e9;
      s.enemy.hp = s.enemy.maxHp = 1e12;
      s.player.attackTimer = 1e9;
      s.spawnTimer = 1e9;
      const max = s.player.maxHp;
      s.player.hp = max * 100;
      let dmg = 0;
      for (let i = 0; i < 2000 && dmg === 0; i++) {
        step(s);
        for (const e of drainCombatEvents(s)) if (e.kind === 'heavy-hit') dmg += e.damage;
      }
      return dmg / max;
    };
    const one = shot('fire-heavy-seal');
    expect(one).toBeGreaterThan(0.15);
    expect(one).toBeLessThan(0.25);
    expect(CX.heavyChainHitMultiplier).toBeCloseTo(CX.heavyHitMultiplier * 0.755, 1);
  });

  it('입력 기록으로 다시 돌려도 같다 (막기·소모품·장비 포함)', () => {
    const params = { battleItem: haste, activeGear: { id: 'sp-active-burst', effect: 'burst' as const, powerInAttacks: 5 } };
    const s = playCombatHuman(createCombat(7, { enemy: getEnemy('fire-heavy-seal'), params }));
    expect(s.inputs.some((x) => x.input.type === 'guard')).toBe(true);
    expect(s.inputs.some((x) => x.input.type === 'item')).toBe(true);
    expect(s.inputs.some((x) => x.input.type === 'gear')).toBe(true);
    const r = replayCombat(7, { enemy: getEnemy('fire-heavy-seal'), params }, s.inputs);
    expect(r.status).toBe(s.status);
    expect(r.tick).toBe(s.tick);
  });

  it('단축키: Q 막기 · W 소모품 · E 장비', () => {
    expect(actionFor('battle', 'KeyQ')).toBe('guard');
    expect(actionFor('battle', 'KeyW')).toBe('item');
    expect(actionFor('battle', 'KeyE')).toBe('gear');
  });
});

describe('107장 원정 체력 이어 가기', () => {
  const PX = BALANCE.provisional.expedition;
  it('전투가 끝난 체력 + 승리 10% 가 다음 전투 시작 체력, 휴식 칸 35%, 기록에 시작 체력', () => {
    const exp = createExpedition({ factionId: 'hollow', seed: 5, hunger: 20, condition: 80, deck: ['prey-nest-a'] });
    expect(hpFractionOf(exp)).toBe(1);
    for (let i = 0; i < 500 && exp.phase !== 'battle'; i++) advance(exp);
    const b = startBattle(exp);
    b.player.hp = b.player.maxHp * 0.4;
    b.status = 'won';
    finishBattle(exp, b);
    expect(hpFractionOf(exp)).toBeCloseTo(0.4 + PX.hpCarry.winHeal, 6);
    expect(exp.battles[0]!.startHp).toBe(1);
    exp.phase = 'rest';
    exp.restMult = 1;
    exp.restSpring = false;
    finishRest(exp);
    expect(hpFractionOf(exp)).toBeCloseTo(Math.min(1, 0.4 + PX.hpCarry.winHeal + PX.hpCarry.restHeal), 6);
    exp.hpFraction = 0.3;
    const toBattle = (): void => {
      for (let i = 0; i < 500; i++) {
        const ph: string = exp.phase;
        if (ph === 'battle') return;
        if (ph !== 'moving') exp.phase = 'moving';
        advance(exp);
      }
    };
    toBattle();
    const c = startBattle(exp);
    expect(c.player.hp / c.player.maxHp).toBeCloseTo(0.3 * (exp.pending!.params.playerStartHpFraction ?? 1), 6);
  });

  it('봇 원정은 바퀴를 이어 돌아도 체력이 이어진다 (새 원정은 가득)', () => {
    const exp = playExpedition(createExpedition({ factionId: 'hollow', seed: 9, hunger: 20, condition: 80, deck: ['prey-nest-a'] }), { returnAfterLap: 2 });
    expect(exp.battles.length).toBeGreaterThan(1);
    expect(exp.battles.some((b) => (b.startHp ?? 1) < 1)).toBe(true);
    expect(hpFractionOf(createExpedition({ factionId: 'hollow', seed: 9, hunger: 20, condition: 80, deck: [] }))).toBe(1);
  });

  it('세이브 형식·문턱 50 (마이그레이션 없음)', () => {
    expect([SAVE_FORMAT_VERSION, MIN_LOADABLE_SAVE_FORMAT]).toEqual([56, 54]); // C.213 · C.198: 문턱 54 고정(123장 6) // C.195 // C.188 // C.184
  });
});
