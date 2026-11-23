// 진화체 모양 측정·자동 분류·목표 비교 (C.523, GDD 8-7 '진화체 밸런스 표기 = 성장 곡선 × 전투 성향' v6.171)
// 사용자 2026-11-23: "노력치 작, 블록 작 안해도 강하지만, 작 해도 리턴이 낮은 경우(저점 높고 고점 낮음) / 노력치작 안하면 개약한데, 노력치작 하면 개쎄짐 / … /
//   일반 모험은 잘 못하는데, 보스전, 강적 등에는 강함" → 성장 곡선 5(평탄·노력·블록·동반·특성) × 전투 성향 8(한방·강적·잡몹·지구전·선공·생존·해방·체인).
// npm run balance 의 'evoProfile' 구간·테스트가 같이 쓴다. 종족·진화체 분기 없음 — 몸 목록은 FORM_TABLE(4단계) × FACTIONS, 목표는 balanceProfiles.json,
// 기준·문턱은 BALANCE.provisional.evoProfile(전부 마스터AR provisional). 기준 몸은 C.520(scripts/lib/evoUniqueBalance.ts)과 같다 — 고유 능력은 켠 채.
import { BALANCE } from '../../src/config/balance';
import { FORM_TABLE, formName } from '../../src/data/evolution';
import { FACTIONS, getFaction } from '../../src/data/factions';
import { evoExtraPetSlots, evoFormEntry } from '../../src/data/evolution/uniques';
import { balanceProfileOf, curveName, leanName, PROFILE_CURVES, PROFILE_LEANS, type BalanceProfile } from '../../src/data/evolution/balanceProfiles';
import { formCategoryOf, STAT_IDS, type StatId } from '../../src/data/schema';
import { createCombat, elapsedSeconds, liberationActive, playCombatHuman, type CombatState } from '../../src/engine/combat';
import { evCaps } from '../../src/engine/evolution';
import { enemyAtDifficulty, recommendedDifficulty } from '../../src/engine/difficulty';
import { bossSetupOf, enemyScale } from '../../src/engine/expedition';
import { ENEMIES, scaleEnemy } from '../../src/data/enemies';
import { BOSSES } from '../../src/data/bosses';
import { buildElementOf, evoBalExemptReason, evoBalKey, evoBodyParams, median, type EvoBalTarget, type EvoBodyInvest } from './evoUniqueBalance';

const P = (): typeof BALANCE.provisional.evoProfile => BALANCE.provisional.evoProfile;

export const INVESTS = ['none', 'ev', 'blk', 'both'] as const;
export type InvestId = (typeof INVESTS)[number];
export const INVEST_NAMES: Record<InvestId, string> = { none: '무투자', ev: '노력치만', blk: '블록만', both: '둘 다' };
export const CONTENTS = ['n', 'e', 'b'] as const;
export type ContentId = (typeof CONTENTS)[number];
export const CONTENT_NAMES: Record<ContentId, string> = { n: '일반', e: '강적', b: '보스' };

export interface ProfileTarget extends EvoBalTarget { hasAbility: boolean; goal: BalanceProfile | null }

/** 측정 대상: 4단계 진화체(retired 제외) × 종족 전부 — 고유 능력이 없는 몸(부오·프레네시·아직 안 짠 히든 등)도 같은 기준 몸으로 */
export function evoProfileTargets(): ProfileTarget[] {
  const out: ProfileTarget[] = [];
  for (const form of FORM_TABLE) {
    if (form.retired || form.tier !== 4) continue;
    for (const { id: factionId } of FACTIONS) {
      const entry = evoFormEntry(form.id, factionId);
      const ability = entry?.ability ?? null;
      out.push({
        formId: form.id, factionId, tier: form.tier, category: formCategoryOf(form, factionId) ?? 'physical', element: buildElementOf(form),
        usesPet: evoExtraPetSlots(form.id, factionId) > 0 || JSON.stringify(ability ?? {}).includes('petPower'),
        exempt: ability ? evoBalExemptReason(ability) : null, hasAbility: ability !== null, goal: balanceProfileOf(form.id, factionId),
      });
    }
  }
  return out;
}

/** 노력치만: 그 단계 노력치 상한 합계를 타입별 비율로(능력치 하나 상한 안). 합 = 상한 합계 이하 */
export function evProfileAllocation(t: Pick<EvoBalTarget, 'tier' | 'category'>): Partial<Record<StatId, number>> {
  const cap = evCaps(t.tier - 1);
  const split = P().invest.evSplit[t.category] ?? P().invest.evSplit.mixed!;
  const out: Partial<Record<StatId, number>> = {};
  for (const s of STAT_IDS) if (split[s]) out[s] = Math.min(cap.perStat, Math.floor(cap.total * split[s]!));
  return out;
}

