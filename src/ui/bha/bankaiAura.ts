// 만해 오라 (GDD 15-6 v6.089, C.461): 해방이 열린 동안 내 캐릭터 몸 뒤에 까는 pixelfx 시트(custom/bankai-aura, 속성 8색, 통짜).
// 사용자 2026-11-15 "만해 오라는, 해방 열렸을 때 켜는거지" · "만해 쓰고 나면 이펙트 바꿀거임" — 해방 중 이펙트는 데이터 키 하나(active)로 바꿔 끼운다.
// 모든 몸이 같은 장치: 종족·몸 id 분기 없이 그림의 몸 크기(정지 그림의 안 투명한 상자 × 배율 — 키, 넓은 몸은 너비)에 비례해 키우고, 발(그림 칸 아래 8%)을 시트 기준점에 맞춘다.
// 위쪽은 DOM 없는 순수 함수라 단위 테스트한다 (tests/c461.test.ts).
import cfgRaw from '../../data/art/bankaiAura.json';
import { fxSheetName, loadPixelFx, type PixelFxSheet } from './pixelFx';

export interface BankaiAuraConfig {
  /** 해방 열림 때 시트 (pixelfx id) */
  ready: string;
  /** 해방 중 시트 (pixelfx id) — 사용자가 새 이펙트를 주면 이것만 바꾼다. 없으면 ready */
  active: string | null;
  elements: string[];
  fallbackElement: string;
  /** 시트를 만들 때 맞춘 몸 키 (시트 픽셀) */
  bodyUnits: number;
  /** 몸 너비가 이 값(시트 픽셀)을 넘으면 너비에 맞춘다 — 넓은 몸(덩치·짐승형)에서 기둥이 몸에 가려지지 않게 (provisional) */
  bodyWidthUnits: number;
  /** 그림이 없는 몸(자리표시 도형)의 몸 키 — 그림 칸 대비 */
  fallbackBodyFrac: number;
}
export const BANKAI_AURA: BankaiAuraConfig = cfgRaw as BankaiAuraConfig;

/** 발바닥 = 그림 칸 아래에서 8% 위 (GDD 15-1·15-5, .bha-hero__img transform-origin 50% 92%) */
export const FEET_FROM_TOP = 0.92;

export type BankaiAuraPhase = 'off' | 'ready' | 'active';

/** 지금 켤 오라: 해방 중 > 해방 열림(누를 수 있음) > 꺼짐. 해방을 못 쓰는 전투(libOn false)는 늘 꺼짐 */
export function bankaiAuraPhase(libOn: boolean, ready: boolean, active: boolean): BankaiAuraPhase {
  if (!libOn) return 'off';
  if (active) return 'active';
  return ready ? 'ready' : 'off';
}

/** 오라 색 = 내 캐릭터 속성 (없거나 시트가 없는 속성이면 fallbackElement) */
export function bankaiAuraElement(element: string | null | undefined, c: BankaiAuraConfig = BANKAI_AURA): string {
  return element && c.elements.includes(element) ? element : c.fallbackElement;
}

/** 단계·속성에 맞는 시트 이름 (public/fx/<이름>.json). 꺼짐이면 null */
export function bankaiAuraSheetName(phase: BankaiAuraPhase, element: string | null | undefined, c: BankaiAuraConfig = BANKAI_AURA): string | null {
  if (phase === 'off') return null;
  const id = phase === 'active' ? c.active ?? c.ready : c.ready;
  return fxSheetName(id, bankaiAuraElement(element, c));
}

/** 몸 키 (그림 칸 높이 대비): (발 − 머리 윗변) × 배율. 머리 윗변을 못 읽었으면(그림 없음·아직 안 읽음) fallback */
export function bodyHeightFrac(topRatio: number | null | undefined, artScale: number, c: BankaiAuraConfig = BANKAI_AURA): number {
  if (topRatio === null || topRatio === undefined || !(topRatio < FEET_FROM_TOP)) return c.fallbackBodyFrac;
  return (FEET_FROM_TOP - topRatio) * artScale;
}

/** 몸 너비 (그림 칸 대비): 안 투명한 가로 폭 × 배율. 못 읽었으면 0(너비는 안 본다) */
export function bodyWidthFrac(widthRatio: number | null | undefined, artScale: number): number {
  return widthRatio && widthRatio > 0 ? widthRatio * artScale : 0;
}

/** 오라 상자 (그림 칸 한 변 대비, 0~): 높이·너비·아래 끝(칸 아래에서)·가운데 x. 시트 1픽셀 = max(몸 키 / bodyUnits, 몸 너비 / bodyWidthUnits), 기준점이 발 위에 온다. dy = 그림 세로 보정(%) */
export function bankaiAuraBox(
  s: Pick<PixelFxSheet, 'frame' | 'pivot'>,
  bodyFrac: number,
  dyPct = 0,
  c: BankaiAuraConfig = BANKAI_AURA,
  widthFrac = 0,
): { height: number; width: number; bottom: number; left: number } {
  const unit = Math.max(bodyFrac / c.bodyUnits, widthFrac / c.bodyWidthUnits); // 시트 1픽셀 (칸 대비)
  const height = s.frame[1] * unit;
  const width = s.frame[0] * unit;
  const feet = 1 - FEET_FROM_TOP - dyPct / 100; // 칸 아래에서 발까지
  const bottom = feet - (s.frame[1] - s.pivot[1]) * unit;
  const left = 0.5 - (s.frame[0] - s.pivot[0]) * unit; // 내 그림은 좌우 반전(오른쪽을 본다) — 기준점도 뒤집어 놓는다
  return { height, width, bottom, left };
}

