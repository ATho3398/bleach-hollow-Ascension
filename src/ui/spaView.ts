// 온천 화면 (GDD 123장 4, C.198): 월드맵 [온천](GDD 153장 1 — 옛 장터 안 칸)으로 들어오는 따로 된 공간. 들어와 있는 동안 1초에 체력 +10%·컨디션 +10·배부름 −1 (GDD 139장 2) (앱을 꺼도 유지),
// 체력 상한(빈사면 10%)이나 배부름 0 이면 저절로 방으로. 뒤로·[방으로 돌아가기] = 나오기.
// C.201 (GDD 128장 6): 화면 전체가 온천 장면, 캐릭터가 걸어 들어와 탕에 앉는다, [방으로 돌아가기]·ⓘ(쉬는 중 설명) = 왼쪽 위 작게, 체력·배부름 = 방처럼 머리 위 상태 창.
// 배경 그림 키 scene.spa·온천 모션은 사용자 그림 대기 — 없으면 임시 배경(탕 도형)과 CSS 임시 연출(몸 아래쪽을 물이 가림). 이름은 종족 설정 worldmap.spaName(월드맵 장소, GDD 153장 1).
import { BALANCE } from '../config/balance';
import { fixParticles } from '../engine/josa';
import { artUrls } from '../data/art/manifest';
import type { FactionConfig } from '../engine/faction';
import { fullnessOfNest, previewHomeHp, spaRateOf, type SpaEnd } from '../engine/nest';
import { artSkinOf, type SaveData, artTierIndexOf } from '../game';
import { homeMaxHp } from '../home';
import { beginAction, beginSceneMove } from './bha/actionFx';
import { hpNumbers } from './bha/battle';
import { button, el, icon, mountApp } from './bha/dom';
import { infoTip } from './bha/infoTip';
import { characterButton, roomCharArt, spaceBackButton } from './bha/room';
import { roomOf, worldMapOf } from '../engine/faction';

const BASE = import.meta.env.BASE_URL;
/** 막대 다시 그리기·저절로 나오기 확인 간격 */
const SPA_TICK_MS = 100; // 온천은 10초에 가득이라 막대가 눈에 보이게 차오르도록 촘촘히 (GDD 139장 2)
/**
 * 계단식 입수 (GDD 132장 4, C.208 → 137장 2, C.215): 오른쪽 밖에서 평지를 걸어와(walk) 탕 가장자리 돌부터 계단 경로를 따라 멈칫 없이 쭉 내려가고
 * (단과 단 사이는 대각선, 물 잠김도 이어서 깊어짐) 자리에 앉는다. 나갈 때는 거꾸로 쭉 올라온다. 자리 = 캐릭터 가운데 x(%)·발 높이 bottom(%), wl = 몸 위에서 물 높이 비율(없으면 물 밖). 화면 연출값이라 balance 밖
 */
/** 앉았을 때 물 높이 = 몸 상자 위에서 이 비율 (spa.css --bha-spa-wl 기본값과 같은 값) */
const SPA_WATERLINE = 0.66;
export const SPA_PATH: readonly { left: number; bottom: number; wl: number | null }[] = [
  { left: 112, bottom: 30, wl: null }, // 화면 밖 (오른쪽)
  { left: 82, bottom: 30, wl: null }, // 탕 가장자리 돌 앞까지 평지
  { left: 74, bottom: 26, wl: 0.9 }, // 1단
  { left: 66, bottom: 22, wl: 0.8 }, // 2단
  { left: 58, bottom: 19, wl: 0.72 }, // 3단
  { left: 50, bottom: 16, wl: SPA_WATERLINE }, // 자리 (앉기)
];
/** 평지 걷기 시간 · 한 단 내려가는 시간 (단마다 멈칫 없음, GDD 137장 2) */
const SPA_WALK_MS = 1200;
export const SPA_STEP_MS = 300;
/** 지금 떠 있는 온천 화면 (튜토리얼 체력 차오름·나가기 연출을 바깥에서 부른다) */
let live: { on: () => boolean; exit: (done: () => void) => boolean } | null = null;
let spaTimer = 0;

export interface SpaHandlers {
  /** [방으로 돌아가기] — 뒤로와 같다(나오기는 화면 스택 beforeBack 이 한다) */
  onBack: () => void;
  /** [돌아가기] 이름 (시장에서 들어왔으면 '시장으로 돌아가기', GDD 130장 3). 없으면 '방으로 돌아가기' */
  backLabel?: string;
  /** 시간이 흘러 저절로 나올 때가 됐다 (체력 상한·배부름 0): 부르는 쪽이 tickIdle 로 실제 반영·기록하고 방으로 */
  onAutoLeave: (e: SpaEnd) => void;
}

