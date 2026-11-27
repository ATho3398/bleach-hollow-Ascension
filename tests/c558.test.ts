// C.558 (GDD 5-5 v6.239 '마주침 연출', 사용자 2026-11-27 "아 걍 우라하라 알림창 없애고, 그냥 우라하라는 배경쪽에 서있다가 우리가 지나가면 인사하는 모션 취한다음,
// 모험 결산 페이지에 우라하라 왔다는 15분짜리 타이머 보여주는거로 하자."):
// 마주침 확인 창(C.549)·창 꾸밈(C.553) 폐기 → 걷기 화면 배경 쪽에서 우라하라가 흘러와 캐릭터 앞에서 인사(숙이기 2번 + '어이~'), 걷기는 안 멈춤.
// 모험 결산(결과 화면·도중 귀환 카드)에 얼굴 + '우라하라가 시장에 왔다' + 남은 시간(1초마다), 0 이면 '우라하라가 떠났다'
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { WANDERER_TEXT } from '../src/data/shop';
import { PASS, passTiming } from '../src/ui/bha/wandererPass';
import { wandererResultText } from '../src/ui/bha/wandererChip';

const read = (p: string): string => readFileSync(p, 'utf8');
const view = read('src/ui/expeditionView.ts');
const app = read('src/ui/app.ts');
const enc = read('src/ui/bha/encounter.css');
const market = read('src/ui/bha/market.css');
// 걷기 장면 646×360(LCD), 캐릭터 가운데 68%·칸 키 53%
const G = { sceneW: 646, sceneH: 360, walkerX: 646 * 0.68, walkerHalf: 95, figH: 0.53, speed: 1 };

describe('C.558 걷기 화면 인사 연출 (시간표)', () => {
  it('키 = 캐릭터 칸의 0.8배(조금 작게), 그림 비율 그대로 · 왼쪽 밖에서 오른쪽 밖까지', () => {
    const t = passTiming(G);
    expect(t.h).toBeCloseTo(360 * 0.53 * 0.8, 5);
    expect(t.w / t.h).toBeCloseTo(168 / 342, 5);
    expect(t.fromX).toBe(-t.w);
    expect(t.toX).toBe(646);
  });
  it('빠르기 = 땅(장면 높이 50%/초)의 0.8배 — 배속만큼 빨라짐', () => {
    const t = passTiming(G);
    const v = 360 * 0.5 * 0.8;
    expect(t.passMs).toBeCloseTo(((646 + t.w) / v) * 1000, 3);
    expect(passTiming({ ...G, speed: 2 }).passMs).toBeCloseTo(t.passMs / 2, 3);
  });
  it('인사는 캐릭터 바로 앞(왼쪽)에 왔을 때 — 숙이기·말풍선 한가운데에 우라하라가 캐릭터 왼쪽 끝보다 왼쪽', () => {
    const t = passTiming(G);
    const xAt = (ms: number) => t.fromX + ((t.toX - t.fromX) * ms) / t.passMs;
    const mid = t.bowAt + PASS.bowMs / 2;
    expect(t.sayAt + PASS.sayMs / 2).toBeCloseTo(mid, 5); // 말풍선·숙이기 한가운데가 같다
    const right = xAt(mid) + t.w;
    expect(right).toBeLessThan(G.walkerX - G.walkerHalf); // 캐릭터와 겹치기 전
    expect(right).toBeGreaterThan(G.walkerX - G.walkerHalf - t.w); // 멀지 않다(우라하라 폭 안)
    expect(xAt(t.sayAt)).toBeGreaterThan(0); // 말풍선이 뜰 때 이미 화면 안
    expect(PASS.bowMs).toBe(600);
  });
});

