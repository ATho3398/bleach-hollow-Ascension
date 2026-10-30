// C.220 (GDD 142장 = 126장 뼈대 패치): 4단계 · 등급 사다리 이름 · 아란칼화/참백도 구상화(보스전 임시) · 특성 칸(진화할 때 얻음, 1 + 아란칼화 + 환생, 최대 4) ·
// 치명 두 값 · 콤보 3 · ★1~4 · 세이브 형식 56 → 57 마이그레이션
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { COMBOS, FORM_TABLE, getForm } from '../src/data/evolution';
import { getEnemy } from '../src/data/enemies';
import { getFaction } from '../src/data/factions';
import { gainTrait, newBuild, buildCombatParams } from '../src/engine/absorb';
import { createCombat, type CombatParams } from '../src/engine/combat';
import { MAX_DIFFICULTY } from '../src/engine/difficulty';
import {
  abilitySlotCount, applyEvolutionToParams, evolve, newAbilityLoadout, newEvolution, TIER_COUNT, type EvolutionState,
} from '../src/engine/evolution';
import {
  artTierIndexOf, ascensionAccess, loadSave, migrateSave, MIN_LOADABLE_SAVE_FORMAT, newSaveData, performRebirth, recordAscension, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, writeSave, type SaveData,
} from '../src/game';
import { remapOldFormId } from '../src/saveTier4';
import { critChances } from '../src/ui/lcdScreens';

const wonBattle = (won = true) => {
  const c = createCombat(1, { enemy: getEnemy('test-a'), params: {} });
  c.status = won ? 'won' : 'lost';
  return c;
};

/** 형식 56 세이브(옛 5단계 트리) */
function old56(o: { tierIndex: number; history: string[]; slots?: number; factionId?: string }): Record<string, any> {
  const s = JSON.parse(JSON.stringify(newSaveData(o.factionId ?? 'hollow', 1000))) as Record<string, any>;
  s.meta.format = 56;
  delete s.evolution.abilities;
  Object.assign(s.evolution, { tierIndex: o.tierIndex, formHistory: o.history, formId: o.history[o.history.length - 1] ?? null, ability: 'atk', ev: { hp: 5, atk: 9, int: 2, def: 0, spr: 0, spd: 0 } });
  s.formDex = [...o.history];
  const b = newBuild();
  while (b.slots.length < (o.slots ?? 3)) b.slots.push(null);
  for (const id of ['t-fire-a', 't-fire-b', 't-water-c']) gainTrait(b, id);
  s.build = b;
  return s;
}

describe('4단계 구조 (GDD 126장 확정 1·2·9, 142장 1·2·8)', () => {
  it('단계 4개 · 이름은 종족 설정 (옛 아란칼 단계·견습 대원 삭제)', () => {
    expect(TIER_COUNT).toBe(4);
    expect(getFaction('hollow').tierNames).toEqual(['호로', '길리안', '아쥬커스', '바스트로데']);
    expect(getFaction('shinigami').tierNames).toEqual(['혼백', '영술원 학생', '평대원', '수석 대원']);
    expect(Math.max(...FORM_TABLE.map((f) => f.tier))).toBe(4);
  });
  it('등급 사다리: 번호 쟁탈전 / 진급 시험, 에스파다 10…1 / 10석…3석·부대장·대장 — 4단계부터', () => {
    expect(getFaction('hollow').rankBattleName).toBe('번호 쟁탈전');
    expect(getFaction('shinigami').rankBattleName).toBe('진급 시험');
    expect(getFaction('shinigami').rankNames).toEqual(['대장', '부대장', '3석', '4석', '5석', '6석', '7석', '8석', '9석', '10석']);
    expect(BALANCE.rank.unlockTierIndex).toBe(3);
  });
  it('원정 난이도 ★1~4 · 콤보 3개(2·3·4단계) · 흡수 칸 최대 6 · 진화 걸음 3칸', () => {
    expect(MAX_DIFFICULTY).toBe(4);
    expect(COMBOS.map((c) => c.tier)).toEqual([2, 3, 4]);
    expect(COMBOS.map((c) => c.name.hollow)).toEqual(['그랑 레이 세로', '야수의 폭풍', '세로 오스큐라스 포화']);
    expect(BALANCE.absorb.slotCount + (TIER_COUNT - 1) * BALANCE.provisional.evolution.slotsPerEvolution).toBe(6);
    expect(BALANCE.provisional.evolution.stepsNeeded).toHaveLength(3);
  });
  it("'한계 돌파' 용어 폐기: 진화체 이름·특성 이름은 폭주(호로) / 호로화(사신) — 종족 설정 frenzyName", () => {
    const f = getForm('h4:frenzy');
    expect(f.label.category).toBe('physical');
    expect(JSON.stringify(FORM_TABLE)).not.toContain('limit');
  });
});

