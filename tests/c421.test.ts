// C.421 (GDD 12-2·15-1, 코딩278): 사용자 붕옥 그림 — 방·메뉴 아이콘, 붕옥 창 왼쪽 큰 그림, 100% 불꽃 16프레임 · 창 배치(왼쪽 그림·오른쪽 탭)
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { ART_MANIFEST, artUrls } from '../src/data/art/manifest';
import { findArtFile } from '../src/data/art/files';
import { newSaveData } from '../src/game';
import { HOGYOKU_MATERIALS, hogyokuFlameOn } from '../src/ui/hogyokuView';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const png = (p: string) => {
  const b = readFileSync(new URL(`../${p}`, import.meta.url));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
const HX = BALANCE.provisional.hogyoku;

describe('C.421 붕옥 그림', () => {
  it('그림 파일 = 사용자 원본 그대로 · 규격 (아이콘 32 · 붕옥 64 · 불꽃 96×16)', () => {
    const src = 'docs/design/user-art/hogyoku-1112';
    for (const [pub, orig] of [['prop-hogyoku.png', 'icon.png'], ['hogyoku-orb.png', 'orb-panel.png'], ['hogyoku-flame.png', 'orb-flame/flame-sheet.png']] as const) {
      expect(existsSync(new URL(`../public/art/${pub}`, import.meta.url)), pub).toBe(true);
      expect(readFileSync(new URL(`../public/art/${pub}`, import.meta.url)).equals(readFileSync(new URL(`../${src}/${orig}`, import.meta.url))), pub).toBe(true);
    }
    expect(png('public/art/prop-hogyoku.png')).toEqual({ w: 32, h: 32 });
    expect(png('public/art/hogyoku-orb.png')).toEqual({ w: 64, h: 64 });
    expect(png('public/art/hogyoku-flame.png')).toEqual({ w: 96 * 16, h: 96 });
  });

  it('그림 키 = 파일 이름 규칙 (prop.hogyoku · hogyoku.orb · hogyoku.flame)', () => {
    const files = ['prop-hogyoku.png', 'hogyoku-orb.png', 'hogyoku-flame.png'];
    for (const k of ['prop.hogyoku', 'hogyoku.orb', 'hogyoku.flame']) {
      expect(k in ART_MANIFEST, k).toBe(true);
      expect(findArtFile(k, files), k).toMatch(/^art\//);
      expect(artUrls(k, '/', ART_MANIFEST, files).src, k).toMatch(/\.png$/);
    }
  });

  it('불꽃 = 개발 100%에서만 (합체 뒤 5단계로 내려가면 꺼짐)', () => {
    const s = newSaveData('hollow', 0);
    s.hogyoku.level = HX.maxLevel - 1;
    expect(hogyokuFlameOn(s)).toBe(false);
    s.hogyoku.level = HX.maxLevel;
    expect(hogyokuFlameOn(s)).toBe(true);
    s.hogyoku.level = HX.halfLevel;
    expect(hogyokuFlameOn(s)).toBe(false);
  });

  it('붕옥 창: 재료 3종(얻는 곳) — 탭 배치는 C.423 사용자 스케치(상세 + 세로 목록)로 바뀜', () => {
    expect(HOGYOKU_MATERIALS.map((m) => m.id)).toEqual(['soul', 'shard', 'essence']);
    for (const m of HOGYOKU_MATERIALS) expect(m.from()).toMatch(/\S/);
    const v = read('src/ui/hogyokuView.ts');
    for (const k of ['bha-hgorb__flame', 'artSrc(look.art)', 'artSrc(look.flame)']) expect(v).toContain(k);
    expect(v).not.toMatch(/faction(Id)? === '(hollow|shinigami)'/);
  });

  it('CSS: 픽셀 그대로 · 정수 배율 · 16프레임 steps 반복 · 토큰만', () => {
    const css = read('src/ui/bha/screens-lcd.css');
    expect(css).toMatch(/\.bha-hgorb__img \{[^}]*image-rendering: pixelated/);
    expect(css).toMatch(/\.bha-hgorb__img\.is-orb \{[^}]*calc\(64px \* var\(--hg-s\)\)/);
    expect(css).toMatch(/\.bha-hgorb__flame \{[^}]*calc\(1536px \* var\(--hg-s\)\)[^}]*steps\(16\) infinite/);
    expect(css).toMatch(/\.bha-hogyoku-page \{ --hg-s: 2; \}/);
    const block = css.slice(css.indexOf('붕옥 창 배치 (C.421'), css.indexOf('.bha-articon'));
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
    expect(read('src/ui/bha/room.css')).toMatch(/\.bha-prop--hogyoku[^{]*\{[^}]*32px\)/);
  });

  it('방 ··· 메뉴 붕옥 = 그림 아이콘 (그림 없으면 스프라이트)', () => {
    expect(read('src/ui/roomView.ts')).toContain("art: 'prop.hogyoku'");
    expect(read('src/ui/bha/dock.ts')).toContain('m.art ? artIcon(m.art, m.icon) : icon(m.icon)');
  });
});
