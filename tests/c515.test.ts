// C.515 진화체 고유 능력 2차 — 호로 9종 (GDD 8-7 2차, docs/drafts/evo-impl-1121.md 2절): 바라쿠다·부오·브라사·무랄라·토르투가·토르멘타·게파르도·추파카브라·비보라.
// 새 공용 장치: hurt·shieldEnd 트리거 · basicCrit·forceNext 효과 · hit foeMaxHp/dot/poison · heal of hit · 시간 보호막(shield seconds) · 거르기 after·heavy · need none ·
// 스택 maxPer · 특수 블록 element·need · selfBlock/selfSpawn · spawnExclude · 적 공속(foeAttackSlow)·마법방어(foeMagicDefCut) · 4단계 특성 critDmg·blockPower·spawnCut·drain·poisonDot
import { describe, expect, it } from 'vitest';
import { useImmediateHits } from './helpers/hitDelay';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import { evoFormEntry, evoKnown, validateEvoUniques } from '../src/data/evolution/uniques';
import raw from '../src/data/evolution/uniques.json';
import {
  BASIC_SKILL_ID, applyInput, attackSecondsNow, baseSpawnSecondsOf, blockDamage, createCombat, drainCombatEvents, evoFoeSlowSkip, evoSpawnRulesOf,
  evoSpecialOffReason, evoSpecialUsable, evoStat, scriptHeavyCast, statusMarksOf, step, ticksOf,
  type Block, type CombatEvent, type CombatParams, type CombatSkill, type CombatState,
} from '../src/engine/combat';
import { evoParamsOf, representativeAbility } from '../src/engine/evolution';
import { abilityEffectsOf, abilityLines } from '../src/engine/evolution/formAbilities';
useImmediateHits();

