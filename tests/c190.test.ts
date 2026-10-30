// C.190 (GDD 116장): 종이인형 위치(그림 칸 = 옛 한 장 그림 규격)·혼백/학생 학생복·설정 설명 말줄임 없음·캐릭터 ×0.75·숲 나무 ×1.5
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ART_MANIFEST, charArt } from '../src/data/art/manifest';
import { HUMANOID } from '../src/data/art/rig/pose';
import { BG_SCENES, sceneBg } from '../src/data/art/backgrounds';

const read = (p: string) => readFileSync(p, 'utf8');

describe('C.190 종이인형 위치 (116장 1)', () => {
  it('게임 그림 칸 = 정사각, 발 가운데가 칸 가운데, 바닥이 아래에서 약 8% 위 (옛 한 장 그림 규격·그림자 자리와 같게)', () => {
    const [vx, vy, vw, vh] = HUMANOID.view!.rect;
    expect(vw).toBe(vh);
    const footX = HUMANOID.canvas[0] / 2;
    expect(Math.abs(vx + vw / 2 - footX)).toBeLessThanOrEqual(1);
    const ground = (HUMANOID as unknown as { ground: number }).ground;
    expect((ground - vy) / vh).toBeGreaterThan(0.9);
    expect((ground - vy) / vh).toBeLessThan(0.94);
    expect(HUMANOID.view!.clipY).toBeGreaterThan(ground);
  });
  it('정지 그림도 같은 칸(정사각 4배)', () => {
    const png = readFileSync('public/art/rig/humanoid/still/shinigami-base.png');
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    expect([w, h]).toEqual([HUMANOID.view!.rect[2] * 4, HUMANOID.view!.rect[3] * 4]);
  });
  it('머리 위 칩 높이용 headTop = 칸 위에서 머리 윗변까지', () => {
    const a = charArt('shinigami', 2, 'char.shinigami');
    expect(a.headTop).toBeCloseTo(-HUMANOID.view!.rect[1] / HUMANOID.view!.rect[3]);
  });
});

describe('C.190 크기 ×0.75 (116장 4)', () => {
  it('종이인형 자리 전부 같은 배율, 걷기·전투 필드 = C.189 의 키(1.32 × 152/113)의 0.75배, 방 = C.189 키 (C.192, 118장 1), 위치 보정 없음', () => {
    const rigs = Object.values(ART_MANIFEST).filter((e) => e.rig);
    expect(rigs.length).toBeGreaterThanOrEqual(4);
    const before = 1.32 * HUMANOID.view!.rect[2] / 113;
    for (const e of rigs) {
      expect(e.fieldScale!).toBeCloseTo(before * 0.75, 1);
      expect(e.scale!).toBeCloseTo(before, 1);
      expect(e.offsetY ?? 0).toBe(0);
    }
  });
});

describe('C.190 혼백·학생 = 학생복 (116장 2)', () => {
  it('사신 1·2단계 학생복, 3단계부터 사신복, 여성은 -f', () => {
    const look = (t: number, g: 'male' | 'female') => charArt('shinigami', t, 'char.shinigami', '/', undefined, [], null, undefined, g).rig?.look;
    expect([0, 1, 2, 3, 4].map((t) => look(t, 'male'))).toEqual(['shinigami-student', 'shinigami-student', 'shinigami-base', 'shinigami-base', 'shinigami-base']);
    expect([0, 1, 2].map((t) => look(t, 'female'))).toEqual(['shinigami-student-f', 'shinigami-student-f', 'shinigami-base-f']);
  });
  it('단계 → 외형은 그림 목록(manifest) 데이터로만 — 코드에 종족 분기 없음', () => {
    expect(ART_MANIFEST['char.shinigami.1']!.rig).toBe('shinigami-student');
    for (const f of ['src/data/art/manifest.ts', 'src/ui/bha/rigAnim.ts', 'src/ui/bha/room.ts', 'src/data/art/backgrounds.ts']) {
      expect(read(f)).not.toMatch(/===\s*'(hollow|shinigami)'/);
    }
  });
});

