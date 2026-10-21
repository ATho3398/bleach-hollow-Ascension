import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { tryGetForm } from '../src/data/evolution';
import { FACTIONS } from '../src/data/factions';
import { STAT_IDS, type StatId } from '../src/data/schema';
import { SKINS, getSkin } from '../src/data/skins';
import { COSMETIC_ITEMS, shopVisible } from '../src/data/shop';
import { evolve, zeroStats } from '../src/engine/evolution';
import { pickTierLook, tierLookIds } from '../src/engine/evolution/tierLook';
import { parseFactionConfig } from '../src/engine/faction';
import { setCustomStats, setForm } from '../src/engine/testMode';
import { artSkinOf, equipSkin, migrateSave, newSaveData, performEvolution, SAVE_FORMAT_VERSION } from '../src/game';

const hollow = FACTIONS.find((f) => f.id === 'hollow')!;
const shin = FACTIONS.find((f) => f.id !== 'hollow')!;
const t3 = tryGetForm('t3:base')!;
const evOf = (o: Partial<Record<StatId, number>>) => ({ ...zeroStats(), ...o });

describe('C.109 아쥬커스 외형 = 노력치 1위 능력치 (GDD 53)', () => {
  it('능력치 6종이 모두 배정되고(1위 하나일 때) 각자 정해진 외형', () => {
    const want: Record<StatId, string> = { atk: 'carapace', int: 'stag', hp: 'rhino', spr: 'wyrm', spd: 'panther', def: 'scorpion' };
    for (const s of STAT_IDS) expect(pickTierLook(hollow, 3, evOf({ [s]: 5 }), t3), s).toBe(want[s]);
  });
  it('1·2위가 속도와 지능이면(순서 무관) 새형이 먼저 판정된다', () => {
    expect(pickTierLook(hollow, 3, evOf({ spd: 6, int: 5 }), t3)).toBe('raptor');
    expect(pickTierLook(hollow, 3, evOf({ int: 6, spd: 5 }), t3)).toBe('raptor');
    expect(pickTierLook(hollow, 3, evOf({ spd: 6, int: 2, atk: 4 }), t3)).toBe('panther'); // 2위가 힘이면 쌍이 아님
    expect(pickTierLook(hollow, 3, evOf({ spd: 5, int: 5 }), t3)).toBe('raptor'); // 동률 1위 둘도 쌍
  });
  it('동률(모두 0 포함)은 기존 순위 규칙(진화체 종족값 → 능력치 순)을 따른다', () => {
    const l = pickTierLook(hollow, 3, zeroStats(), t3);
    expect(l).not.toBeNull();
    expect(pickTierLook(hollow, 3, zeroStats(), t3)).toBe(l); // 결정적
  });
  it('표가 없는 단계·종족은 null (4·5단계 기존 그림, 사신 기본)', () => {
    expect(pickTierLook(hollow, 4, evOf({ atk: 5 }), tryGetForm('t4:fire')!)).toBeNull();
    expect(pickTierLook(shin, 3, evOf({ atk: 5 }), t3)).toBeNull();
    expect(shin.tierLooks).toEqual({});
  });
  it('표의 모든 외형이 단계 외형 스킨(시작 전용·호로)이고 그림 파일이 있다', () => {
    const ids = tierLookIds(hollow);
    expect(ids.sort()).toEqual(['carapace', 'panther', 'raptor', 'rhino', 'scorpion', 'stag', 'wyrm']);
    for (const id of ids) {
      expect(getSkin(id)).toMatchObject({ factionId: 'hollow', startOnly: true, tierLook: true });
      expect(existsSync(`public/art/skin-${id}.png`), id).toBe(true);
    }
    for (const c of COSMETIC_ITEMS.filter((x) => x.category === 'skin' && ids.includes(x.look))) expect(shopVisible(c, [c.id])).toBe(false);
  });
  it('설정 검증: 모르는 능력치·빈 외형은 거부', () => {
    const base = JSON.parse(JSON.stringify(hollow));
    expect(() => parseFactionConfig({ ...base, tierLooks: { '3': { stat: { zzz: 'x' } } } })).toThrow(/tierLooks/);
    expect(() => parseFactionConfig({ ...base, tierLooks: { '3': { stat: { atk: '' } } } })).toThrow(/tierLooks/);
    expect(() => parseFactionConfig({ ...base, tierLooks: { x: { stat: {} } } })).toThrow(/tierLooks/);
  });
});