describe('C.558 마주침 = 창 없음, 걷기 안 멈춤', () => {
  it('확인 창·자동 확인·그림 창 선택·확인 초 수치가 없다', () => {
    const dlg = read('src/ui/confirmDialog.ts');
    expect(dlg).not.toMatch(/autoYes|figure/);
    expect(read('src/ui/bha/components/components.css')).not.toContain('bha-modal--figure');
    expect(market).not.toContain('bha-wmeet');
    expect('confirmSeconds' in BALANCE.provisional.wanderer).toBe(false);
    const meet = view.slice(view.indexOf('if (met && w) {'), view.indexOf('go();', view.indexOf('if (met && w) {')));
    expect(meet).toContain('w.onMeet(met);');
    expect(meet).toContain('GREET_DUE.add(exp);');
    expect(meet).not.toMatch(/confirmDialog|clock\.cancel|away = true/);
  });
  it('인사는 걷는 칸(move)에서만 — 전투·휴식 칸이면 다음 걷는 칸(전투 뒤 화면을 다시 만들어도 모듈 WeakSet 에 남음), 원정 끝이면 지움', () => {
    expect(view).toContain('const GREET_DUE = new WeakSet<ExpeditionState>();');
    expect(view).toContain('if (GREET_DUE.delete(exp)) passWanderer(walk.el, walk.walker, speed);');
    const move = view.slice(view.indexOf("case 'move':"), view.indexOf("case 'battle':"));
    expect(move).toContain('passWanderer');
    expect(view.slice(view.indexOf("case 'ended':"), view.indexOf("case 'ended':") + 80)).toContain('GREET_DUE.delete(exp);');
  });
  it('문구 = 데이터 (인사·결산 두 줄), 옛 창 문구 없음', () => {
    expect(WANDERER_TEXT.greet).toBe('어이~');
    expect(WANDERER_TEXT.resultHere).toBe('{name}이(가) 시장에 왔다');
    expect(WANDERER_TEXT.resultGone).toBe('{name}이(가) 떠났다');
    expect(Object.keys(WANDERER_TEXT).sort()).toEqual(['chipLabel', 'greet', 'resultGone', 'resultHere']);
  });
  it('CSS: 캐릭터 뒤 먼 줄, 걷기가 멈추면 같이 멈춤, 도트 뒤집어 캐릭터 쪽, 움직임 줄이기 = 숙이기 없이 말풍선만', () => {
    expect(enc).toMatch(/\.bha-passer \{[^}]*bottom: 16%; z-index: 0;/);
    expect(enc).toContain('.bha-walk:not(.is-walking) .bha-passer:not(.is-still)');
    expect(enc).toMatch(/\.bha-passer__fig \{[^}]*image-rendering: pixelated;[^}]*transform: scaleX\(-1\);/);
    expect(enc).toMatch(/@keyframes bha-passer-bow \{[^}]*0%, 50%, 100% \{ transform: scaleX\(-1\); \}/);
    expect(enc).toContain('.bha-exp .bha-passer.is-still .bha-passer__say { opacity: 1; animation: none; }');
    expect(enc).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.bha-passer__fig \{ animation: none; \}/);
    // 말풍선 = 걷기 화면 머리 위 말풍선 부품
    expect(read('src/ui/bha/wandererPass.ts')).toContain("el('p', 'bha-exp__msg bha-passer__say', WANDERER_TEXT.greet)");
  });
});

describe('C.558 모험 결산 우라하라 한 줄', () => {
  it('남아 있으면 이름 + 왔다 + mm:ss, 0 이면 떠났다(시간 없음)', () => {
    expect(wandererResultText('우라하라', 15 * 60_000)).toEqual({ text: '우라하라가 시장에 왔다', time: '15:00' });
    expect(wandererResultText('우라하라', 61_000)).toEqual({ text: '우라하라가 시장에 왔다', time: '01:01' });
    expect(wandererResultText('우라하라', 0)).toEqual({ text: '우라하라가 떠났다', time: null });
    expect(wandererResultText('키스케', 1000).text).toBe('키스케가 시장에 왔다');
  });
  it('보이는 때 = 이번 모험에서 마주쳤거나 지금 와 있을 때. 결과 화면·도중 귀환 카드 둘 다, 남은 시간은 실제 시각으로', () => {
    expect(app).toContain('(exp.wandererMeets?.length ?? 0) > 0 || wandererHere(ws)');
    expect(app).toContain('remainingMs: () => wandererRemainingMs(ws.shared.wanderer, Date.now())');
    expect(app).toContain('}, growth, resultWanderer);');
    expect(app).toContain('wandererResultLine(resultWanderer.name, resultWanderer.remainingMs)');
    expect(read('src/ui/resultView.ts')).toContain('right.append(...(storyBox ? [storyBox] : []), ...(wline ? [wline] : []), sum);');
  });
  it('결산 화면에서는 머리 줄 칩을 빼서 시계가 하나 (다른 화면 칩은 그대로)', () => {
    expect(app).toContain("const resultLine = !!root.querySelector('[data-wanderer-result]');");
    expect(app).toContain("const WCHIP_TAP = new Set(['room', 'worldmap', 'market', 'expedition-plan']);");
  });
  it('CSS 토큰만 (새 색 없음), 종족 분기 없음', () => {
    const css = market.slice(market.indexOf('/* 모험 결산 우라하라 한 줄'));
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    const passCss = enc.slice(enc.indexOf('/* 우라하라 마주침 연출'), enc.indexOf('@media (prefers-reduced-motion'));
    expect(passCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    for (const f of ['src/ui/bha/wandererPass.ts', 'src/ui/bha/wandererChip.ts']) expect(read(f)).not.toMatch(/hollow|shinigami|factionId ===/);
  });
});
