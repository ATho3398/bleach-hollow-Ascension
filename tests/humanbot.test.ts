// 사람형 봇 (GDD 14-4, C.16): 반응 지연·막기 성공률·체인 정리 확률·방어 자세 인지. 같은 시드 = 같은 플레이.
import { describe, expect, it } from 'vitest';
import { getEnemy } from '../src/data/enemies';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import { botInput, createCombat, elapsedSeconds, HUMAN_BOT_DEFAULTS, playCombatBot, playCombatHuman, replayCombat, type CombatState } from '../src/engine/combat';

const build = (...ids: string[]) => {
  const b = newBuild();
  for (const id of ids) gainTrait(b, id);
  return buildCombatParams(b);
};
const heavy = getEnemy('fire-heavy-seal');
const stance = getEnemy('fire-stance');
const two = build('t-thunder-c', 't-fire-guard');

describe('사람형 봇', () => {
  it('임시 설정값: 반응 0.5~1.2초, 막기 성공 70%, 체인 정리 50%', () => {
    expect(HUMAN_BOT_DEFAULTS.reactionSeconds).toEqual([0.5, 1.2]);
    expect(HUMAN_BOT_DEFAULTS.guardSuccess).toBe(0.7);
    expect(HUMAN_BOT_DEFAULTS.joinChance).toBe(0.5);
  });

  it('결정적이다: 같은 시드 = 같은 결과, 입력 기록에서 다시 돌려도 같다, 시드가 다르면 다른 플레이', () => {
    const run = (seed: number) => playCombatHuman(createCombat(seed, { enemy: heavy, params: two }));
    const a = run(3);
    const b = run(3);
    expect(b.inputs).toEqual(a.inputs);
    expect(b.tick).toBe(a.tick);
    expect(b.status).toBe(a.status);
    expect(a.inputs.length).toBeGreaterThan(5);
    const again = replayCombat(3, { enemy: heavy, params: two }, a.inputs);
    expect(again.tick).toBe(a.tick);
    expect(again.player.hp).toBe(a.player.hp);
    expect(run(4).inputs).not.toEqual(a.inputs);
  });

  it('사람형 봇은 전투 rng 를 건드리지 않는다 (적 행동·블록 생성은 봇 종류와 무관한 같은 규칙)', () => {
    const s = playCombatHuman(createCombat(9, { enemy: getEnemy('fire-basic') }));
    expect(['won', 'lost']).toContain(s.status);
    expect(s.rng).toBeDefined();
  });

  it('입력 간격이 0.5~1.2초 사이에서 무작위다 (완벽형은 0.5초 고정)', () => {
    const s = playCombatHuman(createCombat(5, { enemy: getEnemy('fire-sturdy'), params: two }));
    const gaps = s.inputs.slice(1).map((x, i) => (x.tick - s.inputs[i]!.tick) / 10).filter((g) => g > 0);
    expect(gaps.length).toBeGreaterThan(10);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0.1 - 1e-9); // 같은 틱 안의 연속 입력은 없다
    expect(gaps.some((g) => g > 0.5)).toBe(true);
    const p = playCombatBot(createCombat(5, { enemy: getEnemy('fire-sturdy'), params: two }));
    const pg = p.inputs.slice(1).map((x, i) => x.tick - p.inputs[i]!.tick);
    expect(pg.every((g) => g % 5 === 0)).toBe(true);
  });

  it('막기 성공률은 약 70%다: 강공격 착탄 중 막은 비율이 완벽형(거의 100%)보다 확실히 낮다', () => {
    let hits = 0;
    let guarded = 0;
    let phits = 0;
    let pguarded = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const mkS = () => {
        const s = createCombat(seed, { enemy: { ...heavy, hpInAttacks: 40 }, params: two });
        s.player.hp = s.player.maxHp = 1e9;
        return s;
      };
      for (const [play, add] of [[playCombatHuman, 'h'], [playCombatBot, 'p']] as const) {
        const s = mkS();
        const push = s.events.push.bind(s.events);
        s.events.push = (...e) => {
          for (const x of e) if (x.kind === 'heavy-hit') (add === 'h' ? (hits++, x.guarded && guarded++) : (phits++, x.guarded && pguarded++));
          return push(...e);
        };
        play(s);
      }
    }
    expect(hits).toBeGreaterThan(100);
    const hr = guarded / hits;
    const pr = pguarded / phits;
    // C.97 (GDD 44장): 막기 블록이 풀에서 무작위로 나와 완벽형도 예고 때 막기 블록이 없을 수 있다 (옛 기준 0.9)
    expect(pr).toBeGreaterThan(0.75);
    expect(pr).toBeGreaterThan(hr);
    expect(hr).toBeGreaterThan(0.55);
    expect(hr).toBeLessThan(0.85);
  });

  it('체인 정리 확률이 높을수록 같은 블록을 붙여 체인3이 더 자주 나온다 (순서를 바꾸지 않고 끼어 있는 블록을 먼저 쓴다)', () => {
    const chain3 = (joinChance: number) => {
      let n = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const s = playCombatHuman(createCombat(seed, { enemy: getEnemy('fire-sturdy'), params: two }), { joinChance });
        n += s.chain3Count;
        expect(s.inputs.every((x) => x.input.type === 'use' || x.input.type === 'stored')).toBe(true);
      }
      return n;
    };
    expect(chain3(1)).toBeGreaterThan(chain3(0));
  });

  it('막기 성공 0이면 예고에 맞춘 막기가 크게 줄어든다 (바가 가득 차서 우연히 쓰는 막기만 남는다)', () => {
    const total = (guardSuccess: number) => {
      let n = 0;
      for (let seed = 1; seed <= 20; seed++) n += playCombatHuman(createCombat(seed, { enemy: { ...heavy, hpInAttacks: 40 }, params: two }), { guardSuccess }).guardSuccesses;
      return n;
    };
    expect(total(0)).toBeLessThan(total(1) * 0.5);
  });

  it('방어 자세를 알아채지 못하는 사람(stanceAware 0)은 자세 중에도 블록을 써서 반격을 더 받는다', () => {
    const counters = (stanceAware: number) => {
      let n = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const s = createCombat(seed, { enemy: stance, params: two });
        const push = s.events.push.bind(s.events);
        s.events.push = (...e) => {
          for (const x of e) if (x.kind === 'counter') n++;
          return push(...e);
        };
        playCombatHuman(s, { stanceAware });
      }
      return n;
    };
    expect(counters(0)).toBeGreaterThan(counters(1));
  });

  it('botInput: allowGuard=false 면 강공격 예고 중에도 막기 블록을 쓰지 않는다', () => {
    const s = createCombat(1, { enemy: heavy, params: two });
    s.tray = [{ uid: 1, kind: 'skill', traitId: 't-fire-guard' }];
    s.enemy.cast = { ticks: 10, total: 20, hitsLeft: 0 };
    expect(botInput(s)).toEqual({ type: 'use', cell: 0 });
    expect(botInput(s, { allowGuard: false })).toBeNull();
  });
});

