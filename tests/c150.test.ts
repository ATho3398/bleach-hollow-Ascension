// C.150 장비 시스템 (GDD 91장 v5.187 확정, 가칭·provisional) + 같은 속성 3개 보너스 삭제·흡수 화면 문구 (94장 B 후속)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { GEAR_KINDS, GEAR_SLOTS, GEAR_SLOT_KIND } from '../src/data/gear';
import { getGoldItem, getWandererItem } from '../src/data/shop';
import { buildCombatParams } from '../src/engine/absorb';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { advance, chooseRelease, createExpedition, finishBattle, finishRest, startBattle, type ExpeditionState } from '../src/engine/expedition';
import {
  applyGearToParams, carryOfItems, enhanceCost, equipGear, gearCarry, gearLineValue, gearStatsOf, grantGear, newGearState, referenceLoadout, rollGear, sanitizeGear, type GearRoll,
} from '../src/engine/gear';
import { refStatOf } from '../src/engine/evolution';
import { migrateSave, newSaveData, recordExpedition, type SaveData } from '../src/game';
import { enhanceGearItem, equipGearItem, gearName, gearSlotName, gearSpecialText, inventoryOf, sellGearEntry, unequipGearItem } from '../src/inventory';
import { buyShopItem, buyWandererItem, goldRows } from '../src/shop';

const H = getFaction('hollow');
const S = getFaction('shinigami');
const GX = BALANCE.provisional.gear;
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** 0,1,2,… 를 돌려주는 고정 난수 (값 / n) */
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]!; };

const weapon = (over: Partial<GearRoll> = {}): GearRoll => ({ kind: 'weapon', grade: 'rare', star: 1, stats: { atk: 5 }, special: null, ...over });

/** 원정을 바퀴 끝까지 (전투는 이긴 것으로, 흡수는 놓아줌) */
function walkLap(e: ExpeditionState): void {
  for (let i = 0; i < 300 && e.phase !== 'nest-choice' && e.phase !== 'ended'; i++) {
    if (e.phase === 'battle') {
      const b = startBattle(e);
      b.status = 'won';
      finishBattle(e, b);
    } else if (e.phase === 'absorb') chooseRelease(e);
    else if (e.phase === 'rest') finishRest(e);
    else advance(e);
  }
}

describe('91장 장비 데이터 (가칭)', () => {
  it('칸 5개 = 무기·방어구·신발·장신구 1·2 (장신구 두 칸은 같은 종류), 칸 이름은 종족 설정', () => {
    expect(GEAR_SLOTS).toEqual(['weapon', 'armor', 'shoes', 'acc1', 'acc2']);
    expect(GEAR_KINDS).toEqual(['weapon', 'armor', 'shoes', 'accessory']);
    expect([GEAR_SLOT_KIND.acc1, GEAR_SLOT_KIND.acc2]).toEqual(['accessory', 'accessory']);
    expect(GEAR_SLOTS.map((s) => H.gearSlotNames[s])).toEqual(['송곳니', '껍질', '발톱 싸개', '부적', '부적']);
    expect(GEAR_SLOTS.map((s) => S.gearSlotNames[s])).toEqual(['칼자루 장식', '사패장', '짚신', '부적', '부적']);
    expect(gearSlotName('acc2', H)).toBe('부적 2');
    expect(gearSlotName('weapon', S)).toBe('칼자루 장식');
    expect(gearName({ kind: 'armor', grade: 'legendary', plus: 3 }, H)).toBe('전설 껍질 +3');
  });

  it('굴림: 무기 = 힘/지능 1줄 · 방어구 = 체력·방어 · 신발 = 속도 · 장신구 1~2줄, 영웅·전설만 특수 효과', () => {
    const w = rollGear({ kind: 'weapon', grade: 'normal', star: 1 }, seq([0.9]));
    expect(Object.keys(w.stats)).toEqual(['int']);
    expect(w.special).toBeNull();
    expect(Object.keys(rollGear({ kind: 'armor', grade: 'rare', star: 1 }, seq([0])).stats).sort()).toEqual(['def', 'hp']);
    expect(Object.keys(rollGear({ kind: 'shoes', grade: 'rare', star: 1 }, seq([0])).stats)).toEqual(['spd']);
    expect(Object.keys(rollGear({ kind: 'accessory', grade: 'rare', star: 1 }, seq([0])).stats)).toHaveLength(1);
    const two = rollGear({ kind: 'accessory', grade: 'legendary', star: 3 }, seq([0.99, 0]));
    expect(Object.keys(two.stats)).toHaveLength(2);
    expect(two.stats.crit).toBe(GX.critLine.legendary);
    expect(two.special).not.toBeNull();
    expect(rollGear({ kind: 'weapon', grade: 'epic', star: 1 }, seq([0])).special).toEqual({ id: 'sp-family-a', value: GX.special.family![0] });
    expect(gearSpecialText({ special: { id: 'sp-family-a', value: 0.1 } }, H)).toBe('조(爪) 블록 피해 +10%');
    expect(gearSpecialText({ special: { id: 'sp-elite', value: 0.08 } }, H)).toBe('강적·보스에게 피해 +8%');
  });

  it('값 = ★ 기준 능력치 × 등급 비율 × 종류 가중 (★·등급이 높을수록 크다)', () => {
    expect(gearLineValue('weapon', 'rare', 1, 'atk')).toBe(Math.round(refStatOf(0) * GX.lineFrac.rare!));
    expect(gearLineValue('weapon', 'rare', 5, 'atk')).toBeGreaterThan(gearLineValue('weapon', 'rare', 1, 'atk'));
    expect(gearLineValue('weapon', 'legendary', 3, 'atk')).toBeGreaterThan(gearLineValue('weapon', 'normal', 3, 'atk'));
    expect(gearLineValue('shoes', 'normal', 9, 'spd')).toBe(gearLineValue('shoes', 'normal', 5, 'spd')); // ★ 상한
  });
});

