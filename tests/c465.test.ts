// C.465 (GDD v6.094 12-4): 초월자 전투 방식 = 스킨 잠금 · 혈쇄 이치고(천년혈전 모드 모델) · 무월/혈쇄 종이인형 게임 뼈대 · 해방 몸 재생기 전환.
import './helpers/rigMotions'; // 종이인형 동작 데이터 채우기 (C.509 — 게임에선 따로 받는 덩어리)
import { describe, expect, it } from 'vitest';
import { BASE_MODEL, fitSkinToLock, modeModelIds, skinAllowedNow, skinLockOf, skinLockReason } from '../src/engine/skinLock';
import { testGrantTranscendent } from '../src/engine/testMode';
import { tryGetTranscendent } from '../src/data/transcendents';
import { charArt, layeredArt, transcendentSkinHasArt } from '../src/data/art/manifest';
import { rigPack, rigPackOfLook, validateRig } from '../src/data/art/rig/pose';
import { RIG_FX } from '../src/ui/bha/rigEffects';
import { switchAnim, type AnimPlayer } from '../src/ui/bha/animPlayer';
import { characterSkinEntries } from '../src/data/skins/lookOptions';
import mugetsuFlame from '../src/data/art/rig/mugetsu-flame.json';
import ichigoChain from '../src/data/art/rig/ichigo-chain.json';
import { equipSkin, migrateSave, newSaveData, SAVE_FORMAT_VERSION, switchCombatBasis, switchKitMode, type SaveData } from '../src/game';
import { wearCosmetic, unwearCategory } from '../src/shop';

const BLOOD = 'trskin:ichigo:bloodchain';
function ichigoSave(): SaveData {
  const s = newSaveData('shinigami', 1000);
  expect(testGrantTranscendent(s, 'ichigo', 2000)).toBe('added');
  return s;
}
function riftSave(): SaveData {
  const s = newSaveData('hollow', 1000);
  expect(testGrantTranscendent(s, 'rift-wanderer', 2000)).toBe('added');
  return s;
}

