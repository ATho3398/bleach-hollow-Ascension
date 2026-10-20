// C.62 (S-17, GDD 27장): 다마고치 모드·기기 뒷면·기기 디자인·키링 — 순수 계산(진자·기울기·배치·기록 판)과 데이터·세이브
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { FACTIONS, getFaction } from '../src/data/factions';
import { CATEGORIES, COSMETIC_ITEMS, KEYRING_SHAPES, WEAR_CATEGORIES, cosmeticName, deviceArt, getCosmetic, keyringArt, keyringShapeOf, shopVisible } from '../src/data/shop';
import { parseFactionConfig } from '../src/engine/faction';
import { earliestStamp, migrateSave, newSaveData, SAVE_FORMAT_VERSION, type SaveData } from '../src/game';
import { buyShopItem, grantCosmetic, jadeRows, wearCosmetic } from '../src/shop';
import { RESERVED_CODES, SHORTCUTS, TAMAGO_CODE, findProblems } from '../src/ui/shortcutMap';
import {
  BODY, PHYS, VIEW_HOME, accruePlay, clampView, minViewZoom, wheelFactor, zoomAt, defaultGravity, deviceArtPlacement, isResting, kick, loadTamagoPrefs, parseTamagoPrefs, plateRows, playTimeText, restAngle, restingAt, saveTamagoPrefs,
  screenGravity, serialNumber, stepPendulum, tamaLayout, tapKick, toDeviceVec, type Pendulum,
} from '../src/ui/bha/tamagoLogic';
import { PATCH_LABEL, STAGE_LABEL } from '../src/version';

const H = getFaction('hollow');
const S = getFaction('shinigami');
const SX = BALANCE.provisional.shop;
const deg = (r: number) => (r * 180) / Math.PI;
const run = (s: Pendulum, g: { x: number; y: number }, secs: number, reduced = false) => {
  let p = s;
  for (let t = 0; t < secs; t += 1 / 60) p = stepPendulum(p, g, 1 / 60, reduced);
  return p;
};
const rich = (fid = 'hollow'): SaveData => {
  const s = newSaveData(fid, 1000);
  s.shared.jade = 100;
  return s;
};

