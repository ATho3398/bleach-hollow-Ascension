// C.108 (S-23, GDD 52): 흡수 4갈래(둘 다·속성만·스탯만·안 함), 노력치 상한 15%, 수련 노력치 +4~5, 시작 외형 스탯 편향, 런 로그 흡수 갈래, 세이브 형식 34
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { ENEMIES } from '../src/data/enemies';
import { FACTIONS } from '../src/data/factions';
import { STAT_IDS, type StatId } from '../src/data/schema';
import { TRAITS } from '../src/data/traits';
import { ABSORB_MODES, absorbRisk, type AbsorbMode, type AbsorbOffer } from '../src/engine/absorb';
import { addEv, currentStats, evCaps, newEvolution, startBiasStats } from '../src/engine/evolution';
import { absorbEvOf, chooseAbsorb, chooseRelease, createExpedition } from '../src/engine/expedition';
import { parseFactionConfig } from '../src/engine/faction';
import { applyStartLook, migrateSave, newSaveData, performRebirth, sanitizeDeck, startBiasOf, SAVE_FORMAT_VERSION } from '../src/game';
import { absorbModeOf } from '../src/engine/runLog';

const hollow = FACTIONS.find((f) => f.id === 'hollow')!;
const shin = FACTIONS.find((f) => f.id !== 'hollow')!;
const SX = BALANCE.provisional.stats;
const AX = BALANCE.provisional.absorb;
const RX = BALANCE.provisional.risk;

/** 흡수 단계에 선 원정 (★1 연속 0): 일반 적, 후보 = 그 속성 특성 2개, 적 노력치 ev */
function atAbsorb(ev: Partial<Record<StatId, number>> = { atk: 2 }) {
  const s = newSaveData('hollow', 1);
  const e = createExpedition({ factionId: 'hollow', seed: 7, hunger: 60, condition: 80, deck: sanitizeDeck(s.tiles, 'hollow'), build: s.build, evolution: s.evolution });
  const enemy = ENEMIES.find((x) => x.class === 'normal' && !x.testOnly)!;
  const own = TRAITS.filter((t) => t.element === enemy.element && !t.rare && !t.boss).map((t) => t.id).slice(0, 2);
  const offer: AbsorbOffer = { enemyId: enemy.id, element: enemy.element, ev, rare: false, elite: false, strength: 30, candidates: own, reasons: ['first-absorb'], chain3Count: 0, weakChain3Count: 0, finisherElement: null };
  e.phase = 'absorb';
  e.absorbOffer = offer;
  e.risk = 20;
  return { e, offer, own, enemy };
}

