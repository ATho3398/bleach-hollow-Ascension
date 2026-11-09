// C.355 (GDD 210장): 영혼 웅덩이(휴식 칸) 약하게 — 리스크 내림 없음·회복 15% × 0.8^(바퀴−1) 최저 3% · 바퀴 끝 임시 타일 70% 무작위 1장(고르기 없음)
import { describe, expect, it } from 'vitest';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { getTile } from '../src/data/tiles';
import { getFaction } from '../src/data/factions';
import { riskText } from '../src/data/help/riskText';
import { tileHint } from '../src/ui/labels';
import { advance, chooseContinue, chooseDraft, createExpedition, finishRest, hpFractionOf, restRecoverFraction, type ExpeditionState } from '../src/engine/expedition';
import { newSaveData, sanitizeDeck } from '../src/game';

const PX = BALANCE.provisional.expedition;
const TV = BALANCE.provisional.tileVariants;
const R = PX.restRecover;
const L = BALANCE.expedition.loopTiles;

function exp(o: { seed?: number; variants?: boolean; hunger?: number; condition?: number; risk?: number } = {}): ExpeditionState {
  return createExpedition({ factionId: 'hollow', seed: o.seed ?? 7, hunger: o.hunger ?? 60, condition: o.condition ?? 40, risk: o.risk ?? 50, deck: sanitizeDeck(newSaveData('hollow', 1).tiles, 'hollow'), tileVariants: o.variants ?? true });
}
function road(e: ExpeditionState, tiles: Record<number, string>): void {
  e.slots = Array.from({ length: L }, (_, c) => tiles[c] ?? null);
  e.wildCells = [];
}
/** lap 바퀴째의 휴식 칸 하나를 쉬고 변화량을 잰다 */
function restAt(lap: number, id = 'rest-a') {
  const e = exp();
  e.lap = lap;
  road(e, { 3: id });
  e.pos = 2;
  e.phase = 'moving';
  e.hpFraction = 0.5;
  expect(advance(e)?.kind).toBe('rest');
  const b = { h: e.hunger, c: e.condition, r: e.risk, hp: hpFractionOf(e) };
  finishRest(e);
  return { hunger: b.h - e.hunger, cond: e.condition - b.c, risk: b.r - e.risk, hp: hpFractionOf(e) - b.hp };
}

describe('210장 1: 휴식 칸(영혼 웅덩이)', () => {
  it('수치(provisional): 15% · 바퀴마다 ×0.8 · 최저 3%, 밸런스 114', () => {
    expect(R).toEqual({ base: 0.15, perLapDecay: 0.8, min: 0.03 });
    expect(BALANCE_VERSION).toBe(114);
    expect(restRecoverFraction(1)).toBeCloseTo(0.15, 9);
    expect(restRecoverFraction(2)).toBeCloseTo(0.12, 9);
    expect(restRecoverFraction(3)).toBeCloseTo(0.096, 9);
    expect(restRecoverFraction(4)).toBeCloseTo(0.0768, 9);
    expect(restRecoverFraction(8)).toBeCloseTo(0.15 * 0.8 ** 7, 9); // 3.1% — 아직 최저 위
    expect(restRecoverFraction(9)).toBe(0.03); // 2.5% → 최저 3%
    expect(restRecoverFraction(30)).toBe(0.03);
    expect(restRecoverFraction(0)).toBeCloseTo(0.15, 9); // 0·음수 바퀴는 1바퀴로
  });
  it('바퀴별 회복: 배부름·컨디션·체력 모두 최대치의 같은 비율, 리스크는 0', () => {
    for (const lap of [1, 2, 3, 4, 9]) {
      const f = restRecoverFraction(lap);
      const d = restAt(lap);
      expect(d.hunger).toBeCloseTo(PX.hungerMax * f, 9);
      expect(d.cond).toBeCloseTo(PX.conditionMax * f, 9);
      expect(d.hp).toBeCloseTo(f, 9);
      expect(d.risk).toBe(0);
    }
    // 1바퀴 15 → 3바퀴 9.6 → 9바퀴 3 (배부름 기준)
    expect(restAt(1).hunger).toBeCloseTo(15, 9);
    expect(restAt(3).hunger).toBeCloseTo(9.6, 9);
    expect(restAt(9).hunger).toBeCloseTo(3, 9);
  });
  it('샘(rest-spring)은 그대로: 회복 0 · 리스크 −20 (옛 휴식 10 × 2 와 같은 값)', () => {
    const d = restAt(1, 'rest-spring');
    expect(d.hunger).toBe(0);
    expect(d.cond).toBe(0);
    expect(d.hp).toBe(0);
    expect(d.risk).toBe(BALANCE.provisional.tiles.spring.riskRelief);
    expect(d.risk).toBe(20);
    expect(restAt(3, 'rest-spring').risk).toBe(20); // 샘은 바퀴 감소 없음
  });
  it('옛 손잡이 삭제: restRelief·restHunger·restCondition·hpCarry.restHeal 없음', () => {
    expect('restRelief' in BALANCE.provisional.risk).toBe(false);
    expect('restHunger' in PX).toBe(false);
    expect('restCondition' in PX).toBe(false);
    expect('restHeal' in PX.hpCarry).toBe(false);
  });
  it("표시: 타일 설명에 '15% 회복(바퀴마다 줄어듦)', 리스크 도움말의 '내리는 것'에 휴식 타일 줄 없음(샘만)", () => {
    expect(tileHint(getTile('rest-a'))).toContain('15% 회복(바퀴마다 줄어듦)');
    expect(tileHint(getTile('rest-a'))).not.toMatch(/리스크|광기/);
    expect(tileHint(getTile('rest-spring'))).toContain('리스크 −20');
    for (const fid of ['hollow', 'shinigami']) {
      const f = getFaction(fid);
      const down = riskText(f).riskDown.join('\n');
      expect(down).not.toContain('휴식 타일');
      expect(down).toContain(fid === 'hollow' ? '영혼 샘' : '정화의 샘');
      expect(down).toContain('20');
    }
  });
});

