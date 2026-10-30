// C.124 (GDD 65장 v5.151): 새 타일 4종 — 뼈 표식/수련 말뚝(승리 노력치 +1) · 포식자 둥지/사냥꾼 출몰지(사냥꾼, 흡수 후보 2배) · 영혼 샘/정화의 샘(회복 없이 리스크 ×2) · 메아리(앞 칸 효과 한 번 더)
import { describe, expect, it } from 'vitest';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { baseTilesFor, getTile, tileName, upgradeIdOf } from '../src/data/tiles';
import { getEnemy } from '../src/data/enemies';
import { createRng } from '../src/engine/rng';
import { buildOffer } from '../src/engine/absorb';
import { evCaps } from '../src/engine/evolution';
import {
  advance, createExpedition, drainEvents, finishBattle, finishRest, resolveEvent, startBattle, trainingStatOf, type ExpeditionState,
} from '../src/engine/expedition';
import { newSaveData, sanitizeDeck } from '../src/game';
import { tileHint } from '../src/ui/labels';
import { GUIDES, guideVars, helpVars, renderHelpText } from '../src/data/help';
import { getFaction } from '../src/data/factions';

const T = BALANCE.provisional.tiles;
const L = BALANCE.expedition.loopTiles;
const RX = BALANCE.provisional.risk;

function exp(seed = 7): ExpeditionState {
  return createExpedition({ factionId: 'hollow', seed, hunger: 20, condition: 60, deck: sanitizeDeck(newSaveData('hollow', 1).tiles, 'hollow'), tileVariants: true });
}

function road(e: ExpeditionState, tiles: Record<number, string>): void {
  e.slots = Array.from({ length: L }, (_, c) => tiles[c] ?? null);
  e.wildCells = [];
}

/** 흡수 화면이 열렸으면 고르지 않고 걷기로 (메아리 시험용) */
function skipAbsorb(e: ExpeditionState): void {
  if ((e.phase as string) !== 'absorb') return;
  e.phase = 'moving';
  e.absorbOffer = null;
}

function winBattle(e: ExpeditionState) {
  const b = startBattle(e);
  b.status = 'won';
  b.enemy.hp = 0;
  return finishBattle(e, b);
}

describe('데이터 (GDD 65장)', () => {
  it('BALANCE_VERSION 61 이상', () => {
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(61);
  });

  it('4종 모두 두 종족 이름(종족 설정 name 만), 덱·뽑기 후보에 든다', () => {
    const names: Record<string, [string, string]> = {
      'env-training': ['뼈 표식', '수련 말뚝'], 'hunter-den': ['포식자 둥지', '사냥꾼 출몰지'], 'rest-spring': ['영혼 샘', '정화의 샘'], echo: ['메아리 동굴', '메아리 비석'],
    };
    for (const [id, [h, s]] of Object.entries(names)) {
      expect(tileName(id, 'hollow')).toBe(h);
      expect(tileName(id, 'shinigami')).toBe(s);
      for (const f of ['hollow', 'shinigami']) expect(baseTilesFor(f).some((t) => t.id === id)).toBe(true);
      expect(tileHint(getTile(id)).length).toBeGreaterThan(0);
    }
    expect(upgradeIdOf('echo')).toBeNull(); // 특수 타일은 합성 안 함
    expect(upgradeIdOf('hunter-den')).toBe('hunter-den-plus');
  });

  it('타일 안내에 4종 한 줄 — 자리표시자가 모두 풀린다', () => {
    for (const f of [getFaction('hollow'), getFaction('shinigami')]) {
      const step = GUIDES['tile-draw']!.find((s) => s.id === 'special')!;
      const text = renderHelpText(step.body, { ...helpVars(f), ...guideVars(f) });
      expect(text).not.toContain('{');
      for (const id of ['env-training', 'hunter-den', 'rest-spring', 'echo']) expect(text).toContain(tileName(id, f.id));
    }
  });
});

