// C.153 (GDD 95장 A): 홈 바닥 범위(물건·캐릭터 발 기준점이 늘 바닥 안) · 탭 선택 기억 · 스킨 하위 탭 · 수련장 드롭다운 · 걷기 이음새
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { FACTIONS } from '../src/data/factions';
import { roomOf, ROOM_PROPS } from '../src/engine/faction';
import { clampToPoly, floorPolyPx, footOnFloor, imageToScenePx, insidePoly, isFootOnFloor, REF_LIFT, REF_SCENE } from '../src/ui/bha/roomFloor';

const read = (p: string) => readFileSync(p, 'utf8');
const SIZES = [REF_SCENE, { w: 560, h: 330 }, { w: 700, h: 280 }, { w: 300, h: 400 }];

describe('C.153 A1 홈 바닥 범위', () => {
  it.each(FACTIONS.map((f) => [f.id, f] as const))('%s: 모든 물건·캐릭터 발 기준점이 바닥 안 (어느 장면 크기에서도)', (_id, f) => {
    const r = roomOf(f);
    for (const size of SIZES) {
      for (const p of ROOM_PROPS) {
        const q = footOnFloor(r.layout[p], r.floor, size, { below: REF_LIFT, padX: 46 });
        expect(isFootOnFloor(q, r.floor, size), `${f.id}.${p} @${size.w}x${size.h}`).toBe(true);
      }
      const c = footOnFloor(r.characterFoot, r.floor, size, { below: 60, padX: 65 });
      expect(isFootOnFloor(c, r.floor, size), `${f.id}.char @${size.w}x${size.h}`).toBe(true);
    }
  });
  it.each(FACTIONS.map((f) => [f.id, f] as const))('%s: 데이터에 적은 발 기준점은 끌려가지 않고 그대로 바닥 안이다 (기준 장면)', (_id, f) => {
    const r = roomOf(f);
    for (const p of ROOM_PROPS) {
      const l = r.layout[p];
      const q = footOnFloor(l, r.floor, REF_SCENE, { below: REF_LIFT, padX: 0 });
      expect(q.x, `${f.id}.${p}.x`).toBeCloseTo(l.x, 3);
      expect(q.y, `${f.id}.${p}.y`).toBeCloseTo(l.y, 3);
    }
  });
  it('바닥 밖(하늘·벽) 위치를 적어도 바닥 안으로 끌어 놓는다 — 새 물건이 생겨도 같은 함수를 지난다', () => {
    const r = roomOf(FACTIONS[0]!);
    for (const out of [{ x: 50, y: 5 }, { x: -20, y: 50 }, { x: 140, y: 30 }, { x: 50, y: 400 }]) {
      const q = footOnFloor(out, r.floor);
      expect(isFootOnFloor(q, r.floor), JSON.stringify(out)).toBe(true);
    }
    // 두 번 해도 같다
    const a = footOnFloor({ x: 10, y: 10 }, r.floor);
    expect(footOnFloor(a, r.floor)).toEqual(a);
  });
  it('이름표 아래 끝이 장면 아래로 나가지 않는다 (below)', () => {
    const r = roomOf(FACTIONS[0]!);
    const q = footOnFloor({ x: 50, y: 100 }, r.floor, REF_SCENE, { below: 30 });
    expect((q.y / 100) * REF_SCENE.h).toBeLessThanOrEqual(REF_SCENE.h - 30 + 1e-6);
  });
  it('그림(cover) 좌표 변환: 장면이 그림보다 가로로 길면 위아래가 잘린다', () => {
    const [, y] = imageToScenePx([0.5, 0], { w: 628, h: 296 }, 2); // 628/2 = 314 > 296 → 위가 9px 잘림
    expect(y).toBeCloseTo(-9, 5);
    const [x] = imageToScenePx([0, 0.5], { w: 300, h: 400 }, 2); // 세로 장면: 가로가 잘림
    expect(x).toBeCloseTo(-250, 5);
  });
  it('다각형 기본 연산', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(insidePoly([5, 5], sq)).toBe(true);
    expect(insidePoly([10, 5], sq)).toBe(true);
    expect(insidePoly([11, 5], sq)).toBe(false);
    expect(clampToPoly([20, 5], sq)).toEqual([10, 5]);
    const f = roomOf(FACTIONS[0]!).floor;
    expect(floorPolyPx(f, REF_SCENE).length).toBe(f.poly.length);
  });
  it('방 그림 위쪽(벽) 줄이 바닥이 아니다: 바닥 다각형 윗변이 그림 중간보다 아래', () => {
    for (const f of FACTIONS) for (const [, y] of roomOf(f).floor.poly) expect(y === 1 || y >= 0.4).toBe(true);
  });
  it('방 화면은 모든 물건·캐릭터를 layoutOnFloor 로만 놓는다 (floorEntries)', () => {
    const rv = read('src/ui/roomView.ts');
    expect(rv).toContain("kind: 'prop'");
    expect(rv).toContain("kind: 'char'");
    expect(rv).toContain('layoutOnFloor(scene, room.floor, floorEntries)');
  });
});

