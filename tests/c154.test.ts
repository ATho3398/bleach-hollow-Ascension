// C.154 (GDD 95장 B1·B2): 대기 보상 상시(켜 둔 동안에도 쌓임, 정산 시각 하나) · 해방 게이지 = 블록 + 준 피해 + 받은 피해, 빈 해방 칸 = 장착 본체 블록
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { ENEMIES } from '../src/data/enemies';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import { canLiberate, createCombat, defaultCombatParams, liberationStartGaugeOf, type CombatParams, liberationBlocksOf, spawnTableOf, step, type CombatState } from '../src/engine/combat';
import { createExpedition } from '../src/engine/expedition';
import { accrueIdle, applyAbsence, claimIdle, idleClaimable, newSaveData, recordExpedition, tickIdle, type SaveData } from '../src/game';
import { liberationHint } from '../src/ui/labels';
import { getFaction } from '../src/data/factions';

const IX = BALANCE.provisional.idle;
const MIN = 60_000;
const HOUR = 3_600_000;

function played(): SaveData {
  const s = newSaveData('hollow', 1);
  const exp = createExpedition({ factionId: 'hollow', seed: 7, hunger: 20, condition: 80, deck: [], build: s.build, evolution: s.evolution });
  exp.phase = 'ended';
  exp.outcome = 'returned';
  exp.endReason = 'returned';
  exp.lapsCompleted = 1;
  recordExpedition(s, exp, 0);
  s.lastSeenAt = 1_000_000;
  s.nest.hunger = 0;
  s.nest.weakened = false;
  return s;
}

describe('95장 B1 대기 보상 상시', () => {
  it('켜 둔 동안 1분마다 쌓이고(원정 중에도), 합계 10분부터 받을 수 있다', () => {
    const s = played();
    s.activeExpedition = { fake: true } as unknown as SaveData['activeExpedition']; // 원정·전투 중
    let t = s.lastSeenAt;
    for (let i = 0; i < 9; i++) tickIdle(s, (t += MIN));
    expect(s.idlePending!.hours).toBeCloseTo(9 / 60);
    expect(idleClaimable(s)).toBe(false);
    tickIdle(s, (t += MIN));
    expect(idleClaimable(s)).toBe(true);
    expect(s.lastSeenAt).toBe(t);
  });

  it('켜 둔 시간 + 꺼 둔 시간을 두 번 세지 않는다 (정산 시각 하나)', () => {
    const s = played();
    const t0 = s.lastSeenAt;
    tickIdle(s, t0 + 30 * MIN); // 30분 켜 둠
    tickIdle(s, t0 + 60 * MIN); // 저장(persist)도 같은 tickIdle
    // 끄고 2시간 뒤 다시 연다: 마지막 정산 뒤 2시간만 더해진다
    const acc = accrueIdle(s, t0 + 3 * HOUR)!;
    applyAbsence(s, t0 + 3 * HOUR);
    expect(acc.added).toBeCloseTo(2);
    expect(s.idlePending!.hours).toBeCloseTo(3);
    // 같은 시각에 또 쌓아도 0
    expect(tickIdle(s, t0 + 3 * HOUR)).toBe(false);
    expect(s.idlePending!.hours).toBeCloseTo(3);
    const r = claimIdle(s, t0 + 3 * HOUR, () => 0)!;
    expect(r.hours).toBeCloseTo(3);
    expect(s.runLog.idle).toHaveLength(1); // 런 로그 요약 1건 그대로
  });

  it('켜 둔 채로도 합계 최대 24시간, 첫 원정 전엔 쌓지 않는다', () => {
    const s = played();
    let t = s.lastSeenAt;
    for (let i = 0; i < 30; i++) tickIdle(s, (t += HOUR));
    expect(s.idlePending!.hours).toBe(IX.maxHours);
    const fresh = newSaveData('hollow', 1);
    expect(tickIdle(fresh, fresh.lastSeenAt + HOUR)).toBe(false);
    expect(fresh.idlePending).toBeNull();
  });

  it('꺼 둔 시간은 원정 중간 저장이 있으면 그대로 안 쌓는다 (C.140 규칙)', () => {
    const s = played();
    s.activeExpedition = { fake: true } as unknown as SaveData['activeExpedition'];
    expect(accrueIdle(s, s.lastSeenAt + HOUR)).toBeNull();
  });
});

const pool = ENEMIES.filter((e) => !e.testOnly);
const elite = pool.find((e) => e.class === 'elite')!;
/** 새 세이브 안정 수치의 시작 게이지 (balance 점검 봇과 같음) */
const START = { liberationStartGauge: liberationStartGaugeOf(BALANCE.provisional.risk.stabilityStart) };
/** 블록을 전혀 안 쓰는 자동전투(평타만) — 해방만 누른다 */
function autoOnly(s: CombatState): CombatState {
  while (s.status === 'playing') {
    step(s, canLiberate(s) ? { type: 'liberate' } : null);
    s.events.length = 0;
  }
  return s;
}

