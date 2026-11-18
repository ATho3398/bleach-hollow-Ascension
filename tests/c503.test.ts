// C.503 진화체 고유 능력 1차 — 호로 10종 (GDD 8-7·8-8, docs/drafts/evo-impl-1119.md 2·3절): 데이터(uniques.json) + 수치(balance provisional.evoUniques) + 작은 장치 secondsPer
import { describe, expect, it } from 'vitest';
import { useImmediateHits } from './helpers/hitDelay';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import { evoFormEntry, evoReleaseBlocked, validateEvoUniques } from '../src/data/evolution/uniques';
import {
  BASIC_SKILL_ID, applyInput, attackSecondsNow, basicPowerOf, createCombat, drainCombatEvents, evoExecLinesOf, evoStat,
  statusMarksOf, step, ticksOf, type Block, type CombatEvent, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { evoParamsOf, hasUniqueLiberation, representativeAbility } from '../src/engine/evolution';
useImmediateHits();

const EU = BALANCE.provisional.evoUniques;
type Nums = Record<string, number> & { release: Record<string, number> };
const N = (id: string): Nums => EU.forms[id]!.hollow as Nums;
const evo = (id: string) => evoParamsOf(getForm(id), 'hollow')!;
const foe = getEnemy('test-a');
const STILL: Partial<CombatParams> = { critChance: 0, blockCritChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, voidChance: 0, enemyPassive: true, enemyImmortal: true };
let uid = 70000;
const blk = (over: Partial<Block> = {}): Block => ({ uid: uid++, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a', ...over });
const mk = (extra: Partial<CombatParams>, seed = 7): CombatState => createCombat(seed, { enemy: foe, params: { ...STILL, trayCapacity: 0, ...extra } });
const tick = (s: CombatState, n = 1): CombatEvent[] => {
  const out: CombatEvent[] = [];
  for (let i = 0; i < n && s.status === 'playing'; i++) {
    step(s);
    out.push(...drainCombatEvents(s));
  }
  return out;
};
const basics = (s: CombatState, n: number): CombatEvent[] => {
  const out: CombatEvent[] = [];
  let got = 0;
  for (let i = 0; i < 5000 && got < n && s.status === 'playing'; i++) {
    const evs = tick(s);
    got += evs.filter((e) => e.kind === 'player-attack').length;
    out.push(...evs);
  }
  return out;
};
/** 같은 블록 chain 개를 바 끝에 놓고 쓴다 (체인 = 같은 계열 이웃) */
const useChain = (s: CombatState, chain: number, family = 'family-a') => {
  const at = s.tray.length;
  for (let k = 0; k < chain; k++) s.tray.push(blk({ family }));
  const ok = applyInput(s, { type: 'use', cell: at });
  return { ok, evs: drainCombatEvents(s) };
};
const libNow = (s: CombatState) => {
  s.liberation.gauge = 100;
  const ok = applyInput(s, { type: 'liberate' });
  drainCombatEvents(s);
  return ok;
};
const procOf = (evs: CombatEvent[], text: string) => evs.some((e) => e.kind === 'evo-proc' && e.text === text);
const blockDmg = (evs: CombatEvent[]) => evs.filter((e): e is Extract<CombatEvent, { kind: 'block' }> => e.kind === 'block').reduce((a, e) => a + e.damage, 0);
const HOLLOW10 = ['t4:normal:physical', 't4:water:physical', 't4:fire:physical', 't4:earth:physical', 't4:thunder:physical', 't4:normal:mixed', 't4:water:special', 't4:fire:special', 'h4:frenzy', 'h4:void'];

describe('호로 10종 데이터', () => {
  it('데이터 검사 통과 · 10종 모두 호로 칸 (프레네시는 해방 없음만)', () => {
    expect(validateEvoUniques()).toEqual([]);
    for (const id of HOLLOW10) expect(evoFormEntry(id, 'hollow'), id).toBeTruthy();
    for (const id of HOLLOW10.filter((x) => x !== 'h4:frenzy')) expect(evoParamsOf(getForm(id), 'hollow'), id).toBeTruthy();
    expect(evoParamsOf(getForm('h4:frenzy'), 'hollow')).toBeNull(); // 능력은 지금 그대로(아직 안 고름)
  });
  it('4단계 한 줄 특성: 니에블라 = 블록 치명 +6%p, 루시에르나가 = 3체인 위력 +10%, 나다 = 소멸선, 나머지는 그대로 el4', () => {
    expect(representativeAbility(getForm('t4:water:special'), 'hollow')?.id).toBe('evo:blockCrit6');
    expect(representativeAbility(getForm('t4:fire:special'), 'hollow')?.id).toBe('evo:chain3Power');
    expect(representativeAbility(getForm('h4:void'), 'hollow')?.id).toBe('evo:obliteration');
    expect(representativeAbility(getForm('t4:normal:physical'), 'hollow')?.id).toBe('el4:normal');
  });
});

describe('마르티요 (노멀·조) — 찢김', () => {
  const n = N('t4:normal:physical');
  it('평타 3대마다 찢김 +1(최대 5), 1당 평타 피해 +4%', () => {
    const s = mk({ evo: evo('t4:normal:physical') });
    const p0 = basicPowerOf(s);
    const evs = basics(s, n.every!);
    expect(s.evo!.stacks.rend!.n).toBe(1);
    expect(procOf(evs, '찢김!')).toBe(true);
    expect(basicPowerOf(s) / p0).toBeCloseTo(1 + n.perStack!, 5);
    basics(s, n.every! * 10);
    expect(s.evo!.stacks.rend!.n).toBe(n.max);
    expect(statusMarksOf(s, 'hollow').find((m) => m.key === 'evo-s-rend')?.value).toBe(String(n.max));
  });
  it('블록 → 체인 수만큼 찢김 소모, 1개당 그 블록 + 평타 0.3회분', () => {
    const a = mk({ evo: evo('t4:normal:physical') });
    const plain = blockDmg(useChain(a, 2).evs);
    const b = mk({ evo: evo('t4:normal:physical') });
    b.evo!.stacks.rend!.n = 3;
    const r = useChain(b, 2);
    expect(procOf(r.evs, '찢어발기기!')).toBe(true);
    expect(b.evo!.stacks.rend!.n).toBe(1);
    expect(blockDmg(r.evs)).toBeGreaterThan(plain);
  });
  it('레스렉시온: 평타 2대마다 · 최대 8', () => {
    const s = mk({ evo: evo('t4:normal:physical'), liberationUnique: true, liberationSeconds: 120 });
    libNow(s);
    basics(s, n.release.every!);
    expect(s.evo!.stacks.rend!.n).toBe(1);
    basics(s, 40);
    expect(s.evo!.stacks.rend!.n).toBe(n.release.max);
  });
});

describe('라나 (물·조) — 물 스택', () => {
  const n = N('t4:water:physical');
  it('블록 1번(체인 무관) = 물 스택 1(5초, 스택마다 따로), 스택당 평타 치명 +4%p', () => {
    const s = mk({ evo: evo('t4:water:physical') });
    expect(procOf(useChain(s, 3).evs, '물!')).toBe(true);
    expect(s.evo!.stacks.wet!.n).toBe(1); // 3체인도 1
    useChain(s, 1, 'family-b');
    expect(evoStat(s, 'crit')).toBeCloseTo(2 * n.perStack!, 5);
    tick(s, ticksOf(s.params, n.seconds! + 0.2));
    expect(s.evo!.stacks.wet!.n).toBe(0);
    for (let k = 0; k < 10; k++) useChain(s, 1, k % 2 ? 'family-a' : 'family-b');
    expect(s.evo!.stacks.wet!.n).toBe(n.max);
  });
  it('레스렉시온: 지속 8초·최대 8', () => {
    const s = mk({ evo: evo('t4:water:physical'), liberationUnique: true, liberationSeconds: 120 });
    libNow(s);
    for (let k = 0; k < 10; k++) useChain(s, 1, k % 2 ? 'family-a' : 'family-b');
    expect(s.evo!.stacks.wet!.n).toBe(n.release.max);
    tick(s, ticksOf(s.params, 6));
    expect(s.evo!.stacks.wet!.n).toBe(n.release.max);
  });
});

describe('소로 (불·조) — 여우불·화상', () => {
  const n = N('t4:fire:physical');
  const F: Partial<CombatParams> = { playerElements: ['fire'], playerAttackSeconds: 0.25 };
  it('평타마다 여우불 1(2.5초 — C.507) → 5개 이상일 때 불 블록 = 적 화상(6초, 걸린 적이 받는 피해 +10%)', () => {
    const s = mk({ ...F, evo: evo('t4:fire:physical') });
    basics(s, 6);
    expect(s.evo!.stacks.fox!.n).toBeGreaterThanOrEqual(n.need!);
    const r = useChain(s, 1);
    expect(procOf(r.evs, '화상!')).toBe(true);
    expect(evoStat(s, 'dealt')).toBeCloseTo(n.burn!, 5);
    expect(statusMarksOf(s, 'hollow').find((m) => m.key === 'evo-b-burn')?.on).toBe('foe');
    tick(s, ticksOf(s.params, n.burnSeconds! + 0.1));
    expect(evoStat(s, 'dealt')).toBe(0);
  });
  it('여우불이 5개 미만이면 화상 없음 · 여우불은 2.5초 뒤 하나씩 사라짐', () => {
    const s = mk({ playerElements: ['fire'], evo: evo('t4:fire:physical') }); // 평타 1초 간격 → 2~3개
    basics(s, 4);
    expect(s.evo!.stacks.fox!.n).toBeLessThan(n.need!);
    expect(procOf(useChain(s, 1).evs, '화상!')).toBe(false);
  });
  it('레스렉시온: 여우불 3초 · 화상 +15%', () => {
    const s = mk({ ...F, evo: evo('t4:fire:physical'), liberationUnique: true, liberationSeconds: 120 });
    libNow(s);
    basics(s, 6);
    useChain(s, 1);
    expect(evoStat(s, 'dealt')).toBeCloseTo(n.release.burn!, 5);
  });
});

describe('에스카라바호 (흙·조) — 갑각', () => {
  const n = N('t4:earth:physical');
  it('전투 시작 보호막 12% · 있는 동안 평타 +15% · 깨지면 12초 뒤 다시(평타마다 0.5초 당김)', () => {
    const s = mk({ evo: evo('t4:earth:physical') });
    tick(s);
    expect((s.player.shield ?? 0) / s.player.maxHp).toBeCloseTo(n.shield!, 5);
    expect(evoStat(s, 'basicPower')).toBeCloseTo(n.basicBonus!, 5);
    s.params.enemyPassive = false;
    for (let i = 0; i < 20000 && (s.player.shield ?? 0) > 0; i++) tick(s);
    expect(s.player.shield ?? 0).toBe(0);
    expect(evoStat(s, 'basicPower')).toBe(0);
    s.params.enemyPassive = true;
    const t0 = s.tick;
    let evs: CombatEvent[] = [];
    for (let i = 0; i < 20000 && (s.player.shield ?? 0) <= 0; i++) evs = evs.concat(tick(s));
    expect(procOf(evs, '갑각!')).toBe(true);
    expect((s.tick - t0) * s.params.tickSeconds).toBeLessThan(n.regrow!); // 평타가 당김
  });
  it('레스렉시온: 갑각 20% · 깨질 때 깨진 양만큼 적에게', () => {
    const s = mk({ evo: evo('t4:earth:physical'), liberationUnique: true, liberationSeconds: 300 });
    tick(s);
    libNow(s);
    expect((s.player.shield ?? 0) / s.player.maxHp).toBeCloseTo(n.release.shield!, 5);
    s.params.enemyPassive = false;
    let evs: CombatEvent[] = [];
    for (let i = 0; i < 20000 && (s.player.shield ?? 0) > 0; i++) evs = evs.concat(tick(s));
    const back = evs.find((e): e is Extract<CombatEvent, { kind: 'evo-proc' }> => e.kind === 'evo-proc' && e.text === '갑각 반격!');
    expect(back?.damage).toBeGreaterThan(0);
  });
});

describe('콜리브리 (뇌·조) — 날갯짓', () => {
  const n = N('t4:thunder:physical');
  it('평타마다 간격 −2%(최대 −30%) · 블록 쓰면 절반', () => {
    const s = mk({ evo: evo('t4:thunder:physical') });
    const t0 = attackSecondsNow(s);
    basics(s, 5);
    expect(evoStat(s, 'interval')).toBeCloseTo(5 * n.perStack!, 5);
    expect(attackSecondsNow(s)).toBeLessThan(t0);
    basics(s, 30);
    expect(evoStat(s, 'interval')).toBeCloseTo(n.maxCut!, 5);
    useChain(s, 1);
    expect(s.evo!.stacks.wing!.n).toBe(n.maxStacks! / 2);
  });
  it('레스렉시온: 블록을 써도 안 줄어듦 · 최대 −45%', () => {
    const s = mk({ evo: evo('t4:thunder:physical'), liberationUnique: true, liberationSeconds: 300 });
    libNow(s);
    basics(s, 40);
    expect(evoStat(s, 'interval')).toBeCloseTo(n.release.maxCut!, 5);
    const before = s.evo!.stacks.wing!.n;
    useChain(s, 2);
    expect(s.evo!.stacks.wing!.n).toBe(before);
  });
});

describe('에스칼레라 (노멀·교) — 블록 원래 피해 + 4초 평타 강화 (v6.133)', () => {
  const n = N('t4:normal:mixed');
  it('블록 피해는 그대로, 쓰면 4초 동안 평타 피해 +체인 수×8% (큰 쪽 갱신)', () => {
    const a = mk({});
    const plain = blockDmg(useChain(a, 2).evs);
    const s = mk({ evo: evo('t4:normal:mixed') });
    const r = useChain(s, 2);
    expect(blockDmg(r.evs)).toBeCloseTo(plain, 5); // 블록 피해 증가 없음
    expect(evoStat(s, 'basicPower')).toBeCloseTo(2 * n.perChain!, 5);
    useChain(s, 1, 'family-b');
    expect(evoStat(s, 'basicPower')).toBeCloseTo(2 * n.perChain!, 5); // 작은 쪽은 덮지 않음
    tick(s, ticksOf(s.params, n.seconds! + 0.1));
    expect(evoStat(s, 'basicPower')).toBe(0);
  });
  it('레스렉시온: 6초 · 체인 수×12%', () => {
    const s = mk({ evo: evo('t4:normal:mixed'), liberationUnique: true, liberationSeconds: 120 });
    libNow(s);
    useChain(s, 3);
    expect(evoStat(s, 'basicPower')).toBeCloseTo(3 * n.release.perChain!, 5);
    tick(s, ticksOf(s.params, 5));
    expect(evoStat(s, 'basicPower')).toBeGreaterThan(0);
  });
});

describe('니에블라 (물·탄) — 물안개 잔상', () => {
  it('치명이 난 블록은 잔상 1개(1체인)를 바 끝에, 잔상은 잔상을 안 남김', () => {
    const s = mk({ evo: evo('t4:water:special'), blockCritChance: 1, blockCritChanceMax: 1, trayCapacity: 8 });
    const r = useChain(s, 3);
    expect(procOf(r.evs, '잔상!')).toBe(true);
    expect(s.tray.filter((b) => b.echo).length).toBe(1);
    const i = s.tray.findIndex((b) => b.echo);
    applyInput(s, { type: 'use', cell: i });
    const evs = drainCombatEvents(s);
    expect(procOf(evs, '잔상!')).toBe(false);
    expect(s.tray.filter((b) => b.echo).length).toBe(0);
  });
  it('체인 2 +10%p · 체인 3 +20%p (치명 확률 80% 에서 3체인은 늘 치명, 레스렉시온은 2체인도)', () => {
    const count = (chain: number, lib: boolean) => {
      let crits = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const s = mk({ evo: evo('t4:water:special'), blockCritChance: 0.8, blockCritChanceMax: 1, liberationUnique: true, liberationSeconds: 120 }, seed);
        if (lib) libNow(s);
        s.tray.length = 0;
        const r = useChain(s, chain);
        if (r.evs.some((e) => e.kind === 'block' && e.crit)) crits++;
      }
      return crits;
    };
    expect(count(3, false)).toBe(30);
    expect(count(1, false)).toBeLessThan(30);
    expect(count(2, true)).toBe(30); // +20%p
  });
});

describe('루시에르나가 (불·탄) — 꾀는 불빛', () => {
  const n = N('t4:fire:special');
  it('1체인 → 불빛 +1(최대 3, 안 사라짐) · 3체인 → 전부 소모, 1개당 위력 +25%·화상 3초(+12%)', () => {
    const a = mk({});
    const plain = blockDmg(useChain(a, 3).evs);
    const s = mk({ evo: evo('t4:fire:special') });
    for (let k = 0; k < 5; k++) useChain(s, 1, k % 2 ? 'family-a' : 'family-b');
    expect(s.evo!.stacks.glow!.n).toBe(n.max);
    tick(s, ticksOf(s.params, 20));
    expect(s.evo!.stacks.glow!.n).toBe(n.max);
    const r = useChain(s, 3, 'family-c');
    expect(procOf(r.evs, '꾀는 불빛!')).toBe(true);
    expect(s.evo!.stacks.glow!.n).toBe(0);
    expect(blockDmg(r.evs) / plain).toBeCloseTo(1 + n.max! * n.perGlow!, 5); // 화상은 이 블록 뒤부터
    expect(evoStat(s, 'dealt')).toBeCloseTo(n.burn!, 5);
    const left = (s.evo!.buffs.burn!.until - s.tick) * s.params.tickSeconds;
    expect(left).toBeCloseTo(n.max! * n.burnPerGlow!, 1); // secondsPer consumed
    expect(s.evo!.stacks.lit!.n).toBe(0);
  });
  it('불빛이 없으면 3체인은 그냥 · 2체인은 불빛을 안 씀', () => {
    const s = mk({ evo: evo('t4:fire:special') });
    expect(procOf(useChain(s, 3).evs, '꾀는 불빛!')).toBe(false);
    useChain(s, 1, 'family-b');
    useChain(s, 2, 'family-c');
    expect(s.evo!.stacks.glow!.n).toBe(1);
  });
  it('레스렉시온: 불빛 최대 5 · 2체인도 불빛을 씀', () => {
    const s = mk({ evo: evo('t4:fire:special'), liberationUnique: true, liberationSeconds: 120 });
    libNow(s);
    for (let k = 0; k < 7; k++) useChain(s, 1, k % 2 ? 'family-a' : 'family-b');
    expect(s.evo!.stacks.glow!.n).toBe(n.release.max);
    expect(procOf(useChain(s, 2, 'family-c').evs, '꾀는 불빛!')).toBe(true);
    expect(s.evo!.stacks.glow!.n).toBe(0);
  });
});

describe('프레네시 (히든 폭주형) — 해방 없음', () => {
  it('호로 프레네시는 레스렉시온·아란칼화 도전 없음, 사신 폭주형은 그대로', async () => {
    expect(evoReleaseBlocked('h4:frenzy', 'hollow')).toBe(true);
    expect(evoReleaseBlocked('h4:frenzy', 'shinigami')).toBe(false);
    expect(hasUniqueLiberation({ ascended: true, formId: 'h4:frenzy' }, 'hollow')).toBe(false);
    const { ascensionAccess } = await import('../src/game');
    const save = { factionId: 'hollow', evolution: { ascended: false, formId: 'h4:frenzy', tierIndex: 3 }, nest: {} } as never;
    expect(ascensionAccess(save)).toEqual({ ok: false, reason: 'none' });
  });
});

describe('나다 (히든 허무형) — 소멸선', () => {
  const n = N('h4:void');
  const EX: Partial<CombatParams> = { abilityEffects: { execute: { line: 0.08, eliteMult: 1.5 } } };
  it('블록 → 5초 동안 평타 피해 +체인 수×10% (새로 쓰면 갱신)', () => {
    const s = mk({ ...EX, evo: evo('h4:void') });
    useChain(s, 3);
    expect(evoStat(s, 'basicPower')).toBeCloseTo(3 * n.perChain!, 5);
    useChain(s, 1, 'family-b');
    expect(evoStat(s, 'basicPower')).toBeCloseTo(n.perChain!, 5); // 갱신(덮어씀)
    tick(s, ticksOf(s.params, n.seconds! + 0.1));
    expect(evoStat(s, 'basicPower')).toBe(0);
  });
  it('바 8칸이 가득인 동안 3초마다 평타 처형선 +1%p (최대 +25%p, 전투 동안 유지)', () => {
    const s = mk({ ...EX, evo: evo('h4:void'), trayCapacity: 8 });
    s.tray.length = 0;
    tick(s, ticksOf(s.params, 7));
    expect(s.evo!.stacks.edge!.n).toBe(0); // 바가 비어 있으면 안 오름
    for (let k = 0; k < 8; k++) s.tray.push(blk({ family: `f${k}` }));
    const evs = tick(s, ticksOf(s.params, 3 * n.every! + 0.1));
    expect(s.evo!.stacks.edge!.n).toBe(3);
    expect(procOf(evs, '소멸선 +')).toBe(true);
    expect(evoExecLinesOf(s).basic).toBeCloseTo(0.08 + 3 * n.perLine!, 5);
    s.tray.length = 0;
    tick(s, ticksOf(s.params, 10));
    expect(s.evo!.stacks.edge!.n).toBe(3); // 유지
    s.evo!.stacks.edge!.n = 40;
    expect(evoExecLinesOf(s).basic).toBeCloseTo(0.08 + n.maxLine!, 5);
  });
});

describe('블록 종류 · 상태 화면', () => {
  it('"블록을 쓸 때마다"(라나·에스칼레라·콜리브리·나다)는 허·콤보 블록도 1번으로 센다 (체인·속성이 붙은 규칙은 스킬 블록만)', () => {
    const s = mk({ evo: evo('t4:water:physical') });
    s.tray.push({ uid: uid++, kind: 'void', traitId: null, family: null });
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.evo!.stacks.wet!.n).toBe(1);
    const m = mk({ evo: evo('t4:normal:physical') });
    m.evo!.stacks.rend!.n = 2;
    m.tray.push({ uid: uid++, kind: 'void', traitId: null, family: null });
    applyInput(m, { type: 'use', cell: 0 });
    expect(m.evo!.stacks.rend!.n).toBe(2); // 찢김은 스킬 블록 체인만 소모
  });
  it('상태 화면 줄: 고유 능력 + 레스렉시온, 프레네시 = 레스렉시온 없음, 나다 = 고유 능력만(기본 해방 강화)', async () => {
    const { evoUniqueLines } = await import('../src/ui/evolutionPanel');
    expect(evoUniqueLines('t4:normal:physical', 'hollow', '레스렉시온').map((l) => l.label)).toEqual(['고유 능력', '레스렉시온']);
    expect(evoUniqueLines('t4:normal:physical', 'hollow', '레스렉시온')[0]!.text).toContain('3대마다');
    expect(evoUniqueLines('h4:frenzy', 'hollow', '레스렉시온')).toEqual([{ label: '레스렉시온', text: '없음 — 해방하지 않는다' }]);
    expect(evoUniqueLines('h4:void', 'hollow', '레스렉시온').map((l) => l.label)).toEqual(['고유 능력']);
    for (const id of HOLLOW10) for (const l of evoUniqueLines(id, 'hollow', '레스렉시온')) expect(l.text, id).not.toMatch(/\{/);
  });
});
