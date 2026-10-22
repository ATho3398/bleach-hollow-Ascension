// 공격 연출(몸통박치기): 사건 → 강도 단계, 연출 큐, 계획 (GDD 17-4, R-4, C.35)
import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '../src/engine/combat';
import { AttackQueue, attackCueOf, chainTier, fxModeOf, fxRate, ghostOpacity, hitPlan, lungePlan, reachOf, tierRank, type AttackCue } from '../src/ui/attackFx';
import { ATTACK_FX, ATTACK_TIER_ORDER, FX_RATE_MAX, type AttackTier } from '../src/ui/attackFxConfig';
import hollow from '../src/data/factions/hollow.json';
import shinigami from '../src/data/factions/shinigami.json';

const block = (o: Partial<Extract<CombatEvent, { kind: 'block' }>> = {}): CombatEvent => ({
  kind: 'block', block: 'skill', traitId: 'x', family: null, element: null, matchup: 'neutral', role: 'attack', chain: 1, damage: 10, weak: false, heal: 0, guardSeconds: 0, bonus: null, ...o,
});

describe('사건 → 연출 단계', () => {
  it('기본 공격은 basic, 체인 단계는 chain1~3', () => {
    expect(attackCueOf({ kind: 'player-attack', damage: 5, matchup: 'neutral' }, 3)).toEqual({ side: 'player', tier: 'basic', guarded: false });
    expect(attackCueOf(block({ chain: 1 }), 3)?.tier).toBe('chain1');
    expect(attackCueOf(block({ chain: 2 }), 3)?.tier).toBe('chain2');
    expect(attackCueOf(block({ chain: 3 }), 3)?.tier).toBe('chain3');
    expect(chainTier(7, 3)).toBe('chain3');
  });
  it('약점·콤보·저장 필살기는 더 크게', () => {
    expect(attackCueOf(block({ chain: 3, matchup: 'strong' }), 3)?.tier).toBe('weak');
    expect(attackCueOf(block({ block: 'combo' }), 3)?.tier).toBe('special');
    expect(attackCueOf({ kind: 'stored-use', damage: 50, guardSeconds: 1, charges: 0 }, 3)?.tier).toBe('special');
  });
  it('피해 없는 블록(막기·회복)·공허·그 밖의 사건은 연출이 없다', () => {
    expect(attackCueOf(block({ role: 'guard', damage: 0 }), 3)).toBeNull();
    expect(attackCueOf(block({ block: 'void' }), 3)).toBeNull();
    expect(attackCueOf({ kind: 'player-attack', damage: 0, matchup: 'neutral' }, 3)).toBeNull();
    expect(attackCueOf({ kind: 'seal', seconds: 3 }, 3)).toBeNull();
    expect(attackCueOf({ kind: 'end', status: 'won' }, 3)).toBeNull();
  });
  it('적 공격: 기본 / 반격 / 강공격, 막았는지 전달', () => {
    expect(attackCueOf({ kind: 'enemy-attack', damage: 4, guarded: false, matchup: 'neutral' }, 3)).toEqual({ side: 'enemy', tier: 'basic', guarded: false });
    expect(attackCueOf({ kind: 'enemy-attack', damage: 0, guarded: true, matchup: 'neutral' }, 3)).toEqual({ side: 'enemy', tier: 'basic', guarded: true });
    expect(attackCueOf({ kind: 'enemy-attack', damage: 0, guarded: false, matchup: 'neutral' }, 3)).toBeNull();
    expect(attackCueOf({ kind: 'heavy-hit', damage: 30, guarded: false, reflected: 0, matchup: 'neutral' }, 3)?.tier).toBe('special');
    expect(attackCueOf({ kind: 'counter', damage: 3, guarded: true, matchup: 'neutral' }, 3)?.guarded).toBe(true);
  });
});

