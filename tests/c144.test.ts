// C.144 펫 시스템 (GDD 90장, 가칭·provisional): 데이터·친밀도·효과·얻는 법·보관함·세이브·런 로그
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { PET_IDS, PETS, getPet } from '../src/data/pets';
import { ITEM_CATEGORIES, getWandererItem } from '../src/data/shop';
import { advance, chooseRelease, createExpedition, finishBattle, finishRest, playExpedition, startBattle, type ExpeditionState, type StepEvent } from '../src/engine/expedition';
import { addPetLaps, affinityMult, affinityOf, carriedPet, grantPet, newPetState, nextAffinityLaps, petBonus, pickNewPet, sanitizePets, setActivePet } from '../src/engine/pet';
import { advanceWanderer, newWandererState } from '../src/engine/wanderer';
import { migrateSave, newSaveData, performEvolution, recordExpedition, settleIdle, SAVE_FORMAT_VERSION, MIN_LOADABLE_SAVE_FORMAT, type SaveData } from '../src/game';
import { buyWandererItem, wandererRows } from '../src/shop';
import { choosePet, inventoryOf, petEffectText, petNoticeOf } from '../src/inventory';

const H = getFaction('hollow');
const S = getFaction('shinigami');
const PX = BALANCE.provisional.pets;
const HOUR = 3_600_000;

function exp0(seed: number, pet: { id: string; level: number } | null, extra: Partial<Parameters<typeof createExpedition>[0]> = {}): ExpeditionState {
  return createExpedition({ factionId: 'hollow', seed, hunger: 0, condition: 80, deck: ['prey-nest-a', 'elite-den-a'], pet, ...extra });
}

/** 첫 바퀴 끝까지 걷는다 (전투는 이긴 것으로, 흡수는 놓아줌). 바퀴 끝 사건을 돌려준다 */
function toLapEnd(e: ExpeditionState): StepEvent | null {
  for (let i = 0; i < 200; i++) {
    if (e.phase === 'battle') {
      const b = startBattle(e);
      b.status = 'won';
      finishBattle(e, b);
    } else if (e.phase === 'absorb') chooseRelease(e);
    else if (e.phase === 'rest') finishRest(e);
    else if (e.phase !== 'moving') return null;
    else {
      const ev = advance(e);
      if (ev?.kind === 'lap-complete') return ev;
    }
  }
  return null;
}

/** 원정 하나를 laps 바퀴 마치고 귀환한 상태로 */
function ended(save: SaveData, laps: number, extra: Partial<ExpeditionState> = {}): ExpeditionState {
  const exp = createExpedition({ factionId: save.factionId, seed: 7, hunger: 20, condition: 80, deck: [], build: save.build, evolution: save.evolution });
  Object.assign(exp, { phase: 'ended', outcome: 'returned', endReason: 'returned', lapsCompleted: laps }, extra);
  return exp;
}