describe('91장 강화·장착·판매 (보관함)', () => {
  it('강화 +1~+5 실패 없음, 단계마다 능력치 +10%p, 비용 = 등급 비용 × (단계 + 1), 런 로그 enhance', () => {
    const s = newSaveData('hollow', 0);
    const it = grantGear(s.shared.gear, weapon({ stats: { atk: 10, crit: 0.02 } }), 1)!;
    expect(enhanceCost(it)).toBe(GX.enhanceCost.rare!);
    expect(enhanceGearItem(s, it.uid)).toEqual({ ok: false, reason: `골드가 ${GX.enhanceCost.rare} 모자라다` });
    s.shared.tradeCoins = 10_000;
    for (let i = 1; i <= GX.maxPlus; i++) expect(enhanceGearItem(s, it.uid, 5)).toMatchObject({ ok: true, plus: i, gold: GX.enhanceCost.rare! * i });
    expect(enhanceGearItem(s, it.uid)).toMatchObject({ ok: false });
    expect(s.shared.tradeCoins).toBe(10_000 - GX.enhanceCost.rare! * 15);
    expect(gearStatsOf(it)).toEqual({ atk: 15, crit: 0.03 });
    expect(gearStatsOf(it, 2)).toEqual({ atk: 12, crit: 0.024 });
    expect([0, 1, 3, 5].map((p) => gearStatsOf({ stats: { int: 3 }, plus: p }).int)).toEqual([3, 4, 6, 8]); // 작은 값은 단계마다 최소 +1
    expect(s.runLog.gear.filter((r) => r.kind === 'enhance').map((r) => r.plus)).toEqual([1, 2, 3, 4, 5]);
  });

  it('장착: 장신구는 빈 칸부터 두 칸, 셋째는 첫 칸 교체 · 다른 종류 칸은 거절 · 원정 중 잠금 · 해제 · 낀 장비는 못 판다', () => {
    const s = newSaveData('hollow', 0);
    const g = s.shared.gear;
    const acc = (n: number) => grantGear(g, { kind: 'accessory', grade: 'normal', star: 1, stats: { spr: n }, special: null }, n)!;
    const [a, b, c] = [acc(1), acc(2), acc(3)];
    expect(equipGearItem(s, a.uid)).toBe('acc1');
    expect(equipGearItem(s, b.uid)).toBe('acc2');
    expect(equipGearItem(s, c.uid)).toBe('acc1');
    expect(g.equipped).toMatchObject({ acc1: c.uid, acc2: b.uid });
    expect(equipGear(g, a.uid, 'weapon')).toBeNull();
    expect(equipGearItem(s, a.uid, 'acc2')).toBe('acc2');
    expect(s.runLog.gear.map((r) => r.kind)).toEqual(['equip', 'equip', 'unequip', 'equip', 'unequip', 'equip']);
    expect(sellGearEntry(s, a.uid)).toBeNull();
    expect(unequipGearItem(s, a.uid)).toBe(true);
    s.shared.tradeCoins = 0;
    expect(sellGearEntry(s, a.uid)).toBe(GX.sellGold.normal);
    expect(s.shared.tradeCoins).toBe(GX.sellGold.normal);
    s.activeExpedition = {} as SaveData['activeExpedition'];
    expect(equipGearItem(s, b.uid, 'acc1')).toBeNull();
    expect(inventoryOf(s, H).find((e) => e.id === c.uid)!.lock).toBe('원정 중에는 바꿀 수 없다');
  });

  it('보관함 장비 탭: 낀 것 먼저 · 이름 "등급 칸이름 +n" · 등급·낀 칸 정보', () => {
    const s = newSaveData('hollow', 0);
    const a = grantGear(s.shared.gear, weapon({ grade: 'normal' }), 1)!;
    const b = grantGear(s.shared.gear, { kind: 'shoes', grade: 'legendary', star: 2, stats: { spd: 9 }, special: { id: 'sp-elite', value: 0.12 } }, 2)!;
    equipGearItem(s, a.uid);
    const rows = inventoryOf(s, H).filter((e) => e.category === 'equipment');
    expect(rows.map((e) => e.id)).toEqual([a.uid, b.uid]);
    expect(rows[0]).toMatchObject({ name: '노말 송곳니', action: 'unequip', gear: { grade: 'normal', kind: 'weapon', slot: 'weapon' } });
    expect(rows[1]).toMatchObject({ name: '전설 발톱 싸개', action: 'equip', detail: '속도 +9 · 강적·보스에게 피해 +12%' });
  });
});

