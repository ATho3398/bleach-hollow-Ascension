// 진화체 고유 능력 밸런스 측정·판정 (C.520, GDD 8-7 · 19-4 사용자 2026-11-23 "진화체는 지금 구현한 애들 밸런스 맞춰놓고, 다음 짤 애들은 이 밸런스에 맞춰서 진행하자")
// npm run balance 의 '진화체 고유 능력' 구간(evoUnique)과 테스트가 같이 쓴다. 종족·진화체 분기 없음 — 진화체 목록·능력은 uniques.json(진화체 × 종족) 데이터에서 읽는다.
//
// 기준 몸(마스터AR provisional): 그 진화체 4단계 몸 + 레스렉시온/만해 가능(해방 구간 포함 전체 전투) · 능력치 = 4단계 기준 능력치 균일(종족값 차 빼기) ·
//   표준 빌드 = 그 진화체 속성의 공격 특성 2개(그 진화체 타입 계열 + 다음 계열, 노멀·허무·속성 없음 = 뇌·불) · 기준 리스크 50 · 펫을 쓰는 능력(펫 칸 +·펫 공격력)만 기준 펫.
// 켬/끔 = params.evo(고유 능력·특수 블록·해방 변형) 있음/없음. 4단계 한 줄 특성은 둘 다 켠 채(특성 몫은 'abilities' 구간).
import { BALANCE } from '../../src/config/balance';
import { evoExtraPetPower, evoExtraPetSlots, evoFormEntry, evoFormIds, type EvoAbilityDef } from '../../src/data/evolution/uniques';
import { FORM_TABLE } from '../../src/data/evolution';
import { balanceProfileOf } from '../../src/data/evolution/balanceProfiles';
import { formCategoryOf, type FormDef } from '../../src/data/schema';
import { PLAYER_ELEMENT_IDS } from '../../src/data/elements';
import { PETS } from '../../src/data/pets';
import { getFaction } from '../../src/data/factions';
import { addEnhance, buildCombatParams, gainTrait, isBasicBlockTrait, newBuild } from '../../src/engine/absorb';
import { createCombat, elapsedSeconds, liberationStartGaugeOf, playCombatHuman, uniformStats, type CombatParams } from '../../src/engine/combat';
import { abilityFor, applyEvolutionToParams, evoEffortOf, newEvolution, refStatOf, STAT_MAX, zeroStats, type EvolutionState } from '../../src/engine/evolution';
import type { StatId } from '../../src/data/schema';
import { applyDifficultyToParams, enemyAtDifficulty, recommendedDifficulty } from '../../src/engine/difficulty';
import { petAttackOf } from '../../src/engine/pet';
import { bossSetupOf, enemyScale } from '../../src/engine/expedition';
import { ENEMIES, scaleEnemy } from '../../src/data/enemies';
import { BOSSES } from '../../src/data/bosses';

/** 가드 기준 (마스터AR 2026-11-23 provisional): 고유 능력 기여 = 강적 처치 시간 단축률(1 − 켬 ÷ 끔). 같은 단계 중앙값 ±contribBand, 강적 승률(켬) 중앙값 ±winBand */
export const EVO_BAL_RULE = { contribBand: 0.1, winBand: 0.15 } as const;
/** 기준 리스크(호로화 게이지 등 per risk 능력용) */
export const EVO_BAL_RISK = 50;

/** 기준 몸에서 잴 수 없는 능력(가드 제외, 출력만) — 데이터로 판정: 능력치 높은 쪽·평균 기반(offenseBasic/offenseBlock)은 능력치가 균일한 기준 몸에서 0 */
export function evoBalExemptReason(ability: EvoAbilityDef): string | null {
  if ((ability.passives ?? []).some((p) => p.stat === 'offenseBasic' || p.stat === 'offenseBlock')) return '능력치 기반(공격력·지능 차) — 균일 기준 몸에서 0';
  return null;
}

