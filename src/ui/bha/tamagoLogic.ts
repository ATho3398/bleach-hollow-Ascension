// 다마고치 모드 순수 계산 (GDD 27장, S-17 C.62): 브라우저 저장 설정·줌아웃 배치·키링 진자 물리·기울기 → 중력 방향·뒷면 기록 판 글.
// DOM 없이 테스트한다 (tests/c62.test.ts). 화면은 tamago.ts. 종족 무관 — 이름은 종족 설정·세이브에서 받는다.
//
// 좌표: 모두 "기기 안 좌표"(논리 px, viewport.ts 의 toLocal 과 같은 틀). 기기 왼쪽 위 (0,0), 오른쪽 +x, 아래 +y.
// 각도: CSS rotate 와 같은 방향(시계 방향 +). 0 = 기기 아래쪽으로 곧게 매달림. 매단 점에서 끝까지의 벡터는 (−L·sinθ, L·cosθ).

import { rebirthStars } from '../../engine/rebirth';
import { dateText } from './photo';

// ── 설정 (세이브 아님, 이 기기 브라우저에만) ──
export const TAMAGO_KEY = 'bha-tamago';
export const TAMAGO_EVENT = 'bha-tamago-change';

export interface TamagoPrefs {
  /** 다마고치 모드(줌아웃) 켬 */
  on: boolean;
  /** [기울기로 흔들기] (기본 꺼짐) */
  tilt: boolean;
}

export const DEFAULT_TAMAGO: TamagoPrefs = { on: false, tilt: false };

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function parseTamagoPrefs(text: string | null | undefined): TamagoPrefs {
  const out = { ...DEFAULT_TAMAGO };
  if (!text) return out;
  try {
    const r: unknown = JSON.parse(text);
    if (typeof r === 'object' && r !== null) {
      const o = r as Record<string, unknown>;
      if (typeof o.on === 'boolean') out.on = o.on;
      if (typeof o.tilt === 'boolean') out.tilt = o.tilt;
    }
  } catch {
    /* 깨진 값은 기본 */
  }
  return out;
}

export function loadTamagoPrefs(storage: Store | null | undefined): TamagoPrefs {
  try {
    return parseTamagoPrefs(storage?.getItem(TAMAGO_KEY));
  } catch {
    return { ...DEFAULT_TAMAGO };
  }
}

export function saveTamagoPrefs(storage: Store | null | undefined, p: TamagoPrefs): TamagoPrefs {
  try {
    storage?.setItem(TAMAGO_KEY, JSON.stringify(p));
  } catch {
    /* 저장이 막혀도 이번 실행 동안은 켠 상태로 */
  }
  return p;
}

// ── 줌아웃 배치 ──
/** 기본 기기(CSS 몸체)의 치수 (논리 px) */
export const BODY = {
  /** 지금 기기(화면+버튼) 둘레의 몸체 두께 */
  pad: 26,
  /** 고리: 몸체 왼쪽 위 모서리에서 바깥으로 비스듬히 나온 거리, 고리 반지름 */
  ringOut: 8,
  ringR: 11,
  /** 키링이 차지하는 폭(흔들림 여유 포함)·길이 */
  charmW: 50,
  charmL: 84,
  /** 몸체 아래 조작 줄([뒤집기]·[확대]) 높이와 틈 */
  ctrlGap: 10,
  ctrlH: 40,
  /** 화면을 다 채우지 않게 남기는 여유 (1 = 꽉) */
  fill: 0.96,
  /** 이보다 크게는 키우지 않는다: "조금 더 멀리서 본" 느낌이 나게 */
  maxZoom: 0.82,
  /** 핀치·휠로 더 줄일 수 있는 가장 작은 실제 배율 (C.63, GDD 28장 1번: 0.70 → 0.40) */
  minScale: 0.4,
  /** 옆면 두께 (C.63, GDD 28장 2번): 뒤집을 때 보이는 몸체 두께 띠 */
  edge: 18,
} as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TamaLayout {
  /** 몸체 (지금 기기 상자 둘레) */
  body: Rect;
  /** 고리 가운데 = 키링을 매다는 점 (앞면). 뒷면은 좌우가 바뀐 자리(ringBack) */
  ring: { x: number; y: number };
  ringBack: { x: number; y: number };
  /** 조작 줄 */
  ctrl: Rect;
  /** 보여야 하는 전체 상자 */
  box: Rect;
  /** 줌 배율 */
  zoom: number;
  /** 기기 transform 뒤에 붙일 줌 (기기 원점 기준) */
  stage: string;
}

