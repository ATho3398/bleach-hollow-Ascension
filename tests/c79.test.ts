// C.79 (GDD 34장): 사냥터 배경 그림 층 · 무대 배경 · 출처 표기 · 홈 물건 이름 두 종족 통일
import { describe, expect, it } from 'vitest';
import { BG_CREDIT, BG_SCENES, bgArtKey, parseBackgrounds, sceneBg } from '../src/data/art/backgrounds';
import { artStem } from '../src/data/art/files';
import { GROUNDS } from '../src/data/grounds';
import { FACTIONS } from '../src/data/factions';
import { groundBgId, roomOf, ROOM_PROPS } from '../src/engine/faction';

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
  it('5종 이름이 두 종족 같다', () => {
    const want = { door: '모험', altar: '수련장', book: '책장', chest: '가방', shop: '상점' };
    for (const f of FACTIONS) expect(roomOf(f).props).toEqual(want);
  });
});

describe('책장 탭 통합 (34-5)', () => {
  it('홈 물건에 window 가 없고 책장 탭 파일이 있다', async () => {
    expect(ROOM_PROPS as readonly string[]).not.toContain('window');
    const { bookView } = await import('../src/ui/bookView');
    expect(typeof bookView).toBe('function');
  });
});

describe('배경 확대 (34-6·34-7)', () => {
  it('땅 띠가 낮은 장면만 같은 배율로 키운다 (하늘:땅 비율 유지, 줄이지 않음)', async () => {
    const { bgZoom, sceneBg, BG_SCENES } = await import('../src/data/art/backgrounds');
    expect(bgZoom(36)).toBeCloseTo(50 / 36);
    expect(bgZoom(58)).toBe(1);
    expect(bgZoom(95)).toBe(1);
    expect(bgZoom(1)).toBeLessThanOrEqual(2.2);
    const d = BG_SCENES.desert!;
    const bg = sceneBg('desert', '/', ['bg-desert-sky.webp', 'bg-desert-ground.webp'])!;
    expect(bg.layers[0]!.height / bg.layers[1]!.height).toBeCloseTo(d[0]!.height / d[1]!.height);
    expect(bg.layers[1]!.height).toBeCloseTo(50);
  });
});