/** 투자 칸 → 기준 몸에 얹을 것. 무투자 = 노력치 0·흡수 특성/블록 강화 없음, 블록만 = 그 속성 공격 특성 2개 + 강화 표준, 둘 다 = 둘 다 */
export function evoProfileInvest(t: EvoBalTarget, inv: InvestId): EvoBodyInvest {
  const blk = inv === 'blk' || inv === 'both';
  const ev = inv === 'ev' || inv === 'both';
  return { skills: blk, enhance: blk ? P().invest.enhance : 0, ev: ev ? evProfileAllocation(t) : null };
}

export interface CellStat { win: number; secs: number; games: number }
export interface ProfileMeasure {
  target: ProfileTarget;
  star: number;
  cells: Record<InvestId, Record<ContentId, CellStat>>;
  /** 강적 처치 초(이긴 판) 분포: 투자 칸마다 변동계수·하위 10% 시간 ÷ 평균을 낸 뒤 평균 (한방 성향) */
  spread: { cv: number; p10: number };
  /** 전투 시간대별 초당 피해: 앞 1/3 · 뒤 1/3 (지구전·선공 성향) — 모든 판 합 */
  timeline: { front: number; back: number };
  /** 해방 중 · 밖 초당 피해 (해방 성향). 해방이 한 틱도 없으면 in = null */
  lib: { in: number | null; out: number };
  /** 3체인 이상 블록 피해 ÷ 준 피해 전체 (체인 성향) */
  chain3: number;
}

export interface ProfileSeeds { n: number; e: number; b: number }

interface Acc { g: number; w: number; secs: number; times: number[] }
interface Track { front: number; frontT: number; back: number; backT: number; lib: number; libT: number; out: number; outT: number; chain3: number; total: number; tick: number }

const POOL = ENEMIES.filter((e) => !e.testOnly);

function fightTracked(s: CombatState, tr: Track): CombatState {
  const dmg: number[] = [];
  const lib: boolean[] = [];
  let prev = s.enemy.hp;
  const end = playCombatHuman(s, {
    onStep: (x) => {
      const d = Math.max(0, prev - x.enemy.hp);
      prev = x.enemy.hp;
      dmg.push(d);
      lib.push(liberationActive(x));
      for (const e of x.events) if (e.kind === 'block' && e.chain >= 3) tr.chain3 += e.damage;
    },
  });
  const T = dmg.length;
  const third = Math.floor(T / 3);
  for (let i = 0; i < T; i++) {
    const d = dmg[i]!;
    tr.total += d;
    if (i < third) { tr.front += d; tr.frontT++; }
    if (i >= T - third) { tr.back += d; tr.backT++; }
    if (lib[i]) { tr.lib += d; tr.libT++; } else { tr.out += d; tr.outT++; }
  }
  tr.tick = end.params.tickSeconds;
  return end;
}

function runContent(t: ProfileTarget, inv: InvestId, star: number, seeds: ProfileSeeds, tr: Track): Record<ContentId, Acc> {
  const acc: Record<ContentId, Acc> = { n: { g: 0, w: 0, secs: 0, times: [] }, e: { g: 0, w: 0, secs: 0, times: [] }, b: { g: 0, w: 0, secs: 0, times: [] } };
  const add = (c: ContentId, end: CombatState) => {
    const a = acc[c];
    a.g++;
    if (end.status === 'won') { a.w++; const sec = elapsedSeconds(end); a.secs += sec; a.times.push(sec); }
  };
  for (const ascended of [false, true]) {
    const params = evoBodyParams(t, true, ascended, star, evoProfileInvest(t, inv));
    for (const [cls, c, n] of [['normal', 'n', seeds.n], ['elite', 'e', seeds.e]] as const) {
      POOL.filter((e) => e.class === cls).forEach((base, ei) => {
        for (let k = 1; k <= n; k++) add(c, fightTracked(createCombat(70000 + ei * 211 + k * 37 + star, { enemy: enemyAtDifficulty(base, star), params: { ...params } }), tr));
      });
    }
    BOSSES.filter((b) => b.difficulty === star).forEach((boss, bi) => {
      for (let k = 1; k <= seeds.b; k++) add('b', fightTracked(createCombat(71000 + bi * 307 + k * 41, { enemy: scaleEnemy(boss.enemy, enemyScale(1, 'forest', boss.difficulty)), params: { ...params }, boss: bossSetupOf(boss.id) }), tr));
    });
  }
  return acc;
}

function spreadOf(times: readonly number[]): { cv: number; p10: number } {
  if (times.length < 2) return { cv: 0, p10: 1 };
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const sd = Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length);
  const s = [...times].sort((a, b) => a - b);
  return { cv: mean > 0 ? sd / mean : 0, p10: mean > 0 ? s[Math.floor(s.length * 0.1)]! / mean : 1 };
}

