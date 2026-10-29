// C.57 (S-13, GDD 25-5 v5.23): 타일 변수 5종 — 드래프트, 인접 시너지 8종, 이벤트 타일 5종, 바퀴 변이 5종, 타일 합성. 골드 전리품, 세이브 형식 21, 원정 중간 저장 형식 5
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import {
  baseTilesFor, deckTilesFor, eventTilesFor, getTile, MUTATIONS, mutationName, SYNERGIES, synergyName, TERRAIN_TILES, tileName, upgradeIdOf,
} from '../src/data/tiles';
import { TILE_EVENTS } from '../src/data/schema';
import { createCombat, step } from '../src/engine/combat';
import { ENEMIES } from '../src/data/enemies';
import {
  advance, botDraft, buildRunRecord, chooseContinue, chooseDraft, chooseReturn, combineMods, createExpedition, deckOptions, drawDraft, finishBattle, finishRest,
  goldAvailable, playExpedition, resolveEvent, restoreExpedition, rollMutation, serializeExpedition, startBattle, summarize, synergyAt, synergyPairs,
  EXPEDITION_SNAPSHOT_VERSION, type ExpeditionState,
} from '../src/engine/expedition';
import { createRng } from '../src/engine/rng';
import { gainTrait } from '../src/engine/absorb';
import { TRAITS } from '../src/data/traits';
import { canSynthesize, migrateSave, newSaveData, recordExpedition, sanitizeDeck, SAVE_FORMAT_VERSION, synthesizeTile } from '../src/game';
import { roadSynergies } from '../src/ui/bha/road';
import { eventHint, tileHint, variantModsText } from '../src/ui/labels';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const TV = BALANCE.provisional.tileVariants;
const L = BALANCE.expedition.loopTiles;

function exp(factionId = 'hollow', o: { variants?: boolean; gold?: number; seed?: number } = {}): ExpeditionState {
  return createExpedition({ factionId, seed: o.seed ?? 7, hunger: 20, condition: 80, deck: sanitizeDeck(newSaveData(factionId, 1).tiles, factionId), tileVariants: o.variants ?? true, gold: o.gold ?? 0 });
}

/** 길을 비우고 원하는 타일을 놓는다 (야생 전투 없음) */
function road(e: ExpeditionState, tiles: Record<number, string>): void {
  e.slots = Array.from({ length: L }, (_, c) => tiles[c] ?? null);
  e.wildCells = [];
}

/** pos 칸 바로 앞에서 한 칸 걷는다 */
function stepTo(e: ExpeditionState, cell: number) {
  e.pos = cell - 1;
  e.phase = 'moving';
  return advance(e);
}

function winBattle(e: ExpeditionState) {
  const b = startBattle(e);
  b.status = 'won';
  b.enemy.hp = 0;
  return finishBattle(e, b);
}

describe('데이터 (GDD 25-5)', () => {
  it('이벤트 타일 5종: 두 종족 이름, 덱에는 못 넣는다(드래프트로만)', () => {
    for (const f of ['hollow', 'shinigami']) {
      const evs = eventTilesFor(f);
      expect(evs.map((t) => (t.effect.type === 'event' ? t.effect.event : '')).sort()).toEqual([...TILE_EVENTS].sort());
      expect(deckTilesFor(f).some((t) => t.kind === 'event')).toBe(false);
      expect(deckOptions(f).some((id) => getTile(id).kind === 'event')).toBe(false);
    }
  });
  it('상위 타일: 바탕 타일마다 하나, 이름 뒤 "+", 상위·이벤트는 합성 불가', () => {
    expect(getTile('prey-nest-a-plus').upgradeOf).toBe('prey-nest-a');
    expect(tileName('prey-nest-a-plus', 'hollow')).toBe(`${tileName('prey-nest-a', 'hollow')}+`);
    expect(tileName('rest-a-plus', 'shinigami')).toBe('전령신기 보급소+');
    expect(upgradeIdOf('prey-nest-a-plus')).toBeNull();
    expect(upgradeIdOf('event-merchant')).toBeNull();
    expect(canSynthesize('env-fog')).toBe(true);
    const plus = TERRAIN_TILES.filter((t) => t.upgradeOf);
    expect(plus.length).toBe(TERRAIN_TILES.filter((t) => !t.upgradeOf && t.kind !== 'event' && t.kind !== 'special').length);
  });
  it('시너지 8종·변이 5종, 이름은 종족별', () => {
    expect(SYNERGIES.map((s) => s.id)).toEqual(['ambush', 'oasis', 'battlefield', 'rift', 'sanctuary', 'hideout', 'pack', 'predator']);
    expect(MUTATIONS.length).toBe(5);
    expect(synergyName('pack', 'hollow')).toBe('사냥 무리');
    expect(synergyName('pack', 'shinigami')).toBe('집단 출몰');
    expect(mutationName('storm', 'shinigami')).toBe('영압 폭풍');
    for (const s of SYNERGIES) expect(TV.synergies[s.id]).toBeDefined();
    for (const m of MUTATIONS) expect(TV.mutations[m.id]).toBeDefined();
  });
});