/** 온천에서 나온 까닭 한 줄 (알림 띠·튜토리얼이 같이 쓴다) */
export function spaEndText(e: Pick<SpaEnd, 'reason' | 'hpTo'>, fullnessName: string): string {
  if (e.reason === 'full') return `체력과 컨디션이 다 찼다 (체력 ${Math.round(e.hpTo * 100)}%). 방으로 돌아왔다.`;
  if (e.reason === 'hungry') return fixParticles(`${fullnessName}이(가) 바닥나 방으로 돌아왔다.`);
  return '방으로 돌아왔다.';
}

/** 쉬는 동안 줄 (GDD 145장 1): 가득까지 1분 이상이면 1분 단위, 아니면 1초 단위 — 평소 온천 약 20초(GDD 164장 1)·튜토리얼 온천 10초 둘 다 지금은 1초 단위 */
export function spaRateLines(r: { hpPerSecond: number; conditionPerSecond: number; fullnessPerSecond: number }, fullnessName: string): string[] {
  const full = 0.99 / r.hpPerSecond;
  const fmt = (v: number) => String(Math.round(v * 10) / 10);
  const perMin = full >= 60;
  const k = perMin ? 60 : 1;
  return [
    `${perMin ? '1분' : '1초'}에 체력 +${fmt(r.hpPerSecond * k * 100)}% · 컨디션 +${fmt(r.conditionPerSecond * k)} · ${fullnessName} −${fmt(r.fullnessPerSecond * k)}`,
    `체력 1% → 가득 약 ${perMin ? `${Math.ceil(full / 60)}분` : `${Math.ceil(full)}초`}`,
    '앱을 꺼도 계속 쉰다',
  ];
}

/** 온천에서 나가는 연출 (GDD 132장 4): 화면이 떠 있으면 계단을 거꾸로 올라와 걸어 나간 뒤 done 을 부르고 true. 없으면 false(바로 나가면 된다) */
export function spaExitFx(done: () => void): boolean {
  return live?.on() ? live.exit(done) : false;
}

