// C.482 (GDD 9-4·17-4 v6.112): 새 펫 7종(효과 미정 — 얻는 길에 없음) · 테스트 모드 = 모든 펫 해금.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { findArtFile } from '../src/data/art/files';
import { PET_IDS, PET_POOL_IDS, PETS, getPet } from '../src/data/pets';
import { newPetState, grantPet, petBonus, petBonusKeys, petAttackOf, pickNewPet, rollAnyPet } from '../src/engine/pet';
import { fillAllPets, newTestSave, openTestHogyoku } from '../src/engine/testMode';
import { petEffectText } from '../src/inventory';
import { newSaveData } from '../src/game';

const NEW = ['pet-soul', 'pet-solita', 'pet-kukkapuro', 'pet-yoruichi', 'pet-chappy', 'pet-kon', 'pet-wakame'];

describe('C.482 새 펫 7종 (효과 미정)', () => {
  it('데이터: 뒤에 7종, 효과 none · 얻는 길에 없음 · 양쪽 종족 같은 이름 · 그림 파일 있음(움직이는 webp)', () => {
    expect(PET_IDS.slice(4)).toEqual(NEW);
    for (const id of NEW) {
      const p = getPet(id)!;
      expect([p.effect, p.pool]).toEqual(['none', false]);
      expect(getFaction('hollow').petNames[id]).toBe(getFaction('shinigami').petNames[id]);
      const file = p.art.replace(/\./g, '-') + '.webp';
      expect(findArtFile(p.art, [file])).toBe('art/' + file);
      expect(existsSync('public/art/' + file)).toBe(true);
      // 콘은 가만히 선 그림(C.486 — 둥실거림 없앰), 나머지는 움직이는 webp
      expect(readFileSync('public/art/' + file).includes(Buffer.from('ANIM'))).toBe(id !== 'pet-kon');
    }
    expect(NEW.map((id) => getFaction('hollow').petNames[id])).toEqual(['길 잃은 혼백', '솔리타 바스타', '쿠카푸로', '요루이치', '차피', '콘', '미역대사']);
  });
  it('효과 없음: 보너스 0 · 효과 문구 "효과 준비 중" · 같이 공격은 한다', () => {
    for (const id of NEW) {
      expect(petBonusKeys(id)).toEqual([]);
      expect(petBonus({ id, level: 5 }, 'gold')).toBe(0);
      expect(petEffectText(id, 1)).toBe('효과 준비 중');
      expect(petAttackOf({ id, level: 1 })).not.toBeNull();
    }
  });
  it('얻는 길(굴림·펫 알·선물)은 그대로 4종만', () => {
    expect(PETS.filter((p) => p.pool).map((p) => p.id)).toEqual(PET_POOL_IDS);
    const st = newPetState();
    for (let i = 0; i < 200; i++) expect(PET_POOL_IDS).toContain(rollAnyPet(() => i / 200));
    for (const id of PET_POOL_IDS) grantPet(st, id, 1);
    expect(pickNewPet(st, () => 0.5)).toBeNull(); // 4종을 다 가지면 '다 가졌다' — 새 펫은 안 나온다
  });
  it('테스트 모드: 새 테스트 칸 = 모든 펫, 옛 테스트 칸도 열 때 채운다. 일반 새 게임은 0마리', () => {
    expect(Object.keys(newTestSave('hollow', 1).shared.pets.owned).sort()).toEqual([...PET_IDS].sort());
    const old = newSaveData('shinigami', 1);
    expect(Object.keys(old.shared.pets.owned)).toEqual([]);
    grantPet(old.shared.pets, 'pet-gold', 5);
    old.shared.pets.owned['pet-gold']!.laps = 33;
    openTestHogyoku(old, 9);
    expect(Object.keys(old.shared.pets.owned).sort()).toEqual([...PET_IDS].sort());
    expect(old.shared.pets.owned['pet-gold']).toEqual({ laps: 33, gotAt: 5 }); // 가진 펫은 그대로
    expect(fillAllPets(old, 10)).toBe(0);
  });
});
