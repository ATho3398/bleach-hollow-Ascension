// C.318 (GDD 197장 4): 온천 상태창 = 방(홈) 상태창과 같은 공용 부품(statusBox) — 머리 위 C.281 박스 + 바깥 ⓘ · 발밑 체력 막대
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { liveStatusChips } from '../src/ui/bha/statusBox';
import { statusChips } from '../src/ui/bha/roomLogic';
import { newSaveData } from '../src/game';
import { getFaction } from '../src/data/factions';

const read = (f: string) => readFileSync(f, 'utf8');

describe('C.318 온천·방 상태창 한 부품', () => {
  const spa = read('src/ui/spaView.ts');
  const room = read('src/ui/roomView.ts');
  it('방·온천 모두 statusBox 로 그린다 (박스·ⓘ·이름표·체력 막대)', () => {
    for (const src of [spa, room]) {
      expect(src).toContain('paintStatusBox(');
      expect(src).toContain('statusInfoButton(');
      expect(src).toContain('statusNameTag(save, faction');
      expect(src).toContain('homeHpMeter(');
    }
    expect(spa).toContain("el('div', 'bha-room__chips bha-spa__chips')");
    expect(spa).toContain("el('div', 'bha-room__hp bha-spa__hp')");
  });
  it('온천 옛 v2 칩 한 줄(.bha-chip--status) 없음 · 종족 분기 없음', () => {
    expect(spa).not.toContain('bha-chip--status');
    expect(spa).not.toContain('bha-chip-meter');
    expect(read('src/ui/bha/statusBox.ts')).not.toMatch(/'hollow'|'shinigami'/);
    expect(read('src/ui/bha/spa.css')).not.toContain('.bha-spa__status .bha-chip-meter');
  });
  it('온천 지금 값(배부름·컨디션)으로 줄·위험 표시를 만든다', () => {
    for (const fid of ['hollow', 'shinigami']) {
      const s = newSaveData(fid, 0);
      const f = getFaction(fid);
      const chips = liveStatusChips(s.nest, f, { fullness: 10, condition: 20 });
      const hunger = chips.find((c) => c.kind === 'hunger')!;
      const cond = chips.find((c) => c.kind === 'cond')!;
      expect(hunger.value).toBe(10);
      expect(hunger.danger).toBe(true);
      expect(cond.value).toBe(20);
      expect(cond.danger).toBe(true);
      // 값을 안 넘기면 방과 똑같다
      expect(liveStatusChips(s.nest, f)).toEqual(statusChips(s.nest, f));
    }
  });
});
