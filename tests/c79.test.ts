// C.79 (GDD 34장): 사냥터 배경 그림 층 · 무대 배경 · 출처 표기 · 홈 물건 이름 두 종족 통일
import { describe, expect, it } from 'vitest';
import { BG_CREDIT, BG_SCENES, bgArtKey, parseBackgrounds, sceneBg } from '../src/data/art/backgrounds';
import { artStem } from '../src/data/art/files';
import { GROUNDS } from '../src/data/grounds';
import { FACTIONS } from '../src/data/factions';
import { groundBgId, roomOf } from '../src/engine/faction';

describe('배경 데이터 (34-1)', () => {
  it('장면마다 층이 있고 파일 이름은 bg-<장면>-<층>', () => {
    expect(Object.keys(BG_SCENES).length).toBeGreaterThan(0);
    expect(artStem(bgArtKey('desert', 'sky'))).toBe('bg-desert-sky');
  });
  it('들어 있는 층만 쓰고, 하나도 없으면 null (지금 모습 그대로)', () => {
    const files = ['bg-desert-ground.webp'];
    const bg = sceneBg('desert', '/b/', files)!;
    expect(bg.layers).toHaveLength(1);
    expect(bg.layers[0]!.url).toBe('/b/art/bg-desert-ground.webp');
    expect(bg.layers[0]!.ratio).toBeCloseTo(1024 / 180);
    expect(sceneBg('desert', '/', [])).toBeNull();
    expect(sceneBg('nope', '/', files)).toBeNull();
    expect(sceneBg(undefined, '/', files)).toBeNull();
  });
  it('잘못된 데이터는 거부', () => {
    expect(() => parseBackgrounds({ credit: 'x', scenes: { a: { layers: [] } } })).toThrow();
    expect(() => parseBackgrounds({ credit: '', scenes: {} })).toThrow();
    expect(() => parseBackgrounds({ credit: 'x', scenes: { a: { layers: [{ id: 'sky', w: 1, h: 1, height: 150, speed: 1 }] } } })).toThrow();
  });
  it('출처 표기 문구', () => {
    expect(BG_CREDIT).toContain('Bleach DS 4th Flame Bringer');
    expect(BG_CREDIT).toContain('Kazushi / Owari / Ichiron47 / DanMT');
  });
});

describe('종족 설정의 배경 연결 (34-1)', () => {
  it('모든 사냥터·무대가 있는 장면을 가리킨다 (종족 설정 데이터로만 연결)', () => {
    for (const f of FACTIONS) {
      for (const g of GROUNDS) {
        const id = groundBgId(f, g.id);
        expect(id, `${f.id}.${g.id}`).toBeDefined();
        expect(BG_SCENES[id!], `${f.id}.${g.id} → ${id}`).toBeDefined();
      }
      expect(BG_SCENES[f.arenaBg!]).toBeDefined();
    }
  });
  it('모르는 사냥터는 배경 없음', () => {
    expect(groundBgId(FACTIONS[0]!, 'nope')).toBeUndefined();
    expect(groundBgId(FACTIONS[0]!, undefined)).toBeUndefined();
  });
});

describe('홈 물건 이름 두 종족 통일 (34-2)', () => {
  it('7종 이름이 두 종족 같다', () => {
    const want = { door: '출발 문', altar: '제단', book: '기록서', chest: '보관함', window: '창문', dummy: '훈련 인형', shop: '상점' };
    for (const f of FACTIONS) expect(roomOf(f).props).toEqual(want);
  });
});
