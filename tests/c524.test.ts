// C.524 진화체 1차 배정·조정 (GDD 8-7 '진화체 밸런스 표기', 마스터AS 11-23 — 사용자 "알아서 해라 ㅇㅇ"): 모양 손잡이(출처 effort·blockLv, 규칙 조건 '전투 시작 n초 안',
// buff 지속 grow · passive grow · atLeast × 출처) · 측정 넓이 = 같은 단계·같은 타입 · 목표 미달 경고 · 추파카브라 사용 문턱 · 설명 틀
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { useImmediateHits } from './helpers/hitDelay';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { FORM_TABLE, getForm } from '../src/data/evolution';
import { evoFormEntry, evoFormIds, evoNumsOf, evoReleaseNums, evoText, fillEvoText, validateEvoUniques } from '../src/data/evolution/uniques';
import { balanceProfileOf } from '../src/data/evolution/balanceProfiles';
import {
  BASIC_SKILL_ID, applyInput, attackSecondsNow, createCombat, drainCombatEvents, evoSpecialUsable, evoStat, step, ticksOf,
  type Block, type CombatEvent, type CombatParams, type CombatSkill, type CombatState, type EvoParams,
} from '../src/engine/combat';
import { evoBlockLvOf } from '../src/engine/combat/evoUnique';
import { applyEvolutionToParams, evCaps, evoEffortOf, evoElementOf, evoParamsOf, newEvolution } from '../src/engine/evolution';
import { buildCombatParams, newBuild } from '../src/engine/absorb';
import { evoBodyParams } from '../scripts/lib/evoUniqueBalance';
import { EVO_PROFILE_KNOWN, evoProfileInvest, evoProfileTargets, profileGoalHeld } from '../scripts/lib/evoProfile';
import { PATCH_LABEL } from '../src/version';
useImmediateHits();

