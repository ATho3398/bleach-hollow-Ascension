// C.273 (GDD 180장 2·3): 온천 가득 안내 — 온천 안 노란 알림 2초 뒤 방(✓ 면 바로, 방에서는 다시 안 띄움) · 먹이 배부름 약 ×1.6
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { foodEffect } from '../src/engine/nest';
import { SPA_FULL_HOLD_MS, SPA_FULL_TEXT } from '../src/ui/spaView';
import { careFeedback } from '../src/ui/bha/dockLogic';
import { getFaction } from '../src/data/factions';
import { worldMapOf } from '../src/engine/faction';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('180장 2 온천 가득 안내', () => {
  it('문구는 한 줄 토스트(마침표 없음)·2초', () => {
    expect(SPA_FULL_TEXT).toBe('체력이 가득 찼다');
    expect(SPA_FULL_HOLD_MS).toBe(2000);
  });
  it('가득으로 나오면 온천 안에서 알림 → 방, 방에서는 토스트를 다시 띄우지 않는다', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain("if (e.reason === 'full' && spaHoldFull(name, toRoom)) return;");
    // 가득 아닌(배부름 0) 나오기만 방에서 알림
    const i = app.indexOf("if (e.reason === 'full' && spaHoldFull(name, toRoom)) return;");
    expect(app.slice(i, i + 300)).toContain('toRoom();');
  });
  it('C.274 튜토리얼 회복 안내 중에는 알림·자동 방 이동 없음 (카드 [다음] 이 정한다)', () => {
    const app = read('src/ui/app.ts');
    const a = app.indexOf("if (recoverOpen && nav.top?.id === 'spa') return;");
    const b = app.indexOf("if (e.reason === 'full' && spaHoldFull(name, toRoom)) return;");
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(b);
  });
  it('[돌아가기]·✓ = 기다리지 않고 바로 방, 나가기 연출이 시작되면 기다림을 끈다', () => {
    const spa = read('src/ui/spaView.ts');
    expect(spa).toContain('const go = clearFullHold();');
    expect(spa).toContain('clearFullHold(); // 가득 알림을 기다리던 중이면 나가기 연출이 맡는다');
    expect(spa).not.toContain('showToast('); // GDD 233장 4: 가득 알림 띠 없음 — 기다림(2초)만 남는다
  });
  it('알림 이름(온천)은 종족 설정 — 코드에 종족 분기 없음', () => {
    const spa = read('src/ui/spaView.ts');
    expect(spa).not.toMatch(/'hollow'|'shinigami'/);
    for (const id of ['hollow', 'shinigami'] as const) expect(worldMapOf(getFaction(id)).places.spa).not.toBe('');
  });
});

describe('180장 3 먹이 배부름 약 ×1.6 → 235장 3유형 (C.387)', () => {
  const F = { basic: foodEffect('basic') };
  it('유형별: 싸구려 6 · 일반 12 · 특식 40, feedHunger 12, 한도 10분 3개(같은 먹이 2개)', () => {
    expect((['snack', 'basic', 'hearty', 'tonic', 'feast'] as const).map((f) => foodEffect(f).hunger)).toEqual([6, 12, 12, 40, 40]);
    expect(BALANCE.provisional.nest.feedHunger).toBe(12);
    expect((['snack', 'basic', 'hearty', 'tonic', 'feast'] as const).map((f) => foodEffect(f).condition)).toEqual([0, 0, 0, 30, 0]);
    expect(BALANCE.provisional.nest.feedLimit).toEqual({ max: 3, windowMinutes: 10, sameMax: 2 });
  });
  it('고기 1개를 먹이면 방 말풍선에 회복 수치가 없다 (GDD 201장 — 상태창 막대가 차오른다)', () => {
    for (const id of ['hollow', 'shinigami'] as const) {
      const f = getFaction(id);
      expect(careFeedback(f, 'feed', 'basic', { hunger: -F.basic.hunger, condition: 0, stability: 0, risk: 0 })).toBe(f.foodNames.basic);
    }
  });
});
