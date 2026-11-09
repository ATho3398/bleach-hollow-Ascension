import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FACTIONS, getFaction } from '../src/data/factions';
import { libReadyEdge, libReadyText } from '../src/ui/bha/libReady';
import { battleLabels } from '../src/ui/labels';

describe("해방 가능! 알림 (GDD 215장, C.353)", () => {
  it('게이지가 가득 차는 순간(준비 안 됨 → 됨)에만 한 번 울린다', () => {
    const rose = libReadyEdge();
    const seq = [false, false, true, true, true, true];
    expect(seq.map(rose).filter(Boolean)).toHaveLength(1);
    expect(rose(true)).toBe(false); // 가득 찬 채로는 반복 알림 없음
  });
  it('해방을 쓰고 다시 가득 차면 또 한 번', () => {
    const rose = libReadyEdge();
    const seq = [false, true, true, false, false, true, true];
    expect(seq.map(rose)).toEqual([false, true, false, false, false, true, false]);
  });
  it('문구의 이름은 종족 설정(json)의 해방 이름이다', () => {
    const hollow = getFaction('hollow');
    const shini = getFaction('shinigami');
    expect(libReadyText(battleLabels(hollow, 0, true).liberation.name)).toBe(`${hollow.liberation.name} 가능!`);
    expect(libReadyText(battleLabels(shini, 0, true).liberation.name)).toBe(`${shini.liberation.name} 가능!`);
    expect(libReadyText(battleLabels(hollow).liberation.name)).toBe(`${hollow.liberation.baseName} 가능!`);
    for (const f of FACTIONS) expect(libReadyText(battleLabels(f).liberation.name)).toContain(f.liberation.baseName);
  });
  it('알림 부품에는 종족 이름을 코드에 쓰지 않는다 (종족 분기 금지)', () => {
    const src = readFileSync('src/ui/bha/libReady.ts', 'utf8');
    for (const f of FACTIONS) {
      expect(src).not.toContain(f.liberation.name);
      expect(src).not.toContain(f.liberation.baseName);
    }
  });
  it('오라는 테두리형 빛(몸 drop-shadow)을 쓰지 않는다 — 기기 초점과 구분', () => {
    const css = readFileSync('src/ui/bha/v2/bha.css', 'utf8') + readFileSync('src/ui/bha/battle-scene.css', 'utf8');
    expect(css).not.toMatch(/is-lib-ready[^{]*\.bha-hero__body\s*\{/);
    expect(css).toMatch(/is-lib-ready[^{]*\.bha-libaura\s*\{/);
  });
});
