// C.143 (GDD 89장): 호로 기본형 = 스토커, 사마귀형 = 시작 특수 외형
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { charArt } from '../src/data/art/manifest';
import { charArtKeys } from '../src/data/art/files';
import { getSkin } from '../src/data/skins';
import { FACTIONS } from '../src/data/factions';
import { newSaveData, migrateSave, loadSave, writeSave, SAVE_FORMAT_VERSION, artSkinOf } from '../src/game';

describe('C.143', () => {
  it('기본 그림 키 char.hollow 자리 = 스토커 정지 그림 + 걷기 6장', () => {
    expect(charArtKeys('hollow', 0)).toEqual(['char.hollow.1', 'char.hollow']);
    expect(existsSync('public/art/char-hollow.png')).toBe(true);
    expect(existsSync('public/art/skin-stalker.png')).toBe(false);
    expect(existsSync('public/art/skin-mantis.png')).toBe(true);
    for (let i = 1; i <= 6; i++) expect(existsSync(`public/art/char-hollow/move-${i}.png`)).toBe(true);
    expect(JSON.parse(readFileSync('public/art/char-hollow/anim.json', 'utf8')).move.ms).toBe(130);
    const files = [...Array.from({ length: 6 }, (_, i) => `char-hollow/move-${i + 1}.png`), 'char-hollow.png'];
    expect(charArt('hollow', 0, 'char.hollow', '/', undefined, files).anims?.move?.frames.length).toBe(6);
  });
  it('startLooks = 사마귀·거구·망령·속박자, stalker 스킨은 없다', () => {
    const h = FACTIONS.find((f) => f.id === 'hollow')!;
    expect(h.startLooks).toEqual(['mantis', 'brute', 'ghoul', 'shackled']);
    expect(getSkin('mantis')?.startOnly).toBe(true);
    expect(getSkin('stalker')).toBeUndefined();
  });
  it('옛 stalker 스킨 장착·보유 세이브는 버려지지 않고 기본 그림으로 보인다', () => {
    const s = newSaveData('hollow', 0);
    (s.shared.cosmetics as string[]).push('skin-stalker');
    (s as { skin: string | null }).skin = 'stalker';
    const m0 = new Map<string, string>();
    const st = { getItem: (k: string) => m0.get(k) ?? null, setItem: (k: string, v: string) => void m0.set(k, v), removeItem: (k: string) => void m0.delete(k), key: (i: number) => [...m0.keys()][i] ?? null, get length() { return m0.size; } };
    expect(writeSave(st as never, s)).toBe(true);
    const back = loadSave(st as never);
    expect(back).not.toBeNull();
    expect(back!.skin).toBeNull();
    const m = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(m).not.toBeNull();
    expect(m!.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m!.skin).toBeNull();
    expect(artSkinOf(m!)).toBeNull();
    expect(m!.shared.cosmetics).not.toContain('skin-stalker');
    const files = ['char-hollow.png'];
    expect(charArt('hollow', 0, 'char.hollow', '/', undefined, files, 'stalker').src).toContain('char-hollow.png');
  });
});
