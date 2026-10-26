// C.146 (사용자 "r1,2번, i4,5,6 번만 적용"): 방 물건 겹침·크기 통일 · 보관함 스킨 칩 · 탭 숫자 기준 · 카드 이중 표기
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getFaction } from '../src/data/factions';
import { cardDetailOf, skinGroupOf, SKIN_GROUPS } from '../src/ui/lcdScreens';

const read = (p: string) => readFileSync(p, 'utf8');
type Box = { l: number; r: number; t: number; b: number };
/** 방 장면(가로 628×296)에서 물건 그림 칸(86×76 × scale × 1.25, 문은 74×100)이 차지하는 칸 — 앵커 = 가운데 아래 (x%, y%) */
const SCENE = { w: 628, h: 296 };
const boxOf = (id: string, p: { x: number; y: number; scale?: number }): Box => {
  const s = (p.scale ?? 1) * 1.25;
  const [w, h] = id === 'door' ? [74, 100] : [86, 76];
  const cx = (p.x / 100) * SCENE.w;
  const bottom = (p.y / 100) * SCENE.h - 22 * s; // 이름표 높이만큼 위
  return { l: cx - (w * s) / 2, r: cx + (w * s) / 2, t: bottom - h * s, b: bottom };
};
const hit = (a: Box, c: Box) => a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b;
/** 캐릭터 칸: 가운데(50%, 54%), 그림 130×140 */
const CHAR: Box = { l: 314 - 65, r: 314 + 65, t: 0.54 * SCENE.h - 70, b: 0.54 * SCENE.h + 70 };

describe.each(['hollow', 'shinigami'])('C.146 방 물건 (%s)', (fid) => {
  const L = getFaction(fid!).room!.layout as Record<string, { x: number; y: number; scale?: number }>;
  const ids = ['door', 'book', 'altar', 'chest', 'shop'];
  it('R2: 방 물건 5개 크기 배율이 같다', () => {
    expect(new Set(ids.map((i) => L[i]!.scale)).size).toBe(1);

  });
  it('R1: 물건끼리·물건과 캐릭터가 겹치지 않는다 (펫 자리 오른쪽 발치 40px 포함)', () => {
    const boxes = Object.fromEntries(ids.map((i) => [i, boxOf(i, L[i]!)]));
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
  it('I4: 스킨 탭 칩 5개(전체·캐릭터·기기·키링·효과·꾸밈), 꾸밈 분류가 묶음으로 나뉜다', () => {
    expect(SKIN_GROUPS.map(([id]) => id)).toEqual(['all', 'character', 'device', 'keyring', 'effect']);
    expect(skinGroupOf('skin')).toBe('character');
    expect(skinGroupOf('device')).toBe('device');
    expect(skinGroupOf('keyring')).toBe('keyring');
    for (const c of ['aura', 'tint', 'trail', 'bar', 'shell', 'frame', undefined]) expect(skinGroupOf(c)).toBe('effect');
  });
  it('I5: 탭 숫자는 카드(종류) 수 — 개수 합이 아니다 (펫 탭 포함 전 탭 같은 기준)', () => {
    const src = read('src/ui/lcdScreens.ts');
    expect(src).toContain(".filter((e) => e.category === c).length");
    expect(src).not.toContain(".filter((e) => e.category === c).reduce((a, e) => a + e.count, 0)");
  });
  it('I6: 카드 설명에 "착용 중"·"보유"·"데리고 다니는 중"이 배지와 겹쳐 반복되지 않는다', () => {
    expect(cardDetailOf({ category: 'skin', detail: '착용 중', cosmeticCategory: 'aura' })).not.toContain('착용');
    expect(cardDetailOf({ category: 'skin', detail: '보유', cosmeticCategory: 'device' })).not.toBe('보유');
    expect(cardDetailOf({ category: 'pet', detail: '데리고 다니는 중 · 골드 +5%', cosmeticCategory: undefined })).toBe('골드 +5%');
    expect(cardDetailOf({ category: 'food', detail: '허기 −15', cosmeticCategory: undefined })).toBe('허기 −15');
  });
});
