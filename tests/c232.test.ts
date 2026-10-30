// C.232 앱(홈 화면)으로 켰을 때 크롬 '전체 화면 종료' 안내 안 뜨게 (GDD 156장): 앱 모드에서는 Fullscreen API 를 부르지 않는다
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enterFullscreen, enterFullscreenOnStart, isAppMode, toggleFullscreen } from '../src/ui/fullscreen';
import { lockLandscape } from '../src/ui/bha/orientation';
import { isStandalone } from '../src/pwaInstall';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

/** display-mode 하나만 맞는 matchMedia + 전체 화면을 지원하는 가짜 문서 */
function setup(mode: 'browser' | 'fullscreen' | 'standalone') {
  const requestFullscreen = vi.fn(async () => { doc.fullscreenElement = doc.documentElement; });
  const doc: { fullscreenEnabled: boolean; fullscreenElement: unknown; documentElement: { requestFullscreen: typeof requestFullscreen } } = {
    fullscreenEnabled: true, fullscreenElement: null, documentElement: { requestFullscreen },
  };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === `(display-mode: ${mode})` }));
  return { doc, requestFullscreen };
}
afterEach(() => vi.unstubAllGlobals());

describe('C.232 앱 모드 판정 (156장 2)', () => {
  it('display-mode fullscreen·standalone = 앱 모드, 브라우저 탭은 아님', () => {
    setup('fullscreen');
    expect(isAppMode()).toBe(true);
    setup('standalone');
    expect(isAppMode()).toBe(true);
    setup('browser');
    expect(isAppMode()).toBe(false);
  });
  it('탭에서 API 로 들어간 전체 화면(전체 화면 요소 있음)은 display-mode 가 fullscreen 이어도 앱 모드가 아니다', () => {
    const { doc } = setup('fullscreen');
    doc.fullscreenElement = doc.documentElement;
    expect(isAppMode()).toBe(false);
  });
  it('설치 안내 판정도 display-mode fullscreen 을 앱으로 본다 (manifest fullscreen 으로 바뀐 뒤 앱 안에서 설치 안내가 뜨지 않게)', () => {
    const win = { matchMedia: (q: string) => ({ matches: q === '(display-mode: fullscreen)' }), navigator: {} } as unknown as Parameters<typeof isStandalone>[0];
    expect(isStandalone(win)).toBe(true);
  });
});

describe('C.232 앱 모드에서는 requestFullscreen 을 부르지 않는다 (156장 2)', () => {
  it('시작할 때 자동 진입·가로 고정 모두 안 함', async () => {
    const { requestFullscreen } = setup('fullscreen');
    const lock = vi.fn(async () => {});
    enterFullscreenOnStart(mem(), { lock, portrait: () => true });
    await Promise.resolve();
    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
  });
  it('[전체 화면] 버튼(toggle·enter)도 안 부른다', async () => {
    const { requestFullscreen } = setup('standalone');
    expect(await toggleFullscreen()).toBe(false);
    expect(await enterFullscreen()).toBe(false);
    expect(requestFullscreen).not.toHaveBeenCalled();
  });
  it('가로 고정이 실패해도 전체 화면으로 우회하지 않는다', async () => {
    const { requestFullscreen } = setup('fullscreen');
    vi.stubGlobal('screen', { orientation: { type: 'portrait-primary', lock: vi.fn(async () => { throw new Error('no'); }) } });
    expect(await lockLandscape(document)).toBe('failed');
    expect(requestFullscreen).not.toHaveBeenCalled();
  });
  it('브라우저 탭은 지금처럼 부른다', async () => {
    const { requestFullscreen } = setup('browser');
    const lock = vi.fn(async () => {});
    enterFullscreenOnStart(mem(), { lock, portrait: () => false });
    await vi.waitFor(() => expect(lock).toHaveBeenCalled());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });
});

describe('C.232 manifest·설정 줄 (156장 1·2·3)', () => {
  it('manifest display fullscreen + display_override, 가로', () => {
    const m = JSON.parse(read('public/manifest.webmanifest'));
    expect(m.display).toBe('fullscreen');
    expect(m.display_override).toEqual(['fullscreen', 'standalone']);
    expect(m.orientation).toBe('landscape');
  });
  it('설정: 앱 모드 = 안내 한 줄, 탭 = 버튼 + 홈 화면 앱 안내', () => {
    const src = read('src/ui/settingsView.ts');
    expect(src).toContain("hintLine('앱으로 실행 중 — 이미 전체 화면')");
    expect(src).not.toContain('홈 화면에 앱으로 추가해 켜면'); // C.239 (GDD 159장 12): 기기·브라우저 사정 설명은 뺐다
    expect(src).toContain("hintLine('화면을 넓게 쓴다.')");
  });
});
