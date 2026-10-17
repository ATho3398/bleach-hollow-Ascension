import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENEMIES, getEnemy } from '../src/data/enemies';
import { FACTIONS, getFaction } from '../src/data/factions';
import { pickFaction } from '../src/data/schema';
import {
  buildBattleRecord, createBattle, createBoard, createRng, findMoves, findRuns, playGreedy, playerSwap,
  resolveBoard, useSkill, type Board,
} from '../src/engine/battle';
import { parseFactionConfig, TILE_ROLES, type TileRole } from '../src/engine/faction';
import { emptyRunLog } from '../src/engine/runLog';
import { loadSave, migrateSave, newSaveData, recordBattle, SAVE_FORMAT_VERSION, writeSave } from '../src/game';
import { battleLabels } from '../src/ui/labels';

// d=데미지 s=영력 h=실드 a=흡수 r=공허
const CH: Record<string, TileRole> = { d: 'damage', s: 'spirit', h: 'shield', a: 'absorb', r: 'risk' };
const board = (rows: string[]): Board => rows.map((row) => [...row].map((ch) => CH[ch]!));
/** 매치도 이동 수단도 거의 없는 바탕 (대각 패턴) */
const BASE = ['dsdsds', 'sdsdsd', 'dsdsds', 'sdsdsd', 'dsdsds', 'sdsdsd'];

describe('매치 판정', () => {
  it('가로·세로 3매치를 찾는다', () => {
    const b = board(BASE);
    b[0]![0] = b[0]![1] = b[0]![2] = 'shield';
    b[2]![5] = b[3]![5] = b[4]![5] = 'absorb';
    const runs = findRuns(b);
    expect(runs.map((r) => [r.role, r.dir, r.cells.length]).sort()).toEqual([
      ['absorb', 'v', 3],
      ['shield', 'h', 3],
    ]);
  });

  it('2개만 이어진 줄은 매치가 아니다', () => {
    const b = board(BASE);
    b[0]![0] = b[0]![1] = 'shield';
    expect(findRuns(b)).toEqual([]);
  });

  it('새 보드는 처음부터 매치가 없고 움직일 수 있다', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const b = createBoard(createRng(seed), 0.1);
      expect(b).toHaveLength(6);
      expect(b.every((row) => row.length === 6)).toBe(true);
      expect(findRuns(b)).toEqual([]);
      expect(findMoves(b).length).toBeGreaterThan(0);
    }
  });

  it('공허 타일이 자연 생성된다', () => {
    const b = createBoard(createRng(7), 0.5);
    expect(b.flat()).toContain('risk');
  });
});

