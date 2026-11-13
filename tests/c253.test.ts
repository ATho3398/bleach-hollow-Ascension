// C.253 (사용자 2026-11-03 캡처 점검 "2번말고 고쳐. 그리고 캐릭터가 … 아이콘 앞으로 와야지"): 그림이 이름표를 덮지 않게 · 캐릭터는 장소 그림 앞 · '상인' 배지는 그림 위 · 우라하라 자리
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { marketOf } from '../src/engine/faction';

const read = (p: string) => readFileSync(p, 'utf8');

describe('C.253 장소 그림 점검', () => {
  it('물건 그림은 상자 안에 갇히고(격자 칸 최소 크기 풀기) 이름표는 그림 위 층', () => {
    const css = read('src/ui/bha/room.css');
    expect(css).toContain('.bha-prop .bha-prop__shape.has-art > .bha-prop__img { min-width: 0; min-height: 0; object-position: 50% 100%; }');
    expect(css).toContain('.bha-prop__tag { position: relative; z-index: 1; }');
  });
  it('월드맵·시장 캐릭터는 장소 그림 앞(z 2)', () => {
    expect(read('src/ui/bha/worldmap.css')).toMatch(/\.bha-worldmap__char \{[^}]*z-index: 2;/);
    expect(read('src/ui/bha/market.css')).toContain('.bha-market__char { z-index: 2; }');
  });
  it("'상인' 배지는 그림 칸 위쪽 여백만큼 내려 지붕 바로 위", () => {
    // C.284 (GDD 183장 화면 A, v2 S02): 배지는 이름표 안 황동 배지로 옮겼다 — 그림 위에 뜨지 않는다
    expect(read('src/ui/worldMapView.ts')).toContain("b.querySelector('.bha-prop__tag')?.append(el('span', 'bha-badge bha-badge--brass bha-prop__badge', '상인'));");
  });
  it('우라하라 기본 자리 = 사용자가 배치 도구로 잡은 왼쪽 위 (C.263, 옛 C.253·254 왼쪽 앞 대체)', () => {
    expect(marketOf({}).layout.wanderer).toEqual({ x: 19.8, y: 45.5, scale: 1.05 });
  });
});

// C.254 (사용자 2026-11-03 "도전의 탑 사신쪽도 통일 … 우라하라 1.2배, 특성상점0.8배, 도전의 탑 1.2배, 온천 1.2배, 대원실 1.2배 … 대장장이 … 중간쯤으로")
describe('C.254 장소 그림 크기·자리', () => {
  it('시장: 특성 상점·대장장이 = 사용자가 배치 도구로 잡은 값 (C.263, 옛 C.254 ×0.8·x 60 대체)', () => {
    const l = marketOf({}).layout;
    expect(l.traitShop).toEqual({ x: 88.2, y: 85.2, scale: 1.15 });
    expect(l.smith).toEqual({ x: 64.9, y: 84.1, scale: 1.23 });
  });
  it('월드맵 탑 그림은 두 종족 공용 키 prop.tower', () => {
    expect(read('src/data/art/manifest.ts')).toContain("'prop.tower': {},");
  });
});

// C.255 (사용자 2026-11-03 "각각 가방, 월드맵 아이콘으로 변경(대원실에서 나가기 아이콘은 지금 그대로 놔둬)")
describe('C.255 가방·시장 월드맵 물건 그림', () => {
  it('시장의 월드맵 물건은 지도 그림 키(prop.worldmap), 방의 나가기 문은 prop.outside 그대로', () => {
    const mv = read('src/ui/marketView.ts');
    expect(mv).toContain("const exitArt = artUrls('prop.worldmap').src ? 'prop.worldmap' : 'prop.outside';");
    expect(mv).toContain('artKey: exitArt');
    expect(read('src/ui/bha/room.ts')).toContain('const key = o.artKey ?? `prop.${o.prop}`;');
    expect(read('src/data/art/manifest.ts')).toContain("'prop.worldmap': { scale: 1.5 }");
  });
});