const STILL: Partial<CombatParams> = { critChance: 0, blockCritChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, voidChance: 0, enemyPassive: true, enemyImmortal: true };
const foe = getEnemy('test-a');
let uid = 90000;
const blk = (over: Partial<Block> = {}): Block => ({ uid: uid++, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a', ...over });
const mk = (extra: Partial<CombatParams>, seed = 7): CombatState => createCombat(seed, { enemy: foe, params: { ...STILL, ...extra } });
const evo = (id: string, fac: string, over: Partial<EvoParams> = {}): EvoParams => ({ ...evoParamsOf(getForm(id), fac)!, ...over });
const tick = (s: CombatState, n = 1): CombatEvent[] => {
  const out: CombatEvent[] = [];
  for (let i = 0; i < n && s.status === 'playing'; i++) { step(s); out.push(...drainCombatEvents(s)); }
  return out;
};
const use = (s: CombatState, cell: number) => { applyInput(s, { type: 'use', cell }); return drainCombatEvents(s); };
const skill = (id: string, element: string, mult = 1): CombatSkill => ({ id, element, family: 'family-b', category: 'special', role: 'attack', powerInAttacks: 1, chainBonus: { kind: 'stagger', value: 0 }, powerMultiplier: mult });
const F = BALANCE.provisional.evoUniques.forms as Record<string, Record<string, Record<string, number> & { release?: Record<string, number> }>>;

describe('출처 effort — 그 몸 타입의 주 노력치 투자율 (evoEffortOf)', () => {
  const cap = evCaps(3).total;
  const full = Math.floor(cap * BALANCE.provisional.evoInvest.mainShare);
  it('물리 = 공격·공속, 특수 = 지능·블록속도, 혼합 = 넷 — 합 ÷ floor(상한 합계 × 0.7), 0~1', () => {
    expect(evoEffortOf({}, 3, 'physical')).toBe(0);
    expect(evoEffortOf({ atk: full / 2, aspd: full / 2 }, 3, 'physical')).toBeCloseTo(1, 9);
    expect(evoEffortOf({ atk: full / 4 }, 3, 'physical')).toBeCloseTo(0.25, 9);
    expect(evoEffortOf({ int: full, hp: 999 }, 3, 'physical')).toBe(0); // 다른 타입 능력치는 안 센다
    expect(evoEffortOf({ int: full / 2, bspd: full / 2 }, 3, 'special')).toBeCloseTo(1, 9);
    expect(evoEffortOf({ atk: full / 4, int: full / 4 }, 3, 'mixed')).toBeCloseTo(0.5, 9);
    expect(evoEffortOf({ atk: 9999 }, 3, 'physical')).toBe(1); // 상한 1
    expect(evoEffortOf({ atk: full / 2 }, 0, 'physical')).toBe(1); // 낮은 단계 = 그 단계 상한 기준
  });
  it('applyEvolutionToParams 가 능력치 트랙 노력치로 채운다 · 진화체 속성(노멀 몸 = null)', () => {
    const p = buildCombatParams(newBuild(), 'hollow');
    // C.530: 마르티요(t4:normal:physical)는 간격 기준(effortBasis) → 노력치 투자율은 노멀 혼합 몸(에스칼레라)으로 (옛 기대 = 마르티요)
    const e = { ...newEvolution(), tierIndex: 3, formId: 't4:normal:mixed', formHistory: ['t2:base', 't3:normal', 't4:normal:mixed'] };
    e.ev = { ...e.ev, atk: full / 2, aspd: full / 4 };
    applyEvolutionToParams(p, e, 'hollow');
    expect(p.evo?.effort).toBeCloseTo(0.75, 9);
    expect(p.evo?.element).toBeNull();
    expect(evoElementOf(getForm('t4:fire:physical'))).toBe('fire');
  });
  it('측정 기준 몸: 노력치만 = 1 · 무투자 = 0 (능력치에 바로 얹어도 같은 식)', () => {
    const t = evoProfileTargets().find((x) => x.formId === 't4:fire:physical' && x.factionId === 'hollow')!;
    expect(evoBodyParams(t, true, false, 4, evoProfileInvest(t, 'ev')).evo?.effort).toBeCloseTo(1, 2);
    expect(evoBodyParams(t, true, false, 4, evoProfileInvest(t, 'none')).evo?.effort).toBe(0);
  });
});

describe('출처 blockLv — 그 진화체 속성 블록 투자율 (evoBlockLvOf)', () => {
  const fireEvo = evo('t4:fire:mixed', 'hollow');
  it('특성 몫(공격 블록 수 ÷ 2) × 0.5 + 강화 몫(위력 배율 이득 ÷ 강화 10단계 이득) × 0.5', () => {
    expect(evoBlockLvOf({ skills: [], evo: fireEvo })).toBe(0);
    expect(evoBlockLvOf({ skills: [skill('a', 'fire')], evo: fireEvo })).toBeCloseTo(0.25, 9);
    expect(evoBlockLvOf({ skills: [skill('a', 'fire', 1.25), skill('b', 'fire')], evo: fireEvo })).toBeCloseTo(0.75, 9);
    expect(evoBlockLvOf({ skills: [skill('a', 'fire', 1.5), skill('b', 'fire', 1.5), skill('c', 'fire', 1.86)], evo: fireEvo })).toBe(1);
    expect(evoBlockLvOf({ skills: [skill('a', 'water', 1.5), skill('b', 'water', 1.5)], evo: fireEvo })).toBe(0); // 다른 속성은 안 센다
  });
  it('속성 없는 몸(노멀·허무) = 모든 속성 공격 블록 · 막기·회복은 안 센다', () => {
    const neutral = { ...fireEvo, element: null };
    expect(evoBlockLvOf({ skills: [skill('a', 'water', 1.5), skill('b', 'thunder', 1.5)], evo: neutral })).toBe(1);
    expect(evoBlockLvOf({ skills: [{ ...skill('g', 'earth', 1.5), role: 'guard' }], evo: neutral })).toBe(0);
  });
  // C.525: 무투자 칸에도 그 속성 공격 블록 1개(강화 0) → blockLv = 특성 몫 0.5 × 1/2 = 0.25 (옛 기대 0 — 블록이 없어 블록으로 켜지는 능력이 안 켜짐)
  it('측정 기준 몸: 블록만 = 1 · 무투자 = 0.25(속성 블록 1개)', () => {
    for (const key of ['t4:fire:mixed/hollow', 't4:normal:physical/hollow']) {
      const t = evoProfileTargets().find((x) => `${x.formId}/${x.factionId}` === key)!;
      expect(evoBlockLvOf(evoBodyParams(t, true, false, 4, evoProfileInvest(t, 'blk')) as CombatParams)).toBe(1);
      expect(evoBlockLvOf(evoBodyParams(t, true, false, 4, evoProfileInvest(t, 'none')) as CombatParams)).toBeCloseTo(0.25, 9);
    }
  });
});

describe('모양 손잡이 — 엔진 (종족·진화체 분기 없음)', () => {
  it('passive grow: 값 × (1 + 기울기 × 출처) — 호로 마르티요 찢김당 평타 피해가 노력치 비례', () => {
    const n = F['t4:normal:physical']!.hollow!;
    const at = (effort: number) => {
      const s = mk({ evo: evo('t4:normal:physical', 'hollow', { effort }) });
      s.evo!.stacks.rend!.n = 2;
      return evoStat(s, 'basicPower');
    };
    expect(at(0)).toBeCloseTo(2 * n.perStack!, 9);
    expect(at(1)).toBeCloseTo(2 * n.perStack! * (1 + n.perStackGrow!), 9);
    expect(at(0.5)).toBeCloseTo(2 * n.perStack! * (1 + n.perStackGrow! * 0.5), 9);
  });
  it("규칙 조건 elapsedBelow = 전투 시작 n초 안 (passive·규칙 공통)", () => {
    const ev: EvoParams = { formId: 'x', ability: { description: 'x', passives: [{ stat: 'dealt', value: 0.5, need: [{ elapsedBelow: 2 }] }] }, nums: {}, relNums: {} };
    const s = mk({ evo: ev });
    expect(evoStat(s, 'dealt')).toBe(0.5);
    tick(s, ticksOf(s.params, 2.05));
    expect(evoStat(s, 'dealt')).toBe(0);
  });
  // C.525 (GDD v6.178 시간 제한 능력 = 노력 곡선): 에스칼레라 동반 → 노력 — 세기·지속이 노력치만 비례(옛 기대 = 노력치×블록, 한쪽만이면 그대로)
  it('buff grow·secondsGrow: 호로 에스칼레라 평타 버프 세기·지속이 노력치 비례(블록 투자와 무관)', () => {
    const n = F['t4:normal:mixed']!.hollow!;
    const two = [skill('a', 'water', 1.5), skill('b', 'thunder', 1.5)]; // 노멀 몸 = 모든 속성 공격 블록 → blockLv 1
    const run = (effort: number, skills: CombatSkill[]) => {
      const s = mk({ evo: evo('t4:normal:mixed', 'hollow', { effort }), skills });
      s.tray.length = 0;
      s.tray.push(blk());
      use(s, 0);
      const power = evoStat(s, 'basicPower');
      let secs = 0;
      while (evoStat(s, 'basicPower') > 0 && secs < 60) { tick(s); secs += s.params.tickSeconds; }
      return { power, secs };
    };
    expect(run(0, two).power).toBeCloseTo(n.perChain!, 9);
    expect(run(0, two).secs).toBeCloseTo(n.seconds!, 1);
    const full = run(1, []);
    expect(full.power).toBeCloseTo(n.perChain! * (1 + n.stepGrow!), 9);
    expect(full.secs).toBeCloseTo(n.seconds! * (1 + n.stepSecondsGrow!), 1);
  });
  it('basics 도 grow 를 받는다: 사신 노도 「노도 연격」 평타 수 = hits × (1 + hitsGrow × 노력치)', () => {
    const n = F['t4:water:physical']!.shinigami!;
    const count = (effort: number) => {
      const s = mk({ evo: evo('t4:water:physical', 'shinigami', { effort }) });
      s.tray.length = 0;
      s.tray.push(blk({ traitId: 'evo:rush', family: null, solo: true }));
      return use(s, 0).filter((e) => e.kind === 'player-attack').length;
    };
    expect(count(0)).toBe(n.hits);
    expect(count(1)).toBe(Math.round(n.hits! * (1 + n.hitsGrow!)));
  });
  it('need atLeastPer: 호로 추파카브라 혈 블록 = 저장 ≥ 최대 체력 30% 일 때만 (마스터 확정 추천안)', () => {
    const n = F['t4:blood:physical']!.hollow!;
    expect(n.useMin).toBe(0.3);
    const s = mk({ evo: evo('t4:blood:physical', 'hollow') });
    const vessel = s.tray.find((b) => b.traitId === 'evo:vessel')!;
    s.evo!.stacks.stored!.n = s.player.maxHp * 0.29;
    expect(evoSpecialUsable(s, vessel)).toBe(false);
    s.evo!.stacks.stored!.n = s.player.maxHp * 0.3;
    expect(evoSpecialUsable(s, vessel)).toBe(true);
  });
  it('데이터 검사: 새 칸(effort·blockLv 출처, passive grow, secondsGrow, elapsedBelow·atLeastPer)', () => {
    expect(validateEvoUniques()).toEqual([]);
    const d = JSON.parse(readFileSync('src/data/evolution/uniques.json', 'utf8'));
    const bal = { traits: {}, forms: { 't4:fire:mixed': { hollow: { a: 1 } } } } as never;
    d.traits = {};
    d.forms = { 't4:fire:mixed': { hollow: { ability: { description: 'x', passives: [{ stat: 'dealt', value: 'a', grow: { value: 'nope', per: 'effort' }, need: [{ elapsedBelow: 'nope2' }] }],
      rules: [{ on: 'basic', do: [{ act: 'hit', basis: 'basic', value: 1, per: 'blockLv', secondsGrow: { value: 1, per: 'effort' } }] }] } } } };
    const errs = validateEvoUniques(d, bal).join('\n');
    expect(errs).toMatch(/효과 0: 수치 키 없음/);
    expect(errs).toMatch(/효과 0: need 수치 키 없음/);
    expect(errs).toMatch(/secondsGrow 는 buff 에서만/);
    expect(errs).not.toMatch(/모르는 per/);
  });
});

describe('측정 (scripts/lib/evoProfile.ts)', () => {
  it('목표 미달 목록(EVO_PROFILE_KNOWN) = 목표가 있고 고유 능력이 있는 몸만, 사유 한 줄', () => {
    const ts = evoProfileTargets();
    for (const [k, why] of Object.entries(EVO_PROFILE_KNOWN)) {
      const t = ts.find((x) => `${x.formId}/${x.factionId}` === k);
      expect(t?.goal, k).not.toBeNull();
      expect(t?.hasAbility, k).toBe(true);
      expect(why.length).toBeGreaterThan(10);
    }
  });
  it('경고로 두는 까닭: 측정 제외 · 고유 능력 없음(강제 성향만 — 2차 능력 때) · 목표 미달 목록', () => {
    const ts = evoProfileTargets();
    const held = (key: string) => profileGoalHeld(ts.find((x) => `${x.formId}/${x.factionId}` === key)!);
    expect(held('t4:normal:mixed/shinigami')).toMatch(/측정 제외/); // 천평환 — 능력치 기반
    expect(held('h4:hunter/hollow')).toMatch(/2차 능력/); // 카사도르 — 강제 강적 성향
    expect(held('h4:stable/shinigami')).toMatch(/2차 능력/);
    expect(held('t4:normal:physical/hollow')).toBeNull(); // 마르티요 = 통과 → 실패로 본다
    expect(profileGoalHeld({ formId: 'a', factionId: 'b', exempt: null, hasAbility: true }, { 'a/b': '사유' })).toBe('사유');
  });
});

describe('데이터·버전', () => {
  it('BALANCE 160 · 패치 C.524 · evoInvest provisional 수치', () => {
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(160); // C.525 에서 161 (정확한 값은 c525 가 지킨다)
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(524);
    expect(BALANCE.provisional.evoInvest).toMatchObject({ mainShare: 0.7, traits: 2, traitWeight: 0.5, enhanceLevels: 10 });
  });
  it('사용자 확정값 그대로: 소로 2.5초·5개 · 비전 −0.1초 · 바라쿠다 1·3·5회 · 브라사 3초·10%p · 무랄라 2초 · 토르멘타 필드 5초 · 추성 펫 70%·표식 10 · 추파카브라 100%·×1', () => {
    expect(F['t4:fire:physical']!.hollow).toMatchObject({ seconds: 2.5, need: 5 });
    expect(F['t4:thunder:mixed']!.shinigami!.cut).toBe(0.1);
    expect(F['t4:water:mixed']!.hollow).toMatchObject({ hits1: 1, hits2: 3, hits3: 5 });
    expect(F['t4:fire:mixed']!.hollow).toMatchObject({ seconds: 3, spawnPer: 0.1 });
    expect(F['t4:earth:special']!.hollow!.shieldSeconds).toBe(2);
    expect(F['t4:thunder:special']!.hollow!.fieldSeconds).toBe(5);
    expect(F['h4:hunter']!.shinigami).toMatchObject({ pet2Power: 0.7, maxMarks: 10 });
    expect(F['t4:blood:physical']!.hollow).toMatchObject({ store: 1, useMult: 1 });
  });
  it('능력 설명 틀이 새 수치를 따라간다 — 모든 {키} 가 채워지고(평소·해방), 투자 비례·사용 문턱이 문구에 있다', () => {
    for (const id of evoFormIds()) for (const fac of ['hollow', 'shinigami']) {
      const a = evoFormEntry(id, fac)?.ability;
      if (!a) continue;
      const n = evoNumsOf(id, fac);
      const base = Object.fromEntries(Object.entries(n).filter(([k]) => k !== 'release')) as Record<string, number>;
      const texts = [fillEvoText(evoText(a.description, fac), base), ...(a.releaseDescription ? [fillEvoText(evoText(a.releaseDescription, fac), evoReleaseNums(n))] : []),
        ...Object.values(a.specials ?? {}).flatMap((sp) => [fillEvoText(evoText(sp.description, fac), base), fillEvoText(evoText(sp.offNote, fac), base)])];
      for (const t of texts) expect(t, `${id}/${fac}`).not.toMatch(/\{[A-Za-z0-9_@]+%?\}/);
    }
    const d = (id: string, fac: string) => fillEvoText(evoText(evoFormEntry(id, fac)!.ability!.description, fac), evoNumsOf(id, fac) as Record<string, number>);
    // C.525 (시간 제한 능력 = 노력 곡선): 토르멘타·에스칼레라 문구는 노력치 문구로 (옛 기대 = 블록·동반 문구) — 블록·동반 문구는 반석·봉수대가 지킨다. C.526: '키운 만큼' → '키울수록 커짐 — 다 키우면 <실제 값>'
    expect(d('t4:thunder:special', 'hollow')).toContain('지속 피해는 노력치를 키울수록 커짐');
    expect(d('t4:normal:mixed', 'hollow')).toContain('노력치를 키울수록 커짐 — 다 키우면 8초 동안 체인 수×42%');
    expect(d('t4:earth:physical', 'shinigami')).toContain('이 속성 블록(흡수 특성·강화)을 키울수록 커짐');
    expect(d('t4:fire:physical', 'shinigami')).toContain('공격 속도·이 속성 블록을 같이 키울수록 커짐'); // C.530: 공속 몸 = 간격 기준 (옛 기대 '노력치·이 속성 블록을')
    expect(d('t4:normal:physical', 'hollow')).toContain('공격 속도를 키울수록 커짐'); // C.530 (옛 기대 '노력치를 키울수록')
    expect(d('t4:blood:physical', 'hollow')).toContain('최대 체력 30% 이상');
  });
  it('목표 모양은 4단계 진화체만 (곡선·성향 표기는 개발용 — 설명 문구엔 곡선·성향 이름이 없다)', () => {
    for (const f of FORM_TABLE.filter((x) => x.tier !== 4)) for (const fac of ['hollow', 'shinigami']) expect(balanceProfileOf(f.id, fac)).toBeNull();
    const json = readFileSync('src/data/evolution/uniques.json', 'utf8');
    expect(json).not.toMatch(/(평탄|노력|블록|동반|특성) 곡선|(한방|강적|잡몹|선공|생존|해방) 성향/);
  });
});
