// C.346 (GDD 209장): 상태창과 캐릭터 사이 '무엇이 바뀌나' 알림 — 바뀐 값만 칩 · ▲/▼ · 좋음/나쁨 색 · 깜빡임 끝(최소 1초)에 사라짐 · 겹침 0 자리 · 말풍선 수치 문장 뺌.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { changeItems, changeNoteFit, changeNoteMs, CHANGE_NOTE_MIN_AFTER_MS, CHANGE_NOTE_SPOTS, changeNoteBox, hideChangeNote, showChangeNote } from '../src/ui/bha/changeNote';
import { GAUGE_BLINK_AFTER, GAUGE_BLINK_PERIOD_MS } from '../src/ui/bha/gaugeBlink';
import { ACTION_FILL_MS } from '../src/ui/bha/actionFx';
import { careFeedback } from '../src/ui/bha/dockLogic';
import { getFaction } from '../src/data/factions';

const read = (p: string) => readFileSync(p, 'utf8');
const H = getFaction('hollow');
const S = getFaction('shinigami');

/** 아주 작은 가짜 DOM (showChangeNote·changeChip 이 쓰는 것만) */
class FakeEl {
  className = '';
  textContent = '';
  title = '';
  hidden = false;
  dataset: Record<string, string> = {};
  attrs = new Map<string, string>();
  children: FakeEl[] = [];
  offsetWidth = 1;
  classList = {
    add: (...c: string[]) => { this.className = [...new Set([...this.cls(), ...c])].join(' '); },
    remove: (...c: string[]) => { this.className = this.cls().filter((x) => !c.includes(x)).join(' '); },
    contains: (c: string) => this.cls().includes(c),
    toggle: (c: string, on?: boolean) => ((on ?? !this.cls().includes(c)) ? this.classList.add(c) : this.classList.remove(c)),
  };
  style = { setProperty: () => {}, removeProperty: () => {} };
  constructor(public tag: string) {}
  cls() { return this.className.split(' ').filter(Boolean); }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); if (k === 'class') this.className = v; }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  append(...c: (FakeEl | string)[]) { for (const x of c) this.children.push(typeof x === 'string' ? Object.assign(new FakeEl('#text'), { textContent: x }) : x); }
  replaceChildren(...c: FakeEl[]) { this.children = []; this.append(...c); }
  get text(): string { return this.textContent + this.children.map((c) => c.text).join(''); }
}
const row = (box: FakeEl) => box.children[1]!;
const sayLine = (box: FakeEl) => box.children[0]!;
const doc = { createElement: (t: string) => new FakeEl(t), createElementNS: (_: string, t: string) => new FakeEl(t) };
beforeEach(() => {
  vi.stubGlobal('document', doc);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('바뀐 값만 칩 (209장 2)', () => {
  it('반올림해 바뀐 값만, 상태창 순서 · ▲/▼ · 리스크는 내림이 좋음', () => {
    const items = changeItems({ hunger: 40, cond: 50, stab: 60, risk: 30, hp: 0.5 }, { hunger: 55, cond: 50.2, stab: 60, risk: 27, hp: 0.4 }, H);
    expect(items.map((i) => [i.key, i.up, i.good])).toEqual([['hunger', true, true], ['risk', false, true], ['hp', false, false]]);
    expect(items.map((i) => i.label)).toEqual([H.fullnessName, H.riskGaugeName, '체력']);
    // 종족 이름은 설정에서 (사신 = 호로화)
    expect(changeItems({ risk: 10 }, { risk: 20 }, S)[0]).toMatchObject({ label: S.riskGaugeName, up: true, good: false });
    expect(changeItems(null, { risk: 1 }, H)).toEqual([]);
  });
  it('칩 = 상태창과 같은 아이콘 + 이름 + ▲/▼, 수치 없음, 좋음 = guard · 나쁨 = danger (새 색 없음)', () => {
    const box = changeNoteBox() as unknown as FakeEl;
    showChangeNote(box as unknown as HTMLElement, changeItems({ hunger: 40, risk: 30 }, { hunger: 30, risk: 20 }, H));
    const [a, b] = row(box).children;
    expect(a!.className).toContain('bha-chip--danger'); // 배부름 내림 = 나쁨
    expect(b!.className).toContain('bha-chip--guard'); // 광기 내림 = 좋음
    expect(a!.children[0]!.tag).toBe('svg');
    expect(a!.text).toBe(`${H.fullnessName}▼`);
    expect(b!.text).toBe(`${H.riskGaugeName}▼`);
    expect(row(box).text).not.toMatch(/\d/);
    expect(sayLine(box).hidden).toBe(true); // 행동 글 없으면 위 줄 숨김
  });
});

describe('때 · 사라짐 (209장 3·3-1)', () => {
  it('바뀌는 시간 + 깜빡임 끝(최소 1초) 뒤 사라진다', () => {
    expect(changeNoteMs(ACTION_FILL_MS)).toBe(ACTION_FILL_MS + Math.max(CHANGE_NOTE_MIN_AFTER_MS, GAUGE_BLINK_PERIOD_MS * GAUGE_BLINK_AFTER));
    expect(changeNoteMs(ACTION_FILL_MS) - ACTION_FILL_MS).toBeGreaterThanOrEqual(1000);
    const box = changeNoteBox() as unknown as FakeEl;
    expect(box.hidden).toBe(true);
    showChangeNote(box as unknown as HTMLElement, changeItems({ cond: 10 }, { cond: 30 }, H));
    expect(box.hidden).toBe(false);
    vi.advanceTimersByTime(changeNoteMs() - 10);
    expect(box.hidden).toBe(false);
    expect(box.classList.contains('is-out')).toBe(false);
    vi.advanceTimersByTime(20);
    expect(box.classList.contains('is-out')).toBe(true); // 살짝 사라짐
    vi.advanceTimersByTime(250);
    expect(box.hidden).toBe(true);
    expect(row(box).children).toHaveLength(0);
  });
  it('연달아 바뀌면 같은 자리에서 새 내용 (쌓지 않음) · 끝 시각은 새로', () => {
    const box = changeNoteBox() as unknown as FakeEl;
    showChangeNote(box as unknown as HTMLElement, changeItems({ cond: 10 }, { cond: 30 }, H));
    vi.advanceTimersByTime(1000);
    showChangeNote(box as unknown as HTMLElement, changeItems({ hunger: 10, risk: 9 }, { hunger: 30, risk: 5 }, H));
    expect(row(box).children.map((c) => c.dataset.change)).toEqual(['hunger', 'risk']);
    vi.advanceTimersByTime(changeNoteMs() - 10);
    expect(box.hidden).toBe(false);
    vi.advanceTimersByTime(300);
    expect(box.hidden).toBe(true);
  });
  it('온천(extend): 0.1초마다 바뀌어도 끝 시각만 늦추고 내용은 그대로 · 바뀐 값 없으면 안 뜸', () => {
    const box = changeNoteBox() as unknown as FakeEl;
    expect(showChangeNote(box as unknown as HTMLElement, [], 0)).toBe(false);
    expect(box.hidden).toBe(true);
    const it1 = changeItems({ hp: 0.3 }, { hp: 0.31 }, H, ['hp']);
    for (let i = 0; i < 30; i++) {
      showChangeNote(box as unknown as HTMLElement, it1, 0, { extend: true });
      vi.advanceTimersByTime(100);
    }
    expect(box.hidden).toBe(false);
    vi.advanceTimersByTime(changeNoteMs(0) + 300);
    expect(box.hidden).toBe(true);
    hideChangeNote(box as unknown as HTMLElement);
  });
});

describe('자리 · 겹침 0 (209장 1)', () => {
  const scene = { left: 0, top: 0, right: 600, bottom: 300 };
  const status = { left: 250, top: 40, right: 350, bottom: 110 };
  const head = { left: 240, right: 360, top: 140, bottom: Infinity }; // 머리 아래 칸
  it('상태창 아래 ~ 머리 위 빈 공간이면 그 자리', () => {
    expect(changeNoteFit({ left: 260, right: 340, top: 112, bottom: 130 }, scene, [status, head])).toEqual({ dx: 0 });
  });
  it('머리에 걸리면 안 됨 · 물건 버튼에 걸리면 가로로 밀기(slide) · 장면 끝 안으로', () => {
    expect(changeNoteFit({ left: 260, right: 340, top: 112, bottom: 145 }, scene, [status, head])).toBeNull();
    const shelf = { left: 330, right: 420, top: 100, bottom: 200 };
    expect(changeNoteFit({ left: 200, right: 340, top: 112, bottom: 130 }, scene, [status, shelf])).toBeNull();
    expect(changeNoteFit({ left: 200, right: 340, top: 112, bottom: 130 }, scene, [status, shelf], { slide: true })).toEqual({ dx: -12 });
    expect(changeNoteFit({ left: -20, right: 60, top: 112, bottom: 130 }, scene, [], { slide: true })).toEqual({ dx: 22 });
    expect(changeNoteFit({ left: 10, right: 60, top: -5, bottom: 13 }, scene, [], { slide: true })).toBeNull(); // 위 끝 밖
  });
  it('자리 순서 = 아래 → ⓘ 옆 → 왼쪽 옆 → 이름표 위, 다 막히면 숨기고 말풍선 수치 문장은 남긴다', () => {
    expect(CHANGE_NOTE_SPOTS).toEqual(['below', 'side', 'side-left', 'above']);
    const room = read('src/ui/roomView.ts');
    expect(room).toMatch(/const noted = noteChanges\(/);
  });
});

describe('행동 글도 같은 자리 (209장 4-1)', () => {
  it('값이 바뀔 때 행동 글은 알림 위 줄 · 칩은 아래 줄, 다음 알림이면 바뀌고 없으면 숨김', () => {
    const box = changeNoteBox() as unknown as FakeEl;
    showChangeNote(box as unknown as HTMLElement, changeItems({ hunger: 40 }, { hunger: 60 }, H), ACTION_FILL_MS, { say: '짐승 고기' });
    expect(sayLine(box).hidden).toBe(false);
    expect(sayLine(box).textContent).toBe('짐승 고기');
    expect(row(box).children.map((c) => c.dataset.change)).toEqual(['hunger']);
    showChangeNote(box as unknown as HTMLElement, changeItems({ cond: 40 }, { cond: 60 }, H));
    expect(sayLine(box).hidden).toBe(true);
  });
  it('방: 결과 말풍선 대신 알림 위 줄, 알림이 떠 있는 동안의 말도 그 줄 · 못 뜨면 예전 말풍선', () => {
    const room = read('src/ui/roomView.ts');
    expect(room).toMatch(/noteChanges\(changeItems\(from, to, faction, changed\), ACTION_FILL_MS, careFeedback\(faction, action, food \?\? null, delta, false\)\)/);
    expect(room).toMatch(/if \(!noted\) say\(careFeedback\(faction, action, food \?\? null, delta\)\)/);
    expect(room).toMatch(/if \(!note\.hidden\) \{\s*setChangeSay\(note, text\);\s*if \(placeNote\(\)\) return;/);
    expect(read('src/ui/bha/changeNote.ts')).toMatch(/for \(const spot of CHANGE_NOTE_SPOTS\) \{\s*for \(const withSay of sayText \? \[true, false\] : \[false\]\)/); // 자리 먼저, 그 자리에 모자라면 칩만
  });
});

describe('말풍선 · 연결 (209장 4·5)', () => {
  it('알림이 뜨면 수치 변화 문장은 빼고 행동 이름만 · 안 바뀌면 그대로 "변화 없음"', () => {
    expect(careFeedback(H, 'sleep', null, { hunger: 1, condition: 20, stability: 0, risk: -10 }, false)).toBe(H.nestActions.sleep);
    expect(careFeedback(H, 'sleep', null, { hunger: 1, condition: 20, stability: 0, risk: 2 })).toBe(`${H.nestActions.sleep}: ${H.fullnessName} −1 · ${H.riskGaugeName} +2`);
    expect(careFeedback(H, 'sleep', null, { hunger: 0, condition: 0, stability: 0, risk: 0 }, false)).toBe(`${H.nestActions.sleep}: 변화 없음`);
  });
  it('방 돌보기·방 들어올 때·방 가방·온천에 연결, 걷기 판·수련 결과(statusFillFx 기본)는 대상 아님', () => {
    expect(read('src/ui/roomView.ts')).toMatch(/noteChanges\(enterItems/);
    expect(read('src/ui/lcdScreens.ts')).toMatch(/note: changeItems\(before, to, faction, blink\)/);
    expect(read('src/ui/spaView.ts')).toMatch(/showChangeNote\(note, changeItems\(prev, now, faction, moving\), 0, \{ extend: true/);
    expect(read('src/ui/trainingView.ts')).not.toMatch(/changeNote|note:/);
    expect(read('src/ui/expeditionView.ts')).not.toMatch(/changeNote/);
  });
  it('새 색·간격 없음: 칩은 bha-chip(guard/danger) + 토큰만', () => {
    const css = read('src/ui/bha/room.css');
    const block = css.slice(css.indexOf('.bha-room__change {'), css.indexOf('@keyframes bha-change-out'));
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
  });
});
