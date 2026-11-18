// C.505 (GDD 12-4 v6.140): 그림 없는 초월자는 방·상태·걷기·전투 몸에서 진화체 그림을 빌리지 않고 빈 자리 표시 — 사용자 2026-11-19 "그냥 빈자리로 ㄱㄱ"
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ART_MANIFEST, charArt, EMPTY_LOOK, lookHasOwnArt } from '../src/data/art/manifest';
import { transcendentSkinLookId } from '../src/data/skins';
import { artSkinOf, newSaveData } from '../src/game';

const read = (p: string) => readFileSync(p, 'utf8');
const look = (tid: string, skin: string | null = null) => {
  const s = newSaveData('hollow', 1);
  s.transcendentId = tid;
  s.skin = skin;
  return artSkinOf(s);
};

describe('C.505 그림 없는 초월자 = 빈 자리', () => {
  it('그림 없는 초월자(유하바하·영왕·기본 모드 이치고) = EMPTY_LOOK, 진화체 외형을 입고 있어도 빌리지 않는다', () => {
    expect(look('yhwach')).toBe(EMPTY_LOOK);
    expect(look('iron-tyrant')).toBe(EMPTY_LOOK);
    expect(look('ichigo')).toBe(EMPTY_LOOK);
    const s = newSaveData('hollow', 1);
    s.transcendentId = 'yhwach';
    s.evolution.look = 'some-evolution-look';
    expect(artSkinOf(s)).toBe(EMPTY_LOOK);
  });
  it('그림 있는 초월자는 그대로 — 아이젠·태초(art) · Unknown(조각 모델) · 천년혈전 이치고(혈쇄 종이인형)', () => {
    expect(look('aizen')).toBe('char.transcendent-aizen');
    expect(look('zero-sage')).toBe('char.transcendent-zero-sage');
    expect(look('rift-wanderer')).toBe('mosaic:rift-wanderer');
    const blood = transcendentSkinLookId('ichigo', 'bloodchain');
    expect(lookHasOwnArt(blood)).toBe(true);
    expect(look('ichigo', blood)).toBe(blood);
    // 일반 트랙은 그대로 (스킨·진화 외형)
    const n = newSaveData('hollow', 1);
    expect(artSkinOf(n)).toBeNull();
  });
  it('charArt(EMPTY_LOOK) = 그림 없음 + empty 표시, 그림 키 파일이 없으면 lookHasOwnArt false', () => {
    const a = charArt('hollow', 3, 'char.hollow', '/', ART_MANIFEST, [], EMPTY_LOOK);
    expect(a).toMatchObject({ src: null, frames: null, empty: true });
    expect(lookHasOwnArt('char.transcendent-zero-sage', [])).toBe(false);
    expect(lookHasOwnArt('char.transcendent-zero-sage', ['char-transcendent-zero-sage/idle-1.png'])).toBe(true);
  });
  it('방·전투·걷기 몸은 empty 면 카드 창과 같은 자리 표시(emptyArtMark = bha-dexart + i-evolve)', () => {
    expect(read('src/ui/bha/dom.ts')).toContain("const box = el('span', 'bha-dexart bha-emptyart');");
    for (const f of ['src/ui/bha/room.ts', 'src/ui/bha/battle.ts', 'src/ui/bha/walk.ts']) expect(read(f)).toContain('body.append(emptyArtMark());');
  });
});