/**
 * 줌아웃 배치: 기기 상자(0,0,w,h) 둘레에 몸체·고리·키링·조작 줄을 두고, 그 전체가 기기 크기(w×h) 안에 들어가게 줄여 가운데에 놓는다.
 * art = 기기 디자인 그림을 입었을 때 그 그림의 상자·고리(기기 안 좌표) — 없으면 CSS 몸체.
 */
export function tamaLayout(w: number, h: number, art?: { box: Rect; ring: { x: number; y: number } } | null, flipDeg = 0, view: TamaView = VIEW_HOME): TamaLayout {
  const B = BODY;
  const body: Rect = art ? art.box : { x: -B.pad, y: -B.pad, w: w + 2 * B.pad, h: h + 2 * B.pad };
  const ring = art ? art.ring : { x: body.x - B.ringOut, y: body.y - B.ringOut };
  const ringBack = { x: r2(body.x + body.w - (ring.x - body.x)), y: ring.y };
  const ctrl: Rect = { x: body.x, y: body.y + body.h + B.ctrlGap, w: body.w, h: B.ctrlH };
  // 키링은 고리 아래(가로 기기) 또는 고리 오른쪽(세로로 돌려 놓은 기기: 화면 아래 = 기기 +x)으로 늘어진다 — 두 방향·앞뒤 고리 모두 상자에 넣는다
  // (뒤집어도 줌이 그대로이도록)
  const rx0 = Math.min(ring.x, ringBack.x), rx1 = Math.max(ring.x, ringBack.x);
  const x0 = Math.min(body.x, rx0 - B.charmW / 2 - B.ringR);
  const y0 = Math.min(body.y, ring.y - B.charmW / 2 - B.ringR);
  const x1 = Math.max(body.x + body.w, rx1 + B.charmL);
  const y1 = Math.max(ctrl.y + ctrl.h, ring.y + B.charmL);
  const box: Rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const zoom = round4(Math.min(B.maxZoom, Math.min(w / box.w, h / box.h) * B.fill));
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // 뒤집기 각도는 늘 넣는다 (0도라도): 줌아웃 상태끼리 변환 함수 목록이 같아야 rotateY 가 매끄럽게 이어진다
  const flip = ` perspective(${Math.round(Math.max(w, h) * 3)}px) rotateY(${flipDeg}deg)`;
  // 사용자 확대(핀치·휠)는 같은 함수 목록 안에서 배율·이동만 바꾼다 (전환이 매끄럽게)
  const v = clampView(view, zoom, box, w, h);
  const stage = `translate(${r2(w / 2 + v.px)}px, ${r2(h / 2 + v.py)}px) scale(${round4(zoom * v.uz)})${flip} translate(${r2(-cx)}px, ${r2(-cy)}px)`;
  return { body, ring, ringBack, ctrl, box, zoom, stage };
}

/**
 * 기기 디자인 그림의 놓는 자리 (모양 자유, GDD 27장 v5.33): 그림 대비 % 의 화면 구멍(screen) 안에 지금 LCD(lcd, 기기 안 좌표)가 들어가도록
 * 그림 크기를 정한다 — 구멍이 LCD 를 다 덮는 가장 작은 배율, 비율이 다르면 LCD 를 구멍 가운데에. 버튼 4개 누름 영역·고리도 기기 안 좌표로 바꾼다.
 * natural = 그림 실제 크기(px)
 */