describe('특성 칸 (GDD 126-1 수정, 142장 6)', () => {
  it('칸 수 = 기본 1 + 아란칼화/참백도 구상화 1 + 환생 1회당 1, 최대 4', () => {
    expect(abilitySlotCount(0, false)).toBe(1);
    expect(abilitySlotCount(0, true)).toBe(2);
    expect(abilitySlotCount(1, false)).toBe(2);
    expect(abilitySlotCount(2, true)).toBe(4);
    expect(abilitySlotCount(9, true)).toBe(4);
  });
  // 진화 때 받는 규칙·바꿔 끼기 삭제·전투에 실리는 것은 C.225 (GDD 147·148장) — tests/c225.test.ts
  it('전투에는 칸에 든 특성만 실린다', () => {
    const e: EvolutionState = { ...newEvolution(1), tierIndex: 2, formId: 't3:water', formHistory: ['t2:base', 't3:water'], ability: 'atk' };
    e.abilities = { ...newAbilityLoadout(), owned: { 'el:water': 1 }, equipped: ['el:water'] };
    const p1: Partial<CombatParams> = buildCombatParams(newBuild(), 'hollow');
    applyEvolutionToParams(p1, e, 'hollow');
    expect(p1.critChance).toBeCloseTo(BALANCE.provisional.combat.critChance + BALANCE.provisional.abilities.element.water!.critChance!);
    expect(p1.dispositions).toEqual([]);
    e.abilities = newAbilityLoadout();
    const p2: Partial<CombatParams> = buildCombatParams(newBuild(), 'hollow');
    applyEvolutionToParams(p2, e, 'hollow');
    expect(p2.critChance).toBeCloseTo(BALANCE.provisional.combat.critChance);
  });
  it('환생해도 보유·장착이 남고 칸이 1 늘어난다', () => {
    const s = newSaveData('hollow', 1);
    Object.assign(s.evolution, { tierIndex: 3, formId: 't4:fire:physical', formHistory: ['t2:base', 't3:fire', 't4:fire:physical'], ability: 'atk' });
    Object.assign(s.evolution.abilities!, { owned: { 'el:fire': 1.5 }, equipped: ['el:fire'], enhanced: ['el:fire'] });
    expect(performRebirth(s, null, 5).ok).toBe(true);
    expect(s.evolution.tierIndex).toBe(0);
    expect(s.evolution.abilities!.slots).toBe(2);
    expect(s.evolution.abilities!.enhanced).toEqual(['el:fire']);
    expect(Object.keys(s.evolution.abilities!.owned)).toEqual(['el:fire']);
    expect(s.evolution.abilities!.owned['el:fire']).toBe(1.5);
  });
});

describe('아란칼화 / 참백도 구상화 (GDD 126장 3, 142장 3 — 지금은 보스전 임시)', () => {
  const at4 = (factionId: string): SaveData => {
    const s = newSaveData(factionId, 1);
    Object.assign(s.evolution, { tierIndex: 3, formId: 't4:fire:mixed', formHistory: ['t2:base', 't3:fire', 't4:fire:mixed'], ability: 'atk' });
    return s;
  };
  it('4단계부터 수련장에서 도전, 깨면 레스렉시온/만해 해금 + 칸 +1 (처음 한 번)', () => {
    const low = newSaveData('hollow', 1);
    low.evolution.tierIndex = 2;
    expect(ascensionAccess(low)).toEqual({ ok: false, reason: 'tier' });
    const s = at4('hollow');
    expect(ascensionAccess(s)).toEqual({ ok: true });
    const pre: Partial<CombatParams> = {};
    applyEvolutionToParams(pre, s.evolution, 'hollow');
    expect(pre.liberationUnique).toBe(false); // 4단계여도 깨기 전에는 영력 해방
    expect(recordAscension(s, wonBattle(false), 1)).toEqual({ won: false, slotsAdded: 0 });
    expect(s.evolution.ascended).toBeUndefined();
    expect(recordAscension(s, wonBattle(true), 2)).toEqual({ won: true, slotsAdded: 1 });
    expect(s.evolution.ascended).toBe(true);
    expect(ascensionAccess(s)).toEqual({ ok: false, reason: 'done' });
    const post: Partial<CombatParams> = {};
    applyEvolutionToParams(post, s.evolution, 'hollow');
    expect(post.liberationUnique).toBe(true);
    expect(s.runLog.ascensions!.map((r) => r.won)).toEqual([false, true]);
    expect(s.runLog.battles.at(-1)!.enemyClass).toBe('ascension');
  });
  it('호로만 외형이 아란칼로 (종족 설정 ascension.lookChange · artTier), 사신은 그대로', () => {
    const h = at4('hollow');
    expect(artTierIndexOf(h)).toBe(3);
    recordAscension(h, wonBattle(), 1);
    expect(artTierIndexOf(h)).toBe(getFaction('hollow').ascension.artTier! - 1);
    expect(getFaction('hollow').formLooks!['t4:fire:mixed']).toContain(h.evolution.look);
    const sh = at4('shinigami');
    recordAscension(sh, wonBattle(), 1);
    expect(sh.evolution.ascended).toBe(true);
    expect(artTierIndexOf(sh)).toBe(3);
    expect(sh.evolution.look ?? null).toBeNull();
  });
  it('환생하면 아란칼화는 다시(이번 생), 칸 +1 은 남는다', () => {
    const s = at4('hollow');
    recordAscension(s, wonBattle(), 1);
    expect(s.evolution.abilities!.slots).toBe(2);
    performRebirth(s, null, 3);
    expect(s.evolution.ascended).toBeUndefined();
    expect(s.evolution.abilities!.slots).toBe(3); // 1 + 아란칼화 1 + 환생 1
  });
});

