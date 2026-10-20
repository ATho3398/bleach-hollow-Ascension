// 다마고치 모드 순수 계산 (GDD 27장, S-17 C.62): 브라우저 저장 설정·줌아웃 배치·키링 진자 물리·기울기 → 중력 방향·놀던 시간 계산.
// DOM 없이 테스트한다 (tests/c62.test.ts). 화면은 tamago.ts. 종족 무관 — 이름은 종족 설정·세이브에서 받는다.
//
// 좌표: 모두 "기기 안 좌표"(논리 px, viewport.ts 의 toLocal 과 같은 틀). 기기 왼쪽 위 (0,0), 오른쪽 +x, 아래 +y.
// 각도: CSS rotate 와 같은 방향(시계 방향 +). 0 = 기기 아래쪽으로 곧게 매달림. 매단 점에서 끝까지의 벡터는 (−L·sinθ, L·cosθ).


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
  /** 옆면 두께 (GDD 30장 6, C.66): 기기(몸체) 가로 길이의 25% — 사용자 "가로 1000px 이면 두께 2~300px"의 가운데. 기본형·그림 기기·옆면 그림 모두 이 값 하나 */
  thicknessRatio: 0.25,
  /** 뒤집는 동안(옆으로 설 때) 두꺼운 기기가 화면 밖으로 안 나가게 줄이는 비율 (90도에서 이만큼) */
  flipShrink: 0.3,
} as const;

/** 옆면 두께(px): 몸체 가로 길이 × BODY.thicknessRatio (GDD 30장 6) */
export function edgeThickness(body: { w: number }): number {
  return r2(body.w * BODY.thicknessRatio);
}

/**
 * 옆면 두께 띠 (GDD 31장 1, C.71 — C.66 의 앞면 36겹 대체): 옆면 그림이 없는 그림 기기는 앞면 실루엣을 가로 띠 SIDE_BANDS 줄로 나눠,
 * 줄마다 실루엣 왼쪽·오른쪽 끝에 두께만큼 뒤로 세운 작은 단색 면 2장 + 뒤쪽 끝에 어둡게 구운 작은 실루엣 1장으로 두께를 만든다.
 * 큰 그림 겹이 없어 뒤집는 동안 그리는 면적이 앞면 한 장 + 띠 정도다.
 */
export const SIDE_BANDS = 24;

/** 실루엣 한 줄: 위·아래(그림 높이 비율 0~1), 왼쪽·오른쪽 끝(그림 너비 비율 0~1), 색(그 줄 가장자리 평균, 0~255) */
export interface SilBand {
  y0: number;
  y1: number;
  x0: number;
  x1: number;
  rgb: [number, number, number];
}

/**
 * 그림 픽셀(RGBA, w×h) → 실루엣 가로 띠 n줄. 불투명(alpha ≥ 128) 픽셀이 없는 줄은 빠진다.
 * 색 = 그 줄 왼쪽·오른쪽 끝에서 안쪽 몇 픽셀의 평균 (옆면이 테두리 재질을 따라가게)
 */