describe('뼈 표식 / 수련 말뚝', () => {
  it('이 칸 전투에 이기면 적 노력치가 가장 큰 능력치 +1, 엔진 이벤트로 알린다', () => {
    const e = exp();
    road(e, { 3: 'env-training' });
    e.pos = 2;
    expect(advance(e)?.kind).toBe('battle');
    expect(e.pending!.mods?.trainingEv).toBe(T.training.ev);
    const enemy = e.pending!.enemy;
    const stat = trainingStatOf(enemy)!;
    const before = e.evolution.ev[stat];
    drainEvents(e);
    winBattle(e);
    expect(e.evolution.ev[stat]).toBe(before + T.training.ev);
    expect(drainEvents(e)).toContainEqual({ kind: 'tile-ev', stat, amount: T.training.ev });
  });

  it('단계 상한이면 0 (넘기지 않는다)', () => {
    const e = exp();
    road(e, { 3: 'env-training' });
    e.pos = 2;
    advance(e);
    const stat = trainingStatOf(e.pending!.enemy)!;
    e.evolution.ev[stat] = evCaps(e.evolution.tierIndex).perStat;
    winBattle(e);
    expect(e.evolution.ev[stat]).toBe(evCaps(e.evolution.tierIndex).perStat);
    expect(drainEvents(e)).toContainEqual({ kind: 'tile-ev', stat, amount: 0 });
  });
});

describe('포식자 둥지 / 사냥꾼 출몰지', () => {
  it('사냥꾼 = 강적 × 체력·공격 배율, 강적 바퀴 상한은 같이 쓴다', () => {
    const a = exp(11);
    road(a, { 3: 'elite-den-a' });
    a.pos = 2;
    advance(a);
    const b = exp(11);
    road(b, { 3: 'hunter-den' });
    b.pos = 2;
    advance(b);
    expect(b.pending!.elite).toBe(true);
    expect(b.pending!.enemy.id).toBe(a.pending!.enemy.id); // 같은 시드 = 같은 강적 풀 적
    expect(b.pending!.enemy.hpInAttacks).toBeCloseTo(a.pending!.enemy.hpInAttacks * T.hunter.hpMult);
    expect(b.pending!.enemy.attackInAttacks).toBeCloseTo(a.pending!.enemy.attackInAttacks * T.hunter.attackMult);
    expect(b.pending!.mods?.absorbMult).toBe(T.hunter.absorbCandidateMult);
    // 강적 바퀴 상한은 같이 쓴다: 이미 강적을 만난 바퀴면 일반 적 (사냥꾼 배율·후보 배율 없음)
    const c = exp(11);
    road(c, { 3: 'hunter-den' });
    c.elitesThisLap = BALANCE.battle.maxElitesPerLap;
    c.pos = 2;
    advance(c);
    expect(c.pending!.elite).toBe(false);
    expect(c.pending!.mods?.absorbMult).toBeUndefined();
  });

  it('이기면 흡수 후보 수 2배 (강적 기본 2 → 4)', () => {
    const e = exp(5);
    road(e, { 3: 'hunter-den' });
    e.pos = 2;
    advance(e);
    winBattle(e);
    expect(e.phase).toBe('absorb');
    // C.125 (70장): 후보는 그 적 속성 안에서만. C.127 (75장): 특수 속성 특성 숨김이 없어져 늘 배율만큼
    // C.220 (GDD 126-1 수정 1): 후보는 블록(skill) 특성만 — 그 속성 블록 수(3)가 상한
    expect(e.absorbOffer!.candidates.length).toBe(Math.min(3, BALANCE.provisional.absorb.candidatesElite * T.hunter.absorbCandidateMult));
    // buildOffer 단위: 배율 1 이면 예전과 같다
    const enemy = { ...getEnemy('fire-heavy-seal'), class: 'elite' as const }; // C.125: 원소 속성 적으로
    const input = { status: 'won' as const, finisher: null, chain3Count: 0, weakChain3Count: 0, params: { skills: [] } };
    const build = { owned: [], slots: [null, null, null, null] };
    expect(buildOffer(createRng(1), enemy, build, input).candidates.length).toBe(BALANCE.provisional.absorb.candidatesElite);
    expect(buildOffer(createRng(1), enemy, build, input, 0, null, 2).candidates.length).toBe(Math.min(3, BALANCE.provisional.absorb.candidatesElite * 2)); // C.220: 블록 특성만(그 속성 3개)
  });
});

