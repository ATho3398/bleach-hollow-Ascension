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
import { el, mountApp } from './bha/dom';
import { infoTip } from './bha/infoTip';
import { homeHpMeter, liveStatusChips, paintStatusBox, statusInfoButton, statusNameTag } from './bha/statusBox';
import { showToast } from './bha/nest';
import { applyCarePose, characterButton, charTopOffset, roomCharArt, spaceBackButton } from './bha/room';
import { animOf } from './bha/animPlayer';
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
let live: { on: () => boolean; exit: (done: () => void) => boolean; holdFull: (eyebrow: string, go: () => void) => boolean } | null = null;
/** 가득 찬 뒤 온천 안에서 기다리는 시간 (GDD 180장 2, C.272): 노란 알림을 보여 주고 이만큼 뒤 방으로 — 화면 연출값이라 balance 밖 */
export const SPA_FULL_HOLD_MS = 2000;
/** 가득 찼을 때 온천 안 알림 문구 (GDD 180장 2, text-style 3: 한 줄 토스트 제목 — 마침표 없음) */
export const SPA_FULL_TEXT = '체력이 가득 찼다';
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

/**
 * 가득 찬 순간 (GDD 180장 2, C.272): 바로 방으로 보내지 않고 온천 화면 안에서 노란 알림(eyebrow = 종족 설정 온천 이름) + 캐릭터는 탕 안 그대로 →
 * SPA_FULL_HOLD_MS 뒤 go(방으로). [돌아가기]·✓ 를 누르면 바로 go. 방에 간 뒤에는 알림을 지운다(한 번만). 온천 화면이 없으면 false(바로 가면 된다)
 */
