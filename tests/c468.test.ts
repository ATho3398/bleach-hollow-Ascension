import { describe, expect, it } from 'vitest';
import { ART_MANIFEST, GILLIAN_SCALE, ONEARM_SCALE, SPIDER_SCALE } from '../src/data/art/manifest';

// C.468 (GDD 15-5 v6.096, 사용자 2026-11-17 "아 너무 작다 근데. 화면에서 거의 안보이네. 원래크기로 돌려줘 걍"): C.467 축소를 C.466 배율로 되돌림
describe('C.468 크기 되돌림 = C.466 배율', () => {
  it('배율 값', () => {
    expect([ONEARM_SCALE, SPIDER_SCALE, GILLIAN_SCALE]).toEqual([2.2, 1.2, 2.3]);
    for (const id of ['char.shinigami', 'char.shinigami.1', 'char.shinigami.2', 'char.hollow.5']) expect(ART_MANIFEST[id], id).toMatchObject({ scale: 1.78, fieldScale: 1.33 });
    expect(ART_MANIFEST['char.transcendent-aizen']).toMatchObject({ scale: 1.28, fieldScale: 0.95 });
    expect(ART_MANIFEST['char.transcendent-ichigo-mugetsu']).toMatchObject({ scale: 1.6875, fieldScale: 1.26 });
    expect(ART_MANIFEST['char.transcendent-ichigo-bloodchain']).toMatchObject({ scale: 1.6875, fieldScale: 1.26 });
  });
});