/** 한 몸: 투자 4칸 × 권장 ★ 일반·강적·보스, 해방 전 몸·레스렉시온/만해 몸을 같은 판 수로 합침 (같은 시드 — 투자 칸끼리 짝 비교) */
export function measureEvoProfile(t: ProfileTarget, seeds: ProfileSeeds = P().seeds): ProfileMeasure {
  const star = recommendedDifficulty(t.tier - 1);
  const tr: Track = { front: 0, frontT: 0, back: 0, backT: 0, lib: 0, libT: 0, out: 0, outT: 0, chain3: 0, total: 0, tick: 0.05 };
  const cells = {} as Record<InvestId, Record<ContentId, CellStat>>;
  const spreads: { cv: number; p10: number }[] = [];
  for (const inv of INVESTS) {
    const acc = runContent(t, inv, star, seeds, tr);
    cells[inv] = { n: cellOf(acc.n), e: cellOf(acc.e), b: cellOf(acc.b) };
    spreads.push(spreadOf(acc.e.times));
  }
  const ps = (ticks: number) => (ticks > 0 ? ticks * tr.tick : 0);
  const dps = (d: number, ticks: number) => (ps(ticks) > 0 ? d / ps(ticks) : 0);
  return {
    target: t, star, cells,
    spread: { cv: spreads.reduce((a, s) => a + s.cv, 0) / spreads.length, p10: spreads.reduce((a, s) => a + s.p10, 0) / spreads.length },
    timeline: { front: dps(tr.front, tr.frontT), back: dps(tr.back, tr.backT) },
    lib: { in: tr.libT > 0 ? dps(tr.lib, tr.libT) : null, out: dps(tr.out, tr.outT) },
    chain3: tr.total > 0 ? Math.min(1, tr.chain3 / tr.total) : 0,
  };
}

const cellOf = (a: Acc): CellStat => ({ win: a.g ? a.w / a.g : 0, secs: a.w ? a.secs / a.w : 0, games: a.g });

/** 칸 값 = 승률 ÷ 처치 초 (초당 기대 처치 수에 비례). 한 판도 못 이기면 0 */
export const cellValue = (c: CellStat): number => (c.secs > 0 ? c.win / c.secs : 0);

// ── 분류 ──

/** 분류에 쓰는 측정 요약 (테스트가 직접 만들 수 있게 측정과 분리) */
export type ProfileInput = Pick<ProfileMeasure, 'target' | 'cells' | 'spread' | 'timeline' | 'lib' | 'chain3'>;

export interface TierMedians {
  cell: Record<InvestId, Record<ContentId, number>>;
  cv: number; late: number; lib: number; chain3: number; loss: number; eliteWin: number; value: number;
}

const EPS = 1e-6;
const lg = (x: number): number => Math.log(Math.max(EPS, x));
const lateOf = (r: ProfileInput): number => (r.timeline.front > 0 ? r.timeline.back / r.timeline.front : 1);
const libOf = (r: ProfileInput): number | null => (r.lib.in !== null && r.lib.out > 0 ? r.lib.in / r.lib.out : null);
const lossOf = (r: ProfileInput): number => 1 - INVESTS.reduce((a, i) => a + (r.cells[i].e.win + r.cells[i].b.win) / 2, 0) / INVESTS.length;
const eliteWinOf = (r: ProfileInput): number => INVESTS.reduce((a, i) => a + r.cells[i].e.win, 0) / INVESTS.length;

/** 칸 값 ÷ 같은 단계 그 칸 중앙값 */
function rel(r: ProfileInput, m: Pick<TierMedians, 'cell'>, i: InvestId, c: ContentId): number {
  const med = m.cell[i][c];
  return med > 0 ? cellValue(r.cells[i][c]) / med : 0;
}

/** 가치 총량 = Σ 투자 가중 × 콘텐츠 가중 × 상대 칸 값 (중앙값 몸 ≈ 1) */
export function profileValue(r: ProfileInput, m: Pick<TierMedians, 'cell'>): number {
  const W = P().value;
  let v = 0;
  for (const i of INVESTS) for (const c of CONTENTS) v += (W.invest[i] ?? 0) * (W.content[c] ?? 0) * rel(r, m, i, c);
  return v;
}

/** 같은 단계 중앙값 (몸 목록 rs 는 한 단계) */
export function tierMedians(rs: readonly ProfileInput[]): TierMedians {
  const cell = {} as TierMedians['cell'];
  for (const i of INVESTS) cell[i] = { n: median(rs.map((r) => cellValue(r.cells[i].n))), e: median(rs.map((r) => cellValue(r.cells[i].e))), b: median(rs.map((r) => cellValue(r.cells[i].b))) };
  const libs = rs.map(libOf).filter((x): x is number => x !== null);
  const partial = { cell };
  return {
    cell, cv: median(rs.map((r) => r.spread.cv)), late: median(rs.map(lateOf)), lib: libs.length ? median(libs) : 1, chain3: median(rs.map((r) => r.chain3)),
    loss: median(rs.map(lossOf)), eliteWin: median(rs.map(eliteWinOf)), value: median(rs.map((r) => profileValue(r, partial))),
  };
}

