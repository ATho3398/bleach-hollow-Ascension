// C.477 (GDD 9-4 v6.108): 펫 그림을 종족 설정 petArt 로 바꿔 끼운다 — 사신 골드 펫(지옥나비) = 움직이는 지옥나비 그림.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { findArtFile } from '../src/data/art/files';
import { getPet } from '../src/data/pets';
import { parseFactionConfig } from '../src/engine/faction';

describe('C.477 펫 그림 = 종족 설정 petArt', () => {
  it('사신 골드 펫(지옥나비)만 그림 키가 있고, 호로는 없다(뼈 까마귀는 아직 아이콘)', () => {
    expect(getFaction('shinigami').petNames['pet-gold']).toBe('지옥나비');
    expect(getFaction('shinigami').petArt).toEqual({ 'pet-gold': 'pet.hell-butterfly' });
    expect(getFaction('hollow').petArt).toEqual({});
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