export function spaHoldFull(eyebrow: string, go: () => void): boolean {
  return live?.on() ? live.holdFull(eyebrow, go) : false;
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
  // 캐릭터 + 머리 위 상태 창: 오른쪽에서 걸어 들어와(그림은 왼쪽을 본다) 탕 안에 들어가 앉는다. 종이인형이면 걸을 때 걷기·앉으면 온천 자세(GDD 171장), 아니면 CSS 임시 연출
  const art = roomCharArt(room, faction.id, artTierIndexOf(save), artSkinOf(save));
  const char = characterButton(art, '캐릭터');
  char.disabled = true; // 보기만 (기기 선택 대상 아님)
  char.setAttribute('aria-hidden', 'true'); // 걸어 들어오는 장식 — 조작 요소가 아니다 (상태는 머리 위 상태 창이 읽힌다)
  char.classList.add('bha-spa__char');
  applyCarePose(char, { collapsed: n.collapsed, dead: false, weakened: n.weakened, tired: n.tired }); // 돌봄 상태 자세 (GDD 171장)
  const charAnim = animOf(char);
  /** 걷는 동안 = 걷기, 다 걸으면 = 자리면 온천 자세, 아니면 돌봄 상태 자세 그대로 (종이인형만 — 동작이 없으면 아무 것도 안 함) */
  const restLoop = charAnim?.has('dying') && (n.collapsed || n.weakened || n.tired) ? 'dying' : 'idle';
  // 머리 위 상태 박스 + 바깥 ⓘ · 발밑 체력 막대 = 방과 같은 부품·모양 (GDD 197장 4, statusBox — C.301 박스 · C.303 막대)
  const chipRow = el('div', 'bha-room__chips bha-spa__chips');
  const status = el('div', 'bha-room__status bha-spa__status');
  status.setAttribute('role', 'status');
  /** 지금 보이는 배부름·컨디션 (paint 가 갱신) — ⓘ 창도 이 값으로 */
  let shown = { fullness: fullnessOfNest(n), condition: n.condition };
  const statusInfoBtn = statusInfoButton(() => liveStatusChips(n, faction, shown), faction, n);
  chipRow.append(status, statusInfoBtn);
  const nameTag = statusNameTag(save, faction);
  const actor = el('div', 'bha-spa__actor is-entering');
  actor.append(chipRow, char);
  // 박스 아래 끝 = 그림 윗변 위 8px (방 room.css .bha-room__chips 와 같은 간격): 캐릭터 상자 윗변에서 그림 윗변까지(charTopOffset 은 상자 중심 기준)만큼 내린다
  requestAnimationFrame(() => {
    const dy = Math.max(0, charTopOffset(art) + char.offsetHeight / 2);
    if (char.offsetHeight) actor.style.setProperty('--bha-spa-head', `${Math.round(dy)}px`);
    clampStatus();
  });
  // 체력 막대는 장면 바로 아래(앞 물보다 위)에 두고 캐릭터 자리를 따라 옮긴다 — 액터 안에 두면 앞 물(z 2)에 가린다
  const hpBox = el('div', 'bha-room__hp bha-spa__hp');
  // 돌계단 (임시 도형): 계단 칸(물에 잠기는 칸, 자리 앞까지) 발 아래
  const stairs = SPA_PATH.slice(0, -1).filter((p) => p.wl !== null).map((p) => {
    const st = el('span', 'bha-spa__stair');
    st.style.left = `${p.left}%`;
    st.style.bottom = `${p.bottom - 3}%`;
    return st;
  });
  scene.append(el('div', 'bha-spa__water'), ...stairs, actor, el('div', 'bha-spa__front'), el('div', 'bha-spa__steam'), hpBox);
  // 물에 잠김 (사용자 2026-10-30 "몸에다가 물 들어가는 식으로 색 … 몸이랑 물 표면 나뉘는 느낌"): 앉으면 물 높이 아래 몸이 비쳐 보이고(CSS 마스크) 그 높이에 물결 띠
  // 물결 띠는 앞 반(몸 앞)·뒤 반(몸 뒤에 가려짐) 두 장 — 몸을 뚫고 뒤쪽 테두리가 보이지 않게
  const ripples = (['back', 'front'] as const).map((side) => {
    const r = el('span', `bha-spa__ripple bha-spa__ripple--${side}`);
    r.setAttribute('aria-hidden', 'true');
    return r;
  });
  char.append(...ripples);
  // 계단식 입수 (GDD 132장 4·137장 2): 매 프레임 경로 위 자리(left·bottom)를 옮기고, 물 잠김 높이(--bha-spa-wl)·물결 띠도 그 자리에 맞춘다
  // 렉 (GDD 186장 1, C.283): 몸 자리(offsetTop·Height)는 걷는 동안 안 바뀐다 — 매 프레임 쓰고 나서 읽으면 레이아웃을 강제로 다시 해 한 번만 재 둔다(크기가 바뀌면 다시)
  let bodyBox: { top: number; h: number } | null = null;
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => (bodyBox = null)).observe(char);
  let lastWl = '';
  const setWl = (wl: number | null) => {
    actor.classList.toggle('is-wading', wl !== null && wl < 1);
    if (wl === null || wl >= 1) return;
    const pct = `${Math.round(wl * 100)}%`;
    if (pct !== lastWl) actor.style.setProperty('--bha-spa-wl', (lastWl = pct));
    if (!bodyBox || !bodyBox.h) {
      const body = char.querySelector<HTMLElement>('.bha-char__body');
      bodyBox = body ? { top: body.offsetTop, h: body.offsetHeight } : null;
    }
    if (bodyBox) for (const r of ripples) r.style.top = `${bodyBox.top + bodyBox.h * wl}px`;
  };
  /** 머리 위 상태 박스(+ 오른쪽 바깥 ⓘ)·발밑 체력 막대가 LCD 끝에서 잘리지 않게 좌우로 민다 (캐릭터가 화면 안에 있을 때만 — 밖에서 걸어 들어오는 중엔 같이 움직인다) */
  const clampStatus = () => {
    const sw = scene.clientWidth;
    if (!sw) return;
    const cx = ((parseFloat(actor.style.left) || 0) / 100) * sw;
    const pad = 6;
    const shift = (left: number, right: number) => (cx < 0 || cx > sw ? 0 : Math.min(0, sw - pad - (cx + right)) + Math.max(0, pad - (cx - left)));
    const half = status.offsetWidth / 2;
    const dx = shift(half, half + statusInfoBtn.offsetWidth + 2);
    // 위 끝 하한 (방 C.281 과 같은 뜻): 박스+이름표가 장면 위로 나가면(상태이상 줄이 늘어 박스가 높을 때) 그만큼 아래로 — 머리와 겹쳐도 잘리지 않게
    const top = actor.offsetTop + chipRow.offsetTop - (nameTag ? nameTag.offsetHeight + 4 : 0);
    const dy = Math.max(0, pad - top);
    chipRow.style.translate = dx || dy ? `${Math.round(dx)}px ${Math.round(dy)}px` : '';
    const hh = hpBox.offsetWidth / 2;
    const hx = shift(hh, hh);
    hpBox.style.translate = hx ? `${Math.round(hx)}px 0` : '';
  };
  const put = (left: number, bottom: number, wl: number | null) => {
    actor.style.left = `${left}%`;
    actor.style.bottom = `${bottom}%`;
    hpBox.style.left = `${left}%`;
    hpBox.style.bottom = `${bottom}%`;
    setWl(wl);
    clampStatus();
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
    if (charAnim?.has('move')) charAnim.setLoop('move');
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
      if (charAnim) charAnim.setLoop(to === SPA_PATH.length - 1 && charAnim.has('bath') ? 'bath' : restLoop);
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

  // 방과 같은 상태 박스(배부름·컨디션·영압 안정도·리스크 + 상태이상 줄)·발밑 체력 막대 (GDD 197장 4) — 온천에서 오르내리는 배부름·컨디션·체력은 지금 값으로 (GDD 135장 2)
  const paint = (fraction: number, fullness: number, condition: number) => {
    shown = { fullness, condition };
    paintStatusBox(status, liveStatusChips(n, faction, shown), nameTag);
    hpBox.replaceChildren(homeHpMeter(fraction, maxHp));
    clampStatus();
  };
  { const p0 = previewHomeHp(n, Date.now()); paint(p0.fraction, fullnessOfNest(n), p0.condition); }

  // ── 왼쪽 위: [방으로 돌아가기] 작게 + ⓘ 쉬는 중 설명 ──
  /** 가득 찬 뒤 방으로 가기를 기다리는 중 (GDD 180장 2) — [돌아가기]·✓ = 바로 방으로 */
  let fullHold: { timer: number; go: () => void; toast: HTMLElement } | null = null;
  const clearFullHold = (): (() => void) | null => {
    if (!fullHold) return null;
    const h = fullHold;
    fullHold = null;
    window.clearTimeout(h.timer);
    // 방 위에 다시 보이지 않게 바로 감춘다 (퇴장 애니메이션은 그대로 돌아 칸이 비워진다)
    h.toast.style.visibility = 'hidden';
    h.toast.classList.remove('is-in');
    h.toast.classList.add('is-out');
    return h.go;
  };
  const backBtn = spaceBackButton(() => {
    const go = clearFullHold();
    if (go) go();
    else hd.onBack();
  }, hd.backLabel);
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
  hud.append(backBtn, infoBtn); // v2 S05: 왼쪽 위 [돌아가기] + ⓘ 만 (장소 이름 글자 없음 → 화면 이름은 aria-label)
  scene.append(hud);

  const app = mountApp(root, { cls: 'bha-spa bha-v2' }, scene);
  app.setAttribute('aria-label', name);
  backBtn.focus({ preventScroll: true });

  // 나가기 (GDD 132장 4): 앉은 자리에서 계단을 거꾸로 한 단씩 올라와 평지를 걸어 나간 뒤 done. 이미 나가는 중이면 아무것도 안 함
  const exit = (done: () => void): boolean => {
    if (!actor.isConnected) return false;
    if (exiting) return true;
    exiting = true;
    clearFullHold(); // 가득 알림을 기다리던 중이면 나가기 연출이 맡는다
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
  const holdFull = (eyebrow: string, go: () => void): boolean => {
    if (!actor.isConnected || exiting) return false;
    if (fullHold) return true;
    const toast = showToast({ eyebrow, title: SPA_FULL_TEXT, meta: '' }, 0, SPA_FULL_HOLD_MS);
    const timer = window.setTimeout(() => {
      const g = clearFullHold();
      if (g && app.isConnected) g();
    }, SPA_FULL_HOLD_MS);
    fullHold = { timer, go, toast };
    backBtn.focus({ preventScroll: true }); // ✓ = 바로 방으로
    return true;
  };
  live = { on: () => app.isConnected, exit, holdFull };

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
