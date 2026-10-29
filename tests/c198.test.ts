// C.198 (GDD 123장 1·2·3·4·6): 초반 긴장감(★1 기본 공격 묶음·적 공격 배율) · 홈 체력 유지 · 방 발밑 체력 막대 · 홈 회복(대기·온천·먹이·체력 포션) · 세이브 마이그레이션 54 → 55
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getFaction } from '../src/data/factions';
import { getWandererItem } from '../src/data/shop';
import { createCombat, drainCombatEvents, step } from '../src/engine/combat';
import { carryAttackMult, carryHitPacing, createExpedition } from '../src/engine/expedition';
import { roomOf, ROOM_PROPS } from '../src/engine/faction';
import {
  applyAbsenceTime, applyExpeditionEnd, collapseNest, cureStatus, doNestAction, enterSpa, foodHpHeal, healHomeHp, homeHpCap, homeHpOf, leaveSpa, newNest, passNestTime, previewHomeHp, soakSpa, tickNestOnline,
} from '../src/engine/nest';
import { absenceOf, departHpOf, feedNest, migrateSave, MIN_LOADABLE_SAVE_FORMAT, newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, writeSave, loadSave, type SaveData } from '../src/game';
import { drinkHpPotion, grantFood, grantHpPotion, homeHp, homeMaxHp, HP_POTION_ID, spaEnter, spaLeave, spaSoak } from '../src/home';
import { inventoryOf, useInventoryItem } from '../src/inventory';
import { wandererEffect } from '../src/shop';

const HH = BALANCE.provisional.nest.homeHp;
const MIN = 60_000;
const T0 = 1_700_000_000_000;
const H = getFaction('hollow');

describe('123장 1 초반 긴장감: ★1 적 공격', () => {
  it('★1 적 공격 배율 0.425·기본 공격 묶음 ×4 (provisional), 다른 ★ 은 묶음 없음', () => {
    expect(carryAttackMult(1)).toBe(0.425);
    expect(carryHitPacing(1)).toBe(4);
    for (const st of [2, 3, 4, 5]) expect(carryHitPacing(st)).toBe(1);
    expect(BALANCE_VERSION_OK()).toBe(true);
  });
  it('묶음 ×k = 기본 공격 간격 ×k·한 대 피해 ×k (초당 피해 같음, 한 대가 굵어진다)', () => {
    const hits = (pacing: number) => {
      const s = createCombat(7, { enemy: getEnemy('test-a'), params: { timeLimitSeconds: 1e9, voidChance: 0, enemyDamageVariance: 0, critChance: 0, enemyHitPacing: pacing } });
      s.spawnTimer = 1e9;
      s.player.hp = s.player.maxHp = 1e9;
      s.enemy.hp = s.enemy.maxHp = 1e9;
      const out: number[] = [];
      for (let i = 0; i < 24 * 60; i++) { step(s); for (const e of drainCombatEvents(s)) if (e.kind === 'enemy-attack') out.push(e.damage); }
      return out;
    };
    const a = hits(1), b = hits(4);
    expect(b.length).toBeGreaterThan(0);
    expect(b[0]! / a[0]!).toBeCloseTo(4, 5);
    expect(a.length / b.length).toBeGreaterThan(3.5);
    expect(a.length / b.length).toBeLessThan(4.5);
  });
  it('원정 전투에 묶음이 실린다 — ★1 만, 튜토리얼·보스 제외 (코드 자리)', () => {
    const src = readFileSync('src/engine/expedition/expedition.ts', 'utf8');
    expect(src).toContain('const pace = exp.tutorial || bossId ? 1 : carryHitPacing(exp.difficulty);');
  });
  it("balance:check 에 '초반 긴장감' 가드(1단계 ★1 끝까지 4바퀴 패배 25~55%)", () => {
    const b = readFileSync('scripts/balance.ts', 'utf8');
    expect(b).toContain('초반 긴장감');
    expect(b).toContain('R.defeat < 0.25 || R.defeat > 0.55');
  });
  it("화면 문구 '기본 4바퀴' → '권장 4바퀴'", () => {
    expect(readFileSync('src/ui/resultView.ts', 'utf8')).toContain('/ 권장 ${BALANCE.expedition.defaultLaps}');
    const ex = readFileSync('src/ui/expeditionView.ts', 'utf8');
    expect(ex).toContain('권장 ${EX.defaultLaps}바퀴를 넘겼다');
    expect(ex).not.toContain('기본 ${EX.defaultLaps}바퀴');
  });
});
function BALANCE_VERSION_OK(): boolean {
  return readFileSync('src/config/balance.ts', 'utf8').includes('export const BALANCE_VERSION = 88;');
}