describe('91장 전투 효과 (능력치·치명·특수 효과)', () => {
  const base = () => {
    const s = newSaveData('hollow', 0);
    const p = buildCombatParams(s.build, 'hollow');
    applyEvolutionToParams(p, s.evolution, 'hollow');
    return p;
  };

  it('낀 장비 능력치·치명 확률이 더해지고, 계열 블록 피해·치명 피해·시작 보호막, 강적 피해는 강적·보스만', () => {
    const p0 = base();
    const carry = carryOfItems([
      { stats: { atk: 10, crit: 0.02 }, plus: 0, special: { id: 'sp-family-a', value: 0.1 } },
      { stats: { hp: 6 }, plus: 1, special: { id: 'sp-elite', value: 0.08 } },
      { stats: { spd: 4 }, plus: 0, special: { id: 'sp-crit-damage', value: 0.15 } },
      { stats: { spr: 3 }, plus: 0, special: { id: 'sp-shield', value: 0.03 } },
    ]);
    const p = base();
    applyGearToParams(p, carry, false);
    expect(p.playerStats!.atk).toBe(p0.playerStats!.atk + 10);
    expect(p.playerStats!.hp).toBe(p0.playerStats!.hp + 7);
    expect(p.critChance).toBeCloseTo((p0.critChance ?? BALANCE.provisional.combat.critChance) + 0.02);
    expect(p.critMultiplier).toBeCloseTo(BALANCE.provisional.combat.critMultiplier + 0.15);
    expect(p.startShieldFraction).toBeCloseTo(0.03);
    expect(p.families!['family-a']!.tiers[0]!.multiplier).toBeCloseTo(p0.families!['family-a']!.tiers[0]!.multiplier * 1.1);
    expect(p.families!['family-b']).toEqual(p0.families!['family-b']);
    expect(p.playerPowerMultiplier ?? 1).toBe(p0.playerPowerMultiplier ?? 1);
    const strong = base();
    applyGearToParams(strong, carry, true);
    expect(strong.playerPowerMultiplier).toBeCloseTo((p0.playerPowerMultiplier ?? 1) * 1.08);
    const none = base();
    applyGearToParams(none, null, true);
    expect(none).toEqual(p0);
  });

  it('원정: 출발 때 낀 장비가 전투에 실린다 · 장비 없음(기준 봇)은 예전과 같다', () => {
    const s = newSaveData('hollow', 0);
    equipGear(s.shared.gear, grantGear(s.shared.gear, weapon({ stats: { atk: 9 } }), 1)!.uid);
    const mk = (gear: ReturnType<typeof gearCarry>) => createExpedition({ factionId: 'hollow', seed: 11, hunger: 0, condition: 80, deck: ['prey-nest-a'], build: s.build, evolution: s.evolution, gear });
    const withGear = mk(gearCarry(s.shared.gear));
    const plain = mk(null);
    for (const e of [withGear, plain]) while (e.phase === 'moving') advance(e);
    expect(withGear.pending!.params.playerStats!.atk).toBe(plain.pending!.params.playerStats!.atk + 9);
    expect(withGear.pending!.enemy).toEqual(plain.pending!.enemy);
  });
});

