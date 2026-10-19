// 저장형 필살기 (GDD 14-6, C.17): 게이지 적립·충전 상한·시작 게이지·사용 피해/막기·낭비 기록·봇·결정성·종족 설정 이름
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { FACTIONS, getFaction } from '../src/data/factions';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import {
  applyInput, botInput, buildBattleRecord, createCombat, playCombatBot, playCombatHuman, replayCombat, step, storedDamage,
  storedStartGaugeOf, ticksOf, type Block, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { advance, createExpedition, startBattle } from '../src/engine/expedition';
import { parseFactionConfig } from '../src/engine/faction';
import { migrateSave, newSaveData, SAVE_FORMAT_VERSION } from '../src/game';
import { battleLabels } from '../src/ui/labels';

const CX = BALANCE.provisional.combat;
const normal = getEnemy('test-a');
const heavy = getEnemy('fire-heavy-seal');
const mk = (opt: { seed?: number; enemy?: Parameters<typeof createCombat>[1]['enemy']; params?: Partial<CombatParams> } = {}) =>
  createCombat(opt.seed ?? 1, { enemy: opt.enemy ?? normal, params: opt.params });
let uid = 5000;
const blk = (traitId: string | null, kind: Block['kind'] = 'skill'): Block => ({ uid: uid++, kind, traitId });
const quiet = (s: CombatState) => {
  s.spawnTimers = s.spawnTimers.map(() => 1e9);
  s.voidTimer = 1e9;
  s.enemy.attackTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  return s;
};
const build = (...ids: string[]) => {
  const b = newBuild();
  for (const id of ids) gainTrait(b, id);
  return buildCombatParams(b);
};
const basic = 'basic-skill';
const useAt = (s: CombatState, cell: number) => applyInput(s, { type: 'use', cell });
const stored = (s: CombatState) => applyInput(s, { type: 'stored' });

describe('저장 게이지 적립', () => {
  it('임시값: 블록당 +12, 체인 보너스 +4/+10, 100 = 충전 1개, 최대 3개, 피해 25회분, 막기 2초', () => {
    expect(CX.storedGaugePerBlock).toBe(12);
    expect(CX.storedGaugeMax).toBe(100);
    expect(CX.storedChargesMax).toBe(3);
    expect(CX.storedPowerInAttacks).toBe(25);
    expect(CX.storedGuardSeconds).toBe(2);
    expect(CX.storedStartGaugeMax).toBe(50);
  });

  it('블록 1개 사용 = +12, 체인이 높을수록 사용 한 번에 보너스가 붙는다', () => {
    const one = quiet(mk());
    one.tray = [blk(basic)];
    useAt(one, 0);
    expect(one.storedGauge).toBe(12);
    const two = quiet(mk());
    two.tray = [blk(basic), blk(basic)];
    useAt(two, 0);
    expect(two.storedGauge).toBe(24 + CX.storedChainBonus[1]!);
    const three = quiet(mk());
    three.tray = [blk(basic), blk(basic), blk(basic)];
    useAt(three, 1);
    expect(three.storedGauge).toBe(36 + CX.storedChainBonus[2]!);
    expect(three.storedGauge).toBeGreaterThan(one.storedGauge * 3);
  });

  it('필살 블록·공허 블록을 써도 쌓이고, 잘못된 입력은 쌓이지 않는다', () => {
    const s = quiet(mk());
    s.tray = [blk(null, 'void'), blk(null, 'special')];
    useAt(s, 0);
    useAt(s, 0);
    expect(s.storedGauge).toBe(24);
    expect(useAt(s, 5)).toBe(false);
    expect(s.storedGauge).toBe(24);
  });

  it('100 이 차면 충전 1개, 넘친 양은 남는다', () => {
    const s = quiet(mk());
    s.storedGauge = 95;
    s.tray = [blk(basic)];
    useAt(s, 0);
    expect(s.storedCharges).toBe(1);
    expect(s.storedGauge).toBeCloseTo(7);
    expect(drainEvents(s)).toContain('stored-ready');
  });

  it('충전은 최대 3개이고, 상한에서 버려진 게이지를 기록한다', () => {
    const s = quiet(mk());
    s.storedCharges = 3;
    s.storedGauge = 0;
    s.tray = [blk(basic)];
    useAt(s, 0);
    expect(s.storedCharges).toBe(3);
    expect(s.storedGauge).toBe(0);
    expect(s.storedWasted).toBe(12);
    s.tray = [blk(basic)];
    useAt(s, 0);
    expect(s.storedWasted).toBe(24);
  });

  it('충전이 2개에서 100 을 넘기면 3개까지만 차고 나머지는 낭비', () => {
    const s = quiet(mk());
    s.storedCharges = 2;
    s.storedGauge = 95;
    s.tray = [blk(basic), blk(basic), blk(basic)];
    useAt(s, 0); // 체인3: +36+10
    expect(s.storedCharges).toBe(3);
    expect(s.storedGauge).toBe(0);
    expect(s.storedWasted).toBeCloseTo(95 + 46 - 100);
  });
});

function drainEvents(s: CombatState): string[] {
  return s.events.map((e) => e.kind);
}

describe('시작 게이지 (둥지 애착 = 안정 수치 비례)', () => {
  it('안정 수치 0 → 0, 100 → 50, 중간은 비례, 범위 밖은 자른다', () => {
    expect(storedStartGaugeOf(0)).toBe(0);
    expect(storedStartGaugeOf(100)).toBe(50);
    expect(storedStartGaugeOf(50)).toBe(25);
    expect(storedStartGaugeOf(-5)).toBe(0);
    expect(storedStartGaugeOf(250)).toBe(50);
  });

  it('전투 시작 게이지로 들어간다 (충전은 0개, 전투 간 이월 없음)', () => {
    const s = mk({ params: { storedStartGauge: 37 } });
    expect(s.storedGauge).toBe(37);
    expect(s.storedCharges).toBe(0);
    expect(mk().storedGauge).toBe(0);
  });

  it('원정 전투는 둥지 안정 수치에 비례한 시작 게이지를 받는다', () => {
    const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
    const startGauge = (stability: number) => {
      const exp = createExpedition({ factionId: 'hollow', seed: 1, hunger: 10, condition: 100, deck: DECK, stability });
      for (let i = 0; i < 200 && exp.phase === 'moving'; i++) advance(exp);
      expect(exp.phase).toBe('battle');
      return startBattle(exp).storedGauge;
    };
    expect(startGauge(0)).toBe(0);
    expect(startGauge(100)).toBe(50);
    expect(startGauge(40)).toBeCloseTo(20);
  });
});

describe('저장 필살기 사용', () => {
  it('충전이 없으면 사용할 수 없다 (상태 그대로, 입력 기록도 없음)', () => {
    const s = quiet(mk());
    expect(stored(s)).toBe(false);
    expect(s.inputs.length).toBe(0);
    expect(s.storedUsed).toBe(0);
  });

  it('충전 1개 소모, 기본 공격 25회분 피해 (약점·체인·방어 자세 무시)', () => {
    const s = quiet(mk({ enemy: { ...normal, hpInAttacks: 400 }, params: build('t-thunder-c') }));
    s.storedCharges = 2;
    const hp = s.enemy.hp;
    expect(stored(s)).toBe(true);
    expect(s.storedCharges).toBe(1);
    expect(s.storedUsed).toBe(1);
    expect(hp - s.enemy.hp).toBeCloseTo(CX.storedPowerInAttacks * CX.playerAttackDamage);
    expect(storedDamage(s)).toBeCloseTo(CX.storedPowerInAttacks * CX.playerAttackDamage);
  });

  it('방어 자세 중에도 피해가 줄지 않고 반격도 받지 않는다', () => {
    const s = quiet(mk({ enemy: getEnemy('fire-stance') }));
    s.enemy.stance = { ticks: 50 };
    s.storedCharges = 1;
    const hp = s.enemy.hp;
    const mine = s.player.hp;
    stored(s);
    expect(hp - s.enemy.hp).toBeCloseTo(CX.storedPowerInAttacks * CX.playerAttackDamage);
    expect(s.player.hp).toBe(mine);
  });

  it('사용 직후 2초간 막기 상태이고, 기본 공격 피해가 줄어든다', () => {
    const s = quiet(mk({ enemy: { ...normal, hpInAttacks: 400 } }));
    s.storedCharges = 1;
    stored(s);
    expect(s.guard.ticks).toBe(ticksOf(s.params, CX.storedGuardSeconds));
    s.enemy.attackTimer = 1;
    s.player.hp = s.player.maxHp;
    step(s);
    const hit = s.player.maxHp - s.player.hp;
    expect(hit).toBeGreaterThan(0);
    expect(hit).toBeLessThan(normal.attackInAttacks * CX.playerAttackDamage * 0.8);
    // 2초가 지나면 막기가 풀린다
    for (let i = 0; i < 25; i++) step(s);
    expect(s.guard.ticks).toBe(0);
  });

  it('강공격 예고 중에 쓰면 막기 대안이 된다 (막기 성공으로 기록)', () => {
    const run = (useIt: boolean) => {
      const s = mk({ enemy: heavy });
      s.spawnTimers = s.spawnTimers.map(() => 1e9);
      s.voidTimer = 1e9;
      s.enemy.attackTimer = 1e9;
      s.player.attackTimer = 1e9;
      s.storedCharges = 1;
      s.enemy.actionTimer = 1;
      step(s);
      expect(s.enemy.cast).not.toBeNull();
      step(s); // 예고가 뜬 다음 틱부터 사용 (사람 반응 시간은 더 길다)
      if (useIt) expect(stored(s)).toBe(true);
      const before = s.player.hp;
      for (let i = 0; i < 40 && s.status === 'playing'; i++) step(s);
      return { taken: before - s.player.hp, s };
    };
    const guarded = run(true);
    const open = run(false);
    expect(guarded.s.guardSuccesses).toBe(1);
    expect(open.s.guardSuccesses).toBe(0);
    expect(guarded.taken).toBeLessThan(open.taken * 0.5);
  });

  it('마지막 일격으로 쓰러뜨리면 마무리 일격 종류가 stored 이고 흡수 조건은 채우지 않는다', () => {
    const s = quiet(mk({ enemy: { ...normal, hpInAttacks: 5 } }));
    s.storedCharges = 1;
    stored(s);
    expect(s.status).toBe('won');
    expect(s.finisher?.kind).toBe('stored');
    expect(buildBattleRecord(s, { factionId: 'hollow' }).finisherKind).toBe('stored');
  });
});

describe('런 로그와 세이브', () => {
  it('BattleRecord 에 저장 필살 사용 횟수·충전 낭비가 들어가고 기존 필드는 그대로다', () => {
    const s = quiet(mk({ enemy: { ...normal, hpInAttacks: 200 } }));
    s.storedCharges = 3;
    s.tray = [blk(basic)];
    useAt(s, 0); // 낭비 12
    stored(s);
    const rec = buildBattleRecord(s, { factionId: 'hollow' });
    expect(rec.storedUsed).toBe(1);
    expect(rec.storedWasted).toBe(12);
    expect(rec).toHaveProperty('blocksByChain');
    expect(rec).toHaveProperty('guardSuccesses');
    expect(rec).toHaveProperty('specialUsed');
  });

  it('형식 9 세이브는 10 으로 올라가며 옛 전투 기록의 새 필드는 0', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(10);
    const old = newSaveData('hollow', 0) as unknown as Record<string, any>;
    old.meta.format = 9;
    old.runLog.battles = [{
      runId: 1, lap: 1, turns: 0, matchesByRole: { damage: 0, spirit: 0, shield: 0, absorb: 0, risk: 0 }, won: true, skillsUsed: [],
      enemyClass: 'normal', tierIndex: 0, enemyId: 'test-a', factionId: 'hollow', seed: 5, riskGained: 0, absorbGained: 0, lossReason: null,
      durationSeconds: 30, blocksByTrait: {}, blocksByChain: [0, 0, 0], chain3Count: 0, guardSuccesses: 0, voidUsed: 0, specialUsed: false,
      finisherKind: null, finisherTraitId: null, finisherLineageId: null, absorbable: false,
    }];
    const m = migrateSave(JSON.parse(JSON.stringify(old)))!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.runLog.battles[0]).toMatchObject({ storedUsed: 0, storedWasted: 0, seed: 5, durationSeconds: 30 });
  });
});

