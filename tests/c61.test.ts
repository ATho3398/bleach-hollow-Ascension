// C.61 (S-16b, GDD 25-11·25-12): 상점 2차 꾸밈 — 연출 5분류·컷인 띠·말풍선 팩·방 꾸미기·사진 액자(영옥 탭 8분류 추가), 사진(순수 부분)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { FACTIONS, getFaction } from '../src/data/factions';
import { CATEGORIES, COSMETIC_ITEMS, WEAR_CATEGORIES, cosmeticName, cosmeticToken, getCosmetic } from '../src/data/shop';
import { ROOM_TALK, parseFactionConfig, roomOf } from '../src/engine/faction';
import { migrateSave, newSaveData, sanitizeWear, SAVE_FORMAT_VERSION, switchTrack, type SaveData } from '../src/game';
import { buyShopItem, jadeRows, unwearCategory, wearCosmetic } from '../src/shop';
import { COSMETIC_PARTS } from '../src/ui/bha/cosmetics';
import { COSMETIC_FX_MS, REDUCED_FX_MS, fxDuration } from '../src/ui/bha/cosmeticFx';
import { PHOTO_SIZE, captionText, frameChoices, photoFileName } from '../src/ui/bha/photo';
import { PATCH_LABEL, STAGE_LABEL } from '../src/version';

const SX = BALANCE.shop;
const H = getFaction('hollow');
const S = getFaction('shinigami');
const rich = (fid = 'hollow'): SaveData => {
  const s = newSaveData(fid, 1000);
  s.shared.jade = 500;
  return s;
};
const ids = (cat: string) => COSMETIC_ITEMS.filter((c) => c.category === cat).map((c) => c.id);

describe('2차 품목 표 (25-11)', () => {
  it('분류 8개 추가, 품목 수·가격이 표와 같다', () => {
    expect(CATEGORIES.map((c) => c.id).slice(8, 16)).toEqual(['enter', 'evo', 'absorb', 'cut', 'win', 'talk', 'room', 'frame']);
    expect(ids('enter')).toEqual(['enter-rift', 'enter-burst', 'enter-shadow']);
    expect(ids('evo')).toEqual(['evo-cocoon', 'evo-pillar', 'evo-petal']);
    expect(ids('absorb')).toEqual(['absorb-shadow', 'absorb-light']);
    expect(ids('cut')).toEqual(['cut-ink', 'cut-flame', 'cut-gold']);
    expect(ids('win')).toEqual(['win-roar', 'win-light', 'win-calm']);
    expect(ids('talk')).toEqual(['talk-a', 'talk-b']);
    expect(ids('room')).toEqual(['room-dusk', 'room-bloom', 'room-night']);
    expect(ids('frame')).toEqual(['frame-bone', 'frame-ink', 'frame-gold']);
    expect(SX.cosmeticPrices).toMatchObject({ enter: 6, evo: 8, absorb: 5, cut: 6, win: 4, talk: 4, room: 10, frame: 3 });
  });
  it('새 분류마다 쓰는 색 토큰이 있다 (화면 코드는 토큰만 참조)', () => {
    const css = readFileSync('src/ui/bha/design-system/tokens.css', 'utf8');
    for (const cat of ['enter', 'evo', 'absorb', 'cut', 'win', 'talk', 'room', 'frame'] as const) {
      expect(WEAR_CATEGORIES).toContain(cat);
      for (const c of COSMETIC_ITEMS.filter((x) => x.category === cat)) for (const part of COSMETIC_PARTS[cat]) expect(css.includes(`${cosmeticToken(c, part)}:`), cosmeticToken(c, part)).toBe(true);
    }
  });
  it('BALANCE_VERSION 37 이상, 세이브 형식 24 이상 (C.61 당시 37·C.61·S-16b·24 — 이후 패치가 올린다)', () => {
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(37);
    expect(PATCH_LABEL).toMatch(/^C\.\d+$/);
    expect(STAGE_LABEL).toMatch(/^[A-Z]+-\d+[a-z]?$/); // C.69 부터 병렬 단계(B-1·Q-4·H-1)도 허용
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(24);
  });
  it('새 코드 파일에 종족 id 분기가 없다', () => {
    for (const f of ['src/ui/bha/cosmeticFx.ts', 'src/ui/bha/photo.ts', 'src/ui/photoView.ts']) {
      const src = readFileSync(f, 'utf8');
      for (const fac of FACTIONS) expect(src.includes(`'${fac.id}'`), `${f}: ${fac.id}`).toBe(false);
    }
  });
});

