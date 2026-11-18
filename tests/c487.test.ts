// C.487 (GDD 9-4 v6.117): 그림 펫이 몸 그림 너비에 맞춰 옆에 선다 — 계산은 화면에서(캔버스) 하므로 여기서는 붙어 있는지·안전하게 빠지는지만.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PET_BODY_GAP, fitPetToBody } from '../src/ui/bha/pet';

describe('C.487 펫이 몸 너비에 맞춰 옆에', () => {
  it('틈 = 4px, petBuddy 가 붙인 뒤 여러 번 맞춘다', () => {
    expect(PET_BODY_GAP).toBe(4);
    const src = readFileSync('src/ui/bha/pet.ts', 'utf8');
    expect(src).toContain('for (const ms of [0, 150, 500, 1200, 2500]) window.setTimeout(again, ms)');
    expect(src).toContain("'canvas.bha-rigcanvas, img'");
  });
  it('붙어 있지 않은 펫은 건드리지 않는다', () => {
    const fake = { parentElement: null, isConnected: false } as unknown as HTMLElement;
    expect(fitPetToBody(fake)).toBe(false);
  });
});