describe('강도 매핑', () => {
  const keys = ['backPx', 'lungeMs', 'scale', 'tiltDeg', 'ghosts', 'knockPx', 'hitMs', 'hitBright'] as const;
  it('단계가 오를수록 물러나는 거리·크기·잔상·피격 흔들림은 줄지 않고 커지며 돌진 시간은 짧아진다', () => {
    for (let i = 1; i < ATTACK_TIER_ORDER.length; i++) {
      const a = ATTACK_FX[ATTACK_TIER_ORDER[i - 1]!];
      const b = ATTACK_FX[ATTACK_TIER_ORDER[i]!];
      for (const k of keys) {
        if (k === 'lungeMs') expect(b[k]).toBeLessThan(a[k]);
        else expect(b[k], `${ATTACK_TIER_ORDER[i]} ${k}`).toBeGreaterThanOrEqual(a[k]);
      }
      expect(b.backPx).toBeGreaterThan(a.backPx);
      expect(b.knockPx).toBeGreaterThan(a.knockPx);
    }
  });
  it('잔상은 최대 2개, 기본 공격은 없음', () => {
    expect(ATTACK_FX.basic.ghosts).toBe(0);
    for (const t of ATTACK_TIER_ORDER) expect(ATTACK_FX[t].ghosts).toBeLessThanOrEqual(2);
    expect(ghostOpacity(0)).toBeGreaterThan(ghostOpacity(1));
    expect(ghostOpacity(9)).toBe(ghostOpacity(1));
  });
  it('순위: 기본 < 체인 < 약점 < 필살', () => {
    expect(tierRank('basic')).toBeLessThan(tierRank('chain1'));
    expect(tierRank('chain3')).toBeLessThan(tierRank('weak'));
    expect(tierRank('weak')).toBeLessThan(tierRank('special'));
  });
  it('배속 1~4 반영, 모션 줄이기·화면 흔들림 끔이면 번쩍임만', () => {
    expect(fxRate(0.2)).toBe(1);
    expect(fxRate(2)).toBe(2);
    expect(fxRate(99)).toBe(FX_RATE_MAX);
    expect(fxRate(NaN)).toBe(1);
    expect(fxModeOf(false, true)).toBe('full');
    expect(fxModeOf(true, true)).toBe('flash');
    expect(fxModeOf(false, false)).toBe('flash');
  });
});

