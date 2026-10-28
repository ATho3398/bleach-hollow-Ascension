// C.99 전체 화면 버튼 (GDD 46장): 지원/미지원 판정 · 시작 버튼 연동 · 설정 저장 · 화면 크기 다시 계산
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enterFullscreen, enterFullscreenOnStart, FULLSCREEN_START_KEY, fullscreenSupported, isFullscreen, loadFullscreenStart, saveFullscreenStart, toggleFullscreen, watchFullscreen,
} from '../src/ui/fullscreen';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

interface FakeDoc {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement: unknown;
  exitFullscreen: ReturnType<typeof vi.fn>;
  documentElement: { requestFullscreen?: ReturnType<typeof vi.fn>; webkitRequestFullscreen?: ReturnType<typeof vi.fn> };
  listeners: Record<string, (() => void)[]>;
  addEventListener: (t: string, f: () => void) => void;
  removeEventListener: (t: string, f: () => void) => void;
}

function fakeDoc(over: Partial<FakeDoc> = {}): FakeDoc {
  const d: FakeDoc = {
    fullscreenEnabled: true,
    fullscreenElement: null,
    exitFullscreen: vi.fn(async () => { d.fullscreenElement = null; }),
    documentElement: {},
    listeners: {},
    addEventListener: (t, f) => { (d.listeners[t] ??= []).push(f); },
    removeEventListener: (t, f) => { d.listeners[t] = (d.listeners[t] ?? []).filter((x) => x !== f); },
    ...over,
  };
  d.documentElement.requestFullscreen ??= vi.fn(async () => { d.fullscreenElement = d.documentElement; });
  return d;
}

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

let doc: FakeDoc;
beforeEach(() => {
  doc = fakeDoc();
  vi.stubGlobal('document', doc);
});
afterEach(() => vi.unstubAllGlobals());

describe('지원 판정 (GDD 46장 1번)', () => {
  it('fullscreenEnabled + requestFullscreen 이 있으면 지원', () => {
    expect(fullscreenSupported()).toBe(true);
  });
  it('fullscreenEnabled 가 거짓이면(아이폰 사파리 등) 미지원', () => {
    doc = fakeDoc({ fullscreenEnabled: false });
    vi.stubGlobal('document', doc);
    expect(fullscreenSupported()).toBe(false);
  });
  it('API 자체가 없으면 미지원', () => {
    doc = fakeDoc({ fullscreenEnabled: undefined });
    delete doc.documentElement.requestFullscreen;
    vi.stubGlobal('document', doc);
    expect(fullscreenSupported()).toBe(false);
  });
  it('webkit 접두만 있는 브라우저도 지원', () => {
    doc = fakeDoc({ fullscreenEnabled: undefined, webkitFullscreenEnabled: true, documentElement: { webkitRequestFullscreen: vi.fn() } });
    vi.stubGlobal('document', doc);
    expect(fullscreenSupported()).toBe(true);
  });
  it('미지원이면 진입 호출도 아무 일 없다', async () => {
    doc = fakeDoc({ fullscreenEnabled: false });
    vi.stubGlobal('document', doc);
    expect(await enterFullscreen()).toBe(false);
    expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
  });
  it('설정 화면은 미지원이면 전체 화면 패널을 넣지 않는다', () => {
    const src = read('src/ui/settingsView.ts');
    expect(src).toContain('fullscreenSupported() ? [fsPanel] : []');
    expect(src).toContain('...fsPanels, tamaPanel,'); // C.170 열 균형: 오른쪽 열 = 화면·기기 (GDD 100장 #77)
  });
});

describe('들어가기·나가기 (GDD 46장 1·3번)', () => {
  it('toggleFullscreen: 꺼져 있으면 documentElement 로 진입, 켜져 있으면 나간다', async () => {
    expect(isFullscreen()).toBe(false);
    expect(await toggleFullscreen()).toBe(true);
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(isFullscreen()).toBe(true);
    expect(await toggleFullscreen()).toBe(false);
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(isFullscreen()).toBe(false);
  });
  it('브라우저가 진입을 거부해도 오류 없이 false', async () => {
    doc.documentElement.requestFullscreen = vi.fn(async () => { throw new Error('denied'); });
    expect(await enterFullscreen()).toBe(false);
  });
  it('이미 전체 화면이면 다시 요청하지 않는다', async () => {
    doc.fullscreenElement = doc.documentElement;
    expect(await enterFullscreen()).toBe(true);
    expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
  });
});

describe('시작할 때 전체 화면 (GDD 46장 2번)', () => {
  it('저장 안 했으면 기본 켬, 끄면 0 으로 이 기기에만 저장', () => {
    const s = mem();
    expect(loadFullscreenStart(s)).toBe(true);
    saveFullscreenStart(s, false);
    expect(s.getItem(FULLSCREEN_START_KEY)).toBe('0');
    expect(loadFullscreenStart(s)).toBe(false);
    saveFullscreenStart(s, true);
    expect(loadFullscreenStart(s)).toBe(true);
  });
  it('저장소가 없거나 던져도 기본 켬', () => {
    expect(loadFullscreenStart(null)).toBe(true);
    expect(loadFullscreenStart({ getItem: () => { throw new Error('x'); }, setItem: () => {} })).toBe(true);
  });
  it('켬 + 지원이면 시작 버튼에서 진입을 부른다', () => {
    enterFullscreenOnStart(mem());
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
  });
  it('끄면 부르지 않는다', () => {
    const s = mem();
    saveFullscreenStart(s, false);
    enterFullscreenOnStart(s);
    expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
  });
  it('미지원이면 켜 있어도 부르지 않는다', () => {
    doc = fakeDoc({ fullscreenEnabled: false });
    vi.stubGlobal('document', doc);
    enterFullscreenOnStart(mem());
    expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
  });
  it('시작 화면의 이어하기·새로 시작·불러오기 세 버튼이 모두 연동되어 있고, 세이브엔 넣지 않는다', () => {
    const app = read('src/ui/app.ts');
    expect(app.match(/enterFullscreenOnStart\(store\)/g)?.length).toBe(3);
    expect(read('src/game.ts')).not.toMatch(/fullscreen/i);
  });
});

describe('실제 상태 따라가기 · 화면 크기 다시 계산 (GDD 46장 3·4번)', () => {
  it('fullscreenchange 때 FULLSCREEN_EVENT 와 resize 를 알린다(즉시 + 0.3초 뒤)', () => {
    vi.useFakeTimers();
    const events: string[] = [];
    vi.stubGlobal('window', { dispatchEvent: (e: Event) => { events.push(e.type); return true; }, setTimeout: globalThis.setTimeout });
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    vi.stubGlobal('Event', class { constructor(public type: string) {} });
    const stop = watchFullscreen();
    doc.listeners['fullscreenchange']!.forEach((f) => f());
    expect(events).toEqual(['bha-fullscreen-change', 'resize']);
    vi.advanceTimersByTime(300);
    expect(events).toEqual(['bha-fullscreen-change', 'resize', 'resize']);
    stop();
    expect(doc.listeners['fullscreenchange']).toEqual([]);
    vi.useRealTimers();
  });
  it('app 이 시작할 때 watchFullscreen 을 켠다', () => {
    expect(read('src/ui/app.ts')).toContain('watchFullscreen();');
  });
});