describe('C.153 A2 탭 선택 기억', () => {
  const dev = read('src/ui/bha/device.ts');
  it('공용 탭(role=tab 전부·제목 토글)이 다시 그려져도 선택이 그 탭에 돌아온다', () => {
    expect(dev).toContain(`e.matches('[role="tab"]')`);
    expect(dev).toContain('.bha-viewtitle__btn');
    expect(dev).not.toContain("e.matches('.bha-seg__item') && e.dataset.id");
  });
  it('손가락으로 눌러도 기억한다 (capture click)', () => {
    expect(dev).toContain(`view.addEventListener('click'`);
  });
});

describe('C.153 A3 스킨 하위 탭', () => {
  it('상점·보관함이 같은 하위 탭을 쓴다', () => {
    expect(read('src/ui/shopView.ts')).toContain('SKIN_SUBTABS');
    expect(read('src/ui/lcdScreens.ts')).toContain('SKIN_SUBTABS');
  });
});

describe('C.153 A2 수련장 드롭다운', () => {
  it('훈련 인형·번호쟁탈전은 수련장 드롭다운 안에 있다', () => {
    const t = read('src/ui/trainingView.ts');
    expect(t).toContain('dropdown(');
    expect(read("src/ui/bha/dropdown.ts")).toContain("dataset.door");
  });
});

/** 8비트 RGBA·비인터레이스 PNG 를 읽는 작은 해독기 (걷기 이음새 검사용) */
function decodePng(path: string): { w: number; h: number; px: Uint8Array } {
  const b = readFileSync(path);
  let o = 8;
  let w = 0;
  let h = 0;
  let ct = 0;
  const idat: Buffer[] = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o);
    const type = b.toString('latin1', o + 4, o + 8);
    const d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]!; }
    else if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!bpp) throw new Error(`${path}: RGB/RGBA PNG 만 지원`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = new Uint8Array(w * h * 4);
  const prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= bpp ? cur[i - bpp]! : 0;
      const up = prev[i]!;
      const c = i >= bpp ? prev[i - bpp]! : 0;
      const pr = f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : (() => { const p = a + up - c; const pa = Math.abs(p - a); const pb = Math.abs(p - up); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? up : c; })();
      cur[i] = (x + pr) & 255;
    }
    for (let i = 0; i < w; i++) {
      out[(y * w + i) * 4] = cur[i * bpp]!;
      out[(y * w + i) * 4 + 1] = cur[i * bpp + 1]!;
      out[(y * w + i) * 4 + 2] = cur[i * bpp + 2]!;
      out[(y * w + i) * 4 + 3] = bpp === 4 ? cur[i * 4 + 3]! : 255;
    }
    prev.set(cur);
    cur = new Uint8Array(stride);
  }
  return { w, h, px: out };
}
const pixDiff = (a: Uint8Array, b: Uint8Array): number => {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
  return n;
};

describe('C.153 A4 걷기 이음새 (마지막 프레임 → 첫 프레임)', () => {
  const dirs = readdirSync('public/art', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    .filter((d) => existsSync(`public/art/${d}/move-1.png`));
  it('걷기 그림이 있는 폴더가 검사에 잡힌다', () => expect(dirs).toContain('char-hollow'));
  it.each(dirs.map((d) => [d] as const))('%s: 끝 → 처음 바뀜이 안쪽 바뀜 중 가장 큰 것을 넘지 않는다', (d) => {
    const frames: Uint8Array[] = [];
    for (let i = 1; existsSync(`public/art/${d}/move-${i}.png`); i++) frames.push(decodePng(`public/art/${d}/move-${i}.png`).px);
    if (frames.length < 3) return; // 두 장은 서로 오가기만 해서 이음새가 따로 없다
    const inner = frames.slice(0, -1).map((f, i) => pixDiff(f, frames[i + 1]!));
    expect(pixDiff(frames[frames.length - 1]!, frames[0]!), `${d} 이음새`).toBeLessThanOrEqual(Math.max(...inner));
  });
  it('스토커(char-hollow): 한 바퀴 6장 = 같은 세 걸음 두 번 — 첫 걸음 = 네 번째 걸음', () => {
    const f = (i: number) => decodePng(`public/art/char-hollow/move-${i}.png`).px;
    for (const i of [1, 2, 3]) expect(pixDiff(f(i), f(i + 3)), `move-${i} = move-${i + 3}`).toBe(0);
    // 끝 → 처음 바뀜이 가운데(3 → 4) 바뀜과 같다
    expect(pixDiff(f(6), f(1))).toBe(pixDiff(f(3), f(4)));
  });
});
