// 원정 중간 저장·이어하기 (GDD 14-1, C.13)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { playCombatBot } from '../src/engine/combat';
import {
  advance, chooseAbsorb, chooseContinue, chooseRelease, chooseReturn, createExpedition, EXPEDITION_SNAPSHOT_VERSION, finishBattle, finishRest,
  placeAll, restoreExpedition, serializeExpedition, startBattle, type ExpeditionState,
} from '../src/engine/expedition';
import { botPickTrait } from '../src/engine/expedition';
import {
  loadSave, migrateSave, newSaveData, readActiveExpedition, recordExpedition, SAVE_FORMAT_VERSION, writeSave, type SaveData,
} from '../src/game';

const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const mk = (seed = 7) => createExpedition({ factionId: 'hollow', seed, hunger: 10, condition: 100, deck: DECK });

const roundtrip = (exp: ExpeditionState): ExpeditionState => {
  const snap = serializeExpedition(exp, 2, 123)!;
  const r = restoreExpedition(JSON.parse(JSON.stringify(snap)));
  if (!r.ok) throw new Error('복원 실패');
  return r.exp;
};

/** 원정을 한 단계씩 진행한다. 매 단계마다 rt 로 상태를 갈아끼운다 (identity = 저장 없이, roundtrip = 매번 저장·복원) */
function drive(start: ExpeditionState, rt: (e: ExpeditionState) => ExpeditionState, stop?: (e: ExpeditionState) => boolean): ExpeditionState {
  let exp = start;
  for (let g = 0; exp.phase !== 'ended' && g < 5000; g++) {
    if (stop?.(exp)) return exp;
    exp = rt(exp);
    if (exp.phase === 'moving') {
      placeAll(exp);
      advance(exp);
    } else if (exp.phase === 'battle') {
      const b = startBattle(exp);
      playCombatBot(b);
      finishBattle(exp, b);
    } else if (exp.phase === 'absorb') {
      const pick = botPickTrait(exp);
      chooseAbsorb(exp, pick.traitId, pick.replaceSlot);
    } else if (exp.phase === 'rest') finishRest(exp);
    else if (exp.phase === 'nest-choice') {
      placeAll(exp);
      if (exp.lap >= 2) chooseReturn(exp);
      else chooseContinue(exp);
    }
  }
  return exp;
}

describe('원정 직렬화', () => {
  it('왕복해도 같다: 새 원정과 진행 중 여러 시점', () => {
    const phases = new Set<string>();
    for (const seed of [1, 2, 3]) {
      let exp = mk(seed);
      expect(roundtrip(exp)).toEqual(exp);
      drive(exp, (e) => {
        phases.add(e.phase);
        if (e.phase === 'rest') {
          // 복원은 휴식을 끝낸 상태로 연다(restoreExpedition 의 설계): 휴식을 끝낸 사본과 같아야 한다
          const settled = structuredClone(e);
          finishRest(settled);
          expect(roundtrip(e)).toEqual(settled);
        } else expect(roundtrip(e)).toEqual(e);
        return e;
      });
    }
    expect(phases).toContain('battle');
    expect(phases).toContain('nest-choice');
    expect(phases).toContain('absorb');
  });

  it('저장은 사본이라 이후 원정 진행이 저장에 영향을 주지 않는다', () => {
    const exp = mk();
    const snap = serializeExpedition(exp, 1)!;
    const before = JSON.stringify(snap);
    advance(exp);
    expect(JSON.stringify(snap)).toBe(before);
  });

  it('끝난 원정은 저장하지 않는다', () => {
    const exp = drive(mk(), (e) => e);
    expect(exp.phase).toBe('ended');
    expect(serializeExpedition(exp, 1)).toBeNull();
  });

  it('배속이 저장·복원된다', () => {
    const r = restoreExpedition(JSON.parse(JSON.stringify(serializeExpedition(mk(), 4)!)));
    expect(r.ok && r.speed).toBe(4);
  });
});

describe('결정성: 같은 시드 + 같은 저장 + 같은 입력 = 같은 결과', () => {
  it('매 단계 저장·복원하며 진행해도 끝까지 저장 없이 진행한 것과 완전히 같다', () => {
    for (const seed of [1, 5, 9, 42]) {
      const plain = drive(mk(seed), (e) => e);
      const saved = drive(mk(seed), roundtrip);
      expect(JSON.stringify(saved)).toBe(JSON.stringify(plain));
    }
  });

  it('각 저장 시점(전투 직전·전투 후·둥지 칸·배치 후·휴식 후)에서 복원해도 같은 결과', () => {
    const plain = drive(mk(11), (e) => e);
    const seen = new Set<string>();
    // 진행 중 각 단계에서 한 번씩 복원해 끝까지 이어 본다
    let probe = mk(11);
    for (let g = 0; probe.phase !== 'ended' && g < 5000; g++) {
      seen.add(probe.phase);
      const resumed = drive(roundtrip(probe), (e) => e);
      expect(JSON.stringify(resumed)).toBe(JSON.stringify(plain));
      probe = stepOnce(probe);
    }
    expect(seen).toContain('battle');
    expect(seen).toContain('nest-choice');
  });

  it('전투 도중 새로고침 = 전투 시작 직전 상태로 복원, 전투를 처음부터 다시 해도 같은 결과', () => {
    const exp = mk(3);
    const atBattle = drive(exp, (e) => e, (e) => e.phase === 'battle');
    expect(atBattle.phase).toBe('battle');
    const saved = serializeExpedition(atBattle, 1)!; // 전투 시작 직전 저장
    // 전투를 일부만 진행(= 새로고침 전)하고 버린다
    const abandoned = startBattle(atBattle);
    abandoned.enemy.hp -= 1;
    // 원본은 그대로 끝까지 치른다
    const b1 = startBattle(atBattle);
    playCombatBot(b1);
    finishBattle(atBattle, b1);
    // 복원본: 같은 전투를 처음부터
    const r = restoreExpedition(JSON.parse(JSON.stringify(saved)));
    if (!r.ok) throw new Error();
    expect(r.exp.phase).toBe('battle');
    const b2 = startBattle(r.exp);
    playCombatBot(b2);
    finishBattle(r.exp, b2);
    expect(JSON.stringify(r.exp)).toBe(JSON.stringify(atBattle));
  });
});

