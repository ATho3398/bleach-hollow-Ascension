// C.549 (GDD 5-5 v6.224, 사용자 2026-11-27 "모험하다가 한 스테이지당 1%? 확률로 우라하라 만나게 하고 … 모험 3바퀴째부턴 스테이지당 우라하라 만날 확률 높이고"):
// 자유 모험에서 칸마다 1%(3바퀴째부터 3%)로 우라하라와 마주침 → 확인 창(5초 자동 확인) → 그 순간부터 15분 시장에 와 있음 → 남은 시간 칩. 옛 바퀴 굴림 등장·'다음 귀환 때 떠남'은 폐기
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { WANDERER_TEXT } from '../src/data/shop';
import { advance, chooseContinue, chooseRelease, createExpedition, drainEvents, finishBattle, finishRest, startBattle, wandererRollable, type ExpeditionState, type WandererMeetCtx } from '../src/engine/expedition';
import { restoreExpedition, serializeExpedition } from '../src/engine/expedition/snapshot';
import { rollWandererMeet, wandererClock, wandererHereAt, wandererLeaveAt, wandererMeetChance, wandererRemainingMs, wandererStayMs } from '../src/engine/wanderer';
import { expireWanderer, meetWanderer, migrateSave, migrateWandererStay, newSaveData, recordExpedition, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, wandererHere } from '../src/game';
import { autoYesLabel } from '../src/ui/confirmDialog';

const WX = BALANCE.provisional.wanderer;
const MIN = 60_000;
const L = BALANCE.expedition.loopTiles;

/** 빈 길 자유 원정 (전투는 이긴 것으로, 흡수는 놓아줌, 바퀴 끝은 한 바퀴 더) */
function freeExp(seed: number, extra: Partial<Parameters<typeof createExpedition>[0]> = {}): ExpeditionState {
  return createExpedition({ factionId: 'hollow', seed, hunger: 0, condition: 80, deck: [], ...extra });
}

/** steps 칸을 걷고 우라하라 마주침 이벤트를 모은다. ctx(i) = 그 걸음의 굴림 재료 */
function walk(e: ExpeditionState, steps: number, ctx: (i: number) => WandererMeetCtx | undefined): { lap: number; cell: number; at: number }[] {
  const met: { lap: number; cell: number; at: number }[] = [];
  const cap = steps * 6;
  for (let i = 0; i < cap && steps > 0; i++) {
    if (e.phase === 'battle') {
      const b = startBattle(e);
      b.status = 'won';
      finishBattle(e, b);
    } else if (e.phase === 'absorb') chooseRelease(e);
    else if (e.phase === 'rest') finishRest(e);
    else if (e.phase === 'nest-choice') chooseContinue(e);
    else if (e.phase === 'moving') {
      advance(e, ctx(i));
      steps--;
    } else break;
    e.hunger = 0; // 배고파 끝나지 않게
    for (const ev of drainEvents(e)) if (ev.kind === 'wanderer-meet') met.push({ lap: ev.lap, cell: ev.cell, at: ev.at });
  }
  return met;
}

/** 1바퀴 안에서 마주치는 시드 찾기 */
function meetingSeed(lap = 1): { seed: number; cell: number } {
  for (let seed = 1; seed < 100_000; seed++) for (let cell = 1; cell < L; cell++) if (rollWandererMeet(seed, lap, cell)) return { seed, cell };
  throw new Error('없음');
}