describe('사람형 봇 목표 곡선(작은 표본): 일반 적은 이기고 흡수 특성을 장착하면 더 빨리 처치한다', () => {
  it('일반 적은 90% 이상, 공격 특성 1개 빌드가 빈 슬롯보다 일반 적을 빨리 처치한다', () => {
    const rate = (params: ReturnType<typeof build> | undefined, enemyId: string) => {
      let w = 0;
      for (let seed = 1; seed <= 40; seed++) if ((playCombatHuman(createCombat(seed, { enemy: getEnemy(enemyId), params })) as CombatState).status === 'won') w++;
      return w / 40;
    };
    expect(rate(undefined, 'fire-basic')).toBeGreaterThanOrEqual(0.9);
    expect(rate(two, 'fire-sturdy')).toBeGreaterThanOrEqual(0.9);
    // C.97 (GDD 44장): 빈 슬롯도 기본 막기·회복 블록이 나와 강공격형 강적 승률은 빌드와 상관없이 높다 → 흡수 공격 특성의 몫은 처치 시간으로 본다
    const secs = (params: ReturnType<typeof build> | undefined, enemyId: string) => {
      let t = 0;
      for (let seed = 1; seed <= 40; seed++) t += elapsedSeconds(playCombatHuman(createCombat(seed, { enemy: getEnemy(enemyId), params })));
      return t / 40;
    };
    expect(secs(build('t-thunder-c'), 'fire-sturdy')).toBeLessThan(secs(undefined, 'fire-sturdy'));
  });
});