/** 프레임 i 의 배경 위치 (%): 칸 수 cols × 줄 수 rows 시트에서 background-size 를 칸 수 배로 키웠을 때 */
export function framePercent(i: number, cols: number, rows: number): [number, number] {
  const c = i % cols;
  const r = Math.floor(i / cols);
  return [cols > 1 ? (c / (cols - 1)) * 100 : 0, rows > 1 ? (r / (rows - 1)) * 100 : 0];
}

// ── DOM ──

const FX_BASE = 'fx/';

/** 그림 한 장(정지 그림)의 안 투명한 상자: 윗변 비율·가로 폭 비율. 못 읽으면 null (다른 출처·jsdom) */
export interface ArtBox { top: number; width: number }
const boxCache = new Map<string, Promise<ArtBox | null>>();
export function loadArtBox(src: string): Promise<ArtBox | null> {
  let p = boxCache.get(src);
  if (!p) {
    p = new Promise<ArtBox | null>((done) => {
      const im = new Image();
      im.onerror = () => done(null);
      im.onload = () => {
        try {
          const w = im.naturalWidth;
          const h = im.naturalHeight;
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const g = c.getContext('2d');
          if (!g || !w || !h) return done(null);
          g.drawImage(im, 0, 0);
          const d = g.getImageData(0, 0, w, h).data;
          let top = -1, l = w, r = -1;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]! > 24) { if (top < 0) top = y; if (x < l) l = x; if (x > r) r = x; }
          done(top < 0 ? null : { top: top / h, width: (r - l + 1) / w });
        } catch {
          done(null);
        }
      };
      im.src = src;
    });
    boxCache.set(src, p);
  }
  return p;
}

export interface BankaiAura {
  el: HTMLElement;
  /** 매 화면 갱신마다 부른다. 바뀔 때만 DOM 을 건드린다 */
  set(phase: BankaiAuraPhase): void;
  readonly phase: BankaiAuraPhase;
  /** 시트를 받아 몸 위에 깔았는지 (못 받았으면 옛 CSS 발밑 기운이 남는다) */
  readonly shown: boolean;
  stop(): void;
}

/**
 * 오라 요소를 몸 상자(.bha-hero__lift) 맨 앞(몸 뒤)에 넣는다. art = 내 그림(머리 윗변·배율·세로 보정), element = 내 속성.
 * reduced = 동작 줄이기면 첫 프레임 정지. onShown = 시트가 보이기 시작/끝날 때(옛 CSS 기운 숨기기용)
 */
export function mountBankaiAura(
  lift: HTMLElement,
  art: { src: string | null; scale: number; fieldScale?: number; offsetY: number },
  element: string | null | undefined,
  o: { reduced: boolean; measure?: (src: string) => Promise<ArtBox | null>; onShown?: (on: boolean) => void },
): BankaiAura {
  const el = document.createElement('span');
  el.className = 'bha-bankaiaura';
  el.setAttribute('aria-hidden', 'true');
  el.hidden = true;
  lift.prepend(el);
  const scale = art.fieldScale ?? art.scale;
  let box: ArtBox | null = null;
  let topRead = !art.src;
  if (art.src) void (o.measure ?? loadArtBox)(art.src).then((r) => { box = r; topRead = true; render(); });
  let phase: BankaiAuraPhase = 'off';
  let want: string | null = null;
  let sheetOn: PixelFxSheet | null = null;
  let anim: Animation | null = null;
  let stopped = false;
  let shown = false;
  const setShown = (v: boolean): void => {
    if (shown === v) return;
    shown = v;
    o.onShown?.(v);
  };
  const clear = (): void => {
    anim?.cancel();
    anim = null;
    sheetOn = null;
    el.hidden = true;
    setShown(false);
  };
  const show = (s: PixelFxSheet): void => {
    const rows = Math.ceil(s.frames / s.columns);
    const b = bankaiAuraBox(s, bodyHeightFrac(box?.top, scale), art.offsetY, BANKAI_AURA, bodyWidthFrac(box?.width, scale));
    const pct = (v: number): string => `${(v * 100).toFixed(2)}%`;
    el.style.cssText = `height:${pct(b.height)};width:${pct(b.width)};bottom:${pct(b.bottom)};left:${pct(b.left)};` +
      `background-image:url("${FX_BASE}${s.image}");background-size:${s.columns * 100}% ${rows * 100}%;background-position:0% 0%`;
    el.dataset.fx = s.name;
    el.hidden = false;
    anim?.cancel();
    anim = null;
    if (!o.reduced && typeof el.animate === 'function') {
      const total = s.durations.reduce((a, d) => a + d, 0);
      const kf: Keyframe[] = [];
      let t = 0;
      s.durations.forEach((d, i) => {
        const [x, y] = framePercent(i, s.columns, rows);
        kf.push({ offset: total > 0 ? t / total : 0, backgroundPosition: `${x}% ${y}%`, easing: 'steps(1, end)' });
        t += d;
      });
      const last = kf[kf.length - 1];
      if (last) kf.push({ ...last, offset: 1 });
      anim = el.animate(kf, { duration: total, iterations: s.loop ? Infinity : 1 });
    }
    sheetOn = s;
    setShown(true);
  };
  const render = (): void => {
    if (stopped) return;
    if (!want || !topRead) { if (!want) clear(); return; }
    const name = want;
    if (sheetOn?.name === name) return;
    void loadPixelFx(name).then((s) => {
      if (stopped || want !== name) return;
      if (s) show(s); else clear();
    });
  };
  return {
    el,
    set(p) {
      if (p === phase) return;
      phase = p;
      want = bankaiAuraSheetName(p, element);
      render();
    },
    get phase() { return phase; },
    get shown() { return shown; },
    stop() {
      stopped = true;
      clear();
    },
  };
}
