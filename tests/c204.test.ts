// C.204 (GDD 130장): 방 [밖으로] → 월드맵(홈·시장·모험) → 시장(온천·상점·떠돌이 상인). 기능 스위치 FEATURES.WORLD_MAP 으로 되돌릴 수 있다
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FEATURES } from '../src/config/features';
import { FACTIONS, getFaction } from '../src/data/factions';
import { marketOf, parseFactionConfig, roomOf, roomPropsShown, worldMapOf, WORLD_PLACES } from '../src/engine/faction';

const read = (p: string) => readFileSync(p, 'utf8');
afterEach(() => { FEATURES.WORLD_MAP = true; });

describe('130장 6 기능 스위치', () => {
  it('기본 = 켬', () => {
    expect(FEATURES.WORLD_MAP).toBe(true);
  });
  it('켬: 방 물건 = 밖으로(문 자리)·수련장·책장·가방 — 모험 문·장터는 없다', () => {
    expect(roomPropsShown()).toEqual(['altar', 'book', 'chest', 'outside']);
    for (const f of FACTIONS) {
      const r = roomOf(f);
      expect(r.props.outside).toBe('밖으로');
      expect(r.layout.outside).toEqual(r.layout.door);
    }
  });
  it('끔: 옛 방(모험 문 + 장터) 그대로, 밖으로 없음 · 장터 이름도 옛 이름', () => {
    FEATURES.WORLD_MAP = false;
    expect(roomPropsShown()).toEqual(['door', 'altar', 'book', 'chest', 'market']);
    expect(marketOf(getFaction('hollow')).name).toBe('웨코문도 장터');
    expect(marketOf(getFaction('shinigami')).name).toBe('루콘가 저잣거리');
  });
});

describe('130장 2·3 월드맵·시장 (종족 설정)', () => {
  it('시장 이름 = 두 종족 모두 "시장" (사용자 03:0x)', () => {
    for (const f of FACTIONS) expect(marketOf(f).name).toBe('시장');
  });
  it('월드맵 이름 = 호로 웨코문도 / 사신 소울 소사이어티, 장소 = 홈(nestName)·시장·모험(옛 문 이름)', () => {
    expect(worldMapOf(getFaction('hollow')).name).toBe('웨코문도');
    expect(worldMapOf(getFaction('shinigami')).name).toBe('소울 소사이어티');
    expect([...WORLD_PLACES]).toEqual(['home', 'market', 'adventure']);
    for (const f of FACTIONS) {
      const w = worldMapOf(f);
      expect(w.places).toEqual({ home: f.nestName, market: '시장', adventure: roomOf(f).props.door });
      expect(w.sceneArt).toBe('scene.worldmap');
    }
    expect(worldMapOf(getFaction('hollow')).places.home).toBe('둥지');
    expect(worldMapOf(getFaction('shinigami')).places.home).toBe('대원실');
  });
  it('종족 설정 검사: 월드맵 장소·위치가 틀리면 오류', () => {
    const base = JSON.parse(read('src/data/factions/hollow.json'));
    expect(() => parseFactionConfig({ ...base, worldmap: { layout: { castle: { x: 1, y: 1 } } } })).toThrow(/worldmap\.layout\.castle/);
    expect(() => parseFactionConfig({ ...base, worldmap: { layout: { home: { x: 200, y: 1 } } } })).toThrow(/worldmap\.layout\.home/);
    expect(() => parseFactionConfig({ ...base, worldmap: { name: '' } })).toThrow(/worldmap\.name/);
  });
  it('그림 키 자리: scene.worldmap·prop.outside·prop.home·prop.adventure (비어 있음 = 임시)', () => {
    const m = read('src/data/art/manifest.ts');
    for (const k of ['scene.worldmap', 'prop.outside', 'prop.home', 'prop.adventure']) expect(m).toContain(`'${k}': {}`);
  });
  it('종족 id 분기 없음', () => {
    for (const p of ['src/ui/worldMapView.ts', 'src/config/features.ts']) expect(read(p)).not.toMatch(/'hollow'|'shinigami'/);
  });
});

describe('130장 화면 연결 (app.ts·worldMapView)', () => {
  const app = read('src/ui/app.ts');
  const wm = read('src/ui/worldMapView.ts');
  it('방 [밖으로] → 월드맵, 장소 = 홈(방)·시장·모험(출발 준비), 옛 문과 같은 출발 처리', () => {
    expect(app).toContain('onOutside: () => openWorldMap(faction, s)');
    expect(app).toContain("open('worldmap', () => worldMapView(");
    expect(app).toContain('onHome: () => nestScreen()');
    expect(app).toContain('onMarket: () => openMarket(faction, s)');
    expect(app).toContain('onAdventure: () => departFromHome(faction, s)');
    expect(app).toContain('onDepart: () => departFromHome(faction, s)');
  });
  it('시장 왼쪽 위 = [월드맵으로](켬), 끔이면 옛 [방으로 돌아가기]', () => {
    expect(app).toContain("backLabel: FEATURES.WORLD_MAP ? '월드맵으로' : undefined");
  });
  it('기기 버튼: ▲▼ = 홈 → 시장 → 모험, 첫 선택 = 모험, 떠돌이 상인 배지·사망 잠김은 지도 위', () => {
    expect(wm).toContain('WORLD_PLACES.map((p) => ({ el: btns.get(p)! }))');
    expect(wm).toContain("btns.get('adventure')?.focus(");
    expect(wm).toContain("if (p === 'market' && here)");
    expect(wm).toContain("if (p === 'adventure' && save.nest.dead)");
  });
  it('회복 안내 온천: 켬이면 월드맵 → 시장 → 온천, 대상 = 밖으로', () => {
    expect(app).toContain('if (FEATURES.WORLD_MAP) openWorldMap(faction, s);');
    expect(read('src/data/help/tutorial.json')).toContain('"@.bha-prop--outside"');
  });
});
