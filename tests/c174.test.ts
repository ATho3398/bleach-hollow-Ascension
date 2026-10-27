// C.174 (GDD 101장 추가 결정 3): 강공격 한 방 약 45%·연속 강공격 세 타 합 같은 비율, 밸런스 기준 사람형 봇은 막기 블록이 있으면 강공격을 다 막는다
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { applyInput, BASIC_SKILL_ID, canUseRole, createCombat, defaultCombatParams, halted, HUMAN_BOT_DEFAULTS, playCombatHuman, replayCombat, spawnTableOf, step, ticksOf } from '../src/engine/combat';

const CX = BALANCE.provisional.combat;

describe('C.174 강공격 45% · 사람형 봇 다 막음', () => {
  it('강공격 ×3(약 45%), 연속 강공격 한 타 = ×3 × 0.755(세 타 합이 한 방과 같은 비율)', () => {
    expect(CX.heavyHitMultiplier).toBe(3);
    expect(CX.heavyChainHitMultiplier).toBeCloseTo(CX.heavyHitMultiplier * 0.755, 1);
  });
  it('사람형 봇 기본 막기 성공 100%', () => {
    expect(HUMAN_BOT_DEFAULTS.guardSuccess).toBe(1);
  });
});

describe('C.174 2차 막기·회복 = 블록 밖 버튼 · 경직 중 블록 사용 금지 (GDD 105장)', () => {
  const quiet = () => {
    const s = createCombat(1, { enemy: getEnemy('test-a'), params: { timeLimitSeconds: 1e9, voidChance: 0 } });
    s.spawnTimer = 1e9;
    s.player.hp = s.player.maxHp = 1e9;
    s.enemy.hp = s.enemy.maxHp = 1e9;
    return s;
  };
  const RC = CX.roleCharges;

  it('충전: 시간으로 한 칸씩 최대 칸, 시작 칸은 설정값', () => {
    const s = quiet();
    expect(s.charges.guard).toBe(RC.guardStart);
    expect(s.charges.heal).toBe(RC.healStart);
    for (let i = 0; i < ticksOf(s.params, RC.guardSeconds); i++) step(s);
    expect(s.charges.guard).toBe(RC.guardStart + 1);
    for (let i = 0; i < ticksOf(s.params, RC.healSeconds * (RC.max + 2)); i++) step(s);
    expect(s.charges.guard).toBe(RC.max);
    expect(s.charges.heal).toBe(RC.max);
  });

  it('누르면 가진 칸 전부 = 체인 단계, 칸이 없으면 못 누른다', () => {
    const s = quiet();
    s.charges.guard = 2;
    expect(applyInput(s, { type: 'guard' })).toBe(true);
    expect(s.charges.guard).toBe(0);
    expect(s.guard.chain).toBe(2);
    expect(s.guard.ticks).toBe(ticksOf(s.params, CX.guardSecondsByChain[1]!));
    while (s.guard.ticks > 0) step(s);
    s.charges.guard = 0;
    expect(applyInput(s, { type: 'guard' })).toBe(false);
  });

  it('막기·공허 경직 중에는 블록을 쓸 수 없다. 막기 버튼은 공허 경직 중에도, 회복 버튼은 못 누른다', () => {
    const s = quiet();
    s.tray = [{ uid: 1, kind: 'skill', traitId: BASIC_SKILL_ID }];
    s.stunTicks = 10;
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(false);
    s.charges.heal = 1;
    expect(canUseRole(s, 'heal')).toBe(false);
    s.charges.guard = 1;
    expect(applyInput(s, { type: 'guard' })).toBe(true);
    s.stunTicks = 0;
    expect(halted(s)).toBe(true); // 막기 중
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(false);
    while (s.guard.ticks > 0) step(s);
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
  });

  it('폭주(noHealSpawn)면 회복 버튼 잠김', () => {
    const s = quiet();
    s.charges.heal = 3;
    s.params.noHealSpawn = true;
    expect(applyInput(s, { type: 'heal' })).toBe(false);
  });

  it('블록 출현표에 막기·회복이 없다', () => {
    const t = spawnTableOf(defaultCombatParams());
    expect(t.entries.some((e) => e.source?.role === 'guard' || e.source?.role === 'heal')).toBe(false);
  });

  it('입력 기록으로 다시 돌려도 같다 (버튼 입력 포함)', () => {
    const s = playCombatHuman(createCombat(7, { enemy: getEnemy('fire-heavy-seal') }));
    expect(s.inputs.some((x) => x.input.type === 'guard')).toBe(true);
    const r = replayCombat(7, { enemy: getEnemy('fire-heavy-seal') }, s.inputs);
    expect(r.status).toBe(s.status);
    expect(r.tick).toBe(s.tick);
  });
});