describe('C.465 초월자 전투 방식 = 스킨 잠금 (GDD 12-4 v6.093)', () => {
  it('데이터: 이치고 모드마다 모델 묶음(기본 = base, 천년혈전 = 혈쇄), 모드 없는 초월자 = 기본 + 인간형 스킨 전부', () => {
    const ichigo = tryGetTranscendent('ichigo')!;
    expect(ichigo.humanSkins?.map((x) => x.id)).toEqual(['bloodchain']);
    expect(modeModelIds(ichigo, 'basic')).toEqual([BASE_MODEL]);
    expect(modeModelIds(ichigo, 'tybw')).toEqual(['bloodchain']);
    expect(modeModelIds(ichigo, 'nope')).toEqual([BASE_MODEL]); // 모르는 모드 = 첫 모드
    expect(modeModelIds(tryGetTranscendent('rift-wanderer')!)).toEqual([BASE_MODEL, 'debug']);
    expect(modeModelIds(tryGetTranscendent('aizen')!)).toEqual([BASE_MODEL]);
  });

  it('잠금 범위: 캐릭터 트랙·키웠던 캐릭터 기반 = 없음, 초월자 기반 = 그 초월자·그 모드 모델만', () => {
    expect(skinLockOf(newSaveData('hollow', 1000))).toBeNull();
    const r = riftSave();
    expect(skinLockOf(r)!.looks).toEqual([null, 'transcendent:rift-wanderer', 'trskin:rift-wanderer:debug']);
    expect(skinLockReason(skinLockOf(r)!)).toBe('초월자 전투 중엔 Unknown;03398 모델만');
    const i = ichigoSave();
    expect(skinLockOf(i)!.looks).toEqual([null]);
    expect(skinLockReason(skinLockOf(i)!)).toBe('초월자 전투 중엔 이치고(기본) 모델만');
    const raised = Object.keys(r.evolution.basis!.builds).find((k) => k !== 'transcendent')!;
    expect(switchCombatBasis(r, raised, 3000).ok).toBe(true);
    expect(skinLockOf(r)).toBeNull();
    expect(skinAllowedNow(r, 'tier:1')).toBe(true);
  });

  it('입기: 묶음 안만 (가방 테스트 모드도), 묶음 밖은 false 그대로', () => {
    const r = riftSave();
    expect(equipSkin(r, 'trskin:rift-wanderer:debug', { test: true })).toBe(true);
    expect(r.skin).toBe('trskin:rift-wanderer:debug');
    expect(equipSkin(r, 'tier:1', { test: true })).toBe(false);
    expect(equipSkin(r, 'transcendent:aizen', { test: true })).toBe(false);
    expect(r.skin).toBe('trskin:rift-wanderer:debug');
    expect(equipSkin(r, null)).toBe(true); // 기본 모델은 묶음 안
    expect(r.skin).toBeNull();
  });

  it('전투 모드를 바꾸면 그 모드의 첫 모델로 자동 교체 (천년혈전 = 혈쇄, 기본 = 기본 모델), 혈쇄는 벗을 수 없다', () => {
    const s = ichigoSave();
    expect(s.skin).toBeNull();
    expect(switchKitMode(s, 'tybw')).toEqual({ ok: true, changed: true });
    expect(s.skin).toBe(BLOOD);
    expect(equipSkin(s, null)).toBe(false);
    unwearCategory(s, 'skin');
    expect(s.skin).toBe(BLOOD);
    expect(switchKitMode(s, 'basic')).toEqual({ ok: true, changed: true });
    expect(s.skin).toBeNull();
    expect(equipSkin(s, BLOOD, { test: true })).toBe(false); // 기본 모드엔 혈쇄 잠김
  });

  it('기반을 초월자로 바꾸면 묶음 밖 스킨 → 묶음 첫 모델, 키웠던 캐릭터 기반에선 모든 스킨', () => {
    const s = ichigoSave();
    const raised = Object.keys(s.evolution.basis!.builds).find((k) => k !== 'transcendent')!;
    switchKitMode(s, 'tybw');
    expect(switchCombatBasis(s, raised, 3000).ok).toBe(true);
    expect(equipSkin(s, 'tier:1', { test: true })).toBe(true);
    expect(switchCombatBasis(s, 'transcendent', 4000).ok).toBe(true);
    expect(s.skin).toBe(BLOOD);
    // 묶음 안이면 그대로
    const r = riftSave();
    equipSkin(r, 'trskin:rift-wanderer:debug', { test: true });
    const rr = Object.keys(r.evolution.basis!.builds).find((k) => k !== 'transcendent')!;
    switchCombatBasis(r, rr, 3000);
    switchCombatBasis(r, 'transcendent', 4000);
    expect(r.skin).toBe('trskin:rift-wanderer:debug');
    expect(fitSkinToLock(r)).toBe(false);
  });

  it('상점 입기(wearCosmetic)도 잠금을 따른다', () => {
    const r = riftSave();
    expect(wearCosmetic(r, 'nope')).toBe(false);
    expect(skinAllowedNow(r, 'brute')).toBe(false);
  });

  it('세이브 형식 90: 89 → 90 마이그레이션 = 묶음 밖 스킨이면 첫 모델, 안이면 그대로, 키웠던 기반은 손대지 않음', () => {
    expect(SAVE_FORMAT_VERSION).toBe(95);
    const s = ichigoSave();
    switchKitMode(s, 'tybw');
    const raw = JSON.parse(JSON.stringify(s));
    raw.skin = null; // 옛 세이브: 천년혈전인데 기본 모델
    raw.meta.format = 89;
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBe(95);
    expect(m.skin).toBe(BLOOD);
    const r = riftSave();
    const raw2 = JSON.parse(JSON.stringify(r));
    raw2.skin = 'tier:1';
    raw2.meta.format = 89;
    expect(migrateSave(raw2)!.skin).toBeNull();
    const raw3 = JSON.parse(JSON.stringify(r));
    raw3.skin = 'trskin:rift-wanderer:debug';
    raw3.meta.format = 89;
    expect(migrateSave(raw3)!.skin).toBe('trskin:rift-wanderer:debug');
    const raised = Object.keys(r.evolution.basis!.builds).find((k) => k !== 'transcendent')!;
    switchCombatBasis(r, raised, 3000);
    const raw4 = JSON.parse(JSON.stringify(r));
    raw4.skin = 'tier:1';
    raw4.meta.format = 89;
    expect(migrateSave(raw4)!.skin).toBe('tier:1');
  });

  it('가방 스킨 목록: 혈쇄 칸이 초월자 중분류에 나온다 (이치고를 얻었으면)', () => {
    const e = characterSkinEntries('shinigami', { test: false, owned: [], dex: ['ichigo'] });
    const blood = e.find((x) => x.key === BLOOD)!;
    expect(blood.name).toBe('혈쇄');
    expect(blood.waiting).toBeUndefined();
  });
});

