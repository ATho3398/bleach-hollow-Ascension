// C.147 (GDD 92장 · 94장 B): 대기 모드 받을 보상(쌓기·24시간 상한·[받기]) · 같은 속성 흡수 = 강화만(노멀은 기본 블록을 가진 것으로)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getTrait } from '../src/data/traits';
import { addEnhance, buildCombatParams, buildOffer, gainTrait, newBuild, ownsElement } from '../src/engine/absorb';
import { basicSources, createCombat, BASIC_SKILL_ID } from '../src/engine/combat';
import { createExpedition } from '../src/engine/expedition';
import { addPetLaps, grantPet } from '../src/engine/pet';
import { idleYield } from '../src/engine/idle';
import { createRng } from '../src/engine/rng';
import { accrueIdle, applyAbsence, claimIdle, idlePendingYield, migrateSave, newSaveData, recordExpedition, sanitizeIdlePending, type SaveData } from '../src/game';
import { choosePet } from '../src/inventory';
import { idleBadge } from '../src/ui/idleView';

const IX = BALANCE.provisional.idle;
const EH = BALANCE.provisional.absorb.enhance;
const HOUR = 3_600_000;
const WON = { status: 'won' as const, finisher: null, chain3Count: 0, weakChain3Count: 0 };

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

describe('92장 대기 모드 받을 보상', () => {
  it('돌아와도 바로 주지 않고 받을 보상으로 보관 — [받기] 때 한 번에 지급 + 런 로그 요약 1건', () => {
    const s = played();
    const gold0 = s.shared.tradeCoins;
    const acc = accrueIdle(s, s.lastSeenAt + 6 * HOUR)!;
    expect(acc.awayHours).toBe(6);
    expect(acc.added).toBe(6);
    expect(s.idlePending).toEqual({ from: 1_000_000, hours: 6, activeHours: 6 });
    expect(s.shared.tradeCoins).toBe(gold0);
    expect(s.runLog.idle).toHaveLength(0);
    expect(idleBadge(s)).toBe('6시간');
    expect(idlePendingYield(s)!.gold).toBe(idleYield(6).gold);
    const r = claimIdle(s, s.lastSeenAt + 6 * HOUR, () => 0)!;
    expect(r.hours).toBe(6);
    expect(r.gold).toBe(idleYield(6).gold);
    expect(s.shared.tradeCoins - gold0).toBe(r.gold);
    expect(s.runLog.idle).toHaveLength(1);
    expect(s.idlePending).toBeNull();
    expect(idleBadge(s)).toBeNull();
    expect(claimIdle(s)).toBeNull(); // 두 번 받지 않는다
  });

  it('안 받고 또 꺼 두면 시간을 더하고, 합계는 최대 24시간 (넘친 시간은 버림)', () => {
    const s = played();
    accrueIdle(s, s.lastSeenAt + 10 * HOUR);
    applyAbsence(s, s.lastSeenAt + 10 * HOUR);
    s.nest.hunger = 0;
    accrueIdle(s, s.lastSeenAt + 8 * HOUR);
    applyAbsence(s, s.lastSeenAt + 8 * HOUR);
    expect(s.idlePending!.hours).toBe(18);
    expect(s.idlePending!.from).toBe(1_000_000); // 처음 쌓기 시작한 시각
    s.nest.hunger = 0;
    const acc = accrueIdle(s, s.lastSeenAt + 30 * HOUR)!;
    expect(acc.awayHours).toBe(30);
    expect(acc.added).toBe(6);
    expect(s.idlePending!.hours).toBe(IX.maxHours);
    expect(s.idlePending!.activeHours).toBeLessThanOrEqual(IX.maxHours);
    const r = claimIdle(s, s.lastSeenAt, () => 0)!;
    expect(r.hours).toBe(24);
    expect(r.gold).toBe(idleYield(24).gold);
  });

  it('10분 미만은 쌓이지 않고, 이미 쌓인 것은 그대로 남는다 · 허기는 받기와 무관하게 바로 오른다', () => {
    const s = played();
    expect(accrueIdle(s, s.lastSeenAt + 5 * 60_000)).toBeNull();
    expect(s.idlePending).toBeNull();
    accrueIdle(s, s.lastSeenAt + 3 * HOUR);
    const hunger = applyAbsence(s, s.lastSeenAt + 3 * HOUR);
    expect(hunger).toBeGreaterThan(0); // 불리한 변화는 지금처럼 바로
    expect(accrueIdle(s, s.lastSeenAt + 5 * 60_000)).toBeNull();
    expect(s.idlePending!.hours).toBe(3);
  });

  it('펫 친밀도는 받을 때 반영 (쌓을 때는 아님)', () => {
    const s = played();
    grantPet(s.shared.pets, 'pet-guard', 1);
    choosePet(s, 'pet-guard', 1);
    addPetLaps(s.shared.pets, 'pet-guard', 0);
    const laps0 = s.shared.pets.owned['pet-guard']!.laps;
    accrueIdle(s, s.lastSeenAt + 24 * HOUR);
    expect(s.shared.pets.owned['pet-guard']!.laps).toBe(laps0);
    const r = claimIdle(s, s.lastSeenAt + 24 * HOUR, () => 0)!;
    expect(s.shared.pets.owned['pet-guard']!.laps).toBe(laps0 + r.laps);
  });

  it('세이브: 받을 보상이 저장·불러오기로 남고, 깨진 값은 버리고 24시간에서 자른다', () => {
    const s = played();
    accrueIdle(s, s.lastSeenAt + 5 * HOUR);
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.idlePending).toEqual({ from: 1_000_000, hours: 5, activeHours: 5 });
    expect(sanitizeIdlePending({ from: 1, hours: 99, activeHours: 99 })).toEqual({ from: 1, hours: 24, activeHours: 24 });
    expect(sanitizeIdlePending({ from: 1, hours: -1, activeHours: 1 })).toBeNull();
    expect(sanitizeIdlePending('x')).toBeNull();
    expect(newSaveData('hollow', 1).idlePending).toBeNull();
  });

  it('방 위 줄 대기 보상 아이콘 · 복귀 창 [받기]/[나중에]', () => {
    const room = readFileSync('src/ui/roomView.ts', 'utf8');
    expect(room).toContain("label: '대기 보상'");
    expect(room).toContain('bha-room__idlebadge');
    const view = readFileSync('src/ui/idleView.ts', 'utf8');
    expect(view).toContain('만에 돌아왔다');
    expect(view).toContain("yes: '받기'");
    expect(view).toContain("no: '나중에'");
  });
});

