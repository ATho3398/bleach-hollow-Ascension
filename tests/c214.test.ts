// C.214 (GDD 135장 수정 v5.315): 홈 대기 컨디션 회복 폐기 · 회복 안내 카드 사이 틈 누름 막기
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS } from '../src/data/factions';
import { newNest, passNestTime } from '../src/engine/nest';
import { statusInfo } from '../src/ui/bha/statusInfo';

const CP = BALANCE.provisional.nest.care;

describe('135장 수정 v5.315: 대기 때 컨디션은 안 찬다', () => {
  const nestAt = (fullness: number, condition: number) => {
    const n = newNest(0);
    n.hunger = 100 - fullness;
    n.condition = condition;
    return n;
  };
  it('배부름 100 으로 켜 둔 채·꺼 둔 채 10시간 쉬어도 컨디션 그대로', () => {
    for (const offline of [false, true]) {
      const n = nestAt(100, 40);
      passNestTime(n, 10, offline, 36_000_000);
      expect(n.condition).toBeCloseTo(40, 6);
    }
  });
  it('30 이하 감소(시간당 −4, 0 이면 ×2)는 그대로', () => {
    expect([CP.conditionBelowFullness, CP.conditionPerHour]).toEqual([30, 4]);
    const n = nestAt(30, 50);
    passNestTime(n, 1, false, 3_600_000);
    expect(n.condition).toBeLessThan(50);
  });
  it('balance 에 홈 대기 회복 키가 없다 · 온천 +1/분은 남는다', () => {
    expect(CP).not.toHaveProperty('conditionRegenAtFullness');
    expect(CP).not.toHaveProperty('conditionRegenPerHour');
    expect(BALANCE.provisional.nest.homeHp.spa.conditionPerMinute).toBe(1);
  });
  it('컨디션·배부름 ⓘ 에 "쉬는 동안" 회복 문구 없음, 온천 문구는 있음', () => {
    for (const f of FACTIONS) {
      const cond = statusInfo('cond', f).groups.flatMap((g) => g.lines).join('\n');
      const hunger = statusInfo('hunger', f).groups.flatMap((g) => g.lines).join('\n');
      expect(cond).not.toMatch(/쉬는 동안/);
      expect(hunger).not.toMatch(/쉬는 동안|컨디션이 시간당 \+/);
      expect(cond).toMatch(/1분에 \+1/);
    }
  });
});

describe('회복 안내: 카드 사이 450ms 틈에도 누름을 막는다 (C.214 — 틈에 상점을 누르면 가방 카드가 상점 위에 떠 갇혔다)', () => {
  it('다음 카드로 넘어갈 때 holdInput 막을 거친다', () => {
    const src = readFileSync('src/ui/app.ts', 'utf8');
    expect(src).toContain('const go = () => holdInput(450, () => show(i + 1));');
    expect(src).not.toContain('window.setTimeout(() => show(i + 1), 450)');
  });
});

describe('회복 안내: 치료제·포션을 쓰면 물건 창을 닫는다 (C.214 — 시작 치료제 3개라 창이 남아 기기 초점이 갇혔다)', () => {
  it('cure·potion act 완료가 closeItemWhen 을 거친다', () => {
    const src = readFileSync('src/ui/app.ts', 'utf8');
    expect(src).toContain("done: () => closeItemWhen(!s.nest.collapsed)");
    expect(src).toContain('done: () => closeItemWhen(homeHp(s).fraction >= TR.potionTo - EPS)');
    expect(src).toContain(".bha-itemdialog .bha-itemmodal__close')?.click()");
  });
});
