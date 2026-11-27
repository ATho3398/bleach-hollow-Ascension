// C.566 (GDD 6-16 v6.246, 코딩361): 토벌전 — 작전 5개(정령정 침입 작전·웨코문도 강습·카라쿠라 마을 수호·왕건 탈환 작전·천년혈전),
// 한 입장 = 모험 엔진 고정 길 1바퀴(12칸, 타일·드래프트·흡수·바퀴 끝 창 없음, 일반·강적 칸 고정, 마지막 칸 = 보스), 체력 이어감, 지면 실패.
// 열림 = 보스전에서 끝 보스를 이긴 뒤, 보상 = 보스전 × 1.5 + 장비 1개
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS } from '../src/data/factions';
import { RAIDS } from '../src/data/raids';
import { specialDungeonLabels } from '../src/engine/faction';
import { advance, createExpedition, finishBattle, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { bossRushReward, raidBattleCount, raidEntries, raidOpen, raidReward, raidStars, SPECIAL_TABS } from '../src/engine/specialDungeon';
import { enterSpecial, newSaveData, settleSpecialRun, specialState } from '../src/game';
import type { CombatState } from '../src/engine/combat';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SX = BALANCE.provisional.specialDungeon;
const NOW = Date.UTC(2026, 10, 30, 3);
const fake = (won: boolean): CombatState => ({ status: won ? 'won' : 'lost', lossReason: won ? null : 'hp', tick: 100, enemy: { def: { id: 'e1' } }, player: { hp: 60, maxHp: 100 }, params: { playerStartHpFraction: 1 } } as unknown as CombatState);

const raidExp = (i = 0): ExpeditionState => {
  const e = raidEntries()[i]!;
  return createExpedition({ factionId: 'hollow', seed: 7, hunger: 0, condition: 100, deck: ['some-tile'], difficulty: e.boss.star, groundId: e.def.ground, raid: { road: e.def.road, bossId: e.boss.id } });
};
/** 한 바퀴를 돌며 전투마다 결과를 넣는다 (won = 판 번호 → 승패) */
const walk = (exp: ExpeditionState, won: (n: number) => boolean) => {
  const cells: { cell: number; cls: string; boss: string | null }[] = [];
  for (let guard = 0; guard < 40 && exp.phase !== 'ended'; guard++) {
    const ev = advance(exp);
    if (ev?.kind === 'battle') {
      cells.push({ cell: ev.cell, cls: ev.battle.enemy.class, boss: ev.battle.boss ?? null });
      const c = startBattle(exp);
      const f = fake(won(cells.length));
      finishBattle(exp, { ...c, status: f.status, lossReason: f.lossReason, player: { ...c.player, hp: c.player.maxHp * 0.6 } } as CombatState);
    }
  }
  return cells;
};

describe('C.566 작전 데이터', () => {
  it('작전 5개 · 끝 보스 · 이름(종족 설정, 두 종족 같은 이름)', () => {
    expect(raidEntries().map((e) => [e.id, e.boss.name['*']])).toEqual([
      ['raid-seireitei', '뱌쿠야'], ['raid-hueco', '우르키오라'], ['raid-karakura', '긴죠'], ['raid-oken', '아이젠'], ['raid-tybw', '유하바하'],
    ]);
    for (const f of FACTIONS) {
      const L = specialDungeonLabels(f);
      expect(L.tabs.raid).toBe('토벌전');
      expect(RAIDS.map((r) => L.raids[r.id]?.name)).toEqual(['정령정 침입 작전', '웨코문도 강습', '카라쿠라 마을 수호', '왕건 탈환 작전', '천년혈전']);
    }
    expect(SPECIAL_TABS).toEqual(['tower', 'daily', 'boss', 'raid']);
  });
});

describe('C.566 모험 엔진 고정 길 (raid 옵션)', () => {
  it('1바퀴 · 타일 없음 · 정해진 칸에서만 일반·강적 · 마지막 칸(11) = 보스 → 이기면 바로 끝(raid-clear)', () => {
    const exp = raidExp(0);
    expect(exp.maxLaps).toBe(1);
    expect(exp.deck).toEqual([]);
    expect(exp.slots.every((x) => x === null)).toBe(true);
    expect(exp.wildCells).toEqual([]);
    expect(exp.freeBoss).toBeNull();
    const cells = walk(exp, () => true);
    const road = raidEntries()[0]!.def.road;
    expect(cells.map((c) => c.cell)).toEqual([...Object.keys(road).map(Number), 11]);
    expect(cells.slice(0, -1).map((c) => c.cls)).toEqual(Object.values(road));
    expect(cells.at(-1)!.boss).toBe('br-byakuya');
    expect(exp.phase).toBe('ended');
    expect(exp.endReason).toBe('raid-clear');
    expect(exp.absorbRecords).toEqual([]);
    expect(exp.foodLoot).toEqual([]);
    expect(exp.goldLoot).toEqual([]);
  });

  it('체력은 이어 간다(사냥 힐 없음), 지면 실패', () => {
    const exp = raidExp(4);
    walk(exp, (n) => n < 3);
    expect(exp.phase).toBe('ended');
    expect(exp.endReason).toBe('battle-lost');
    const exp2 = raidExp(1);
    let first = -1;
    for (let g = 0; g < 20 && first < 0; g++) {
      const ev = advance(exp2);
      if (ev?.kind === 'battle') {
        const c = startBattle(exp2);
        finishBattle(exp2, { ...c, status: 'won', lossReason: null, player: { ...c.player, hp: c.player.maxHp * 0.55 } } as CombatState);
        first = exp2.hpFraction ?? 1;
      }
    }
    expect(first).toBeCloseTo(0.55, 6);
  });

  it('유하바하 = 보스전 scale 1.3 까지 입힌 적', () => {
    const exp = raidExp(4);
    let boss: number | null = null;
    for (let g = 0; g < 40 && boss === null; g++) {
      const ev = advance(exp);
      if (ev?.kind === 'battle') {
        if (ev.battle.boss) boss = ev.battle.enemy.hpInAttacks;
        else { const c = startBattle(exp); finishBattle(exp, { ...c, status: 'won', lossReason: null } as CombatState); }
      }
    }
    const yh = raidEntries()[4]!.boss;
    expect(boss).toBeGreaterThan(yh.enemy.hpInAttacks * 1.3 - 1e-6);
  });
});

describe('C.566 열림·입장·보상', () => {
  it('열림 = 보스전에서 끝 보스를 이긴 뒤, ★ = 1 ~ 끝 보스 권장 ★', () => {
    const s = newSaveData('hollow', 1);
    const [sei] = raidEntries();
    expect(raidOpen(sei!, s.shared.special.clears)).toBe(false);
    expect(enterSpecial(s, 'raid', 'raid-seireitei', NOW)).toBe(false);
    s.shared.special.clears['boss:br-byakuya'] = 1;
    expect(raidOpen(sei!, s.shared.special.clears)).toBe(true);
    expect(raidStars(sei!, 4)).toEqual([1, 2]);
    specialState(s, NOW);
    expect(s.tower.tickets.raid).toBe(2);
    expect(enterSpecial(s, 'raid', 'raid-seireitei', NOW)).toBe(true);
    expect(s.tower.tickets.raid).toBe(1);
  });

  it('보상 = 보스전 × 1.5(재료 각·골드) + 장비 1개, 끝 보스 도감 +1 — 하나라도 지면 없음', () => {
    const s = newSaveData('hollow', 1);
    s.shared.soulCrystals = 0; s.shared.tradeCoins = 0;
    const e = raidEntries()[0]!;
    const total = raidBattleCount(e);
    expect(total).toBe(5);
    const lose = settleSpecialRun(s, { mode: 'raid', target: e.id, bossId: e.boss.id, star: 2, battles: [fake(true), fake(false)], total, quit: false }, NOW);
    expect(lose.won).toBe(false);
    expect(s.shared.soulCrystals).toBe(0);
    const n0 = s.shared.gear.items.length;
    const r = settleSpecialRun(s, { mode: 'raid', target: e.id, bossId: e.boss.id, star: 2, battles: Array.from({ length: total }, () => fake(true)), total, quit: false }, NOW);
    expect(r.won).toBe(true);
    expect(raidReward(2).each).toBe(Math.round(bossRushReward(2).each * SX.raid.rewardMult));
    expect(s.shared.soulCrystals).toBe(raidReward(2).each);
    expect(r.gold).toBe(Math.round(bossRushReward(2).gold * 1.5));
    expect(r.gear).toHaveLength(1);
    expect(s.shared.gear.items.length).toBe(n0 + 1);
    expect(s.bossDex['br-byakuya']?.kills).toBe(1);
    expect(s.shared.special.clears['raid:raid-seireitei']).toBe(1);
    expect(s.runLog.specialRuns.at(-1)).toMatchObject({ mode: 'raid', target: 'raid-seireitei', won: true });
  });
});

describe('C.566 화면 연결', () => {
  it('토벌전 = 중간 저장 없음·흡수 없음·우라하라 없음 · 정산 = 특수던전(recordExpedition 아님) · 상점 토벌전 입장권 500', () => {
    const app = read('src/ui/app.ts');
    expect(app).toMatch(/if \(exp\.raid\) return; \/\/ 토벌전/);
    expect(app).toMatch(/absorb: !exp\.raid/);
    expect(app).toMatch(/wanderer: save && !exp\.raid/);
    expect(app).toMatch(/raidRuns\.has\(exp\) \? prepareRaidEnd/);
    const end = app.slice(app.indexOf('function prepareRaidEnd'), app.indexOf('function startSpecialRun'));
    expect(end).toMatch(/settleSpecialRun\(s0, \{ mode: 'raid'/);
    expect(end).not.toMatch(/recordExpedition/);
    const items = JSON.parse(read('src/data/shop/items.json')) as { gold: { id: string; ticket?: string }[] };
    expect(items.gold.find((g) => g.id === 'ticket-raid')?.ticket).toBe('raid');
    expect(SX.tickets.raid.price).toBe(500);
    const v = read('src/ui/specialDungeonView.ts');
    expect(v).toMatch(/보스전에서 \$\{bossRushName\(faction, e\.boss\)\}을\(를\) 이기면 열린다/);
    expect(read('docs/GDD.md')).toMatch(/토벌전\*\*[^\n]*구현 C\.566/);
  });
});
