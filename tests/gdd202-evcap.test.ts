// GDD 202장 (C.334): 노력치(능력치) 상한 올리기 — 각 단계에서 상한이 차기까지 '둘 다' 약 15번·'스탯만' 약 8번(★ 권장·연속 0·튜토리얼 몫 뺀 나머지),
// 상한이 가득이어도 흡수 자체는 막지 않는다('둘 다'·'속성만' 언제나, '스탯만'만 흐리게 + 이유 한 줄). 수치 provisional
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { ENEMIES } from '../src/data/enemies';
import pools from '../src/data/enemies/pools.json';
import { getFaction } from '../src/data/factions';
import { STAT_IDS } from '../src/data/schema';
import { addEv, evCaps, evTotal, newEvolution, type EvolutionState } from '../src/engine/evolution';
import { absorbEvOf, advance, chooseAbsorb, createExpedition, finishBattle, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { absorbDescLines, evCapped, evFullText, EV_FULL_TEXT } from '../src/ui/absorbView';

const SX = BALANCE.provisional.stats;
const TUT = BALANCE.provisional.tutorialRun;
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
/** 흡수 한 번의 평균 노력치: 실제 적 ev × 갈래 배율 × ★ 보상(absorbEvOf), 종류 가중치는 출현 풀(pools.json kinds), 일반 75% / 강적 25% (202장 계산 기준) */
const ELITE_SHARE = 0.25;
const KIND_W = (pools as { kinds: Record<string, { weight: number }> }).kinds;
function avgEv(cls: 'normal' | 'elite', mode: 'both' | 'stat', star: number): number {
  let sum = 0;
  let ws = 0;
  for (const e of ENEMIES) {
    if (e.class !== cls || e.id.startsWith('test-')) continue;
    const w = KIND_W[e.id.replace(/^[a-z]+-/, '')]?.weight ?? 1;
    sum += w * Object.values(absorbEvOf({ ev: e.ev ?? {} }, mode, star, 0)).reduce((a, b) => a + (b ?? 0), 0);
    ws += w;
  }
  return sum / ws;
}
const mixEv = (mode: 'both' | 'stat', star: number) => (1 - ELITE_SHARE) * avgEv('normal', mode, star) + ELITE_SHARE * avgEv('elite', mode, star);
/** 그 단계에서 새로 생기는 자리: 1단계 = 상한 − 튜토리얼(모든 능력치 +3 = 18), 2단계부터 = 전 단계 상한과의 차 */
const roomAt = (i: number) => (i === 0 ? SX.evCapTotal[0]! - TUT.statEv * STAT_IDS.length : SX.evCapTotal[i]! - SX.evCapTotal[i - 1]!);

function toAbsorb(factionId: string, evolution: EvolutionState, seed: number): ExpeditionState {
  const exp = createExpedition({ factionId, seed, hunger: 40, condition: 100, deck: DECK, evolution } as Parameters<typeof createExpedition>[0]);
  exp.wildCells = [exp.pos + 1];
  advance(exp);
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  b.finisher = { kind: 'basic-attack', traitId: null, element: null };
  b.riskGained = 0;
  finishBattle(exp, b);
  expect(exp.phase).toBe('absorb');
  return exp;
}
/** 1단계 상한을 능력치 6개에 고르게 꽉 채운 몸 */
function fullEvolution(): EvolutionState {
  const e = newEvolution();
  const cap = evCaps(0);
  for (let i = 0; i < 99 && evTotal(e.ev) < cap.total; i++) for (const k of STAT_IDS) addEv(e, { [k]: 1 });
  expect(evTotal(e.ev)).toBe(cap.total);
  return e;
}

describe('202장 1·2: 노력치 상한 = 흡수 횟수 기준', () => {
  it('상한 [56, 108, 168, 240] · 능력치 하나 60% · 단계마다 오른다', () => {
    expect(SX.evCapTotal).toEqual([56, 108, 168, 240]);
    expect(SX.evCapPerStatRatio).toBe(0.6);
    for (let i = 1; i < SX.evCapTotal.length; i++) expect(SX.evCapTotal[i]!).toBeGreaterThan(SX.evCapTotal[i - 1]!);
    expect(evCaps(0)).toEqual({ total: 56, perStat: 33 });
    expect(evCaps(3)).toEqual({ total: 240, perStat: 144 });
  });
  it("각 단계에서 새 자리가 차기까지 '둘 다' 13~17번 · '스탯만' 7~9번 (★ 권장·연속 0, 실제 적 ev 로 계산)", () => {
    SX.evCapTotal.forEach((_, i) => {
      const both = roomAt(i) / mixEv('both', i + 1);
      const stat = roomAt(i) / mixEv('stat', i + 1);
      expect(both, `${i + 1}단계 '둘 다' ${both.toFixed(1)}번`).toBeGreaterThanOrEqual(13);
      expect(both, `${i + 1}단계 '둘 다' ${both.toFixed(1)}번`).toBeLessThanOrEqual(17);
      expect(stat, `${i + 1}단계 '스탯만' ${stat.toFixed(1)}번`).toBeGreaterThanOrEqual(7);
      expect(stat, `${i + 1}단계 '스탯만' ${stat.toFixed(1)}번`).toBeLessThanOrEqual(9);
    });
  });
  it("한 능력치만 노리는 '스탯만'(★1 일반 4)도 1단계에서 7번 이상은 능력치 하나 상한에 먼저 막히지 않는다", () => {
    const e = newEvolution();
    for (const k of STAT_IDS) addEv(e, { [k]: TUT.statEv }); // 튜토리얼
    let n = 0;
    while ((addEv(e, { spd: 4 }).spd ?? 0) >= 4) n++;
    expect(n).toBeGreaterThanOrEqual(7);
    expect(e.ev.spd).toBeLessThanOrEqual(evCaps(0).perStat);
    expect(evTotal(e.ev)).toBeLessThan(evCaps(0).total); // 합계가 아니라 능력치 하나 상한이 막은 것
  });
  it('섞어 먹으면(튜토리얼 뒤 둘 다 흡수 15번, 능력치 6개 번갈아) 능력치 하나 상한에 닿지 않고 합계가 먼저 찬다', () => {
    const e = newEvolution();
    for (const k of STAT_IDS) addEv(e, { [k]: TUT.statEv });
    const cap = evCaps(0);
    let i = 0;
    while (evTotal(e.ev) < cap.total) addEv(e, { [STAT_IDS[i++ % STAT_IDS.length]!]: 3 });
    for (const k of STAT_IDS) expect(e.ev[k]).toBeLessThan(cap.perStat);
  });
});

describe('202장 3: 상한이 가득이어도 흡수는 막지 않는다', () => {
  for (const factionId of ['hollow', 'shinigami']) {
    it(`${factionId}: '둘 다'·'속성만'은 그대로 되고(흡수 수·속성 카운트 오름), '스탯만'도 실행은 된다(노력치만 0)`, () => {
      for (const [mode, seed] of [['both', 11], ['trait', 12], ['stat', 13]] as const) {
        const exp = toAbsorb(factionId, fullEvolution(), seed);
        const element = exp.absorbOffer!.element;
        const before = evTotal(exp.evolution.ev);
        expect(evCapped(exp, mode)).toBe(mode !== 'trait'); // 능력치를 주는 갈래는 가득 표시, 속성만은 원래 능력치가 없다
        const r = chooseAbsorb(exp, null, undefined, mode);
        expect(r.ok, `${mode}: ${r.ok ? '' : r.reason}`).toBe(true);
        expect(exp.evolution.absorbs).toBe(1);
        expect(exp.evolution.elementAbsorbs[element] ?? 0).toBe(mode === 'stat' ? 0 : 1);
        expect(evTotal(exp.evolution.ev)).toBe(before);
        expect(exp.phase).toBe('moving');
      }
    });
    it(`${factionId}: 설명 칸 이유 한 줄 — '스탯만' = 얻는 것이 없다 · '둘 다' = 블록·속성 강화는 그대로`, () => {
      const faction = getFaction(factionId);
      const exp = toAbsorb(factionId, fullEvolution(), 21);
      const warnOf = (m: 'both' | 'trait' | 'stat') => absorbDescLines(faction, exp, m).filter((l) => l.kind === 'warn').map((l) => l.text);
      expect(warnOf('stat')).toContain(evFullText('stat'));
      expect(evFullText('stat')).toContain('얻는 것이 없다');
      expect(warnOf('both')).toContain(evFullText('both'));
      expect(evFullText('both')).toContain('블록과 속성 강화는 그대로');
      expect(warnOf('trait')).toEqual([]); // 속성만 = 원래 능력치 없음이라 가득 경고 없음
      for (const m of ['both', 'stat'] as const) expect(evFullText(m).startsWith(EV_FULL_TEXT)).toBe(true);
    });
  }
  it("화면: '스탯만' 버튼만 흐리게(aria-disabled) — 자리는 그대로, [흡수] 버튼은 어떤 갈래든 실행한다 (173장 2 버튼 자리 고정)", () => {
    const src = readFileSync('src/ui/absorbView.ts', 'utf8');
    expect(src).toContain("if (m === 'stat' && evCapped(exp, m)) b.setAttribute('aria-disabled', 'true');");
    expect(src).toContain('go.onclick = () => run(sel);');
    expect(src).not.toMatch(/go\.(disabled|setAttribute\('aria-disabled')/);
    // 갈래 버튼 4개는 가득이어도 전부 그려진다(사라지거나 당겨 오지 않음)
    expect(src).toContain('const btns = ABSORB_MODES.map((m) => {');
  });
});
