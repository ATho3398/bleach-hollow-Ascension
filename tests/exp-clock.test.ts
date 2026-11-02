import { describe, expect, it } from 'vitest';
import { createExpClock } from '../src/ui/bha/expClock';
import { ENCOUNTER_DELAY_MS, ENCOUNTER_WATCHDOG_MS, watchdogAction } from '../src/ui/bha/expedition';

/** 가짜 시계·타이머: advance(ms) 로 시간을 흘린다 */
function fakeTime() {
  let t = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => {
      const id = ++seq;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimer: (id: unknown) => void timers.delete(id as number),
    advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        t = next[1].at;
        next[1].fn();
      }
      t = end;
    },
  };
}

function setup() {
  const ft = fakeTime();
  const st = { speed: 1, paused: false };
  const clock = createExpClock({ speed: () => st.speed, blocked: () => st.paused, now: ft.now, setTimer: ft.setTimer, clearTimer: ft.clearTimer });
  return { ft, st, clock };
}

describe('원정 시계 (19-1 조우 후 멈춤 회귀)', () => {
  it('조우 대기 중 배속을 바꿔도 전투 진입 예약이 사라지지 않는다 (옛 버그: 배속 버튼이 예약을 지웠다)', () => {
    const { ft, st, clock } = setup();
    let entered = 0;
    clock.set('phase', ENCOUNTER_DELAY_MS, () => entered++);
    ft.advance(300);
    st.speed = 4; // 배속 버튼
    clock.rearm();
    expect(clock.pending()).toBe('phase');
    const left = (ENCOUNTER_DELAY_MS - 300) / 4; // 남은 시간(1x) ÷ 4 (C.202: 조우 시간 0.7 → 1.5초)
    ft.advance(left - 1);
    expect(entered).toBe(0);
    ft.advance(1);
    expect(entered).toBe(1);
    expect(clock.pending()).toBeNull();
  });

  it('조우 대기 중 일시정지 → 재개하면 남은 시간 뒤 전투로 넘어간다 (일시정지 중에는 넘어가지 않는다)', () => {
    const { ft, st, clock } = setup();
    let entered = 0;
    clock.set('phase', ENCOUNTER_DELAY_MS, () => entered++);
    ft.advance(200);
    st.paused = true;
    clock.rearm();
    ft.advance(10_000);
    expect(entered).toBe(0);
    expect(clock.armed()).toBe(false);
    st.paused = false;
    clock.rearm();
    ft.advance(ENCOUNTER_DELAY_MS - 200 - 1);
    expect(entered).toBe(0);
    ft.advance(1);
    expect(entered).toBe(1);
  });

  it('휴식 중 배속·도움말(멈춤)을 거쳐도 휴식 끝이 실행된다', () => {
    const { ft, st, clock } = setup();
    let done = 0;
    clock.set('phase', 10_000, () => done++);
    st.speed = 2;
    clock.rearm();
    st.paused = true; // 도움말 열림
    clock.rearm();
    ft.advance(60_000);
    st.paused = false;
    clock.rearm();
    ft.advance(5_000);
    expect(done).toBe(1);
  });

  it('멈춤 신호를 놓쳐 타이머가 멈춤 중에 울려도 할 일을 버리지 않고, 풀리면 바로 실행한다', () => {
    const { ft, st, clock } = setup();
    let n = 0;
    clock.set('step', 1000, () => n++);
    st.paused = true; // rearm 없이 멈춤 (신호 누락)
    ft.advance(2000);
    expect(n).toBe(0);
    expect(clock.pending()).toBe('step');
    st.paused = false;
    clock.rearm();
    ft.advance(0);
    expect(n).toBe(1);
  });

  it('set 은 이전 할 일을 바꾸고 cancel 은 버린다', () => {
    const { ft, clock } = setup();
    const log: string[] = [];
    clock.set('step', 100, () => log.push('a'));
    clock.set('phase', 100, () => log.push('b'));
    ft.advance(200);
    clock.set('step', 100, () => log.push('c'));
    clock.cancel();
    ft.advance(200);
    expect(log).toEqual(['b']);
  });
});

describe('감시 타이머 판단 (19-1 안전장치)', () => {
  const base = { blocked: false, pending: 'phase' as const, armed: true, encounterWaitMs: 0 };
  it('조우 뒤 멈추지 않은 시간이 한도를 넘으면 전투로 들어간다', () => {
    expect(ENCOUNTER_WATCHDOG_MS).toBe(3000);
    expect(watchdogAction({ ...base, phase: 'battle', encounterWaitMs: 2999 })).toBe('none');
    expect(watchdogAction({ ...base, phase: 'battle', encounterWaitMs: 3000 })).toBe('enter-battle');
  });
  it('전투 진입 예약이 사라졌으면 바로 들어가고, 타이머만 풀려 있으면 다시 건다', () => {
    expect(watchdogAction({ ...base, phase: 'battle', pending: null })).toBe('enter-battle');
    expect(watchdogAction({ ...base, phase: 'battle', armed: false })).toBe('resume');
  });
  it('멈춤 중(일시정지·확인창·세로 전환)에는 아무것도 하지 않는다', () => {
    expect(watchdogAction({ ...base, phase: 'battle', blocked: true, pending: null, encounterWaitMs: 99_999 })).toBe('none');
  });
  it('이동·휴식은 예약이 없거나 안 걸려 있으면 다시 건다, 둥지 선택·흡수·끝은 그대로', () => {
    expect(watchdogAction({ ...base, phase: 'moving', pending: 'step' })).toBe('none');
    expect(watchdogAction({ ...base, phase: 'moving', pending: null })).toBe('resume');
    expect(watchdogAction({ ...base, phase: 'rest', armed: false })).toBe('resume');
    for (const phase of ['nest-choice', 'absorb', 'ended'] as const) expect(watchdogAction({ ...base, phase, pending: null })).toBe('none');
  });
});
