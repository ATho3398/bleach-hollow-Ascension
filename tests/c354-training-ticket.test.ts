// C.354 (GDD 216장): 수련권 = 원정·탑 강적 20%·보스 50% 무작위(시드) · 귀환 지급·개수 제한 없음 · 런 로그 trainingTickets · 세이브 형식 65 · 바뀐 값 칩 = 정확한 숫자
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { createCombat } from '../src/engine/combat';
import { createExpedition, playExpedition, ticketDropOf, type ExpeditionState } from '../src/engine/expedition';
import { towerFloor } from '../src/engine/tower';
import { addTrainingTicket, newTrainingState, rollTrainingTicket, sanitizeTraining } from '../src/engine/training';
import { migrateSave, newSaveData, recordExpedition, recordTowerBattle, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, towerTicketDrop } from '../src/game';
import { buyShopItem } from '../src/shop';
import { changeDeltaText, changeItems } from '../src/ui/bha/changeNote';

const TX = BALANCE.provisional.training;
const read = (p: string) => readFileSync(p, 'utf8');

describe('드롭 확률 (216장 1)', () => {
  it('강적 20% · 보스 50% · 일반 0 (provisional 값)', () => {
    expect(TX.ticketDrop).toEqual({ elite: 0.2, boss: 0.5 });
    expect(rollTrainingTicket('elite', () => 0.199)).toBe(true);
    expect(rollTrainingTicket('elite', () => 0.2)).toBe(false);
    expect(rollTrainingTicket('boss', () => 0.499)).toBe(true);
    expect(rollTrainingTicket('boss', () => 0.5)).toBe(false);
    expect(rollTrainingTicket('normal', () => 0)).toBe(false);
  });
  it('탑: 같은 시드 = 같은 결과, 시드 4000개 비율 ≈ 20% / 50%, 일반 층은 0', () => {
    const rate = (floor: number) => {
      let n = 0;
      for (let seed = 1; seed <= 4000; seed++) if (towerTicketDrop(towerFloor(floor), seed)) n++;
      return n / 4000;
    };
    expect(towerFloor(5).kind).toBe('elite');
    expect(towerFloor(10).kind).toBe('boss');
    expect(Math.abs(rate(5) - 0.2)).toBeLessThan(0.03);
    expect(Math.abs(rate(10) - 0.5)).toBeLessThan(0.03);
    expect(rate(1)).toBe(0);
    expect(towerTicketDrop(towerFloor(5), 123)).toBe(towerTicketDrop(towerFloor(5), 123));
  });
  it('원정: 강적·보스 상대만, 시드·전투 번호로 재현, 시드 4000개 비율 ≈ 20% / 50%', () => {
    const fake = (seed: number, cls: 'normal' | 'elite', boss: string | null = null) =>
      ({ seed, tutorial: false, battles: [], pending: { boss, enemy: { class: cls, id: 'x' } } }) as unknown as ExpeditionState;
    const rate = (cls: 'normal' | 'elite', boss: string | null = null) => {
      let n = 0;
      for (let seed = 1; seed <= 4000; seed++) if (ticketDropOf(fake(seed, cls, boss))) n++;
      return n / 4000;
    };
    expect(Math.abs(rate('elite') - 0.2)).toBeLessThan(0.03);
    expect(Math.abs(rate('normal', 'boss-x') - 0.5)).toBeLessThan(0.03);
    expect(rate('normal')).toBe(0);
    const e = fake(77, 'elite');
    expect(ticketDropOf(e, 3)).toBe(ticketDropOf(e, 3));
    expect(ticketDropOf({ ...e, tutorial: true } as ExpeditionState)).toBe(false);
  });
  it('튜토리얼 원정은 안 줌, 승리 창에 미리 보이는 값(ticketDropOf)과 finishBattle 이 같은 굴림', () => {
    const exp = playExpedition(createExpedition({ factionId: 'hollow', seed: 5, hunger: 20, condition: 80, deck: ['prey-nest-a'], tutorial: true }), { returnAfterLap: 1 });
    expect(exp.ticketFinds ?? []).toEqual([]);
    const src = read('src/engine/expedition/expedition.ts');
    expect(src).toMatch(/if \(ticketDropOf\(exp, exp\.battles\.length - 1, pending\)\)/);
    expect(read('src/ui/app.ts')).toMatch(/ticketDropOf\(exp\) \? \{ winRewards: \['수련권 \+1'\] \}/);
  });
});

