import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectPlatform, installMode, INSTALL_KEY, loadInstallPrefs, MAX_LATER, saveInstallPrefs, shouldAutoShow } from '../src/pwaInstall';

const read = (p: string) => readFileSync(p, 'utf8');
const GALAXY_CHROME = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const GALAXY_SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function store() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('C.121 설치 안내 (GDD 68장)', () => {
  it('플랫폼: 삼성 인터넷은 안드로이드보다 먼저, 아이폰, 데스크톱', () => {
    expect(detectPlatform(GALAXY_CHROME)).toBe('android');
    expect(detectPlatform(GALAXY_SAMSUNG)).toBe('samsung');
    expect(detectPlatform(IPHONE)).toBe('ios');
    expect(detectPlatform(DESKTOP)).toBe('other');
  });

  it('모드: 이벤트가 있으면 prompt, 없으면 안드로이드는 기다림(wait), 아이폰은 그림 안내, 데스크톱은 없음', () => {
    expect(installMode('android', true)).toBe('prompt');
    expect(installMode('samsung', true)).toBe('prompt');
    expect(installMode('other', true)).toBe('prompt');
    expect(installMode('android', false)).toBe('wait');
    expect(installMode('samsung', false)).toBe('wait');
    expect(installMode('ios', false)).toBe('guide-ios');
    expect(installMode('other', false)).toBe('none');
  });

  it('저절로 띄우기: 처음 + 다음 실행 한 번 더([나중에] 2번), 앱으로 열렸거나 설치했으면 안 띄움', () => {
    expect(MAX_LATER).toBe(2);
    expect(shouldAutoShow({ later: 0, installed: false }, false, 'prompt')).toBe(true);
    expect(shouldAutoShow({ later: 1, installed: false }, false, 'wait')).toBe(true);
    expect(shouldAutoShow({ later: 2, installed: false }, false, 'prompt')).toBe(false);
    expect(shouldAutoShow({ later: 0, installed: true }, false, 'prompt')).toBe(false);
    expect(shouldAutoShow({ later: 0, installed: false }, true, 'prompt')).toBe(false);
    expect(shouldAutoShow({ later: 0, installed: false }, false, 'none')).toBe(false);
  });

  it('설정 값 저장·읽기: 깨진 값·없는 값은 처음 상태', () => {
    const s = store();
    expect(loadInstallPrefs(s)).toEqual({ later: 0, installed: false });
    saveInstallPrefs(s, { later: 1, installed: false });
    expect(loadInstallPrefs(s)).toEqual({ later: 1, installed: false });
    s.setItem(INSTALL_KEY, '{깨짐');
    expect(loadInstallPrefs(s)).toEqual({ later: 0, installed: false });
    s.setItem(INSTALL_KEY, JSON.stringify({ later: -3, installed: 'yes' }));
    expect(loadInstallPrefs(s)).toEqual({ later: 0, installed: false });
    expect(loadInstallPrefs(null)).toEqual({ later: 0, installed: false });
  });

  it('연결: 설치 띠를 막고(preventDefault) 맨 앞에서 잡아 두고, [설치] 가 잡아 둔 요청을 연다', () => {
    const pwa = read('src/pwaInstall.ts');
    expect(pwa).toContain('e.preventDefault()');
    expect(pwa).toContain("'beforeinstallprompt'");
    expect(pwa).toContain("'appinstalled'");
    const main = read('src/main.ts');
    expect(main.indexOf('captureInstallPrompt()')).toBeGreaterThan(-1);
    expect(main.indexOf('captureInstallPrompt()')).toBeLessThan(main.indexOf('startApp(app)'));
    const view = read('src/ui/installView.ts');
    expect(view).toContain('d.prompt()');
    expect(view).toContain('d.userChoice');
    expect(view).toContain('홈 화면에 설치하면 인터넷 없이도 플레이할 수 있어요');
    expect(view).toContain('"현재 페이지 추가" → "홈 화면"');
    expect(view).toContain('"홈 화면에 추가"');
    expect(read('src/ui/settingsView.ts')).toContain("label: '앱 설치'");
  });

  it('모양: bha 토큰만 (새 색 없음)', () => {
    const css = read('src/ui/bha/install.css');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rgb\(/);
    expect(css).toContain('var(--bha-z-tutorial)');
  });
});