describe('123장 2 홈 체력 = 원정 밖에서도 유지', () => {
  it('새 둥지 가득, 원정 출발 = 홈 체력, 귀환 = 남은 원정 체력(가득 아님)', () => {
    const s = newSaveData('hollow', T0);
    expect(s.nest.hpFraction).toBe(1);
    s.nest.hpFraction = 0.4;
    expect(departHpOf(s)).toBeCloseTo(0.4);
    const exp = createExpedition({ factionId: 'hollow', seed: 1, runId: 1, hunger: 20, condition: 80, deck: [], risk: 0, stability: 50, build: s.build, evolution: s.evolution, hpFraction: departHpOf(s) });
    expect(exp.hpFraction).toBeCloseTo(0.4);
    exp.hpFraction = 0.23;
    exp.outcome = 'returned';
    exp.phase = 'ended';
    applyExpeditionEnd(s.nest, exp, T0);
    expect(s.nest.hpFraction).toBeCloseTo(0.23);
  });
  it('지면 빈사(체력 10%)', () => {
    const s = newSaveData('hollow', T0);
    const exp = createExpedition({ factionId: 'hollow', seed: 1, runId: 1, hunger: 20, condition: 80, deck: [], risk: 0, stability: 50, build: s.build, evolution: s.evolution });
    exp.outcome = 'defeated';
    exp.phase = 'ended';
    exp.endReason = 'battle-lost';
    exp.hpFraction = 0;
    applyExpeditionEnd(s.nest, exp, T0);
    expect(s.nest.collapsed).toBe(true);
    expect(s.nest.hpFraction).toBeCloseTo(BALANCE.provisional.nest.care.dying.hpFraction);
  });
  it('빈사 원정: 출발 = 홈 ÷ 10% (빈사 최대 체력 안의 비율), 귀환 = 원정 비율 × 10%', () => {
    const s = newSaveData('hollow', T0);
    collapseNest(s.nest, T0);
    s.nest.hpFraction = 0.05;
    expect(departHpOf(s)).toBeCloseTo(0.5);
    const exp = createExpedition({ factionId: 'hollow', seed: 1, runId: 1, hunger: 20, condition: 80, deck: [], risk: 0, stability: 50, build: s.build, evolution: s.evolution, care: { weak: false, tired: false, dying: true }, hpFraction: departHpOf(s) });
    exp.hpFraction = 0.8;
    exp.outcome = 'returned';
    exp.phase = 'ended';
    applyExpeditionEnd(s.nest, exp, T0);
    expect(s.nest.hpFraction).toBeCloseTo(0.08);
  });
  it('탑·등급전·훈련·연습은 홈 체력을 건드리지 않는다 (홈 체력은 원정 기록에서만 바뀐다)', () => {
    const g = readFileSync('src/game.ts', 'utf8');
    const tower = g.slice(g.indexOf('export function recordTowerBattle'), g.indexOf('export function liberationAccess'));
    expect(tower).not.toContain('hpFraction');
    const rank = g.slice(g.indexOf('export function recordRankBattle'), g.indexOf('export interface TowerOutcome'));
    expect(rank).not.toContain('hpFraction');
  });
});