const EU = BALANCE.provisional.evoUniques;
type Nums = Record<string, number> & { release: Record<string, number> };
const N = (id: string): Nums => ({ release: {}, ...(EU.forms[id]!.hollow as Record<string, unknown>) }) as Nums;
const evo = (id: string) => evoParamsOf(getForm(id), 'hollow')!;
const foe = getEnemy('test-a');
const STILL: Partial<CombatParams> = { critChance: 0, blockCritChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, voidChance: 0, enemyPassive: true, enemyImmortal: true };
let uid = 90000;
const blk = (over: Partial<Block> = {}): Block => ({ uid: uid++, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a', ...over });
const mk = (extra: Partial<CombatParams>, seed = 7): CombatState => createCombat(seed, { enemy: foe, params: { ...STILL, trayCapacity: 0, ...extra } });
/** 바가 있는 전투(특수 블록 자리) — 생성 시계는 멈춤 */
const mkBar = (extra: Partial<CombatParams>, seed = 7): CombatState => {
  const s = mk({ trayCapacity: 8, ...extra }, seed);
  s.spawnTimer = 1e9;
  return s;
};
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
/** 같은 블록 chain 개를 바 끝에 놓고 쓴다 */
const useChain = (s: CombatState, chain: number, family = 'family-a', traitId: string = BASIC_SKILL_ID) => {
  const at = s.tray.length;
  for (let k = 0; k < chain; k++) s.tray.push(blk({ family, traitId }));
  const ok = applyInput(s, { type: 'use', cell: at });
  return { ok, evs: drainCombatEvents(s) };
};
const useAt = (s: CombatState, cell: number) => {
  const ok = applyInput(s, { type: 'use', cell });
  return { ok, evs: drainCombatEvents(s) };
};
const libNow = (s: CombatState) => {
  s.liberation.gauge = 100;
  const ok = applyInput(s, { type: 'liberate' });
  drainCombatEvents(s);
  return ok;
};
const procs = (evs: CombatEvent[], text: string) => evs.filter((e): e is Extract<CombatEvent, { kind: 'evo-proc' }> => e.kind === 'evo-proc' && e.text === text);
const procOf = (evs: CombatEvent[], text: string) => procs(evs, text).length > 0;
const blockDmg = (evs: CombatEvent[]) => evs.filter((e): e is Extract<CombatEvent, { kind: 'block' }> => e.kind === 'block').reduce((a, e) => a + e.damage, 0);
const dots = (evs: CombatEvent[]) => evs.filter((e): e is Extract<CombatEvent, { kind: 'dot' }> => e.kind === 'dot' && e.target === 'enemy');
const skill = (id: string, element: string, family: string): CombatSkill => ({ id, element, family, category: 'special', role: 'attack', powerInAttacks: 1, chainBonus: { kind: 'stagger', value: 0 }, powerMultiplier: 1 });
const markOf = (s: CombatState, key: string) => statusMarksOf(s, 'hollow').find((m) => m.key === key);
const HOLLOW9 = ['t4:water:mixed', 't4:normal:special', 't4:fire:mixed', 't4:earth:special', 't4:earth:mixed', 't4:thunder:special', 't4:thunder:mixed', 't4:blood:physical', 't4:poison:special'];

describe('호로 2차 9종 데이터', () => {
  it('데이터 검사 통과 · 9종 모두 호로 칸 · 부오는 특성만(고유 능력 없음) · 바시오는 [미정]이라 없음', () => {
    expect(validateEvoUniques()).toEqual([]);
    for (const id of HOLLOW9) expect(evoFormEntry(id, 'hollow'), id).toBeTruthy();
    for (const id of HOLLOW9.filter((x) => x !== 't4:normal:special')) expect(evoParamsOf(getForm(id), 'hollow'), id).toBeTruthy();
    expect(evoParamsOf(getForm('t4:normal:special'), 'hollow')).toBeNull();
    expect(evoFormEntry('t4:kyo:mixed', 'hollow')).toBeNull();
  });
  it('4단계 한 줄 특성: 바라쿠다 치명 피해 · 부오 블록 위력 · 토르멘타 생성 간격 · 게파르도 공속 · 추파카브라 흡혈 · 비보라 독 — 나머지(브라사·무랄라·토르투가)는 그대로 el4', () => {
    const want: Record<string, string> = {
      't4:water:mixed': 'evo:critDmg10', 't4:normal:special': 'evo:blockPower8', 't4:thunder:special': 'evo:spawnCut6',
      't4:thunder:mixed': 'evo:aspd6', 't4:blood:physical': 'evo:drain3', 't4:poison:special': 'evo:poisonDot12',
    };
    for (const [id, t] of Object.entries(want)) expect(representativeAbility(getForm(id), 'hollow')?.id, id).toBe(t);
    for (const id of ['t4:fire:mixed', 't4:earth:special', 't4:earth:mixed']) expect(representativeAbility(getForm(id), 'hollow')?.id.startsWith('el4:'), id).toBe(true);
    const fx = (key: string) => abilityEffectsOf({ dispositions: [], elements: [], uniques: [], phys: null, physAbilities: [], evoTraits: [{ key, home: true }] }).effects;
    expect(fx('critDmg10').evoCritDmg).toBeCloseTo(EU.traits.critDmg10!.value!, 6);
    expect(fx('blockPower8').blockPower).toBeCloseTo(0.08, 6); // C.514 현음과 같은 특성 효과(blockPower — 노멀 '균형' 자리)
    expect(fx('spawnCut6').evoSpawnCut).toBeCloseTo(0.06, 6);
    expect(fx('aspd6').evoAttackSpeed).toBeCloseTo(0.06, 6);
    expect(fx('drain3').evoDrain).toBeCloseTo(0.03, 6);
    expect(fx('poisonDot12').evoPoisonDot).toBeCloseTo(0.12, 6);
    const line = (key: string) => abilityLines({ dispositions: [], elements: [], uniques: [], phys: null, physAbilities: [], evoTraits: [{ key, home: true }] }, 'hollow')[0]!.description;
    expect(line('poisonDot12')).toContain('독 지속 피해 +12%');
    expect(line('spawnCut6')).toContain('블록 생성 간격 −6%');
    expect(line('critDmg10')).toContain('치명 피해 +10%');
  });
  it('특성 효과가 전투에 붙는다: 치명 피해 · 블록 위력 · 생성 간격 · 흡혈(혈 아닌 공격도) · 독 지속 피해', () => {
    const crit = (fx: CombatParams['abilityEffects']) => {
      const s = mk({ critChance: 1, critChanceMax: 1, abilityEffects: fx });
      return basics(s, 1).find((e): e is Extract<CombatEvent, { kind: 'player-attack' }> => e.kind === 'player-attack')!.damage;
    };
    const c0 = crit({});
    const c1 = crit({ evoCritDmg: 0.1 });
    const cm = mk({}).params.critMultiplier;
    expect(c1 / c0).toBeCloseTo((cm + 0.1) / cm, 4);
    const b0 = blockDmg(useChain(mk({}), 1).evs);
    const b1 = blockDmg(useChain(mk({ abilityEffects: { blockPower: 0.08 } }), 1).evs);
    expect(b1 / b0).toBeCloseTo(1.08, 4);
    const p0 = mk({}).params;
    const p1 = mk({ abilityEffects: { evoSpawnCut: 0.06 } }).params;
    expect(baseSpawnSecondsOf(p1)).toBeLessThan(baseSpawnSecondsOf(p0));
    const d = mk({ playerElements: ['water'], abilityEffects: { evoDrain: 0.03 } });
    d.player.hp = d.player.maxHp * 0.5;
    const evs = basics(d, 1);
    const dmg = evs.find((e): e is Extract<CombatEvent, { kind: 'player-attack' }> => e.kind === 'player-attack')!.damage;
    const heal = evs.filter((e): e is Extract<CombatEvent, { kind: 'drain' }> => e.kind === 'drain').reduce((a, e) => a + e.heal, 0);
    expect(heal).toBeCloseTo(dmg * 0.03, 4);
    const pz = (up: number) => {
      const s = mk({ playerElements: ['poison'], abilityEffects: up ? { evoPoisonDot: up } : {} });
      basics(s, 1);
      return s.enemy.dot!.perTick;
    };
    expect(pz(0.12) / pz(0)).toBeCloseTo(1.12, 4);
  });
});

describe('바라쿠다 (물·교) — 다음 평타 n회 치명 +', () => {
  const n = N('t4:water:mixed');
  it('표 수치: 1·2·3체인 1/3/5회, +25%p, 최대 10 · 레스렉시온 +35%p·최대 15', () => {
    expect([n.hits1, n.hits2, n.hits3, n.crit, n.max]).toEqual([1, 3, 5, 0.25, 10]);
    expect(n.release).toEqual({ crit: 0.35, max: 15 });
  });
  it('블록 체인 수만큼 충전(1·3·5), 남은 횟수에 더함·최대 10', () => {
    const s = mk({ evo: evo('t4:water:mixed') });
    expect(procOf(useChain(s, 1).evs, '이빨!')).toBe(true);
    expect(s.evo!.charges.fang!.n).toBe(1);
    useChain(s, 2, 'family-b');
    expect(s.evo!.charges.fang!.n).toBe(4);
    useChain(s, 3);
    expect(s.evo!.charges.fang!.n).toBe(9);
    useChain(s, 3, 'family-b');
    expect(s.evo!.charges.fang!.n).toBe(n.max);
    expect(markOf(s, 'evo-c-fang')?.value).toBe(String(n.max));
  });
  it('충전 평타만 치명 +(상한도 같이 — 확률 1 로 바꿔 확인), 블록 치명은 그대로', () => {
    const e = evo('t4:water:mixed');
    const s = mk({ evo: { ...e, nums: { ...e.nums, crit: 1 } } });
    useChain(s, 3); // 5회
    const evs = basics(s, 7);
    const crits = evs.filter((x): x is Extract<CombatEvent, { kind: 'player-attack' }> => x.kind === 'player-attack').map((x) => !!x.crit);
    expect(crits).toEqual([true, true, true, true, true, false, false]);
    s.evo!.charges.fang!.n = 5;
    const r = useChain(s, 1);
    expect(r.evs.some((x) => x.kind === 'block' && x.crit)).toBe(false);
  });
  it('레스렉시온: 최대 15 · 해방 시작·끝에 남은 횟수 그대로', () => {
    const s = mk({ evo: evo('t4:water:mixed'), liberationUnique: true, liberationSeconds: 1 });
    useChain(s, 3);
    libNow(s);
    expect(s.evo!.charges.fang!.n).toBe(5);
    for (let k = 0; k < 4; k++) useChain(s, 3, k % 2 ? 'family-a' : 'family-b');
    expect(s.evo!.charges.fang!.n).toBe(n.release.max);
    tick(s, ticksOf(s.params, 1.5)); // 해방 끝 — 평타로 조금 쓰임
    expect(s.liberation.ticksLeft).toBe(0);
    expect(s.evo!.charges.fang!.n).toBeGreaterThan(n.max!); // 15 근처에서 이어 감 (깎지 않음)
  });
});

describe('부오 (노멀·탄) — 고유 능력 없음', () => {
  it('블록은 원래 피해만 · 전투 고유 능력 없음(evo 없음)', () => {
    expect(evoFormEntry('t4:normal:special', 'hollow')?.ability).toBeUndefined();
    expect(evoFormEntry('t4:normal:special', 'hollow')?.trait).toBe('blockPower8');
  });
});

describe('브라사 (불·교) — 화상마다 열기(자기 블록 확률·주는 피해)', () => {
  const n = N('t4:fire:mixed');
  const fire = skill('t-fire-b', 'fire', 'family-b');
  const water = skill('t-water-a', 'water', 'family-a');
  it('불 블록 → 화상(공용 값 — C.517) + 열기 1(3초, 스택마다 따로, 최대 5) · 1당 자기 블록 확률 +10%p·주는 피해 +8%', () => {
    const s = mk({ evo: evo('t4:fire:mixed'), skills: [fire, water] });
    const r = useChain(s, 1, 'family-b', fire.id);
    expect(procOf(r.evs, '화상!')).toBe(true);
    expect(s.evo!.stacks.heat!.n).toBe(1);
    expect(evoStat(s, 'dealt')).toBeCloseTo(n.burn! + n.dealtPer!, 6);
    expect(evoStat(s, 'selfSpawn')).toBeCloseTo(n.spawnPer!, 6);
    for (let k = 0; k < 7; k++) useChain(s, 1, 'family-b', fire.id);
    expect(s.evo!.stacks.heat!.n).toBe(n.max);
    expect(evoStat(s, 'selfSpawn')).toBeCloseTo(n.spawnPer! * n.max!, 6);
    useChain(s, 1, 'family-a', water.id);
    expect(s.evo!.stacks.heat!.n).toBe(n.max); // 물 블록은 화상 아님
    tick(s, ticksOf(s.params, n.seconds! + 0.1));
    expect(s.evo!.stacks.heat!.n).toBe(0);
    expect(evoSpawnRulesOf(s).self).toBeNull();
  });
  it('자기 블록(불·교) 생성 몫이 열기만큼 오른다 (다른 블록 몫에서 옮김)', () => {
    const count = (heat: number) => {
      const s = mk({ evo: evo('t4:fire:mixed'), skills: [fire, water], trayCapacity: 1 }, 11);
      let mine = 0;
      let all = 0;
      for (let i = 0; i < 4000 && all < 400; i++) {
        if (heat > 0) s.evo!.stacks.heat = { n: heat, exp: Array(heat).fill(s.tick + 1e6) };
        step(s);
        drainCombatEvents(s);
        if (s.tray.length > 0) {
          all++;
          const b = s.tray.pop()!;
          if (b.traitId === fire.id && b.family === 'family-b') mine++;
          else if (b.traitId === BASIC_SKILL_ID && b.family === 'family-b' && s.params.playerElements[0] === 'fire') mine++;
        }
      }
      return mine / all;
    };
    expect(count(5)).toBeGreaterThan(count(0) + 0.3);
  });
  it('해방 = 기본 강화만 (해방 값 없음)', () => {
    expect(n.release).toEqual({});
    expect(evoFormEntry('t4:fire:mixed', 'hollow')?.ability?.releaseDescription).toBeUndefined();
  });
});

describe('무랄라 (흙·탄) — 2초 방어막, 남은 양 ×2 피해', () => {
  const n = N('t4:earth:special');
  it('1·2·3체인 = 최대 체력 3/6/10% 방어막, 2초 끝까지 남으면 ×2 피해 1번(방어막은 사라짐)', () => {
    for (const [c, key] of [[1, 's1'], [2, 's2'], [3, 's3']] as const) {
      const s = mk({ evo: evo('t4:earth:special') });
      useChain(s, c);
      expect((s.player.shield ?? 0) / s.player.maxHp, key).toBeCloseTo(n[key]!, 6);
      const left = s.player.shield!;
      const evs = tick(s, ticksOf(s.params, n.shieldSeconds!) + 1);
      const p = procs(evs, '방벽 파열!');
      expect(p.length).toBe(1);
      expect(p[0]!.damage).toBeCloseTo(left * n.endMult!, 4);
      expect(s.player.shield ?? 0).toBe(0);
    }
  });
  it('맞아서 줄어든 만큼만 남은 양으로 셈 · 다 깨지면 피해 없음', () => {
    const s = mk({ evo: evo('t4:earth:special'), enemyPassive: false });
    useChain(s, 3);
    const full = s.player.shield!;
    let evs: CombatEvent[] = [];
    for (let i = 0; i < ticksOf(s.params, n.shieldSeconds!) + 1; i++) evs = evs.concat(tick(s));
    const p = procs(evs, '방벽 파열!');
    if (p.length > 0) expect(p[0]!.damage).toBeLessThan(full * n.endMult! + 1e-9);
  });
  it('레스렉시온: 3초·×3 · 해방 끝에도 남은 방어막 그대로', () => {
    const s = mk({ evo: evo('t4:earth:special'), liberationUnique: true, liberationSeconds: 120 });
    libNow(s);
    useChain(s, 2);
    const left = s.player.shield!;
    expect(procOf(tick(s, ticksOf(s.params, 2.5)), '방벽 파열!')).toBe(false);
    const p = procs(tick(s, ticksOf(s.params, 0.6)), '방벽 파열!');
    expect(p[0]!.damage).toBeCloseTo(left * n.release.endMult!, 4);
  });
});

describe('토르투가 (흙·교) — 방어막 반사, 강공격 제외', () => {
  const n = N('t4:earth:mixed');
  it('블록 = 원래 피해 + 방어막 체인 수×4%(5초)', () => {
    const plain = blockDmg(useChain(mk({}), 2).evs);
    const s = mk({ evo: evo('t4:earth:mixed') });
    expect(blockDmg(useChain(s, 2).evs)).toBeCloseTo(plain, 6);
    expect(s.player.shield! / s.player.maxHp).toBeCloseTo(2 * n.perChain!, 6);
    tick(s, ticksOf(s.params, n.shieldSeconds!) + 1);
    expect(s.player.shield ?? 0).toBe(0);
  });
  it('일반 공격을 막으면 막은 양 60% 반사', () => {
    const s = mk({ evo: evo('t4:earth:mixed'), enemyPassive: false });
    useChain(s, 3);
    let evs: CombatEvent[] = [];
    for (let i = 0; i < 2000 && !procOf(evs, '반사!'); i++) evs = evs.concat(tick(s));
    const hit = evs.find((e): e is Extract<CombatEvent, { kind: 'enemy-attack' }> => e.kind === 'enemy-attack')!;
    expect(procs(evs, '반사!')[0]!.damage).toBeCloseTo(hit.damage * n.reflect!, 4);
  });
  it('강공격으로 받은 피해는 반사 안 함', () => {
    const s = createCombat(7, { enemy: getEnemy('test-elite'), params: { ...STILL, trayCapacity: 0, evo: evo('t4:earth:mixed') } });
    useChain(s, 3);
    scriptHeavyCast(s, 0.5);
    let evs: CombatEvent[] = [];
    for (let i = 0; i < 200 && !evs.some((e) => e.kind === 'heavy-hit' && e.landed !== false); i++) evs = evs.concat(tick(s));
    evs = evs.concat(tick(s, 3));
    expect(evs.some((e) => e.kind === 'heavy-hit')).toBe(true);
    expect(s.player.shield! / s.player.maxHp).toBeLessThan(3 * n.perChain!); // 방어막이 막았다
    expect(procOf(evs, '반사!')).toBe(false);
  });
  it('레스렉시온: 반사 100%', () => {
    const s = mk({ evo: evo('t4:earth:mixed'), enemyPassive: false, liberationUnique: true, liberationSeconds: 300 });
    libNow(s);
    useChain(s, 3);
    let evs: CombatEvent[] = [];
    for (let i = 0; i < 2000 && !procOf(evs, '반사!'); i++) evs = evs.concat(tick(s));
    const hit = evs.find((e): e is Extract<CombatEvent, { kind: 'enemy-attack' }> => e.kind === 'enemy-attack')!;
    expect(procs(evs, '반사!')[0]!.damage).toBeCloseTo(hit.damage * n.release.reflect!, 4);
  });
});

describe('토르멘타 (뇌·탄) — 자기장 필드', () => {
  const n = N('t4:thunder:special');
  it('2체인 바로 다음 3체인 = 필드(2초, 초당 적 최대 체력 1%, 적 공속 −20%) · 3체인→3체인·2체인 사이 다른 블록은 없음', () => {
    const s = mk({ evo: evo('t4:thunder:special') });
    useChain(s, 3);
    expect(procOf(useChain(s, 3).evs, '자기장!')).toBe(false);
    useChain(s, 2);
    useChain(s, 1);
    expect(procOf(useChain(s, 3).evs, '자기장!')).toBe(false);
    useChain(s, 2);
    expect(procOf(useChain(s, 3).evs, '자기장!')).toBe(true);
    expect(s.evo!.stacks.field!.n).toBe(1);
    expect(evoStat(s, 'foeAttackSlow')).toBeCloseTo(n.slow!, 6);
    expect(markOf(s, 'evo-s-field')?.on).toBe('foe');
    const evs = tick(s, ticksOf(s.params, n.fieldSeconds!) + 1);
    const d = dots(evs);
    expect(d.length).toBe(n.fieldSeconds! / n.dotEvery!);
    expect(d[0]!.damage).toBeCloseTo(s.enemy.maxHp * n.fieldDot!, 4);
    expect(s.evo!.stacks.field!.n).toBe(0);
    expect(evoStat(s, 'foeAttackSlow')).toBe(0);
  });
  it('필드가 여러 개여도 같은 세기 · 적 공격 시계가 (1 − 20%) 빠르기', () => {
    const s = mk({ evo: evo('t4:thunder:special') });
    s.evo!.stacks.field = { n: 2, exp: [s.tick + 1e6, s.tick + 1e6] };
    expect(evoStat(s, 'foeAttackSlow')).toBeCloseTo(n.slow!, 6);
    let skips = 0;
    for (let i = 0; i < 100; i++) if (evoFoeSlowSkip(s)) skips++;
    expect(skips).toBe(Math.round(100 * n.slow!));
  });
  // 옛 기대값(C.515): '필드 3개가 동시에 → 강화 필드' (field n=2 를 미리 넣고 2→3).
  // 새 규칙(마스터 11-21, C.517): 필드를 만든 누적 횟수 3번마다 강화 — 누적 칸(fieldCount) 2 를 미리 넣고 2→3, 켜지면 누적 0.
  it('필드 누적 3번째 → 강화 필드 3초(초당 2% · 마법방어 −15% · 공속 −20%) — 블록 피해가 오른다 (마스터 11-21 새 규칙)', () => {
    const s = mk({ evo: evo('t4:thunder:special') });
    const before = blockDmg(useChain(s, 1).evs);
    s.evo!.stacks.fieldCount = { n: 2 };
    useChain(s, 2);
    expect(procOf(useChain(s, 3).evs, '강화 자기장!')).toBe(true);
    expect(s.evo!.stacks.field!.n).toBe(0);
    expect(s.evo!.stacks.fieldCount!.n).toBe(0);
    expect(evoStat(s, 'foeMagicDefCut')).toBeCloseTo(n.magicCut!, 6);
    expect(evoStat(s, 'foeAttackSlow')).toBeCloseTo(n.slow!, 6);
    expect(blockDmg(useChain(s, 1).evs)).toBeGreaterThan(before);
    const d = dots(tick(s, ticksOf(s.params, n.stormSeconds!) + 1));
    expect(d.length).toBe(n.stormSeconds! / n.dotEvery!);
    expect(d[0]!.damage).toBeCloseTo(s.enemy.maxHp * n.stormDot!, 4);
    expect(evoStat(s, 'foeMagicDefCut')).toBe(0);
  });
  it('레스렉시온: 필드 3초 · 강화 5초 · 마법방어 −25%', () => {
    const s = mk({ evo: evo('t4:thunder:special'), liberationUnique: true, liberationSeconds: 300 });
    libNow(s);
    useChain(s, 2);
    useChain(s, 3);
    expect(dots(tick(s, ticksOf(s.params, n.release.fieldSeconds!) + 1)).length).toBe(n.release.fieldSeconds!);
    // 옛(C.515): field n=2 동시 → 새 규칙(마스터 11-21): 누적 1(위 필드) + 1 = 2 → 이번이 3번째
    s.evo!.stacks.fieldCount = { n: 2 };
    useChain(s, 2);
    useChain(s, 3);
    expect(evoStat(s, 'foeMagicDefCut')).toBeCloseTo(n.release.magicCut!, 6);
    expect(s.evo!.buffs.storm!.until - s.tick).toBe(ticksOf(s.params, n.release.stormSeconds!));
  });
});

describe('게파르도 (뇌·교) — 특수 블록 낙뢰', () => {
  const n = N('t4:thunder:mixed');
  it('2체인 2번 연달아 → 바 끝에 낙뢰(최대 1) · 사이에 다른 블록이면 없음', () => {
    const s = mkBar({ evo: evo('t4:thunder:mixed') });
    useChain(s, 2);
    useChain(s, 1);
    useChain(s, 2);
    expect(s.tray.some((b) => b.traitId === 'evo:bolt')).toBe(false);
    useChain(s, 2);
    expect(s.tray.filter((b) => b.traitId === 'evo:bolt').length).toBe(1);
    useChain(s, 2);
    useChain(s, 2);
    expect(s.tray.filter((b) => b.traitId === 'evo:bolt').length).toBe(n.maxOnBar);
  });
  it('낙뢰 = 체인 안 됨(단일) · 뇌 피해 + 6초 동안 평타 간격 −30% · 다시 쓰면 시간 새로', () => {
    const s = mkBar({ evo: evo('t4:thunder:mixed') });
    useChain(s, 2);
    useChain(s, 2);
    const t0 = attackSecondsNow(s);
    const i = s.tray.findIndex((b) => b.traitId === 'evo:bolt');
    const r = useAt(s, i);
    expect(r.ok).toBe(true);
    expect(procs(r.evs, '낙뢰!')[0]!.damage).toBeGreaterThan(0);
    expect(s.tray.some((b) => b.traitId === 'evo:bolt')).toBe(false);
    expect(evoStat(s, 'interval')).toBeCloseTo(n.cut!, 6);
    expect(attackSecondsNow(s)).toBeLessThan(t0);
    tick(s, ticksOf(s.params, 3));
    useChain(s, 2);
    useChain(s, 2);
    useAt(s, s.tray.findIndex((b) => b.traitId === 'evo:bolt'));
    expect(s.evo!.buffs.bolt!.until - s.tick).toBe(ticksOf(s.params, n.seconds!));
    expect(markOf(s, 'evo-b-bolt')).toBeTruthy();
  });
  it('레스렉시온: 9초 · −40%', () => {
    const s = mkBar({ evo: evo('t4:thunder:mixed'), liberationUnique: true, liberationSeconds: 300 });
    libNow(s);
    s.spawnTimer = 1e9;
    s.tray.length = 0;
    useChain(s, 2);
    useChain(s, 2);
    useAt(s, s.tray.findIndex((b) => b.traitId === 'evo:bolt'));
    expect(evoStat(s, 'interval')).toBeCloseTo(n.release.cut!, 6);
    expect(s.evo!.buffs.bolt!.until - s.tick).toBe(ticksOf(s.params, n.release.seconds!));
  });
});

describe('추파카브라 (혈) — 첫 칸 고정 혈 블록, 받은 피해 저장', () => {
  const n = N('t4:blood:physical');
  it('전투 시작 = 바 첫 칸 혈 블록(고정·써도 남음) · 저장 0 이면 꺼짐', () => {
    const s = mkBar({ evo: evo('t4:blood:physical') });
    expect(s.tray[0]?.traitId).toBe('evo:vessel');
    expect(s.tray[0]?.fixed).toBe(true);
    expect(evoSpecialUsable(s, s.tray[0])).toBe(false);
    expect(evoSpecialOffReason(s, s.tray[0])).toBe('need');
  });
  it('받은 피해 100% 저장(최대 체력 50% 까지) → 쓰면 저장 ×1.0 피해 + 그만큼 회복, 저장 0, 블록은 그대로', () => {
    const s = mkBar({ evo: evo('t4:blood:physical'), enemyPassive: false });
    const hp0 = s.player.hp;
    for (let i = 0; i < 3000 && s.player.hp >= hp0; i++) tick(s);
    const lost = hp0 - s.player.hp;
    expect(s.evo!.stacks.stored!.n).toBeCloseTo(lost * n.store!, 4);
    expect(evoSpecialUsable(s, s.tray[0])).toBe(true);
    const stored = s.evo!.stacks.stored!.n;
    const hpBefore = s.player.hp;
    const r = useAt(s, 0);
    expect(procs(r.evs, '흡혈!')[0]!.damage).toBeCloseTo(stored * n.useMult!, 4);
    expect(s.player.hp - hpBefore).toBeCloseTo(Math.min(stored * n.useMult!, s.player.maxHp - hpBefore), 4);
    expect(s.evo!.stacks.stored!.n).toBe(0);
    expect(s.tray[0]?.traitId).toBe('evo:vessel');
    s.params.enemyPassive = true;
    s.evo!.stacks.stored!.n = 0;
    s.player.hp = s.player.maxHp;
    s.params.enemyPassive = false;
    for (let i = 0; i < 40000 && s.status === 'playing' && s.player.hp > s.player.maxHp * 0.3; i++) tick(s);
    expect(s.evo!.stacks.stored!.n).toBeCloseTo(s.player.maxHp * n.storeMax!, 4);
    expect(markOf(s, 'evo-s-stored')?.value).toBe(String(Math.round(s.player.maxHp * n.storeMax!)));
  });
  it('다른 블록은 평소대로 생기고, 혈 블록은 저절로 안 생김', () => {
    const blood = skill('t-blood-b', 'blood', 'family-b');
    const water = skill('t-water-a', 'water', 'family-a');
    const s = mk({ evo: evo('t4:blood:physical'), skills: [blood, water], playerElements: ['blood'], trayCapacity: 8 }, 3);
    const seen: string[] = [];
    for (let i = 0; i < 6000 && seen.length < 60; i++) {
      step(s);
      drainCombatEvents(s);
      while (s.tray.length > 1) {
        const b = s.tray.pop()!;
        seen.push(b.traitId === water.id ? 'water' : b.traitId === blood.id ? 'blood' : b.traitId === BASIC_SKILL_ID ? 'basic-blood' : String(b.traitId));
      }
    }
    expect(seen.filter((x) => x === 'water').length).toBeGreaterThan(10);
    expect(seen.filter((x) => x === 'blood' || x === 'basic-blood').length).toBe(0);
    expect(s.tray[0]?.traitId).toBe('evo:vessel');
    // 같은 표에서 고유 능력이 없으면 혈 블록도 나온다 (비교)
    const p = mk({ skills: [blood, water], playerElements: ['blood'], trayCapacity: 8 }, 3);
    const seen2: string[] = [];
    for (let i = 0; i < 6000 && seen2.length < 60; i++) {
      step(p);
      drainCombatEvents(p);
      while (p.tray.length > 0) seen2.push(String(p.tray.pop()!.traitId));
    }
    expect(seen2.filter((x) => x === blood.id || x === BASIC_SKILL_ID).length).toBeGreaterThan(5);
  });
  it('레스렉시온: 써도 저장 절반 남음 · 최대 80% · 해방 끝에도 저장 그대로', () => {
    const s = mkBar({ evo: evo('t4:blood:physical'), liberationUnique: true, liberationSeconds: 2 });
    libNow(s);
    s.evo!.stacks.stored!.n = s.player.maxHp * 0.7;
    expect(s.evo!.stacks.stored!.n).toBeLessThanOrEqual(s.player.maxHp * n.release.storeMax!);
    useAt(s, 0);
    expect(s.evo!.stacks.stored!.n).toBeCloseTo(s.player.maxHp * 0.7 * n.release.keep!, 4);
    const kept = s.evo!.stacks.stored!.n;
    tick(s, ticksOf(s.params, 2.5));
    expect(s.liberation.ticksLeft).toBe(0);
    expect(s.evo!.stacks.stored!.n).toBeCloseTo(kept, 4);
  });
});

describe('비보라 (독·조) — 3체인 뒤 다음 블록 독 · 독 스택 6 → 독', () => {
  const n = N('t4:poison:special');
  const poison = skill('t-poison-c', 'poison', 'family-c');
  const water = skill('t-water-a', 'water', 'family-a');
  it('3체인 → 다음에 새로 생기는 블록 1개가 무조건 독 블록(대기 네모)', () => {
    let forcedPoison = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = mk({ evo: evo('t4:poison:special'), skills: [poison, water], playerElements: ['water'], trayCapacity: 8 }, seed);
      s.spawnTimer = 1e9;
      expect(procOf(useChain(s, 3).evs, '독 예고!')).toBe(true);
      expect(markOf(s, 'evo-f-next')?.value).toBe('1');
      s.spawnTimer = 1;
      tick(s);
      expect(s.tray.length).toBe(1);
      if (s.tray[0]!.traitId === poison.id) forcedPoison++;
      expect(markOf(s, 'evo-f-next')).toBeUndefined();
    }
    expect(forcedPoison).toBe(12);
  });
  it('블록 = 원래 피해 + 체인 수만큼 스택, 6 → 적에게 독(10초, 초당 최대 체력 1.5%, 다시 걸리면 시간 새로) 후 0', () => {
    const plain = blockDmg(useChain(mk({}), 2).evs);
    const s = mk({ evo: evo('t4:poison:special') });
    expect(blockDmg(useChain(s, 2).evs)).toBeCloseTo(plain, 6);
    expect(s.evo!.stacks.toxin!.n).toBe(2);
    useChain(s, 1);
    expect(s.evo!.stacks.toxin!.n).toBe(3);
    expect(procOf(useChain(s, 3).evs, '맹독!')).toBe(true);
    expect(s.evo!.stacks.toxin!.n).toBe(0);
    expect(markOf(s, 'evo-b-venom')?.value).toBe('1.5');
    const d = dots(tick(s, ticksOf(s.params, 3) + 1));
    expect(d.length).toBe(3);
    expect(d[0]!.damage).toBeCloseTo(s.enemy.maxHp * n.venomDot!, 4);
    useChain(s, 3);
    useChain(s, 3);
    expect(s.evo!.buffs.venom!.until - s.tick).toBe(ticksOf(s.params, n.venomSeconds!));
  });
  it('독 지속 피해 +12% 특성이 이 독에도 붙는다', () => {
    const s = mk({ evo: evo('t4:poison:special'), abilityEffects: { evoPoisonDot: 0.12 } });
    useChain(s, 3);
    useChain(s, 3);
    const d = dots(tick(s, ticksOf(s.params, 1) + 1));
    expect(d[0]!.damage).toBeCloseTo(s.enemy.maxHp * n.venomDot! * 1.12, 4);
  });
  it('레스렉시온: 4스택 · 독 15초 · 해방 시작·끝에 스택 그대로', () => {
    const s = mk({ evo: evo('t4:poison:special'), liberationUnique: true, liberationSeconds: 1 });
    useChain(s, 3);
    libNow(s);
    expect(s.evo!.stacks.toxin!.n).toBe(3);
    expect(procOf(useChain(s, 1).evs, '맹독!')).toBe(true);
    expect(s.evo!.buffs.venom!.until - s.tick).toBe(ticksOf(s.params, n.release.venomSeconds!));
    useChain(s, 2);
    tick(s, ticksOf(s.params, 1.5));
    expect(s.liberation.ticksLeft).toBe(0);
    expect(s.evo!.stacks.toxin!.n).toBe(2);
  });
});

describe('데이터 검사 (validateEvoUniques) — 새 종류', () => {
  const bad = (hollow: unknown) => {
    const d = JSON.parse(JSON.stringify(raw)) as { forms: Record<string, Record<string, unknown>> };
    d.forms['t4:normal:special'] = { hollow };
    const bal = JSON.parse(JSON.stringify(EU)) as { traits: Record<string, Record<string, number>>; forms: Record<string, Record<string, Record<string, unknown>>> };
    bal.forms['t4:normal:special'] = { hollow: { k: 1 } };
    return validateEvoUniques(d as never, bal, evoKnown());
  };
  it('after·heavy·forceNext·basicCrit·shieldEnd·selfBlock·spawnExclude·특수 블록 element·maxPer 를 본다', () => {
    const errs = bad({
      ability: {
        description: { '*': 'x' },
        selfBlock: { element: 'fire', family: 'family-z' },
        spawnExclude: ['plasma'],
        stacks: { a: { max: 'k', maxPer: 'ghost' } },
        specials: { sp: { name: { '*': 'x' }, short: 'x', element: 'plasma', need: [{ stack: 'nope' }] } },
        rules: [
          { on: 'block', after: { chain: [9] }, do: [{ act: 'add', stack: 'a', value: 1 }] },
          { on: 'basic', heavy: true, do: [{ act: 'add', stack: 'a', value: 1 }] },
          { on: 'block', do: [{ act: 'forceNext' }] },
          { on: 'block', do: [{ act: 'basicCrit', value: 1 }] },
          { on: 'shieldEnd', do: [{ act: 'hit', basis: 'raw', value: 1 }] },
          { on: 'block', do: [{ act: 'add', stack: 'a', value: 1, dot: true }] },
        ],
        passives: [{ stat: 'selfSpawn', value: 1 }],
      },
    });
    for (const want of ['after chain 9', 'heavy 는 hurt·shieldHit', 'forceNext 는 속성', 'basicCrit 는 basicPre', 'shieldEnd 는 시간 보호막', 'selfBlock hollow 에 없는 블록 계열',
      'spawnExclude 모르는 속성', '특수 블록 sp 모르는 속성', 'need 스택 nope', '모르는 per ghost', 'dot·poison 은 hit']) {
      expect(errs.some((e) => e.includes(want)), want).toBe(true);
    }
  });
});