describe('95장 B2 해방 개선', () => {
  it('블록을 안 써도 준 피해·받은 피해로 게이지가 차서 강적전에 해방한다', () => {
    let used = 0;
    for (let seed = 1; seed <= 20; seed++) if (autoOnly(createCombat(seed, { enemy: elite, params: START })).liberation.uses > 0) used++;
    expect(used).toBeGreaterThanOrEqual(5); // C.173: 강공격 ×2.5 로 평타만 치는 몸이 먼저 쓰러지는 판이 늘어 10 → 6. C.174: 강공격 ×3 이라 6 → 5
  });

  it('피해 몫 0 이면 옛 동작(블록만) — 자동전투는 해방 못 함', () => {
    const s = autoOnly(createCombat(1, { enemy: elite, params: { ...START, liberationGaugePerDealt: 0, liberationGaugePerTaken: 0 } }));
    expect(s.liberation.uses).toBe(0);
  });

  it('해방 중 블록 = 장착 본체 블록 → 장착이 없으면 기본 블록 (98장 B: 해방 칸 폐지)', () => {
    const b = newBuild();
    gainTrait(b, 't-thunder-c');
    gainTrait(b, 't-fire-a');
    const p: CombatParams = { ...defaultCombatParams(), ...buildCombatParams(b, 'hollow') };
    const lib = liberationBlocksOf(p);
    expect(lib.source).toBe('body');
    expect(lib.skills.map((x) => x.id).sort()).toEqual(['t-fire-a', 't-thunder-c']);
    const ids = spawnTableOf(p, true).entries.map((e) => e.source?.id).sort();
    expect(ids).toEqual(['t-fire-a', 't-thunder-c']);
    expect(liberationBlocksOf({ skills: [] }).source).toBe('basic');
  });

  it('설명 한 줄: 무엇으로 차는지 + 해방 중 나오는 블록', () => {
    const f = getFaction('hollow');
    const b = newBuild();
    gainTrait(b, 't-thunder-c');
    const p: CombatParams = { ...defaultCombatParams(), ...buildCombatParams(b, 'hollow') };
    const t = liberationHint(f, p);
    expect(t).toContain('주고받은 피해');
    expect(t).toContain('해방 중 장착 블록(탄)이 빠르게');
    expect(liberationHint(f, { skills: [] })).toContain('기본 블록');
  });
});

describe('95장 B2 C.166·C.168 후속: 해방 순간 블록 1개(C.166 2개 → C.168 1개)·빠른 생성', () => {
  const LB = BALANCE.provisional.liberation;
  const mk = () => {
    const b = newBuild();
    gainTrait(b, 't-thunder-c');
    return createCombat(5, { enemy: elite, params: buildCombatParams(b, 'hollow') });
  };
  it('빈 바: 누르는 순간 장착 블록이 바로 들어온다', () => {
    const s = mk();
    s.tray = [];
    s.liberation.gauge = 100;
    step(s, { type: 'liberate' });
    expect(LB.instantBlocks).toBe(1);
    expect(s.tray.length).toBeGreaterThanOrEqual(1);
    expect(s.tray[0]!.traitId).toBe('t-thunder-c');
  });
  it('가득 찬 바: 오른쪽 끝 기본 막기·회복부터 밀어낸다', () => {
    const s = mk();
    const blk = (traitId: string) => ({ uid: s.nextUid++, kind: 'skill' as const, traitId, family: null, element: null });
    s.tray = [blk('basic-heal'), blk('basic-skill'), blk('basic-skill'), blk('basic-guard'), blk('basic-skill'), blk('basic-skill'), blk('basic-skill'), blk('basic-skill')];
    s.liberation.gauge = 100;
    step(s, { type: 'liberate' });
    expect(s.tray).toHaveLength(s.params.trayCapacity);
    expect(s.tray.some((x) => x.traitId === 'basic-guard')).toBe(false); // 오른쪽에 가까운 기본 막기·회복부터
    expect(s.tray.some((x) => x.traitId === 'basic-heal')).toBe(true);
    expect(s.tray[s.tray.length - 1]!.traitId).toBe('t-thunder-c');
  });
  it("해방 6초 동안 블록 약 5개 (특성 1, 안 누름 — 순간 1개 + 생성 ×1.8. C.174: 막기·회복 블록 몫이 빠져 평소 생성 간격이 길어져 약 6 → 5)", () => {
    let tot = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = createCombat(seed, { enemy: elite, params: buildCombatParams((() => { const b = newBuild(); gainTrait(b, 't-thunder-c'); return b; })(), 'hollow') });
      s.tray = [];
      s.liberation.gauge = 100;
      step(s, { type: 'liberate' });
      let n = s.tray.length;
      while (s.liberation.ticksLeft > 0 && s.status === 'playing') { s.events.length = 0; step(s, null); n += s.events.filter((e) => e.kind === 'spawn').length; }
      tot += n;
    }
    expect(tot / 10).toBeGreaterThanOrEqual(4.5);
  });
});
