import { existsSync, readdirSync } from 'node:fs';
import { charArt } from '../src/data/art/manifest';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FORM_TABLE, tryGetForm } from '../src/data/evolution';
import { FACTIONS } from '../src/data/factions';
import { getSkin } from '../src/data/skins';
import { COSMETIC_ITEMS, shopVisible } from '../src/data/shop';
import { pickFormLook, pickLook } from '../src/engine/evolution/tierLook';
import { parseFactionConfig } from '../src/engine/faction';
import { setForm } from '../src/engine/testMode';
import { createCombat } from '../src/engine/combat';
import { ENEMIES } from '../src/data/enemies';
import { artSkinOf, migrateSave, newSaveData, performEvolution, SAVE_FORMAT_VERSION } from '../src/game';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const hollow = FACTIONS.find((f) => f.id === 'hollow')!;
const shin = FACTIONS.find((f) => f.id !== 'hollow')!;
const fl = hollow.formLooks!;

describe('C.110 아란칼 외형 표 (GDD 54 → C.220: 4단계 + 아란칼화)', () => {
  it('4단계 일반 18종 + 행동 히든 4종(폭주·절제·사냥꾼·각성)에 외형이 있고, 모두 시작 전용 단계 외형 스킨 — 그림이 없으면 아란칼 기본형 종이인형', () => {
    const files = readdirSync('public/art');
    const t4 = FORM_TABLE.filter((f) => f.tier === 4 && (!f.hidden || ['frenzy', 'restraint', 'hunter', 'awakened'].includes(f.label.kind))).map((f) => f.id);
    expect(t4.length).toBe(22);
    for (const id of t4) {
      expect(fl[id], id).toBeTruthy();
      for (const l of fl[id]!) {
        expect(getSkin(l), l).toMatchObject({ factionId: 'hollow', startOnly: true, tierLook: true });
        // 그림 단계 5(아란칼화를 깬 호로, 종족 설정 ascension.artTier) = tierIndex 4 의 그림 키
        const a = charArt('hollow', 4, 'char.hollow', '/', undefined, files, l, undefined, 'male');
        expect(a.src, l).toBe(existsSync(`public/art/skin-${l}.png`) ? `/art/skin-${l}.png` : '/art/rig/humanoid/still/arrancar-base.png');
        if (!existsSync(`public/art/skin-${l}.png`)) expect(charArt('hollow', 4, 'char.hollow', '/', undefined, files, l, undefined, 'female').rig?.look, l).toBe('arrancar-base-f');
      }
    }
    expect(Object.keys(fl).sort()).toEqual([...t4].sort());
  });
  it('사용자 확정 표: 물 특수 = 1·2(a·b), 물 물리 = 4(d), 뇌 특수 = 2·4(b·d), 나머지는 물리 1·4, 특수 2, 혼합 3, 혈 물리·독 특수·허 혼합만, 히든 1~4', () => {
    expect(fl['t4:water:special']).toEqual(['arrwatera', 'arrwaterb']);
    expect(fl['t4:water:physical']).toEqual(['arrwaterd']);
    expect(fl['t4:water:mixed']).toEqual(['arrwaterc']);
    expect(fl['t4:thunder:special']).toEqual(['arrthunderb', 'arrthunderd']);
    expect(fl['t4:thunder:physical']).toEqual(['arrthundera']);
    for (const e of ['normal', 'fire', 'earth']) {
      expect(fl[`t4:${e}:physical`]).toEqual([`arr${e}a`, `arr${e}d`]);
      expect(fl[`t4:${e}:special`]).toEqual([`arr${e}b`]);
      expect(fl[`t4:${e}:mixed`]).toEqual([`arr${e}c`]);
    }
    expect([fl['t4:blood:physical'], fl['t4:poison:special'], fl['t4:kyo:mixed']]).toEqual([['arrblooda', 'arrbloodd'], ['arrpoisonb'], ['arrkyoc']]);
    expect(['frenzy', 'restraint', 'hunter', 'awakened'].map((k) => fl[`h4:${k}`])).toEqual([['arrhiddena'], ['arrhiddenb'], ['arrhiddenc'], ['arrhiddend']]);
  });
  it('뽑기: 칸이 하나면 그것, 둘이면 시드로 고정되고 두 칸 모두 나온다', () => {
    expect(pickFormLook(hollow, 't4:water:mixed', 123)).toBe('arrwaterc');
    expect(pickFormLook(hollow, 't4:water:mixed', 456)).toBe('arrwaterc');
    expect(pickFormLook(hollow, 't9:none', 1)).toBeNull();
    const seen = new Set<string | null>();
    for (let s = 0; s < 64; s++) {
      const a = pickFormLook(hollow, 't4:fire:physical', s);
      expect(pickFormLook(hollow, 't4:fire:physical', s)).toBe(a); // 같은 시드 → 같은 결과
      seen.add(a);
    }
    expect([...seen].sort()).toEqual(['arrfirea', 'arrfired']);
  });
  it('pickLook 은 진화체 표가 먼저(호로는 아란칼화를 깬 뒤만), 없으면 단계(아쥬커스) 표로', () => {
    const ev = { hp: 0, atk: 0, int: 0, def: 5, spr: 0, spd: 0 };
    expect(pickLook(hollow, tryGetForm('t4:earth:mixed')!, ev, 7)).toBe('arrearthc');
    expect(pickLook(hollow, tryGetForm('t4:earth:mixed')!, ev, 7, false)).toBeNull();
    expect(pickLook(hollow, tryGetForm('t3:normal')!, ev, 7)).toBe('scorpion');
    expect(pickLook(hollow, tryGetForm('t3:fire')!, ev, 7)).toBe('scorpion');
    expect(pickLook(shin, tryGetForm('t4:fire:mixed')!, ev, 7)).toBeNull();
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

describe('C.110 진화 때 고정 · 마이그레이션 · 테스트 칸 (C.220: 아란칼 모습은 아란칼화를 깬 순간)', () => {
  const wonBattle = () => {
    const c = createCombat(1, { enemy: ENEMIES.find((e) => e.class === 'normal')!, params: {} });
    c.status = 'won';
    return c;
  };
  it('4단계가 되어도 기존 그림, 아란칼화를 깨면 그 진화체 표로 외형이 고정된다', async () => {
    const { recordAscension } = await import('../src/game');
    const save = newSaveData('hollow', 1);
    const need = BALANCE.provisional.evolution.stepsNeeded;
    for (let t = 0; t < 3; t++) {
      save.evolution.steps = need[t]!;
      expect(performEvolution(save, t + 2).ok).toBe(true);
    }
    expect(save.evolution.tierIndex).toBe(3);
    expect(save.evolution.look ?? null).toBeNull(); // 4단계 = 기존 단계 그림
    const id = save.evolution.formId!;
    expect(id.startsWith('t4:') || id.startsWith('h4:')).toBe(true);
    recordAscension(save, wonBattle(), 9);
    if (fl[id]) expect(fl[id]).toContain(save.evolution.look);
    expect(artSkinOf(save)).toBe(save.evolution.look ?? null);
  });
  it('시작 전용 스킨을 입고 있어도 아란칼화 때 벗겨지고, 스킨 패널로 다시 입을 수 있다', async () => {
    const { recordAscension } = await import('../src/game');
    const save = newSaveData('hollow', 1);
    const need = BALANCE.provisional.evolution.stepsNeeded;
    save.shared.cosmetics.push('skin-mantis');
    for (let t = 0; t < 3; t++) {
      save.evolution.steps = need[t]!;
      performEvolution(save, t + 2);
    }
    setForm(save, 't4:fire:mixed');
    save.skin = 'mantis';
    recordAscension(save, wonBattle(), 9);
    expect(save.skin).toBeNull();
    expect(artSkinOf(save)).toBe(save.evolution.look);
  });
  it('형식 34 의 5단계 트랙은 마이그레이션(형식 57 포함)이 4단계 진화체 외형을 채운다', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(35);
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 0)));
    old.meta.format = 34;
    Object.assign(old.evolution, { tierIndex: 4, formId: 't5:thunder:special', formHistory: ['t2:base', 't3:base', 't4:thunder', 't5:thunder:special'], look: null });
    old.formDex = [...old.evolution.formHistory];
    const s = migrateSave(old)!;
    expect(s.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(s.evolution.formId).toBe('t4:thunder:special');
    expect(s.evolution.ascended).toBe(true);
    expect(['arrthunderb', 'arrthunderd']).toContain(s.evolution.look);
  });
  it('테스트 칸: 진화체를 고르면 그 진화체 외형이 정해진다 (아란칼화를 깬 몸)', () => {
    const s = newSaveData('hollow', 1);
    s.evolution.ascended = true;
    expect(setForm(s, 'h4:frenzy')).toBe(true);
    expect(s.evolution.look).toBe('arrhiddena');
    expect(setForm(s, 't4:water:physical')).toBe(true);
    expect(s.evolution.look).toBe('arrwaterd');
  });
});