describe('귀환·탑 정산과 런 로그 (216장 1·3)', () => {
  it('귀환 지급 1장은 없다 — 찾은 수련권(ticketFinds)만 더하고 런 로그에 원정 id·바퀴·적', () => {
    const s = newSaveData('hollow', 1);
    const plain = playExpedition(createExpedition({ factionId: 'hollow', seed: 3, hunger: 20, condition: 80, deck: ['prey-nest-a'] }), { returnAfterLap: 1 });
    plain.ticketFinds = [];
    recordExpedition(s, plain, 1);
    expect(s.training.tickets).toBe(0); // 예전엔 귀환마다 +1
    for (let i = 0; i < 5; i++) {
      const exp = playExpedition(createExpedition({ factionId: 'hollow', seed: 10 + i, hunger: 20, condition: 80, deck: ['prey-nest-a'] }), { returnAfterLap: 1 });
      exp.ticketFinds = [{ lap: 1, from: 'elite', enemyId: 'e1' }];
      recordExpedition(s, exp, 2 + i);
    }
    expect(s.training.tickets).toBe(5); // 최대 3 을 넘는다 = 제한 없음
    expect(s.runLog.trainingTickets).toHaveLength(5);
    expect(s.runLog.trainingTickets[0]).toMatchObject({ at: 2, source: 'expedition', factionId: 'hollow', from: 'elite', enemyId: 'e1', lap: 1 });
    expect(typeof s.runLog.trainingTickets[0]!.runId).toBe('number');
  });
  it('탑 강적 층: 이기고 굴림이 맞으면 +1 · 결과 ticket · 런 로그 floor, 지면 없음', () => {
    const save = newSaveData('shinigami', 1);
    save.tower.best = 4;
    const f = towerFloor(5);
    let seed = 1;
    while (!towerTicketDrop(f, seed)) seed++;
    const s = createCombat(seed, { enemy: f.enemy });
    (s as unknown as { status: string }).status = 'won';
    const res = recordTowerBattle(save, f, s, 50);
    expect(res.ticket).toBe(true);
    expect(save.training.tickets).toBe(1);
    expect(save.runLog.trainingTickets).toEqual([{ at: 50, factionId: 'shinigami', source: 'tower', from: 'elite', enemyId: f.enemy.id, floor: 5 }]);
    const lost = createCombat(seed, { enemy: f.enemy });
    (lost as unknown as { status: string }).status = 'lost';
    expect(recordTowerBattle(save, f, lost, 60).ticket).toBe(false);
    expect(save.training.tickets).toBe(1);
    expect(read('src/ui/towerView.ts')).toMatch(/if \(res\.ticket\) rows\.push\(\{ label: '수련권'.*'수련권 \+1'/);
  });
});

describe('개수 제한 없음 (216장 2)', () => {
  it('저장값 정리·더하기·상점 모두 3 을 넘어 쌓인다', () => {
    expect(sanitizeTraining({ tickets: 12 }).tickets).toBe(12);
    const t = newTrainingState();
    t.tickets = 3;
    addTrainingTicket(t);
    expect(t.tickets).toBe(4);
    const save = newSaveData('hollow', 1);
    save.training.tickets = 7;
    save.evolution.tierIndex = BALANCE.provisional.liberation.minTierIndex; // 상점 수련권은 5단계부터 보임
    save.shared.tradeCoins = 10_000;
    const r = buyShopItem(save, getFaction('hollow'), 'training-ticket', 1);
    expect(r.ok).toBe(true);
    expect(save.training.tickets).toBe(8);
    expect('ticketsMax' in TX).toBe(false);
    expect('ticketsPerReturn' in TX).toBe(false);
  });
  it('수련 화면은 "수련권 n" (/3 없음), 없을 때 안내 = 강적·보스', () => {
    const v = read('src/ui/trainingView.ts');
    expect(v).not.toMatch(/ticketsMax|최대 3장|돌아오면 1장/);
    expect(v).toMatch(/`수련권 \$\{t\.tickets\}`/);
    expect(v).toMatch(/강적·보스를 잡으면 얻을 때가 있다/);
  });
});

describe('세이브 형식 65 (216장 3)', () => {
  it('64 → 65: 두 트랙 런 로그에 빈 trainingTickets, 가진 수련권 그대로', () => {
    expect(SAVE_FORMAT_VERSION).toBe(67); // C.361 노력치 상한 밖 몫
    expect(typeof SAVE_MIGRATIONS[64]).toBe('function');
    const old = newSaveData('hollow', 1);
    old.meta.format = 64;
    old.training.tickets = 3;
    delete (old.runLog as unknown as Record<string, unknown>).trainingTickets;
    const m = migrateSave(JSON.parse(JSON.stringify(old)));
    expect(m).not.toBeNull();
    expect(m!.meta.format).toBe(67); // C.361 에서 67 · C.356 에서 66 (모험 소모품 바퀴, 65 → 66 변환 없음);
    expect(m!.runLog.trainingTickets).toEqual([]);
    expect(m!.training.tickets).toBe(3);
  });
});

describe('바뀐 값 칩 = 정확한 숫자 (216장 4)', () => {
  const H = getFaction('hollow');
  it('보이는 값(반올림)끼리의 차 — 상태창에 보이는 실제 변화와 같다', () => {
    const [h] = changeItems({ hunger: 40.4 }, { hunger: 60.6 }, H);
    expect(h).toMatchObject({ key: 'hunger', delta: Math.round(60.6) - Math.round(40.4), up: true, good: true });
    expect(changeDeltaText(h!)).toBe('+21');
    const [r] = changeItems({ risk: 30 }, { risk: 27 }, H);
    expect(changeDeltaText(r!)).toBe('−3'); // U+2212
    expect(r!.good).toBe(true); // 리스크 내림 = 좋음 색 그대로
    const [hp] = changeItems({ hp: 0.3 }, { hp: 0.45 }, H, ['hp']);
    expect(changeDeltaText(hp!)).toBe('+15%');
    expect(changeItems({ cond: 50 }, { cond: 50.2 }, H, ['cond'])).toEqual([]); // 반올림해 0 이면 칩 없음
  });
  it('먹이 하나 = 배부름 칩 숫자가 실제 오른 양 (여러 값)', () => {
    for (const [a, b] of [[10, 30], [55, 100], [0, 7], [99.4, 100]] as const) {
      const [it1] = changeItems({ hunger: a }, { hunger: b }, H);
      expect(it1!.delta).toBe(Math.round(b) - Math.round(a));
    }
  });
});
