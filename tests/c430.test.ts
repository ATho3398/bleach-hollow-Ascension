// C.430 (GDD 12-4 v6.027·v6.030): 초월자 '태초' 그림 연결 · Unknown;03398 이름 글리치(화면 어디든) · 방 알림 띠는 방에서만
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ART_MANIFEST, charArt } from '../src/data/art/manifest';
import { parseTranscendent, TRANSCENDENTS } from '../src/data/transcendents';
import { artSkinOf, newSaveData } from '../src/game';
import { fixedGlitchAt, GLITCH_CHARS, GLITCH_TIMING, glitchFrame, glitchNames } from '../src/ui/bha/glitchName';

const read = (p: string) => readFileSync(p, 'utf8');
const KEY = 'char.transcendent-zero-sage';
const FRAMES = Array.from({ length: 32 }, (_, i) => `char-transcendent-zero-sage/idle-${i + 1}.png`);

describe('태초 그림 (데이터 art 키)', () => {
  it('태초만 그림 키, Unknown;03398 만 이름 글리치 — 데이터 표시로', () => {
    expect(TRANSCENDENTS.filter((d) => d.art).map((d) => [d.id, d.art])).toEqual([['aizen', 'char.transcendent-aizen'], ['zero-sage', KEY]]); // C.450: 아이젠 도트 초안
    expect(glitchNames()).toEqual(['Unknown;03398']);
    expect(() => parseTranscendent({ ...TRANSCENDENTS[0], art: 'bad' })).toThrow(/art/);
    expect(() => parseTranscendent({ ...TRANSCENDENTS[0], nameGlitch: 'y' })).toThrow(/nameGlitch/);
  });
  it('그림 파일 = 후광 32프레임(구슬 합성) · 100ms 반복', () => {
    for (let i = 1; i <= 32; i++) expect(existsSync(`public/art/char-transcendent-zero-sage/idle-${i}.png`)).toBe(true);
    expect(JSON.parse(read('public/art/char-transcendent-zero-sage/anim.json'))).toEqual({ idle: { ms: 100 } });
    expect(ART_MANIFEST[KEY]?.scale).toBe(1); // 호로 덩치 배율을 물려받지 않는다
  });
  it('초월자 트랙의 그림 = 그림 키 (프레임 애니) · 그림 파일이 없으면 진화체 그림(자리 표시)', () => {
    const a = charArt('hollow', 3, 'char.hollow', '/', ART_MANIFEST, FRAMES, KEY, { [KEY.replace(/\./g, '-')]: { idle: { ms: 100 } } } as never, 'male');
    expect(a.src).toContain('char-transcendent-zero-sage/idle-1.png');
    expect(a.scale).toBe(1);
    expect(a.anims?.idle?.frames).toHaveLength(32);
    const none = charArt('hollow', 3, 'char.hollow', '/', ART_MANIFEST, [], KEY, {}, 'male');
    expect(none.src ?? '').not.toContain('zero-sage');
    const s = newSaveData('hollow', 1);
    expect(artSkinOf(s)).toBeNull();
    s.transcendentId = 'zero-sage';
    expect(artSkinOf(s)).toBe(KEY);
    s.transcendentId = 'yhwach';
    expect(artSkinOf(s)).toBeNull(); // 그림 없는 초월자 = 이어받은 진화체 그림
  });
});

describe('이름 글리치 (GDD 12-4 v6.027)', () => {
  it('한 번 깨질 때 = 공백 아닌 1~2글자, 깨진 글자 목록에서 · 타이밍 1~3초 / 0.1~0.2초', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 200; k++) {
      const f = glitchFrame('Unknown;03398', rnd);
      expect(f.at.length).toBeGreaterThanOrEqual(1);
      expect(f.at.length).toBeLessThanOrEqual(2);
      expect(new Set(f.at).size).toBe(f.at.length);
      for (const i of f.at) expect(i).toBeLessThan(13);
      for (const c of f.chars) expect(GLITCH_CHARS).toContain(c);
    }
    expect(glitchFrame('a b', () => 0.99).at.every((i) => i !== 1)).toBe(true);
    expect(GLITCH_TIMING).toMatchObject({ gapMin: 1000, gapMax: 3000, holdMin: 100, holdMax: 200 });
    expect(fixedGlitchAt('Unknown;03398')).toBe(6);
  });
  it('모든 출력 경로: 앱 루트 관찰자 하나 + 직접 그리는 곳은 transcendentNameNode (이름 문자열 직접 삽입 0건)', () => {
    expect(read('src/main.ts')).toContain('installNameGlitch(document.body)');
    expect(read('src/main.ts')).toContain("import './ui/bha/glitch.css'");
    const hv = read('src/ui/hogyokuView.ts');
    expect(hv).not.toMatch(/h\('(b|h1|p)', '[^']*', `[^`]*\$\{(pv\.)?def\.name\}/);
    expect(hv).not.toContain("h('h1', 'bha-evolve__title', def.name)");
    expect(hv.match(/transcendentNameNode\(/g)?.length).toBeGreaterThanOrEqual(4);
    expect(read('src/ui/bha/statusBox.ts')).toContain('transcendentNameNode(def)');
    const g = read('src/ui/bha/glitchName.ts');
    expect(g).toContain("setAttribute('aria-label', name)"); // 읽기 이름 = 원래 이름
    expect(g).toContain('prefersReducedMotion()');
    expect(g).toContain('if (!el.isConnected) { live.delete(el); return; }'); // 화면에서 빠지면 멈춤
    expect(g).not.toMatch(/'zero-sage'|'rift-wanderer'|Unknown;03398/); // id·이름 분기 없음
  });
  it('글자 칸 폭 고정(겹쳐 그림) · 새 색 없음(기존 토큰)', () => {
    const css = read('src/ui/bha/glitch.css');
    expect(css).toContain('.bha-glitch__c.is-on::after');
    expect(css).toContain('position: absolute');
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
    expect(css).toContain('var(--bha-danger)');
  });
});

describe('방 알림 띠는 방에서만 (캡처 02 상태 화면 가림)', () => {
  it('다른 화면이 열리면 숨기고, 방을 떠났으면 띄우지 않는다', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain("if (nav.top?.id === 'room') notes.forEach((n, i) => roomOnlyToast(showToast(n, i, 5200)));");
    expect(app).toContain("t.classList.replace('is-in', 'is-out');");
  });
});
