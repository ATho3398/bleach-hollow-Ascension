// 그림 파일 규칙 (GDD 17-6): 키 조립, 파일 조회, 없을 때 대체, 우선순위, 필요 파일 목록
import { describe, expect, it } from 'vitest';
import { artFileName, artStem, charArtKeys, enemyArtKey, findArtFile } from '../src/data/art/files';
import { artWishlist } from '../src/data/art/list';
import { artUrls, charArt, enemyArt, type ArtEntry } from '../src/data/art/manifest';
import { ENEMIES } from '../src/data/enemies';
import { FACTIONS } from '../src/data/factions';

describe('키 조립', () => {
  it('마침표를 하이픈으로 바꿔 파일 이름 기본형을 만든다', () => {
    expect(artStem('enemy.a-basic')).toBe('enemy-a-basic');
    expect(artStem('char.hollow.3')).toBe('char-hollow-3');
    expect(artFileName('scene.cave')).toBe('scene-cave.png');
  });
  it('캐릭터 키는 단계별(1부터) → 종족 공통 순서, 적 키는 적 id', () => {
    expect(charArtKeys('hollow', 0)).toEqual(['char.hollow.1', 'char.hollow']);
    expect(charArtKeys('shinigami', 4)).toEqual(['char.shinigami.5', 'char.shinigami']);
    expect(enemyArtKey('b-stance')).toBe('enemy.b-stance');
  });
});

describe('파일 조회', () => {
  it('목록에 있는 파일만 찾고 webp 를 png 보다 먼저 본다', () => {
    expect(findArtFile('enemy.a-basic', [])).toBeNull();
    expect(findArtFile('enemy.a-basic', ['enemy-a-basic.png'])).toBe('art/enemy-a-basic.png');
    expect(findArtFile('enemy.a-basic', ['enemy-a-basic.png', 'enemy-a-basic.webp'])).toBe('art/enemy-a-basic.webp');
    expect(findArtFile('enemy.a-basic', ['enemy-a-basic.jpg', 'enemy-a-basic2.png'])).toBeNull();
  });
});

describe('적 그림', () => {
  it('파일이 없으면 null(기존 실루엣), 있으면 배포 경로를 붙인다', () => {
    expect(enemyArt('a-basic', './', {}, [])).toBeNull();
    expect(enemyArt('a-basic', './', {}, ['enemy-a-basic.png'])).toEqual({ src: './art/enemy-a-basic.png', frames: null, scale: 1, offsetY: 0 });
  });
  it('manifest 에 scale·offsetY 만 적어도 파일과 함께 쓰인다(파일 없이는 여전히 null)', () => {
    const m: Record<string, ArtEntry> = { 'enemy.a-stance': { scale: 1.4, offsetY: -3 } };
    expect(enemyArt('a-stance', '/', m, [])).toBeNull();
    expect(enemyArt('a-stance', '/', m, ['enemy-a-stance.webp'])).toMatchObject({ src: '/art/enemy-a-stance.webp', scale: 1.4, offsetY: -3 });
  });
});

describe('캐릭터 그림 대체 순서', () => {
  const fb = 'char.hollow';
  it('단계별 파일 > 종족 공통 파일 > manifest 의 기존 2프레임 > 자리표시', () => {
    const m: Record<string, ArtEntry> = { [fb]: { frames: ['art/old1.png', 'art/old2.png'], scale: 1.2 } };
    expect(charArt('hollow', 2, fb, '/', m, ['char-hollow-3.png', 'char-hollow.png']).src).toBe('/art/char-hollow-3.png');
    expect(charArt('hollow', 1, fb, '/', m, ['char-hollow-3.png', 'char-hollow.png']).src).toBe('/art/char-hollow.png');
    const old = charArt('hollow', 1, fb, '/', m, []);
    expect(old.src).toBeNull();
    expect(old.frames).toEqual(['/art/old1.png', '/art/old2.png']);
    expect(charArt('hollow', 1, fb, '/', {}, [])).toEqual({ src: null, frames: null, scale: 1, offsetY: 0 });
  });
  it('새 규칙 그림이 있으면 기존 2프레임은 쓰지 않고, 보정값은 기존 키의 것을 이어받는다', () => {
    const m: Record<string, ArtEntry> = { [fb]: { frames: ['art/old1.png', 'art/old2.png'], scale: 1.2, offsetY: 4 } };
    const a = charArt('hollow', 0, fb, '/', m, ['char-hollow-1.png']);
    expect(a.frames).toBeNull();
    expect(a).toMatchObject({ scale: 1.2, offsetY: 4 });
  });
  it('다른 종족의 파일은 섞이지 않는다', () => {
    expect(charArt('hollow', 0, fb, '/', {}, ['char-shinigami-1.png']).src).toBeNull();
  });
});

describe('scene·prop 은 manifest 없이 파일만 넣어도 인식', () => {
  it('직접 지정이 있으면 그것이 우선', () => {
    expect(artUrls('prop.door', '/', {}, ['prop-door.png']).src).toBe('/art/prop-door.png');
    expect(artUrls('prop.door', '/', { 'prop.door': { src: 'art/mine.png' } }, ['prop-door.png']).src).toBe('/art/mine.png');
    expect(artUrls('prop.door', '/', {}, []).src).toBeNull();
  });
});

describe('필요 파일 목록', () => {
  const rows = artWishlist(FACTIONS, ENEMIES, { 'scene.cave': {}, 'prop.door': {}, 'char.hollow': {} }, ['enemy-a-basic.png', 'char-hollow-2.webp']);
  it('종족 × 단계 + 종족 공통, 실제 적 전부(테스트용 적 제외), 방 키를 담는다', () => {
    const f = new Set(rows.map((r) => r.file));
    for (const fac of FACTIONS) {
      fac.tierNames.forEach((_, i) => expect(f.has(`char-${fac.id}-${i + 1}.png`)).toBe(true));
      expect(f.has(`char-${fac.id}.png`)).toBe(true);
    }
    for (const e of ENEMIES.filter((x) => !x.testOnly)) expect(f.has(`enemy-${e.id}.png`)).toBe(true);
    expect(f.has('enemy-test-a.png')).toBe(false);
    expect(f.has('scene-cave.png') && f.has('prop-door.png')).toBe(true);
    expect(f.has('char-hollow.png')).toBe(true); // 'char.hollow' 는 방이 아니라 캐릭터 공통으로만 한 번
    expect(rows.filter((r) => r.file === 'char-hollow.png')).toHaveLength(1);
  });
  it('이미 들어 있는 파일은 present', () => {
    expect(rows.find((r) => r.file === 'enemy-a-basic.png')!.present).toBe(true);
    expect(rows.find((r) => r.file === 'char-hollow-2.png')!.present).toBe(true);
    expect(rows.find((r) => r.file === 'enemy-b-basic.png')!.present).toBe(false);
  });
});