function stepOnce(exp: ExpeditionState): ExpeditionState {
  let n = 0;
  return drive(exp, (e) => e, () => n++ >= 1);
}

describe('세이브 구조', () => {
  const withActive = (): SaveData => {
    const save = newSaveData('hollow', 0);
    const exp = drive(mk(), (e) => e, (e) => e.phase === 'battle');
    save.activeExpedition = serializeExpedition(exp, 2, 5);
    return save;
  };

  it('중간 저장은 runLog 와 별도 영역이고, 저장·불러오기 후 이어할 수 있다', () => {
    const save = withActive();
    expect(save.runLog.runs).toHaveLength(0);
    expect(save.runLog.battles).toHaveLength(0);
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    writeSave(storage, save);
    const loaded = loadSave(storage)!;
    const a = readActiveExpedition(loaded);
    expect(a.ok && a.exp.phase).toBe('battle');
    expect(a.ok && a.speed).toBe(2);
  });

  it('원정이 정상 종료(귀환·패배)하면 중간 저장 영역을 비우고 런 로그에는 한 번만 들어간다', () => {
    const save = withActive();
    const a = readActiveExpedition(save);
    if (!a.ok) throw new Error();
    const done = drive(a.exp, (e) => e);
    recordExpedition(save, done, 0);
    expect(save.activeExpedition).toBeNull();
    expect(save.runLog.runs).toHaveLength(1);
  });

  it('새 원정을 시작해 버려진 원정은 런 로그·획득물·둥지에 영향이 없다', () => {
    const save = withActive();
    const before = JSON.stringify({ runLog: save.runLog, tiles: save.tiles, nest: save.nest, build: save.build, evolution: save.evolution });
    // 새 원정 출발 = 중간 저장을 새 원정으로 덮어쓴다
    save.activeExpedition = serializeExpedition(mk(99), 1);
    const after = JSON.stringify({ runLog: save.runLog, tiles: save.tiles, nest: save.nest, build: save.build, evolution: save.evolution });
    expect(after).toBe(before);
    const a = readActiveExpedition(save);
    expect(a.ok && a.exp.seed).toBe(99);
  });

  it('마이그레이션: 형식 8 이전 세이브가 열리고 원정 영역은 비어 있다', () => {
    const old = newSaveData('hollow', 0) as unknown as Record<string, any>;
    old.meta.format = 8;
    delete old.activeExpedition;
    const m = migrateSave(JSON.parse(JSON.stringify(old)))!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.activeExpedition).toBeNull();
    expect(readActiveExpedition(m)).toEqual({ ok: false, reason: 'none' });
  });

  it('손상·버전 불일치: 이어하기를 숨기고(영역을 비움) 예외 없이 무시한다', () => {
    const good = JSON.parse(JSON.stringify(withActive().activeExpedition));
    const bad: unknown[] = [
      'garbage', 42, [], { version: EXPEDITION_SNAPSHOT_VERSION },
      { ...good, exp: null },
      { ...good, exp: { ...good.exp, phase: 'nope' } },
      { ...good, exp: { ...good.exp, slots: [] } },
      { ...good, exp: { ...good.exp, pending: null } },
      { ...good, exp: { ...good.exp, factionId: 'unknown-faction' } },
      { ...good, exp: { ...good.exp, hand: ['no-such-tile'] } },
      { ...good, exp: { ...good.exp, hunger: 'x' } },
      { ...good, exp: { ...good.exp, rng: { state: NaN } } },
      { ...good, version: EXPEDITION_SNAPSHOT_VERSION + 1 },
      { ...good, balanceVersion: -1 },
    ];
    for (const b of bad) {
      const save = newSaveData('hollow', 0);
      save.activeExpedition = b as any;
      const r = readActiveExpedition(save);
      expect(r.ok).toBe(false);
      expect(save.activeExpedition).toBeNull();
    }
    expect(restoreExpedition({ ...good, version: 0 })).toEqual({ ok: false, reason: 'version' });
    // 세이브째 열 때도 죽지 않는다 (객체가 아닌 값은 비움)
    const s = newSaveData('hollow', 0) as unknown as Record<string, unknown>;
    s.activeExpedition = 'garbage';
    expect(migrateSave(JSON.parse(JSON.stringify(s)))!.activeExpedition).toBeNull();
  });

  it('원정 직렬화 코드에 종족 분기가 없다', () => {
    const src = readFileSync('src/engine/expedition/snapshot.ts', 'utf8');
    expect(src).not.toMatch(/factionId\s*===|faction\s*===|'hollow'|'shinigami'/);
  });
});