describe('C.190 숲 나무 ×1.5 (116장 4)', () => {
  it('숲 = 하늘·땅 그대로 + 땅 그림에서 떼어 낸 나무 층 ×1.5 (아랫변 = 길 윗선)', () => {
    const defs = BG_SCENES.forest!;
    const ground = defs.find((d) => d.id === 'ground')!;
    const trees = defs.find((d) => d.id === 'trees')!;
    expect(ground.height).toBe(58);
    expect(defs.find((d) => d.id === 'sky')!.height).toBe(100);
    expect(trees.scale).toBe(1.5);
    // 원래 그림에서 나무 부분(위 h 줄)이 차지하던 높이·아랫변
    expect(trees.height).toBeCloseTo(ground.height * trees.h / ground.h, 1);
    expect(trees.bottom!).toBeCloseTo(ground.height * (ground.h - trees.h) / ground.h, 1);
    const files = ['bg-forest-sky.webp', 'bg-forest-ground.webp', 'bg-forest-trees.webp'];
    const bg = sceneBg('forest', '/', files)!;
    const l = bg.layers.find((x) => x.url.endsWith('trees.webp'))!;
    expect(l.height).toBeCloseTo(trees.height * 1.5 * bg.zoom);
    expect(l.bottom).toBeCloseTo(trees.bottom! * bg.zoom);
    expect(bg.layers.find((x) => x.url.endsWith('ground.webp'))!.bottom).toBe(0);
    expect(read('src/ui/bha/walk-scene.css')).toContain('bottom: calc(var(--layer-b, 0) * 1%)');
  });
});

describe('C.190 설정 설명 말줄임 없음 (116장 3)', () => {
  it('설명 줄은 줄바꿈으로 다 보인다', () => {
    const rule = read('src/ui/bha/screens-lcd.css').split('\n').find((l) => l.startsWith('.bha-settings__hint'))!;
    expect(rule).not.toContain('ellipsis');
    expect(rule).not.toContain('nowrap');
    expect(rule).toContain('white-space: normal');
  });
});

describe('C.190 시작 때 가로 고정 (117장 1)', () => {
  const store = (on: boolean) => { const m = new Map<string, string>([['bha-fullscreen-start', on ? '1' : '0']]); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  it('설정 꺼짐 + 세로 폰이면 가로 고정만 시도, 가로면 아무것도 안 함', async () => {
    const { enterFullscreenOnStart } = await import('../src/ui/fullscreen');
    let n = 0;
    const lock = () => { n++; return Promise.resolve(); };
    enterFullscreenOnStart(store(false), { lock, portrait: () => true });
    expect(n).toBe(1);
    enterFullscreenOnStart(store(false), { lock, portrait: () => false });
    expect(n).toBe(1);
  });
  it('시작 버튼 연결은 그대로, 가로 고정은 orientation.ts lockLandscape 재사용', () => {
    const src = read('src/ui/fullscreen.ts');
    expect(src).toMatch(/import \{[^}]*\blockLandscape\b[^}]*\} from '\.\/bha\/orientation'/); // C.232: isAppMode 도 같이 가져온다
    expect(src).toMatch(/enterFullscreen\(\)\.then\(\(ok\) => \{ if \(ok\) return lock\(\); \}\)/);
  });
});

describe('C.190 발밑 그림자 = 캐릭터 아래 층 (117장 5)', () => {
  it('방: 몸 상자가 그림자 위 층, 걷기: 그림자를 몸보다 먼저, 전투: 그림자가 몸 상자보다 먼저', () => {
    expect(read('src/ui/bha/room.css')).toMatch(/\.bha-char__lift \{ display: block; position: relative; z-index: 1; \}/);
    expect(read('src/ui/bha/walk.ts')).toContain("walker.append(el('span', 'bha-walker__trail'), el('span', 'bha-walker__shadow'), body);");
    expect(read('src/ui/bha/battle.ts')).toContain("root.append(el('span', 'bha-hero__shadow'), lift);");
  });
});

describe('C.190 테스트 패널 고르기 = 게임 안 목록 (116장 추가 5)', () => {
  it('테스트 패널에 브라우저 기본 select 없음, 고르기 칸은 pickList', () => {
    const t = read('src/ui/testModePanel.ts');
    expect(t).not.toMatch(/el\('select'|HTMLSelectElement|<select/);
    expect(t).toContain("return pickList(options, value, aria, 'bha-test__select');");
  });
  it('목록은 오버레이 자리(기기 레이어)에 기기 안 좌표로 — 뒤로 닫기·바깥 누름 닫기', () => {
    const p = read('src/ui/bha/pickList.ts');
    expect(p).toContain('getOverlayHost()');
    expect(p).toContain('elementLocalRect(');
    expect(p).toContain('registerLayer(box, close)');
    expect(p).toContain('bha-viewtitle__list');
  });
  it('묶음은 처음 나온 순서대로 모인다', async () => {
    const { groupOptions } = await import('../src/ui/bha/pickList');
    const g = groupOptions([{ value: '', label: '1단계' }, { value: 'a', label: 'A', group: '2단계' }, { value: 'b', label: 'B', group: '3단계' }, { value: 'c', label: 'C', group: '2단계' }]);
    expect(g.map((x) => [x.group, x.items.map((i) => i.value)])).toEqual([[null, ['']], ['2단계', ['a', 'c']], ['3단계', ['b']]]);
  });
});
