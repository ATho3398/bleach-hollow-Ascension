// C.423 (GDD 12-2·15-1, 코딩278): 붕옥 창 = 사용자 스케치 배치 · 개발 % 6단계 그림 · 80~99% 작은 불꽃 / 100% 큰 불꽃 (붕옥 뒤)
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ART_MANIFEST } from '../src/data/art/manifest';
import { newSaveData } from '../src/game';
import { HOGYOKU_LIST, hogyokuFlameOn, hogyokuLook } from '../src/ui/hogyokuView';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const buf = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url));
const size = (p: string) => { const b = buf(p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

describe('C.423 붕옥 단계 그림·스케치 배치', () => {
  it('개발 % → 그림 6단계 (0~19·20~39·40~59 상자 / 60~79 붕옥 / 80~99 작은 불꽃 / 100 큰 불꽃)', () => {
    const rows = Array.from({ length: 11 }, (_, lv) => { const l = hogyokuLook(lv); return `${lv * 10}:${l.art}:${l.flame ?? '-'}`; });
    expect(rows).toEqual([
      '0:hogyoku.stage1:-', '10:hogyoku.stage1:-', '20:hogyoku.stage2:-', '30:hogyoku.stage2:-', '40:hogyoku.stage3:-', '50:hogyoku.stage3:-',
      '60:hogyoku.orb:-', '70:hogyoku.orb:-', '80:hogyoku.orb:hogyoku.flame-calm', '90:hogyoku.orb:hogyoku.flame-calm', '100:hogyoku.orb:hogyoku.flame',
    ]);
    const s = newSaveData('hollow', 0);
    s.hogyoku.level = 9; expect(hogyokuFlameOn(s)).toBe(false);
    s.hogyoku.level = 10; expect(hogyokuFlameOn(s)).toBe(true);
  });

  it('그림 파일 = 사용자 원본 그대로 · 키가 매니페스트에 있다', () => {
    const src = 'docs/design/user-art/hogyoku-1112/stages';
    for (const [pub, orig] of [['hogyoku-stage1', 'stage-00-19'], ['hogyoku-stage2', 'stage-20-39'], ['hogyoku-stage3', 'stage-40-59'], ['hogyoku-orb', 'stage-60-plus-orb'], ['hogyoku-flame-calm', 'flame-calm/flame-calm-sheet']] as const) {
      expect(existsSync(new URL(`../public/art/${pub}.png`, import.meta.url)), pub).toBe(true);
      expect(buf(`public/art/${pub}.png`).equals(buf(`${src}/${orig}.png`)), pub).toBe(true);
    }
    for (const k of ['hogyoku.stage1', 'hogyoku.stage2', 'hogyoku.stage3', 'hogyoku.flame-calm']) expect(k in ART_MANIFEST, k).toBe(true);
    expect(size('public/art/hogyoku-stage1.png')).toEqual([112, 116]);
    expect(size('public/art/hogyoku-flame-calm.png')).toEqual([1536, 96]);
  });

  it('한 칸 112×116 · 같은 배율 1.5: 붕옥 24·25 · 불꽃 8·1 (불꽃 프레임 안 붕옥 자리 16·24) · 불꽃은 붕옥 뒤 레이어', () => {
    const css = read('src/ui/bha/screens-lcd.css');
    expect(css).toMatch(/\.bha-hgorb__art \{[^}]*calc\(112px \* var\(--hg-s\)\)[^}]*calc\(116px \* var\(--hg-s\)\)/);
    expect(css).toMatch(/\.bha-hgorb__img\.is-orb \{[^}]*calc\(24px \* var\(--hg-s\)\)[^}]*calc\(25px \* var\(--hg-s\)\)/);
    expect(css).toMatch(/\.bha-hgorb__flame \{[^}]*z-index: 0;[^}]*calc\(8px \* var\(--hg-s\)\)[^}]*calc\(1px \* var\(--hg-s\)\)/);
    expect(css).toMatch(/\.bha-hgorb__img \{[^}]*z-index: 1;[^}]*pixelated/);
    expect(css).toMatch(/\.bha-hogyoku-page \{ --hg-s: 1\.5; \}/);
    const block = css.slice(css.indexOf('붕옥 창 배치 (C.421 → C.423'), css.indexOf('.bha-articon'));
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
  });

  it('스케치 배치: 왼쪽 = 붕옥 + 둘레 재료 3칸(선) · 오른쪽 = 상세 + 세로 목록, 누르면 상세가 바뀐다', () => {
    expect(HOGYOKU_LIST).toEqual(['develop', 'soul', 'shard', 'essence', 'steps', 'fusion', 'dex']);
    const v = read('src/ui/hogyokuView.ts');
    for (const k of ["'bha-hgorb__lines'", "`bha-hgmat bha-hgmat--${m.id}", "b.onclick = () => pick(m.id)", "'bha-hglist'", "'bha-hgdetail'", 'materialDetail(save, m)']) expect(v).toContain(k);
    expect(read('src/ui/bha/screens-lcd.css')).toMatch(/\.bha-hglist \{[^}]*overflow-y: auto/);
  });
});