describe('94장 B 같은 속성 흡수 = 강화만', () => {
  it('노멀은 기본 블록을 가진 것으로 본다 → 노멀 흡수 후보 없음(강화만), 여러 시드·강적·후보 +n 에서도', () => {
    expect(ownsElement(newBuild(), 'normal')).toBe(true);
    for (let seed = 1; seed <= 40; seed++) {
      expect(buildOffer(createRng(seed), getEnemy('normal-basic'), newBuild(), WON, seed % 3).candidates).toEqual([]);
    }
  });

  it('그 속성을 처음 먹을 때만 새 블록 — 하나라도 가지면 그 속성은 강화만', () => {
    const b = newBuild();
    const first = buildOffer(createRng(3), getEnemy('fire-basic'), b, WON);
    expect(first.candidates.length).toBeGreaterThan(0);
    expect(first.candidates.every((id) => getTrait(id).element === 'fire')).toBe(true);
    gainTrait(b, first.candidates[0]!);
    expect(ownsElement(b, 'fire')).toBe(true);
    for (let seed = 1; seed <= 40; seed++) expect(buildOffer(createRng(seed), getEnemy('fire-basic'), b, WON, 2).candidates).toEqual([]);
    // 다른 속성은 여전히 새 블록
    expect(buildOffer(createRng(3), getEnemy('water-basic'), b, WON).candidates.length).toBeGreaterThan(0);
  });

  it('노멀 강화는 기본 공격 블록 위력에 붙는다 (10단계 = earlyPerLevel × 10)', () => {
    const b = newBuild();
    for (let i = 0; i < 10; i++) addEnhance(b, 'normal');
    const p = buildCombatParams(b, 'hollow');
    expect(p.basicAttackEnhance).toBeCloseTo(1 + EH.earlyPerLevel * 10);
    const c = createCombat(1, { enemy: getEnemy('normal-basic'), params: p } as Parameters<typeof createCombat>[1]);
    const basic = basicSources(c.params).find((x) => x.id === BASIC_SKILL_ID)!;
    expect(basic.powerMultiplier).toBeCloseTo(1 + EH.earlyPerLevel * 10);
    expect(basicSources({ ...c.params, basicAttackEnhance: undefined }).find((x) => x.id === BASIC_SKILL_ID)!.powerMultiplier).toBe(1);
  });

  it('흡수 화면 문구: "새 블록" / "강화 n→n+1"', () => {
    const src = readFileSync('src/ui/absorbView.ts', 'utf8');
    expect(src).toContain("chip('새 블록')");
    expect(src).toContain('강화 ${lv}→${lv + 1}');
    expect(src).toContain('이미 가진 속성 — 강화만');
  });
});