describe('특수 매치와 연쇄', () => {
  it('4매치는 그 줄 전체를 폭발시킨다', () => {
    const b = board(BASE);
    for (let c = 0; c < 4; c++) b[2]![c] = 'shield';
    const [step] = resolveBoard(b, createRng(1), 0);
    expect(step!.specials).toEqual([{ kind: 'lineBlast', role: 'shield' }]);
    expect(step!.cleared.filter((p) => p.r === 2)).toHaveLength(6);
    expect(step!.matchesByRole.shield).toBe(1);
    expect(step!.clearedByRole.shield).toBe(4);
  });

  it('세로 4매치는 세로 줄 전체를 폭발시킨다', () => {
    const b = board(BASE);
    for (let r = 0; r < 4; r++) b[r]![3] = 'absorb';
    const [step] = resolveBoard(b, createRng(1), 0);
    expect(step!.cleared.filter((p) => p.c === 3)).toHaveLength(6);
  });

  it('5매치는 그 색 전체를 지운다', () => {
    const b = board(BASE);
    for (let c = 0; c < 5; c++) b[1]![c] = 'absorb';
    b[5]![5] = 'absorb';
    const [step] = resolveBoard(b, createRng(1), 0);
    expect(step!.specials).toEqual([{ kind: 'colorClear', role: 'absorb' }]);
    expect(step!.clearedByRole.absorb).toBe(6);
  });

  it('플레이를 이어 가면 연쇄(chain ≥ 2)가 실제로 나온다', () => {
    let maxChain = 0;
    for (let seed = 1; seed <= 20 && maxChain < 2; seed++) {
      const s = createBattle({ seed, enemy: getEnemy('test-elite') });
      for (let i = 0; i < 10 && s.status === 'playing'; i++) {
        const [a, b] = findMoves(s.board)[0]!;
        for (const ph of playerSwap(s, a, b).phases) for (const st of ph.steps) maxChain = Math.max(maxChain, st.chain);
      }
    }
    expect(maxChain).toBeGreaterThanOrEqual(2);
  });

  it('낙하·리필 뒤 매치가 남지 않는다', () => {
    // 가운데 열 한 칸이 빠지면 위의 흡수 타일이 내려와 다시 가로 3매치가 된다
    const b = board(['dsdsds', 'sdsdsd', 'dsdsds', 'aadsds', 'sdhsds', 'dshhhd']);
    b[2]![2] = 'absorb';
    b[4]![2] = 'absorb';
    b[3]![0] = 'absorb';
    b[3]![1] = 'absorb';
    // 3행: a a [a가 될 칸] — 아래 3매치(h h h)가 사라지면 위 열이 내려온다
    const steps = resolveBoard(b, createRng(3), 0);
    expect(steps.length).toBeGreaterThanOrEqual(1);
    expect(findRuns(b)).toEqual([]);
  });

  it('연쇄가 끝나면 보드에 매치가 남지 않는다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed);
      const b = createBoard(rng, 0.1);
      const m = findMoves(b)[0]!;
      const t = b[m[0].r]![m[0].c]!;
      b[m[0].r]![m[0].c] = b[m[1].r]![m[1].c]!;
      b[m[1].r]![m[1].c] = t;
      resolveBoard(b, rng, 0.1);
      expect(findRuns(b)).toEqual([]);
    }
  });
});

describe('교환', () => {
  it('매치가 없는 교환은 되돌리고 턴을 쓰지 않는다', () => {
    const s = createBattle({ seed: 5, enemy: getEnemy('test-a') });
    const bad = findNonMove(s.board);
    const before = structuredClone(s.board);
    const res = playerSwap(s, bad[0], bad[1]);
    expect(res.accepted).toBe(false);
    expect(s.board).toEqual(before);
    expect(s.turns).toBe(0);
    expect(s.player.hp).toBe(s.player.maxHp);
  });

  it('인접하지 않은 칸은 교환할 수 없다', () => {
    const s = createBattle({ seed: 5, enemy: getEnemy('test-a') });
    expect(playerSwap(s, { r: 0, c: 0 }, { r: 2, c: 2 }).accepted).toBe(false);
    expect(playerSwap(s, { r: 0, c: 0 }, { r: 0, c: 9 }).accepted).toBe(false);
  });

  it('유효한 교환은 턴을 쓰고 적 턴이 이어진다', () => {
    const s = createBattle({ seed: 5, enemy: getEnemy('test-a') });
    const [a, b] = findMoves(s.board)[0]!;
    const res = playerSwap(s, a, b);
    expect(res.accepted).toBe(true);
    expect(s.turns).toBe(1);
    expect(res.phases.map((p) => p.kind)).toEqual(s.status === 'playing' ? ['player', 'enemy'] : ['player']);
  });
});

function findNonMove(b: Board): [{ r: number; c: number }, { r: number; c: number }] {
  const moves = new Set(findMoves(b).map(([p, q]) => `${p.r},${p.c}-${q.r},${q.c}`));
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 5; c++) {
      if (!moves.has(`${r},${c}-${r},${c + 1}`)) return [{ r, c }, { r, c: c + 1 }];
    }
  }
  throw new Error('모든 교환이 매치다');
}

