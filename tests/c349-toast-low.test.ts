// C.349 (GDD 209장 보충, 마스터 결정 15:0x): 방·온천에서만 위 가장자리 공용 알림 띠를 장면 아래쪽(하단 버튼 줄 바로 위)으로 — 이름표·상태창을 덮지 않게.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowToastSpot } from '../src/ui/bha/toastLow';

const read = (p: string) => readFileSync(p, 'utf8');
const base = { w: 180, h: 30, cx: 422, minX: 102, maxX: 742, floor: 322, ceil: 16, gap: 2 };

describe('띠 자리 계산', () => {
  it('걸리는 것이 없으면 하단 줄 바로 위 가운데', () => {
    expect(lowToastSpot({ ...base, blockers: [] })).toEqual({ bottom: 320, left: 332 });
  });
  it('그 줄에서 물건 버튼에 걸리면 가로로 비켜 같은 줄 (가운데에 가장 가까운 쪽)', () => {
    const bag = { left: 238, right: 334, top: 208, bottom: 317 };
    expect(lowToastSpot({ ...base, blockers: [bag] })).toEqual({ bottom: 320, left: 336 });
  });
  it('그 줄에 자리가 없으면 걸린 것 위로 올리고, 장면 위 끝 밖이면 null(예전 자리)', () => {
    const wall = { left: 100, right: 744, top: 250, bottom: 330 };
    expect(lowToastSpot({ ...base, blockers: [wall] })).toEqual({ bottom: 248, left: 332 });
    expect(lowToastSpot({ ...base, ceil: 240, blockers: [wall] })).toBeNull();
  });
});

describe('화면별 자리 규칙', () => {
  it('방·온천만 아래 자리, 다른 화면은 lcd.css 맨 위 그대로 · 누름 통과·머무는 시간 손대지 않음', () => {
    expect(read('src/ui/roomView.ts')).toMatch(/keepToastsLow\(main, \{\s*floor: \(\) => dock\.root\.getBoundingClientRect\(\)\.top/);
    expect(read('src/ui/spaView.ts')).toMatch(/keepToastsLow\(app, \{/);
    const css = read('src/ui/bha/lcd.css');
    expect(css).toMatch(/\.bha-lcd \.bha-toast \{ top: var\(--bha-sp-1\); bottom: auto; \}/);
    expect(css).toMatch(/\.bha-lcd \.bha-toast\.is-low \{ top: auto; bottom: var\(--toast-bottom/);
    const low = read('src/ui/bha/toastLow.ts');
    expect(low).not.toMatch(/pointer-events|holdMs|setTimeout/);
    expect(low).toMatch(/bha-toast--center/); // 가운데 띠(튜토리얼 달성)는 그대로
  });
});
