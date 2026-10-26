import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FORM_TABLE, tryGetForm } from '../src/data/evolution';
import { FACTIONS } from '../src/data/factions';
import { getSkin } from '../src/data/skins';
import { COSMETIC_ITEMS, shopVisible } from '../src/data/shop';
import { pickFormLook, pickLook } from '../src/engine/evolution/tierLook';
import { parseFactionConfig } from '../src/engine/faction';
import { setForm } from '../src/engine/testMode';
import { artSkinOf, migrateSave, newSaveData, performEvolution, SAVE_FORMAT_VERSION } from '../src/game';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const hollow = FACTIONS.find((f) => f.id === 'hollow')!;
const shin = FACTIONS.find((f) => f.id !== 'hollow')!;
const fl = hollow.formLooks!;

describe('C.110 아란칼(5단계) 외형 표 (GDD 54)', () => {
  it('5단계 진화체 전부(일반 24 + 히든 4)에 외형이 있고, 모두 그림이 있는 시작 전용 단계 외형 스킨', () => {
    const t5 = FORM_TABLE.filter((f) => f.tier === 5).map((f) => f.id);
    expect(t5.length).toBe(28);
    for (const id of t5) {
      expect(fl[id], id).toBeTruthy();
      for (const l of fl[id]!) {
        expect(getSkin(l), l).toMatchObject({ factionId: 'hollow', startOnly: true, tierLook: true });
        expect(existsSync(`public/art/skin-${l}.png`), l).toBe(true);
      }
    }
    expect(Object.keys(fl).sort()).toEqual([...t5].sort());
  });
  it('사용자 확정 표: 물 특수 = 1·2(a·b), 물 물리 = 4(d), 뇌 특수 = 2·4(b·d), 나머지는 물리 1·4, 특수 2, 혼합 3, 히든 1~4', () => {
    expect(fl['t5:water:special']).toEqual(['arrwatera', 'arrwaterb']);
    expect(fl['t5:water:physical']).toEqual(['arrwaterd']);
    expect(fl['t5:water:mixed']).toEqual(['arrwaterc']);
    expect(fl['t5:thunder:special']).toEqual(['arrthunderb', 'arrthunderd']);
    expect(fl['t5:thunder:physical']).toEqual(['arrthundera']);
    for (const e of ['normal', 'fire', 'earth', 'blood', 'poison', 'kyo']) {
      expect(fl[`t5:${e}:physical`]).toEqual([`arr${e}a`, `arr${e}d`]);
      expect(fl[`t5:${e}:special`]).toEqual([`arr${e}b`]);
      expect(fl[`t5:${e}:mixed`]).toEqual([`arr${e}c`]);
    }
    expect(['limit', 'restraint', 'hunter', 'reborn'].map((k) => fl[`h5:${k}`])).toEqual([['arrhiddena'], ['arrhiddenb'], ['arrhiddenc'], ['arrhiddend']]);
  });
  it('뽑기: 칸이 하나면 그것, 둘이면 시드로 고정되고 두 칸 모두 나온다', () => {
    expect(pickFormLook(hollow, 't5:water:mixed', 123)).toBe('arrwaterc');
    expect(pickFormLook(hollow, 't5:water:mixed', 456)).toBe('arrwaterc');
    expect(pickFormLook(hollow, 't9:none', 1)).toBeNull();
    const seen = new Set<string | null>();
    for (let s = 0; s < 64; s++) {
      const a = pickFormLook(hollow, 't5:fire:physical', s);
      expect(pickFormLook(hollow, 't5:fire:physical', s)).toBe(a); // 같은 시드 → 같은 결과
      seen.add(a);
    }
    expect([...seen].sort()).toEqual(['arrfirea', 'arrfired']);
  });
  it('pickLook 은 진화체 표가 먼저, 없으면 단계(아쥬커스) 표로', () => {
    const ev = { hp: 0, atk: 0, int: 0, def: 5, spr: 0, spd: 0 };
    expect(pickLook(hollow, tryGetForm('t5:earth:mixed')!, ev, 7)).toBe('arrearthc');
    expect(pickLook(hollow, tryGetForm('t3:base')!, ev, 7)).toBe('scorpion');
    expect(pickLook(hollow, tryGetForm('t4:fire')!, ev, 7)).toBeNull();
    expect(pickLook(shin, tryGetForm('t5:fire:mixed')!, ev, 7)).toBeNull();
  });
  it('설정 검증: 빈 목록·문자열이 아닌 값은 거부, 사신은 빈 표', () => {
    const base = JSON.parse(JSON.stringify(hollow));
    expect(() => parseFactionConfig({ ...base, formLooks: { 'x': [] } })).toThrow(/formLooks/);
    expect(() => parseFactionConfig({ ...base, formLooks: { 'x': [1] } })).toThrow(/formLooks/);
    expect(shin.formLooks).toEqual({});
  });
  it('상점에서 안 팔린다', () => {
    for (const c of COSMETIC_ITEMS.filter((x) => x.category === 'skin' && x.look.startsWith('arr'))) expect(shopVisible(c, [c.id])).toBe(false);
  });
});

describe('C.110 진화 때 고정 · 마이그레이션 · 테스트 칸', () => {
  it('4단계를 지나 5단계가 되면 그 진화체 표로 외형이 고정되고, 4단계에서는 기존 그림', () => {
    const save = newSaveData('hollow', 1);
    const need = BALANCE.provisional.evolution.stepsNeeded;
    const looks: (string | null)[] = [];
    for (let t = 0; t < 4; t++) {
      save.evolution.steps = need[t]!;
      expect(performEvolution(save, t + 2).ok).toBe(true);
      looks.push(save.evolution.look ?? null);
    }
    expect(looks[2]).toBeNull(); // 4단계 = 기존 단계 그림
    const id = save.evolution.formId!;
    expect(id.startsWith('t5:') || id.startsWith('h5:')).toBe(true);
    expect(fl[id]).toContain(save.evolution.look);
    expect(artSkinOf(save)).toBe(save.evolution.look);
  });
  it('시작 전용 스킨을 입고 있어도 5단계 진입 때 벗겨지고, 스킨 패널로 다시 입을 수 있다', () => {
    const save = newSaveData('hollow', 1);
    const need = BALANCE.provisional.evolution.stepsNeeded;
    save.shared.cosmetics.push('skin-mantis');
    for (let t = 0; t < 3; t++) {
      save.evolution.steps = need[t]!;
      performEvolution(save, t + 2);
    }
    save.skin = 'mantis';
    save.evolution.steps = need[3]!;
    performEvolution(save, 6);
    expect(save.skin).toBeNull();
    expect(artSkinOf(save)).toBe(save.evolution.look);
  });
  it('형식 34 의 5단계 트랙은 마이그레이션이 진화체 외형을 채운다', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(35);
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 0)));
    old.meta.format = 34;
    Object.assign(old.evolution, { tierIndex: 4, formId: 't5:thunder:special', formHistory: ['t2:base', 't3:base', 't4:thunder', 't5:thunder:special'], look: null });
    old.formDex = [...old.evolution.formHistory];
    const s = migrateSave(old)!;
    expect(s.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(['arrthunderb', 'arrthunderd']).toContain(s.evolution.look);
  });
  it('테스트 칸: 진화체를 고르면 그 진화체 외형이 정해진다', () => {
    const s = newSaveData('hollow', 1);
    expect(setForm(s, 'h5:limit')).toBe(true);
    expect(s.evolution.look).toBe('arrhiddena');
    expect(setForm(s, 't5:water:physical')).toBe(true);
    expect(s.evolution.look).toBe('arrwaterd');
  });
});