describe('애니메이션 계획', () => {
  it('물러남 → 돌진(방향 쪽) → 복귀, 키프레임 순서가 맞다', () => {
    const plan = lungePlan(ATTACK_FX.chain2, 1, 60);
    const x = plan.keyframes.map((k) => /translateX\((-?[\d.]+)px/.exec(String(k.transform))![1]).map(Number);
    expect(x[0]).toBe(0);
    expect(x[1]).toBeLessThan(0); // 예비 동작: 뒤로
    expect(x[2]).toBe(60); // 부딪힘
    expect(x[x.length - 1]).toBe(0);
    const offsets = plan.keyframes.map((k) => k.offset!);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    expect(plan.hitAtMs).toBe(ATTACK_FX.chain2.backMs + ATTACK_FX.chain2.lungeMs);
    expect(plan.durationMs).toBeGreaterThan(plan.hitAtMs);
  });
  it('왼쪽 돌진(dir -1)은 반대 부호', () => {
    const plan = lungePlan(ATTACK_FX.basic, -1, 40);
    expect(String(plan.keyframes[2]!.transform)).toContain('translateX(-40.0px');
  });
  it('피격(hit 애니가 없을 때 기본, GDD 26-4c): 흰 실루엣 깜빡임 2번 + 뒤로 한 번 튕김, 튕김은 full 만, 막으면 약하게(깜빡임 1번)', () => {
    const full = hitPlan(ATTACK_FX.chain3, 1, 'full', false);
    const flash = hitPlan(ATTACK_FX.chain3, 1, 'flash', false);
    const guarded = hitPlan(ATTACK_FX.chain3, 1, 'full', true);
    const px = (p: ReturnType<typeof hitPlan>) => Number(/translateX\((-?[\d.]+)px/.exec(String(p.keyframes[1]!.transform))![1]);
    const whites = (p: ReturnType<typeof hitPlan>) => p.blink.filter((k) => String(k.filter).includes('invert(1)')).length;
    expect(px(full)).toBeGreaterThan(0);
    expect(px(flash)).toBe(0); // 모션 줄이기·흔들림 끔: 튕김 없이 깜빡임만
    expect(px(guarded)).toBeGreaterThan(0);
    expect(px(guarded)).toBeLessThan(px(full));
    expect(whites(full)).toBe(2);
    expect(whites(flash)).toBe(2);
    expect(whites(guarded)).toBe(1);
    expect(full.durationMs).toBeGreaterThanOrEqual(300); // 깜빡임 두 번이 보이는 최소 길이
    // 튕김 방향: 맞는 쪽 기준 뒤(dir 부호)
    expect(px(hitPlan(ATTACK_FX.basic, -1, 'full', false))).toBeLessThan(0);
  });
  it('돌진 거리는 간격에 비례하고 음수 간격은 0', () => {
    expect(reachOf(100)).toBeGreaterThan(0);
    expect(reachOf(100)).toBeLessThan(100);
    expect(reachOf(-5)).toBe(0);
  });
});

describe('연출 큐: 최대 1개 대기', () => {
  const cue = (tier: AttackTier): AttackCue => ({ side: 'player', tier, guarded: false });
  const make = () => {
    const started: AttackCue[] = [];
    const dones: (() => void)[] = [];
    const q = new AttackQueue((c, done) => {
      started.push(c);
      dones.push(done);
    });
    return { q, started, finish: () => dones.shift()!() };
  };
  it('비어 있으면 바로 재생', () => {
    const { q, started } = make();
    expect(q.push(cue('basic'))).toBe('started');
    expect(started).toHaveLength(1);
    expect(q.isRunning).toBe(true);
  });
  it('재생 중에 온 것은 1개만 대기, 끝나면 이어서 재생', () => {
    const { q, started, finish } = make();
    q.push(cue('basic'));
    expect(q.push(cue('chain1'))).toBe('queued');
    expect(q.push(cue('chain2'))).toBe('replaced');
    expect(started).toHaveLength(1);
    finish();
    expect(started.map((c) => c.tier)).toEqual(['basic', 'chain2']);
    finish();
    expect(q.isRunning).toBe(false);
    expect(q.pending).toBeNull();
  });
  it('대기 중인 것이 더 세면 약한 새 것은 버린다', () => {
    const { q, started, finish } = make();
    q.push(cue('basic'));
    q.push(cue('special'));
    expect(q.push(cue('basic'))).toBe('dropped');
    finish();
    expect(started.map((c) => c.tier)).toEqual(['basic', 'special']);
  });
  it('done 을 여러 번 불러도 한 번만 친다 / clear 는 대기를 비운다', () => {
    const { q, started } = make();
    let first: (() => void) | null = null;
    const q2 = new AttackQueue((c, done) => {
      started.push(c);
      first ??= done;
    });
    q2.push(cue('basic'));
    q2.push(cue('chain1'));
    first!();
    first!();
    expect(started).toHaveLength(2);
    q.push(cue('basic'));
    q.push(cue('chain1'));
    q.clear();
    expect(q.pending).toBeNull();
  });
});

describe('종족 설정', () => {
  it('SP 필살 블록 이름(포효·귀도)은 C.118 에 삭제 — 종족 설정에 없고, 저장 필살 이름은 단계 기술 이름과 겹치지 않는다', () => {
    expect('specialBlockName' in hollow).toBe(false);
    expect('specialBlockName' in shinigami).toBe(false);
    const names = hollow.families.flatMap((f) => f.tiers.map((t) => t.name));
    expect(names).not.toContain(hollow.storedSkillName);
  });
});