export interface CurveFeatures { lo: number; hi: number; ev: number; blk: number; syn: number; both: number }
export type Confidence = '높음' | '중간' | '낮음';
export interface ProfileVerdict {
  key: string;
  feat: CurveFeatures;
  /** sim = 원형마다 코사인 유사도 */
  curve: { id: string; conf: Confidence; sim: Record<string, number> };
  lean: { id: string | null; conf: Confidence | null; scores: Record<string, number> };
  value: number;
  /** 가치 총량 ÷ 같은 단계 중앙값 − 1 */
  valueDev: number;
}

/** 곡선 특징 (같은 단계 중앙값 대비 log 비): 콘텐츠 가중 평균 상대 값 P[투자] 로 lo = log P[무투자], hi = log P[둘 다], ev·blk = 그 투자만 했을 때 오른 몫, syn = 둘 다 − ev − blk */
export function curveFeatures(r: ProfileInput, m: Pick<TierMedians, 'cell'>): CurveFeatures {
  const W = P().value.content;
  const pv = (i: InvestId) => CONTENTS.reduce((a, c) => a + (W[c] ?? 0) * rel(r, m, i, c), 0);
  const lo = lg(pv('none'));
  const hi = lg(pv('both'));
  const ev = lg(pv('ev')) - lo;
  const blk = lg(pv('blk')) - lo;
  const both = hi - lo;
  return { lo, hi, ev, blk, syn: both - ev - blk, both };
}

/** 성향 점수 (특징 ÷ 문턱, 1 이상이면 그 성향) */
export function leanScores(r: ProfileInput, m: TierMedians): Record<string, number> {
  const T = P().lean.thresholds;
  const R = (c: ContentId) => INVESTS.reduce((a, i) => a + rel(r, m, i, c), 0) / INVESTS.length;
  const Rn = R('n'), Re = R('e'), Rb = R('b');
  const late = lg(lateOf(r)) - lg(m.late);
  const lib = libOf(r);
  const f: Record<string, number> = {
    burst: (lg(r.spread.cv) - lg(m.cv)) * (eliteWinOf(r) > m.eliteWin + 1e-9 ? 0.5 : 1),
    elite: lg((Re + Rb) / 2) - lg(Rn),
    mob: lg(Rn) - lg(Rb),
    long: late,
    opener: -late,
    survive: (lg(m.loss + 0.02) - lg(lossOf(r) + 0.02)) * ((Rn + Re + Rb) / 3 > 1.05 ? 0.5 : 1),
    release: lib === null ? 0 : lg(lib) - lg(m.lib),
    chain: lg(r.chain3 + 0.01) - lg(m.chain3 + 0.01),
  };
  const out: Record<string, number> = {};
  for (const { id } of PROFILE_LEANS) out[id] = (f[id] ?? 0) / (T[id] ?? 1);
  return out;
}

/** 자동 분류: 곡선 = 방향이 가장 가까운 원형(특징 ÷ d 와 원형의 코사인 유사도), 성향 = 점수가 가장 큰 것(1 미만이면 없음). 확신도 규칙 = balance provisional.evoProfile.
 *  m = 모양 기준(같은 단계·같은 타입 중앙값), mv = 가치 총량 기준(같은 단계 중앙값) */
export function classifyProfile(r: ProfileInput, m: TierMedians, mv: TierMedians = m): ProfileVerdict {
  const C = P().curve;
  const feat = curveFeatures(r, m);
  const x = [feat.lo, feat.hi, feat.ev, feat.blk, feat.syn].map((v) => v / C.d);
  const norm = Math.hypot(...x);
  const sim: Record<string, number> = {};
  for (const { id } of PROFILE_CURVES) {
    const p = C.prototypes[id]!;
    const pv = [p.lo, p.hi, p.ev, p.blk, p.syn];
    const pn = Math.hypot(...pv);
    sim[id] = norm > 0 && pn > 0 ? x.reduce((a, v, i) => a + v * pv[i]!, 0) / (norm * pn) : 0;
  }
  const order = Object.keys(sim).sort((a, b) => sim[b]! - sim[a]!);
  const c1 = sim[order[0]!]!;
  const conf: Confidence = c1 >= C.confHigh.cos && norm >= C.confHigh.norm ? '높음' : c1 >= C.confMid.cos && norm >= C.confMid.norm ? '중간' : '낮음';
  const scores = leanScores(r, m);
  const best = Object.keys(scores).sort((a, b) => scores[b]! - scores[a]!)[0]!;
  const L = P().lean;
  const s = scores[best]!;
  const value = profileValue(r, mv);
  return {
    key: evoBalKey(r.target), feat, curve: { id: order[0]!, conf, sim },
    lean: s >= 1 ? { id: best, conf: s >= L.confHigh ? '높음' : s >= L.confMid ? '중간' : '낮음', scores } : { id: null, conf: null, scores },
    value, valueDev: mv.value > 0 ? value / mv.value - 1 : 0,
  };
}

/** 모양 기준 묶음 = 단계 + 타입 */
export const shapeGroupOf = (t: Pick<EvoBalTarget, 'tier' | 'category'>): string => `${t.tier}/${t.category}`;

