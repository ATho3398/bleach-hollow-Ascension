// C.146 (사용자 "r1,2번, i4,5,6 번만 적용"): 방 물건 겹침·크기 통일 · 보관함 스킨 칩 · 탭 숫자 기준 · 카드 이중 표기
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getFaction } from '../src/data/factions';
import { roomOf } from '../src/engine/faction';
import { cardDetailOf } from '../src/ui/lcdScreens';
import { skinSubOf, SKIN_SUBTABS } from '../src/data/shop';

const read = (p: string) => readFileSync(p, 'utf8');
type Box = { l: number; r: number; t: number; b: number };
/** 방 장면(가로 628×296)에서 물건 그림 칸(86×76 × scale × 1.25, 문은 74×100)이 차지하는 칸 — C.153 부터 (x%, y%) = 발 기준점(그림 아래 가운데) */
const SCENE = { w: 628, h: 296 };
const boxOf = (id: string, p: { x: number; y: number; scale?: number }): Box => {
  const s = (p.scale ?? 1) * 1.25;
  const [w, h] = id === 'door' ? [74, 100] : [86, 76];
  const cx = (p.x / 100) * SCENE.w;
  const bottom = (p.y / 100) * SCENE.h;
  return { l: cx - (w * s) / 2, r: cx + (w * s) / 2, t: bottom - h * s, b: bottom + 20 }; // 이름표 20px 포함
};
const hit = (a: Box, c: Box) => a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b;
/** 캐릭터 칸: 발 기준점(characterFoot) 위로 그림 140px (가운데에서 발까지 약 62px) */
const charBox = (f: { x: number; y: number }): Box => ({ l: (f.x / 100) * SCENE.w - 65, r: (f.x / 100) * SCENE.w + 65, t: (f.y / 100) * SCENE.h - 62 - 70, b: (f.y / 100) * SCENE.h - 62 + 70 });

describe.each(['hollow', 'shinigami'])('C.146 방 물건 (%s)', (fid) => {
  const L = getFaction(fid!).room!.layout as Record<string, { x: number; y: number; scale?: number }>;
  const ids = ['door', 'book', 'altar', 'chest', 'shop'];
  it('R2 (C.153 A1): 크기 — 모험(문)이 가장 크고 책장·상점이 가장 작다, 수련장·보관함은 같다', () => {
    const sc = (i: string) => L[i]!.scale ?? 1;
    expect(sc('door')).toBeGreaterThan(sc('altar'));
    expect(sc('altar')).toBe(sc('chest'));
    expect(sc('book')).toBe(sc('altar')); // C.159 A4: 보관함·책장·상점·수련장 4개 같은 크기
    expect(sc('shop')).toBe(sc('book'));
  });
  it('R1: 물건끼리·물건과 캐릭터가 겹치지 않는다 (펫 자리 오른쪽 발치 40px 포함)', () => {
    const boxes = Object.fromEntries(ids.map((i) => [i, boxOf(i, L[i]!)]));
    const CHAR = charBox(roomOf(getFaction(fid!)).characterFoot);
    for (const i of ids) expect(hit(boxes[i]!, { ...CHAR, r: CHAR.r + 40 }), `${i} × 캐릭터`).toBe(false);
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) expect(hit(boxes[ids[a]!]!, boxes[ids[b]!]!), `${ids[a]} × ${ids[b]}`).toBe(false);
  });
  it('문은 맨 왼쪽 · 수련장은 오른쪽 끝 (C.131 규칙 유지)', () => {
    expect(L.door!.x).toBeLessThanOrEqual(12);
    expect(L.altar!.x).toBeGreaterThan(75);
    expect(L.door!.x).toBeLessThan(L.book!.x);
  });
});

describe('C.146 보관함', () => {
  it('I4 (C.153 A3): 스킨 하위 탭 = 캐릭터·공격 이펙트·이동 이펙트·키링·기기·연출·꾸밈, 꾸밈 분류가 나뉜다', () => {
    expect(SKIN_SUBTABS.map(([id]) => id)).toEqual(['character', 'attackFx', 'moveFx', 'keyring', 'device', 'etc']);
    expect(skinSubOf('skin')).toBe('character');
    expect(skinSubOf('fx')).toBe('attackFx');
    expect(skinSubOf('trail')).toBe('moveFx');
    expect(skinSubOf('keyring')).toBe('keyring');
    expect(skinSubOf('device')).toBe('device');
    for (const c of ['enter', 'evo', 'frame', 'room', undefined]) expect(skinSubOf(c)).toBe('etc');
  });
  it('I5: 탭 숫자는 카드(종류) 수 — 개수 합이 아니다 (펫 탭 포함 전 탭 같은 기준)', () => {
    const src = read('src/ui/lcdScreens.ts');
    expect(src).toContain(".filter((e) => e.category === c && listed(e)).length");
    expect(src).not.toContain(".filter((e) => e.category === c).reduce((a, e) => a + e.count, 0)");
  });
  it('I6: 카드 설명에 "착용 중"·"보유"·"데리고 다니는 중"이 배지와 겹쳐 반복되지 않는다', () => {
    expect(cardDetailOf({ category: 'skin', detail: '착용 중', cosmeticCategory: 'aura' })).not.toContain('착용');
    expect(cardDetailOf({ category: 'skin', detail: '보유', cosmeticCategory: 'device' })).not.toBe('보유');
    expect(cardDetailOf({ category: 'pet', detail: '데리고 다니는 중 · 골드 +5%', cosmeticCategory: undefined })).toBe('골드 +5%');
    expect(cardDetailOf({ category: 'food', detail: '배부름 +15', cosmeticCategory: undefined })).toBe('배부름 +15');
  });
});
