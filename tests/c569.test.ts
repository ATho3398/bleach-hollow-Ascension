// C.569 (GDD 9-4 v6.256 — 사용자 2026-11-28 "지금 모델 없는 펫은 다 삭제해."): pet-belly·pet-guard 양쪽 삭제, pet-seek 는 사신에서만 삭제
// (호로 그림자 박쥐는 남김 — 종족 설정 pets). 옛 세이브의 삭제 펫 제거·데리고 가던 칸은 빈 칸(보상 없음), 얻는 길에서도 빠짐. 형식 102
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { getPet, PET_IDS, REMOVED_PET_IDS } from '../src/data/pets';
import { grantPet, newPetState, pickNewPet, petAllowed, rollAnyPet } from '../src/engine/pet';
import { fillAllPets } from '../src/engine/testMode';
import { carriedPetsOf, migrateSave, newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, syncPetSlots, type SaveData } from '../src/game';
import { inventoryOf } from '../src/inventory';

const H = getFaction('hollow');
const S = getFaction('shinigami');

describe('펫 데이터 (종족 설정 pets)', () => {
  it('pet-belly·pet-guard 는 데이터에서 없다 · 효과 belly·guard 수치도 없다', () => {
    for (const id of REMOVED_PET_IDS) {
      expect(getPet(id)).toBeUndefined();
      expect(PET_IDS).not.toContain(id);
      expect(H.petNames[id]).toBeUndefined();
      expect(S.petNames[id]).toBeUndefined();
    }
    expect(Object.keys(BALANCE.provisional.pets.effects).sort()).toEqual(['gold', 'seekTile', 'seekWanderer']);
  });
  it('남는 펫 = 호로 뼈 까마귀·그림자 박쥐 / 사신 지옥나비 + 양쪽 효과 미정 7종', () => {
    const unset = ['pet-soul', 'pet-solita', 'pet-kukkapuro', 'pet-yoruichi', 'pet-chappy', 'pet-kon', 'pet-wakame'];
    expect(H.pets).toEqual(['pet-gold', 'pet-seek', ...unset]);
    expect(S.pets).toEqual(['pet-gold', ...unset]);
    expect(H.petArt).toEqual({ 'pet-gold': 'pet.bone-crow', 'pet-seek': 'pet.shadow-bat' });
    expect(S.petNames['pet-seek']).toBeUndefined();
    for (const f of [H, S]) for (const id of f.pets) expect(f.petNames[id]).toBeTruthy();
  });
  it('얻는 길(바퀴 끝·펫 알·첫 선물) = 그 종족 펫 목록 안에서만', () => {
    for (let i = 0; i < 100; i++) {
      expect(['pet-gold', 'pet-seek']).toContain(rollAnyPet(() => i / 100, H.pets));
      expect(rollAnyPet(() => i / 100, S.pets)).toBe('pet-gold');
    }
    const st = newPetState();
    grantPet(st, 'pet-gold', 1);
    expect(pickNewPet(st, () => 0, S.pets)).toBeNull(); // 사신은 지옥나비뿐 — 다 가졌다
    expect(pickNewPet(st, () => 0, H.pets)).toBe('pet-seek');
    expect(petAllowed('pet-seek', H.pets)).toBe(true);
    expect(petAllowed('pet-seek', S.pets)).toBe(false);
    expect(petAllowed('pet-belly', H.pets)).toBe(false);
  });
});