describe('② 인접 시너지', () => {
  const pairOf = (a: string, b: string) => synergyPairs([null, a, b, null, null, null, null, null, null, null, null, null]).map((p) => p.id);
  it('8종이 순서와 상관없이 발동한다', () => {
    expect(pairOf('elite-den-a', 'env-fog')).toEqual(['ambush']);
    expect(pairOf('env-fog', 'elite-den-a')).toEqual(['ambush']);
    expect(pairOf('rest-a', 'prey-nest-a')).toEqual(['oasis']);
    expect(pairOf('elite-den-b', 'env-wasteland')).toEqual(['battlefield']);
    expect(pairOf('prey-nest-a', 'env-ruin')).toEqual(['rift']);
    expect(pairOf('rest-a', 'env-barrier')).toEqual(['sanctuary']);
    expect(pairOf('rest-a', 'rest-a')).toEqual(['hideout']);
    expect(pairOf('prey-nest-a', 'prey-nest-b')).toEqual(['pack']);
    expect(pairOf('elite-den-a', 'elite-den-b')).toEqual(['predator']);
    expect(pairOf('env-fog', 'rest-a')).toEqual([]);
  });
  it('한 칸은 시너지 하나 — 왼쪽부터, 상위 타일은 바탕과 같이, 이벤트·둥지 칸은 끼지 않는다', () => {
    const slots: (string | null)[] = Array(L).fill(null);
    slots[1] = 'prey-nest-a';
    slots[2] = 'prey-nest-b';
    slots[3] = 'prey-nest-a-plus';
    slots[5] = 'event-trap';
    slots[6] = 'rest-a';
    slots[10] = 'rest-a-plus';
    slots[11] = 'rest-a';
    expect(synergyPairs(slots)).toEqual([{ id: 'pack', left: 1, right: 2 }, { id: 'hideout', left: 10, right: 11 }]);
    expect(synergyAt(slots, 2)).toMatchObject({ id: 'pack', role: 'right' });
    expect(synergyAt(slots, 3)).toBeNull();
  });
  it('배치판 표시: 타일 변수가 켜진 원정에서만', () => {
    const e = exp();
    road(e, { 3: 'elite-den-a', 4: 'env-fog' });
    expect(roadSynergies(e, true)).toEqual([{ id: 'ambush', left: 3, right: 4 }]);
    expect(roadSynergies({ ...e, tileVariants: false }, true)).toEqual([]);
  });
  it('매복: 적이 먼저 공격, 보상 배율. 기록에 남는다', () => {
    const e = exp();
    road(e, { 3: 'elite-den-a', 4: 'env-fog' });
    stepTo(e, 3);
    expect(e.pending!.params.enemyFirstStrike).toBe(true);
    expect(e.pending!.mods!.rewardMult).toBe(TV.synergies.ambush!.rewardMult);
    expect(e.variantLog.synergies).toEqual([{ id: 'ambush', lap: 1 }]);
    const c = startBattle(e);
    expect(c.enemy.attackTimer).toBe(1);
  });
  it('사냥 무리: 오른쪽 칸 전투를 이기면 같은 칸에서 한 번 더 (2연전은 한 번만)', () => {
    const e = exp();
    road(e, { 3: 'prey-nest-a', 4: 'prey-nest-b' });
    stepTo(e, 3);
    winBattle(e);
    expect(e.queuedBattle).toBeNull();
    e.phase = 'moving';
    advance(e);
    expect(e.pos).toBe(4);
    winBattle(e);
    expect(e.queuedBattle).toEqual({ cell: 4, synergy: 'pack' });
    e.phase = 'moving';
    const ev = advance(e);
    expect(ev?.kind).toBe('battle');
    expect(e.pos).toBe(4);
    expect(e.pending!.second).toBe(true);
    winBattle(e);
    expect(e.queuedBattle).toBeNull();
  });
  it('은신처 리스크 −5, 성역 보호막, 오아시스 휴식 회복 ×1.5', () => {
    const e = exp('shinigami');
    e.risk = 40;
    road(e, { 2: 'rest-a', 3: 'rest-a', 5: 'rest-a', 6: 'env-barrier', 8: 'rest-a', 9: 'prey-nest-a' });
    stepTo(e, 3);
    expect(e.risk).toBe(40 + (TV.synergies.hideout!.riskOnce as number));
    stepTo(e, 5);
    expect(e.nextShield).toBe(TV.synergies.sanctuary!.nextShield);
    stepTo(e, 6);
    expect(e.pending!.params.startShieldFraction).toBe(TV.synergies.sanctuary!.nextShield);
    expect(e.nextShield).toBe(0);
    e.pending = null;
    e.hunger = 60;
    stepTo(e, 8);
    expect(e.restMult).toBe(TV.synergies.oasis!.restMult);
    const before = e.hunger;
    finishRest(e);
    expect(before - e.hunger).toBeCloseTo(BALANCE.provisional.expedition.restHunger * 1.5, 5);
  });
  it('타일 변수를 끄면 시너지·드래프트·변이가 없다', () => {
    const e = exp('hollow', { variants: false });
    road(e, { 3: 'elite-den-a', 4: 'env-fog' });
    stepTo(e, 3);
    expect(e.pending!.params.enemyFirstStrike).toBeUndefined();
    expect(e.pending!.synergy).toBeNull();
  });
});