describe('C.465 혈쇄 이치고·무월 종이인형 (종이인형 작업본 → 게임)', () => {
  it('게임 뼈대 ichigo·mugetsu: 검사 통과, 게임 그림 칸 = 정사각 144', () => {
    for (const id of ['ichigo', 'mugetsu']) {
      const p = rigPack(id);
      expect(p.id).toBe(id);
      expect(validateRig(p.rig, p.motions, p.sets)).toEqual([]);
      expect(p.rig.view!.rect.slice(2)).toEqual([144, 144]);
    }
    expect(rigPackOfLook('ichigo-bloody')!.id).toBe('ichigo');
    expect(rigPackOfLook('ichigo-mugetsu')!.id).toBe('mugetsu');
    // 무월 동작: 대기·걷기·공격1·2·특수·맞음·빈사·쓰러짐(끝 자세 유지) — 걷기 때만 걷기용 왼발
    const m = rigPack('mugetsu').motions;
    expect(Object.keys(m).sort()).toEqual(['attack', 'attack2', 'down', 'downIdle', 'dying', 'hit', 'idle', 'move', 'skill']); // C.473 쓰러짐 숨
    expect(m.down!.hold).toBe(true);
    expect(m.move!.hide).toEqual(['foot_b']);
    expect(m.idle!.hide).toEqual(['foot_b_walk']);
  });

  it('그림: 혈쇄 = 인간형 스킨 그림 키의 종이인형, 무월 해방 몸 = 종이인형(옛 PNG 레이어 아님)', () => {
    const a = charArt('shinigami', 0, '', '/', undefined, undefined, BLOOD);
    expect(a.rig).toEqual({ look: 'ichigo-bloody', partBase: '/art/rig/ichigo/', rigId: 'ichigo' });
    expect(a.src).toBe('/art/rig/ichigo/still/ichigo-bloody.png');
    expect(transcendentSkinHasArt(BLOOD)).toBe(true);
    const mu = layeredArt('char.transcendent-ichigo-mugetsu')!;
    expect(mu.rig?.look).toBe('ichigo-mugetsu');
    expect(mu.layers).toBeUndefined();
    expect(mu.fieldScale).toBe(1.26);
  });

  it('이펙트 층: 무월 불꽃·혈쇄 사슬이 그 외형에 붙는다 (작업본 2026-11-17 값)', () => {
    expect(Object.keys(RIG_FX).sort()).toEqual(['ichigo-bloody', 'ichigo-mugetsu']);
    expect(mugetsuFlame.look).toBe('ichigo-mugetsu');
    expect(ichigoChain.look).toBe('ichigo-bloody');
    expect(ichigoChain.bands.map((b) => b.name)).toEqual(['목', '칼 든 손목', '뒷손 손목', '왼발목', '오른발목']);
    expect(ichigoChain.bands[0]!.z).toBe('coat_front'); // 편집기 고정 115-A 160 → 162(C.469): 목 사슬 띠 = 코트 앞자락 바로 앞
  });

  it('해방 몸 재생기 전환(switchAnim): 해방 중엔 바꿔 입은 몸이 동작을 받고, 쉬는 동작은 둘 다', () => {
    const log: string[] = [];
    const fake = (name: string, has: boolean): AnimPlayer => ({
      has: () => has, clip: () => undefined, setLoop: (a) => log.push(`${name}:loop:${a}`),
      play: (a) => { log.push(`${name}:play:${a}`); return has ? { durationMs: 100, hitAtMs: 50 } : null; },
      peek: () => (has ? { durationMs: 100, hitAtMs: 50 } : null), stop: () => log.push(`${name}:stop`), setRate: () => {}, setPaused: () => {}, advance: () => {},
      playing: null, active: false,
    });
    let on = false;
    const p = switchAnim(fake('base', false), fake('alt', true), () => on);
    expect(p.has('attack')).toBe(false);
    expect(p.play('attack')).toBeNull();
    on = true;
    expect(p.has('attack')).toBe(true);
    expect(p.play('attack')).toEqual({ durationMs: 100, hitAtMs: 50 });
    p.setLoop('idle');
    expect(log).toEqual(['base:play:attack', 'alt:play:attack', 'base:loop:idle', 'alt:loop:idle']);
  });
});
