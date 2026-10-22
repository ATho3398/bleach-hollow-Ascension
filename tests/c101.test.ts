// C.101 (S-23, GDD 48장): 속성 피해 능력치 5종 — 무속성(노멀) + 기본 원소 4종. 출처는 아직 없고(모두 0) 테스트 모드 입력만 있다
import { describe, expect, it } from 'vitest';
import { getEnemy } from '../src/data/enemies';
import { ELEMENTAL_IDS, NORMAL_ELEMENT, SPECIAL_ELEMENT_IDS } from '../src/data/elements';
import {
  createCombat, drainCombatEvents, ELEMENT_DAMAGE_IDS, elementDamageBonus, step, zeroElementDamage,
  type CombatEvent, type CombatInput, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { buildBattleRecord } from '../src/engine/combat/record';
import { applyEvolutionToParams, elementDamageOf, newEvolution } from '../src/engine/evolution';
import { resetStats, setElementDamage, TEST_ELEMENT_DAMAGE_MAX } from '../src/engine/testMode';
import { newSaveData, SAVE_FORMAT_VERSION } from '../src/game';
import { elementDamageAbbr, elementDamagePct } from '../src/ui/bha/element';

const SPECIAL = SPECIAL_ELEMENT_IDS[0]!;
const all = (pct: number): Record<string, number> => Object.fromEntries(ELEMENT_DAMAGE_IDS.map((id) => [id, pct]));

/** 입력(policy)대로 끝까지 돌리며 사건을 모은다 */
function playOut(s: CombatState, policy: (s: CombatState) => CombatInput | null = () => null): CombatEvent[] {
  const out: CombatEvent[] = [];
  while (s.status === 'playing') {
    step(s, policy(s));
    out.push(...drainCombatEvents(s));
  }
  return out;
}

const NO_CRIT: Partial<CombatParams> = { critChance: 0, enemyCritChance: 0 };
const firstAttack = (params: Partial<CombatParams>) => {
  const ev = playOut(createCombat(7, { enemy: getEnemy('test-a'), params: { ...NO_CRIT, ...params } }));
  return ev.find((e) => e.kind === 'player-attack') as Extract<CombatEvent, { kind: 'player-attack' }>;
};

describe('속성 피해 칸 (GDD 48장 1번)', () => {
  it('칸 = 노멀 + 기본 원소 4종 (속성 데이터에서), 특수 속성은 칸이 없다', () => {
    expect(ELEMENT_DAMAGE_IDS).toEqual([NORMAL_ELEMENT, ...ELEMENTAL_IDS]);
    expect(ELEMENT_DAMAGE_IDS).toHaveLength(5);
    for (const sp of SPECIAL_ELEMENT_IDS) expect(ELEMENT_DAMAGE_IDS).not.toContain(sp);
  });
  it('elementDamageOf: 기본 모두 0, 테스트 입력만 더한다(특수 속성 키는 버림)', () => {
    const e = newEvolution();
    expect(elementDamageOf(e)).toEqual(zeroElementDamage());
    e.testElementDamage = { [ELEMENTAL_IDS[1]!]: 50, [SPECIAL]: 99 };
    expect(elementDamageOf(e)).toEqual({ ...zeroElementDamage(), [ELEMENTAL_IDS[1]!]: 50 });
    const params: Partial<CombatParams> = {};
    applyEvolutionToParams(params, e, 'hollow');
    expect(params.elementDamage).toEqual(elementDamageOf(e));
  });
  it('elementDamageBonus: 속성 없음 = 무속성 칸, 특수 = 없음, 0 이면 없음', () => {
    const p = { elementDamage: { ...all(0), [NORMAL_ELEMENT]: 10, [ELEMENTAL_IDS[0]!]: 20, [ELEMENTAL_IDS[1]!]: 30 } };
    expect(elementDamageBonus(p, [])).toEqual({ ids: [NORMAL_ELEMENT], pct: 10 });
    expect(elementDamageBonus(p, [ELEMENTAL_IDS[0]!])).toEqual({ ids: [ELEMENTAL_IDS[0]], pct: 20 });
    expect(elementDamageBonus({ elementDamage: { ...all(100), [SPECIAL]: 100 } }, [SPECIAL])).toBeNull();
    expect(elementDamageBonus({ elementDamage: all(0) }, [])).toBeNull();
  });
});

describe('속성 피해 배율 (GDD 48장 2번)', () => {
  it.each(ELEMENT_DAMAGE_IDS.map((id) => [id]))('%s 몸 평타: 자기 칸 +50% 면 ×1.5, 다른 칸만 있으면 그대로', (id) => {
    const base = firstAttack({ playerElements: [id] });
    const own = firstAttack({ playerElements: [id], elementDamage: { ...all(0), [id]: 50 } });
    const other = firstAttack({ playerElements: [id], elementDamage: { ...all(100), [id]: 0 } });
    expect(own.damage / base.damage).toBeCloseTo(1.5, 9);
    expect(own.elem).toEqual({ ids: [id], pct: 50 });
    expect(other.damage).toBe(base.damage);
    expect(other.elem).toBeUndefined();
  });
  it('특수 속성 몸(혈·독·허) 평타는 어느 칸도 받지 않는다', () => {
    for (const sp of SPECIAL_ELEMENT_IDS) {
      const base = firstAttack({ playerElements: [sp] });
      const boosted = firstAttack({ playerElements: [sp], elementDamage: all(200) });
      expect(boosted.damage).toBe(base.damage);
      expect(boosted.elem).toBeUndefined();
    }
  });
  it('융합(속성 2개) 공격 = 각 속성 값의 1/2 합 (GDD 48장 7번: 물 +20%·흙 +10% → +15%)', () => {
    const [w, , e] = ELEMENTAL_IDS as [string, string, string];
    const p = { elementDamage: { ...all(0), [w]: 20, [e]: 10, [NORMAL_ELEMENT]: 99 } };
    expect(elementDamageBonus(p, [w, e])).toEqual({ ids: [w, e], pct: 15 });
    expect(elementDamageBonus(p, [w, SPECIAL])).toEqual({ ids: [w], pct: 10 }); // 특수 쪽 절반은 0
    expect(elementDamageBonus({ elementDamage: { ...all(0), [NORMAL_ELEMENT]: 50 } }, [w, e])).toBeNull(); // 무속성 칸은 안 받는다
    const base = firstAttack({ playerElements: [w, e] });
    const fused = firstAttack({ playerElements: [w, e], elementDamage: p.elementDamage });
    expect(fused.damage / base.damage).toBeCloseTo(1.15, 9);
    expect(fused.elem).toEqual({ ids: [w, e], pct: 15 });
  });
  it('치명과 곱한다: 치명 100% + 무속성 +50% = ×1.5 × ×1.5', () => {
    const base = firstAttack({});
    const both = firstAttack({ critChance: 1, critChanceMax: 1, elementDamage: { ...all(0), [NORMAL_ELEMENT]: 50 } });
    expect(both.crit).toBe(true);
    expect(both.damage / base.damage).toBeCloseTo(1.5 * 1.5, 9);
  });
  it('무속성 칸 적용 범위: 저장 필살·속성 없는 기본 블록은 무속성, 공허 블록은 제외 (SP 필살 블록은 C.118 에 삭제)', () => {
    const s = createCombat(3, {
      enemy: getEnemy('test-a'),
      params: { ...NO_CRIT, voidCheckSeconds: 1, voidChance: 0.5, voidChanceMax: 0.5, storedGaugePerBlock: 100, elementDamage: { ...all(0), [NORMAL_ELEMENT]: 40 } },
    });
    const ev = playOut(s, (st) => (st.storedCharges > 0 ? { type: 'stored' } : st.tray.length > 0 ? { type: 'use', cell: 0 } : null));
    const blocks = ev.filter((e): e is Extract<CombatEvent, { kind: 'block' }> => e.kind === 'block');
    const voids = blocks.filter((e) => e.block === 'void');
    const plainSkill = blocks.filter((e) => e.block === 'skill' && e.element === null && e.damage > 0);
    const stored = ev.filter((e): e is Extract<CombatEvent, { kind: 'stored-use' }> => e.kind === 'stored-use');
    expect(voids.length).toBeGreaterThan(0);
    expect(plainSkill.length).toBeGreaterThan(0);
    expect(stored.length).toBeGreaterThan(0);
    for (const e of [...plainSkill, ...stored]) expect(e.elem).toEqual({ ids: [NORMAL_ELEMENT], pct: 40 });
    for (const e of voids) expect(e.elem).toBeUndefined();
  });
  it('해방 블록은 내 캐릭터 속성 칸', () => {
    const fire = ELEMENTAL_IDS.find((x) => x === 'fire') ?? ELEMENTAL_IDS[0]!;
    const s = createCombat(5, {
      enemy: getEnemy('test-a'),
      params: { ...NO_CRIT, playerElements: [fire], liberationEnabled: true, liberationGaugeFraction: 0.01, elementDamage: { ...all(0), [fire]: 50 } },
    });
    const ev = playOut(s, (st) => {
      const li = st.tray.findIndex((b) => b.kind === 'liberation');
      if (li >= 0) return { type: 'use', cell: li };
      return { type: 'liberate' };
    });
    const lib = ev.filter((e): e is Extract<CombatEvent, { kind: 'block' }> => e.kind === 'block' && e.block === 'liberation');
    expect(lib.length).toBeGreaterThan(0);
    for (const e of lib) expect(e.elem).toEqual({ ids: [fire], pct: 50 });
  });
  it('반사(되갚기)·독 지속 피해는 속성 피해를 받지 않는다', () => {
    const thorns = (pct: number) => {
      const ev = playOut(createCombat(9, { enemy: getEnemy('test-a'), params: { ...NO_CRIT, abilityEffects: { thorns: { threshold: 0.05, ret: 1 } }, elementDamage: all(pct) } }));
      return ev.find((e) => e.kind === 'ability' && e.effect === 'thorns') as Extract<CombatEvent, { kind: 'ability' }>;
    };
    expect(thorns(0)).toBeDefined();
    expect(thorns(300).damage).toBe(thorns(0).damage);
    // 독 몸: 평타가 거는 독(지속 피해)은 그 평타 피해에서 나온다 — 독은 특수 속성이라 칸이 없어 그대로
    const poison = SPECIAL_ELEMENT_IDS.find((x) => x === 'poison') ?? SPECIAL;
    const dot = (pct: number) => {
      const s = createCombat(7, { enemy: getEnemy('test-a'), params: { ...NO_CRIT, playerElements: [poison], elementDamage: all(pct) } });
      while (s.status === 'playing' && !s.enemy.dot) step(s, null);
      return s.enemy.dot?.perTick;
    };
    expect(dot(0)).toBeGreaterThan(0);
    expect(dot(300)).toBe(dot(0));
  });
  it('모두 0 이면 피해가 바뀌지 않는다 (전투 전체가 같다)', () => {
    const run = (params: Partial<CombatParams>) => {
      const s = createCombat(11, { enemy: getEnemy('test-a'), params });
      const ev = playOut(s, (st) => (st.tray.length > 0 ? { type: 'use', cell: 0 } : null));
      return { ev: JSON.stringify(ev), status: s.status, hp: s.player.hp, tick: s.tick };
    };
    expect(run({ elementDamage: all(0) })).toEqual(run({ elementDamage: {} }));
    expect(run({})).toEqual(run({ elementDamage: {} }));
  });
});

describe('기록·테스트 모드·표시 (GDD 48장 4~6번)', () => {
  it('전투 기록에 그 판의 속성 피해 5종', () => {
    const s = createCombat(7, { enemy: getEnemy('test-a'), params: { elementDamage: { ...all(0), [ELEMENTAL_IDS[2]!]: 25 } } });
    playOut(s);
    expect(buildBattleRecord(s, { factionId: 'hollow' }).elementDamage).toEqual({ ...zeroElementDamage(), [ELEMENTAL_IDS[2]!]: 25 });
  });
  it('세이브 형식은 그대로(옵션 필드), 테스트 입력은 0~상한 정수 · 기본값으로 되돌리면 지워진다', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(31);
    const save = newSaveData('hollow', 0);
    const out = setElementDamage(save, { [ELEMENTAL_IDS[1]!]: 50.4, [NORMAL_ELEMENT]: -5, [ELEMENTAL_IDS[0]!]: 99999, [SPECIAL]: 50 });
    expect(out).toEqual({ ...zeroElementDamage(), [ELEMENTAL_IDS[1]!]: 50, [ELEMENTAL_IDS[0]!]: TEST_ELEMENT_DAMAGE_MAX });
    expect(save.evolution.testElementDamage).not.toHaveProperty(SPECIAL);
    resetStats(save);
    expect(save.evolution.testElementDamage).toBeUndefined();
    setElementDamage(save, all(0));
    expect(save.evolution.testElementDamage).toBeUndefined();
  });
  it('상태 화면·전투 로그 글자: 노멀 칸 = "무", 원소 = 속성 한 글자, % 부호', () => {
    expect(elementDamageAbbr(NORMAL_ELEMENT, 'hollow')).toBe('무');
    expect(ELEMENT_DAMAGE_IDS.map((id) => elementDamageAbbr(id, 'hollow'))).toEqual(['무', '물', '불', '흙', '뇌']);
    expect([elementDamagePct(0), elementDamagePct(50), elementDamagePct(-10)]).toEqual(['+0%', '+50%', '−10%']);
  });
});