describe('① 드래프트', () => {
  it('카드 3장, 특수 칸은 덱 밖 타일 또는 이벤트', () => {
    const deck = ['prey-nest-a', 'prey-nest-a'];
    let special = 0;
    for (let s = 1; s <= 200; s++) {
      const d = drawDraft(createRng(s), 'hollow', deck);
      expect(d.length).toBe(TV.draft.cards);
      expect(d.slice(0, 2).every((id) => id === 'prey-nest-a')).toBe(true);
      if (d[2] !== 'prey-nest-a') {
        special++;
        expect(getTile(d[2]!).kind === 'event' || !deck.includes(d[2]!)).toBe(true);
      }
    }
    expect(special / 200).toBeGreaterThan(0.15);
    expect(special / 200).toBeLessThan(0.45);
  });
  it('바퀴 끝에 3장 → 1장 고르면 임시 타일로 손에, 계속해도 이번 원정 동안 남는다(121장 4 ②). 덱·보유에는 안 들어감', () => {
    const e = exp();
    road(e, {});
    stepTo(e, 0);
    expect(e.phase).toBe('nest-choice');
    expect(e.draft!.options.length).toBe(3);
    const hand0 = e.hand.length;
    const acq0 = e.acquired.length;
    expect(chooseDraft(e, 1).ok).toBe(true);
    expect(e.acquired.length).toBe(acq0);
    expect(chooseDraft(e, 0).ok).toBe(false);
    expect(e.hand.length).toBe(hand0 + 1);
    const id = e.draft!.options[1]!;
    expect(e.tempHand).toContain(id);
    chooseContinue(e);
    expect(e.hand.length).toBe(hand0 + 1);
    expect(e.tempHand).toContain(id);
    expect(e.draft).toBeNull();
    expect(e.variantLog.drafts).toEqual([{ tileId: id, lap: 1 }]);
  });
  it('봇은 시너지가 생기는 카드를 골라 바로 놓는다', () => {
    const e = exp();
    road(e, { 1: 'prey-nest-a' });
    e.pos = 0;
    e.phase = 'nest-choice';
    e.draft = { lap: 1, options: ['env-fog', 'prey-nest-b', 'elite-den-a'], picked: null };
    botDraft(e);
    expect(e.draft.picked).toBe(1);
    expect(e.slots[2]).toBe('prey-nest-b');
  });
});

