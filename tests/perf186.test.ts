// 렉 수정 (GDD 186장 1): 월드맵 윤곽 미리 굽기 · 걷기 중 캐릭터만 배치 · 온천 강제 레이아웃 · 전투 HUD 강제 레이아웃 · 서비스 워커 그림 캐시
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { containBottom, parseDropShadows } from '../src/ui/bha/artOutline';

const read = (p: string) => readFileSync(p, 'utf8');

/** 가짜 Cache Storage (이름 → 주소 → 응답) */
function fakeCaches() {
  const store = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name)!;
    return {
      match: async (u: string) => m.get(typeof u === 'string' ? u : (u as Request).url)?.clone(),
      put: async (u: string, r: Response) => void m.set(u, r),
      addAll: async (list: string[]) => { for (const u of list) m.set(u, new Response('x')); },
      keys: async () => [...m.keys()].map((url) => ({ url })),
      delete: async (r: { url: string }) => m.delete(r.url),
    };
  };
  return { store, api: { open, keys: async () => [...store.keys()], delete: async (k: string) => store.delete(k), match: async () => undefined } };
}

function runSw(media: Record<string, [string, number]>, caches: ReturnType<typeof fakeCaches>['api'], fetched: string[]) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = {
    addEventListener: (k: string, h: (e: unknown) => void) => (handlers[k] = h),
    registration: { scope: 'https://x/app/' },
    location: { origin: 'https://x' },
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined, matchAll: async () => [] },
  };
  const src = read('scripts/sw-template.js').replace('__VERSION__', 'v1').replace('__PRECACHE__', '["./", "assets/a.js"]').replace('/*__MEDIA__*/ {}', JSON.stringify(media));
  const fetch = async (u: string) => { fetched.push(u); return new Response('img', { status: 200, headers: { 'content-type': 'image/webp' } }); };
  new Function('self', 'caches', 'fetch', src)(self, caches, fetch);
  const wait = async (name: string, data?: unknown) => {
    let p: Promise<unknown> = Promise.resolve();
    handlers[name]!({ data, waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
  };
  return { install: () => wait('install'), warm: () => wait('message', { type: 'bha-warm' }) };
}

describe('GDD 186장 1 렉', () => {
  it('서비스 워커: 설치 때 그림(art)만, 이펙트(fx)는 신호 뒤 · 해시가 같으면 다시 안 받는다', async () => {
    const c = fakeCaches();
    const media: Record<string, [string, number]> = { 'art/a.webp': ['h1', 0], 'fx/b.png': ['h2', 1] };
    let fetched: string[] = [];
    const sw = runSw(media, c.api, fetched);
    await sw.install();
    expect(fetched).toEqual(['https://x/app/art/a.webp']);
    await sw.warm();
    expect(fetched).toEqual(['https://x/app/art/a.webp', 'https://x/app/fx/b.png']);
    // 다음 배포: 같은 해시 = 아무것도 안 받음, 바뀐 파일만
    fetched = [];
    const sw2 = runSw({ 'art/a.webp': ['h1', 0], 'fx/b.png': ['h3', 1] }, c.api, fetched);
    await sw2.install();
    expect(fetched).toEqual([]);
    await sw2.warm();
    expect(fetched).toEqual(['https://x/app/fx/b.png']);
  });

  it('서비스 워커: 옛 버전 캐시를 지울 때 그림 캐시는 남긴다 · 빌드가 그림 목록을 채운다', () => {
    const sw = read('scripts/sw-template.js');
    expect(sw).toContain("k !== CACHE && k !== MEDIA_CACHE");
    expect(sw.match(/\/\*__MEDIA__\*\/ \{\}/g)).toHaveLength(1);
    expect(read('vite.config.ts')).toContain(".replace('/*__MEDIA__*/ {}', JSON.stringify(media))");
    expect(read('src/main.ts')).toContain('scheduleSwWarm()');
  });

  it('윤곽 굽기: 계산값 filter → drop-shadow 목록 (다른 filter 가 섞이면 굽지 않음) · contain + 아래 맞춤 자리', () => {
    expect(parseDropShadows('drop-shadow(rgba(0, 0, 0, 0.9) 1px 0px 0px) drop-shadow(rgba(0, 0, 0, 0.6) 0px 4px 1px)')).toEqual([
      { color: 'rgba(0, 0, 0, 0.9)', x: 1, y: 0, blur: 0 },
      { color: 'rgba(0, 0, 0, 0.6)', x: 0, y: 4, blur: 1 },
    ]);
    expect(parseDropShadows('drop-shadow(rgb(1, 2, 3) -1px 0.5px)')).toEqual([{ color: 'rgb(1, 2, 3)', x: -1, y: 0.5, blur: 0 }]);
    expect(parseDropShadows('brightness(1.1) drop-shadow(rgb(0, 0, 0) 1px 0px 0px)')).toBeNull();
    expect(parseDropShadows('none')).toBeNull();
    // 토큰 그대로: 윤곽 4방향 × 2 + 아래 그림자 = 9겹, 전부 drop-shadow
    const tok = read('src/ui/bha/design-system/tokens.css');
    expect(tok).toMatch(/--bha-art-outline: var\(--bha-art-ring\) var\(--bha-art-ring\) drop-shadow\(0 4px 1px var\(--bha-art-drop\)\);/);
    expect(read('src/ui/bha/artOutlineCore.ts')).toContain('g.shadowBlur = d.blur * job.dpr * 2');
    expect(containBottom(86, 76, 160, 160)).toEqual({ x: 5, y: 0, w: 76, h: 76 });
    expect(containBottom(86, 76, 200, 100)).toEqual({ x: 0, y: 33, w: 86, h: 43 });
  });

  it('월드맵 = 그림 윤곽을 굽고, 걷는 동안 캐릭터만 다시 놓는다', () => {
    const wm = read('src/ui/worldMapView.ts');
    expect(wm).toContain('bakeArtOutline(img)');
    expect(wm).toContain('layoutOnFloor(scene, wm.floor, [charEntry])');
    expect(read('src/ui/bha/worldmap.css')).toContain('.bha-prop__img.is-baked { visibility: hidden; filter: none; }');
  });

  it('전투 HUD 는 매 프레임 폭을 읽지 않는다 · 온천은 몸 자리를 한 번만 잰다', () => {
    const bv = read('src/ui/battleView.ts');
    const hud = bv.slice(bv.indexOf('const drawHud = () => {'), bv.indexOf('// ── 입력: 포인터 이벤트'));
    expect(hud).not.toMatch(/clientWidth|offsetLeft|offsetWidth/);
    const spa = read('src/ui/spaView.ts');
    expect(spa).toContain('if (!bodyBox || !bodyBox.h)');
  });

  it('종이인형(사신) 캐릭터는 매 프레임 PNG 로 바꾸지 않고 캔버스에 바로 그린다 — img 자리를 캔버스로, 클래스·스타일은 따라감', () => {
    const rig = read('src/ui/bha/rigAnim.ts');
    expect(rig).not.toContain('toDataURL');
    expect(rig).toContain('img.replaceWith(canvas)');
    expect(rig).toContain("attributeFilter: ['class', 'style']");
    expect(read('src/ui/bha/design-system/base.css')).toContain('canvas:where(.bha-rigcanvas) { display: block; max-width: 100%; }');
  });
});