describe('버전·데이터 (GDD 27장 S-17)', () => {
  it('패치 C.62 / 단계 S-17, BALANCE 38, 세이브 형식 25 (이후 패치는 그 이상)', () => {
    expect(PATCH_LABEL).toMatch(/^C\.\d+$/);
    expect(STAGE_LABEL).toMatch(/^S-\d+/);
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(38);
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(25);
  });
  it('꾸밈 분류 keyring·device 추가, 가격 키링 5·기기 디자인 20 (provisional)', () => {
    expect(CATEGORIES.map((c) => c.id).slice(-2)).toEqual(['keyring', 'device']);
    expect(WEAR_CATEGORIES).toEqual(expect.arrayContaining(['keyring', 'device']));
    expect(SX.cosmeticPrices).toMatchObject({ keyring: 5, device: 20 });
    expect(COSMETIC_ITEMS.filter((c) => c.category === 'keyring').map((c) => c.id)).toEqual(['keyring-charm', 'keyring-bell', 'keyring-orb']);
  });
  it('키링 표시 이름·모양은 종족 설정에서 (호로 가면 조각·뼈 방울·영옥 구슬 / 사신 지옥나비·방울·영옥 구슬)', () => {
    const names = (f: typeof H) => ['keyring-charm', 'keyring-bell', 'keyring-orb'].map((id) => cosmeticName(getCosmetic(id)!, f));
    expect(names(H)).toEqual(['가면 조각', '뼈 방울', '영옥 구슬']);
    expect(names(S)).toEqual(['지옥나비', '방울', '영옥 구슬']);
    expect(keyringShapeOf(getCosmetic('keyring-charm')!, H)).toBe('mask');
    expect(keyringShapeOf(getCosmetic('keyring-charm')!, S)).toBe('butterfly');
    expect(keyringShapeOf(getCosmetic('keyring-orb')!, S)).toBe('orb');
    for (const f of FACTIONS) for (const v of Object.values(f.cosmetics?.keyringShapes ?? {})) expect(KEYRING_SHAPES).toContain(v);
    // 모르는 모양 키는 설정 검사에서 막힌다
    const raw = JSON.parse(readFileSync('src/data/factions/hollow.json', 'utf8'));
    raw.cosmetics.keyringShapes['keyring-orb'] = 'Bad Shape';
    expect(() => parseFactionConfig(raw)).toThrow(/keyringShapes/);
  });
  it('키링 모양마다 색 토큰이 있다 (화면은 토큰만 참조)', () => {
    const css = readFileSync('src/ui/bha/design-system/tokens.css', 'utf8');
    for (const shape of KEYRING_SHAPES) for (const part of ['body', 'line']) expect(css.includes(`--bha-cos-keyring-${shape}-${part}:`), `${shape}-${part}`).toBe(true);
    expect(css.includes('--bha-cos-keyring-chain:')).toBe(true);
  });
  it('새 코드 파일에 종족 id 분기가 없고, 새 CSS 는 색을 직접 쓰지 않는다', () => {
    for (const f of ['src/ui/bha/tamago.ts', 'src/ui/bha/tamagoLogic.ts', 'src/ui/bha/tamago.css']) {
      const src = readFileSync(f, 'utf8');
      for (const fac of FACTIONS) expect(src.includes(`'${fac.id}'`), `${f}: ${fac.id}`).toBe(false);
    }
    const css = readFileSync('src/ui/bha/tamago.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css.match(/#[0-9a-f]{3,8}\b/gi)).toBeNull();
  });
});

describe('기기 디자인 그림 자리 (그림이 없으면 상점에 안 보임)', () => {
  const sample = getCosmetic('device-sample')!;
  it('데이터: 화면 구멍·고리 좌표, source', () => {
    expect(sample.category).toBe('device');
    expect(sample.source).toBe('shop');
    expect(sample.device!.screen.w).toBeGreaterThan(0);
  });
  it('그림 파일이 없으면 상점에 안 보이고 살 수 없다, 있으면 보인다', () => {
    const s = rich();
    expect(jadeRows(s, H, []).some((r) => r.id === 'device-sample')).toBe(false);
    expect(buyShopItem(s, H, 'device-sample', 1, Math.random, []).ok).toBe(false);
    const files = ['device-sample-front.png', 'device-sample-back.png'];
    expect(deviceArt(sample, files)).toEqual({ front: 'art/device-sample-front.png', back: 'art/device-sample-back.png' });
    expect(jadeRows(s, H, files).find((r) => r.id === 'device-sample')?.price).toBe(20);
    const r = buyShopItem(s, H, 'device-sample', 1, Math.random, files);
    expect(r.ok).toBe(true);
    expect(s.shared.jade).toBe(80);
  });
  it('보상 전용(source reward)은 상점에 안 나오고, 받으면(grantCosmetic) 보유·착용', () => {
    const rewardOnly = { ...sample, id: 'device-prize', source: 'reward' as const };
    expect(shopVisible(rewardOnly, [], ['device-sample-front.png'])).toBe(false);
    expect(shopVisible(rewardOnly, ['device-prize'], ['device-sample-front.png'])).toBe(true);
    const s = rich();
    expect(grantCosmetic(s, 'keyring-bell')).toBe(true);
    expect(grantCosmetic(s, 'keyring-bell')).toBe(false);
    expect(s.shared.jade).toBe(100);
    expect(s.runLog.shopPurchases).toEqual([]);
    expect(wearCosmetic(s, 'keyring-bell')).toBe(true);
    expect(s.wear.keyring).toBe('keyring-bell');
  });
  it('키링 그림: 종족 모양 파일 먼저, 다음 공용 파일, 없으면 CSS 모양', () => {
    const c = getCosmetic('keyring-charm')!;
    expect(keyringArt(c, 'mask', [])).toBeNull();
    expect(keyringArt(c, 'mask', ['keyring-charm.png'])).toBe('art/keyring-charm.png');
    expect(keyringArt(c, 'mask', ['keyring-charm.png', 'keyring-charm-mask.png'])).toBe('art/keyring-charm-mask.png');
  });
  it('그림 배치(모양 자유): 화면 구멍이 LCD 를 다 덮는 가장 작은 배율, 비율이 다르면 가운데, 버튼·고리도 기기 안 좌표로', () => {
    // 그림 1000×800, 구멍 (20%, 25%) 60%×50% = 600×400 그림 px. LCD 300×150 → 배율 max(300/600, 150/400) = 0.5
    const spec = { screen: { x: 20, y: 25, w: 60, h: 50 }, ring: { x: 50, y: 0 }, buttons: { up: { x: 0, y: 0, w: 10, h: 10 }, ok: { x: 90, y: 50, w: 10, h: 10 } } };
    const pl = deviceArtPlacement({ x: 100, y: 50, w: 300, h: 150 }, { w: 1000, h: 800 }, spec);
    expect(pl.box.w).toBe(500);
    expect(pl.box.h).toBe(400);
    // 구멍(300×200)의 가운데 = LCD 가운데 (250, 125)
    expect(pl.hole).toEqual({ x: 100, y: 25, w: 300, h: 200 });
    expect(pl.box.x).toBe(0);
    expect(pl.box.y).toBe(-75);
    expect(pl.ring).toEqual({ x: 250, y: -75 });
    expect(pl.buttons.up).toEqual({ x: 0, y: -75, w: 50, h: 40 });
    expect(pl.buttons.ok).toEqual({ x: 450, y: 125, w: 50, h: 40 });
  });
  it('기기 디자인 데이터는 버튼 4개 누름 영역이 꼭 있다', () => {
    expect(Object.keys(sample.device!.buttons).sort()).toEqual(['back', 'down', 'ok', 'up']);
  });
});

describe('키링 진자 (감쇠 2마디, DOM 없음)', () => {
  const down = { x: 0, y: 1 };
  it('충격을 받으면 흔들리다 감쇠해 쉬는 각도로 돌아온다', () => {
    const p0 = kick(restingAt(0), tapKick(5));
    const p1 = run(p0, down, 0.15);
    expect(Math.abs(p1.a1)).toBeGreaterThan(0.05);
    const p2 = run(p1, down, 8);
    expect(isResting(p2, down)).toBe(true);
    expect(Math.abs(p2.a1)).toBeLessThan(0.01);
  });
  it('흔들림은 진동한다 (부호가 바뀐다) — 감쇠 진자', () => {
    let p = kick(restingAt(0), PHYS.tap);
    const signs = new Set<number>();
    for (let i = 0; i < 180; i++) {
      p = stepPendulum(p, down, 1 / 60);
      if (Math.abs(p.a1) > 0.01) signs.add(Math.sign(p.a1));
    }
    expect(signs.size).toBe(2);
  });
  it('세로 회전 출력(16-6): 화면 아래 중력 = 기기 +x → 쉬는 각도 −90도', () => {
    expect(defaultGravity(false)).toEqual({ x: 0, y: 1 });
    expect(defaultGravity(true)).toEqual({ x: 1, y: 0 });
    expect(deg(restAngle(defaultGravity(true)))).toBeCloseTo(-90);
    const p = run(restingAt(0), defaultGravity(true), 10);
    expect(deg(p.a1)).toBeCloseTo(-90, 0);
    expect(deg(p.a2)).toBeCloseTo(-90, 0);
  });
  it('모션 줄이기: 같은 충격에도 흔들림이 작다(최대 각 제한)', () => {
    let full = kick(restingAt(0), PHYS.tap * 2);
    let small = kick(restingAt(0), PHYS.tap * 2, true);
    let maxF = 0, maxS = 0;
    for (let i = 0; i < 120; i++) {
      full = stepPendulum(full, down, 1 / 60);
      small = stepPendulum(small, down, 1 / 60, true);
      maxF = Math.max(maxF, Math.abs(full.a2));
      maxS = Math.max(maxS, Math.abs(small.a2));
    }
    expect(maxS).toBeLessThanOrEqual(PHYS.reducedMax + 1e-9);
    expect(maxF).toBeGreaterThan(maxS * 2);
  });
  it('긴 프레임(탭이 멈췄다 돌아옴)도 발산하지 않는다', () => {
    const p = stepPendulum(kick(restingAt(0), 40), down, 5);
    expect(Number.isFinite(p.a1) && Math.abs(p.w1) < 100).toBe(true);
  });
});

describe('기울기 → 중력', () => {
  it('세운 폰 = 화면 아래, 눕힌 채 오른쪽으로 기울이면 화면 오른쪽', () => {
    expect(screenGravity(90, 0)).toEqual({ x: 0, y: 1 });
    const g = screenGravity(0, 90);
    expect(g.x).toBeCloseTo(1);
    expect(g.y).toBeCloseTo(0);
  });
  it('브라우저가 화면을 돌렸으면(가로 90도) 되돌린다', () => {
    const g = screenGravity(90, 0, 90); // 폰 위쪽이 왼쪽: 폰 아래(중력) = 화면 오른쪽
    expect(g.x).toBeCloseTo(1);
    expect(g.y).toBeCloseTo(0);
  });
  it('세로 회전 출력이면 화면 방향을 기기 안 방향으로 바꾼다', () => {
    expect(toDeviceVec({ x: 0, y: 1 }, true)).toEqual({ x: 1, y: 0 });
    expect(toDeviceVec({ x: 1, y: 0 }, true)).toEqual({ x: 0, y: -1 });
    expect(toDeviceVec({ x: 0.3, y: 0.9 }, false)).toEqual({ x: 0.3, y: 0.9 });
  });
});

describe('다마고치 모드 확대·축소 (핀치·휠·끌기)', () => {
  const L = tamaLayout(844, 390);
  it('배율은 1(기기 전체) ~ 1/줌(평소 확대 화면 정도), 이동은 화면 밖으로 안 빠지게', () => {
    // C.63: 아래 끝은 실제 배율 0.40 (= minViewZoom), 줄인 동안은 이동 없음
    expect(clampView({ uz: 0.3, px: 50, py: 0 }, L.zoom, L.box, 844, 390)).toEqual({ uz: minViewZoom(L.zoom), px: 0, py: 0 });
    const big = clampView({ uz: 99, px: 9999, py: -9999 }, L.zoom, L.box, 844, 390);
    expect(big.uz).toBeCloseTo(1 / L.zoom, 3);
    expect(big.px).toBeCloseTo((L.box.w * L.zoom * big.uz - 844) / 2, 1);
    expect(big.py).toBeCloseTo(-(L.box.h * L.zoom * big.uz - 390) / 2, 1);
  });
  it('핀치: 손가락 사이 점은 제자리 (두 배로 벌리면 배율 두 배)', () => {
    const at = { x: 100, y: 40 };
    const v = zoomAt(VIEW_HOME, 1.3, at, L.zoom, L.box, 844, 390);
    expect(v.uz).toBeCloseTo(1.3);
    // 그 점의 기기 좌표가 전후로 같다: (at - pan) / (zoom·uz)
    expect((at.x - v.px) / v.uz).toBeCloseTo((at.x - 0) / 1, 1);
    expect((at.y - v.py) / v.uz).toBeCloseTo(at.y, 1);
    expect(zoomAt(v, 1 / 1.3, at, L.zoom, L.box, 844, 390)).toEqual(VIEW_HOME);
  });
  it('휠: 위로 굴리면 확대, 아래로 축소, 한 번에 너무 크게는 안 바뀐다', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(-100000)).toBeCloseTo(wheelFactor(-400));
  });
  it('확대가 무대 변환 배율·이동에 반영된다 (같은 함수 목록)', () => {
    const v = clampView({ uz: 1.2, px: 10, py: 0 }, L.zoom, L.box, 844, 390);
    const st = tamaLayout(844, 390, null, 0, v).stage;
    expect(st).toContain(`scale(${Math.round(L.zoom * 1.2 * 10000) / 10000})`);
    expect(st).toContain('translate(432px, 195px)');
    expect(st.match(/\w+\(/g)).toEqual(L.stage.match(/\w+\(/g));
  });
});

describe('줌아웃 배치·설정·기록 판', () => {
  it('몸체·고리·키링·조작 줄이 다 들어가게 줄이고(0.82 이하), 앞뒤 고리는 좌우 대칭', () => {
    const L = tamaLayout(844, 390);
    expect(L.zoom).toBeLessThanOrEqual(BODY.maxZoom);
    expect(L.zoom).toBeGreaterThan(0.5);
    expect(L.box.w * L.zoom).toBeLessThanOrEqual(844);
    expect(L.box.h * L.zoom).toBeLessThanOrEqual(390);
    expect(L.body).toEqual({ x: -BODY.pad, y: -BODY.pad, w: 844 + 2 * BODY.pad, h: 390 + 2 * BODY.pad });
    expect(L.ring.x - L.body.x).toBeCloseTo(L.body.x + L.body.w - L.ringBack.x);
    expect(L.stage).toContain('rotateY(0deg)');
    expect(tamaLayout(844, 390, null, 90).stage).toContain('rotateY(90deg)');
  });
  it('켜 둔 상태는 브라우저 저장(세이브 아님), 깨진 값·막힌 저장소는 기본', () => {
    expect(parseTamagoPrefs('{bad')).toEqual({ on: false, tilt: false });
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveTamagoPrefs(st, { on: true, tilt: false });
    expect(loadTamagoPrefs(st)).toEqual({ on: true, tilt: false });
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadTamagoPrefs(broken)).toEqual({ on: false, tilt: false });
    expect(() => saveTamagoPrefs(broken, { on: true, tilt: true })).not.toThrow();
  });
  it('기록 판: 이름·단계·플레이 시간·환생 ★·처음 시작한 날·제조 번호', () => {
    const at = new Date(2026, 9, 3, 10, 0).getTime();
    const rows = plateRows({ name: '아쥬커스', stage: '3단계', playMs: 207 * 60_000, rebirths: 2, createdAt: at });
    expect(rows.map((r) => r[0])).toEqual(['이름', '단계', '플레이 시간', '환생', '처음 시작한 날', '제조 번호']);
    expect(rows[2]![1]).toBe('3시간 27분');
    expect(rows[3]![1]).toBe('★★');
    expect(rows[4]![1]).toBe('2026-10-03');
    expect(rows[5]![1]).toMatch(/^BH-2610-[0-9A-F]{4}-[0-9A-F]{2}$/);
    expect(serialNumber(at)).toBe(serialNumber(at));
    expect(serialNumber(at)).not.toBe(serialNumber(at + 1));
    expect(playTimeText(0)).toBe('1분 미만');
    expect(playTimeText(59 * 60_000)).toBe('59분');
  });
  it('놀던 시간: 한 번에 1분 넘게는 안 센다(꺼 둔 시간·시계 되돌림 제외)', () => {
    expect(accruePlay(0, 1000, 16_000)).toBe(15_000);
    expect(accruePlay(0, 1000, 10 * 60_000)).toBe(60_000);
    expect(accruePlay(5, 9000, 1000)).toBe(5);
  });
  it('PC 단축키 B: 맥락 표·예약 키와 겹치지 않는다', () => {
    expect(TAMAGO_CODE).toBe('KeyB');
    for (const m of Object.values(SHORTCUTS)) expect(Object.keys(m)).not.toContain(TAMAGO_CODE);
    expect(RESERVED_CODES).not.toContain(TAMAGO_CODE);
    expect(findProblems()).toEqual([]);
  });
});