export interface EvoBalTarget { formId: string; factionId: string; tier: number; category: string; element: string; usesPet: boolean; exempt: string | null }

/** 측정 대상: uniques.json 에 고유 능력(ability)이 있는 4단계 진화체 × 종족 (retired 제외). 고유 능력이 없는 칸(부오·프레네시)은 켬 = 끔이라 뺀다 */
export function evoBalTargets(): EvoBalTarget[] {
  const out: EvoBalTarget[] = [];
  for (const formId of evoFormIds()) {
    const form = FORM_TABLE.find((f) => f.id === formId);
    if (!form || form.retired || form.tier < 4) continue;
    for (const factionId of ['hollow', 'shinigami']) {
      const entry = evoFormEntry(formId, factionId);
      if (!entry?.ability) continue;
      const usesPet = evoExtraPetSlots(formId, factionId) > 0 || JSON.stringify(entry.ability).includes('petPower');
      out.push({ formId, factionId, tier: form.tier, category: categoryOf(form, factionId), element: buildElementOf(form), usesPet, exempt: evoBalExemptReason(entry.ability) });
    }
  }
  return out;
}

function categoryOf(form: FormDef, factionId: string): string {
  return formCategoryOf(form, factionId) ?? 'physical';
}

/** 표준 빌드 속성: 진화체 속성(플레이어가 가질 수 있는 원소·혈·독) 2개. 노멀·속성 없음·허무 진화체는 노멀 특성이 기본 블록이라(공격 블록 0) 밸런스 도구 표준 'skill 2개(다른 계열)'의 뇌·불 */
export const EVO_BAL_NEUTRAL_ELEMENTS = ['thunder', 'fire'] as const;
export function buildElementOf(form: FormDef): string {
  const el = form.elements?.[0] ?? form.label.elements[0];
  return el && el !== 'normal' && (PLAYER_ELEMENT_IDS as readonly string[]).includes(el) ? el : 'normal';
}

/** 표준 빌드 공격 특성 2개: 그 진화체 타입의 계열 + 다음 계열 (같은 속성, 노멀 몸이면 뇌·불) */
export function evoBalSkills(t: Pick<EvoBalTarget, 'factionId' | 'category' | 'element'>): string[] {
  const fams = getFaction(t.factionId).families.map((f) => f.id);
  const own = getFaction(t.factionId).families.find((f) => f.category === t.category)?.id ?? fams[0]!;
  const next = fams[(fams.indexOf(own) + 1) % fams.length]!;
  const els = t.element === 'normal' ? EVO_BAL_NEUTRAL_ELEMENTS : [t.element, t.element];
  return [own, next].map((fid, i) => `t-${els[i]}-${fid.replace('family-', '')}`);
}

/** 기준 몸에 얹는 투자 (C.523 진화체 모양): skills = 표준 공격 특성 2개, enhance = 그 특성 속성 강화 단계, ev = 능력치마다 더할 노력치. C.520 기준 몸 = 특성 2개·강화 0·노력치 0 */
export interface EvoBodyInvest { skills: boolean; enhance: number; ev: Partial<Record<StatId, number>> | null }
export const EVO_BAL_STANDARD_INVEST: EvoBodyInvest = { skills: true, enhance: 0, ev: null };

/** 기준 몸 전투 재료. on = 고유 능력 켬, ascended = 아란칼화/구상화를 깬 몸(레스렉시온/만해 가능) */
export function evoBalParams(t: EvoBalTarget, on: boolean, ascended: boolean, star = recommendedDifficulty(t.tier - 1)): Partial<CombatParams> {
  return evoBodyParams(t, on, ascended, star, EVO_BAL_STANDARD_INVEST);
}