describe('결정성', () => {
  it('저장 필살 입력이 기록되고 같은 시드 + 기록으로 다시 돌리면 같은 결과', () => {
    const params = { ...build('t-thunder-c'), storedStartGauge: 50 };
    const s = playCombatBot(createCombat(7, { enemy: heavy, params }));
    expect(s.inputs.some((x) => x.input.type === 'stored')).toBe(true);
    const again = replayCombat(7, { enemy: heavy, params }, s.inputs);
    expect(again.tick).toBe(s.tick);
    expect(again.status).toBe(s.status);
    expect(again.player.hp).toBe(s.player.hp);
    expect(again.storedUsed).toBe(s.storedUsed);
    expect(again.storedWasted).toBe(s.storedWasted);
  });

  it('structuredClone 으로 복제한 상태도 같은 결과', () => {
    const s = quiet(mk());
    s.storedCharges = 1;
    const c = structuredClone(s);
    stored(s);
    stored(c);
    expect(c.enemy.hp).toBe(s.enemy.hp);
    expect(c.storedCharges).toBe(0);
  });
});

describe('종족 설정', () => {
  it('저장 필살기 이름이 종족 설정에 있고 라벨로 나온다 (필수 필드)', () => {
    for (const f of FACTIONS) {
      expect(f.storedSkillName.length).toBeGreaterThan(0);
      expect(battleLabels(f).storedSkill).toBe(f.storedSkillName);
    }
    expect(getFaction('hollow').storedSkillName).not.toBe(getFaction('shinigami').storedSkillName);
    const { storedSkillName: _drop, ...none } = getFaction('hollow');
    expect(() => parseFactionConfig(none)).toThrow(/storedSkillName/);
  });

  it('3번째 종족도 이름 하나로 라벨이 나온다', () => {
    const q = parseFactionConfig({ ...getFaction('hollow'), id: 'quincy', storedSkillName: '성은' });
    expect(battleLabels(q).storedSkill).toBe('성은');
  });
});