describe('91장 얻는 법 (원정 드롭·기본 상점·떠돌이 상인)', () => {
  const run = (seed: number, gearDrops: boolean) => {
    const e = createExpedition({ factionId: 'hollow', seed, hunger: 0, condition: 80, deck: ['prey-nest-a', 'elite-den-a', 'prey-nest-a'], gearDrops });
    walkLap(e);
    return e;
  };

  it('드롭은 따로 만든 난수: 켜도 전투·전리품은 같다 · 같은 시드 = 같은 드롭 · 끄면(기준 봇) 없음', () => {
    let found = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const on = run(seed, true);
      const off = run(seed, false);
      expect(on.battles).toEqual(off.battles);
      expect(on.goldLoot).toEqual(off.goldLoot);
      expect(off.gearFinds).toBeUndefined();
      expect(run(seed, true).gearFinds).toEqual(on.gearFinds);
      for (const f of on.gearFinds ?? []) {
        expect(f.roll.star).toBe(1);
        expect(['normal', 'elite', 'boss']).toContain(f.from);
      }
      found += on.gearFinds?.length ?? 0;
    }
    expect(found).toBeGreaterThan(0);
    expect(GX.dropChance.elite).toBeGreaterThan(GX.dropChance.normal);
    expect(GX.dropChance.boss).toBeGreaterThan(GX.dropChance.elite);
  });

  it('귀환 정산: 드롭 장비 → 보관함(런 로그 get, 지고 와도) · 가득이면 바로 판 골드(autoSell)', () => {
    const save = newSaveData('hollow', 0);
    const exp = createExpedition({ factionId: 'hollow', seed: 3, hunger: 20, condition: 80, deck: [], build: save.build, evolution: save.evolution });
    Object.assign(exp, { phase: 'ended', outcome: 'defeated', endReason: 'battle-lost', lapsCompleted: 1, gearFinds: [{ roll: weapon(), lap: 1, from: 'elite' }] });
    recordExpedition(save, exp, 50);
    expect(save.shared.gear.items).toHaveLength(1);
    expect(save.runLog.gear[0]).toMatchObject({ kind: 'get', source: 'drop', from: 'elite', gearKind: 'weapon', grade: 'rare', uid: 'g1' });
    for (let i = 1; i < GX.cap; i++) grantGear(save.shared.gear, weapon(), i);
    const coins = save.shared.tradeCoins;
    const exp2 = createExpedition({ factionId: 'hollow', seed: 4, hunger: 20, condition: 80, deck: [], build: save.build, evolution: save.evolution });
    Object.assign(exp2, { phase: 'ended', outcome: 'returned', endReason: 'returned', lapsCompleted: 1, gearFinds: [{ roll: weapon({ grade: 'epic' }), lap: 1, from: 'boss' }] });
    recordExpedition(save, exp2, 60);
    expect(save.shared.gear.items).toHaveLength(GX.cap);
    expect(save.runLog.gear.at(-1)).toMatchObject({ kind: 'autoSell', gold: GX.sellGold.epic });
    expect(save.shared.tradeCoins - coins).toBeGreaterThanOrEqual(GX.sellGold.epic!);
  });

  it('기본 상점 장비 탭 = 노말 종류별 4개(★ = 권장) · 떠돌이 상인 = 레어·영웅·전설', () => {
    const s = newSaveData('hollow', 0);
    const rows = goldRows(s, H).filter((r) => getGoldItem(r.id)?.kind === 'gear');
    expect(rows.map((r) => [r.name, r.price])).toEqual([['노말 송곳니', GX.shopPrice], ['노말 껍질', GX.shopPrice], ['노말 발톱 싸개', GX.shopPrice], ['노말 부적', GX.shopPrice]]);
    s.shared.tradeCoins = 500;
    expect(buyShopItem(s, H, 'gear-shoes', 9, () => 0)).toMatchObject({ ok: true, detail: '노말 발톱 싸개 → 보관함 장비 탭' });
    expect(s.shared.gear.items[0]).toMatchObject({ kind: 'shoes', grade: 'normal', star: 1 });
    expect(s.runLog.gear[0]).toMatchObject({ kind: 'get', source: 'shop' });
    expect(['w-gear-rare', 'w-gear-epic', 'w-gear-legend'].map((id) => getWandererItem(id)!.grade)).toEqual(['rare', 'epic', 'legendary']);
    s.shared.tradeCoins = 5000;
    s.shared.wanderer.visit = { at: 1, runId: 1, tier: 4, stock: [{ itemId: 'w-gear-legend', price: 1500, sold: false }] };
    expect(buyWandererItem(s, H, 'w-gear-legend', 10, () => 0.5).ok).toBe(true);
    expect(s.shared.gear.items[1]).toMatchObject({ grade: 'legendary' });
    expect(s.shared.gear.items[1]!.special).not.toBeNull();
  });
});