export function deviceArtPlacement<B extends string>(
  lcd: Rect, natural: { w: number; h: number }, spec: { screen: Rect; ring: { x: number; y: number }; buttons: Record<B, Rect> },
): { box: Rect; ring: { x: number; y: number }; hole: Rect; buttons: Record<B, Rect> } {
  const nw = Math.max(1, natural.w), nh = Math.max(1, natural.h);
  const holeW = nw * (spec.screen.w / 100), holeH = nh * (spec.screen.h / 100);
  const k = Math.max(lcd.w / holeW, lcd.h / holeH); // 그림 1px → 기기 안 px
  const hx = nw * (spec.screen.x / 100) * k, hy = nh * (spec.screen.y / 100) * k;
  // 구멍 가운데 = LCD 가운데
  const x = lcd.x + lcd.w / 2 - (hx + (holeW * k) / 2);
  const y = lcd.y + lcd.h / 2 - (hy + (holeH * k) / 2);
  const W = nw * k, Hh = nh * k;
  const at = (r: Rect): Rect => ({ x: r2(x + W * (r.x / 100)), y: r2(y + Hh * (r.y / 100)), w: r2(W * (r.w / 100)), h: r2(Hh * (r.h / 100)) });
  const buttons = Object.fromEntries(Object.entries(spec.buttons).map(([b, r]) => [b, at(r as Rect)])) as Record<B, Rect>;
  return { box: { x: r2(x), y: r2(y), w: r2(W), h: r2(Hh) }, ring: { x: r2(x + W * (spec.ring.x / 100)), y: r2(y + Hh * (spec.ring.y / 100)) }, hole: at(spec.screen), buttons };
}

// ── 다마고치 모드 안 확대·축소 (핀치·휠·끌기, GDD 27장 v5.33) ──
/** 사용자 확대 배율 uz(1 = 기기 전체가 들어오는 크기)와 이동(기기 안 px). 최대 = 평소 확대 화면 정도(1 / 줌아웃 배율) */
export interface TamaView {
  uz: number;
  px: number;
  py: number;
}
export const VIEW_HOME: TamaView = { uz: 1, px: 0, py: 0 };

/** 사용자 배율 uz 의 아래 끝: 실제 배율(zoom × uz)이 BODY.minScale 까지 (C.63). 기본 줌아웃이 이미 그보다 작으면 1 */
export function minViewZoom(zoom: number): number {
  return round4(Math.min(1, BODY.minScale / Math.max(0.01, zoom)));
}

/** 배율·이동을 허용 범위로: 배율 minViewZoom ~ 1/zoom(실제 배율 0.40 ~ 평소 화면), 이동은 확대된 기기가 화면 밖으로 빠져나가지 않을 만큼 */
export function clampView(v: TamaView, zoom: number, box: Rect, w: number, h: number): TamaView {
  const uz = Math.min(Math.max(1, 1 / Math.max(0.01, zoom)), Math.max(minViewZoom(zoom), Number.isFinite(v.uz) ? v.uz : 1));
  const s = zoom * uz;
  const mx = Math.max(0, (box.w * s - w) / 2);
  const my = Math.max(0, (box.h * s - h) / 2);
  const c = (n: number, m: number) => r2(Math.min(m, Math.max(-m, Number.isFinite(n) ? n : 0)));
  return { uz: round4(uz), px: c(v.px, mx), py: c(v.py, my) };
}

/**
 * 핀치·휠로 배율을 바꾼다: 손가락(또는 마우스) 아래 점(기기 안 좌표, 화면 가운데 기준 at)이 그대로 있도록 이동도 같이 고친다.
 * factor = 새 배율 / 옛 배율 (핀치 = 두 손가락 거리 비)
 */
export function zoomAt(v: TamaView, factor: number, at: { x: number; y: number }, zoom: number, box: Rect, w: number, h: number): TamaView {
  const next = clampView({ ...v, uz: v.uz * factor }, zoom, box, w, h);
  const k = next.uz / v.uz;
  return clampView({ uz: next.uz, px: at.x - (at.x - v.px) * k, py: at.y - (at.y - v.py) * k }, zoom, box, w, h);
}

/** 휠 한 칸 → 배율 비 (위로 굴리면 확대) */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-Math.max(-400, Math.min(400, deltaY)) * 0.0015);
}

// ── 키링 진자 (감쇠 진자 2마디: 줄 + 장식) ──
export interface Pendulum {
  /** 줄 각도·각속도 (rad, rad/s) */
  a1: number;
  w1: number;
  /** 장식 각도·각속도 */
  a2: number;
  w2: number;
}

