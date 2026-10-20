// C.65 (S-18c, GDD 30장): 첫 기기 디자인 사신대행증 — 기본 제공·자동 착용, [디자인] 목록, 겹 두께
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE_VERSION } from '../src/config/balance';
import { COSMETIC_ITEMS, DEVICE_BUTTONS, FREE_COSMETICS, deviceArt, deviceSideArt, getCosmetic, shopVisible, sourceNote } from '../src/data/shop';
import { loadSave, migrateSave, newSaveData, newSharedState, newTrack, SAVE_FORMAT_VERSION, switchTrack, writeSave, checkTrackOpen } from '../src/game';
import { ownedDeviceDesigns, unwearCategory, wearCosmetic } from '../src/shop';
import { SIDE_BANDS, deviceArtPlacement } from '../src/ui/bha/tamagoLogic';
import { PATCH_LABEL, STAGE_LABEL } from '../src/version';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ART = ['device-badge-front.png', 'device-badge-back.png'];
const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('버전 (S-18c)', () => {
  it('단계 S-18c, 세이브 형식 27, BALANCE 그대로', () => {
    expect(PATCH_LABEL).toMatch(/^C\.\d+$/); // C.66 에서 C.66 (버전 검사는 c66.test.ts)
    expect(STAGE_LABEL).toMatch(/^[A-Z]+-\d+[a-z]?$/); // C.69 에서 B-1 (병렬 단계)
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(27); // C.72 에서 28 (저장 압축)
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(39);
  });
});

describe('사신대행증 데이터 (30장 1번)', () => {
  const c = getCosmetic('device-badge')!;
  it('공용 이름 "사신대행증", 기본 제공, 기기 분류', () => {
    expect(c.category).toBe('device');
    expect(c.name).toBe('사신대행증');
    expect(c.source).toBe('default');
    expect(c.free).toBe(true);
    expect(sourceNote(c)).toBe('기본 제공');
    expect(FREE_COSMETICS.map((x) => x.id)).toContain('device-badge');
  });
  it('좌표 = frame-v1 고정값(2744×2294 px) + 고리 (1373, 131)', () => {
    const W = 2744, H = 2294;
    const px = (r: { x: number; y: number; w: number; h: number }) => ({ x: (r.x / 100) * W, y: (r.y / 100) * H, w: (r.w / 100) * W, h: (r.h / 100) * H });
    const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(2.5);
    const d = c.device!;
    const sc = px(d.screen);
    [sc.x, sc.y, sc.w, sc.h].forEach((v, i) => near(v, [663, 818, 1410, 705][i]!)); // 그림의 실제 구멍 (새 규칙 v5.48 과 다름 — c71 테스트)
    const want: Record<string, [number, number, number]> = { up: [428, 1048, 208], down: [428, 1292, 208], ok: [2280, 1042, 268], back: [2280, 1298, 172] };
    for (const b of DEVICE_BUTTONS) {
      const r = px(d.buttons[b]);
      const [cx, cy, dia] = want[b]!;
      near(r.x + r.w / 2, cx); near(r.y + r.h / 2, cy); near(r.w, dia); near(r.h, dia);
    }
    near((d.ring.x / 100) * W, 1373);
    near((d.ring.y / 100) * H, 131);
  });
  it('그림 파일: 앞면·뒷면이 public/art 에 있고 옆면은 없다(겹 두께)', () => {
    for (const f of ART) expect(existsSync(new URL(`../public/art/${f}`, import.meta.url))).toBe(true);
    expect(deviceArt(c, ART)).toEqual({ front: 'art/device-badge-front.png', back: 'art/device-badge-back.png' });
    expect(deviceSideArt(c, ART)).toBeNull();
  });
  it('상점에는 안 나온다', () => {
    expect(shopVisible(c, [], ART)).toBe(false);
    expect(shopVisible(c, ['device-badge'], ART)).toBe(false);
  });
  it('화면 구멍 가운데에 LCD 가 놓이고 버튼 누름 영역이 그림 안에 있다', () => {
    const lcd = { x: 100, y: 50, w: 600, h: 300 };
    const p = deviceArtPlacement(lcd, { w: 2744, h: 2294 }, c.device!);
    expect(Math.abs(p.hole.x + p.hole.w / 2 - (lcd.x + lcd.w / 2))).toBeLessThan(1);
    expect(Math.abs(p.hole.y + p.hole.h / 2 - (lcd.y + lcd.h / 2))).toBeLessThan(1);
    expect(p.hole.w).toBeGreaterThanOrEqual(lcd.w - 1);
    for (const b of DEVICE_BUTTONS) {
      expect(p.buttons[b].x).toBeGreaterThanOrEqual(p.box.x);
      expect(p.buttons[b].x + p.buttons[b].w).toBeLessThanOrEqual(p.box.x + p.box.w + 0.01);
    }
  });
});