describe('세이브 형식 25 (기기 기록)', () => {
  it('새 세이브는 만든 시각·놀던 시간 0', () => {
    expect(newSaveData('hollow', 1234).machine).toEqual({ createdAt: 1234, playMs: 0 });
  });
  it('형식 24 → 25: 기록에 남은 가장 이른 시각이 처음 시작한 날, 놀던 시간 0, 나머지는 그대로', () => {
    const s = newSaveData('hollow', 1000) as unknown as Record<string, unknown>;
    delete s.machine;
    (s.meta as { format: number }).format = 24;
    const log = s.runLog as SaveData['runLog'];
    log.shopPurchases.push({ at: 1_790_000_000_000, factionId: 'hollow', itemId: 'calm', currency: 'gold', price: 25 });
    log.shopPurchases.push({ at: 1_780_000_000_000, factionId: 'hollow', itemId: 'calm', currency: 'gold', price: 25 });
    expect(earliestStamp(s)).toBe(1_780_000_000_000);
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION); // 25 → 26 은 c64.test.ts
    expect(m.machine).toEqual({ createdAt: 1_780_000_000_000, playMs: 0 });
    expect(m.runLog.shopPurchases).toHaveLength(2);
  });
  it('기록이 하나도 없으면 지금 시각, 깨진 값은 보정', () => {
    const s = newSaveData('shinigami', 1000) as unknown as Record<string, unknown>;
    delete s.machine;
    (s.meta as { format: number }).format = 24;
    s.lastSeenAt = 5;
    const before = Date.now();
    expect(migrateSave(JSON.parse(JSON.stringify(s)))!.machine.createdAt).toBeGreaterThanOrEqual(before);
    const bad = newSaveData('hollow', 1000) as unknown as Record<string, unknown>;
    bad.machine = { createdAt: 'x', playMs: -5 };
    const fixed = migrateSave(JSON.parse(JSON.stringify(bad)))!;
    expect(fixed.machine.playMs).toBe(0);
    expect(Number.isFinite(fixed.machine.createdAt)).toBe(true);
  });
  it('키링 착용은 트랙마다, 안 산 키링은 보정에서 벗긴다', () => {
    const s = rich();
    expect(buyShopItem(s, H, 'keyring-bell').ok).toBe(true);
    expect(s.shared.jade).toBe(95);
    wearCosmetic(s, 'keyring-bell');
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.wear.keyring).toBe('keyring-bell');
    const t = JSON.parse(JSON.stringify(s));
    t.shared.cosmetics = [];
    expect(migrateSave(t)!.wear.keyring).toBeUndefined();
  });
});