describe('123장 3 방 발밑 체력 막대', () => {
  it('기존 체력 막대(meter player)·현재 / 최대 숫자·발 기준(--foot-y)', () => {
    const v = readFileSync('src/ui/roomView.ts', 'utf8');
    expect(v).toContain("meter({ kind: 'player', label: '체력'");
    expect(v).toContain('valueText: `${now} / ${max}`');
    expect(readFileSync('src/ui/bha/room.ts', 'utf8')).toContain("'--foot-y'");
    expect(readFileSync('src/ui/bha/room.css', 'utf8')).toContain('var(--foot-y');
  });
  it('최대 체력 = 원정 전투와 같은 식 (1단계 새 몸 100 남짓)', () => {
    const m = homeMaxHp(newSaveData('hollow', T0));
    expect(m).toBeGreaterThan(80);
    expect(m).toBeLessThan(140);
  });
});

describe('123장 4 홈 회복', () => {
  it('대기 회복 1분 2% (켜 둔 동안·꺼 둔 동안 같다), 빈사 중엔 없음', () => {
    const n = newNest(T0);
    n.hpFraction = 0.5;
    tickNestOnline(n, T0 + 10 * MIN);
    expect(n.hpFraction).toBeCloseTo(0.5 + 10 * HH.idlePerMinute);
    const m = newNest(T0);
    m.hpFraction = 0.5;
    applyAbsenceTime(m, T0, T0 + 10 * MIN);
    expect(m.hpFraction).toBeCloseTo(0.7);
    const d = newNest(T0);
    collapseNest(d, T0);
    d.hpFraction = 0.02;
    tickNestOnline(d, T0 + 30 * MIN);
    expect(d.hpFraction).toBeCloseTo(0.02);
  });
  it('원정 중(paused)이면 홈 체력이 흐르지 않는다', () => {
    const n = newNest(T0);
    n.hpFraction = 0.3;
    tickNestOnline(n, T0 + 60 * MIN, true);
    expect(n.hpFraction).toBeCloseTo(0.3);
  });
  it('온천: 1분에 체력 +10%·배부름 −10, 가득 차면 저절로 나오고 남은 시간은 대기 회복', () => {
    const n = newNest(T0);
    n.hunger = 0;
    n.hpFraction = 0.5;
    expect(enterSpa(n, T0)).toBeNull();
    const f = passNestTime(n, 7 / 60, false, T0 + 7 * MIN);
    // 5분에 가득(+50%), 배부름 −50, 그 뒤 2분은 대기(이미 가득)
    expect(n.hpFraction).toBeCloseTo(1);
    expect(n.spa).toBeNull();
    expect(f.spaEnded?.reason).toBe('full');
    expect(f.spaEnded?.at).toBe(T0 + 5 * MIN);
    expect(100 - n.hunger).toBeGreaterThan(49); // 온천 −50 + 평소 시간 흐름(시간당 −5) 7분
    expect(100 - n.hunger).toBeLessThanOrEqual(50);
  });
  it('온천: 배부름이 0 이 되면 저절로 나온다 (굶지 않게)', () => {
    const n = newNest(T0);
    n.hunger = 80; // 배부름 20 = 2분
    n.hpFraction = 0.1;
    enterSpa(n, T0);
    const f = passNestTime(n, 10 / 60, true, T0 + 10 * MIN);
    expect(f.spaEnded?.reason).toBe('hungry');
    expect(n.spa).toBeNull();
    // 2분 온천(+20%) + 8분 대기(+16%)
    expect(n.hpFraction).toBeCloseTo(0.1 + 0.2 + 0.16, 2);
  });
  it('온천은 앱을 꺼도 유지된다 (꺼 둔 시간에 계산)', () => {
    const n = newNest(T0);
    n.hunger = 0;
    n.hpFraction = 0.2;
    enterSpa(n, T0);
    applyAbsenceTime(n, T0, T0 + 3 * MIN);
    expect(n.spa).not.toBeNull();
    expect(n.hpFraction).toBeCloseTo(0.5);
  });
  it('들어갈 수 없는 경우: 체력 가득·배부름 0·사망·이미 온천', () => {
    const n = newNest(T0);
    expect(enterSpa(n, T0)).toBe('full');
    n.hpFraction = 0.5;
    n.hunger = 100;
    expect(enterSpa(n, T0)).toBe('hungry');
    n.hunger = 0;
    expect(enterSpa(n, T0)).toBeNull();
    expect(enterSpa(n, T0)).toBe('already');
    n.dead = true;
    n.spa = null;
    expect(enterSpa(n, T0)).toBe('dead');
  });
  it('빈사: 온천·먹이·포션 모두 10% 상한, 치료제로 풀린 뒤에는 그 값에서 다시 찬다', () => {
    const s = newSaveData('hollow', T0);
    collapseNest(s.nest, T0);
    expect(homeHpCap(s.nest)).toBe(0.1);
    s.nest.hpFraction = 0.03;
    s.nest.hunger = 0;
    soakSpa(s.nest, 5, T0);
    expect(s.nest.hpFraction).toBeCloseTo(0.1);
    expect(s.nest.spa).toBeNull(); // 상한에 닿아 저절로 나옴
    healHomeHp(s.nest, 0.5);
    expect(s.nest.hpFraction).toBeCloseTo(0.1);
    cureStatus(s.nest, 'collapsed');
    expect(homeHpOf(s.nest)).toBeCloseTo(0.1);
    healHomeHp(s.nest, 0.2);
    expect(s.nest.hpFraction).toBeCloseTo(0.3);
  });
  it('미리 보기는 세이브를 바꾸지 않는다', () => {
    const n = newNest(T0);
    n.hpFraction = 0.5;
    n.hunger = 0;
    enterSpa(n, T0);
    const p = previewHomeHp(n, T0 + 6 * MIN);
    expect(p.fraction).toBeCloseTo(1);
    expect(p.spaEnded?.reason).toBe('full');
    expect(n.hpFraction).toBe(0.5);
    expect(n.spa).not.toBeNull();
  });
  it('모든 먹이가 체력을 조금 채운다 (든든할수록 조금 더)', () => {
    for (const f of ['snack', 'basic', 'hearty', 'tonic', 'feast'] as const) expect(foodHpHeal(f)).toBeGreaterThan(0);
    expect(foodHpHeal('feast')).toBeGreaterThan(foodHpHeal('hearty'));
    expect(foodHpHeal('hearty')).toBeGreaterThan(foodHpHeal('basic'));
    const n = newNest(T0);
    n.hpFraction = 0.5;
    doNestAction(n, 'feed', 'hearty', T0);
    expect(n.hpFraction).toBeCloseTo(0.5 + foodHpHeal('hearty'));
  });
  it('체력 포션: 떠돌이 상인 영웅 품목(드물게), 홈에서 먹으면 가득, 전투 회복약과 다른 물건', () => {
    const w = getWandererItem(HP_POTION_ID)!;
    expect(w.grade).toBe('epic');
    expect(w.category).toBe('consumable');
    expect(HP_POTION_ID).not.toBe('battle-potion');
    expect(wandererEffect(HP_POTION_ID, H)).toContain('체력 가득');
    const s = newSaveData('hollow', T0);
    s.nest.hpFraction = 0.2;
    expect(drinkHpPotion(s, HP_POTION_ID, T0)).toBeNull(); // 없음
    expect(grantHpPotion(s)).toBe(1);
    const card = inventoryOf(s, H).find((e) => e.id === HP_POTION_ID)!;
    expect(card.lock).toBeNull();
    const r = useInventoryItem(s, H, HP_POTION_ID);
    expect(r.ok).toBe(true);
    expect(s.nest.hpFraction).toBe(1);
    expect(s.shared.items[HP_POTION_ID]).toBeUndefined();
    expect(s.runLog.homeHeals.at(-1)).toMatchObject({ kind: 'potion', hpFrom: 0.2, hpTo: 1 });
    grantHpPotion(s);
    expect(inventoryOf(s, H).find((e) => e.id === HP_POTION_ID)!.lock).toBe('체력 이미 가득');
  });
});

