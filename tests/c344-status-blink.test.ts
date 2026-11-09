// C.344 (GDD 208장): 상태 바뀔 때 상태창은 그대로 · 알림(말풍선)은 상태창과 겹치지 않는 자리 · 바뀌는 막대·아이콘만 깜빡임.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyBlink, BLINK_CLASS, blinkGauges, blinkingKeys, changedKeys, GAUGE_BLINK_AFTER, GAUGE_BLINK_PERIOD_MS } from '../src/ui/bha/gaugeBlink';
import { bubbleClear } from '../src/ui/bha/room';
import { ACTION_FILL_MS } from '../src/ui/bha/actionFx';

const read = (p: string) => readFileSync(p, 'utf8');

/** DOM 없이 깜빡임 부품을 돌리는 아주 작은 가짜 줄·상자 */
class FakeRow {
  dataset: Record<string, string>;
  classes = new Set<string>();
  props = new Map<string, string>();
  constructor(key: string) { this.dataset = { gauge: key }; }
  classList = {
    toggle: (c: string, on: boolean) => (on ? this.classes.add(c) : this.classes.delete(c)),
    remove: (c: string) => this.classes.delete(c),
  };
  style = {
    setProperty: (k: string, v: string) => this.props.set(k, v),
    removeProperty: (k: string) => this.props.delete(k),
  };
}
class FakeHost {
  rows: FakeRow[] = [];
  paint(keys: string[]) { this.rows = keys.map((k) => new FakeRow(k)); } // 다시 그리면 줄이 새로 만들어진다 (replaceChildren)
  querySelectorAll(sel: string) { return sel.includes(BLINK_CLASS) ? this.rows.filter((r) => r.classes.has(BLINK_CLASS)) : this.rows; }
}
const on = (h: FakeHost) => h.rows.filter((r) => r.classes.has(BLINK_CLASS)).map((r) => r.dataset.gauge);

describe('208장 3 바뀌는 값만 깜빡임 (gaugeBlink)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('changedKeys: 오름·내림 모두, 반올림해 같은 숫자는 아님, 체력은 %', () => {
    const a = { hunger: 40, cond: 70, stab: 52, risk: 10, hp: 0.5 };
    expect(changedKeys(a, { hunger: 70, cond: 65, stab: 52.2, risk: 10, hp: 0.504 })).toEqual(['hunger', 'cond']);
    expect(changedKeys(a, { ...a, risk: 4, hp: 0.62 })).toEqual(['risk', 'hp']);
    expect(changedKeys(undefined, a)).toEqual([]);
  });

  it('바뀐 줄에만 깜빡임 클래스 — 안 바뀐 줄은 그대로, 다시 그려도 이어지고 박자도 이어진다', () => {
    const h = new FakeHost();
    h.paint(['hunger', 'cond', 'stab', 'risk', 'hp']);
    blinkGauges(h as unknown as HTMLElement, ['hunger', 'hp']);
    expect(on(h)).toEqual(['hunger', 'hp']);
    vi.advanceTimersByTime(300);
    h.paint(['hunger', 'cond', 'stab', 'risk', 'hp']); // 차오르는 중 새 줄
    expect(on(h)).toEqual([]);
    applyBlink(h as unknown as HTMLElement);
    expect(on(h)).toEqual(['hunger', 'hp']);
    expect(h.rows[0]!.props.get('--blink-delay')).toMatch(/^-\d+ms$/);
    expect(h.rows[1]!.props.has('--blink-delay')).toBe(false);
  });

  it('바뀌는 동안(0.8초) + 끝난 뒤 0.25초 × 3 깜빡이고 끝나면 클래스가 빠진다', () => {
    const h = new FakeHost();
    h.paint(['hunger', 'cond']);
    blinkGauges(h as unknown as HTMLElement, ['cond']);
    expect(GAUGE_BLINK_PERIOD_MS).toBe(250);
    expect(GAUGE_BLINK_AFTER).toBe(3);
    vi.advanceTimersByTime(ACTION_FILL_MS + GAUGE_BLINK_PERIOD_MS * GAUGE_BLINK_AFTER - 10);
    expect(on(h)).toEqual(['cond']);
    vi.advanceTimersByTime(20);
    expect(on(h)).toEqual([]);
    expect(blinkingKeys(h as unknown as HTMLElement)).toEqual([]);
    applyBlink(h as unknown as HTMLElement); // 끝난 뒤 다시 그려도 붙지 않는다
    expect(on(h)).toEqual([]);
  });

  it('깜빡이는 중 또 바뀌면(온천 0.1초마다) 끝 시각만 늦추고 값 이름을 더한다', () => {
    const h = new FakeHost();
    h.paint(['hunger', 'cond', 'hp']);
    blinkGauges(h as unknown as HTMLElement, ['hp'], 0);
    vi.advanceTimersByTime(600);
    blinkGauges(h as unknown as HTMLElement, ['cond'], 0);
    vi.advanceTimersByTime(600);
    expect(on(h)).toEqual(['cond', 'hp']);
    vi.advanceTimersByTime(200);
    expect(on(h)).toEqual([]);
  });

  it('바뀐 것이 없으면 아무 것도 안 한다', () => {
    const h = new FakeHost();
    h.paint(['hunger']);
    blinkGauges(h as unknown as HTMLElement, []);
    expect(on(h)).toEqual([]);
  });
});

