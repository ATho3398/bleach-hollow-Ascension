// C.64 (S-18b, GDD 29장): 기본 키링 "영옥 구슬" 무료 지급·자동 착용, 뒤집기 옆면 두께 4.5배, 옆면 그림 자리
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE_VERSION } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { COSMETIC_ITEMS, FREE_COSMETICS, deviceSideArt, getCosmetic } from '../src/data/shop';
import { checkTrackOpen, loadSave, migrateSave, newSaveData, newSharedState, newTrack, performRebirth, SAVE_FORMAT_VERSION, switchTrack, writeSave } from '../src/game';
import { buyShopItem, jadeRows, unwearCategory, wearCosmetic } from '../src/shop';
import { edgeThickness, tamaLayout } from '../src/ui/bha/tamagoLogic';
import { PATCH_LABEL, STAGE_LABEL } from '../src/version';

const H = getFaction('hollow');
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('버전 (S-18b)', () => {
  it('패치 C.64 / 단계 S-18b, 세이브 형식 26, BALANCE 그대로', () => {
    expect(PATCH_LABEL).toMatch(/^C\.\d+$/); // C.65 에서 C.65 / S-18c (버전 검사는 c65.test.ts)
    expect(STAGE_LABEL).toMatch(/^S-\d+[a-z]?$/);
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(26); // C.65 에서 27 (형식 27 검사는 c65.test.ts)
    expect(BALANCE_VERSION).toBe(39);
  });
});

describe('기본 키링 영옥 구슬 (29장 1번)', () => {
  it('종족 공용 id 하나, 키링 분류, 종족 이름 설정 있음', () => {
    expect(FREE_COSMETICS.filter((c) => c.category === 'keyring').map((c) => c.id)).toEqual(['keyring-orb']); // C.65 에서 기기 디자인 하나가 더 기본 제공
    expect(getCosmetic('keyring-orb')!.category).toBe('keyring');
    expect(getFaction('hollow').cosmetics?.names?.['keyring-orb']).toBe('영옥 구슬');
    expect(getFaction('shinigami').cosmetics?.names?.['keyring-orb']).toBe('영옥 구슬');
  });
  it('새 세이브: 보유하고 입고 있다 (영옥은 그대로)', () => {
    for (const f of ['hollow', 'shinigami']) {
      const s = newSaveData(f, 1000);
      expect(s.shared.cosmetics).toContain('keyring-orb');
      expect(s.wear.keyring).toBe('keyring-orb');
      expect(s.shared.jade).toBe(0);
      expect(s.runLog.shopPurchases).toEqual([]);
    }
    expect(newSharedState().cosmetics).toEqual(['keyring-orb', 'device-badge']);
    expect(newTrack('shinigami', 5).wear).toEqual({ keyring: 'keyring-orb', device: 'device-badge' });
  });
  it('해제할 수 있고, 다시 열어도(저장 왕복) 다시 입히지 않는다', () => {
    const s = newSaveData('hollow', 1000);
    unwearCategory(s, 'keyring');
    expect(s.wear.keyring).toBeUndefined();
    const st = memStore();
    writeSave(st, s);
    expect(loadSave(st)!.wear.keyring).toBeUndefined();
    expect(wearCosmetic(loadSave(st)!, 'keyring-orb')).toBe(true); // 다시 입을 수 있다
  });
  it('상점 줄: 가짐·착용 중, 살 수 없다(돈이 있어도), 다른 키링은 그대로 팔린다', () => {
    const s = newSaveData('hollow', 1000);
    s.shared.jade = 50;
    const row = jadeRows(s, H).find((r) => r.id === 'keyring-orb')!;
    expect(row.have).toBe('가짐');
    expect(row.owned).toBe(true);
    expect(row.worn).toBe(true);
    expect(row.canBuy).toBe(false);
    expect(buyShopItem(s, H, 'keyring-orb').ok).toBe(false);
    expect(s.shared.jade).toBe(50);
    const other = jadeRows(s, H).find((r) => r.id === 'keyring-charm')!;
    expect(other.have).toBeNull();
    expect(other.canBuy).toBe(true);
    expect(buyShopItem(s, H, 'keyring-charm').ok).toBe(true);
  });
  it('다른 키링을 입으면 구슬을 벗는다 (분류당 하나), 구슬은 계속 보유', () => {
    const s = newSaveData('hollow', 1000);
    s.shared.jade = 50;
    buyShopItem(s, H, 'keyring-bell');
    wearCosmetic(s, 'keyring-bell');
    expect(s.wear.keyring).toBe('keyring-bell');
    expect(s.shared.cosmetics).toContain('keyring-orb');
  });
  it('두 번째 트랙·환생·합체 뒤에도 기본 키링이 따라온다', () => {
    const s = newSaveData('hollow', 1000);
    s.evolution.tierIndex = 4;
    checkTrackOpen(s, 2000);
    expect(s.otherTracks[0]!.wear.keyring).toBe('keyring-orb');
    expect(switchTrack(s, s.otherTracks[0]!.factionId, 3000)).toBe(true);
    expect(s.wear.keyring).toBe('keyring-orb');
    expect(typeof performRebirth).toBe('function');
  });
});

