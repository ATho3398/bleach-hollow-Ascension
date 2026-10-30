import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import hollow from '../src/data/factions/hollow.json';
import shinigami from '../src/data/factions/shinigami.json';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('C.131 상태 화면·방·블록', () => {
  it('능력치 줄은 막대 없이 이름+값, 치명타 두 줄', () => {
    const nest = read('src/ui/bha/nest.ts');
    const body = nest.slice(nest.indexOf('export function statsBlock'), nest.indexOf('export function statRow'));
    expect(body).not.toContain('meter(');
    const lcd = read('src/ui/lcdScreens.ts');
    expect(lcd).toContain("statRow('평타 치명'"); // C.220: 치명 두 줄 (126-1 확정 ②)
    expect(lcd).toContain("statRow('블록 치명'");
    expect(lcd).toContain("statRow('치명타 피해'");
    expect(lcd).toContain('critChanceMax');
  });
  it.each([['hollow', hollow], ['shinigami', shinigami]])('%s: 밖으로(옛 출발 문)가 맨 왼쪽, 수련장은 옛 문 자리', (_n, f) => {
    const L = f.room.layout as Record<string, { x: number }>;
    expect(L.outside!.x).toBeLessThan(L.book!.x); // C.215: 옛 출발 문 → 밖으로 (GDD 137장 3)
    expect(L.outside!.x).toBeLessThanOrEqual(12);
    expect(L.altar!.x).toBeGreaterThan(75);
  });
  it('방 물건 ×1.25 (C.137 85장 2: C.131 ×1.5 와 그 이전의 중간)', () => {
    expect(read('src/ui/bha/room.css')).toContain('* 1.25');
  });
  it('블록: 기본은 노말색, 계열 아이콘, 공허 칩', () => {
    const bv = read('src/ui/battleView.ts');
    expect(bv).toContain('isBasic ? NORMAL_ELEMENT');
    expect(bv).toContain('riskGained');
    const sprite = read('src/ui/bha/sprite.svg');
    for (const fx of ['claw', 'bite', 'shot', 'slash', 'impact', 'beam']) expect(sprite).toContain(`id="i-fx-${fx}"`);
  });
});