describe('③ 이벤트 타일', () => {
  function onEvent(id: string, o: { gold?: number; f?: string } = {}) {
    const e = exp(o.f ?? 'hollow', { gold: o.gold ?? 0 });
    road(e, { 4: id });
    const ev = stepTo(e, 4);
    expect(ev).toMatchObject({ kind: 'event', cell: 4 });
    expect(e.phase).toBe('event');
    return e;
  }
  it('상인: 골드로 1개, 모자라면 못 산다, 산 먹이는 전리품. 타일은 사라진다', () => {
    const e = onEvent('event-merchant', { gold: 20 });
    const offers = e.eventPending!.offers!;
    expect(offers.length).toBe(TV.events.merchant.foodOffers + 1);
    const cheap = offers.findIndex((o) => o.price <= 20);
    const dear = offers.findIndex((o) => o.price > 20);
    expect(resolveEvent(e, dear)).toEqual({ ok: false, reason: '골드가 모자란다' });
    if (cheap >= 0) {
      expect(resolveEvent(e, cheap).ok).toBe(true);
      expect(goldAvailable(e)).toBe(20 - offers[cheap]!.price);
      expect(e.foodLoot.length + e.hand.length).toBe(1);
    } else expect(resolveEvent(e, null).ok).toBe(true);
    expect(e.slots[4]).toBeNull();
    expect(e.phase).toBe('moving');
    expect(e.variantLog.events.length).toBe(1);
  });
  it('제단: 리스크 +15, 장착 특성 위력 +10% (전투 블록 위력에 반영)', () => {
    const e = exp();
    const skill = TRAITS.find((t) => t.kind === 'skill' && t.role === 'attack' && !t.rare && t.element !== 'normal')!; // C.184: 노멀 = 기본 블록
    gainTrait(e.build, skill.id);
    road(e, { 4: 'event-altar', 5: 'prey-nest-a' });
    stepTo(e, 4);
    expect(e.eventPending!.traits).toEqual([skill.id]);
    const r0 = e.risk;
    resolveEvent(e, 0);
    expect(e.risk).toBe(r0 + TV.events.altar.risk);
    expect(e.traitBoosts[skill.id]).toBeCloseTo(TV.events.altar.traitPower);
    stepTo(e, 5);
    const sk = e.pending!.params.skills!.find((s) => s.id === skill.id)!;
    expect(sk.powerMultiplier).toBeCloseTo(1 + TV.events.altar.traitPower);
  });
  it('보물: 희귀 먹이 또는 골드', () => {
    const e = onEvent('event-treasure');
    const t = e.eventPending!.treasure!;
    resolveEvent(e, null);
    if (t.food) expect(e.foodLoot.map((x) => x.food)).toEqual([t.food]);
    else expect(goldAvailable(e)).toBe(t.gold);
  });
  it('함정: 다음 전투 시작 체력 −20%·이기면 보상 배율', () => {
    const e = onEvent('event-trap');
    resolveEvent(e, null);
    expect(e.trapArmed).toBe(true);
    road(e, { 6: 'prey-nest-a' });
    stepTo(e, 6);
    expect(e.pending!.trap).toBe(true);
    expect(e.pending!.params.playerStartHpFraction).toBe(TV.events.trap.startHpFraction);
    expect(e.pending!.mods!.rewardMult).toBe(TV.events.trap.rewardMult);
    const c = startBattle(e);
    expect(c.player.hp).toBeCloseTo(c.player.maxHp * TV.events.trap.startHpFraction);
    expect(e.trapArmed).toBe(false);
  });
  it('갈림길: 고르지 않으면 안 된다, 0 = 다음 전투 보호막, 1 = 골드', () => {
    const e = onEvent('event-crossroads');
    expect(resolveEvent(e, null).ok).toBe(false);
    expect(resolveEvent(e, 1).ok).toBe(true);
    expect(goldAvailable(e)).toBe(TV.events.crossroads.gold);
    const f = onEvent('event-crossroads');
    resolveEvent(f, 0);
    expect(f.nextShield).toBe(TV.events.crossroads.shield);
  });
  it('이벤트 타일은 전투를 일으키지 않는다(봇 원정이 끝까지 돈다)', () => {
    const e = exp('shinigami', { seed: 11 });
    playExpedition(e, { returnAfterLap: 4, absorb: 'absorb' });
    expect(e.phase).toBe('ended');
    for (const b of e.battles) expect(b).toBeDefined();
  });
});