describe('C.108 흡수 4갈래 (GDD 52 표)', () => {
  it('배율 표: 둘 다 ×1/×1 · 속성만 ev 0·리스크 ×0.7 · 스탯만 ev ×2·리스크 ×0.5', () => {
    expect(ABSORB_MODES).toEqual(['both', 'trait', 'stat']);
    expect(AX.modes).toEqual({ both: { ev: 1, risk: 1 }, trait: { ev: 0, risk: 0.7 }, stat: { ev: 2, risk: 0.5 } });
    const base = 30 * RX.absorbPerHpAttack;
    expect(absorbRisk(30)).toBeCloseTo(base);
    expect(absorbRisk(30, 'trait')).toBeCloseTo(base * 0.7);
    expect(absorbRisk(30, 'stat')).toBeCloseTo(base * 0.5);
    const offer = { ev: { atk: 2, spd: 1 } };
    expect(absorbEvOf(offer, 'both', 1)).toEqual({ atk: 2, spd: 1 });
    expect(absorbEvOf(offer, 'trait', 1)).toEqual({});
    expect(absorbEvOf(offer, 'stat', 1)).toEqual({ atk: 4, spd: 2 });
    // 난이도 보상 배율은 갈래 배율 뒤에 곱한다 (★3 = ×1.5)
    expect(absorbEvOf(offer, 'stat', 3)).toEqual({ atk: 6, spd: 3 });
  });

  it('둘 다: 특성 장착 + 속성 카운트 + 노력치 ×1 + 리스크 그대로 + 허기 리셋, 기록은 mode 없음(= both)', () => {
    const { e, own, enemy } = atAbsorb({ atk: 2 });
    expect(chooseAbsorb(e, own[0]!, undefined, 'both').ok).toBe(true);
    expect(e.build.slots).toContain(own[0]);
    expect(e.evolution.elementAbsorbs[enemy.element]).toBe(1);
    expect(e.evolution.absorbs).toBe(1);
    expect(e.evolution.ev.atk).toBe(2);
    expect(e.risk).toBeCloseTo(20 + absorbRisk(30));
    expect(e.hunger).toBe(AX.hungerAfterAbsorb);
    expect(e.absorbRecords.at(-1)).toMatchObject({ absorbed: true, traitId: own[0] });
    expect(e.absorbRecords.at(-1)!.mode).toBeUndefined();
    expect(absorbModeOf(e.absorbRecords.at(-1)!)).toBe('both');
    expect(e.phase).toBe('moving');
  });

  it('속성만: 특성·속성 카운트 O, 노력치 없음, 리스크 ×0.7, 허기 리셋, 기록 mode trait', () => {
    const { e, own, enemy } = atAbsorb({ atk: 2 });
    expect(chooseAbsorb(e, own[1]!, undefined, 'trait').ok).toBe(true);
    expect(e.build.slots).toContain(own[1]);
    expect(e.evolution.elementAbsorbs[enemy.element]).toBe(1);
    expect(e.evolution.ev.atk).toBe(0);
    expect(e.risk).toBeCloseTo(20 + absorbRisk(30) * 0.7);
    expect(e.hunger).toBe(AX.hungerAfterAbsorb);
    expect(e.absorbRecords.at(-1)).toMatchObject({ absorbed: true, traitId: own[1], mode: 'trait' });
    expect(absorbModeOf(e.absorbRecords.at(-1)!)).toBe('trait');
  });

  it('스탯만: 특성·속성 카운트 X, 노력치 ×2, 리스크 ×0.5, 허기 리셋, 흡수 수는 센다, 특성을 고르면 거절', () => {
    const { e, own, enemy } = atAbsorb({ atk: 2 });
    expect(chooseAbsorb(e, own[0]!, undefined, 'stat')).toEqual({ ok: false, reason: '스탯만 흡수할 때는 특성을 고를 수 없다' });
    expect(e.phase).toBe('absorb');
    expect(chooseAbsorb(e, null, undefined, 'stat').ok).toBe(true);
    expect(e.build.slots.filter(Boolean)).toEqual([]);
    expect(e.evolution.elementAbsorbs[enemy.element]).toBeUndefined();
    expect(e.evolution.absorbs).toBe(1);
    expect(e.evolution.ev.atk).toBe(4);
    expect(e.risk).toBeCloseTo(20 + absorbRisk(30) * 0.5);
    expect(e.hunger).toBe(AX.hungerAfterAbsorb);
    expect(e.absorbRecords.at(-1)).toMatchObject({ absorbed: true, traitId: null, mode: 'stat' });
  });

  it('흡수 안 함 = 놓아주기 그대로 (리스크 −, 안정 +, 허기 그대로, 기록에 mode 없음)', () => {
    const { e } = atAbsorb();
    const stab = e.stability;
    expect(chooseRelease(e).ok).toBe(true);
    expect(e.risk).toBe(20 - RX.releaseRelief);
    expect(e.stability).toBe(stab + RX.releaseStability);
    expect(e.hunger).toBe(60);
    expect(e.evolution.releases).toBe(1);
    const rec = e.absorbRecords.at(-1)!;
    expect(rec.absorbed).toBe(false);
    expect(rec.mode).toBeUndefined();
    expect(absorbModeOf(rec)).toBeNull();
  });

  it('mode 를 안 주면 둘 다 (옛 호출·봇 그대로)', () => {
    const { e, own } = atAbsorb({ atk: 2 });
    expect(chooseAbsorb(e, own[0]!).ok).toBe(true);
    expect(e.evolution.ev.atk).toBe(2);
    expect(absorbModeOf(e.absorbRecords.at(-1)!)).toBe('both');
  });
});