describe('210장 2: 바퀴 끝 임시 타일', () => {
  it('수치(provisional): 70% · 1장 · 후보 풀 그대로(specialChance 0.3·eventShare 0.5)', () => {
    expect(TV.draft).toEqual({ cards: 1, chance: 0.7, specialChance: 0.3, eventShare: 0.5 });
  });
  it('고르기 창 없음: draft 는 늘 null, chooseDraft 는 실패. 받으면 정확히 1장(임시, from lap)·못 받으면 0장. 300판에 약 70%', () => {
    let got = 0;
    const N = 300;
    for (let seed = 1; seed <= N; seed++) {
      const e = exp({ seed });
      road(e, {});
      e.pos = L - 1;
      e.phase = 'moving';
      const hand0 = e.hand.length;
      const ev = advance(e);
      expect(ev?.kind).toBe('lap-complete');
      expect(e.draft).toBeNull();
      expect(chooseDraft(e, 0).ok).toBe(false);
      const lapTemps = (e.tempLog ?? []).filter((t) => t.from === 'lap');
      const id = ev?.kind === 'lap-complete' ? ev.rewardTile : null;
      if (id) {
        got++;
        expect(lapTemps).toEqual([{ tileId: id, lap: 1, from: 'lap' }]);
        expect(e.hand.length).toBe(hand0 + 1);
        expect(e.tempHand).toEqual([id]);
        expect(e.variantLog.drafts).toEqual([{ tileId: id, lap: 1 }]);
        expect(e.acquired.length).toBe(0); // 영구 보유에는 안 들어감
      } else {
        expect(lapTemps).toEqual([]);
        expect(e.hand.length).toBe(hand0);
        expect(e.variantLog.drafts).toEqual([]);
      }
    }
    expect(got / N).toBeGreaterThan(0.62);
    expect(got / N).toBeLessThan(0.78);
  });
  it('같은 시드 = 같은 결과(걷기 RNG), 받은 타일은 [한 바퀴 더] 뒤에도 손에', () => {
    const run = (seed: number) => {
      const e = exp({ seed });
      road(e, {});
      e.pos = L - 1;
      e.phase = 'moving';
      const ev = advance(e);
      return { e, id: ev?.kind === 'lap-complete' ? ev.rewardTile : null };
    };
    for (let seed = 1; seed <= 20; seed++) {
      const a = run(seed);
      const b = run(seed);
      expect(a.id).toBe(b.id);
      if (a.id) {
        chooseContinue(a.e);
        expect(a.e.hand).toContain(a.id);
        expect(a.e.tempHand).toContain(a.id);
      }
    }
  });
  it('타일 변수를 끄면(스토리 등) 덱에서 1장 — 역시 70% 임시 타일', () => {
    let got = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const e = exp({ seed, variants: false });
      e.deck = ['prey-nest-a', 'elite-den-a', 'rest-a']; // 새 세이브 덱은 0장(C.120)이라 덱을 준다 — 빈 덱이면 옛 규칙대로 없음
      road(e, {});
      e.pos = L - 1;
      e.phase = 'moving';
      const ev = advance(e);
      const id = ev?.kind === 'lap-complete' ? ev.rewardTile : null;
      if (id) {
        got++;
        expect(e.deck).toContain(id);
        expect(e.tempLog).toEqual([{ tileId: id, lap: 1, from: 'lap' }]);
      }
      expect(e.variantLog.drafts).toEqual([]);
    }
    expect(got).toBeGreaterThan(55);
    expect(got).toBeLessThan(85);
  });
});