describe('④ 바퀴 변이', () => {
  it('1바퀴는 없음, 2바퀴부터 약 30%', () => {
    const rng = createRng(3);
    expect(rollMutation(rng, 1)).toBeNull();
    let n = 0;
    for (let i = 0; i < 1000; i++) if (rollMutation(rng, 2)) n++;
    expect(n / 1000).toBeGreaterThan(0.25);
    expect(n / 1000).toBeLessThan(0.35);
  });
  it('굶주림: 허기 ×2, 고요: 적 체력 −15%, 피의 달: 흡수 후보 +1, 폭풍: 강적 영혼 결정 +1', () => {
    const e = exp();
    road(e, { 5: 'elite-den-a' });
    e.mutation = 'famine';
    const h0 = e.hunger;
    stepTo(e, 3);
    expect(e.hunger - h0).toBeCloseTo(BALANCE.provisional.expedition.hungerPerTile * 2, 5);
    const ref = exp();
    road(ref, { 5: 'elite-den-a' });
    stepTo(ref, 5);
    e.mutation = 'calm';
    stepTo(e, 5);
    expect(e.pending!.enemy.hpInAttacks).toBeCloseTo(ref.pending!.enemy.hpInAttacks * 0.85, 5);
    e.mutation = 'storm';
    e.pending = null;
    e.elitesThisLap = 0;
    stepTo(e, 5);
    expect(e.pending!.mods!.eliteSoulBonus).toBe(1);
    winBattle(e);
    expect(e.bonusSoul).toBe(1);
    expect(combineMods(TV.mutations['blood-moon'] as never).absorbBonus).toBe(1);
  });
  it('2바퀴 시작에 굴리고 기록에 남긴다', () => {
    let found = false;
    for (let s = 1; s < 60 && !found; s++) {
      const e = exp('hollow', { seed: s });
      road(e, {});
      stepTo(e, 0);
      chooseContinue(e);
      if (e.mutation) {
        found = true;
        expect(e.variantLog.mutations).toEqual([{ id: e.mutation, lap: 2 }]);
      }
    }
    expect(found).toBe(true);
  });
});