/** 기준 몸 + 투자(특성·강화·노력치) 전투 재료 — evoBalParams 와 진화체 모양 측정(scripts/lib/evoProfile.ts)이 같이 쓴다 */
export function evoBodyParams(t: EvoBalTarget, on: boolean, ascended: boolean, star: number, invest: EvoBodyInvest): Partial<CombatParams> {
  const b = newBuild();
  if (invest.skills) for (const id of evoBalSkills(t)) if (!gainTrait(b, id).ok && isBasicBlockTrait(id)) addEnhance(b, 'normal');
  if (invest.skills && invest.enhance > 0) for (const el of new Set(t.element === 'normal' ? EVO_BAL_NEUTRAL_ELEMENTS : [t.element])) for (let i = 0; i < invest.enhance; i++) addEnhance(b, el);
  const params = buildCombatParams(b, t.factionId);
  const form = FORM_TABLE.find((f) => f.id === t.formId)!;
  const prev = FORM_TABLE.some((f) => f.id === `t3:${t.element}`) ? `t3:${t.element}` : 't3:normal';
  const evo: EvolutionState = { ...newEvolution(), tierIndex: t.tier - 1, formId: t.formId, formHistory: ['t2:base', prev, t.formId], ability: abilityFor(zeroStats(), form), ascended };
  applyEvolutionToParams(params, evo, t.factionId);
  // 모양 손잡이 출처 effort (C.524): 노력치는 아래에서 능력치에 바로 얹으므로(능력 순위가 바뀌지 않게 트랙 ev 는 0) 투자율만 같은 식으로
  if (params.evo) params.evo.effort = evoEffortOf(invest.ev ?? {}, t.tier - 1, t.category);
  params.playerStats = uniformStats(refStatOf(t.tier - 1));
  if (invest.ev) for (const [k, v] of Object.entries(invest.ev) as [StatId, number][]) params.playerStats[k] = Math.min(STAT_MAX, params.playerStats[k] + v);
  params.liberationStartGauge = liberationStartGaugeOf();
  params.riskStart = EVO_BAL_RISK;
  if (t.usesPet && PETS[0]) {
    params.petAttack = petAttackOf({ id: PETS[0].id, level: 1 });
    const slots = on ? evoExtraPetSlots(t.formId, t.factionId) : 0;
    params.petAttack2 = slots > 0 ? petAttackOf({ id: PETS[0].id, level: 1, power: evoExtraPetPower(t.formId, t.factionId) }) : null;
  }
  if (!on) params.evo = null;
  applyDifficultyToParams(params, star);
  return params;
}

export interface EvoBalSide { win: number; secs: number; taken: number; games: number }
export type EvoBalBody = { n: EvoBalSide; e: EvoBalSide; b: EvoBalSide };
/** pre = 해방 전 몸(기본 해방만), rel = 레스렉시온/만해 몸. on/off = 두 몸의 평균(해방 구간 포함 전체 전투 — 같은 무게) */
export interface EvoBalRow { target: EvoBalTarget; star: number; on: EvoBalBody; off: EvoBalBody; pre: { on: EvoBalBody; off: EvoBalBody }; rel: { on: EvoBalBody; off: EvoBalBody } }
export interface EvoBalSeeds { n: number; e: number; b: number }
/** 기본 판 수 (balance 구간·가드): 일반 적 종류마다 n · 강적 종류마다 e · 그 ★ 보스마다 b, 몸 2 × 켬/끔 2 */
export const EVO_BAL_SEEDS: EvoBalSeeds = { n: 4, e: 32, b: 16 };

const POOL = ENEMIES.filter((e) => !e.testOnly);

