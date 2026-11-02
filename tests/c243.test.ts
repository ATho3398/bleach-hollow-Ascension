// C.243 앱인데 전체 화면이 아닐 때 '이미 전체 화면'으로 뜨던 버그 (GDD 166장): standalone 은 탭처럼, '전체 화면 중'은 실제로 전체 화면일 때만
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enterFullscreen, enterFullscreenOnStart, isAppMode, toggleFullscreen } from '../src/ui/fullscreen';
import { lockLandscape } from '../src/ui/bha/orientation';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

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

describe('C.243 판정 — 세 경우 (166장 1·4)', () => {
  it('display-mode fullscreen(진짜 전체 화면 앱) = 앱 모드: API 안 부름', async () => {
    const { requestFullscreen } = setup('fullscreen');
    expect(isAppMode()).toBe(true);
    expect(await toggleFullscreen()).toBe(false);
    const lock = vi.fn(async () => {});
    enterFullscreenOnStart(mem(), { lock, portrait: () => true });
    await Promise.resolve();
    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
  });
  it('display-mode standalone(상태바 보이는 앱 창) = 앱 모드 아님: [전체 화면] 버튼이 requestFullscreen 을 부른다', async () => {
    const { requestFullscreen } = setup('standalone');
    expect(isAppMode()).toBe(false);
    expect(await toggleFullscreen()).toBe(true);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });
  it('standalone 시작 자동 전체 화면 + 가로 고정도 탭과 같다', async () => {
    const { requestFullscreen } = setup('standalone');
    const lock = vi.fn(async () => {});
    enterFullscreenOnStart(mem(), { lock, portrait: () => false });
    await vi.waitFor(() => expect(lock).toHaveBeenCalled());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });
  it('standalone 에서 가로 고정이 실패하면 전체 화면을 켜고 다시 고정한다', async () => {
    const { requestFullscreen } = setup('standalone');
    let n = 0;
    vi.stubGlobal('screen', { orientation: { type: 'portrait-primary', lock: vi.fn(async () => { if (n++ === 0) throw new Error('no'); }) } });
    expect(await lockLandscape(document)).toBe('fullscreen');
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });
  it('브라우저 탭 = 앱 모드 아님, 버튼이 전체 화면에 넣는다', async () => {
    const { requestFullscreen } = setup('browser');
    expect(isAppMode()).toBe(false);
    expect(await enterFullscreen()).toBe(true);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });
});

describe('C.243 설정 문구 (166장 3)', () => {
  it("'앱으로 실행 중 — 이미 전체 화면' 대신 '전체 화면 중', standalone 판정은 orientation 에 없다", () => {
    const src = read('src/ui/settingsView.ts');
    expect(src).not.toContain('이미 전체 화면');
    expect(src).toContain("hintLine('전체 화면 중')");
    expect(read('src/ui/bha/orientation.ts')).not.toContain("matchMedia('(display-mode: standalone)')");
  });
});