describe('효과와 약점', () => {
  it('적 체력은 매칭 N회 분량으로 환산된다 (절대값 아님)', () => {
    const base = createBattle({ seed: 1, enemy: getEnemy('test-a') });
    const strong = createBattle({ seed: 1, enemy: getEnemy('test-a'), params: { playerDamageMultiplier: 2 } });
    expect(base.enemy.maxHp).toBe(6 * base.params.hpMatchScale * base.params.playerMatchDamage);
    expect(strong.enemy.maxHp).toBe(base.enemy.maxHp * 2);
    expect(getEnemy('test-elite').hpInMatches).toBeGreaterThanOrEqual(10);
    expect(getEnemy('test-elite').hpInMatches).toBeLessThanOrEqual(12);
  });

  /** h/a 체크무늬 바탕에 role 로 가로 3매치가 되는 교환 하나만 있는 보드 */
  const oneMatch = (role: string): Board => board(['hahaha', 'ah' + role + 'hah', `${role}${role}ahah`, 'ahahah', 'hahaha', 'ahahah']);
  const mv = [{ r: 1, c: 2 }, { r: 2, c: 2 }] as const;

  it('약점 색 매칭은 1.5배', () => {
    const weak = createBattle({ seed: 1, enemy: getEnemy('test-a'), params: { riskSpawnRate: 0 } }); // 약점 damage
    const normal = createBattle({ seed: 1, enemy: { ...getEnemy('test-a'), weakness: 'risk' }, params: { riskSpawnRate: 0 } });
    weak.board = oneMatch('d');
    normal.board = oneMatch('d');
    const rw = playerSwap(weak, mv[0], mv[1]);
    const rn = playerSwap(normal, mv[0], mv[1]);
    expect(rw.accepted && rn.accepted).toBe(true);
    expect(rw.phases[0]!.weakHit).toBe(true);
    expect(rn.phases[0]!.weakHit).toBe(false);
    expect(rn.phases[0]!.damageDealt).toBeGreaterThan(0);
    expect(rw.phases[0]!.damageDealt).toBeCloseTo(rn.phases[0]!.damageDealt * 1.5);
  });

  it('영력 3회 매칭이면 기술을 쓸 수 있고, 쓰면 적 체력이 줄고 기록된다', () => {
    const s = createBattle({ seed: 1, enemy: getEnemy('test-b') });
    expect(useSkill(s).accepted).toBe(false);
    s.spiritMatches = 3;
    const res = useSkill(s);
    expect(res.accepted).toBe(true);
    expect(s.spiritMatches).toBe(0);
    expect(s.enemy.hp).toBeLessThan(s.enemy.maxHp);
    expect(s.skillsUsed).toHaveLength(1);
  });

  it('공허 매칭은 데미지 大 + 리스크 값 상승(기록)', () => {
    const s = createBattle({ seed: 1, enemy: getEnemy('test-a'), params: { riskSpawnRate: 0 } });
    s.board = oneMatch('r');
    const res = playerSwap(s, mv[0], mv[1]);
    expect(res.accepted).toBe(true);
    expect(s.riskGained).toBeGreaterThanOrEqual(s.params.riskPerMatch);
    expect(res.phases[0]!.damageDealt).toBeGreaterThanOrEqual(s.params.riskDamageMultiplier * s.params.playerMatchDamage);
    expect(s.matchesByRole.risk).toBeGreaterThanOrEqual(1);
  });
});

describe('시드 결정성', () => {
  it('같은 시드 = 같은 전투', () => {
    const a = playGreedy(createBattle({ seed: 42, enemy: getEnemy('test-elite') }));
    const b = playGreedy(createBattle({ seed: 42, enemy: getEnemy('test-elite') }));
    expect(b).toEqual(a);
    expect(a.status).not.toBe('playing');
  });

  it('시드가 다르면 보드가 다르다', () => {
    const a = createBattle({ seed: 1, enemy: getEnemy('test-a') });
    const b = createBattle({ seed: 2, enemy: getEnemy('test-a') });
    expect(a.board).not.toEqual(b.board);
  });

  it('전투는 반드시 끝난다 (승 또는 패)', () => {
    for (const e of ENEMIES) {
      for (let seed = 1; seed <= 5; seed++) {
        const s = playGreedy(createBattle({ seed, enemy: e }));
        expect(['won', 'lost']).toContain(s.status);
      }
    }
  });
});

