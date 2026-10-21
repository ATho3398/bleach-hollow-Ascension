import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { defaultWear, migrateSave, newSaveData, newTrack, SAVE_FORMAT_VERSION } from '../src/game';
import { wearCosmetic } from '../src/shop';

const hollow = FACTIONS.find((f) => f.id === 'hollow')!;

describe('C.112 호로 말투 (GDD 56 4번, 사용자 확정 "오만한 강자")', () => {
  it('room.talk 가 확정 문구이고 "귀여운" 옛 말투가 없다', () => {
    const t = hollow.room.talk!;
    expect(t.idle).toEqual(['하, 시시하군.', '여긴 너무 조용하다.', '더 강한 놈은 없나?']);
    expect(t.tired).toEqual(['…잠깐 눈을 붙이겠다.', '귀찮군. 쉬겠다.']);
    expect(t.risk).toEqual(['가면이 들끓는다… 건드리지 마라.', '안에서 뭔가 날뛰는군.']);
    expect(t.weak).toEqual(['이 정도 상처쯤… 금방 낫는다.']);
    expect(t.happy).toEqual(['이 정도면 쓸 만하다.', '흥, 나쁘지 않군.']);
    expect(t.hungry).toEqual(['오래도 비웠군. 배가 텅 비었다.', '날 굶기다니, 배짱 좋군.']);
    const all = Object.values(t).flat().join(' ');
    expect(all).not.toMatch(/크르릉|기분이 좋다|으르르/);
  });
});

describe('C.112 기본 기기 = 기본형 (GDD 56 3번)', () => {
  it('새 세이브·새 트랙(다른 종족)은 기기 디자인을 입지 않는다 — 기본 제공 디자인은 보유만', () => {
    expect(defaultWear().device).toBeUndefined();
    const s = newSaveData('hollow');
    expect(s.wear.device).toBeUndefined();
    expect(newTrack('shinigami', 5).wear.device).toBeUndefined();
    expect(s.shared.cosmetics).toEqual(expect.arrayContaining(['device-badge', 'device-zaraki']));
    expect(wearCosmetic(s, 'device-badge')).toBe(true); // [디자인]에서 고르면 입을 수 있다
  });
  it('형식 36: 옛 기본값(사신대행증)은 벗기고, 다른 디자인을 고른 트랙은 그대로', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(36);
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 0)));
    old.meta.format = 35;
    old.wear = { keyring: 'keyring-orb', device: 'device-badge' };
    expect(migrateSave(old)!.wear.device).toBeUndefined();
    const z = JSON.parse(JSON.stringify(newSaveData('hollow', 0)));
    z.meta.format = 35;
    z.wear = { keyring: 'keyring-orb', device: 'device-zaraki' };
    expect(migrateSave(z)!.wear.device).toBe('device-zaraki');
  });
});