describe('90장 펫 데이터 (가칭)', () => {
  it('4종 · 효과 하나씩 · 그림 키 · 종족마다 이름만 다름(faction json)', () => {
    expect(PET_IDS).toEqual(['pet-gold', 'pet-belly', 'pet-guard', 'pet-seek']);
    expect(PETS.map((p) => p.effect)).toEqual(['gold', 'belly', 'guard', 'seek']);
    expect(getPet('pet-gold')!.art).toBe('pet.pet-gold');
    expect(PET_IDS.map((id) => H.petNames[id])).toEqual(['뼈 까마귀', '모래 벌레', '껍질 게', '그림자 박쥐']);
    expect(PET_IDS.map((id) => S.petNames[id])).toEqual(['지옥나비', '꼬마 쥐', '수호 거북', '길잡이 까마귀']);
    expect(ITEM_CATEGORIES).toContain('pet');
  });

  it('친밀도 1~5 = 바퀴 10·30·60·100, 효과 ×(1+0.25×(친밀도−1)) → 5단계 2배', () => {
    expect([0, 9, 10, 29, 30, 59, 60, 99, 100, 500].map(affinityOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect([1, 2, 3, 4, 5].map(affinityMult)).toEqual([1, 1.25, 1.5, 1.75, 2]);
    expect(nextAffinityLaps(12)).toBe(30);
    expect(nextAffinityLaps(100)).toBeNull();
    expect(petBonus({ id: 'pet-gold', level: 1 }, 'gold')).toBeCloseTo(0.08);
    expect(petBonus({ id: 'pet-gold', level: 5 }, 'gold')).toBeCloseTo(0.16);
    expect(petBonus({ id: 'pet-gold', level: 5 }, 'belly')).toBe(0);
    expect(petBonus({ id: 'pet-seek', level: 1 }, 'seekWanderer')).toBeCloseTo(0.25);
    expect(petBonus({ id: 'pet-seek', level: 1 }, 'seekTile')).toBeCloseTo(0.1);
    expect(petBonus(null, 'gold')).toBe(0);
    expect(petEffectText('pet-guard', 1)).toBe('전투 시작 보호막 (최대 체력 4%)');
    expect(petEffectText('pet-belly', 3)).toBe('원정 배부름 줄어듦 −22.5%');
  });

  it('상태: 여러 마리 보유 · 1마리만 데리고 다님 · 바퀴 누계로 친밀도 오름 · 정리', () => {
    const st = newPetState();
    expect(grantPet(st, 'pet-gold', 5)).toBe(true);
    expect(grantPet(st, 'pet-gold', 6)).toBe(false);
    expect(grantPet(st, 'pet-nope', 6)).toBe(false);
    grantPet(st, 'pet-seek', 7);
    expect(setActivePet(st, 'pet-belly')).toBe(false); // 안 가진 펫
    expect(setActivePet(st, 'pet-gold')).toBe(true);
    expect(carriedPet(st)).toEqual({ id: 'pet-gold', level: 1 });
    expect(addPetLaps(st, 'pet-gold', 9)).toBeNull();
    expect(addPetLaps(st, 'pet-gold', 25)).toEqual({ from: 1, to: 3 });
    expect(carriedPet(st)).toEqual({ id: 'pet-gold', level: 3 });
    expect(pickNewPet(st, () => 0)).toBe('pet-belly');
    expect(sanitizePets({ owned: { 'pet-gold': { laps: -3, gotAt: 'x' }, bad: { laps: 1 } }, active: 'pet-seek', gifted: 1 })).toEqual({ owned: { 'pet-gold': { laps: 0, gotAt: 0 } }, active: null, gifted: false });
  });
});

describe('90장 효과 (원정)', () => {
  it('펫 없음 = 예전과 같은 원정 (기준 봇 · balance:check 가드)', () => {
    const a = playExpedition(exp0(11, null), { returnAfterLap: 3 });
    const b = playExpedition(createExpedition({ factionId: 'hollow', seed: 11, hunger: 0, condition: 80, deck: ['prey-nest-a', 'elite-den-a'] }), { returnAfterLap: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('pet-gold: 전투 골드 +8%(친밀도 배), pet-belly: 허기 오름 −15%', () => {
    const run = (pet: { id: string; level: number } | null) => {
      const e = exp0(23, pet);
      for (let i = 0; i < 200 && e.phase !== 'battle'; i++) advance(e);
      expect(e.phase).toBe('battle');
      const hunger0 = e.hunger;
      const b = startBattle(e);
      b.status = 'won';
      finishBattle(e, b);
      return { gold: e.goldLoot.at(-1)!.amount, hunger: e.hunger - hunger0, walk: hunger0 };
    };
    const base = run(null);
    expect(run({ id: 'pet-gold', level: 1 }).gold).toBe(Math.round(base.gold * 1.08));
    expect(run({ id: 'pet-gold', level: 5 }).gold).toBe(Math.round(base.gold * 1.16));
    const belly = run({ id: 'pet-belly', level: 1 });
    expect(belly.hunger).toBeCloseTo(base.hunger * 0.85, 6);
    expect(belly.walk).toBeCloseTo(base.walk * 0.85, 6);
  });

  it('pet-guard: 전투 시작 보호막 = 최대 체력 4% (친밀도 배)', () => {
    const shieldOf = (pet: { id: string; level: number } | null) => {
      const e = exp0(23, pet);
      for (let i = 0; i < 200 && e.phase !== 'battle'; i++) advance(e);
      return e.pending!.params.startShieldFraction ?? 0;
    };
    expect(shieldOf(null)).toBe(0);
    expect(shieldOf({ id: 'pet-guard', level: 1 })).toBeCloseTo(0.04);
    expect(shieldOf({ id: 'pet-guard', level: 5 })).toBeCloseTo(0.08);
  });

  it('pet-seek: 떠돌이 상인 바퀴 확률 ×1.25, 바퀴 끝 타일 +1장 10% (따로 만든 난수 — 원정 난수 그대로)', () => {
    const roll = (mult: number) => {
      const w = newWandererState();
      w.lapsSince = 99;
      return advanceWanderer(w, 1, { at: 1, runId: 1 }, () => 0.1249, mult);
    };
    expect(roll(1)).toBeNull(); // 확률 0.1 (k=100)
    expect(roll(1.25)).not.toBeNull(); // 0.125
    let extra = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const ev = toLapEnd(exp0(seed, { id: 'pet-seek', level: 1 }, { deck: ['prey-nest-a'] }));
      if (ev?.kind === 'lap-complete' && ev.petTile) extra++;
    }
    expect(extra).toBeGreaterThan(20);
    expect(extra).toBeLessThan(70);
  });

  it('바퀴 끝 보상 펫 2%: petDrops 일 때만 굴린다, 튜토리얼은 없음', () => {
    let found = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const e = exp0(seed, null, { deck: [], petDrops: true });
      toLapEnd(e);
      found += e.petFinds!.length;
    }
    expect(found).toBeGreaterThan(5);
    expect(found).toBeLessThan(40);
    expect(exp0(1, { id: 'pet-gold', level: 1 }, { tutorial: true, petDrops: true }).pet).toBeUndefined();
    expect(exp0(1, null).petFinds).toBeUndefined();
  });
});

describe('90장 얻는 법 · 정산 · 런 로그', () => {
  it('귀환: 바퀴 끝 펫은 보관함에(이미 있으면 골드), 데리고 간 펫에 마친 바퀴 → 친밀도·런 로그', () => {
    const s = newSaveData('hollow', 1);
    grantPet(s.shared.pets, 'pet-gold', 1);
    expect(choosePet(s, 'pet-gold', 2)).toBe(true);
    const gold0 = s.shared.tradeCoins;
    recordExpedition(s, ended(s, 12, { pet: carriedPet(s.shared.pets), petDrops: true, petFinds: [{ petId: 'pet-guard', lap: 3 }, { petId: 'pet-gold', lap: 7 }] }), 100);
    expect(Object.keys(s.shared.pets.owned).sort()).toEqual(['pet-gold', 'pet-guard']);
    expect(s.shared.pets.owned['pet-gold']!.laps).toBe(12);
    expect(s.shared.tradeCoins - gold0).toBeGreaterThanOrEqual(PX.dupGold);
    expect(s.runLog.pets.map((r) => [r.kind, r.petId, r.source ?? r.level ?? r.gold ?? null])).toEqual([
      ['take', 'pet-gold', null], ['get', 'pet-guard', 'lap'], ['dupGold', 'pet-gold', PX.dupGold], ['level', 'pet-gold', 2],
    ]);
    expect(petNoticeOf(s.runLog.pets[1]!, H)!.title).toBe('새 펫: 껍질 게');
    expect(petNoticeOf(s.runLog.pets[0]!, H)).toBeNull();
  });

  it('대기 모드 바퀴도 친밀도에 센다 (바퀴는 이미 × share)', () => {
    const s = newSaveData('hollow', 1_000_000);
    recordExpedition(s, ended(s, 1), 1_000_000);
    grantPet(s.shared.pets, 'pet-belly', 1);
    choosePet(s, 'pet-belly', 1);
    s.lastSeenAt = 1_000_000;
    const r = settleIdle(s, s.lastSeenAt + 24 * HOUR, () => 0)!;
    expect(r.laps).toBeGreaterThan(0);
    expect(s.shared.pets.owned['pet-belly']!.laps).toBe(r.laps);
  });

  it('첫 진화 선물: 슬롯에서 처음 진화할 때 안 가진 펫 1마리 (한 번만)', () => {
    const s = newSaveData('hollow', 1);
    s.evolution.steps = 99999;
    const r = performEvolution(s, 50);
    expect(r.ok).toBe(true);
    expect(s.shared.pets.gifted).toBe(true);
    expect(Object.keys(s.shared.pets.owned)).toHaveLength(1);
    expect(s.runLog.pets.at(-1)).toMatchObject({ kind: 'get', source: 'evolution' });
  });

  it('떠돌이 상인 전설 품목 w-pet-egg: 안 가진 펫 1마리, 다 가졌으면 못 삼', () => {
    expect(getWandererItem('w-pet-egg')).toMatchObject({ grade: 'legendary', kind: 'pet', category: 'pet' });
    const s = newSaveData('shinigami', 1);
    s.shared.tradeCoins = 5000;
    s.shared.wanderer.visit = { at: 1, runId: 1, tier: 4, stock: [{ itemId: 'w-pet-egg', price: 600, sold: false }] };
    const r = buyWandererItem(s, S, 'w-pet-egg', 9, () => 0);
    expect(r.ok).toBe(true);
    expect(s.shared.pets.owned['pet-gold']).toBeDefined();
    expect(s.runLog.pets.at(-1)).toMatchObject({ kind: 'get', source: 'wanderer', petId: 'pet-gold' });
    for (const id of PET_IDS) grantPet(s.shared.pets, id, 1);
    s.shared.wanderer.visit.stock[0]!.sold = false;
    expect(wandererRows(s, S)[0]!.lock).toBe('펫을 다 가졌다');
  });

  it('보관함 펫 탭: 데리고 가기/두고 가기, 원정 중에는 못 바꿈', () => {
    const s = newSaveData('hollow', 1);
    grantPet(s.shared.pets, 'pet-seek', 1);
    grantPet(s.shared.pets, 'pet-gold', 1);
    let pets = inventoryOf(s, H).filter((e) => e.category === 'pet');
    expect(pets.map((e) => [e.id, e.name, e.action])).toEqual([['pet-gold', '뼈 까마귀', 'take'], ['pet-seek', '그림자 박쥐', 'take']]);
    choosePet(s, 'pet-seek', 2);
    choosePet(s, 'pet-gold', 3);
    pets = inventoryOf(s, H).filter((e) => e.category === 'pet');
    expect(pets.map((e) => e.action)).toEqual(['leave', 'take']);
    expect(s.runLog.pets.map((r) => r.kind)).toEqual(['take', 'leave', 'take']);
    s.activeExpedition = {} as never;
    expect(choosePet(s, null, 4)).toBe(false);
    expect(inventoryOf(s, H).find((e) => e.id === 'pet-gold')!.lock).toBe('원정 중에는 바꿀 수 없다');
  });

  it('세이브 형식 42(C.147 에 43, C.150 에 44): 펫이 저장·불러오기로 남고(공용), 깨진 값은 정리', () => {
    expect([SAVE_FORMAT_VERSION, MIN_LOADABLE_SAVE_FORMAT]).toEqual([54, 54]); // C.195 // C.188 // C.184 // C.181 // C.175: 돌봄 패널티로 46
    const s = newSaveData('hollow', 1);
    grantPet(s.shared.pets, 'pet-guard', 1);
    choosePet(s, 'pet-guard', 1);
    addPetLaps(s.shared.pets, 'pet-guard', 31);
    const raw = JSON.parse(JSON.stringify(s));
    const m = migrateSave(raw)!;
    expect(m.shared.pets).toEqual({ owned: { 'pet-guard': { laps: 31, gotAt: 1 } }, active: 'pet-guard', gifted: false });
    expect(m.runLog.pets).toHaveLength(1);
    raw.shared.pets = { owned: { 'pet-x': {} }, active: 'pet-x' };
    expect(migrateSave(JSON.parse(JSON.stringify(raw)))!.shared.pets).toEqual(newPetState());
  });
});
