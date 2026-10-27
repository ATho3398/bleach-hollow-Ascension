// 사람형 봇 (GDD 14-4, C.16): 반응 지연·막기 성공률·체인 정리 확률·방어 자세 인지. 같은 시드 = 같은 플레이.
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import { botInput, createCombat, elapsedSeconds, HUMAN_BOT_DEFAULTS, playCombatBot, playCombatHuman, replayCombat, type CombatParams, type CombatState } from '../src/engine/combat';

const build = (...ids: string[]) => {
  const b = newBuild();
  for (const id of ids) gainTrait(b, id);
  return buildCombatParams(b);
};
const heavy = getEnemy('fire-heavy-seal');
const stance = getEnemy('fire-stance');
const two = build('t-thunder-c', 't-fire-b'); // C.136: 속성 막기 특성 삭제(GDD 84장 7번) — 막기는 기본 막기 블록
const one = build('t-thunder-c');

describe('사람형 봇', () => {
  it('임시 설정값: 반응 0.5~1.2초, 막기 성공 100%(C.174, GDD 101장 추가 결정 3 — 옛 70%), 체인 정리 50%', () => {
    expect(HUMAN_BOT_DEFAULTS.reactionSeconds).toEqual([0.5, 1.2]);
    expect(HUMAN_BOT_DEFAULTS.guardSuccess).toBe(1);
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
    // C.118 로 전투가 절반이라 입력 수가 적다 — 입력 간격만 보는 시험이라 옛 길이(hpScale 1)로 돌린다
    const s = playCombatHuman(createCombat(5, { enemy: getEnemy('fire-sturdy'), params: { ...two, hpScale: 1 } }));
    const gaps = s.inputs.slice(1).map((x, i) => (x.tick - s.inputs[i]!.tick) / 10).filter((g) => g > 0);
    expect(gaps.length).toBeGreaterThan(6); // C.177: 회복 버튼이 없어져 입력이 조금 줄었다
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0.1 - 1e-9); // 같은 틱 안의 연속 입력은 없다
    expect(gaps.some((g) => g > 0.5)).toBe(true);
    const p = playCombatBot(createCombat(5, { enemy: getEnemy('fire-sturdy'), params: { ...two, hpScale: 1 } }));
    const pg = p.inputs.slice(1).map((x, i) => x.tick - p.inputs[i]!.tick);
    expect(pg.every((g) => g % 5 === 0)).toBe(true);
  });

  it('막기 칸이 있으면 강공격은 다 막는다(C.174, GDD 101장 추가 결정 3·105장): 맞은 강공격은 막기 칸이 없을 때뿐이고, guardSuccess 0.7 이면 확실히 덜 막는다', () => {
    /** 사람형 봇(guardSuccess 기본·0.7): 강공격 착탄 수·막은 비율·막기 칸이 있었는데 맞은 수 */
    const run = (kind: 'h' | 'h07') => {
      let hits = 0, guarded = 0, missedWithCharge = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const s = createCombat(seed, { enemy: { ...heavy, hpInAttacks: 80 }, params: two }); // C.118: 적 체력 배율 0.5 라 강공격 착탄 수(100 이상)를 유지하려고 40 → 80
        s.player.hp = s.player.maxHp = 1e9;
        let chargeAtCast = 0;
        const push = s.events.push.bind(s.events);
        s.events.push = (...e) => {
          for (const x of e) {
            // 예고 동안 쌓인 칸까지: 예고가 시작될 때 칸이 있었으면 착탄 전에 막을 수 있다
            if (x.kind === 'heavy-cast') chargeAtCast = s.guardGauge >= 1 ? 1 : 0;
            if (x.kind !== 'heavy-hit') continue;
            hits++;
            if (x.guarded) guarded++;
            else if (chargeAtCast > 0) missedWithCharge++;
          }
          return push(...e);
        };
        playCombatHuman(s, kind === 'h07' ? { guardSuccess: 0.7 } : {});
      }
      return { hits, rate: guarded / hits, missedWithCharge };
    };
    const h = run('h');
    const h07 = run('h07');
    expect(h.hits).toBeGreaterThan(100);
    expect(h.missedWithCharge).toBe(0);
    expect(h.rate).toBeGreaterThan(0.5);
    expect(h07.rate).toBeLessThan(h.rate - 0.1);
  });

  it('체인 정리 확률이 높을수록 같은 블록을 붙여 체인3이 더 자주 나온다 (순서를 바꾸지 않고 끼어 있는 블록을 먼저 쓴다)', () => {
    const chain3 = (joinChance: number) => {
      let n = 0;
      for (let seed = 1; seed <= 10; seed++) {
        // C.133 (GDD 80장 v5.166): 2칸(공격·막기) 몸은 기본 블록 몫이 25% 로 줄어 끼어 있는 블록이 드물어 차이가 표본 잡음(±1) 안이 됐다 → 끼어 있는 기본 블록이 많은 1칸 몸으로 본다
        const s = playCombatHuman(createCombat(seed, { enemy: getEnemy('fire-sturdy'), params: one }), { joinChance });
        n += s.chain3Count;
        expect(s.inputs.every((x) => ['use', 'liberate', 'guard', 'item', 'gear'].includes(x.input.type))).toBe(true);
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
        // C.118: 반격 피해로 먼저 쓰러지면 반격 수가 잘려 비교가 안 되므로(짧아진 전투·막기 블록 감소) 내 체력을 무한으로 두고 '쓴 블록만큼 반격을 받는다'만 본다
        s.player.hp = s.player.maxHp = 1e9;
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

  it('botInput: allowGuard=false 면 강공격 예고 중에도 막기 버튼을 누르지 않는다', () => {
    const s = createCombat(1, { enemy: heavy, params: two });
    s.tray = [];
    s.guardGauge = 1;
    s.enemy.cast = { ticks: 4, total: 20, hitsLeft: 0 }; // 착탄이 막기 지속(0.5초) 안
    expect(botInput(s)).toEqual({ type: 'guard' });
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
