// C.133 (S-23, GDD 82장): 돌봄 요청제 — 쓰다듬기·재우기는 캐릭터가 청했을 때만 효과, 아니면 거절 말풍선
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS } from '../src/data/factions';
import { ROOM_TALK, roomOf } from '../src/engine/faction';
import { doNestAction, newNest, respondCare, tickCareRequest } from '../src/engine/nest';
import { emptyRunLog } from '../src/engine/runLog';
import { careNest, migrateSave, MIN_LOADABLE_SAVE_FORMAT, newSaveData, SAVE_FORMAT_VERSION, tickCare } from '../src/game';
import { careTalkKey } from '../src/ui/bha/roomLogic';

const CR = BALANCE.provisional.nest.careRequest;
const MIN = 60_000;
const T0 = 1_000_000;

describe('82장 요청 시계', () => {
  it('새 둥지는 요청 없음, 첫 요청은 firstDelayMinutes 뒤', () => {
    const n = newNest(T0);
    expect(n.careRequest).toBeNull();
    expect(n.nextCareAt).toBe(T0 + CR.firstDelayMinutes * MIN);
    expect(tickCareRequest(n, n.nextCareAt - 1)).toEqual({ created: false, missed: false });
    expect(n.careRequest).toBeNull();
  });
  it('시각이 지나면 요청 하나가 holdMinutes 동안 유지되고, 놓치면 벌칙 없이 사라진다', () => {
    const n = newNest(T0);
    const at = n.nextCareAt;
    expect(tickCareRequest(n, at, () => 0.9).created).toBe(true);
    expect(n.careRequest).toEqual({ action: 'pet', until: at + CR.holdMinutes * MIN });
    const before = { ...n };
    expect(tickCareRequest(n, at + CR.holdMinutes * MIN, () => 0.5)).toEqual({ created: false, missed: true });
    expect(n.careRequest).toBeNull();
    expect([n.hunger, n.condition, n.risk, n.stability]).toEqual([before.hunger, before.condition, before.risk, before.stability]);
    const gap = n.nextCareAt - (at + CR.holdMinutes * MIN);
    expect(gap).toBeGreaterThanOrEqual(CR.intervalMinutes[0] * MIN);
    expect(gap).toBeLessThanOrEqual(CR.intervalMinutes[1] * MIN);
  });
  it('오래 꺼 두었다 와도 요청은 최대 1개 (지금부터 유지 시간)', () => {
    const n = newNest(T0);
    tickCareRequest(n, n.nextCareAt);
    const later = T0 + 48 * 60 * MIN;
    const r = tickCareRequest(n, later, () => 0.9);
    expect(r).toEqual({ created: true, missed: true });
    expect(n.careRequest!.until).toBe(later + CR.holdMinutes * MIN);
    expect(tickCareRequest(n, later + 1).created).toBe(false);
  });
  it('피곤이거나 컨디션이 낮으면 재우기를 청한다, 아니면 sleepWeight 로 고른다', () => {
    const weak = { ...newNest(T0), tired: true }; // C.175: 피곤(GDD 102-2)이면 재우기
    tickCareRequest(weak, weak.nextCareAt, () => 0.99);
    expect(weak.careRequest!.action).toBe('sleep');
    const tired = { ...newNest(T0), condition: CR.sleepBelowCondition - 1 };
    tickCareRequest(tired, tired.nextCareAt, () => 0.99);
    expect(tired.careRequest!.action).toBe('sleep');
    const ok = newNest(T0);
    tickCareRequest(ok, ok.nextCareAt, () => CR.sleepWeight - 0.01);
    expect(ok.careRequest!.action).toBe('sleep');
  });
});

describe('82장 응답·거절', () => {
  const withRequest = (action: 'pet' | 'sleep') => {
    const n = { ...newNest(T0), condition: 50 };
    n.careRequest = { action, until: T0 + 10 * MIN };
    return n;
  };
  it('요청이 없으면 거절 — 효과 없음', () => {
    const n = { ...newNest(T0), condition: 50, weakened: true };
    const before = JSON.stringify(n);
    expect(respondCare(n, 'sleep', T0)).toBe('refused');
    expect(respondCare(n, 'pet', T0)).toBe('refused');
    expect(JSON.stringify(n)).toBe(before);
  });
  it('다른 것을 청했으면 거절 — 요청은 남는다', () => {
    const n = withRequest('pet');
    expect(respondCare(n, 'sleep', T0)).toBe('refused');
    expect(n.careRequest!.action).toBe('pet');
    expect(n.condition).toBe(50);
  });
  it('유지 시간이 지난 요청에는 응답할 수 없다', () => {
    expect(respondCare(withRequest('pet'), 'pet', T0 + 10 * MIN)).toBe('refused');
  });
  it('같은 요청이면 응답 — 지금 수치 그대로 효과, 요청은 풀리고 다음 시각을 새로 잡는다', () => {
    for (const a of ['pet', 'sleep'] as const) {
      const n = withRequest(a);
      const want = { ...withRequest(a) };
      doNestAction(want, a);
      expect(respondCare(n, a, T0 + MIN, () => 0)).toBe('answered');
      expect([n.condition, n.risk, n.stability, n.weakened]).toEqual([want.condition, want.risk, want.stability, want.weakened]);
      expect(n.careRequest).toBeNull();
      expect(n.nextCareAt).toBe(T0 + MIN + CR.intervalMinutes[0] * MIN);
    }
  });
});