describe('치명 두 값 (GDD 126-1 확정 ②, 142장 7)', () => {
  it('평타 치명 / 블록 치명 각 기본 5% · 상한 50%, 상태 화면 두 줄(블록형 몸은 블록 보정 +4%p)', () => {
    const CX = BALANCE.provisional.combat;
    expect([CX.critChance, CX.blockCritChance, CX.critChanceMax, CX.blockCritChanceMax]).toEqual([0.05, 0.05, 0.5, 0.5]);
    const p = buildCombatParams(newBuild(), 'hollow');
    expect([p.critChance, p.blockCritChance]).toEqual([0.05, 0.05]);
    const s = newSaveData('hollow', 1);
    const c = critChances(s.build, s.evolution);
    expect(c.basic).toBeCloseTo(0.05);
    expect(c.block).toBeCloseTo(0.05 + CX.blockPlayCrit);
  });
});

describe('세이브 형식 57 → 58 (GDD 142장 9, 123장 6 — C.223 이 57 을 먼저 씀)', () => {
  it('형식 58 이상 · 문턱 54 고정 · 단계 표에 57 이 있다', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(58);
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(54);
    expect(typeof SAVE_MIGRATIONS[57]).toBe('function');
  });
  it('옛 5단계 → 같은 속성·타입 4단계 + 아란칼화를 깬 것으로(외형 유지), 옛 특성 → 보유 목록, 칸 = 새 규칙, 흡수 칸 최대 6', () => {
    const old = old56({ tierIndex: 4, history: ['t2:base', 't3:base', 't4:water', 't5:water:mixed'], slots: 7 });
    old.rebirth.count = 1;
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.evolution.tierIndex).toBe(3);
    expect(m.evolution.formHistory).toEqual(['t2:base', 't3:water', 't4:water:mixed']);
    expect(m.evolution.ascended).toBe(true);
    expect(getFaction('hollow').formLooks!['t4:water:mixed']).toContain(m.evolution.look);
    expect(m.evolution.abilities!.slots).toBe(3); // 1 + 아란칼화 1 + 환생 1
    expect(Object.keys(m.evolution.abilities!.owned)).toEqual(['el:water']); // 59(C.225): 성향 빠짐, 물 3·4단계 같은 루트 → 강화
    expect(m.evolution.abilities!.enhanced).toEqual(['el:water']);
    expect(m.build.slots).toHaveLength(6);
    expect(m.formDex).toEqual(expect.arrayContaining(['t2:base', 't3:water', 't4:water:mixed']));
    expect(m.formDex).not.toContain('t5:water:mixed');
  });
  it('옛 4단계 히든 → 가장 가까운 새 4단계(혈 특수형 → 혈 물리, 융합 → 융합, 순수 → 노멀), 옛 5단계 행동 히든 → 새 히든', () => {
    const blood = migrateSave(old56({ tierIndex: 3, history: ['t2:base', 't3:base', 'h4:special:blood'] }))!;
    expect(blood.evolution.formId).toBe('t4:blood:physical');
    expect(blood.evolution.formHistory).toEqual(['t2:base', 'h3:passage', 't4:blood:physical']);
    expect(blood.evolution.ascended).toBeUndefined();
    expect(migrateSave(old56({ tierIndex: 3, history: ['t2:base', 't3:base', 'h4:fusion:water+earth'] }))!.evolution.formId).toBe('h4:fusion:water+earth');
    expect(migrateSave(old56({ tierIndex: 3, history: ['t2:base', 't3:base', 'h4:pure'] }))!.evolution.formId).toMatch(/^t4:normal:/);
    expect(migrateSave(old56({ tierIndex: 4, history: ['t2:base', 't3:base', 't4:fire', 'h5:limit'] }))!.evolution.formId).toBe('h4:frenzy');
    expect(migrateSave(old56({ tierIndex: 4, history: ['t2:base', 't3:base', 't4:fire', 'h5:reborn'] }))!.evolution.formId).toBe('h4:awakened');
    const fail = migrateSave(old56({ tierIndex: 4, history: ['t2:base', 't3:base', 'h4:fail', 't5:normal:physical'] }))!;
    expect(fail.evolution.formHistory).toEqual(['t2:base', 'h3:fail', 'h4:fail']);
  });
  it('옛 3단계(아쥬커스 base) → 3단계 장착 최다 속성, 옛 4단계 일반 → 4단계 장착 최다 타입, 2단계 이하는 그대로', () => {
    const t3 = migrateSave(old56({ tierIndex: 2, history: ['t2:base', 't3:base'] }))!;
    expect(t3.evolution.formId).toBe('t3:fire');
    expect(t3.evolution.tierIndex).toBe(2);
    const t4 = migrateSave(old56({ tierIndex: 3, history: ['t2:base', 't3:base', 't4:earth'] }))!;
    expect(t4.evolution.formHistory[1]).toBe('t3:earth');
    expect(t4.evolution.formId).toMatch(/^t4:earth:/);
    const t2 = migrateSave(old56({ tierIndex: 1, history: ['t2:base'] }))!;
    expect(t2.evolution.formHistory).toEqual(['t2:base']);
  });
  it('쉬는 트랙·진행 중 원정 사본·런 로그도 옮기고, ★5 → ★4. 저장소 왕복(loadSave)으로 열린다', () => {
    const old = old56({ tierIndex: 4, history: ['t2:base', 't3:base', 't4:thunder', 't5:thunder:special'] });
    const other = old56({ tierIndex: 4, history: ['t2:base', 't3:base', 't4:fire', 't5:fire:physical'], factionId: 'shinigami' });
    old.otherTracks = [{ ...Object.fromEntries(['factionId', 'nest', 'build', 'evolution', 'runLog', 'activeExpedition', 'lastScreen', 'rank', 'training', 'skin', 'rebirth', 'wear', 'difficulty', 'tower'].map((k) => [k, other[k]])), parkedAt: 0 }];
    old.runLog.tiers.evolutions.push({ fromTier: 3, toTier: 4, fromFormId: 't4:thunder', toFormId: 't5:thunder:special', formId: 't5:thunder:special', at: 1 });
    old.difficulty = { unlocked: 5, last: 5, streak: { star: 5, count: 2 } };
    const store = new Map<string, string>([['k', JSON.stringify(old)]]);
    const st = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const m = loadSave(st, 'k')!;
    expect(m.evolution.formId).toBe('t4:thunder:special');
    expect(m.otherTracks[0]!.evolution.formId).toBe('t4:fire:physical');
    expect(m.otherTracks[0]!.evolution.look ?? null).toBeNull(); // 사신은 외형 그대로
    expect(m.runLog.tiers.evolutions[0]).toMatchObject({ fromFormId: 't3:thunder', toFormId: 't4:thunder:special' });
    expect(m.difficulty.unlocked).toBe(4);
    expect(m.difficulty.last).toBeLessThanOrEqual(4);
    writeSave(st, m);
    expect(loadSave(st)).toEqual(m);
  });
  it('문맥 없는 id 옮기기 (런 로그·도감)', () => {
    expect(remapOldFormId('t3:base')).toBe('t3:normal');
    expect(remapOldFormId('t4:fire')).toBe('t3:fire');
    expect(remapOldFormId('t5:blood:special')).toBe('t4:blood:physical');
    expect(remapOldFormId('h5:hunter')).toBe('h4:hunter');
    expect(remapOldFormId('h4:fail')).toBe('h3:fail');
    expect(remapOldFormId(null)).toBeNull();
  });
});