function fightBody(t: EvoBalTarget, on: boolean, ascended: boolean, star: number, seeds: EvoBalSeeds): EvoBalBody {
  const params = evoBalParams(t, on, ascended, star);
  const run = (cls: 'normal' | 'elite', n: number): EvoBalSide => {
    let g = 0, w = 0, secs = 0, taken = 0;
    POOL.filter((e) => e.class === cls).forEach((base, ei) => {
      for (let k = 1; k <= n; k++) {
        const end = playCombatHuman(createCombat(70000 + ei * 211 + k * 37 + star, { enemy: enemyAtDifficulty(base, star), params: { ...params } }));
        g++; taken += (end.damageTaken ?? 0) / end.player.maxHp;
        if (end.status === 'won') { w++; secs += elapsedSeconds(end); }
      }
    });
    return { win: g ? w / g : 0, secs: w ? secs / w : 0, taken: g ? taken / g : 0, games: g };
  };
  let bg = 0, bw = 0, bs = 0, bt = 0;
  BOSSES.filter((b) => b.difficulty === star).forEach((boss, bi) => {
    for (let k = 1; k <= seeds.b; k++) {
      const end = playCombatHuman(createCombat(71000 + bi * 307 + k * 41, { enemy: scaleEnemy(boss.enemy, enemyScale(1, 'forest', boss.difficulty)), params: { ...params }, boss: bossSetupOf(boss.id) }));
      bg++; bt += (end.damageTaken ?? 0) / end.player.maxHp;
      if (end.status === 'won') { bw++; bs += elapsedSeconds(end); }
    }
  });
  return { n: run('normal', seeds.n), e: run('elite', seeds.e), b: { win: bg ? bw / bg : 0, secs: bw ? bs / bw : 0, taken: bg ? bt / bg : 0, games: bg } };
}

const meanSide = (a: EvoBalSide, b: EvoBalSide): EvoBalSide => ({ win: (a.win + b.win) / 2, secs: (a.secs + b.secs) / 2, taken: (a.taken + b.taken) / 2, games: a.games + b.games });
const meanBody = (a: EvoBalBody, b: EvoBalBody): EvoBalBody => ({ n: meanSide(a.n, b.n), e: meanSide(a.e, b.e), b: meanSide(a.b, b.b) });

/** 한 진화체 × 종족: 권장 ★ 일반·강적·보스, 해방 전 몸·레스렉시온/만해 몸 × 고유 능력 켬/끔 (같은 시드) */
export function measureEvoBal(t: EvoBalTarget, seeds: EvoBalSeeds = EVO_BAL_SEEDS): EvoBalRow {
  const star = recommendedDifficulty(t.tier - 1);
  const pre = { on: fightBody(t, true, false, star, seeds), off: fightBody(t, false, false, star, seeds) };
  const rel = { on: fightBody(t, true, true, star, seeds), off: fightBody(t, false, true, star, seeds) };
  return { target: t, star, on: meanBody(pre.on, rel.on), off: meanBody(pre.off, rel.off), pre, rel };
}