describe('91장 세이브·참고 줄', () => {
  it('공용 보관함(shared.gear): 저장·불러오기로 남고, 깨진 값·칸에 안 맞는 장착은 정리', () => {
    const s = newSaveData('hollow', 0);
    const it = grantGear(s.shared.gear, weapon(), 1)!;
    equipGearItem(s, it.uid);
    const raw = JSON.parse(JSON.stringify(s));
    const m = migrateSave(raw)!;
    expect(m.shared.gear).toEqual(s.shared.gear);
    expect(m.runLog.gear).toHaveLength(1);
    raw.shared.gear = { items: [{ uid: 'g1', kind: 'armor', grade: 'rare', star: 99, stats: { hp: 4, nope: 3 }, plus: 77, special: { id: 'sp-x', value: 1 } }, { uid: 'g2', kind: 'hat' }], equipped: { weapon: 'g1', armor: 'g1' }, nextId: 'x' };
    const g = migrateSave(JSON.parse(JSON.stringify(raw)))!.shared.gear;
    expect(g.items).toEqual([{ uid: 'g1', kind: 'armor', grade: 'rare', star: 5, stats: { hp: 4 }, special: null, plus: GX.maxPlus, gotAt: 0 }]);
    expect(g.equipped).toEqual({ weapon: null, armor: 'g1', shoes: null, acc1: null, acc2: null });
    expect(g.nextId).toBe(2);
    expect(sanitizeGear(undefined)).toEqual(newGearState());
  });

  it('balance:check 참고 줄 = 그 단계 평균 장비(5칸 레어 +2, ★ 권장) — 단계가 오를수록 크다', () => {
    const r1 = referenceLoadout(0);
    const r5 = referenceLoadout(4);
    expect(Object.keys(r1.stats).sort()).toEqual(['atk', 'def', 'hp', 'spd', 'spr']);
    expect(r5.stats.atk!).toBeGreaterThan(r1.stats.atk!);
    expect(r1.crit).toBeCloseTo(2 * GX.critLine.rare! * 1.2);
    expect(read('scripts/balance.ts')).toContain('참고 — 그 단계 평균 장비');
  });
});

describe('94장 B 후속: 같은 속성 3개 보너스 삭제 · 흡수 화면 문구', () => {
  it('흡수 화면: 가진 속성이면 갈래 설명이 "강화", n/3 표시 없음, 임시 데이터 문구는 테스트 모드에서만', () => {
    const src = read('src/ui/absorbView.ts');
    expect(src).toContain("owned() && m !== 'stat' ? MODE_LABELS[m].sub.replace('특성', '강화')"); // C.171: 표 대신 버튼 아래 글
    expect(src).not.toContain('elementBonusCount');
    expect(src).not.toContain('completedElements');
    expect(src).toMatch(/devText\(\) \? \[\.\.\.parts\.main, el\('p', 'bha-faint', PROVISIONAL_NOTE\)\] : parts\.main/); // C.171: 개발용 문구 스위치 하나(devText = 테스트 모드)
    expect('elementBonusCount' in BALANCE.provisional.absorb).toBe(false);
    expect('elementSkillBonus' in BALANCE.provisional.absorb).toBe(false);
  });
});