export function silhouetteBands(px: ArrayLike<number>, w: number, h: number, n: number = SIDE_BANDS): SilBand[] {
  const out: SilBand[] = [];
  const W = Math.max(1, Math.floor(w)), H = Math.max(1, Math.floor(h)), N = Math.max(1, Math.floor(n));
  const edge = Math.max(1, Math.round(W * 0.02));
  for (let b = 0; b < N; b++) {
    const ya = Math.floor((b * H) / N), yb = Math.max(ya + 1, Math.floor(((b + 1) * H) / N));
    let x0 = W, x1 = -1;
    for (let y = ya; y < yb; y++) {
      for (let x = 0; x < W; x++) if ((px[(y * W + x) * 4 + 3] ?? 0) >= 128) { if (x < x0) x0 = x; break; }
      for (let x = W - 1; x >= 0; x--) if ((px[(y * W + x) * 4 + 3] ?? 0) >= 128) { if (x > x1) x1 = x; break; }
    }
    if (x1 < x0) continue;
    let r = 0, g = 0, bl = 0, c = 0;
    for (let y = ya; y < yb; y++) {
      for (const xs of [x0, x1 - edge + 1]) {
        for (let x = Math.max(0, xs); x < Math.min(W, xs + edge); x++) {
          const i = (y * W + x) * 4;
          if ((px[i + 3] ?? 0) < 128) continue;
          r += px[i] ?? 0; g += px[i + 1] ?? 0; bl += px[i + 2] ?? 0; c++;
        }
      }
    }
    const k = c || 1;
    out.push({ y0: r4(ya / H), y1: r4(yb / H), x0: r4(x0 / W), x1: r4((x1 + 1) / W), rgb: [Math.round(r / k), Math.round(g / k), Math.round(bl / k)] });
  }
  return out;
}

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
  // 두꺼운 기기는 몸체 한가운데(가로 = 몸체 가운데, 앞면 뒤 두께/2)를 축으로 돈다(0도에서는 서로 상쇄) — 180도에서 뒷면이 평소 뒷면 자리와 정확히 겹치게 (GDD 31장 1).
  // 옆으로 설수록(|sin|) 조금 줄여 화면 안에 둔다 (0·180도에서는 그대로)
  const thick = edgeThickness(body);
  const bcx = body.x + body.w / 2;
  const flip = ` translate(${r2(bcx - cx)}px, 0px) perspective(${Math.round(Math.max(w, h) * 3)}px) translateZ(${r2(-thick / 2)}px) rotateY(${flipDeg}deg) translateZ(${r2(thick / 2)}px)`;
  const shrink = 1 - B.flipShrink * Math.min(1, Math.abs(Math.sin((flipDeg * Math.PI) / 180)));
  // 사용자 확대(핀치·휠)는 같은 함수 목록 안에서 배율·이동만 바꾼다 (전환이 매끄럽게)
  const v = clampView(view, zoom, box, w, h);
  const stage = `translate(${r2(w / 2 + v.px)}px, ${r2(h / 2 + v.py)}px) scale(${round4(zoom * v.uz * shrink)})${flip} translate(${r2(-bcx)}px, ${r2(-cy)}px)`;
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

// ── 그림 기기를 입은 평소 화면 (GDD 31장 2·4, C.71) ──
/**
 * 그림 기기를 입으면 게임 화면(LCD)을 기준 크기 그대로(844×390) 그린다 (GDD 31장 2 정정 v5.48, 사용자 "게임 화면비를 왜바꿔. 그냥 다마고치 이미지 ui를 바꾸면 되잖아").
 * 규칙(frame-v1 구멍 (663, 845) 1410×652)대로 그린 그림이면 구멍에 꽉 차고, 규칙과 다른 그림(옛 2:1)이면 LCD 를 구멍 가로에 맞추고 남는 위아래는 베젤 색. 기본형은 지금 그대로(맞춤이 정함)
 */
export const SKIN_LCD = { w: 844, h: 390 } as const;
/** 평소 화면에서 구멍·버튼 둘레에 더 보여 줄 그림 여백 (그림 너비 대비) */
export const SKIN_MARGIN = 0.012;

/** 그림 기기 평소 화면 틀: LCD 크기와, 화면에 꼭 보여야 하는 영역(화면 구멍 + 버튼 4개 + 여백, LCD 왼쪽 위 기준 기기 안 px) */
export interface DeviceSkin {
  lcd: { w: number; h: number };
  /** 그림의 화면 구멍 (LCD 왼쪽 위 기준). 규칙(frame-v1 844:390)대로면 LCD 와 같고, 옛 2:1 그림이면 위아래가 남아 베젤 색으로 채운다 */
  hole: Rect;
  crop: Rect;
}

/**
 * 평소 화면 = 입은 기기를 화면 구멍 중심으로 확대한 모습 (GDD 31장 4): 구멍에 LCD(SKIN_LCD)를 맞춘 배율에서 구멍과 버튼 4개가 다 들어가는 상자.
 * 기기 맞춤(viewport.computeFit)이 이 상자를 화면에 맞춰 줄인다.
 */