describe('사신 트랙에서 pet-seek (슬롯 공유 펫)', () => {
  it('데려가지 않고(빈 칸), 보유 목록에 안 보이고, 트랙에 들어오면 칸에서 내린다 · 테스트 모드 전부 = 그 종족 목록', () => {
    const s = newSaveData('shinigami', 1);
    s.shared.unlocks = { ...(s.shared.unlocks ?? {}), pet: true } as never;
    grantPet(s.shared.pets, 'pet-seek', 1); // 호로 트랙에서 얻은 그림자 박쥐가 슬롯 공유로 남은 경우
    s.shared.pets.active = 'pet-seek';
    expect(carriedPetsOf(s).pet).toBeNull();
    const h = newSaveData('hollow', 1);
    h.shared.unlocks = { ...(h.shared.unlocks ?? {}), pet: true } as never;
    grantPet(h.shared.pets, 'pet-seek', 1);
    h.shared.pets.active = 'pet-seek';
    expect(carriedPetsOf(h).pet?.id).toBe('pet-seek'); // 호로는 그대로 데려간다
    expect(inventoryOf(s, S).filter((e) => e.category === 'pet').map((e) => e.id)).not.toContain('pet-seek');
    expect(syncPetSlots(s, 5)).toBe(true);
    expect(s.shared.pets.active).toBeNull();
    expect(s.runLog.pets.at(-1)).toMatchObject({ kind: 'leave', petId: 'pet-seek' });
    const t = newSaveData('shinigami', 1);
    fillAllPets(t, 2);
    expect(Object.keys(t.shared.pets.owned).sort()).toEqual([...S.pets].sort());
  });
});

describe('세이브 형식 102 (삭제 펫 정리)', () => {
  const old = (factionId: 'hollow' | 'shinigami', mut: (raw: Record<string, any>) => void): SaveData => {
    const raw = JSON.parse(JSON.stringify(newSaveData(factionId, 1))) as Record<string, any>;
    raw.meta.format = 101;
    mut(raw);
    return migrateSave(raw)!;
  };
  it('형식 102 · 101 → 102 변환', () => {
    expect(SAVE_FORMAT_VERSION).toBe(102);
    expect(typeof SAVE_MIGRATIONS[101]).toBe('function');
  });
  it('호로 슬롯: 모래 벌레·껍질 게는 없애고 데리고 가던 칸은 빈 칸(보상 없음), 그림자 박쥐는 그대로', () => {
    const m = old('hollow', (r) => {
      r.shared.pets = { owned: { 'pet-gold': { laps: 5, gotAt: 1 }, 'pet-belly': { laps: 40, gotAt: 1 }, 'pet-guard': { laps: 2, gotAt: 1 }, 'pet-seek': { laps: 9, gotAt: 1 } }, active: 'pet-belly', active2: 'pet-guard', gifted: true };
    });
    expect(m.shared.pets).toEqual({ owned: { 'pet-gold': { laps: 5, gotAt: 1 }, 'pet-seek': { laps: 9, gotAt: 1 } }, active: null, active2: null, gifted: true });
    expect(m.shared.tradeCoins).toBe(newSaveData('hollow', 1).shared.tradeCoins); // 보상 없음
  });
  it('사신만 있는 슬롯: 길잡이 까마귀(pet-seek)도 없앤다', () => {
    const m = old('shinigami', (r) => {
      r.shared.pets = { owned: { 'pet-gold': { laps: 5, gotAt: 1 }, 'pet-seek': { laps: 9, gotAt: 1 } }, active: 'pet-seek', active2: null, gifted: true };
    });
    expect(m.shared.pets.owned).toEqual({ 'pet-gold': { laps: 5, gotAt: 1 } });
    expect(m.shared.pets.active).toBeNull();
  });
  it('원정 중간 저장의 펫 칸도 삭제 펫이면 빈 칸', () => {
    const m = old('hollow', (r) => {
      r.activeExpedition = { exp: { pet: { id: 'pet-guard', level: 3 }, pet2: { id: 'pet-gold', level: 1 } } };
    });
    const ae = m.activeExpedition as unknown as { exp?: { pet: unknown; pet2: unknown } } | null;
    if (ae?.exp) {
      expect(ae.exp.pet).toBeNull();
      expect(ae.exp.pet2).toEqual({ id: 'pet-gold', level: 1 });
    }
  });
});