describe('세이브 형식 26 마이그레이션 (키링 없던 세이브)', () => {
  const old = () => {
    const s = JSON.parse(JSON.stringify(newSaveData('hollow', 1000)));
    s.meta.format = 25;
    s.shared.cosmetics = [];
    s.wear = {};
    return s;
  };
  it('25 → 26: 구슬 보유, 키링 없는 트랙은 한 번 자동 착용, 다른 착용·보유는 그대로', () => {
    const raw = old();
    raw.shared.cosmetics = ['bar-ink'];
    raw.wear = { bar: 'bar-ink' };
    raw.shared.jade = 7;
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBeGreaterThanOrEqual(26);
    expect(m.shared.cosmetics).toEqual(['keyring-orb', 'device-badge', 'bar-ink']);
    expect(m.wear).toEqual({ bar: 'bar-ink', keyring: 'keyring-orb', device: 'device-badge' });
    expect(m.shared.jade).toBe(7);
  });
  it('이미 다른 키링을 입은 트랙은 건드리지 않는다', () => {
    const raw = old();
    raw.shared.cosmetics = ['keyring-bell'];
    raw.wear = { keyring: 'keyring-bell' };
    const m = migrateSave(raw)!;
    expect(m.wear.keyring).toBe('keyring-bell');
    expect(m.shared.cosmetics).toEqual(['keyring-orb', 'device-badge', 'keyring-bell']);
  });
  it('쉬는 트랙도 입힌다 / 한 번뿐: 해제 뒤 저장→열기는 그대로 해제', () => {
    const s = newSaveData('hollow', 1000);
    s.evolution.tierIndex = 4;
    checkTrackOpen(s, 2000);
    const raw = JSON.parse(JSON.stringify(s));
    raw.meta.format = 25;
    raw.wear = {};
    raw.otherTracks[0].wear = {};
    raw.shared.cosmetics = [];
    const m = migrateSave(raw)!;
    expect(m.wear.keyring).toBe('keyring-orb');
    expect(m.otherTracks[0]!.wear.keyring).toBe('keyring-orb');
    unwearCategory(m, 'keyring');
    const again = migrateSave(JSON.parse(JSON.stringify(m)))!;
    expect(again.wear.keyring).toBeUndefined();
    expect(again.shared.cosmetics).toContain('keyring-orb');
  });
  it('보유 목록에서 구슬이 빠진 세이브도 열 때 보정된다 (무료 = 늘 보유)', () => {
    const s = newSaveData('hollow', 1000);
    const raw = JSON.parse(JSON.stringify(s));
    raw.shared.cosmetics = [];
    const m = migrateSave(raw)!;
    expect(m.shared.cosmetics).toContain('keyring-orb');
    expect(m.wear.keyring).toBe('keyring-orb');
  });
  it('데이터 검사: free 는 키링만', () => {
    expect(COSMETIC_ITEMS.filter((c) => c.free).every((c) => c.category === 'keyring' || c.category === 'device')).toBe(true);
  });
});

describe('뒤집기 옆면 두께 (29장 2번 → C.66 에서 가로의 25%, c66.test.ts)', () => {
  it('두께는 몸체 크기에 비례해 작은 화면에서는 줄어든다', () => {
    const L = tamaLayout(844, 390);
    expect(L.body.h).toBe(442);
    expect(edgeThickness(tamaLayout(420, 200).body)).toBeLessThan(edgeThickness(L.body));
  });
  it('CSS: 뒤집는 동안만 3D·보이고 정면(평소)에는 숨김, 색은 토큰만', () => {
    const css = src('src/ui/bha/tamago.css');
    expect(css).toContain('.bha-dev.is-tama-flipping .bha-tama__edge { visibility: visible; }');
    expect(css.slice(css.indexOf('.bha-tama__edge {'), css.indexOf('.bha-tama__edge--r'))).toContain('visibility: hidden');
    expect(css.slice(css.indexOf('/* 옆면 두께 띠'), css.indexOf('/* 뒷면'))).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});

describe('기기 옆면 그림 자리 (29장 3번)', () => {
  it('device-<id>-side.png 규칙: 있으면 경로, 없으면 null (webp 도 인식)', () => {
    const c = { look: 'sample' };
    expect(deviceSideArt(c, [])).toBeNull();
    expect(deviceSideArt(c, ['device-sample-front.png'])).toBeNull();
    expect(deviceSideArt(c, ['device-sample-side.png'])).toBe('art/device-sample-side.png');
    expect(deviceSideArt(c, ['device-sample-side.png', 'device-sample-side.webp'])).toBe('art/device-sample-side.webp');
  });
  it('시험 그림은 배포 폴더(public/art)에 없고 test-art 에만 있다', () => {
    const pub = existsSync(new URL('../public/art', import.meta.url)) ? readdirSync(new URL('../public/art', import.meta.url)) : [];
    expect(pub.filter((f) => /^device-sample/.test(f))).toEqual([]);
    expect(existsSync(new URL('../docs/captures/c64/test-art/device-sample-side.png', import.meta.url))).toBe(true);
  });
  it('화면 코드가 옆면 그림을 읽고 CSS 가 그 그림을 띠에 깐다', () => {
    expect(src('src/ui/bha/tamago.ts')).toContain('deviceSideArt');
    expect(src('src/ui/bha/tamago.css')).toContain('.bha-dev.has-side-art .bha-tama__edge::before');
  });
  it('그림 규칙 문서 10장에 옆면 규칙', () => {
    const g = src('docs/art-guide.md');
    expect(g).toContain('device-<id>-side.png');
    expect(g).toContain('10-1b');
  });
});