export function deviceSkin<B extends string>(natural: { w: number; h: number }, spec: { screen: Rect; ring: { x: number; y: number }; buttons: Record<B, Rect> }, lcd: { w: number; h: number } = SKIN_LCD): DeviceSkin {
  const p = deviceArtPlacement({ x: 0, y: 0, w: lcd.w, h: lcd.h }, natural, spec);
  const rs = [p.hole, ...Object.values<Rect>(p.buttons)];
  const m = p.box.w * SKIN_MARGIN;
  const x0 = Math.min(...rs.map((r) => r.x)) - m, y0 = Math.min(...rs.map((r) => r.y)) - m;
  const x1 = Math.max(...rs.map((r) => r.x + r.w)) + m, y1 = Math.max(...rs.map((r) => r.y + r.h)) + m;
  return { lcd: { w: lcd.w, h: lcd.h }, hole: p.hole, crop: { x: r2(x0), y: r2(y0), w: r2(x1 - x0), h: r2(y1 - y0) } };
}

/** 틀 상자를 기기 논리 크기(w×h) 가운데에 놓았을 때 LCD 왼쪽 위 (기기 안 px) */
export function skinLcdAt(skin: DeviceSkin, w: number, h: number): { x: number; y: number } {
  return { x: r2(w / 2 - (skin.crop.x + skin.crop.w / 2)), y: r2(h / 2 - (skin.crop.y + skin.crop.h / 2)) };
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

/** 회전 출력 각도 (도, 시계 방향): 세로 폰에서 기기를 돌려 그렸으면 90 (viewport.ts fitTransform 과 같은 방향) */
export const outputAngle = (rotated: boolean): number => (rotated ? 90 : 0);

/** 방향 벡터를 시계 방향으로 deg 도 돌린다 (화면 좌표, 아래 +y) */
export function rotateVec(v: { x: number; y: number }, deg: number): { x: number; y: number } {
  const a = deg * DEG, c = Math.cos(a), s = Math.sin(a);
  return { x: r4(v.x * c - v.y * s) || 0, y: r4(v.x * s + v.y * c) || 0 };
}

/**
 * 기울기를 안 쓸 때의 중력 (GDD 31장 3, C.71): 언제나 "실제로 보고 있는 폰 화면의 아래".
 * 회전 출력(세로 폰에 가로 기기를 90도 돌려 그림)은 폰을 옆으로 눕혀 기기를 똑바로 보라는 출력이라, 보는 사람의 아래 = 폰 세로 화면의 아래가 아니라
 * 그 아래를 출력 각도만큼 돌린 쪽(세로 화면의 왼쪽)이다. 그것을 기기 안 좌표로 바꾸면 회전 여부와 관계없이 기기 아래(+y).
 * (C.62~C.70 은 세로 화면 아래 = 기기 +x 로 두어 키링이 옆으로 떨어졌다)
 */
export function defaultGravity(rotated: boolean): { x: number; y: number } {
  return toDeviceVec(rotateVec({ x: 0, y: 1 }, outputAngle(rotated)), rotated);
}

/** 센서 값 흔들림을 누그러뜨린다 (지수 평균) */
export function smoothVec(prev: { x: number; y: number }, next: { x: number; y: number }, k = 0.25): { x: number; y: number } {
  return { x: prev.x + (next.x - prev.x) * k, y: prev.y + (next.y - prev.y) * k };
}

// ── 놀던 시간 ──
/** 놀던 시간 더하기: 마지막으로 잰 때부터 지금까지, 한 번에 cap 넘게는 안 센다(화면을 꺼 둔 시간·시계 되돌림 제외) */
export function accruePlay(playMs: number, lastTick: number, now: number, cap = 60_000): number {
  const d = now - lastTick;
  return playMs + (Number.isFinite(d) && d > 0 ? Math.min(cap, d) : 0);
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const r4 = (n: number): number => Math.round(n * 10000) / 10000;
const round4 = r4;