/** 중앙값(단계별 = 가치 총량, 단계·타입별 = 모양) + 몸마다 분류 */
export function classifyAll(rs: readonly ProfileInput[]): { medians: Map<number, TierMedians>; shapeMedians: Map<string, TierMedians>; verdicts: ProfileVerdict[] } {
  const medians = new Map<number, TierMedians>();
  for (const tier of new Set(rs.map((r) => r.target.tier))) medians.set(tier, tierMedians(rs.filter((r) => r.target.tier === tier)));
  const shapeMedians = new Map<string, TierMedians>();
  for (const g of new Set(rs.map((r) => shapeGroupOf(r.target)))) shapeMedians.set(g, tierMedians(rs.filter((r) => shapeGroupOf(r.target) === g)));
  return { medians, shapeMedians, verdicts: rs.map((r) => classifyProfile(r, shapeMedians.get(shapeGroupOf(r.target))!, medians.get(r.target.tier)!)) };
}

/** 목표 비교 가드 (balanceProfile 이 있는 몸만): 곡선 조건 · 목표 성향 점수 ≥ 1 · 가치 총량 같은 단계 중앙값 ±band. 실패 한 줄씩 */
export function judgeProfileGoal(goal: BalanceProfile, v: ProfileVerdict): string[] {
  const G = P().guard;
  const f = v.feat;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const fails: string[] = [];
  const head = `진화체 모양: ${v.key} 목표 ${goal.curve}${goal.lean ? `·${goal.lean}` : ''}`;
  if (goal.curve === 'flat' && !(f.lo >= G.flat.loMin && f.both <= G.flat.bothGainMax)) fails.push(`${head} — 평탄 곡선 조건(저점 ≥ +${pct(G.flat.loMin)} · 둘 다 이득 ≤ 중앙값) 밖: 저점 ${pct(f.lo)} · 둘 다 이득 ${pct(f.both)}`);
  if (goal.curve === 'effort' && !(f.ev >= G.effort.evMin && f.ev - f.blk >= G.effort.overBlk)) fails.push(`${head} — 노력 곡선 조건(노력치 이득 ≥ +${pct(G.effort.evMin)} · 블록 이득보다 큼) 밖: 노력치 ${pct(f.ev)} · 블록 ${pct(f.blk)}`);
  if (goal.curve === 'block' && !(f.blk >= G.block.blkMin && f.blk - f.ev >= G.block.overEv)) fails.push(`${head} — 블록 곡선 조건(블록 이득 ≥ +${pct(G.block.blkMin)} · 노력치 이득보다 큼) 밖: 블록 ${pct(f.blk)} · 노력치 ${pct(f.ev)}`);
  if (goal.curve === 'joint' && !(f.syn >= G.joint.synMin && f.both >= G.joint.bothGainMin)) fails.push(`${head} — 동반 곡선 조건(같이 키움 상승 ≥ +${pct(G.joint.synMin)} · 둘 다 이득 ≥ +${pct(G.joint.bothGainMin)}) 밖: 상승 ${pct(f.syn)} · 둘 다 ${pct(f.both)}`);
  if (goal.curve === 'trait' && !(f.lo <= G.trait.loMax && f.hi <= G.trait.hiMax)) fails.push(`${head} — 특성 곡선 조건(저점·고점 ≤ ${pct(G.trait.loMax)}) 밖: 저점 ${pct(f.lo)} · 고점 ${pct(f.hi)}`);
  if (goal.lean !== null && !((v.lean.scores[goal.lean] ?? 0) >= 1)) fails.push(`${head} — 성향 점수 ${(v.lean.scores[goal.lean] ?? 0).toFixed(2)} < 1`);
  if (goal.curve !== 'trait' && Math.abs(v.valueDev) > P().value.band + 1e-9) fails.push(`${head} — 가치 총량 ${(v.valueDev >= 0 ? '+' : '') + pct(v.valueDev)} 가 같은 단계 중앙값 ±${pct(P().value.band)} 밖`);
  return fails;
}

// ── 출력 (npm run balance 표 · docs/drafts 문서) ──

export const profileName = (t: Pick<EvoBalTarget, 'formId' | 'factionId'>): string => {
  const form = FORM_TABLE.find((f) => f.id === t.formId);
  return `${form ? formName(form, t.factionId) : t.formId}(${getFaction(t.factionId).name ?? t.factionId})`;
};
const CAT_NAMES: Record<string, string> = { physical: '물리', special: '특수', mixed: '혼합' };
const pc = (x: number) => (x * 100).toFixed(0);
const sg = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;

/** 곡선별·성향별 몇 종 + 가치 총량 평균 (자동 추정 기준) */
export function profileDistribution(vs: readonly ProfileVerdict[]): { curves: { id: string; name: string; n: number; value: number }[]; leans: { id: string | null; name: string; n: number; value: number }[] } {
  const avg = (xs: ProfileVerdict[]) => (xs.length ? xs.reduce((a, v) => a + v.valueDev, 0) / xs.length : 0);
  return {
    curves: PROFILE_CURVES.map((c) => { const xs = vs.filter((v) => v.curve.id === c.id); return { id: c.id, name: c.name, n: xs.length, value: avg(xs) }; }),
    leans: [...PROFILE_LEANS.map((l) => ({ id: l.id as string | null, name: l.name })), { id: null, name: '성향 없음' }].map((l) => { const xs = vs.filter((v) => v.lean.id === l.id); return { ...l, n: xs.length, value: avg(xs) }; }),
  };
}

