// C.485 (GDD 9-4 v6.115): 그림 펫 자리 값 — 그림 키마다 dx·dy, 없으면 0,0. 이펙트 배치 도구 '펫' 탭 확정 값이 들어온다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PET_ART_SCALE, PET_PLACES, petPlace, PETS } from '../src/data/pets';
import { getFaction } from '../src/data/factions';

describe('C.485 그림 펫 자리', () => {
  it('없는 그림 키는 0,0 · 값은 정수 px', () => {
    expect(petPlace('pet.없는-그림')).toEqual({ dx: 0, dy: 0 });
    for (const v of Object.values(PET_PLACES)) expect([Number.isInteger(v.dx), Number.isInteger(v.dy)]).toEqual([true, true]);
  });
  it('자리 값의 키는 실제로 쓰는 펫 그림 키뿐이다', () => {
    const keys = new Set<string>(PETS.map((p) => p.art));
    for (const f of ['hollow', 'shinigami']) for (const k of Object.values(getFaction(f).petArt ?? {})) keys.add(k);
    for (const k of Object.keys(PET_PLACES)) expect(keys.has(k)).toBe(true);
  });
  it('C.486: 상자 = 그림 칸 수 × 배율(기본 1.7), 값에 scale·flip', () => {
    expect(PET_ART_SCALE).toBe(1.7);
    const src = readFileSync('src/ui/bha/pet.ts', 'utf8');
    expect(src).toContain('box.style.width = `${img.naturalWidth * scale}px`');
    expect(src).toContain("img.style.transform = 'scaleX(-1)'");
    for (const v of Object.values(PET_PLACES)) { if (v.scale !== undefined) expect(v.scale >= 0.3 && v.scale <= 5).toBe(true); }
  });
  it('petBuddy 가 translate 로 옮긴다(전투 튀는 동작의 transform 과 따로)', () => {
    const src = readFileSync('src/ui/bha/pet.ts', 'utf8');
    expect(src).toContain('b.style.translate = `${pl.dx}px ${pl.dy}px`');
  });
});