describe('82장 런 로그·세이브', () => {
  it('런 로그 care 에 응답·거절·놓침을 센다', () => {
    expect(emptyRunLog().care).toEqual({ answered: { pet: 0, sleep: 0 }, refused: { pet: 0, sleep: 0 }, missed: 0 });
    const s = newSaveData('hollow', T0);
    expect(careNest(s, 'pet', T0)).toBe('refused');
    tickCare(s, s.nest.nextCareAt, () => 0.9); // pet 요청
    expect(careNest(s, 'sleep', s.nest.nextCareAt)).toBe('refused');
    expect(careNest(s, 'pet', s.nest.nextCareAt)).toBe('answered');
    const t = s.nest.nextCareAt;
    tickCare(s, t, () => 0.9);
    tickCare(s, t + CR.holdMinutes * MIN);
    expect(s.runLog.care).toEqual({ answered: { pet: 1, sleep: 0 }, refused: { pet: 1, sleep: 1 }, missed: 1 });
  });
  it('세이브 형식 38(이후 C.134 에 39) · 최소 형식 같이 올림 (61장, 마이그레이션 없음)', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(38);
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(54); // C.198: 문턱 54 고정, 형식은 마이그레이션으로 (GDD 123장 6)
  });
  it('요청 상태가 저장·불러오기로 남고, 깨진 값은 버린다', () => {
    const s = newSaveData('hollow', T0);
    s.nest.careRequest = { action: 'sleep', until: T0 + 5 * MIN };
    s.runLog.care.answered.pet = 3;
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.nest.careRequest).toEqual({ action: 'sleep', until: T0 + 5 * MIN });
    expect(m.runLog.care.answered.pet).toBe(3);
    const bad = JSON.parse(JSON.stringify(s));
    bad.nest.careRequest = { action: 'feed', until: 'x' };
    bad.runLog.care = { answered: { pet: -1 } };
    const b = migrateSave(bad)!;
    expect(b.nest.careRequest).toBeNull();
    expect(b.runLog.care).toEqual({ answered: { pet: 0, sleep: 0 }, refused: { pet: 0, sleep: 0 }, missed: 0 });
  });
});

describe('82장 문구·화면', () => {
  it('두 종족 모두 요청·거절 말풍선을 종족 설정 room.talk 에 가진다', () => {
    for (const k of ['askPet', 'askSleep', 'refusePet', 'refuseSleep'] as const) expect(ROOM_TALK).toContain(k);
    for (const f of FACTIONS) {
      const talk = f.room?.talk ?? {};
      for (const k of ['askPet', 'askSleep', 'refusePet', 'refuseSleep'] as const) expect(talk[k]?.length, `${f.id} ${k}`).toBeGreaterThan(0);
      expect(roomOf(f).talk.refuseSleep.length).toBeGreaterThan(0);
    }
    expect(FACTIONS.find((f) => f.id === 'hollow')!.room!.talk!.refuseSleep).toContain('자고 싶지 않다.');
    expect(careTalkKey('ask', 'pet')).toBe('askPet');
    expect(careTalkKey('refuse', 'sleep')).toBe('refuseSleep');
  });
  it('방 화면: 쓰다듬기·재우기는 careNest 로, 요청은 독 버튼 강조, 종족 분기 없음', () => {
    const room = readFileSync('src/ui/roomView.ts', 'utf8');
    expect(room).toContain('careNest(save, action)');
    expect(room).toContain('tickCare(save)');
    expect(room).toContain("careTalkKey('refuse', action)");
    expect(room).toContain('dock.setRequest(');
    expect(room).not.toContain('doNestAction');
    expect(room).not.toMatch(/faction\.id === '(hollow|shinigami)'/);
    expect(readFileSync('src/ui/bha/dock.ts', 'utf8')).toContain("'is-requested'");
    expect(readFileSync('src/ui/bha/room.css', 'utf8')).toMatch(/\.bha-homedock__carebtn\.is-requested \{[^}]*var\(--c\)/);
  });
});