describe('C.109 진화 때 고정 · 시작 외형 덮어쓰기 · 스킨 선택', () => {
  const evolveTo3 = (ev: Partial<Record<StatId, number>>, skin: string | null = null) => {
    const save = newSaveData('hollow', 1);
    const e = save.evolution;
    const need = BALANCE.provisional.evolution.stepsNeeded;
    e.steps = need[0]!;
    expect(evolve(e, save.build, { factionId: 'hollow', hunger: 30, condition: 80, rebirths: 0 }, 1).ok).toBe(true); // 1 → 2
    e.ev = evOf(ev);
    e.steps = need[1]!;
    save.skin = skin;
    if (skin) save.shared.cosmetics.push(`skin-${skin}`);
    const r = performEvolution(save, 2);
    expect(r.ok).toBe(true);
    return save;
  };
  it('3단계 진입 때 노력치 1위로 정해 세이브에 고정한다 (이후 노력치가 바뀌어도 그대로)', () => {
    const s = evolveTo3({ def: 6 });
    expect(s.evolution.tierIndex).toBe(2);
    expect(s.evolution.look).toBe('scorpion');
    s.evolution.ev = evOf({ spd: 40 });
    expect(s.evolution.look).toBe('scorpion');
    expect(artSkinOf(s)).toBe('scorpion');
  });
  it('시작 외형 스킨은 덮어쓰이고(해제), 스킨 패널에서 다시 입으면 그 스킨이 이긴다. 기본(null)으로 돌리면 단계 외형', () => {
    const s = evolveTo3({ atk: 6 }, 'stalker');
    expect(s.skin).toBeNull();
    expect(artSkinOf(s)).toBe('carapace');
    expect(equipSkin(s, 'stalker')).toBe(true); // 보유 중이라 다시 고를 수 있다
    expect(artSkinOf(s)).toBe('stalker');
    expect(equipSkin(s, null)).toBe(true);
    expect(artSkinOf(s)).toBe('carapace');
  });
  it('4단계로 가면 단계 외형이 없어져 기존 단계 그림', () => {
    const s = evolveTo3({ atk: 6 });
    const e = s.evolution;
    e.steps = BALANCE.provisional.evolution.stepsNeeded[2]!;
    expect(performEvolution(s, 3).ok).toBe(true);
    expect(e.tierIndex).toBe(3);
    expect(e.look ?? null).toBeNull();
    expect(artSkinOf(s)).toBeNull();
  });
  it('사신은 단계 외형이 없다', () => {
    const save = newSaveData('shinigami', 1);
    const need = BALANCE.provisional.evolution.stepsNeeded;
    for (let t = 0; t < 2; t++) {
      save.evolution.steps = need[t]!;
      performEvolution(save, 2);
    }
    expect(save.evolution.look ?? null).toBeNull();
  });
  it('테스트 칸: 진화체·능력치를 고르면 외형이 같은 규칙으로 다시 정해진다', () => {
    const s = newSaveData('hollow', 1);
    expect(setForm(s, 't3:base')).toBe(true);
    setCustomStats(s, { spd: 200, int: 150 });
    expect(s.evolution.look).toBe('raptor');
    setCustomStats(s, { hp: 300 });
    expect(s.evolution.look).toBe('rhino');
    setForm(s, null);
    expect(s.evolution.look).toBeNull();
  });
});

describe('C.109 세이브 형식 33 마이그레이션', () => {
  it('형식 32 의 아쥬커스 트랙에 단계 외형을 채우고, 다른 단계는 null', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(33);
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 0)));
    old.meta.format = 32;
    Object.assign(old.evolution, { tierIndex: 2, formId: 't3:base', formHistory: ['t2:base', 't3:base'], ev: evOf({ int: 6, spd: 5 }) });
    old.formDex = ['t2:base', 't3:base'];
    delete old.evolution.look;
    const s = migrateSave(old)!;
    expect(s.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(s.evolution.look).toBe('raptor');
    const old2 = JSON.parse(JSON.stringify(newSaveData('hollow', 0)));
    old2.meta.format = 32;
    const s2 = migrateSave(old2)!;
    expect(s2.evolution.look).toBeNull();
  });
  it('스킨 표에 시작 전용 4종 + 단계 외형 7종이 모두 호로 전용', () => {
    expect(SKINS.filter((x) => x.startOnly).every((x) => x.factionId === 'hollow')).toBe(true);
    expect(SKINS.filter((x) => x.tierLook).length).toBe(7);
  });
});