describe('봇', () => {
  it('완벽형: 막기 블록이 없을 때 강공격 예고 중 저장 필살기를 쓴다 / 충전이 없으면 안 쓴다', () => {
    const s = quiet(mk({ enemy: heavy }));
    s.enemy.cast = { ticks: 20, total: 20, hitsLeft: 0 };
    s.storedCharges = 1;
    expect(botInput(s)).toEqual({ type: 'stored' });
    s.storedCharges = 0;
    expect(botInput(s)).not.toEqual({ type: 'stored' });
  });

  it('완벽형: 막기 블록이 있으면 그것을 먼저 쓴다', () => {
    const s = quiet(mk({ enemy: heavy, params: build('t-earth-guard') }));
    s.enemy.cast = { ticks: 20, total: 20, hitsLeft: 0 };
    s.storedCharges = 1;
    s.tray = [blk('t-earth-guard')];
    expect(botInput(s)).toEqual({ type: 'use', cell: 0 });
  });

  it('allowStored=false 면 쓰지 않고, 충전 상한이면 낭비를 막으려고 쓴다', () => {
    const s = quiet(mk({ enemy: heavy }));
    s.enemy.cast = { ticks: 20, total: 20, hitsLeft: 0 };
    s.storedCharges = 1;
    expect(botInput(s, { allowStored: false })).not.toEqual({ type: 'stored' });
    const full = quiet(mk());
    full.storedCharges = 3;
    expect(botInput(full)).toEqual({ type: 'stored' });
    expect(botInput(full, { storedWhenFull: false })).not.toEqual({ type: 'stored' });
  });

  it('사람형: storedUse 확률대로 막기 실패 시 쓴다 (0 이면 절대, 1 이면 항상)', () => {
    const params = { ...build('t-thunder-c'), storedStartGauge: 50 };
    const used = (storedUse: number, guardSuccess: number) => {
      let n = 0;
      for (let seed = 1; seed <= 15; seed++) n += playCombatHuman(createCombat(seed, { enemy: heavy, params }), { storedUse, guardSuccess }).storedUsed;
      return n;
    };
    expect(used(0, 0)).toBe(0);
    expect(used(1, 0)).toBeGreaterThan(0);
    expect(used(1, 0)).toBeGreaterThan(used(0.4, 0));
    expect(used(0.4, 0)).toBeGreaterThan(0);
  });
});

describe('종족 분기 없음', () => {
  it('저장 필살기 코드에 종족 id 분기가 없다', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['src/engine/combat/combat.ts', 'src/engine/combat/bot.ts']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/faction(Id)?\s*===|'hollow'|'shinigami'/);
    }
  });
});