describe('123장 4 튜토리얼이 부를 세이브 쪽 API (C.199)', () => {
  it('온천 들어가기 → 바로 쉬기(분) → 나오기, 런 로그 homeHeals spa (tutorial 표시)', () => {
    const s = newSaveData('hollow', T0);
    s.nest.hpFraction = 0.1;
    s.nest.hunger = 0;
    expect(spaEnter(s, T0)).toBeNull();
    expect(homeHp(s).inSpa).toBe(true);
    const r = spaSoak(s, 4, T0, true);
    expect(r.hp).toBeCloseTo(0.4);
    expect(100 - s.nest.hunger).toBeCloseTo(60);
    const e = spaLeave(s, T0 + 4 * MIN, true)!;
    expect(e.reason).toBe('left');
    expect(s.runLog.homeHeals.at(-1)).toMatchObject({ kind: 'spa', reason: 'left', hpFrom: 0.1, hpTo: 0.5, tutorial: true });
  });
  it('먹이 지급 → feedNest (배부름·체력 같이)', () => {
    const s = newSaveData('hollow', T0);
    s.nest.hpFraction = 0.5;
    s.shared.food.hearty = 0;
    expect(grantFood(s, 'hearty', 1)).toBe(1);
    expect(feedNest(s, 'hearty', T0)).toBe('ate');
    expect(s.nest.hpFraction).toBeCloseTo(0.5 + foodHpHeal('hearty'));
  });
  it('체력 포션 각본 값 (123장 5 수정: 튜토리얼은 체력 50%)', () => {
    const s = newSaveData('hollow', T0);
    s.nest.hpFraction = 0.1;
    grantHpPotion(s);
    expect(drinkHpPotion(s, HP_POTION_ID, T0, true, 0.5)).toMatchObject({ hpFrom: 0.1, hpTo: 0.5 });
    expect(s.runLog.homeHeals.at(-1)).toMatchObject({ kind: 'potion', tutorial: true });
  });
  it('원정 중엔 온천에 못 들어간다', () => {
    const s = newSaveData('hollow', T0);
    s.nest.hpFraction = 0.5;
    s.activeExpedition = {} as SaveData['activeExpedition'];
    expect(spaEnter(s, T0)).toBe('expedition');
  });
  it('꺼 둔 동안 온천에서 저절로 나오면 런 로그에 남는다 (absenceOf)', () => {
    const s = newSaveData('hollow', T0);
    s.nest.hpFraction = 0.6;
    s.nest.hunger = 0;
    s.lastSeenAt = T0;
    spaEnter(s, T0);
    absenceOf(s, T0 + 30 * MIN);
    expect(s.nest.spa).toBeNull();
    expect(s.runLog.homeHeals.at(-1)).toMatchObject({ kind: 'spa', reason: 'full', minutes: 4 });
    leaveSpa(s.nest, T0);
  });
});

