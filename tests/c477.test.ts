// C.477 (GDD 9-4 v6.108): 펫 그림을 종족 설정 petArt 로 바꿔 끼운다 — 사신 골드 펫(지옥나비) = 움직이는 지옥나비 그림.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { findArtFile } from '../src/data/art/files';
import { getPet } from '../src/data/pets';
import { parseFactionConfig } from '../src/engine/faction';

describe('C.477 펫 그림 = 종족 설정 petArt', () => {
  it('골드 펫 그림: 사신 = 지옥나비, 호로 = 뼈 까마귀(C.478)', () => {
    expect(getFaction('hollow').petNames['pet-gold']).toBe('뼈 까마귀');
    for (const f of ['pet-hell-butterfly.webp', 'pet-bone-crow.webp']) expect(readFileSync(`public/art/${f}`).includes(Buffer.from('ANIM'))).toBe(true);
    expect(getFaction('shinigami').petNames['pet-gold']).toBe('지옥나비');
    expect(getFaction('shinigami').petArt).toEqual({ 'pet-gold': 'pet.hell-butterfly' });
    expect(getFaction('hollow').petArt).toEqual({ 'pet-gold': 'pet.bone-crow' }); // C.478 뼈 까마귀
  });
  it('그림 파일이 있고(움직이는 webp), 펫 데이터의 기본 키에는 파일이 없다', () => {
    expect(existsSync('public/art/pet-hell-butterfly.webp')).toBe(true);
    expect(readFileSync('public/art/pet-hell-butterfly.webp').includes(Buffer.from('ANIM'))).toBe(true);
    expect(findArtFile('pet.hell-butterfly', ['pet-hell-butterfly.webp'])).toBe('art/pet-hell-butterfly.webp');
    expect(findArtFile(getPet('pet-gold')!.art, ['pet-hell-butterfly.webp'])).toBeNull();
  });
  it('petArt 는 있는 펫 id 만 받는다', () => {
    const raw = JSON.parse(readFileSync('src/data/factions/shinigami.json', 'utf8'));
    expect(() => parseFactionConfig({ ...raw, petArt: { 'pet-nope': 'pet.x' } })).toThrow(/petArt/);
    expect(() => parseFactionConfig({ ...raw, petArt: { 'pet-gold': '' } })).toThrow(/petArt/);
  });
});
