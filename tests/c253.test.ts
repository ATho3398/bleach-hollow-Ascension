// C.253 (사용자 2026-11-03 캡처 점검 "2번말고 고쳐. 그리고 캐릭터가 … 아이콘 앞으로 와야지"): 그림이 이름표를 덮지 않게 · 캐릭터는 장소 그림 앞 · '상인' 배지는 그림 위 · 떠돌이 상인 자리
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { marketOf } from '../src/engine/faction';

const read = (p: string) => readFileSync(p, 'utf8');

describe('C.253 장소 그림 점검', () => {
  it('물건 그림은 상자 안에 갇히고(격자 칸 최소 크기 풀기) 이름표는 그림 위 층', () => {
    const css = read('src/ui/bha/room.css');
    expect(css).toContain('.bha-prop .bha-prop__shape.has-art > .bha-prop__img { min-width: 0; min-height: 0; }');
    expect(css).toContain('.bha-prop__tag { position: relative; z-index: 1; }');
  });
  it('월드맵·시장 캐릭터는 장소 그림 앞(z 2)', () => {
    expect(read('src/ui/bha/worldmap.css')).toMatch(/\.bha-worldmap__char \{[^}]*z-index: 2;/);
    expect(read('src/ui/bha/market.css')).toContain('.bha-market__char { z-index: 2; }');
  });
  it("'상인' 배지는 그림 칸 위쪽 여백만큼 내려 지붕 바로 위", () => {
    expect(read('src/ui/bha/market.css')).toContain('.bha-prop.has-visitor .bha-prop__shape.has-art .bha-prop__badge { top: 14%; right: 10%; }');
  });
  it('떠돌이 상인 기본 자리 = 왼쪽 앞(장비 상점·대장장이·특성 상점과 안 겹침)', () => {
    expect(marketOf({}).layout.wanderer).toEqual({ x: 34, y: 90, scale: 0.85 });
  });
});
