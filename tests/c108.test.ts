// C.108 (S-23, GDD 52): 흡수 4갈래(둘 다·속성만·스탯만·안 함), 노력치 상한 15%, 수련 노력치 +4~5, 시작 외형 스탯 편향, 런 로그 흡수 갈래, 세이브 형식 34
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { ENEMIES } from '../src/data/enemies';
import { FACTIONS } from '../src/data/factions';
import { STAT_IDS, type StatId } from '../src/data/schema';
import { TRAITS } from '../src/data/traits';
import { ABSORB_MODES, absorbRisk, type AbsorbMode, type AbsorbOffer } from '../src/engine/absorb';
import { addEv, currentStats, evCaps, newEvolution } from '../src/engine/evolution';
import { absorbEvOf, chooseAbsorb, chooseRelease, createExpedition } from '../src/engine/expedition';
import { parseFactionConfig } from '../src/engine/faction';
import { applyStartLook, migrateSave, newSaveData, performRebirth, sanitizeDeck, SAVE_FORMAT_VERSION } from '../src/game';
import { absorbModeOf } from '../src/engine/runLog';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const hollow = FACTIONS.find((f) => f.id === 'hollow')!;
const shin = FACTIONS.find((f) => f.id !== 'hollow')!;
const SX = BALANCE.provisional.stats;
const AX = BALANCE.provisional.absorb;
const RX = BALANCE.provisional.risk;

/** 흡수 단계에 선 원정 (★1 연속 0): 일반 적, 후보 = 그 속성 특성 2개, 적 노력치 ev */
function atAbsorb(ev: Partial<Record<StatId, number>> = { atk: 2 }) {
  const s = newSaveData('hollow', 1);
  const e = createExpedition({ factionId: 'hollow', seed: 7, hunger: 60, condition: 80, deck: sanitizeDeck(s.tiles, 'hollow'), build: s.build, evolution: s.evolution });
  const enemy = ENEMIES.find((x) => x.class === 'normal' && !x.testOnly && x.element !== 'normal')!; // C.184: 노멀 skill 특성은 기본 블록(GDD 111장 1)이라 장착되지 않는다 — 속성 적으로
  const own = TRAITS.filter((t) => t.element === enemy.element && !t.boss).map((t) => t.id).slice(0, 2);
  const offer: AbsorbOffer = { enemyId: enemy.id, element: enemy.element, ev, elite: false, strength: 30, candidates: own, reasons: ['victory'], chain3Count: 0, weakChain3Count: 0, finisherElement: null };
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
  it('상한 = 3~5단계 합계의 약 15% (70·88·110), 능력치 1개 50% — 1·2단계는 C.115(GDD 59)에서 약 8%(24·32)로 내림', () => {
    expect(SX.evCapTotal).toEqual([24, 32, 70, 88]); // C.220: 4단계 (마지막 110 삭제)
    SX.evCapTotal.forEach((cap, i) => {
      if (i >= 2) {
        expect(cap / SX.tierTotals[i]!).toBeGreaterThan(0.14);
        expect(cap / SX.tierTotals[i]!).toBeLessThan(0.16);
      }
      expect(evCaps(i)).toEqual({ total: cap, perStat: Math.floor(cap * 0.5) });
    });
    const e = newEvolution();
    expect(addEv(e, { atk: 99 })).toEqual({ atk: 12 });
    expect(addEv(e, { hp: 99, spd: 99 })).toEqual({ hp: 12 });
    expect(STAT_IDS.reduce((a, s) => a + e.ev[s], 0)).toBe(24);
  });
  it('수련 4종 노력치 +4~5', () => {
    const G = BALANCE.provisional.training.games;
    expect(G.duel!.ev).toEqual({ spr: 4 });
    expect(G.dodge!.ev).toEqual({ spd: 5 });
    expect(G.clash!.ev).toEqual({ atk: 5 });
    expect(G.chain!.ev).toEqual({ hp: 5 });
  });
});

// C.108 시작 외형 스탯 편향 시험은 삭제 — 규칙 폐기 (GDD 78, C.132, tests/c132.test.ts)