describe('기본 제공·자동 착용 (30장 2번)', () => {
  it('새 세이브: 보유 + 착용, 두 번째 트랙도', () => {
    const s = newSaveData('hollow');
    expect(s.shared.cosmetics).toContain('device-badge');
    expect(s.wear.device).toBe('device-badge');
    expect(newTrack('shinigami', 5).wear.device).toBe('device-badge');
    expect(newSharedState().cosmetics).toContain('device-badge');
  });
  it('[기본형]으로 바꾸고 저장·다시 열어도 그대로, 다시 입을 수 있다', () => {
    const s = newSaveData('hollow');
    unwearCategory(s, 'device');
    const st = memStore();
    writeSave(st, s);
    const re = loadSave(st)!;
    expect(re.wear.device).toBeUndefined();
    expect(re.shared.cosmetics).toContain('device-badge');
    expect(wearCosmetic(re, 'device-badge')).toBe(true);
    expect(re.wear.device).toBe('device-badge');
  });
  it('기본형 선택은 트랙별: 한 트랙만 바꿔도 다른 트랙은 그대로', () => {
    const s = newSaveData('hollow');
    s.evolution.tierIndex = 4;
    checkTrackOpen(s);
    expect(s.otherTracks.length).toBe(1);
    unwearCategory(s, 'device');
    const other = s.otherTracks[0]!.factionId;
    switchTrack(s, other);
    expect(s.wear.device).toBe('device-badge');
  });
  it('형식 26 → 27: 보유로 주고, 기기를 안 입은 트랙(쉬는 트랙 포함)은 한 번 입힌다. 키링 해제는 그대로', () => {
    const old = () => {
      const s = newSaveData('hollow') as unknown as Record<string, any>;
      s.meta.format = 26;
      s.shared.cosmetics = ['keyring-orb', 'bar-ink'];
      s.wear = { bar: 'bar-ink' }; // 키링 해제한 세이브
      s.otherTracks = [];
      return s;
    };
    const m = migrateSave(old())!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION); // 27 단계를 지나 현재 형식까지 (C.72)
    expect(m.shared.cosmetics).toEqual(['keyring-orb', 'device-badge', 'bar-ink']);
    expect(m.wear).toEqual({ bar: 'bar-ink', device: 'device-badge' });
    expect(m.wear.keyring).toBeUndefined();
  });
  it('형식 26: 이미 다른 기기를 입은 트랙은 건드리지 않는다', () => {
    const s = newSaveData('hollow') as unknown as Record<string, any>;
    s.meta.format = 26;
    s.wear = { keyring: 'keyring-orb', device: 'device-sample' };
    s.shared.cosmetics = ['keyring-orb', 'device-sample'];
    const m = migrateSave(s)!;
    expect(m.wear.device).toBe('device-sample');
  });
  it('형식 25 → 27 한 번에: 키링과 기기 둘 다 입는다', () => {
    const s = newSaveData('hollow') as unknown as Record<string, any>;
    s.meta.format = 25;
    s.wear = {};
    s.shared.cosmetics = [];
    const m = migrateSave(s)!;
    expect(m.wear).toEqual({ keyring: 'keyring-orb', device: 'device-badge' });
  });
  it('이미 27 인 세이브의 [기본형]은 다시 열어도 입히지 않는다', () => {
    const s = newSaveData('hollow');
    unwearCategory(s, 'device');
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.wear.device).toBeUndefined();
  });
});

describe('[디자인] 목록 (30장 3번)', () => {
  it('보유하고 그림이 있는 기기 디자인만 (그림 없는 견본은 안 나옴)', () => {
    const s = newSaveData('hollow');
    expect(ownedDeviceDesigns(s, ART).map((c) => c.id)).toEqual(['device-badge']);
    expect(ownedDeviceDesigns(s, []).map((c) => c.id)).toEqual([]);
    s.shared.cosmetics.push('device-sample');
    expect(ownedDeviceDesigns(s, ART).map((c) => c.id)).toEqual(['device-badge']); // 견본은 그림이 없다
  });
  it('안 가진 디자인은 입을 수 없다', () => {
    const s = newSaveData('hollow');
    expect(wearCosmetic(s, 'device-sample')).toBe(false);
  });
  it('버튼이 있고 화면이 고른 값을 저장한다 (정적 검사)', () => {
    const t = src('src/ui/bha/tamago.ts');
    expect(t).toContain("label: '디자인'");
    expect(t).toContain("dataset.tama = 'design'");
    expect(t).toContain("unwearCategory(s, 'device')");
    expect(t).toContain('hooks.persist');
    expect(src('src/ui/app.ts')).toContain('initTamago(dev, { persist');
  });
  it('모든 기기 디자인 품목에 얻는 조건 말이 있다', () => {
    for (const c of COSMETIC_ITEMS.filter((x) => x.category === 'device')) expect(sourceNote(c).length).toBeGreaterThan(0);
  });
});

describe('옆면 두께 (30장 4번 → C.71 31장 1: 겹 대신 실루엣 띠)', () => {
  it('띠 수는 12~48 (작은 단색 면, 큰 그림 겹 없음)', () => {
    expect(SIDE_BANDS).toBeGreaterThanOrEqual(12);
    expect(SIDE_BANDS).toBeLessThanOrEqual(48);
  });
  it('옆면 그림이 있으면 띠는 숨고, 모양 없는 CSS 기기 띠는 그림 기기에서 숨는다 (CSS 검사)', () => {
    const css = src('src/ui/bha/tamago.css');
    expect(css).toContain('.bha-dev.has-side-art .bha-tama__cap, .bha-dev.has-side-art .bha-tama__band { display: none; }');
    expect(css).toContain('.bha-dev.has-tama-art:not(.has-side-art) .bha-tama__edge { display: none; }');
  });
  it('기본형 CSS 기기는 지금 방식 유지: CSS 띠 코드가 남아 있다', () => {
    expect(src('src/ui/bha/tamago.css')).toContain('.bha-tama__edge--l');
  });
});