describe('런 로그 연결', () => {
  it('전투 결과가 BattleRecord 로 세이브에 쌓인다', () => {
    const s = playGreedy(createBattle({ seed: 9, enemy: getEnemy('test-a') }));
    const save = newSaveData('hollow');
    recordBattle(save, buildBattleRecord(s, { factionId: save.factionId }));
    const rec = save.runLog.battles[0]!;
    expect(rec.turns).toBe(s.turns);
    expect(rec.won).toBe(s.status === 'won');
    expect(rec.enemyClass).toBe('normal');
    expect(rec.enemyId).toBe('test-a');
    expect(rec.seed).toBe(9);
    expect(Object.keys(rec.matchesByRole).sort()).toEqual([...TILE_ROLES].sort());
  });

  it('저장하고 다시 불러온다', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(loadSave(storage)).toBeNull();
    const save = newSaveData('shinigami');
    writeSave(storage, save);
    expect(loadSave(storage)).toEqual(save);
  });

  it('형식 1 세이브가 열린다 (마이그레이션)', () => {
    const old = {
      meta: { format: 1, balanceVersion: 2, startPatch: 'C.1' },
      factionId: 'hollow',
      runLog: {
        ...emptyRunLog(),
        battles: [{ runId: 0, lap: 0, turns: 5, matchesByRole: {}, won: true, skillsUsed: [], enemyClass: 'normal', tierIndex: 0 }],
      },
    };
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.runLog.battles[0]).toMatchObject({ turns: 5, enemyId: 'unknown', factionId: 'hollow', seed: 0, lossReason: null });
    expect(migrateSave({ nope: 1 })).toBeNull();
  });
});

describe('종족 설정만 바꿔도 이름이 바뀐다 (코드 분기 없음)', () => {
  it('두 종족의 화면 텍스트가 설정에서 나온다', () => {
    const h = battleLabels(getFaction('hollow'));
    const sh = battleLabels(getFaction('shinigami'));
    expect(h.tile.damage).toBe('파괴');
    expect(sh.tile.damage).toBe('참격');
    expect(h.riskGauge).toBe('광기');
    expect(sh.riskGauge).toBe('호로화');
    expect(h.defeatState).toBe('가면이 깨져 쇠약');
    expect(sh.defeatState).toBe('영력 고갈');
    expect(h.skillButton).toBe('본체 능력');
    expect(sh.skillButton).toBe('시해');
  });

  it('3번째 종족은 설정 객체 하나만으로 화면 텍스트가 나온다', () => {
    const quincy = parseFactionConfig({
      ...getFaction('hollow'),
      id: 'quincy',
      name: '퀸시',
      tileNames: { damage: '광시', spirit: '영자', shield: '블루트', absorb: '흡수', risk: '공허' },
      riskGaugeName: '균열',
      defeatStateName: '영자 고갈',
      basicSkillName: '성문',
    });
    const l = battleLabels(quincy);
    expect(l.tile.damage).toBe('광시');
    expect(l.tileShort.shield).toBe('블');
    expect(l.riskGauge).toBe('균열');
    expect(l.defeatState).toBe('영자 고갈');
    expect(l.skillButton).toBe('성문');
    expect(l.skillGauge).toBe('영자 게이지');
  });

  it('종족 선택 목록은 설정 파일 목록 그대로다', () => {
    expect(FACTIONS.length).toBe(2);
    expect(pickFaction(getEnemy('test-a').name, 'quincy')).toBe('테스트 적 A');
  });

  it('엔진·화면 코드에 종족 id 문자열 분기가 없다', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk('src/engine');
    walk('src/ui');
    files.push('src/main.ts', 'src/game.ts');
    for (const f of files) {
      const text = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(text, f).not.toMatch(/['"`](hollow|shinigami)['"`]/);
    }
  });
});
