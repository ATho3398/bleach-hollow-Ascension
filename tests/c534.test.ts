// C.534 (GDD 8-9 v6.194, 사용자 2026-11-24 "수련장에서 뒤로가기 눌러도 전투로 진입함. 그리고 그만두기하면 훈련 설정으로 돌아가고 거기서 뒤로가면 홈으로가게 해"):
// ① 수련장(훈련 인형 설정 창·빈 적 자리·[전투 들어가기] 화면) 뒤로 = 방 — 옛 코드는 설정 창 뒤로 = 창 닫기라 전투 화면(빈 적 자리)이 남았다
// ② 훈련 인형 전투 [그만두기] = 훈련 설정 창(빈 적 자리 + 적 설정 창) ③ 테스트 모드 전투(testModeArena)는 그대로(뒤로 = 창 닫기·일시정지, 그만두기 = 나가기)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ScreenStack } from '../src/ui/bha/select';
import { battleBackHook } from '../src/ui/bha/screenBack';
import { registerCancelHook, runCancelHooks } from '../src/ui/bha/shortcuts';

const read = (p: string) => readFileSync(p, 'utf8');

/** 화면 스택 + 기기 뒤로(열린 창 → 화면 처리기 → 화면 스택)를 흉내 낸다. 방 → 수련장 화면(밑에 깔림) → 훈련 인형 전투 */
function world() {
  const drawn: string[] = [];
  const nav = new ScreenStack();
  const screen = (id: string, locked = false, home = false) => ({ id, locked, home, render: () => { drawn.push(id); } });
  nav.reset(screen('room', false, true));
  nav.push(screen('practice'));
  nav.push(screen('practice-battle', true));
  const shown = () => drawn[drawn.length - 1];
  /** app.ts arenaBattle 의 leaveHome 과 같은 길 */
  const leaveHome = () => { if (!nav.popToHome()) nav.pop(); };
  /** 빈 적 자리 전투 한 판: battleView 처럼 battleBackHook 을 건다 — back 이 있으면(수련장) 일시정지 대신 멈추고 방으로 */
  const battle = (back?: () => void) => {
    const st = { stopped: false, paused: false };
    registerCancelHook(battleBackHook({
      connected: () => shown() === 'practice-battle', stopped: () => st.stopped, stop: () => { st.stopped = true; },
      busy: () => st.paused,
      pause: () => { st.paused = true; },
      ...(back ? { leave: back } : {}),
    }), { button: true });
    return st;
  };
  /** 기기 뒤로: 열린 창(layer)이 있으면 그 창의 취소, 없으면 화면 처리기 → 화면 스택 */
  const back = (layer?: () => void) => {
    if (layer) layer();
    else if (!runCancelHooks(null, true)) nav.cancel();
    return shown();
  };
  return { nav, drawn, shown, leaveHome, battle, back };
}

describe('① 수련장 뒤로 = 방', () => {
  it('ScreenStack.popToHome: 홈까지 빼고 홈만 다시 그린다 (밑에 깐 수련장 화면은 그리지 않음)', () => {
    const w = world();
    w.drawn.length = 0;
    expect(w.nav.popToHome()).toBe(true);
    expect(w.drawn).toEqual(['room']);
    expect(w.nav.size).toBe(1);
    expect(w.nav.popToHome()).toBe(false); // 이미 홈뿐
    const n = new ScreenStack();
    n.reset({ id: 'title', render: () => undefined });
    n.push({ id: 'x', render: () => undefined });
    expect(n.popToHome()).toBe(false); // 맨 아래가 홈이 아니면 손대지 않는다
    expect(n.size).toBe(2);
  });

  it('설정 창이 열린 채 뒤로 = 방 (창 닫기로 전투 화면이 남지 않는다)', () => {
    const w = world();
    const st = w.battle(w.leaveHome);
    expect(w.back(w.leaveHome)).toBe('room');
    expect(w.back()).toBe('room'); // 떠난 전투의 처리기는 지워지고 뒤로를 삼키지 않는다 (방 = 처음 화면 확인 쪽)
    expect(st.paused).toBe(false);
  });

  it('[창 닫기] 뒤 빈 적 자리에서 뒤로 = 방 (일시정지 아님), 전투는 멈춘다', () => {
    const w = world();
    const st = w.battle(w.leaveHome);
    expect(w.back()).toBe('room');
    expect(st).toEqual({ stopped: true, paused: false });
  });

  it('수련장 화면([전투 들어가기]) 뒤로 = 방', () => {
    const w = world();
    w.battle(w.leaveHome);
    w.nav.pop(); // 설정 창 [나가기] = 수련장 화면 (기존 결정 그대로)
    expect(w.shown()).toBe('practice');
    expect(w.back()).toBe('room');
  });

  it('테스트 모드처럼 back 이 없으면 빈 자리 뒤로 = 일시정지 그대로', () => {
    const w = world();
    const st = w.battle();
    expect(w.back()).toBe('practice-battle');
    expect(st.paused).toBe(true);
    st.stopped = true;
    runCancelHooks(null, true); // 등록 정리
  });
});

describe('② 화면 연결 (app·battleView·testModeArena·confirmDialog)', () => {
  const app = read('src/ui/app.ts');
  const battle = read('src/ui/battleView.ts');
  const arena = read('src/ui/testModeArena.ts');
  const confirm = read('src/ui/confirmDialog.ts');

  it('훈련 인형만 practice: true — 테스트 모드 전투는 안 켠다', () => {
    expect(app.match(/practice: true/g)?.length).toBe(1);
    const prac = app.slice(app.indexOf('function practiceArena('), app.indexOf('// ── 등급전'));
    expect(prac).toContain('practice: true');
  });

  it('그만두기 = 훈련 설정 창(round(null)), 테스트 모드 = 나가기(nav.pop) 그대로', () => {
    expect(app).toContain('onQuit: () => { closeDialog?.(); if (run.practice) round(null); else nav.pop(); },');
  });

  it('설정 창 뒤로·빈 자리 뒤로 = leaveHome (홈까지 빼기)', () => {
    expect(app).toContain('const leaveHome = (): void => { if (!nav.popToHome()) nav.pop(); };');
    expect(app).toContain('...(run.practice ? { onBack: leaveHome } : {}),');
    expect(app).toContain('...(run.practice ? { back: leaveHome } : {})');
    expect(arena).toContain('...(h.onBack ? { onCancel: h.onBack } : {}),');
    expect(confirm).toContain('cancel ? () => { close(); cancel(); } : no');
    expect(battle).toContain('...(opts.emptyFoe?.back ? { leave: opts.emptyFoe.back } : {}),');
  });

  it('종족 분기 없음', () => {
    const changed = [app.slice(app.indexOf('function arenaBattle('), app.indexOf('// ── 등급전')), arena, confirm];
    for (const src of changed) expect(src).not.toMatch(/faction(Id)? === '(hollow|shinigami)'/);
  });
});