export const PHYS = {
  /** 고정 한 걸음 (s) */
  dt: 1 / 120,
  /** 한 프레임에 많아야 이만큼만 따라잡는다 (탭이 오래 멈췄다 돌아왔을 때) */
  maxFrame: 0.1,
  /** 중력 세기 (g/L, 1/s²): 줄·장식 */
  k1: 38,
  k2: 26,
  /** 줄–장식 연결 세기 */
  kc: 30,
  /** 감쇠 (1/s) */
  c1: 1.5,
  c2: 2.0,
  /** 기울기 없이(바닥에 눕힘) 중력이 거의 0일 때도 남기는 최소 세기 */
  minG: 0.2,
  /** 탭 한 번 충격 (rad/s), 끌기 1px 당 충격 */
  tap: 5.5,
  drag: 0.06,
  /** 모션 줄이기: 충격 배율·흔들림 최대 (rad) */
  reducedKick: 0.35,
  reducedMax: 0.22,
  /** 이 아래면 쉰다 (rad, rad/s) */
  restA: 0.003,
  restW: 0.01,
} as const;

export const restingAt = (phi: number): Pendulum => ({ a1: phi, w1: 0, a2: phi, w2: 0 });

/** 중력 벡터(기기 안 좌표, 크기 0~1) → 매달려 쉬는 각도 */
export function restAngle(g: { x: number; y: number }): number {
  return Math.atan2(-g.x, g.y);
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** dt 초만큼 진행 (내부는 고정 걸음). g = 중력(기기 안 좌표), reduced = 모션 줄이기 */
export function stepPendulum(s: Pendulum, g: { x: number; y: number }, dt: number, reduced = false): Pendulum {
  const phi = restAngle(g);
  const m = Math.max(PHYS.minG, Math.min(1, Math.hypot(g.x, g.y)));
  let { a1, w1, a2, w2 } = s;
  let left = Math.min(PHYS.maxFrame, Math.max(0, dt));
  while (left > 1e-9) {
    const h = Math.min(PHYS.dt, left);
    left -= h;
    const d1 = wrap(a1 - phi);
    const d2 = wrap(a2 - phi);
    const rel = wrap(a2 - a1);
    const al1 = -PHYS.k1 * m * Math.sin(d1) - PHYS.c1 * w1 + PHYS.kc * 0.35 * rel;
    const al2 = -PHYS.k2 * m * Math.sin(d2) - PHYS.c2 * w2 - PHYS.kc * rel;
    w1 += al1 * h;
    w2 += al2 * h;
    a1 += w1 * h;
    a2 += w2 * h;
    if (reduced) {
      // 모션 줄이기: 쉬는 각도에서 reducedMax 넘게는 안 흔들린다 (넘으면 그 자리에서 멈춘다)
      const lim = PHYS.reducedMax;
      const e1 = wrap(a1 - phi);
      if (Math.abs(e1) > lim) { a1 = phi + Math.sign(e1) * lim; w1 = 0; }
      const e2 = wrap(a2 - phi);
      if (Math.abs(e2) > lim) { a2 = phi + Math.sign(e2) * lim; w2 = 0; }
    }
  }
  return { a1, w1, a2, w2 };
}

/** 충격 (탭·끌기): v = 각속도 변화 (rad/s, + = 시계 방향). 장식은 조금 더 크게 받는다 */
export function kick(s: Pendulum, v: number, reduced = false): Pendulum {
  const k = reduced ? PHYS.reducedKick : 1;
  return { a1: s.a1, w1: s.w1 + v * k, a2: s.a2, w2: s.w2 + v * k * 1.3 };
}

/** 탭한 자리(매단 점 기준 가로 위치, 기기 안 px)로 충격 방향을 정한다: 오른쪽을 치면 왼쪽으로 밀려 시계 방향(+) */
export function tapKick(dx: number): number {
  return (dx >= 0 ? 1 : -1) * PHYS.tap;
}

/** 쉬는 중인가 (다 멈췄으면 그리기 고리를 멈춘다) */
export function isResting(s: Pendulum, g: { x: number; y: number }): boolean {
  const phi = restAngle(g);
  return Math.abs(wrap(s.a1 - phi)) < PHYS.restA && Math.abs(wrap(s.a2 - phi)) < PHYS.restA && Math.abs(s.w1) < PHYS.restW && Math.abs(s.w2) < PHYS.restW;
}

// ── 기울기 → 중력 ──
const DEG = Math.PI / 180;

/**
 * 기기 방향 센서(DeviceOrientationEvent 의 beta·gamma, 도) + 화면 회전 각(screen.orientation.angle, 도) → 화면 좌표의 중력(아래 +y, 크기 0~1).
 * 폰 좌표의 중력 = (sinγ·cosβ, sinβ) (화면 아래 +). 브라우저가 화면을 돌려 놓았으면(가로 폰) 그만큼 되돌린다.
 */
export function screenGravity(beta: number, gamma: number, screenAngle = 0): { x: number; y: number } {
  const dx = Math.sin(gamma * DEG) * Math.cos(beta * DEG);
  const dy = Math.sin(beta * DEG);
  const a = screenAngle * DEG;
  return { x: r4(dx * Math.cos(a) + dy * Math.sin(a)), y: r4(-dx * Math.sin(a) + dy * Math.cos(a)) };
}

/** 화면 좌표의 방향 → 기기 안 좌표 (GDD 16-6: 세로 폰에서 기기를 시계 방향 90도 돌려 놓았으면 화면 아래 = 기기 +x) */
export function toDeviceVec(v: { x: number; y: number }, rotated: boolean): { x: number; y: number } {
  return rotated ? { x: v.y, y: -v.x || 0 } : { x: v.x, y: v.y };
}

/** 기울기를 안 쓸 때의 중력: 화면 아래 */
export function defaultGravity(rotated: boolean): { x: number; y: number } {
  return toDeviceVec({ x: 0, y: 1 }, rotated);
}

/** 센서 값 흔들림을 누그러뜨린다 (지수 평균) */
export function smoothVec(prev: { x: number; y: number }, next: { x: number; y: number }, k = 0.25): { x: number; y: number } {
  return { x: prev.x + (next.x - prev.x) * k, y: prev.y + (next.y - prev.y) * k };
}

// ── 뒷면 기록 판 ──
/** 플레이 시간 한 줄: "12시간 3분", "3분", "1분 미만" */
export function playTimeText(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return '1분 미만';
  const hr = Math.floor(min / 60);
  return hr > 0 ? `${hr}시간 ${min % 60}분` : `${min}분`;
}

/** 놀던 시간 더하기: 마지막으로 잰 때부터 지금까지, 한 번에 cap 넘게는 안 센다(화면을 꺼 둔 시간·시계 되돌림 제외) */
export function accruePlay(playMs: number, lastTick: number, now: number, cap = 60_000): number {
  const d = now - lastTick;
  return playMs + (Number.isFinite(d) && d > 0 ? Math.min(cap, d) : 0);
}

/** 제조 번호: 세이브를 만든 시각에서 만든 재미 숫자 "BH-2610-7A3F-09" (만든 해·달 + 섞은 16진수). 같은 시각이면 늘 같다 */
export function serialNumber(createdAt: number): string {
  const d = new Date(createdAt);
  const p = (n: number) => String(n).padStart(2, '0');
  let x = (Math.floor(createdAt) ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  const hex = x.toString(16).toUpperCase().padStart(8, '0');
  return `BH-${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}-${hex.slice(0, 4)}-${hex.slice(6, 8)}`;
}

/** 뒷면 기록 판 줄 (이름·단계·플레이 시간·환생 ★·처음 시작한 날·제조 번호) */
export function plateRows(p: { name: string; stage: string; playMs: number; rebirths: number; createdAt: number }): [string, string][] {
  return [
    ['이름', p.name],
    ['단계', p.stage],
    ['플레이 시간', playTimeText(p.playMs)],
    ['환생', rebirthStars(p.rebirths) || '없음'],
    ['처음 시작한 날', dateText(new Date(p.createdAt))],
    ['제조 번호', serialNumber(p.createdAt)],
  ];
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const r4 = (n: number): number => Math.round(n * 10000) / 10000;
const round4 = r4;