/** 고유 능력 기여 = 강적 처치 시간 단축률 (1 − 켬 ÷ 끔). 끔이 한 판도 못 이기면 0 */
export function evoContribution(r: Pick<EvoBalRow, 'on' | 'off'>): number {
  return r.off.e.secs > 0 && r.on.e.secs > 0 ? 1 - r.on.e.secs / r.off.e.secs : 0;
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** 목표 미달로 남긴 진화체 × 종족 (C.520 보고, 조정 3회 규칙) — 벗어나도 경고만. 여기 없는 진화체(새로 짜는 진화체 포함)는 그대로 가드 */
export const EVO_BAL_KNOWN: Readonly<Record<string, string>> = {
  't4:thunder:physical/hollow': '호로 콜리브리 — 강적 승률 80.0%(중앙값 95.5% −15.5%p)는 몸 차이(고유 능력 끔도 80%, 뇌 물리 몸). 날갯짓 수치를 1.5·2·2.5배로 올려도 80~81%(기여만 4→9%) → 목표 미달, 수치 그대로',
  't4:blood:physical/hollow': '호로 추파카브라 — C.521 출현 제외를 고정 블록만으로 좁혀 −167.9% → −20.5%(해방 전 −28.4 · 해방 −2.9). 남은 원인 = 봇이 저장이 조금만 쌓여도 고정 혈 블록을 바로 써서 블록 동작 시간(그동안 평타 없음)에 비해 피해가 작음. 저장 100%·피해 ×1.0 = 사용자 확정값, 저장 상한·남김(keep 0.5)·해방 남김 0 세 번 → −20.5~−89% → 목표 미달. 사용 문턱(저장 30~60 이상일 때만 켜짐)이면 −3.5~−2.6% 로 기준 안(새 조건이라 마스터 결정)',
};

/** profiled = 목표 모양(balanceProfiles.json)이 있어 이 가드 대신 '진화체 모양' 가드(scripts/lib/evoProfile.ts)로 보는 칸 (C.523) */
export interface EvoBalVerdict { tier: number; medContrib: number; medWin: number; failures: string[]; known: string[]; profiled: string[] }
export const evoBalKey = (t: Pick<EvoBalTarget, 'formId' | 'factionId'>): string => `${t.formId}/${t.factionId}`;

/** 판정: 같은 단계(측정 제외 칸 빼고)의 기여 중앙값 ±contribBand · 강적 승률(켬) 중앙값 ±winBand 밖이면 실패 한 줄. 목표 미달 목록(EVO_BAL_KNOWN)은 known 으로(중앙값 계산에는 넣는다).
 *  C.523: 목표 모양(balanceProfile)이 있는 칸은 이 가드를 건너뛰고(profiled, 중앙값 계산에는 넣는다) '진화체 모양' 가드로 — 목표가 비어 있는 몸만 중앙값 ±10%p */
export function judgeEvoBal(rows: readonly Pick<EvoBalRow, 'target' | 'on' | 'off'>[], rule = EVO_BAL_RULE, known: Readonly<Record<string, string>> = EVO_BAL_KNOWN,
  hasGoal: (t: EvoBalTarget) => boolean = (t) => balanceProfileOf(t.formId, t.factionId) !== null): EvoBalVerdict[] {
  const out: EvoBalVerdict[] = [];
  for (const tier of [...new Set(rows.map((r) => r.target.tier))].sort()) {
    const rs = rows.filter((r) => r.target.tier === tier && !r.target.exempt);
    const medContrib = median(rs.map(evoContribution));
    const medWin = median(rs.map((r) => r.on.e.win));
    const failures: string[] = [];
    const held: string[] = [];
    const profiled: string[] = [];
    for (const r of rs) {
      const c = evoContribution(r);
      const name = evoBalKey(r.target);
      if (hasGoal(r.target)) { profiled.push(name); continue; }
      const to = known[name] ? held : failures;
      if (Math.abs(c - medContrib) > rule.contribBand + 1e-9) to.push(`진화체 고유 능력: ${name} 기여(강적 처치 시간 단축) ${(c * 100).toFixed(1)}% 가 ${tier}단계 중앙값 ${(medContrib * 100).toFixed(1)}% ±${rule.contribBand * 100}%p 밖`);
      if (Math.abs(r.on.e.win - medWin) > rule.winBand + 1e-9) to.push(`진화체 고유 능력: ${name} 강적 승률 ${(r.on.e.win * 100).toFixed(1)}% 가 ${tier}단계 중앙값 ${(medWin * 100).toFixed(1)}% ±${rule.winBand * 100}%p 밖`);
    }
    out.push({ tier, medContrib, medWin, failures, known: held, profiled });
  }
  return out;
}

/** 출력용 보조: 체력 계산에 쓰는 기준 */
export const EVO_BAL_NOTE = `기준 몸 = 4단계 기준 능력치 균일(${refStatOf(3)}) · 해방(레스렉시온/만해) 가능 · 표준 빌드 = 그 속성 공격 특성 2개(노멀 몸 = 뇌·불) · 리스크 ${EVO_BAL_RISK} · 펫 능력만 기준 펫 · 치명 기본 ${BALANCE.provisional.combat.critChance}`;