describe('종족 설정: 방 테마·말풍선 팩 이름과 문구', () => {
  it('두 종족의 표시 이름이 표와 같다', () => {
    const name = (f: typeof H, id: string) => cosmeticName(getCosmetic(id)!, f);
    expect(['room-dusk', 'room-bloom', 'room-night', 'talk-a', 'talk-b'].map((i) => name(H, i))).toEqual(['모래 동굴', '뼈 정원', '달빛 사막', '굶주린 짐승', '냉정한 포식자']);
    expect(['room-dusk', 'room-bloom', 'room-night', 'talk-a', 'talk-b'].map((i) => name(S, i))).toEqual(['다다미 방', '벚꽃 마당', '밤의 대원실', '열혈 신입', '무뚝뚝한 무사']);
    expect(cosmeticName(getCosmetic('aura-blue')!, H)).toBe('푸른 불꽃'); // 종족 이름이 없는 품목은 데이터 이름
  });
  it('영옥 탭 줄 이름이 그 종족의 이름이다', () => {
    expect(jadeRows(rich('shinigami'), S).find((r) => r.id === 'room-bloom')!.name).toBe('벚꽃 마당');
    expect(jadeRows(rich(), H).find((r) => r.id === 'room-bloom')!.name).toBe('뼈 정원');
  });
  const CARE_TALK: readonly (typeof ROOM_TALK)[number][] = ['askPet', 'askSleep', 'refusePet', 'refuseSleep', 'collapsed', 'bondShy', 'bondClose', 'bondBest', 'spit']; // C.181 먹이 뱉음도. C.175 쓰러짐·교감 대사도 팩이 덮지 않는다
  it('말풍선 팩은 기존 혼잣말 키를 같은 수로 덮고, 팩이 없으면 기본 문구', () => {
    for (const f of [H, S]) {
      const base = roomOf(f);
      for (const pack of ['talk-a', 'talk-b']) {
        const r = roomOf(f, pack);
        // 기존 혼잣말 키만 (C.133 GDD 82장 돌봄 요청·거절 키는 팩이 덮지 않고 기본 문구)
        for (const k of ROOM_TALK.filter((x) => !CARE_TALK.includes(x))) {
          expect(r.talk[k].length, `${f.id} ${pack} ${k}`).toBe(base.talk[k].length);
          expect(r.talk[k]).not.toEqual(base.talk[k]);
        }
        for (const k of CARE_TALK) expect(r.talk[k]).toEqual(base.talk[k]);
      }
      expect(roomOf(f, null).talk).toEqual(base.talk);
      expect(roomOf(f, 'talk-z').talk).toEqual(base.talk);
    }
  });
  it('팩에 없는 키는 기본 문구 (일부 키만 덮는 팩)', () => {
    const f = parseFactionConfig({ ...JSON.parse(readFileSync('src/data/factions/hollow.json', 'utf8')), cosmetics: { talkPacks: { 'talk-a': { idle: ['끼익'] } } } });
    const r = roomOf(f, 'talk-a');
    expect(r.talk.idle).toEqual(['끼익']);
    expect(r.talk.tired).toEqual(roomOf(f).talk.tired);
  });
  it('모르는 혼잣말 키나 빈 문구가 있는 팩은 설정 검증이 거부한다', () => {
    const raw = JSON.parse(readFileSync('src/data/factions/hollow.json', 'utf8'));
    expect(() => parseFactionConfig({ ...raw, cosmetics: { talkPacks: { 'talk-a': { nope: ['x'] } } } })).toThrow(/cosmetics\.talkPacks/);
    expect(() => parseFactionConfig({ ...raw, cosmetics: { names: { 'room-dusk': '' } } })).toThrow(/cosmetics\.names/);
  });
});