/** 몸 한 줄 (npm run balance 출력) */
export function profileLine(r: ProfileMeasure, v: ProfileVerdict, m: TierMedians): string {
  const cells = INVESTS.map((i) => CONTENTS.map((c) => pc(rel(r, m, i, c)).padStart(3)).join('/')).join('  ');
  return `  ${profileName(r.target).padEnd(16)} ${r.target.formId.padEnd(22)} ${(CAT_NAMES[r.target.category] ?? r.target.category).padEnd(2)} ${r.target.hasAbility ? '능' : '·'}  ${cells}   ${curveName(v.curve.id)}(${v.curve.conf}) · ${leanName(v.lean.id)}${v.lean.conf ? `(${v.lean.conf})` : ''}  총량 ${sg(v.valueDev)}${Math.abs(v.valueDev) > P().value.band ? ' ◆' : ''}${r.target.goal ? `  목표 ${r.target.goal.curve}${r.target.goal.lean ? `·${r.target.goal.lean}` : ''}` : ''}`;
}

/** docs/drafts/evo-profile-*.md 전체 (규칙·표·분포) — npm run balance -- --only=evoProfile --profile-md=경로 */
export function profileMarkdown(rows: readonly ProfileMeasure[], cls: ReturnType<typeof classifyAll>, date: string, balanceVersion: number): string {
  const E = P();
  const L: string[] = [];
  const vOf = (r: ProfileMeasure) => cls.verdicts.find((v) => v.key === evoBalKey(r.target))!;
  L.push(`# 진화체 모양 실측 (C.523, ${date}, BALANCE ${balanceVersion})`, '');
  L.push('- 사용자 원문(11-23): "노력치 작, 블록 작 안해도 강하지만, 작 해도 리턴이 낮은 경우(저점 높고 고점 낮음) / 노력치작 안하면 개약한데, 노력치작 하면 개쎄짐 / 블록작 안하면 개약한데 블록작 하면 개쎄짐 / 노력, 블록작 같이 해야 점점 강해짐 / 저점도 낮고 고점도 낮지만, 특성이 매력적이라서 가져가야함. / 클리어 확률 자체는 조금 낮지만, 운만 좋으면 훨씬 빠르게 클리어 가능 / 일반 모험은 잘 못하는데, 보스전, 강적 등에는 강함" + 마스터 제안 중 남긴 것(잡몹·지구전·선공·생존·해방·체인).');
  L.push('- 표기(GDD 8-7 v6.171) = 성장 곡선 5(평탄·노력·블록·동반·특성) × 전투 성향 8(한방·강적·잡몹·지구전·선공·생존·해방·체인). 이 표는 **지금 몸의 측정된 모양**(자동 추정) — 목표 배정은 기획A·사용자(`src/data/evolution/balanceProfiles.json`, 지금 전부 null).');
  L.push('- 다시 뽑기: `npm run balance -- --only=evoProfile --profile-md=docs/drafts/evo-profile-1123.md` (약 2분). 측정 코드 `scripts/lib/evoProfile.ts`, 기준·문턱 `BALANCE.provisional.evoProfile`(전부 마스터AR provisional).', '');
  L.push('## 1. 재는 법');
  L.push(`- 몸: 4단계 진화체 ${rows.length}칸(진화체 ${new Set(rows.map((r) => r.target.formId)).size}종 × 종족 2, 고유 능력 있음 ${rows.filter((r) => r.target.hasAbility).length}칸). 기준 몸 = C.520 과 같음(4단계 기준 능력치 균일 97.5 · 리스크 50 · 해방 전 몸 + 레스렉시온/만해 몸 같은 판 수 · 고유 능력 켬).`);
  L.push(`- 투자 4칸: **무투자**(노력치 0 · 흡수 특성/블록 강화 없음 = 기본 블록만) / **노력치만**(4단계 노력치 상한 합계 ${evCaps(3).total}을 타입별로 — 물리 공격·공속 35%씩, 특수 지능·블록속도 35%씩, 혼합 넷에 17.5%씩, 나머지 체력·방어·정신 10%씩) / **블록만**(그 속성 공격 특성 2개 + 그 속성 강화 ${E.invest.enhance}단계 = 블록 위력 +50%) / **둘 다**.`);
  L.push(`- 콘텐츠 3: 권장 ★(★4) 일반 24종 × ${E.seeds.n}판 · 강적 24종 × ${E.seeds.e}판 · ★4 보스 2종 × ${E.seeds.b}판, 몸 2개(해방 전/해방) — 투자 칸마다 같은 시드(짝 비교). 사람형 봇.`);
  L.push('- 칸 값 = 승률 ÷ 처치 초(초당 기대 처치 수). 표의 숫자 = 같은 단계 54칸 그 칸 중앙값 대비 %(100 = 중앙값).');
  L.push('- 성향 지표: 한방 = 강적 처치 초 변동계수(투자 칸마다 낸 뒤 평균)·하위 10% 시간 ÷ 평균 · 지구전/선공 = 전투 뒤 1/3 초당 피해 ÷ 앞 1/3 · 해방 = 해방 중 초당 피해 ÷ 밖 · 체인 = 3체인 이상 블록 피해 ÷ 준 피해 전체 · 생존 = 강적·보스 패배율.', '');
  L.push('## 2. 자동 분류 규칙 (provisional)');
  L.push('- **기준 묶음**: 모양(곡선·성향) = 같은 단계·**같은 타입**(물리·특수·혼합) 중앙값 대비 — 몸 타입 차(물리 몸은 전투 앞쪽이 세고 특수 몸은 블록이 쌓이는 뒤쪽이 셈)가 모양을 덮지 않게. 가치 총량·표 4의 숫자 = 같은 단계 전체 중앙값 대비(타입 차가 그대로 보임).');
  L.push(`- 곡선 특징(log 비, 콘텐츠 가중 일반 ${E.value.content.n}·강적 ${E.value.content.e}·보스 ${E.value.content.b}): 저점 lo = 무투자, 고점 hi = 둘 다, 노력치 이득 ev = 노력치만 − 무투자, 블록 이득 blk = 블록만 − 무투자, 같이 키움 상승 syn = (둘 다 − 무투자) − ev − blk.`);
  L.push(`- 곡선 = 특징 ÷ d(${E.curve.d})와 **방향(코사인 유사도)이 가장 가까운** 원형: ${PROFILE_CURVES.map((c) => { const p = E.curve.prototypes[c.id]!; return `${c.name}(lo ${p.lo}·hi ${p.hi}·ev ${p.ev}·blk ${p.blk}·syn ${p.syn})`; }).join(' · ')}. 확신도 높음 = 유사도 ≥ ${E.curve.confHigh.cos} 이고 중앙에서 ${E.curve.confHigh.norm}d 이상, 중간 = ${E.curve.confMid.cos}·${E.curve.confMid.norm}d, 나머지 낮음(중앙값 근처 몸 — 곡선이 뚜렷하지 않음).`);
  L.push(`- 성향 = 점수(특징 ÷ 문턱)가 가장 큰 것, 1 미만이면 성향 없음. 문턱: ${PROFILE_LEANS.map((l) => `${l.name} ${E.lean.thresholds[l.id]}`).join(' · ')} (log 비). 한방은 강적 승률이 중앙값보다 높으면 ×0.5, 생존은 처치 속도가 중앙값 +5% 넘으면 ×0.5. 확신도 높음 ≥ ${E.lean.confHigh} · 중간 ≥ ${E.lean.confMid}.`);
  L.push(`- 가치 총량 = Σ 투자 가중(무투자 ${E.value.invest.none}·노력치 ${E.value.invest.ev}·블록 ${E.value.invest.blk}·둘 다 ${E.value.invest.both}) × 콘텐츠 가중 × 상대 칸 값. 같은 단계 중앙값 ±${E.value.band * 100}% 밖 = ◆(총량 차 큼).`);
  L.push(`- 목표 비교 가드(balanceProfile 이 있는 몸만, balance:check): 평탄 = 저점 ≥ +${E.guard.flat.loMin * 100}% · 둘 다 이득 ≤ 중앙값 / 노력 = 노력치 이득 ≥ +${E.guard.effort.evMin * 100}% · 블록 이득 이상 / 블록 = 대칭 / 동반 = 상승 ≥ +${E.guard.joint.synMin * 100}% · 둘 다 이득 ≥ +${E.guard.joint.bothGainMin * 100}% / 특성 = 저점·고점 ≤ ${E.guard.trait.loMax * 100}%. 목표 성향 점수 ≥ 1. 가치 총량 ±${E.value.band * 100}%(특성 곡선은 특성 매력이 몫이라 총량 검사 밖). 목표가 비어 있는 몸은 C.520 중앙값 ±10%p 가드 그대로.`, '');
  const all = cls.verdicts;
  const d = profileDistribution(all);
  const ab = profileDistribution(all.filter((v) => rows.find((r) => evoBalKey(r.target) === v.key)!.target.hasAbility));
  L.push('## 3. 분포 (자동 추정)');
  L.push('| 성장 곡선 | 전체 54칸 | 고유 능력 35칸 | 가치 총량 평균(전체) |', '|---|---|---|---|');
  d.curves.forEach((c, i) => L.push(`| ${c.name} | ${c.n} | ${ab.curves[i]!.n} | ${sg(c.value)} |`));
  L.push('', '| 전투 성향 | 전체 54칸 | 고유 능력 35칸 | 가치 총량 평균(전체) |', '|---|---|---|---|');
  d.leans.forEach((l, i) => L.push(`| ${l.name} | ${l.n} | ${ab.leans[i]!.n} | ${sg(l.value)} |`));
  const cc = (c: Confidence) => all.filter((v) => v.curve.conf === c).length;
  L.push('', `- 곡선 확신도: 높음 ${cc('높음')} · 중간 ${cc('중간')} · 낮음 ${cc('낮음')}칸 (낮음 = 같은 타입 중앙값 근처라 곡선이 뚜렷하지 않음). 성향이 잡힌 몸 ${all.filter((v) => v.lean.id !== null).length}칸.`);
  const clear = all.filter((v) => v.curve.conf !== '낮음' || (v.lean.conf !== null && v.lean.conf !== '낮음'));
  L.push(`- 모양이 뚜렷한 몸(곡선 확신 중간 이상 또는 성향 확신 중간 이상, ${clear.length}칸): ${clear.map((v) => `${profileName(rows.find((x) => evoBalKey(x.target) === v.key)!.target)} ${curveName(v.curve.id).replace(' 곡선', '')}(${v.curve.conf})${v.lean.id ? `·${leanName(v.lean.id).replace(' 성향', '')}(${v.lean.conf})` : ''}`).join(' / ')}`);
  L.push('');
  L.push('## 4. 몸별 표 (투자 4칸 × 일반/강적/보스, 100 = 단계 중앙값)');
  L.push('| 진화체(종족) | id | 타입 | 고유 능력 | 무투자 일/강/보 | 노력치만 | 블록만 | 둘 다 | 추정 곡선(확신) | 추정 성향(확신) | 가치 총량 |', '|---|---|---|---|---|---|---|---|---|---|---|');
  const sorted = [...rows].sort((a, b) => a.target.factionId.localeCompare(b.target.factionId) || a.target.formId.localeCompare(b.target.formId));
  for (const r of sorted) {
    const v = vOf(r);
    const m = cls.medians.get(r.target.tier)!;
    const cells = INVESTS.map((i) => CONTENTS.map((c) => pc(rel(r, m, i, c))).join('/'));
    L.push(`| ${profileName(r.target)} | ${r.target.formId} | ${CAT_NAMES[r.target.category] ?? r.target.category} | ${r.target.hasAbility ? (r.target.exempt ? '있음(측정 제외)' : '있음') : '없음'} | ${cells.join(' | ')} | ${curveName(v.curve.id)}(${v.curve.conf}) | ${leanName(v.lean.id)}${v.lean.conf ? `(${v.lean.conf})` : ''} | ${sg(v.valueDev)}${Math.abs(v.valueDev) > E.value.band ? ' ◆' : ''} |`);
  }
  L.push('');
  L.push('## 5. 원값 (승률·초·성향 지표)');
  L.push('| 진화체(종족) | 강적 승률 무/노/블/둘 | 강적 초 무/노/블/둘 | 보스 승률 무/노/블/둘 | 일반 초 무/둘 | 한방 cv·하위10% | 뒤÷앞 피해 | 해방 중÷밖 | 3체인 비중 | 곡선 특징 lo/hi/ev/blk/syn | 성향 점수 상위 2 |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of sorted) {
    const v = vOf(r);
    const f = v.feat;
    const top = Object.entries(v.lean.scores).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id, s]) => `${leanName(id).replace(' 성향', '')} ${s.toFixed(2)}`).join(' · ');
    const lib = libOf(r);
    L.push(`| ${profileName(r.target)} | ${INVESTS.map((i) => pc(r.cells[i].e.win)).join('/')} | ${INVESTS.map((i) => r.cells[i].e.secs.toFixed(1)).join('/')} | ${INVESTS.map((i) => pc(r.cells[i].b.win)).join('/')} | ${r.cells.none.n.secs.toFixed(1)}/${r.cells.both.n.secs.toFixed(1)} | ${r.spread.cv.toFixed(2)}·${r.spread.p10.toFixed(2)} | ${lateOf(r).toFixed(2)} | ${lib === null ? '해방 없음' : lib.toFixed(2)} | ${pc(r.chain3)}% | ${[f.lo, f.hi, f.ev, f.blk, f.syn].map((x) => x.toFixed(2)).join('/')} | ${top} |`);
  }
  L.push('');
  const flagged = [...all].filter((v) => Math.abs(v.valueDev) > E.value.band).sort((a, b) => Math.abs(b.valueDev) - Math.abs(a.valueDev));
  L.push(`## 6. 가치 총량 차가 큰 몸 (같은 단계 중앙값 ±${E.value.band * 100}% 밖, ${flagged.length}칸)`);
  for (const v of flagged) { const r = rows.find((x) => evoBalKey(x.target) === v.key)!; L.push(`- ${profileName(r.target)} \`${v.key}\` ${sg(v.valueDev)} — ${curveName(v.curve.id)}·${leanName(v.lean.id)}`); }
  L.push('');
  return L.join('\n');
}