describe('208장 0·1·2 값이 바뀔 때 상태창은 숨기지 않고 말풍선은 따로', () => {
  it('말풍선 자리 검사: 상태창·버튼과 겹치면 안 됨, 방 밖으로 나가도 안 됨', () => {
    const scene = { left: 0, top: 0, right: 800, bottom: 300 };
    const status = { left: 350, top: 40, right: 470, bottom: 110 };
    expect(bubbleClear({ left: 360, top: 20, right: 460, bottom: 60 }, scene, [status])).toBe(false); // 머리 위 = 상태창 자리
    expect(bubbleClear({ left: 480, top: 10, right: 600, bottom: 60 }, scene, [status])).toBe(true); // 옆
    expect(bubbleClear({ left: 700, top: 10, right: 820, bottom: 60 }, scene, [status])).toBe(false); // 방 밖
  });

  it('그냥 대화는 상태창 잠깐 숨김(208장 0 정정) · 값이 바뀌는 동안은 숨기지 않고 말풍선을 옆 → 알림 띠로, 차오름 동안만 보이던 .is-filling 삭제', () => {
    const css = read('src/ui/bha/room.css');
    expect(css).toContain('.is-saying > .bha-room__chips { visibility: hidden; }');
    expect(css).not.toContain('.is-filling');
    const room = read('src/ui/roomView.ts');
    expect(room).not.toContain('is-filling');
    expect(room).toContain('const keepStatus = keep || Date.now() < statusBusyUntil;');
    expect(room).toContain("scene.classList.toggle('is-saying', !keepStatus)");
    expect(room).toContain('if (changed.length > 0) markStatusBusy(ACTION_FILL_MS);');
    expect(room).toContain('if (enterChanged.length > 0) markStatusBusy(');
    expect(room).toContain('bubbleClear(r, sceneBox, blockers)');
    expect(room).toContain("showToast({ eyebrow: save.name || '방', title: text }");
  });

  it('바뀌는 곳마다 깜빡임 연결 (방 돌보기·들어올 때·가방·온천·걷기 휴식/가방·수련), 동작 줄이기는 테두리', () => {
    const room = read('src/ui/roomView.ts');
    expect(room).toContain('blinkGauges(scene, changed);');
    expect(room).toContain('const enterChanged = changedKeys(enterBefore, shownNow());');
    expect(read('src/ui/bha/statusBox.ts')).toContain('row.dataset.gauge = c.kind');
    expect(read('src/ui/bha/statusBox.ts')).toContain("blinkGauges(box, o.blink ?? changedKeys(o.from, o.to));");
    expect(read('src/ui/lcdScreens.ts')).toContain('const blink = changedKeys(before, to);');
    expect(read('src/ui/trainingView.ts')).toMatch(/statusFillFx\(\{[^}]*blink \}\)/);
    expect(read('src/ui/spaView.ts')).toContain('blinkGauges(scene,');
    const exp = read('src/ui/expeditionView.ts');
    expect(exp).toContain('blinkGauges(meters, blink);');
    expect(exp).toContain("'hp'));");
    expect(read('src/ui/bha/healBag.ts')).toContain("blinkGauges(hpSlot, ['hp'])");
    const css = read('src/ui/bha/room.css');
    expect(css).toContain('animation: bha-gauge-blink 0.25s');
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*?\.is-changing\[data-gauge\] \{ outline: 1px solid var\(--bha-accent\)/);
  });
});