describe('칸마다 확률 (GDD 5-5)', () => {
  it('1~2바퀴 1%, 3바퀴째부터 3% (provisional), 펫 seek 배율을 곱하고 최대 1', () => {
    expect([WX.meetChance, WX.meetChanceFromLap3, WX.meetFromLap, WX.stayMinutes, WX.confirmSeconds]).toEqual([0.01, 0.03, 3, 15, 5]);
    expect([1, 2, 3, 4, 10].map((l) => wandererMeetChance(l))).toEqual([0.01, 0.01, 0.03, 0.03, 0.03]);
    expect(wandererMeetChance(1, 1.25)).toBeCloseTo(0.0125);
    expect(wandererMeetChance(3, 1000)).toBe(1);
    expect('perLap' in WX).toBe(false); // 옛 바퀴 가중 확률 폐기
  });
  it('원정 전용 난수: 시드·바퀴·칸마다 정해져 재현되고, 많이 굴리면 1%·3% 근처', () => {
    let a = 0;
    let b = 0;
    const N = 40_000;
    for (let seed = 1; seed <= N; seed++) {
      if (rollWandererMeet(seed, 1, 5)) a++;
      if (rollWandererMeet(seed, 4, 5)) b++;
      expect(rollWandererMeet(seed, 1, 5)).toBe(rollWandererMeet(seed, 1, 5));
    }
    expect(a / N).toBeGreaterThan(0.007);
    expect(a / N).toBeLessThan(0.013);
    expect(b / N).toBeGreaterThan(0.025);
    expect(b / N).toBeLessThan(0.035);
  });
  it('걷기: 칸에 들어설 때 굴려 마주치면 이벤트·원정 기록(바퀴·칸·시각), 칸 처리는 그대로 — 굴림 재료가 없으면(점검 봇) 안 굴림', () => {
    const { seed, cell } = meetingSeed();
    const e = freeExp(seed);
    const met = walk(e, cell, () => ({ at: 1000, here: false }));
    expect(met).toEqual([{ lap: 1, cell, at: 1000 }]);
    expect(e.wandererMeets).toEqual([{ lap: 1, cell, at: 1000 }]);
    expect(e.pos).toBe(cell);
    const bot = freeExp(seed);
    expect(walk(bot, cell, () => undefined)).toEqual([]);
    expect(bot.wandererMeets).toBeUndefined();
    // 같은 시드면 우라하라 굴림이 원정 난수를 건드리지 않는다 (같은 칸 위치·적)
    expect(bot.pos).toBe(e.pos);
    expect(bot.battles.map((x) => x.enemyId)).toEqual(e.battles.map((x) => x.enemyId));
  });
  it('3바퀴째부터 3%: 여러 원정을 걸으면 3바퀴째 이후가 1~2바퀴보다 칸당 마주침이 잦다', () => {
    let early = 0;
    let late = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const e = freeExp(seed);
      e.maxLaps = 99;
      // 늘 '안 와 있음' + 매 걸음 16분씩 흘러 머무는 동안 막힘이 없게
      for (const m of walk(e, L * 5, (i) => ({ at: i * 16 * MIN, here: false }))) {
        if (m.lap >= 3) late++;
        else early++;
      }
    }
    // 1~2바퀴 = 2바퀴분 칸, 3~5바퀴 = 3바퀴분 칸 → 칸당 비율
    expect(late / 3).toBeGreaterThan((early / 2) * 1.8);
  });
});

