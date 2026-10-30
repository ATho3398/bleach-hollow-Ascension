// C.204 (GDD 130장): 방 [밖으로] → 월드맵(홈·시장·모험) → 시장(온천·상점·떠돌이 상인). C.215 (137장 3): 스위치·옛 경로 폐기, 이걸로 고정
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FACTIONS, getFaction } from '../src/data/factions';
import { marketOf, parseFactionConfig, roomOf, ROOM_PROPS, worldMapOf, WORLD_PLACES } from '../src/engine/faction';

const read = (p: string) => readFileSync(p, 'utf8');

describe('137장 3 밖으로 고정 (옛 스위치·모험 문·장터 폐기)', () => {
  it('방 물건 = 수련장·책장·가방·밖으로(옛 문 자리) — 모험 문·장터는 없다', () => {
    expect([...ROOM_PROPS]).toEqual(['altar', 'book', 'chest', 'outside']);
    for (const f of FACTIONS) {
      const r = roomOf(f);
      expect(r.props.outside).toBe('밖으로');
      expect(r.layout.outside).toMatchObject({ x: 9, y: 78 });
    }
  });
  it('기능 스위치 파일·옛 경로 코드가 없다', () => {
    expect(() => read('src/config/features.ts')).toThrow();
    for (const p of ['src/ui/app.ts', 'src/ui/roomView.ts', 'src/engine/faction.ts']) {
      expect(read(p)).not.toContain('FEATURES');
      expect(read(p)).not.toContain('roomPropsShown');
    }
    expect(read('src/ui/roomView.ts')).not.toContain('onDepart');
    expect(read('src/ui/roomView.ts')).not.toContain('onMarket');
    expect(() => parseFactionConfig({ ...JSON.parse(read('src/data/factions/hollow.json')), room: { props: { door: '문' } } })).toThrow(/room\.props\.door/);
  });
});

describe('130장 2·3 월드맵·시장 (종족 설정)', () => {
  it('시장 이름 = 두 종족 모두 "시장" (사용자 03:0x)', () => {
    for (const f of FACTIONS) expect(marketOf(f).name).toBe('시장');
  });
  it('월드맵 이름 = 호로 웨코문도 / 사신 소울 소사이어티, 장소 = 홈(nestName)·시장·모험·탑(139장 1)', () => {
    expect(worldMapOf(getFaction('hollow')).name).toBe('웨코문도');
    expect(worldMapOf(getFaction('shinigami')).name).toBe('소울 소사이어티');
    expect([...WORLD_PLACES]).toEqual(['home', 'market', 'adventure', 'tower']);
    for (const f of FACTIONS) {
      const w = worldMapOf(f);
      expect(w.places).toEqual({ home: f.nestName, market: '시장', adventure: '모험', tower: '도전의 탑' });
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
    for (const p of ['src/ui/worldMapView.ts']) expect(read(p)).not.toMatch(/'hollow'|'shinigami'/);
  });
});

describe('130장 화면 연결 (app.ts·worldMapView)', () => {
  const app = read('src/ui/app.ts');
  const wm = read('src/ui/worldMapView.ts');
  it('방 [밖으로] → 월드맵, 장소 = 홈(방)·시장·모험(출발 준비), 옛 문과 같은 출발 처리', () => {
    expect(app).toContain('onOutside: () => openWorldMap(faction, s)');
    expect(app).toContain("nav.push({ id: 'worldmap', interceptBack: worldMapCancelWalk,");
    expect(app).toContain('onHome: () => nestScreen()');
    expect(app).toContain("onMarket: () => { worldAt = 'market'; openMarket(faction, s); }");
    expect(app).toContain("onAdventure: () => { worldAt = 'adventure'; departFromHome(faction, s); }");
  });
  it('시장 왼쪽 위 = [월드맵으로]', () => {
    expect(app).toContain("backLabel: '월드맵으로',");
  });
  it('기기 버튼: ▲▼ = 홈 → 시장 → 모험 → 탑, 첫 선택 = 모험, 떠돌이 상인 배지·사망 잠김은 지도 위', () => {
    expect(wm).toContain('WORLD_PLACES.map((p) => ({ el: btns.get(p)! }))');
    expect(wm).toContain('btns.get(hd.focus ?? at)?.focus('); // C.208 (GDD 132장 2): 첫 선택 = 지금 있던 장소
    expect(wm).toContain("if (p === 'market' && here)");
    expect(wm).toContain("if ((p === 'adventure' || p === 'tower') && save.nest.dead)"); // C.217: 탑도 사망 잠김 (139장 1)
  });
  it('회복 안내 온천: 밖으로 → 시장 → 온천, 대상 = 밖으로 (C.206 부터 사용자가 직접 간다)', () => {
    expect(app).toContain(`'.bha-prop--outside, .bha-worldmap [data-place="market"], .bha-market [data-spot="spa"]'`);
    expect(read('src/data/help/tutorial.json')).toContain('"@.bha-prop--outside"');
  });
});
