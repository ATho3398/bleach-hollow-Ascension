import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('C.116 오프라인 플레이(PWA)', () => {
  it('매니페스트: 이름·독립 창·가로·상대 시작 주소·아이콘 192/512', () => {
    const m = JSON.parse(read('public/manifest.webmanifest'));
    expect(m.name).toBe('블리치 할로우 어센션');
    expect(m.short_name).toBeTruthy();
    expect(m.display).toBe('fullscreen'); // C.232 (GDD 156장 1): 앱으로 켜면 처음부터 꽉 찬 화면, 안 되는 곳은 standalone
    expect(m.display_override).toEqual(['fullscreen', 'standalone']);
    expect(m.orientation).toBe('landscape'); // C.180 (GDD 109장 9번): 앱 아이콘으로 켤 때 시작 화면도 가로
    expect(m.start_url).toBe('./');
    expect(m.scope).toBe('./');
    expect(m.background_color).toBe('#0b0909');
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const i of m.icons) expect(existsSync(`public/${i.src}`)).toBe(true);
    expect(read('src/ui/bha/design-system/theme-hollow.css')).toContain('--bha-bg-0: #0b0909');
  });

  it('서비스 워커 템플릿: 자리표시자 2개, 캐시 조회는 쿼리·Vary 무시, 설치 끝나면 바로 적용(C.116b)', () => {
    const sw = read('scripts/sw-template.js');
    expect(sw.match(/__VERSION__/g)).toHaveLength(1);
    expect(sw.match(/__PRECACHE__/g)).toHaveLength(1);
    expect(sw).toMatch(/skipWaiting\(/);
    expect(sw).toContain('ignoreSearch: true, ignoreVary: true');
    expect(sw).toContain('caches.match(req, LOOKUP)');
    expect(sw).toContain("req.method !== 'GET'");
  });

  it('빌드 플러그인이 sw.js 를 쓰고 index.html 이 매니페스트를 건다', () => {
    const cfg = read('vite.config.ts');
    expect(cfg).toContain('plugins: [pwaPlugin()]');
    expect(cfg).toContain('/sw.js');
    expect(cfg).toContain('c.build.outDir'); // --outDir 로 빌드해도 워커가 그 폴더에 써진다
    const html = read('index.html');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('name="theme-color"');
  });

  it('등록은 배포 빌드에서만, 주소는 문서 기준(하위 경로 배포)', () => {
    const pwa = read('src/pwa.ts');
    expect(pwa).toContain('import.meta.env.PROD');
    expect(pwa).toContain("new URL('sw.js', document.baseURI)");
    expect(read('src/main.ts')).toContain('registerServiceWorker()');
  });

  it('시작 화면이 새 버전 안내를 건다(다시 열면 적용)', () => {
    const v = read('src/ui/startView.ts');
    expect(v).toContain('onUpdateReady');
    expect(v).toContain('다시 열면 적용');
  });
});