describe('안 굴리는 때 (GDD 5-5)', () => {
  const { seed, cell } = meetingSeed();
  it('우라하라가 이미 와 있으면 안 굴림', () => {
    expect(walk(freeExp(seed), cell, () => ({ at: 1000, here: true }))).toEqual([]);
  });
  it('튜토리얼·스토리는 안 굴림', () => {
    const t = freeExp(seed);
    t.tutorial = true;
    expect(wandererRollable(t, { at: 1, here: false })).toBe(false);
    const st = freeExp(seed);
    st.story = { chapterId: 'c1', episodeId: 'e1', progress: 0, cleared: false, kills: 0, midShown: false, cue: null, bossResult: null };
    expect(wandererRollable(st, { at: 1, here: false })).toBe(false);
    expect(wandererRollable(freeExp(seed), { at: 1, here: false })).toBe(true);
  });
  it('이 원정에서 마주친 뒤 15분 동안은 화면이 here 를 늦게 알려도 안 굴리고, 15분 뒤에는 다시 굴린다', () => {
    const e = freeExp(seed);
    e.wandererMeets = [{ lap: 1, cell: 2, at: 0 }];
    expect(wandererRollable(e, { at: 15 * MIN - 1, here: false })).toBe(false);
    expect(wandererRollable(e, { at: 15 * MIN, here: false })).toBe(true);
  });
  it('탑·특수던전은 원정 걷기(advance)를 쓰지 않아 굴림이 없다 — 굴림은 advance 한 곳뿐', () => {
    const src = readFileSync('src/engine/expedition/expedition.ts', 'utf8');
    expect(src.match(/rollWandererMeet\(/g)).toHaveLength(1);
    expect(readFileSync('src/engine/tower.ts', 'utf8')).not.toContain('Wanderer');
  });
});

describe('15분 머묾 (GDD 5-5)', () => {
  it('마주친 순간부터 15분(실제 시각) 와 있고, 지나면 떠난다(런 로그 leave = 떠난 시각)', () => {
    const s = newSaveData('hollow', 1);
    const v = meetWanderer(s, { seed: 5, runId: 3 }, { lap: 4, cell: 7, at: 10 * MIN })!;
    expect(v.at).toBe(10 * MIN);
    expect(wandererLeaveAt(v)).toBe(25 * MIN);
    expect(s.runLog.wanderer.at(-1)).toEqual({ at: 10 * MIN, factionId: 'hollow', kind: 'arrive', tier: v.tier, runId: 3, lap: 4, cell: 7 });
    expect(wandererHere(s, 25 * MIN - 1)).toBe(true);
    expect(meetWanderer(s, { seed: 6, runId: 3 }, { lap: 4, cell: 8, at: 11 * MIN })).toBeNull(); // 와 있는 동안 또 안 온다
    expect(expireWanderer(s, 25 * MIN - 1)).toBe(false);
    expect(wandererHere(s, 25 * MIN)).toBe(false);
    expect(expireWanderer(s, 40 * MIN)).toBe(true);
    expect(s.shared.wanderer.visit).toBeNull();
    expect(s.runLog.wanderer.at(-1)).toMatchObject({ kind: 'leave', at: 25 * MIN, unsold: v.stock.length });
    // 떠난 뒤 다시 마주칠 수 있다
    expect(meetWanderer(s, { seed: 7, runId: 4 }, { lap: 1, cell: 1, at: 41 * MIN })).not.toBeNull();
  });
  it('원정 귀환은 와 있던 우라하라를 떠나보내지 않는다(15분 안), 귀환으로 오지도 않는다', () => {
    const s = newSaveData('hollow', 1);
    meetWanderer(s, { seed: 5, runId: 1 }, { lap: 1, cell: 3, at: 0 });
    const e = freeExp(9);
    Object.assign(e, { phase: 'ended', outcome: 'returned', endReason: 'returned', lapsCompleted: 30, wandererMeets: [{ lap: 1, cell: 3, at: 0 }] });
    recordExpedition(s, e, 5 * MIN);
    expect(s.shared.wanderer.visit).not.toBeNull();
    expect(s.runLog.runs.at(-1)!.wandererMeets).toEqual([{ lap: 1, cell: 3, at: 0 }]); // 런 로그 원정 기록 (16-2)
    const s2 = newSaveData('hollow', 1);
    const e2 = freeExp(9);
    Object.assign(e2, { phase: 'ended', outcome: 'returned', endReason: 'returned', lapsCompleted: 500 });
    recordExpedition(s2, e2, 1);
    expect(s2.shared.wanderer.visit).toBeNull();
  });
  it('남은 시간 칩 글 mm:ss (초 올림)', () => {
    const s = newSaveData('hollow', 1);
    meetWanderer(s, { seed: 5, runId: 1 }, { lap: 1, cell: 3, at: 0 });
    expect(wandererClock(wandererRemainingMs(s.shared.wanderer, 0))).toBe('15:00');
    expect(wandererClock(wandererRemainingMs(s.shared.wanderer, 1000))).toBe('14:59');
    expect(wandererClock(wandererRemainingMs(s.shared.wanderer, 14 * MIN - 500))).toBe('01:01');
    expect(wandererClock(wandererRemainingMs(s.shared.wanderer, 15 * MIN - 1))).toBe('00:01');
    expect(wandererRemainingMs(s.shared.wanderer, 16 * MIN)).toBe(0);
    expect(wandererHereAt(s.shared.wanderer, 15 * MIN)).toBe(false);
    expect(wandererStayMs()).toBe(15 * MIN);
  });
});

describe('확인 창·칩 화면 (GDD 5-5)', () => {
  it('확인 창 문구 = 데이터, 버튼 [확인 (5)] → 1초마다 줄고 0 이면 자동 확인', () => {
    expect(WANDERER_TEXT.meet).toBe('{name}과(와) 마주쳤습니다!');
    expect(autoYesLabel(WANDERER_TEXT.meetOk, WX.confirmSeconds)).toBe('확인 (5)');
    expect(autoYesLabel('확인', 1)).toBe('확인 (1)');
    const dlg = readFileSync('src/ui/confirmDialog.ts', 'utf8');
    expect(dlg).toContain('if (left <= 0) return yes();');
    const view = readFileSync('src/ui/expeditionView.ts', 'utf8');
    expect(view).toContain('autoYesSeconds: BALANCE.provisional.wanderer.confirmSeconds, onYes: resume, onCancel: resume');
    expect(view).toContain("WANDERER_TEXT.meet.replace('{name}', w.name)");
  });
  it('칩: 방·월드맵·시장·모험 준비는 누르면 시장 우라하라 창, 우라하라 창·모험(걷기·전투)은 표시만. 얼굴 = prop-wanderer 를 잘라 만든 그림', () => {
    const app = readFileSync('src/ui/app.ts', 'utf8');
    expect(app).toContain("const WCHIP_TAP = new Set(['room', 'worldmap', 'market', 'expedition-plan']);");
    expect(app).toContain("const WCHIP_SHOW = new Set([...WCHIP_TAP, 'wanderer', 'expedition']);");
    expect(app).toContain('window.setInterval(tickWandererChip, 1000);');
    expect(readFileSync('public/art/icon-wanderer-face.png').length).toBeGreaterThan(100);
    expect(readFileSync('src/ui/bha/wandererChip.ts', 'utf8')).toContain("artUrls('icon.wanderer.face'");
    // 새 색 없음 — 토큰만
    const css = readFileSync('src/ui/bha/market.css', 'utf8').split('\n').filter((l) => l.includes('wchip')).join('\n');
    expect(css).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
  });
  it('종족 분기 없음: 이름은 종족 설정 market.props.wanderer', () => {
    for (const f of ['src/ui/bha/wandererChip.ts', 'src/engine/wanderer.ts']) expect(readFileSync(f, 'utf8')).not.toMatch(/'hollow'|'shinigami'/);
  });
});

describe('세이브 형식 99 (C.549)', () => {
  it('98 → 99: lapsSince 지우고, 와 있던 방문은 지금부터 15분', () => {
    expect(SAVE_FORMAT_VERSION).toBe(99);
    expect(SAVE_MIGRATIONS[98]).toBeTypeOf('function');
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 1)));
    old.meta.format = 98;
    old.shared.wanderer = { lapsSince: 12, visit: { at: 5, runId: 2, tier: 2, stock: [{ itemId: 'w-calm-deep', price: 140, sold: false }] } };
    const before = Date.now();
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(99);
    expect('lapsSince' in m.shared.wanderer).toBe(false);
    expect(m.shared.wanderer.visit!.at).toBeGreaterThanOrEqual(before);
    expect(wandererHere(m, before + 14 * MIN)).toBe(true);
    const none = JSON.parse(JSON.stringify(newSaveData('hollow', 1)));
    none.shared.wanderer = { lapsSince: 3, visit: null };
    migrateWandererStay(none, 77);
    expect(none.shared.wanderer).toEqual({ visit: null });
  });
  it('원정 중간 저장: wandererMeets 를 저장·복원하고 깨진 값은 거른다', () => {
    const e = freeExp(3);
    e.wandererMeets = [{ lap: 1, cell: 4, at: 123 }];
    const snap = serializeExpedition(e, 1, 0)!;
    const r = restoreExpedition(JSON.parse(JSON.stringify(snap)));
    expect(r.ok && r.exp.wandererMeets).toEqual([{ lap: 1, cell: 4, at: 123 }]);
    const bad = JSON.parse(JSON.stringify(snap));
    bad.exp.wandererMeets = [{ lap: 1, cell: L, at: 1 }];
    expect(restoreExpedition(bad).ok).toBe(false);
  });
});
