// C.446 (GDD v6.055 7·8절, 사용자 2026-11-13): 능력치 7종(속도 → 공격속도·블록속도) · 상한(평타 0.3초·블록 1초) · 능력으로 생기는 추가분은 상한 무관 · 옛 세이브 초기화
import { describe, expect, it } from 'vitest';
import { useImmediateHits } from './helpers/hitDelay';
import { BALANCE } from '../src/config/balance';
import { getEnemy, ENEMIES } from '../src/data/enemies';
import { statName } from '../src/data/elements';
import { STAT_IDS, type Stats } from '../src/data/schema';
import {
  attackSecondsNow, baseSpawnSecondsOf, createCombat, defaultCombatParams, playerAttackSecondsOf, spawnTableOf, speedSeconds, drainCombatEvents, extraBasicAttack, grantExtraBlocks, spawnSecondsNow, step, ticksOf, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { decideReconcile, type CloudDoc } from '../src/cloudSave';
import { refStatOf } from '../src/engine/evolution';
import { FORM_TABLE } from '../src/data/evolution';
import { MIN_LOADABLE_SAVE_FORMAT, newSaveData, SAVE_FORMAT_VERSION, writeSave, type StorageLike } from '../src/game';
import { allSlotSummaries, archiveKey, archiveOldSaves, SAVE_RESET_NOTICE_KEY, saveResetNoticeActive, slotKey } from '../src/saveSlots';

useImmediateHits();

const CX = BALANCE.provisional.combat;
const uni = (v: number, o: Partial<Stats> = {}): Stats => ({ ...Object.fromEntries(STAT_IDS.map((k) => [k, v])), ...o }) as Stats;
const mk = (params: Partial<CombatParams> = {}): CombatState =>
  createCombat(7, { enemy: { ...getEnemy('test-a'), hpInAttacks: 100000 }, params: { trayCapacity: 99, ...params } });

function memStore(): StorageLike & { key(i: number): string | null; length: number; removeItem(k: string): void } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

describe('8절 능력치 7종', () => {
  it('속도 → 공격속도(aspd)·블록속도(bspd), 이름은 두 종족 모두 공격속도·블록속도', () => {
    expect(STAT_IDS).toEqual(['hp', 'atk', 'int', 'def', 'spr', 'aspd', 'bspd']);
    for (const f of ['hollow', 'shinigami']) {
      expect(statName('aspd', f)).toBe('공격속도');
      expect(statName('bspd', f)).toBe('블록속도');
    }
  });
  it('기준 능력치는 그대로(50·62.5·78.3·97.5) — 합계만 × 7/6', () => {
    expect([0, 1, 2, 3].map((i) => refStatOf(i))).toEqual([50, 62.5, 470 / 6, 97.5].map((x) => expect.closeTo(x, 9)));
    for (const f of FORM_TABLE) expect(f.stats.bspd, f.id).toBeGreaterThan(0);
  });
  it('적 노력치: 물리 → 공격속도, 특수 → 블록속도, 혼합 → 반씩 (옛 spd 없음)', () => {
    for (const e of ENEMIES) {
      expect(Object.keys(e.ev ?? {})).not.toContain('spd');
      if (e.ev?.bspd && !e.ev.aspd) expect(e.category, e.id).toBe('special');
      if (e.ev?.aspd && !e.ev.bspd) expect(e.category, e.id).toBe('physical');
    }
    expect(getEnemy('normal-swift').ev).toEqual({ bspd: 2 });
    expect(getEnemy('water-swift').ev).toEqual({ aspd: 1, bspd: 1 });
  });
  it('고유 특성: 공격속도 = 평타 간격 −0.15초, 블록속도 = 블록 간격 −0.54초(옛 지능 몫), 지능 = 블록 피해 ×1.12', () => {
    const AB = BALANCE.provisional.abilities;
    // C.447 (사용자 '옵션 = 간격 −n초'): 옛 ×1.18 → −0.15초, ×1.2 → −0.54초
    expect(AB.aspd).toEqual({ attackSecondsCut: 0.15 });
    expect(AB.bspd).toEqual({ spawnSecondsCut: 0.54 });
    expect(AB.int).toEqual({ blockDamage: 1.12 });
    // 성향 표: 블록속도 1위 = 지능 1위와 같은 모양
    const T = BALANCE.provisional.blockPool.temperament;
    expect(T.bspd).toEqual(T.int);
  });
});

describe('8절 속도 곡선 (사용자: 공격·블록 같은 모양, 노력치만으론 상한 못 닿음)', () => {
  const body = (o: Partial<Stats>) => ({ ...defaultCombatParams(), playerStats: uni(50, o) });
  it('평타: 공격속도 50 → 1.0초 · 100 → 0.78(GDD 표 0.79 = 0.785 의 올림, 0.01초 반올림이면 0.78) · 430 → 0.47', () => {
    expect(playerAttackSecondsOf(body({ aspd: 50 }))).toBeCloseTo(1.0, 9);
    expect(playerAttackSecondsOf(body({ aspd: 100 }))).toBeCloseTo(0.78, 9);
    expect(playerAttackSecondsOf(body({ aspd: 430 }))).toBeCloseTo(0.47, 9);
  });
  it('블록: 출현표 평균 간격 × 같은 곡선 — 기본 간격 3.24초면 50 → 3.24 · 100 → 2.54 · 430 → 1.53 (GDD 표)', () => {
    const r2 = (x: number) => Math.round(x * 100) / 100;
    expect([50, 100, 430].map((v) => r2(BALANCE.provisional.blockPool.basicSpawnSeconds * Math.pow(50 / v, CX.speedExponent)))).toEqual([3.24, 2.54, 1.53]);
    const table = spawnTableOf(body({})).seconds;
    for (const v of [50, 100, 430]) expect(baseSpawnSecondsOf(body({ bspd: v }))).toBeCloseTo(r2(table * Math.pow(50 / v, CX.speedExponent)), 9);
    expect(baseSpawnSecondsOf(body({ bspd: 100 }))).toBeLessThan(baseSpawnSecondsOf(body({ bspd: 50 })));
  });
  it('0.01초 반올림 뒤 옵션(−n초)을 빼고, 상한 아래로는 안 간다', () => {
    expect(speedSeconds(0.786, 0.1, 0.3)).toBeCloseTo(0.69, 9);
    expect(speedSeconds(0.47, 0.5, 0.3)).toBe(0.3);
    expect(playerAttackSecondsOf({ ...body({ aspd: 100 }), attackSecondsCut: 0.1 })).toBeCloseTo(0.68, 9);
    expect(baseSpawnSecondsOf({ ...body({ bspd: 100 }), spawnSecondsCut: 0.5 })).toBeCloseTo(baseSpawnSecondsOf(body({ bspd: 100 })) - 0.5, 9);
  });
  it('노력치 한 능력치 상한(4단계 330)까지 채운 4단계 몸도 상한에 못 닿는다', () => {
    const cap = Math.floor(BALANCE.provisional.stats.evCapTotal[3]! * BALANCE.provisional.stats.evCapPerStatRatio);
    const top = Math.max(...FORM_TABLE.map((f) => Math.max(f.stats.aspd, f.stats.bspd)));
    expect(playerAttackSecondsOf(body({ aspd: top + cap }))).toBeGreaterThan(CX.attackSecondsMin);
    expect(baseSpawnSecondsOf(body({ bspd: top + cap }))).toBeGreaterThan(CX.spawnSecondsMin);
  });
});

describe('7절 상한: 평타 0.3초·블록 1초 (타이머 간격, 다 합친 결과)', () => {
  it('공격속도가 아무리 높아도 평타 간격 ≥ 0.3초 — 해방·가속 배율을 곱해도', () => {
    const s = mk({ playerStats: uni(50, { aspd: 50000 }), attackSpeedMultiplier: 3 });
    expect(attackSecondsNow(s)).toBeCloseTo(CX.attackSecondsMin, 9);
    s.basicHaste = { ticks: 999, haste: 0.9 };
    expect(attackSecondsNow(s)).toBeCloseTo(CX.attackSecondsMin, 9);
    // 3초 동안 평타는 3 ÷ 0.3 = 10번 안팎 (첫 타 포함)
    const before = s.basicCount ?? 0;
    for (let i = 0; i < ticksOf(s.params, 3); i++) step(s);
    expect((s.basicCount ?? 0) - before).toBeLessThanOrEqual(11);
    expect((s.basicCount ?? 0) - before).toBeGreaterThanOrEqual(9);
  });
  it('블록속도가 아무리 높아도 블록 생성 간격 ≥ 1초 — 가속·해방·스택을 다 합쳐도', () => {
    const s = mk({ playerStats: uni(50, { bspd: 50000 }), blockSpawnMultiplier: 5 });
    expect(spawnSecondsNow(s)).toBeCloseTo(CX.spawnSecondsMin, 9);
    drainCombatEvents(s);
    for (let i = 0; i < ticksOf(s.params, 10); i++) step(s);
    const spawns = drainCombatEvents(s).filter((e) => e.kind === 'spawn').length;
    expect(spawns).toBeLessThanOrEqual(11);
    expect(spawns).toBeGreaterThanOrEqual(8);
  });
  it('보통 몸(블록속도 = 기준)은 상한에 닿지 않는다 — 간격이 1초보다 길다', () => {
    const s = mk({ playerStats: uni(50) });
    expect(spawnSecondsNow(s)).toBeGreaterThan(CX.spawnSecondsMin);
    expect(attackSecondsNow(s)).toBeGreaterThan(CX.attackSecondsMin);
  });
});

describe('7절 능력으로 생기는 추가분은 상한 무관 (타이머 밖)', () => {
  it('블록 2개 추가 생성: 상한에 걸린 몸에서도 바로 2개, 생성 타이머는 그대로', () => {
    const s = mk({ playerStats: uni(50, { bspd: 50000 }) });
    const timer = s.spawnTimer;
    const n = s.tray.length;
    expect(grantExtraBlocks(s, 2)).toBe(2);
    expect(s.tray.length).toBe(n + 2);
    expect(s.spawnTimer).toBe(timer);
    // 같은 틱에 또 2개 — 1초에 1개 상한과 무관
    expect(grantExtraBlocks(s, 2)).toBe(2);
    expect(s.tray.length).toBe(n + 4);
  });
  it('추가 평타: 상한에 걸린 몸에서도 바로 한 번 더, 평타 타이머는 그대로', () => {
    const s = mk({ playerStats: uni(50, { aspd: 50000 }) });
    const timer = s.player.attackTimer;
    const hp = s.enemy.hp;
    const c = s.basicCount ?? 0;
    extraBasicAttack(s);
    extraBasicAttack(s);
    expect((s.basicCount ?? 0) - c).toBe(2);
    expect(s.enemy.hp).toBeLessThan(hp);
    expect(s.player.attackTimer).toBe(timer);
  });
});

describe('세이브: 옛 형식은 이어 쓰지 않는다 (사용자 "세이브 걍 날려")', () => {
  it('문턱 87 · 형식 88(C.454, 87 → 88 은 마이그레이션)', () => {
    expect(SAVE_FORMAT_VERSION).toBe(88);
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(87);
  });
  it('옛 형식 슬롯은 백업 키로 옮기고 비운다 → 새로 시작 · 안내 한 줄, 새 형식 슬롯은 그대로', () => {
    const st = memStore();
    const old = newSaveData('hollow', 1);
    old.meta.format = 86;
    writeSave(st, old, slotKey(1));
    writeSave(st, newSaveData('shinigami', 2), slotKey(2));
    expect(archiveOldSaves(st, MIN_LOADABLE_SAVE_FORMAT, 5000)).toEqual([1]);
    expect(st.getItem(slotKey(1))).toBeNull();
    const backup = JSON.parse(st.getItem(archiveKey(1, 86))!) as { meta: { format: number }; factionId: string };
    expect(backup.meta.format).toBe(86);
    expect(backup.factionId).toBe('hollow');
    const sums = allSlotSummaries(st);
    expect(sums[0]!.state).toBe('empty');
    expect(sums[1]!.state).toBe('ok');
    expect(JSON.parse(st.getItem(SAVE_RESET_NOTICE_KEY)!)).toEqual({ slots: [1], at: 5000 });
    // 다시 불러도 아무것도 안 옮긴다
    expect(archiveOldSaves(st)).toEqual([]);
  });
  it('안내는 새 세이브가 하나도 없을 때만, 새 세이브가 생기면 지운다', () => {
    const st = memStore();
    const old = newSaveData('hollow', 1);
    old.meta.format = 80;
    writeSave(st, old, slotKey(3));
    archiveOldSaves(st);
    expect(saveResetNoticeActive(st, allSlotSummaries(st))).toBe(true);
    writeSave(st, newSaveData('hollow', 3), slotKey(1));
    expect(saveResetNoticeActive(st, allSlotSummaries(st))).toBe(false);
    expect(st.getItem(SAVE_RESET_NOTICE_KEY)).toBeNull();
  });
  it('클라우드: 옛 형식 판은 없는 것으로 — 내려받지 않고, 기기 세이브가 있으면 덮어 올린다', () => {
    const cloud = { format: 86, savedAt: 10, slot: 1, device: 'x', build: '', base: null, summary: { factionId: 'hollow', tierIndex: 0, expeditions: 0 }, text: '{}' } as CloudDoc;
    expect(decideReconcile(cloud, { slot: 1, exists: false, playedAt: null }, null, 'me', false)).toEqual({ kind: 'none' });
    expect(decideReconcile(cloud, { slot: 1, exists: true, playedAt: 5 }, null, 'me', false)).toEqual({ kind: 'upload', slot: 1 });
  });
});