describe('⑤ 상위 타일·합성', () => {
  it('강적 소굴+ 보상 ×1.5·강적 체력 +10%, 환경+ 효과 ×1.5, 휴식+ 회복 ×2', () => {
    const a = exp();
    road(a, { 5: 'elite-den-a' });
    stepTo(a, 5);
    const b = exp();
    road(b, { 5: 'elite-den-a-plus' });
    stepTo(b, 5);
    expect(b.pending!.mods!.rewardMult).toBe(1.5);
    expect(b.pending!.enemy.hpInAttacks).toBeCloseTo(a.pending!.enemy.hpInAttacks * 1.1, 5);
    const c = exp();
    road(c, { 5: 'env-wasteland-plus' });
    stepTo(c, 5);
    expect(c.pending!.params.playerPowerMultiplier).toBeCloseTo(1 + 0.3 * 1.5, 5);
    const d = exp();
    road(d, { 5: 'rest-a-plus' });
    stepTo(d, 5);
    expect(d.restMult).toBe(2);
  });
  it('합성: 같은 타일 3장 → 상위 1장, 3장 미만·상위·이벤트는 안 된다 (C.140: 덱 없음)', () => {
    const s = newSaveData('hollow', 1);
    s.tiles.collection['prey-nest-a'] = 4;
    expect(synthesizeTile(s, 'prey-nest-a')).toEqual({ ok: true, upgradedId: 'prey-nest-a-plus' });
    expect(s.tiles.collection['prey-nest-a']).toBe(1);
    expect(s.tiles.collection['prey-nest-a-plus']).toBe(1);
    expect(synthesizeTile(s, 'prey-nest-a').ok).toBe(false);
    s.tiles.collection['prey-nest-a-plus'] = 5;
    expect(synthesizeTile(s, 'prey-nest-a-plus').ok).toBe(false);
    expect(synthesizeTile(s, 'event-merchant').ok).toBe(false);
    expect(synthesizeTile(s, 'env-barrier').ok).toBe(false); // 호로가 쓰지 않는 타일
    expect(sanitizeDeck({ ...s.tiles, deck: ['prey-nest-a-plus'] }, 'hollow')).toEqual(['prey-nest-a-plus']);
  });
});

describe('전투 재료 (GDD 25-5)', () => {
  const enemy = ENEMIES.find((x) => x.class === 'normal' && !x.testOnly)!;
  it('시작 체력 비율·보호막·선공', () => {
    const c = createCombat(1, { enemy, params: { playerStartHpFraction: 0.5, startShieldFraction: 0.2, enemyFirstStrike: true } });
    expect(c.player.hp).toBeCloseTo(c.player.maxHp * 0.5);
    expect(c.player.shield).toBeCloseTo(c.player.maxHp * 0.2);
    expect(c.enemy.attackTimer).toBe(1);
    const hp0 = c.player.hp;
    for (let i = 0; i < 3; i++) step(c);
    expect(c.player.hp).toBe(hp0); // 첫 공격은 보호막이 막는다
    expect(c.player.shield!).toBeLessThan(c.player.maxHp * 0.2);
  });
});