describe('구매·착용 (슬롯 공유, 착용 트랙별, 분류당 1개)', () => {
  it('새 분류도 사고, 분류당 하나만 입고, 해제할 수 있다', () => {
    const s = rich();
    expect(buyShopItem(s, H, 'enter-rift').ok).toBe(true);
    expect(buyShopItem(s, H, 'enter-burst').ok).toBe(true);
    expect(s.shared.jade).toBe(500 - 12);
    expect(wearCosmetic(s, 'enter-rift')).toBe(true);
    expect(wearCosmetic(s, 'enter-burst')).toBe(true);
    expect(s.wear.enter).toBe('enter-burst');
    unwearCategory(s, 'enter');
    expect(s.wear.enter).toBeUndefined();
    expect(wearCosmetic(s, 'room-night')).toBe(false); // 안 산 것은 못 입는다
  });
  it('가격과 모자람 문구', () => {
    const s = rich();
    s.shared.jade = 9;
    expect(buyShopItem(s, H, 'room-dusk')).toEqual({ ok: false, reason: '영옥 1 부족' });
    expect(buyShopItem(s, H, 'evo-cocoon').ok).toBe(true);
    expect(s.shared.jade).toBe(1);
  });
  it('보유는 두 트랙이 같이, 착용은 트랙마다 따로', () => {
    const s = rich();
    s.shared.jade = 500;
    expect(buyShopItem(s, H, 'talk-a').ok).toBe(true);
    expect(wearCosmetic(s, 'talk-a')).toBe(true);
    const other = newSaveData('shinigami', 2000);
    other.shared = s.shared;
    expect(wearCosmetic(other, 'talk-a')).toBe(true);
    expect(other.wear.talk).toBe('talk-a');
    unwearCategory(other, 'talk');
    expect(s.wear.talk).toBe('talk-a');
    expect(switchTrack).toBeTypeOf('function');
  });
  it('저장 보정: 새 분류의 안 산·분류가 다른 착용은 벗기고, 산 것은 남긴다', () => {
    expect(sanitizeWear({ win: 'win-roar', frame: 'frame-gold', talk: 'room-dusk' }, ['win-roar'])).toEqual({ win: 'win-roar' });
  });
  it('형식 24 세이브가 그대로 열린다 (새 착용 키 없음 = 기본)', () => {
    const s = rich();
    s.shared.cosmetics.push('cut-gold');
    s.wear.cut = 'cut-gold';
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.wear.cut).toBe('cut-gold');
    expect(m.wear.enter).toBeUndefined();
  });
});

describe('연출 길이 · 모션 줄이기', () => {
  it('등장 1초, 모션 줄이기면 모두 짧은 페이드', () => {
    expect(COSMETIC_FX_MS.enter).toBe(1000);
    for (const k of ['enter', 'evo', 'absorb', 'win'] as const) {
      expect(fxDuration(k, false)).toBe(COSMETIC_FX_MS[k]);
      expect(fxDuration(k, true)).toBe(REDUCED_FX_MS);
      expect(REDUCED_FX_MS).toBeLessThan(COSMETIC_FX_MS[k]);
    }
  });
});

describe('사진 (순수 부분)', () => {
  it('파일 이름은 bha-<종족>-<날짜>.png', () => {
    expect(photoFileName('hollow', new Date(2026, 9, 20))).toBe('bha-hollow-2026-10-20.png');
    expect(photoFileName('shinigami', new Date(2027, 0, 3))).toBe('bha-shinigami-2027-01-03.png');
  });
  it('아래 한 줄은 이름 · 단계 · 날짜', () => {
    expect(captionText('아쥬커스', '5단계', new Date(2026, 9, 20))).toBe('아쥬커스 · 5단계 · 2026-10-20');
  });
  it('액자 고르기: 기본(무료) + 산 것', () => {
    expect(frameChoices([]).map((f) => f.id)).toEqual([null]);
    expect(frameChoices(['frame-gold', 'aura-blue', 'frame-bone']).map((f) => f.id)).toEqual([null, 'frame-bone', 'frame-gold']);
    expect(PHOTO_SIZE.w).toBeGreaterThan(PHOTO_SIZE.h * 0.8);
  });
});
