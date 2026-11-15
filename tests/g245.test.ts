// GDD 245장 (코딩275): 강공격 = 예고 끝에 빔·그 순간 판정 · 능력치 표시 · 시작 먹이 · 튜토리얼 돌봄 요청 없음.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BALANCE } from '../src/config/balance';
import { BOSSES } from '../src/data/bosses';
import { ENEMIES, getEnemy } from '../src/data/enemies';
import { NORMAL_FOODS } from '../src/engine/foodPref';
import { createCombat, drainCombatEvents, hitDelayTicks, playerAttackSecondsOf, defaultCombatParams, step, type CombatEvent, type CombatState } from '../src/engine/combat';
import { newSaveData, tickCare, tutorialInProgress } from '../src/game';
import { recoverFeed } from '../src/recoverTutorial';
import { statDisplay } from '../src/statDisplay';
import { homeMaxHp, statusStatDisplay } from '../src/home';
import { RECOVER_SCENES } from '../src/data/help';

const read = (p: string) => readFileSync(p, 'utf8');

/** 강공격 한 번을 끝까지: windup 의 atTick 과 heavy-hit 이 실제로 나온 틱. guard = windup 때 막기 */
function heavyOnce(s: CombatState, guard: boolean): { windAt: number; windTick: number; hitTick: number; hit: Extract<CombatEvent, { kind: 'heavy-hit' }> } | null {
  let windAt = -1;
  let windTick = -1;
  for (let i = 0; i < 20000 && s.status === 'playing'; i++) {
    if (guard && windAt >= 0) s.guard.ticks = Math.max(s.guard.ticks, 30); // 빔이 나간 뒤 막기 중 (입력 조건은 c84 등에서 따로)
    step(s, null);
    for (const e of drainCombatEvents(s)) {
      if (e.kind === 'heavy-windup' && windAt < 0) {
        windAt = e.atTick;
        windTick = s.tick;
      }
      if (e.kind === 'heavy-hit' && windAt >= 0) return { windAt, windTick, hitTick: s.tick, hit: e };
    }
  }
  return null;
}

describe('245장 3 강공격: 예고 끝 틱 = 빔이 닿는 틱 = 피해 판정 틱', () => {
  const lead = 0.6;
  const params = { hitDelay: { basic: 0.3, block: 0.3, enemy: 0.3, heavy: lead, counter: 0.3 }, playerMaxHp: 100000 };
  it('일반 강적: windup 은 판정 hitDelay.heavy 전에, heavy-hit(landed)은 windup 이 알린 바로 그 틱에', () => {
    const s = createCombat(7, { enemy: getEnemy('normal-heavy-seal'), params });
    const r = heavyOnce(s, false)!;
    expect(r).not.toBeNull();
    expect(r.hitTick).toBe(r.windAt);
    expect(r.windAt - r.windTick).toBe(hitDelayTicks(s.params, lead));
    expect(r.hit.landed).toBe(true);
    expect(r.hit.guarded).toBe(false);
    expect(r.hit.damage).toBeGreaterThan(0);
    expect((s.pendingHits ?? []).some((h) => h.event.kind === 'heavy-hit')).toBe(false); // 지연 예약 없음
  });
  it('막기 중이면 그 순간 막힘 (빔이 나간 뒤 막아도 판정 틱에 막고 있으면 막기)', () => {
    const s = createCombat(7, { enemy: getEnemy('normal-heavy-seal'), params });
    const r = heavyOnce(s, true)!;
    expect(r.hitTick).toBe(r.windAt);
    expect(r.hit.guarded).toBe(true);
  });
  it('보스 강공격도 같은 규칙', () => {
    const boss = Object.values(BOSSES).find((b) => b.enemy.pattern && 'heavyInAttacks' in b.enemy.pattern);
    expect(boss).toBeTruthy();
    const s = createCombat(3, { enemy: boss!.enemy, params });
    const r = heavyOnce(s, false)!;
    expect(r).not.toBeNull();
    expect(r.hitTick).toBe(r.windAt);
    expect(r.hit.landed).toBe(true);
  });
  it('연속 강공격(heavy-chain): 이어지는 예고마다 windup → 그 틱에 판정', () => {
    const s = createCombat(5, { enemy: getEnemy('normal-heavy-chain'), params });
    const a = heavyOnce(s, false)!;
    const b = heavyOnce(s, false)!;
    expect(a.hitTick).toBe(a.windAt);
    expect(b.hitTick).toBe(b.windAt);
  });
  it('화면: windup 때 모션 시작(hitInMs = 판정까지), 막았나는 빔이 닿는 순간 읽는다(guardedAt)', () => {
    const v = read('src/ui/battleView.ts');
    expect(v).toContain("if (e.kind === 'heavy-windup') {");
    expect(v).toContain('guardedAt: () => heavyGuarded ?? s.guard.ticks > 0');
    expect(read('src/ui/attackFx.ts')).toContain("const guarded = typeof guardedOf === 'function' ? guardedOf() : guardedOf;");
  });
});

