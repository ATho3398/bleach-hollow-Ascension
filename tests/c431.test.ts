// C.431 (GDD 12-4 v6.029·v6.031): Unknown;03398 조각 모델 — 게임 도트 그림의 사각 조각을 모은 네모 도트 + 조각 글리치
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ART_MANIFEST, charArt, MOSAIC_MARK, mosaicIdOf, mosaicSrc } from '../src/data/art/manifest';
import { parseTranscendent, TRANSCENDENTS } from '../src/data/transcendents';
import { artSkinOf, newSaveData } from '../src/game';
import { mosaicChurn, mosaicLayout, mosaicSourceFiles } from '../src/ui/bha/glitchMosaic';

const read = (p: string) => readFileSync(p, 'utf8');
const model = TRANSCENDENTS.find((d) => d.model)!.model!;

describe('조각 모델 데이터', () => {
  it('Unknown;03398 만 model glitchMosaic (시드 3398, 조각 8, 6×8 세로 직사각형 · 표시 2/3 — GDD 12-4 v6.037) · 검증', () => {
    expect(TRANSCENDENTS.filter((d) => d.model).map((d) => d.id)).toEqual(['rift-wanderer']);
    expect(model).toMatchObject({ kind: 'glitchMosaic', seed: 3398, tile: 8, grid: [6, 8], scale: 0.67 }); // 움직임 수치는 c437
    expect(() => parseTranscendent({ ...TRANSCENDENTS[0], model: { kind: 'x', seed: 1, tile: 8, grid: [8, 8] } })).toThrow(/model/);
    expect(() => parseTranscendent({ ...TRANSCENDENTS[0], model: { kind: 'glitchMosaic', seed: 1, tile: 0, grid: [8, 8] } })).toThrow(/model/);
  });
  it('초월자 트랙 몸 그림 = 표시 주소(mosaic) — 방·상태·전투·도감이 같은 길', () => {
    const s = newSaveData('hollow', 1);
    s.transcendentId = 'rift-wanderer';
    expect(artSkinOf(s)).toBe('mosaic:rift-wanderer');
    const a = charArt('hollow', 3, 'char.hollow', '/', ART_MANIFEST, [], artSkinOf(s), {}, 'male');
    expect(a.src).toBe(mosaicSrc('rift-wanderer'));
    expect(a.scale).toBe(0.67); // 표시 배율 = 모델 scale (GDD 12-4 v6.037 지금의 2/3)
    expect(mosaicIdOf(a.src)).toBe('rift-wanderer');
    expect(mosaicIdOf('data:image/png;base64,xx')).toBeNull();
    expect(a.src!.startsWith('data:image/gif;base64,')).toBe(true);
    expect(a.src).toContain(MOSAIC_MARK);
  });
});

describe('조각 배치·글리치 (순수 계산)', () => {
  it('조각 원본 = 그림 목록의 캐릭터·적 한 장 그림(초월자 자기 그림 제외) — 종족 분기 없이 파일 규칙으로', () => {
    const files = ['char-hollow-5.png', 'char-shinigami.png', 'enemy-fire-basic.png', 'char-hollow/move-1.png', 'char-x/idle-1.png', 'char-transcendent-zero-sage/idle-1.png', 'bg-forest-sky.webp', 'prop-door.png'];
    expect(mosaicSourceFiles(files)).toEqual(['char-hollow-5.png', 'char-shinigami.png', 'char-x/idle-1.png', 'enemy-fire-basic.png']);
  });
  it('기본 배치 = 시드 고정(늘 같은 모습), 칸 수 = grid, 조각 자리는 원본 격자 안 · 투명 조각은 다시 고른다', () => {
    const a = mosaicLayout(model, 40), b = mosaicLayout(model, 40);
    expect(a).toEqual(b);
    expect(a).toHaveLength(48);
    for (const c of a) { expect(c.src).toBeLessThan(40); expect(c.tx).toBeLessThan(8); expect(c.ty).toBeLessThan(8); }
    expect(mosaicLayout({ ...model, seed: 1 }, 40)).not.toEqual(a);
    const solid = mosaicLayout(model, 40, (_s, tx) => tx === 3);
    expect(solid.filter((c) => c.tx === 3).length).toBeGreaterThan(solid.length * 0.6); // 12번까지 다시 고른다
  });
  it('한 번의 교체 = 서로 다른 칸 swap 범위(C.437 1~3개)', () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 200; k++) {
      const g = mosaicChurn(model, 40, rnd);
      expect(g.at.length).toBeGreaterThanOrEqual(1);
      expect(g.at.length).toBeLessThanOrEqual(3);
      expect(new Set(g.at).size).toBe(g.at.length);
      expect(g.cells).toHaveLength(g.at.length);
    }
  });
});

describe('화면 연결', () => {
  it('앱 루트 관찰자 · 스무딩 끔 · 동작 줄이기 = 기본 고정 · 화면 밖 정리 · 이름 글리치와 같은 고정 스위치', () => {
    expect(read('src/main.ts')).toContain('installMosaic(document.body)');
    const m = read('src/ui/bha/glitchMosaic.ts');
    expect(m).toContain('ctx.imageSmoothingEnabled = false');
    expect(m).toContain('prefersReducedMotion()');
    expect(m).toContain("if (d.imgs.size === 0) { d.timer = 0; return; }");
    expect(m).toContain('onGlitchFreeze(');
    expect(m).not.toMatch(/'rift-wanderer'|'hollow'|'shinigami'/);
    expect(read('src/ui/bha/glitch.css')).toContain('img.bha-mosaic { image-rendering: pixelated; }');
    expect(read('src/ui/hogyokuView.ts')).toContain('MOSAIC_LOOK_PREFIX'); // 도감 칸·상세·합체 결과
  });
});