describe('123장 4 온천 = 방 물건 · 따로 된 화면', () => {
  it('두 종족 방에 온천 물건(이름 = 종족 설정, 둘 다 온천으로 시작)', () => {
    expect(ROOM_PROPS).toContain('spa');
    for (const id of ['hollow', 'shinigami']) expect(roomOf(getFaction(id)).props.spa.startsWith('온천')).toBe(true);
  });
  it('온천 화면: 뒤로 = 나오기(beforeBack), 저절로 나오면 방으로, 그림 키 scene.spa·prop.spa 자리', () => {
    const app = readFileSync('src/ui/app.ts', 'utf8');
    expect(app).toContain("id: 'spa'");
    expect(app).toContain('beforeBack: () => {');
    expect(app).toContain('if (save.nest.spa && !save.nest.dead) openSpa(');
    const m = readFileSync('src/data/art/manifest.ts', 'utf8');
    expect(m).toContain("'scene.spa': {}");
    expect(m).toContain("'prop.spa': {}");
  });
});

describe('123장 6 세이브 유지: 형식 54 → 55 마이그레이션', () => {
  /** 형식 54(C.195) 모양의 세이브: 홈 체력·온천·홈 회복 기록이 없다 */
  const v54 = (): Record<string, unknown> => {
    const s = newSaveData('hollow', T0);
    const raw = JSON.parse(JSON.stringify(s));
    raw.meta.format = 54;
    delete raw.nest.hpFraction;
    delete raw.nest.spa;
    delete raw.runLog.homeHeals;
    raw.shared.tradeCoins = 777;
    raw.evolution.ev.hp = 9;
    return raw;
  };
  it('형식 55·문턱 54 고정, 단계 표에 54 가 있다', () => {
    expect(SAVE_FORMAT_VERSION).toBe(55);
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(54);
    expect(typeof SAVE_MIGRATIONS[54]).toBe('function');
    for (let f = MIN_LOADABLE_SAVE_FORMAT; f < SAVE_FORMAT_VERSION; f++) expect(SAVE_MIGRATIONS[f], `형식 ${f} → ${f + 1}`).toBeDefined();
  });
  it('54 세이브가 그대로 불러와지고 체력 = 가득·온천 밖·기록 빈 목록, 다른 값은 그대로', () => {
    const m = migrateSave(v54())!;
    expect(m).not.toBeNull();
    expect(m.meta.format).toBe(55);
    expect(m.nest.hpFraction).toBe(1);
    expect(m.nest.spa).toBeNull();
    expect(m.runLog.homeHeals).toEqual([]);
    expect(m.shared.tradeCoins).toBe(777);
    expect(m.evolution.ev.hp).toBe(9);
  });
  it('쉬는 트랙도 같이 올린다', () => {
    const raw = v54() as { otherTracks: unknown[] };
    const other = newSaveData('shinigami', T0);
    const t = JSON.parse(JSON.stringify(other));
    delete t.nest.hpFraction;
    delete t.runLog.homeHeals;
    raw.otherTracks = [{ factionId: 'shinigami', nest: t.nest, build: t.build, evolution: t.evolution, formDex: t.formDex, tiles: t.tiles, runLog: t.runLog, titles: t.titles, activeExpedition: null, rank: t.rank, training: t.training, skin: null, rebirth: t.rebirth, wear: t.wear, difficulty: t.difficulty, tower: t.tower, parkedAt: T0 }];
    const m = migrateSave(raw)!;
    expect(m.otherTracks[0]?.nest.hpFraction).toBe(1);
    expect(m.otherTracks[0]?.runLog.homeHeals).toEqual([]);
  });
  it('저장소에 쓴 54 세이브를 loadSave 로 열 수 있다 (압축 저장 왕복)', () => {
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    writeSave(st, v54() as unknown as SaveData);
    const back = loadSave(st)!;
    expect(back.meta.format).toBe(55);
    expect(back.nest.hpFraction).toBe(1);
  });
  it('53 이하는 그대로 이전 버전(문턱), 56(미래)은 못 연다', () => {
    const r53 = v54();
    (r53.meta as { format: number }).format = 53;
    expect(migrateSave(r53)).toBeNull();
    const r56 = v54();
    (r56.meta as { format: number }).format = 56;
    expect(migrateSave(r56)).toBeNull();
  });
  it('깨진 홈 체력 값은 보정 (0~상한)', () => {
    const raw = v54();
    (raw.meta as { format: number }).format = 55;
    (raw.nest as Record<string, unknown>).hpFraction = 7;
    (raw.nest as Record<string, unknown>).spa = { at: 'x' };
    const m = migrateSave(raw)!;
    expect(m.nest.hpFraction).toBe(1);
    expect(m.nest.spa).toBeNull();
  });
});
