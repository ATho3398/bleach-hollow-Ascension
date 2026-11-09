// GDD 201장: 회복은 '+n' 숫자 대신 머리 위 상태창 막대가 0.8초 동안 차오르고 옆 숫자도 따라 오른다 (줄어든 값은 그대로)
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_FILL_MS, actionBusy, tween } from '../src/ui/bha/actionFx';
import { chipsAt, lerpShown, nestShown, rememberShown, riseFrom, shownBefore, type GaugeShown } from '../src/ui/bha/statusBox';
import { careFeedback } from '../src/ui/bha/dockLogic';
import { spaEndText } from '../src/ui/spaView';
import { statusChips } from '../src/ui/bha/roomLogic';
import { getFaction } from '../src/data/factions';

const read = (p: string) => readFileSync(p, 'utf8');
const base: GaugeShown = { hunger: 40, cond: 50, stab: 60, risk: 10, hp: 0.5 };

describe('201장 차오름 계산', () => {
  it('0.8초 · 화면 상수 (balance 밖)', () => {
    expect(ACTION_FILL_MS).toBe(800);
    expect(read('src/config/balance.ts')).not.toContain('ACTION_FILL');
  });
  it('오른 값만 이전 값에서 시작, 줄어든 값은 바로 새 값, 안 오르면 null', () => {
    const now = { ...base, hunger: 70, cond: 30, hp: 0.9 };
    expect(riseFrom(base, now)).toEqual({ ...now, hunger: 40, hp: 0.5 });
    expect(riseFrom(base, { ...base, cond: 20 })).toBeNull();
    expect(riseFrom(undefined, now)).toBeNull();
    expect(riseFrom(base, { ...base, hunger: 40.3 })).toBeNull(); // 반올림해 같은 숫자
  });
  it('중간 값 · 칩 덮어쓰기 (상태이상 줄은 그대로)', () => {
    const to = { ...base, hunger: 80, hp: 1 };
    expect(lerpShown(base, to, 0.5)).toMatchObject({ hunger: 60, hp: 0.75, cond: 50 });
    const f = getFaction('hollow');
    const chips = statusChips({ hunger: 60, condition: 50, risk: 10, stability: 60, weakened: true }, f);
    const over = chipsAt(chips, { ...base, hunger: 55 });
    expect(over.find((c) => c.kind === 'hunger')!.value).toBe(55);
    expect(over.find((c) => c.kind === 'weak')!.value).toBeNull();
  });
  it('보여 준 값 기억 (방을 다시 열 때 비교)', () => {
    const owner = {};
    expect(shownBefore(owner)).toBeUndefined();
    rememberShown(owner, base);
    expect(shownBefore(owner)).toEqual(base);
    expect(nestShown({ hunger: 30, condition: 50, stability: 60, risk: 10 }, 0.5)).toEqual({ hunger: 70, cond: 50, stab: 60, risk: 10, hp: 0.5 });
  });
});

describe('201장 동작 줄이기 = 바로 새 값', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('prefers-reduced-motion 이면 tween 이 바로 끝', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    const seen: number[] = [];
    let ended = false;
    tween(ACTION_FILL_MS, (t) => seen.push(t), () => (ended = true));
    expect(seen).toEqual([1]);
    expect(ended).toBe(true);
    expect(actionBusy()).toBe(false);
  });
});

describe('201장 회복 수치 글자 없앰', () => {
  it.each(['hollow', 'shinigami'] as const)('%s: 돌보기 말풍선 — 회복은 이름만, 줄어든 값·리스크 비용은 그대로', (id) => {
    const f = getFaction(id);
    expect(careFeedback(f, 'feed', 'basic', { hunger: -8, condition: 2, stability: 1, risk: 0 })).toBe(f.foodNames.basic);
    expect(careFeedback(f, 'sleep', null, { hunger: 1, condition: 20, stability: 0, risk: 0 })).toBe(`${f.nestActions.sleep}: ${f.fullnessName} −1`);
    expect(careFeedback(f, 'sleep', null, { hunger: 0, condition: 0, stability: 0, risk: 2 })).toBe(`${f.nestActions.sleep}: ${f.riskGaugeName} +2`);
  });
  it('온천 가득 알림에 체력 % 없음', () => {
    expect(spaEndText({ reason: 'full', hpTo: 1 }, '배부름')).not.toMatch(/\d/);
  });
  it('걷기 휴식 = 오른 값 떠오르는 숫자 없음(리스크 내림 온천만), 걷기 가방·방 가방 = 따로 막대 창 대신 상태창 차오름', () => {
    const exp = read('src/ui/expeditionView.ts');
    expect(exp).not.toContain("`${faction.fullnessName} ${Math.round(fullnessOf(exp.hunger, PX.hungerMax) - before.full)}`");
    expect(exp).toContain('fillOver = t >= 1 ? null');
    expect(read('src/ui/bha/healBag.ts')).not.toContain('itemUseFx');
    expect(read('src/ui/lcdScreens.ts')).toContain('statusFillFx(');
    expect(read('src/ui/trainingView.ts')).toContain('statusFillFx(');
    expect(read('src/ui/bha/actionFx.ts')).not.toContain('itemUseFx');
  });
  it('방에 들어올 때 오른 값 차오름 · 온천도 보여 준 값 기억', () => {
    expect(read('src/ui/roomView.ts')).toContain('const enterFrom = riseFrom(enterBefore, shownNow());');
    expect(read('src/ui/spaView.ts')).toContain('rememberShown(n, {');
  });
});
