import { describe, expect, it } from 'vitest';
import { IDLE, RESUME_COUNTDOWN_S, rotateStep, type RotateEvent, type RotateState } from '../src/ui/bha/rotateResume';

function run(events: RotateEvent[], inGame = true) {
  let state: RotateState = IDLE;
  const effects: (string | null)[] = [];
  for (const e of events) {
    const r = rotateStep(state, e, inGame);
    state = r.state;
    effects.push(r.effect);
  }
  return { state, effects };
}

describe('세로 전환 멈춤·가로 복귀 카운트다운', () => {
  it('전투·원정 중 세로로 돌리면 멈추고, 가로로 돌아오면 3초 뒤 이어한다', () => {
    expect(RESUME_COUNTDOWN_S).toBe(3);
    const r = run(['portrait', 'landscape', 'tick', 'tick', 'tick']);
    expect(r.effects).toEqual(['hold', null, null, null, 'release']);
    expect(r.state).toEqual(IDLE);
  });

  it('게임 화면이 아니면 세로로 돌려도 아무 일 없다', () => {
    expect(run(['portrait'], false)).toEqual({ state: IDLE, effects: [null] });
  });

  it('세는 중에 다시 세로로 돌리면 멈춤으로 돌아가고, 취소하면 멈춘 채 대기한다', () => {
    expect(run(['portrait', 'landscape', 'tick', 'portrait']).state).toEqual({ phase: 'portrait' });
    const c = run(['portrait', 'landscape', 'cancel', 'tick', 'landscape']);
    expect(c.state).toEqual({ phase: 'manual' });
    expect(c.effects.filter((x) => x === 'release')).toHaveLength(0);
  });

  it('[계속]은 어느 멈춤 상태에서든 바로 재개한다', () => {
    for (const evs of [['portrait'], ['portrait', 'landscape'], ['portrait', 'landscape', 'cancel']] as RotateEvent[][]) {
      const r = run([...evs, 'resume']);
      expect(r.effects.at(-1)).toBe('release');
      expect(r.state).toEqual(IDLE);
    }
    expect(run(['resume']).effects).toEqual([null]);
  });
});