describe('영혼 샘 / 정화의 샘', () => {
  it('배부름·컨디션 회복 없음, 리스크는 휴식(rest-a)의 ×2', () => {
    const run = (id: string) => {
      const e = exp();
      road(e, { 3: id });
      e.risk = 60;
      e.hunger = 50;
      e.pos = 2;
      expect(advance(e)?.kind).toBe('rest');
      const h = e.hunger;
      const c = e.condition;
      finishRest(e);
      return { risk: 60 - e.risk, hunger: h - e.hunger, cond: e.condition - c, spring: e.restSpring };
    };
    const rest = run('rest-a');
    const spring = run('rest-spring');
    expect(rest.risk).toBe(RX.restRelief);
    expect(spring.risk).toBe(RX.restRelief * T.spring.riskReliefMult);
    expect(spring.hunger).toBe(0);
    expect(spring.cond).toBe(0);
    expect(rest.hunger).toBeGreaterThan(0);
    expect(spring.spring).toBe(false); // 휴식이 끝나면 풀린다
  });
});

describe('메아리', () => {
  it('앞 칸이 적 타일이면 한 번 더 등장', () => {
    const e = exp();
    road(e, { 3: 'prey-nest-a', 4: 'echo' });
    e.pos = 2;
    expect(advance(e)?.kind).toBe('battle');
    winBattle(e);
    skipAbsorb(e);
    const ev = advance(e);
    expect(ev?.kind).toBe('battle');
    expect(e.pos).toBe(4);
    expect(e.pending!.tileId).toBe('prey-nest-a');
  });

  it('앞 칸이 이벤트면 한 번 더 (이벤트 타일은 사라져도 메아리는 남는다)', () => {
    const e = exp();
    road(e, { 3: 'event-treasure', 4: 'echo' });
    e.pos = 2;
    expect(advance(e)?.kind).toBe('event');
    resolveEvent(e, null);
    expect(e.slots[3]).toBeNull();
    expect(advance(e)?.kind).toBe('event');
    resolveEvent(e, null);
    expect(e.slots[4]).toBe('echo');
    expect(e.variantLog.events.filter((x) => x.event === 'treasure').length).toBe(2);
  });

  it('앞 칸이 휴식이면 휴식 한 번 더 (샘이면 샘 그대로)', () => {
    const e = exp();
    road(e, { 3: 'rest-spring', 4: 'echo' });
    e.pos = 2;
    advance(e);
    finishRest(e);
    expect(advance(e)?.kind).toBe('rest');
    expect(e.restSpring).toBe(true);
  });

  it('앞 칸이 빈 칸·메아리면 효과 없음 (연쇄 없음)', () => {
    const e = exp();
    road(e, { 3: 'echo', 5: 'prey-nest-a', 6: 'echo', 7: 'echo' });
    e.pos = 2;
    expect(advance(e)?.kind).toBe('move'); // 3: 앞 칸(2) 빈 칸
    expect(advance(e)?.kind).toBe('move'); // 4: 빈 칸
    expect(advance(e)?.kind).toBe('battle'); // 5
    winBattle(e);
    skipAbsorb(e);
    expect(advance(e)?.kind).toBe('battle'); // 6: 메아리 → 5 한 번 더
    winBattle(e);
    skipAbsorb(e);
    expect(advance(e)?.kind).toBe('move'); // 7: 앞 칸이 메아리 → 없음
  });
});
