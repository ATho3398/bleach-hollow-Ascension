// C.66 (S-18c, GDD 30장 6): 두께 = 기기 가로 길이의 25%, 겹 30, 뒤집는 동안 줄임·몸체 가운데 축
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE_VERSION } from '../src/config/balance';
import { SAVE_FORMAT_VERSION } from '../src/game';
import { BODY, edgeThickness, tamaLayout } from '../src/ui/bha/tamagoLogic';
import { PATCH_LABEL, STAGE_LABEL } from '../src/version';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const scaleOf = (stage: string): number => Number(/scale\(([\d.]+)\)/.exec(stage)![1]);

describe('버전 (C.66)', () => {
  it('패치 C.66 / 단계 S-18c, 세이브 형식·BALANCE 그대로', () => {
    expect(PATCH_LABEL).toMatch(/^C\.\d+$/); // C.69 에서 C.69 / B-1 (병렬 단계, 버전 검사 완화)
    expect(STAGE_LABEL).toMatch(/^[A-Z]+-\d+[a-z]?$/);
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(27); // C.72 에서 28 (저장 압축)
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(39);
  });
});

describe('두께 = 가로의 25% (30장 6)', () => {
  it('값은 BODY.thicknessRatio 한 곳, 가로 1000px 이면 250px (사용자 범위 200~300)', () => {
    expect(BODY.thicknessRatio).toBe(0.25);
    expect(edgeThickness({ w: 1000 })).toBe(250);
    expect(edgeThickness({ w: 1000 })).toBeGreaterThanOrEqual(200);
    expect(edgeThickness({ w: 1000 })).toBeLessThanOrEqual(300);
  });
  it('844×390 기본형 몸체(가로 896)에서는 224px, 이전(81px)보다 훨씬 두껍다', () => {
    const L = tamaLayout(844, 390);
    expect(L.body.w).toBe(896);
    expect(edgeThickness(L.body)).toBe(224);
  });
});

describe('뒤집는 동안 화면 안 (30장 6)', () => {
  it('0도에서는 줄임·축 이동이 없고, 옆으로 설수록 작아진다', () => {
    const a = tamaLayout(844, 390, null, 0);
    const b = tamaLayout(844, 390, null, 45);
    const c = tamaLayout(844, 390, null, 90);
    expect(scaleOf(a.stage)).toBeCloseTo(a.zoom, 3);
    expect(scaleOf(b.stage)).toBeLessThan(scaleOf(a.stage));
    expect(scaleOf(c.stage)).toBeCloseTo(a.zoom * (1 - BODY.flipShrink), 3);
  });
  it('몸체 가운데(두께의 절반 뒤)를 축으로 돈다: translateZ ∓ 두께/2 가 rotateY 를 감싼다', () => {
    const L = tamaLayout(844, 390, null, 60);
    const t = edgeThickness(L.body) / 2;
    expect(L.stage).toContain(`translateZ(${-t}px) rotateY(60deg) translateZ(${t}px)`);
  });
  it('큰 그림 여러 장을 쌓지 않는다 (C.71: 36겹 삭제, 실루엣 띠 + 작은 사본)', () => {
    const t = src('src/ui/bha/tamago.ts');
    expect(t).not.toMatch(/stackShade|STACK_LAYERS|bha-tama__layer/);
    expect(t).toContain('bakeSilhouette(bodyArt)');
  });

});

describe('뒷면 기록 판 삭제 (30장 7)', () => {
  it('뒷면에 기록 판 코드가 없다', () => {
    expect(src('src/ui/bha/tamago.ts')).not.toMatch(/bha-tama__plate|plateRows|paintPlate|기록 판/);
    expect(src('src/ui/bha/tamagoLogic.ts')).not.toMatch(/plateRows|serialNumber|playTimeText/);
  });
  it('세이브의 machine(만든 시각·논 시간)은 그대로 둔다', () => {
    expect(src('src/game.ts')).toContain('playMs');
  });
});
