// C.249 pixelfx 도구: 시트 재생 순수 함수 · 가져온 시트 파일 · 고지 · 개발 전용 실험실
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { frameAt, framePos, pivotBox, sheetDurationMs, type PixelFxIndex, type PixelFxSheet } from '../src/ui/bha/pixelFx';

const pngSize = (path: string): [number, number] => {
  const b = readFileSync(path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('frameAt', () => {
  const d = [30, 30, 40];
  it('시간에 맞는 프레임', () => {
    expect(frameAt(d, 0, false)).toBe(0);
    expect(frameAt(d, 29, false)).toBe(0);
    expect(frameAt(d, 30, false)).toBe(1);
    expect(frameAt(d, 99, false)).toBe(2);
  });
  it('한 번 재생은 끝나면 -1, 반복은 처음으로', () => {
    expect(frameAt(d, 100, false)).toBe(-1);
    expect(frameAt(d, 100, true)).toBe(0);
    expect(frameAt(d, 165, true)).toBe(2);
  });
  it('빈 시트는 -1', () => {
    expect(frameAt([], 0, true)).toBe(-1);
    expect(sheetDurationMs({ durations: d })).toBe(100);
  });
});

describe('framePos · pivotBox', () => {
  const s = { frame: [80, 64] as [number, number], columns: 4, pivot: [20, 60] as [number, number] };
  it('열을 넘기면 다음 줄', () => {
    expect(framePos(s, 0)).toEqual([0, 0]);
    expect(framePos(s, 3)).toEqual([240, 0]);
    expect(framePos(s, 5)).toEqual([80, 64]);
  });
  it('기준점이 (x, y) 에 오게 · 반전이면 기준점도 반대쪽', () => {
    expect(pivotBox(s, 100, 200, 2)).toEqual({ left: 60, top: 80, width: 160, height: 128 });
    expect(pivotBox(s, 100, 200, 2, true)).toEqual({ left: -20, top: 80, width: 160, height: 128 });
  });
});

describe('public/fx 가져온 시트', () => {
  const ix = JSON.parse(readFileSync('public/fx/index.json', 'utf8')) as PixelFxIndex;
  const pin = JSON.parse(readFileSync('scripts/pixelfx/pin.json', 'utf8')) as { commit: string; version: string };
  it('목록 = 고정 버전, 하나 이상', () => {
    expect(ix.pixelfx.commit).toBe(pin.commit);
    expect(ix.effects.length).toBeGreaterThan(0);
  });
  it('시트마다 PNG 크기 = 프레임 × 열·줄, 길이 = 프레임 수', () => {
    for (const e of ix.effects) {
      const s = JSON.parse(readFileSync(`public/fx/${e.name}.json`, 'utf8')) as PixelFxSheet;
      expect(s.name).toBe(e.name);
      expect(s.pixelfx).toBe(pin.commit.slice(0, 7));
      expect(s.durations.length).toBe(s.frames);
      const [w, h] = pngSize(`public/fx/${s.image}`);
      expect(w).toBe(s.frame[0] * Math.min(s.columns, s.frames));
      expect(h).toBe(s.frame[1] * Math.ceil(s.frames / s.columns));
    }
  });
  it('목록에 없는 시트 파일이 남지 않음', () => {
    const names = new Set(ix.effects.map((e) => e.name));
    for (const f of readdirSync('public/fx')) {
      const m = /^(.+)\.(png|json)$/.exec(f);
      if (!m || f === 'index.json') continue;
      expect(names.has(m[1]!), f).toBe(true);
    }
  });
});

describe('고지 · 글꼴 · 개발 전용', () => {
  it('MIT 고지: 저장소 THIRD_PARTY_NOTICES.md 와 배포되는 public/fx/LICENSE-pixelfx.txt', () => {
    const n = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
    expect(n).toContain('pixelfx');
    expect(n).toContain('Permission is hereby granted');
    expect(n).toContain('Hugo Duprez');
    expect(readFileSync('public/fx/LICENSE-pixelfx.txt', 'utf8')).toContain('Permission is hereby granted');
  });
  it('Patch Pixel 글꼴을 쓰지 않음', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(`${d}/${x.name}`) : [`${d}/${x.name}`]));
    for (const f of [...walk('public'), ...walk('src')]) {
      expect(/patch.?pixel/i.test(f), f).toBe(false);
      if (/\.(ts|css|html|json)$/.test(f)) expect(/patch.?pixel/i.test(readFileSync(f, 'utf8')), f).toBe(false);
    }
  });
  it('실험실은 개발 빌드에서만 (main.ts DEV 가드)', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toMatch(/import\.meta\.env\.DEV && new URLSearchParams\(location\.search\)\.has\('fxlab'\)/);
  });
  it('클라우드 세션용 스킬이 저장소에 있음', () => {
    expect(existsSync('.claude/skills/pixelfx/SKILL.md')).toBe(true);
    expect(readFileSync('.claude/skills/pixelfx/SKILL.md', 'utf8')).toMatch(/^---\nname: pixelfx\n/);
  });
});