describe('C.108 노력치 상한·수련 보상', () => {
  it('상한 = 단계 합계의 약 15% (45·56·70·88·110), 능력치 1개 50%', () => {
    expect(SX.evCapTotal).toEqual([45, 56, 70, 88, 110]);
    SX.evCapTotal.forEach((cap, i) => {
      expect(cap / SX.tierTotals[i]!).toBeGreaterThan(0.14);
      expect(cap / SX.tierTotals[i]!).toBeLessThan(0.16);
      expect(evCaps(i)).toEqual({ total: cap, perStat: Math.floor(cap * 0.5) });
    });
    const e = newEvolution();
    expect(addEv(e, { atk: 99 })).toEqual({ atk: 22 });
    expect(addEv(e, { hp: 99, spd: 99 })).toEqual({ hp: 22, spd: 1 });
    expect(STAT_IDS.reduce((a, s) => a + e.ev[s], 0)).toBe(45);
  });
  it('수련 4종 노력치 +4~5', () => {
    const G = BALANCE.provisional.training.games;
    expect(G.duel!.ev).toEqual({ spr: 4 });
    expect(G.dodge!.ev).toEqual({ spd: 5 });
    expect(G.clash!.ev).toEqual({ atk: 5 });
    expect(G.chain!.ev).toEqual({ hp: 5 });
  });
});

describe('C.108 시작 외형 스탯 편향 (GDD 52 연동)', () => {
  it('호로 표: 기본 체력 · 추적자 속도 · 거구 힘 · 망령 정신력 · 속박자 방어. 사신은 없음', () => {
    expect(hollow.startLookBias).toEqual({ base: 'hp', stalker: 'spd', brute: 'atk', ghoul: 'spr', shackled: 'def' });
    expect(shin.startLookBias).toEqual({});
    expect(startBiasOf(shin, null)).toBeNull();
    expect(startBiasOf(shin, 'stalker')).toBeNull();
  });
  it('편향 = 한 능력치 +10, 나머지 −2 (합계 0)', () => {
    expect(SX.startBias).toEqual({ up: 10, down: 2 });
    const b = startBiasStats('spd');
    expect(b).toEqual({ hp: -2, atk: -2, int: -2, def: -2, spr: -2, spd: 10 });
    expect(startBiasOf(hollow, 'stalker')).toEqual(b);
    expect(startBiasOf(hollow, null)!.hp).toBe(10);
    expect(startBiasOf(hollow, 'zzz')).toBeNull();
  });
  it('새 세이브 추첨이 편향을 두고 능력치에 더해진다 (합계 그대로)', () => {
    const plain = newSaveData('hollow', 1000);
    const s = newSaveData('hollow', 1000);
    expect(applyStartLook(s, hollow, 0.3)).toBe('stalker');
    expect(s.evolution.bias).toEqual(startBiasStats('spd'));
    const before = currentStats(plain.evolution, 'hollow');
    const after = currentStats(s.evolution, 'hollow');
    expect(after.spd).toBe(before.spd + 10);
    expect(after.hp).toBe(before.hp - 2);
    expect(STAT_IDS.reduce((a, k) => a + after[k], 0)).toBe(STAT_IDS.reduce((a, k) => a + before[k], 0));
    // 기본 외형(사마귀)도 편향(체력)을 받는다
    const d = newSaveData('hollow', 1000);
    expect(applyStartLook(d, hollow, 0)).toBeNull();
    expect(d.evolution.bias!.hp).toBe(10);
    // 사신은 편향 없음
    const sh = newSaveData(shin.id, 1000);
    applyStartLook(sh, shin, 0.5);
    expect(sh.evolution.bias).toBeUndefined();
  });
  it('환생해도 편향은 그대로, 옛 세이브(형식 33)는 편향 없음, 형식 34', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(34);
    const s = newSaveData('hollow', 1000);
    applyStartLook(s, hollow, 0.9);
    s.evolution.tierIndex = 4;
    const r = performRebirth(s, null, 5000);
    expect(r.ok).toBe(true);
    expect(s.evolution.bias).toEqual(startBiasStats('def'));
    expect(s.evolution.tierIndex).toBe(0);
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 0)));
    old.meta.format = 33;
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.evolution.bias).toBeUndefined();
    expect(currentStats(m.evolution, 'hollow')).toEqual(currentStats(newSaveData('hollow', 0).evolution, 'hollow'));
    // 편향 있는 세이브는 저장·불러오기 뒤에도 그대로
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.evolution.bias).toEqual(startBiasStats('def'));
  });
  it('설정 검증: 모르는 능력치·startLooks 에 없는 스킨 키는 거부', () => {
    const base = JSON.parse(JSON.stringify(hollow));
    expect(() => parseFactionConfig({ ...base, startLookBias: { base: 'zzz' } })).toThrow(/startLookBias/);
    expect(() => parseFactionConfig({ ...base, startLookBias: { nope: 'hp' } })).toThrow(/startLookBias/);
    expect(() => parseFactionConfig({ ...base, startLookBias: { base: 'hp', brute: 'atk' } })).not.toThrow();
  });
});