describe('245장 4 능력치 표시', () => {
  it('체력 = 최대 체력(방 체력 막대와 같은 값) · 속도 = n.n초에 1번 · 방어·정신력 = 받는 피해 배율 · 힘·지능 그대로', () => {
    const s = newSaveData('hollow', 1);
    const d = statusStatDisplay(s);
    expect(d.hp.value).toBeCloseTo(homeMaxHp(s), 6);
    expect(d.aspd.text).toMatch(/^\d+\.\d\d초에 1번$/); // C.446: 0.01초 표시
    expect(d.def.text).toMatch(/^×\d+\.\d\d$/);
    const p = { ...defaultCombatParams(), playerStats: { hp: 10, atk: 10, int: 10, def: 20, spr: 5, aspd: 10, bspd: 10 } };
    const v = statDisplay(p.playerStats, 10, p);
    expect(v.def.text).toBe('×0.50'); // 방어가 기준의 두 배 = 받는 피해 절반
    expect(v.spr.text).toBe('×2.00');
    expect(v.atk.text).toBe('10');
    expect(v.aspd.value).toBeCloseTo(playerAttackSecondsOf(p), 9);
    expect(d.bspd.text).toMatch(/^\d+\.\d\d초에 1개$/); // C.446 블록속도 = 블록 생성 간격
  });
});

describe('245장 2·7·8 튜토리얼', () => {
  it('새 게임: 일반 먹이 없음 → 첫 끼니 먹인 뒤 6종 각 3개', () => {
    const s = newSaveData('hollow', 1);
    for (const f of NORMAL_FOODS) expect(s.shared.food[f]).toBe(0);
    s.help.guides.recover = 'pending' as never;
    recoverFeed(s, 2);
    for (const f of NORMAL_FOODS) expect(s.shared.food[f]).toBe(3);
  });
  it("온천 안내 = 체력 가득까지, '체력이 가득 찼다!'", () => {
    expect(BALANCE.provisional.tutorialRecover.spaTo).toBe(1);
    expect(RECOVER_SCENES.find((x) => x.id === 'to-spa')!.done).toBe('체력이 가득 찼다!');
  });
  it('튜토리얼 중에는 돌봄 요청(쓰다듬기·재우기)이 안 생기고, 끝나면 그때부터 첫 요청 시계', () => {
    const s = newSaveData('hollow', 0);
    expect(tutorialInProgress(s)).toBe(true);
    const far = 10 * 3_600_000;
    expect(tickCare(s, far, () => 0.5)).toBe(false);
    expect(s.nest.careRequest).toBeNull();
    s.help.guides = {};
    expect(tutorialInProgress(s)).toBe(false);
    const first = BALANCE.provisional.nest.careRequest.firstDelayMinutes * 60_000;
    expect(tickCare(s, far + first - 1, () => 0.5)).toBe(false);
    expect(tickCare(s, far + first, () => 0.5)).toBe(true);
  });
});

describe('245장 11 적 공격 분류 = 공격마다 데이터 (보관본 245장 11 정정, GDD v6 7-10)', () => {
  const mixed = ENEMIES.filter((e) => e.category === 'mixed');
  const catOf = (e: CombatEvent): string | null => (e.kind === 'enemy-attack' ? String(e.cat) : e.kind === 'swing' && e.hit.kind === 'enemy-attack' ? String(e.hit.cat) : null);
  const basicCats = (enemy: (typeof ENEMIES)[number], seed = 11) => {
    const s = createCombat(seed, { enemy, params: { playerMaxHp: 1e9 } });
    const cats = new Set<string>();
    for (let i = 0; i < 4000 && s.status === 'playing'; i++) {
      step(s, null);
      for (const e of drainCombatEvents(s)) { const c = catOf(e); if (c) cats.add(c); }
    }
    return [...cats].sort();
  };
  it('혼합 적 17종 모두 일반 공격 분류 칸이 있고, 물리만·특수만·굴림이 골고루', () => {
    expect(mixed).toHaveLength(17);
    const kinds = new Set(mixed.map((e) => e.attackCategory));
    expect([...kinds].sort()).toEqual(['mixed', 'physical', 'special']);
  });
  it('일반 공격: 물리만 적 = 물리만, 굴림 적 = 둘 다, 분류 칸 없는 물리 적 = 자기 분류(물려받음)', () => {
    expect(basicCats(mixed.find((e) => e.attackCategory === 'physical' && !e.pattern?.kind.startsWith('heavy'))!)).toEqual(['physical']);
    expect(basicCats(mixed.find((e) => e.attackCategory === 'special' && !e.pattern?.kind.startsWith('heavy'))!)).toEqual(['special']);
    expect(basicCats(mixed.find((e) => e.attackCategory === 'mixed' && (e.physicalShare ?? 0.5) === 0.5)!)).toEqual(['physical', 'special']);
    const plain = ENEMIES.find((e) => e.category === 'physical' && e.attackCategory === undefined)!;
    expect(basicCats(plain)).toEqual(['physical']);
  });
  it('강공격 = 순번별 heavyCategories (예: 물리 → 특수 → 물리)', () => {
    const enemy = mixed.find((e) => e.pattern?.kind === 'heavy-chain' && JSON.stringify((e.pattern as { heavyCategories?: string[] }).heavyCategories) === JSON.stringify(['physical', 'special', 'physical']))!;
    expect(enemy).toBeTruthy();
    const s = createCombat(4, { enemy, params: { playerMaxHp: 1e9 } });
    const seq: string[] = [];
    for (let i = 0; i < 40000 && s.status === 'playing' && seq.length < 6; i++) {
      step(s, null);
      for (const e of drainCombatEvents(s)) if (e.kind === 'heavy-hit') seq.push(String(e.cat));
    }
    expect(seq).toEqual(['physical', 'special', 'physical', 'physical', 'special', 'physical']);
  });
});