export function spaView(root: HTMLElement, faction: FactionConfig, save: SaveData, hd: SpaHandlers): void {
  const room = roomOf(faction, save.wear.talk);
  const name = worldMapOf(faction).places.spa;
  const n = save.nest;
  const maxHp = homeMaxHp(save);

  // ── 장면 = 화면 전체 (GDD 128장 6): 배경 그림(scene.spa)이 없으면 임시 탕 + 김 ──
  const scene = el('div', 'bha-spa__scene');
  const bg = artUrls('scene.spa', BASE).src;
  if (bg) {
    const img = el('img', 'bha-spa__bg') as HTMLImageElement;
    img.src = bg;
    img.alt = '';
    scene.append(img);
    scene.classList.add('has-art');
  }
  // 캐릭터 + 머리 위 상태 창: 오른쪽에서 걸어 들어와(그림은 왼쪽을 본다) 탕 안에 들어가 앉는다 — 온천 모션 그림은 사용자 대기, 지금은 CSS 임시 연출
  const art = roomCharArt(room, faction.id, artTierIndexOf(save), artSkinOf(save));
  const char = characterButton(art, '캐릭터');
  char.disabled = true; // 보기만 (기기 선택 대상 아님)
  char.setAttribute('aria-hidden', 'true'); // 걸어 들어오는 장식 — 조작 요소가 아니다 (상태는 머리 위 상태 창이 읽힌다)
  char.classList.add('bha-spa__char');
  if (n.collapsed) char.classList.add('is-collapsed');
  const status = el('div', 'bha-room__status bha-spa__status');
  status.setAttribute('role', 'status');
  const actor = el('div', 'bha-spa__actor is-entering');
  actor.append(status, char);
  // 돌계단 (임시 도형): 계단 칸(물에 잠기는 칸, 자리 앞까지) 발 아래
  const stairs = SPA_PATH.slice(0, -1).filter((p) => p.wl !== null).map((p) => {
    const st = el('span', 'bha-spa__stair');
    st.style.left = `${p.left}%`;
    st.style.bottom = `${p.bottom - 3}%`;
    return st;
  });
  scene.append(el('div', 'bha-spa__water'), ...stairs, actor, el('div', 'bha-spa__front'), el('div', 'bha-spa__steam'));
  // 물에 잠김 (사용자 2026-10-30 "몸에다가 물 들어가는 식으로 색 … 몸이랑 물 표면 나뉘는 느낌"): 앉으면 물 높이 아래 몸이 비쳐 보이고(CSS 마스크) 그 높이에 물결 띠
  // 물결 띠는 앞 반(몸 앞)·뒤 반(몸 뒤에 가려짐) 두 장 — 몸을 뚫고 뒤쪽 테두리가 보이지 않게
  const ripples = (['back', 'front'] as const).map((side) => {
    const r = el('span', `bha-spa__ripple bha-spa__ripple--${side}`);
    r.setAttribute('aria-hidden', 'true');
    return r;
  });
  char.append(...ripples);
  // 계단식 입수 (GDD 132장 4·137장 2): 매 프레임 경로 위 자리(left·bottom)를 옮기고, 물 잠김 높이(--bha-spa-wl)·물결 띠도 그 자리에 맞춘다
  const setWl = (wl: number | null) => {
    actor.classList.toggle('is-wading', wl !== null && wl < 1);
    if (wl === null || wl >= 1) return;
    actor.style.setProperty('--bha-spa-wl', `${Math.round(wl * 100)}%`);
    const body = char.querySelector<HTMLElement>('.bha-char__body');
    if (body) for (const r of ripples) r.style.top = `${body.offsetTop + body.offsetHeight * wl}px`;
  };
  const put = (left: number, bottom: number, wl: number | null) => {
    actor.style.left = `${left}%`;
    actor.style.bottom = `${bottom}%`;
    setWl(wl);
  };
  const goTo = (i: number) => {
    const p = SPA_PATH[i]!;
    put(p.left, p.bottom, p.wl);
  };
  actor.style.setProperty('--bha-spa-t', '0ms'); // 자리는 프레임마다 직접 옮긴다 (CSS 전환 없음)
  let pathRaf = 0;
  /** 들고 나는 연출이 끝나면 부른다 — 그동안 튜토리얼 안내 창은 안 뜬다 (GDD 143장 1) */
  let endMove: () => void = () => {};
  /** from → to 자리까지 경로를 따라 쭉 (평지 = 걷기, 계단 = 단 사이 대각선, 멈칫 없음 — GDD 137장 2). 끝나면 done, 중간에 화면이 바뀌어 끊기면 cut */
  const walkPath = (from: number, to: number, done: () => void, cut?: () => void) => {
    const dir = to > from ? 1 : -1;
    const segs: { a: number; b: number; ms: number }[] = [];
    for (let i = from; i !== to; i += dir) {
      const flat = SPA_PATH[i]!.wl === null && SPA_PATH[i + dir]!.wl === null; // 화면 밖 ↔ 돌 앞 = 평지 걷기
      segs.push({ a: i, b: i + dir, ms: flat ? SPA_WALK_MS : SPA_STEP_MS });
    }
    if (segs.length === 0) return done();
    actor.classList.add('is-walking');
    const t0 = performance.now();
    const frame = (now: number) => {
      if (!actor.isConnected) return cut ? cut() : endMove();
      let t = now - t0;
      for (const sg of segs) {
        if (t <= sg.ms) {
          const k = Math.max(0, t / sg.ms);
          const A = SPA_PATH[sg.a]!;
          const B = SPA_PATH[sg.b]!;
          const wa = A.wl ?? 1;
          const wb = B.wl ?? 1;
          const wl = A.wl === null && B.wl === null ? null : wa + (wb - wa) * k;
          put(A.left + (B.left - A.left) * k, A.bottom + (B.bottom - A.bottom) * k, wl);
          pathRaf = requestAnimationFrame(frame);
          return;
        }
        t -= sg.ms;
      }
      goTo(to);
      actor.classList.remove('is-walking');
      done();
    };
    pathRaf = requestAnimationFrame(frame);
  };
  const SEAT = SPA_PATH.length - 1;
  let seated = false;
  const onSeated: Array<() => void> = [];
  goTo(0);
  endMove = beginSceneMove();
  requestAnimationFrame(() => walkPath(0, SEAT, () => {
    endMove();
    actor.classList.remove('is-entering', 'is-walking');
    actor.classList.add('is-seated');
    seated = true;
    onSeated.splice(0).forEach((f) => f());
  }));
  let exiting = false;

  // 머리 위 상태 창 (방 상태 칩과 같은 모양): 체력 '현재 / 최대' · 배부름
  const gauge = (kind: string, ic: string, pct: number, text: string, danger: boolean) => {
    const row = el('span', `bha-room__gauge bha-room__gauge--${kind}${danger ? ' is-danger' : ''}`);
    const fill = el('span', 'bha-room__gaugefill');
    fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    const track = el('span', 'bha-room__gaugetrack');
    track.append(fill);
    row.append(icon(ic), track, el('span', 'bha-room__gaugenum bha-num', text));
    return row;
  };
  // 컨디션도 온천에서 오른다 (GDD 135장 2)
  const paint = (fraction: number, fullness: number, condition: number) => {
    const { now, max } = hpNumbers(fraction * maxHp, maxHp);
    status.setAttribute('aria-label', `체력 ${now} / ${max}, 컨디션 ${Math.round(condition)}, ${faction.fullnessName} ${Math.round(fullness)}`);
    status.replaceChildren(
      gauge('hp', 'i-heal', fraction * 100, `${now} / ${max}`, fraction < 0.3),
      gauge('cond', 'i-cond', condition, String(Math.round(condition)), condition <= 30),
      gauge('hunger', 'i-hunger', fullness, String(Math.round(fullness)), fullness <= 20),
    );
  };
  { const p0 = previewHomeHp(n, Date.now()); paint(p0.fraction, fullnessOfNest(n), p0.condition); }

  // ── 왼쪽 위: [방으로 돌아가기] 작게 + ⓘ 쉬는 중 설명 ──
  const backBtn = spaceBackButton(hd.onBack, hd.backLabel);
  const dyingPct = Math.round(BALANCE.provisional.nest.care.dying.hpFraction * 100);
  const infoBtn = infoTip('쉬는 중', () => ({
    lead: `${name}에서 쉬는 중이다.`,
    groups: [
      { title: '쉬는 동안', lines: spaRateLines(spaRateOf(n.spa), faction.fullnessName) },
      { title: '저절로 나올 때', lines: [fixParticles(`체력과 컨디션이 둘 다 다 차거나 ${faction.fullnessName}이(가) 0 이 되면 방으로 돌아간다`)] },
      ...(n.collapsed ? [{ title: '빈사', lines: [`체력은 ${dyingPct}% 까지만 찬다`, '구급상자로 풀어야 더 찬다'] }] : []),
    ],
  }));
  const hud = el('div', 'bha-spa__hud');
  hud.append(backBtn, infoBtn, el('span', 'bha-spa__name', name));
  scene.append(hud);

  const app = mountApp(root, { cls: 'bha-spa' }, scene);
  backBtn.focus({ preventScroll: true });

  // 나가기 (GDD 132장 4): 앉은 자리에서 계단을 거꾸로 한 단씩 올라와 평지를 걸어 나간 뒤 done. 이미 나가는 중이면 아무것도 안 함
  const exit = (done: () => void): boolean => {
    if (!actor.isConnected) return false;
    if (exiting) return true;
    exiting = true;
    cancelAnimationFrame(pathRaf);
    endMove(); // 들어오던 중이면 그 연출은 여기서 끝
    endMove = beginSceneMove();
    const end = beginAction();
    actor.classList.remove('is-seated', 'is-entering');
    actor.classList.add('is-leaving'); // 오른쪽(들어온 쪽)을 보고 나간다
    // 아직 걸어 들어오는 중이면 지금 자리(가장 가까운 칸)에서 거꾸로
    const nowLeft = parseFloat(actor.style.left) || SPA_PATH[SEAT]!.left;
    const from = SPA_PATH.reduce((b, p, i) => (Math.abs(p.left - nowLeft) < Math.abs(SPA_PATH[b]!.left - nowLeft) ? i : b), SEAT);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      end();
      done();
      endMove(); // 방으로 넘어간 뒤 — 다음 안내 창은 방 위에 바로 고정해서 뜬다
    };
    // 나가는 도중 화면이 바뀌어도(다른 길로 방에 감) done 은 꼭 부른다 — 안 부르면 튜토리얼 회복 안내가 6/7 에서 멈췄다 (GDD 155장 2)
    walkPath(from, 0, finish, finish);
    return true;
  };
  live = { on: () => app.isConnected, exit };

  // 시간이 흐르는 동안 상태 창을 다시 그리고, 저절로 나올 때가 되면 부르는 쪽에 알린다 (한 번만)
  window.clearInterval(spaTimer);
  let done = false;
  const tick = spaTimer = window.setInterval(() => {
    if (!app.isConnected || done) return window.clearInterval(tick);
    const p = previewHomeHp(n, Date.now());
    paint(p.fraction, p.fullness, p.condition);
    // 걸어 나가는 중이면 저절로 나오기를 부르지 않는다 — 나가기 연출이 끝나면 부른 쪽이 나온다 (GDD 155장 2: 튜토리얼 온천이 빨라 나가는 도중 가득 차 방으로 끊겼다)
    if (exiting) return;
    if (p.spaEnded || !n.spa) {
      done = true;
      window.clearInterval(tick);
      // 앱의 1분 시계(tickIdle)가 먼저 나오게 했으면 미리 보기 결과가 없다 — 지금 값으로 까닭만 채운다
      const now = Date.now();
      hd.onAutoLeave(p.spaEnded ?? { at: now, minutes: 0, hpFrom: p.fraction, hpTo: p.fraction, fullnessFrom: p.fullness, fullnessTo: p.fullness, reason: p.fullness <= 1e-9 ? 'hungry' : 'full' });
    }
  }, SPA_TICK_MS);
}