describe('골드·런 로그·세이브', () => {
  it('전투 승리 골드, 패배하면 마지막 바퀴에 번 것만 잃는다(쓴 것은 그대로)', () => {
    const e = exp('hollow', { gold: 100 });
    road(e, { 3: 'prey-nest-a' });
    stepTo(e, 3);
    winBattle(e);
    expect(goldAvailable(e)).toBe(100 + BALANCE.provisional.gold.normal);
    e.goldLoot.push({ amount: -30, lap: 1 });
    e.phase = 'ended';
    e.outcome = 'defeated';
    e.endReason = 'battle-lost';
    const s = summarize(e);
    expect(s.lostGold).toBe(BALANCE.provisional.gold.normal);
    expect(s.keptGold).toBe(-30);
  });
  it('귀환하면 세이브 골드·영혼 결정(폭풍)·런 로그(시너지·변이·이벤트·드래프트)', () => {
    const s = newSaveData('hollow', 1);
    s.shared.tradeCoins = 10;
    const e = exp('hollow', { gold: 10 });
    road(e, { 3: 'prey-nest-a', 4: 'prey-nest-b' });
    stepTo(e, 3);
    winBattle(e);
    e.bonusSoul = 2;
    e.variantLog.events.push({ event: 'trap', choice: 'armed', lap: 1 });
    e.variantLog.mutations.push({ id: 'calm', lap: 1 });
    stepTo(e, 0);
    chooseDraft(e, 0);
    chooseReturn(e);
    const soul0 = s.shared.soulCrystals;
    recordExpedition(s, e, 5);
    expect(s.shared.tradeCoins).toBe(10 + BALANCE.provisional.gold.normal);
    expect(s.shared.soulCrystals).toBe(soul0 + 2);
    const run = s.runLog.runs[0]!;
    expect(run.synergies).toEqual(['pack']);
    expect(run.events).toEqual([{ event: 'trap', choice: 'armed', lap: 1 }]);
    expect(run.mutations).toEqual([{ id: 'calm', lap: 1 }]);
    expect(run.drafts!.length).toBe(1);
    expect(run.gold).toBe(BALANCE.provisional.gold.normal);
    expect(buildRunRecord(e).gold).toBe(run.gold);
  });
  it('세이브 형식 21: 옛 원정 기록에 빈 목록·0', () => {
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 5))) as { meta: { format: number }; runLog: { runs: unknown[] } };
    old.meta.format = 20;
    old.runLog.runs = [{ runId: 1, laps: 2, outcome: 'returned', gained: [], lost: [], endReason: 'returned', seed: 1, factionId: 'hollow', gainedTraits: [], lostTraits: [], riskPeak: 0, breakthrough: false, groundId: 'outskirts' }];
    const m = migrateSave(old)!;
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(21);
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.runLog.runs[0]).toMatchObject({ synergies: [], mutations: [], events: [], drafts: [], gold: 0 });
  });
  it('원정 중간 저장 형식 5: 이벤트·드래프트 진행 왕복, 깨진 값·옛 형식은 이어하지 않는다', () => {
    expect(EXPEDITION_SNAPSHOT_VERSION).toBeGreaterThanOrEqual(5);
    const e = exp('hollow', { gold: 40 });
    road(e, { 4: 'event-merchant' });
    stepTo(e, 4);
    const snap = serializeExpedition(e, 2)!;
    const r = restoreExpedition(JSON.parse(JSON.stringify(snap)));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.exp.phase).toBe('event');
      expect(r.exp.eventPending).toEqual(e.eventPending);
      expect(resolveEvent(r.exp, null).ok).toBe(true);
    }
    const f = exp();
    road(f, {});
    stepTo(f, 0);
    chooseDraft(f, 2);
    const r2 = restoreExpedition(JSON.parse(JSON.stringify(serializeExpedition(f, 1))));
    expect(r2.ok && r2.exp.draft).toEqual(f.draft);
    const bad = JSON.parse(JSON.stringify(snap));
    bad.exp.mutation = 'nope';
    expect(restoreExpedition(bad)).toEqual({ ok: false, reason: 'corrupt' });
    const bad2 = JSON.parse(JSON.stringify(snap));
    bad2.exp.eventPending = null;
    expect(restoreExpedition(bad2)).toEqual({ ok: false, reason: 'corrupt' });
    const old = JSON.parse(JSON.stringify(snap));
    old.version = 4;
    expect(restoreExpedition(old)).toEqual({ ok: false, reason: 'version' });
  });
});

describe('표시 문구', () => {
  it('효과 묶음·이벤트·상위 타일 설명은 수치에서', () => {
    expect(variantModsText(TV.synergies.ambush as never)).toContain('적이 먼저 공격');
    expect(variantModsText(TV.mutations.calm as never)).toEqual(['골드 −30%', '적 체력 −15%']);
    expect(variantModsText(TV.mutations['blood-moon'] as never, 'hollow')[0]).toMatch(/속성 적 ↑/);
    expect(eventHint('trap')).toContain('−20%');
    expect(tileHint(getTile('rest-a-plus'))).toContain('휴식 회복 ×2');
    expect(tileHint(getTile('event-altar'))).toContain(`+${TV.events.altar.risk}`);
  });
  it('바탕 타일 목록에는 상위·이벤트가 없다', () => {
    expect(baseTilesFor('hollow').every((t) => !t.upgradeOf && t.kind !== 'event')).toBe(true);
  });
});
