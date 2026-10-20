// 다마고치 모드 (GDD 27장, S-17 C.62): 지금 화면 = 기기의 화면·버튼을 확대해 본 상태, 다마고치 모드 = 카메라가 물러나 기기 전체(몸체·고리·키링)가 보이는 상태.
// 기기 틀(.bha-dev) 둘레에 몸체를 붙이고, 기기 transform 뒤에 줌아웃(+ 뒤집기)을 붙인다(device.setStage) — 기기 안 좌표라 세로 회전 출력(16-6)·PC 배율에서도 같다.
// 줌아웃 중에도 화면은 살아 움직이고 기기 버튼은 눌린다. 화면(LCD)을 탭하면 다시 줌인. [뒤집기] = 뒷면(몸체 뒷면 + 기록 판).
// 키링 = 고리에 매단 감쇠 진자 2마디(tamagoLogic.ts), 탭·끌기 = 충격, 설정 [기울기로 흔들기]를 켜면 기울기를 중력 방향으로. 다마고치 모드일 때만 돌고 멈추면 쉰다.
// 켜 둔 상태·기울기 설정은 이 브라우저에만(세이브 아님). 색은 꾸밈 토큰(--cos-shell-*, --bha-cos-keyring-*)만. 종족 분기 없음 — 이름·모양은 종족 설정.
import { cosmeticName, deviceArt, sourceNote, deviceSideArt, getCosmetic, keyringArt, keyringShapeOf, DEVICE_BUTTONS, type CosmeticItemDef, type DeviceArtSpec, type DeviceButton, type KeyringShape } from '../../data/shop';
import { formName, tryGetForm } from '../../data/evolution';
import { playerElementsOf } from '../../engine/evolution';
import type { FactionConfig } from '../../engine/faction';
import type { SaveData } from '../../game';
import { ownedDeviceDesigns, unwearCategory, wearCosmetic } from '../../shop';
import { getOverlayHost, registerLayer } from './overlayHost';
import { currentViewState } from '../viewScale';
import { TAMAGO_CODE } from '../shortcutMap';
import { motionReduced } from './cosmeticFx';
import type { Device } from './device';
import { button, el } from './dom';
import { showToast } from './nest';
import { isTypingTarget } from './shortcuts';
import { toLocal, type Fit } from './viewport';
import {
  BODY, STACK_LAYERS, stackDepths, defaultGravity, deviceArtPlacement, edgeThickness, isResting, kick, loadTamagoPrefs, plateRows, restingAt, saveTamagoPrefs, screenGravity, smoothVec, stepPendulum, tamaLayout, tapKick, PHYS,
  TAMAGO_EVENT, toDeviceVec, clampView, zoomAt, wheelFactor, VIEW_HOME, type Pendulum, type Rect, type TamagoPrefs, type TamaLayout, type TamaView,
} from './tamagoLogic';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 줄(체인) 길이 (기기 안 px) — 장식은 줄 끝에 매단다 */
const CHAIN_L = 22;

export interface Tamago {
  /** 기록 판·키링·기기 디자인에 쓸 지금 캐릭터 (시작 화면 = null) */
  setContext(faction: FactionConfig | null, save: SaveData | null): void;
  /** 켜고 끈다 (on 이 없으면 바꾼다). 켠 상태는 브라우저에 저장 */
  toggle(on?: boolean): void;
  isOn(): boolean;
  /** 앞면 ↔ 뒷면 (줌아웃 상태에서만) */
  flip(): void;
  /** [디자인] 목록을 연다/닫는다 (줌아웃 상태에서만) */
  openDesigns(): void;
  /** 지금 상태 (캡처·시험용): 진자 각도 */
  debug(): { on: boolean; back: boolean; pend: Pendulum; gravity: { x: number; y: number }; zoom: number; resting: boolean };
}

const store = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

/** 키링 모양 그림 (CSS/SVG, 매다는 구멍이 (0, 3)) */
function charmSvg(shape: KeyringShape): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-20 0 40 46');
  svg.setAttribute('class', 'bha-key__charm-svg');
  svg.setAttribute('aria-hidden', 'true');
  const part = (tag: string, attrs: Record<string, string>, cls = 'bha-key__fill') => {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    e.setAttribute('class', cls);
    svg.append(e);
    return e;
  };
  part('circle', { cx: '0', cy: '3', r: '3' }, 'bha-key__loop');
  switch (shape) {
    case 'mask':
      part('path', { d: 'M-14 9 Q-1 3 13 9 Q15 26 6 38 L2 33 L-1 40 Q-15 30 -14 9Z' });
      part('ellipse', { cx: '-6', cy: '18', rx: '4', ry: '3' }, 'bha-key__hole');
      part('ellipse', { cx: '6', cy: '18', rx: '4', ry: '3' }, 'bha-key__hole');
      part('path', { d: 'M-5 28 L5 28 M-3 26 L-3 30 M0 26 L0 30 M3 26 L3 30' }, 'bha-key__mark');
      break;
    case 'butterfly':
      part('path', { d: 'M0 14 C-5 4 -19 4 -18 15 C-17 22 -7 22 0 18 C7 22 17 22 18 15 C19 4 5 4 0 14Z' });
      part('path', { d: 'M0 19 C-4 24 -14 28 -11 35 C-8 39 -2 32 0 26 C2 32 8 39 11 35 C14 28 4 24 0 19Z' });
      part('path', { d: 'M0 8 L0 34' }, 'bha-key__mark');
      break;
    case 'bell':
    case 'bonebell':
      part('path', { d: 'M-12 32 Q-13 12 0 9 Q13 12 12 32 L15 35 L-15 35Z' });
      part('path', { d: 'M-7 24 L7 24' }, 'bha-key__mark');
      part('circle', { cx: '0', cy: '38', r: '3.5' }, 'bha-key__hole');
      break;
    case 'orb':
      part('rect', { x: '-4', y: '6', width: '8', height: '5', rx: '1.5' }, 'bha-key__cap');
      part('circle', { cx: '0', cy: '23', r: '12.5' });
      part('circle', { cx: '-4.5', cy: '18.5', r: '3.5' }, 'bha-key__shine');
      break;
    default:
      part('path', { d: 'M-10 10 L10 10 L10 34 L0 41 L-10 34Z' });
      part('circle', { cx: '0', cy: '18', r: '3' }, 'bha-key__hole');
  }
  return svg;
}

export interface TamagoHooks {
  /** 기기 디자인을 바꾼 뒤 저장 */
  persist?: () => void;
}

export function initTamago(dev: Device, hooks: TamagoHooks = {}): Tamago {
  const frame = dev.frame;
  let prefs: TamagoPrefs = loadTamagoPrefs(store());
  let faction: FactionConfig | null = null;
  let save: SaveData | null = null;
  let on = false;
  let back = false;
  let flipDeg = 0;
  let fit: Fit | null = null;
  let layout: TamaLayout | null = null;
  /** 입은 기기 디자인 그림: 데이터 좌표·그림 크기 → 기기 안 자리(맞춤이 바뀔 때마다 다시 계산) */
  let artSpec: DeviceArtSpec | null = null;
  let artNat: { w: number; h: number } | null = null;
  let artBox: ReturnType<typeof deviceArtPlacement<DeviceButton>> | null = null;
  /** 옆면 그림(`device-<look>-side.png`, GDD 29장)의 실제 크기 — 있으면 가로:세로 비율이 두께 */
  let sideNat: { w: number; h: number } | null = null;
  let thicknessPct: number | null = null;
  /** 다마고치 모드 안 사용자 확대·이동 (핀치·휠·끌기) */
  let view: TamaView = VIEW_HOME;
  /** 키링에 걸리는 중력 (기기 안 좌표): 기울기를 안 쓰면 화면 아래 */
  let gravityLocal = defaultGravity(false);

  // ── 요소 ──
  const root = el('div', 'bha-tama');
  root.setAttribute('aria-hidden', 'true');
  root.hidden = true;
  const body = el('div', 'bha-tama__body');
  const bodyArt = el('img', 'bha-tama__art') as HTMLImageElement;
  bodyArt.alt = '';
  bodyArt.hidden = true;
  const ring = el('div', 'bha-tama__ring');
  // 겹 두께 (GDD 30장): 옆면 그림이 없는 그림 기기는 앞면을 어둡게 한 장을 뒤로 쌓아 실루엣을 따라가는 두께를 만든다 (뒤집는 동안만 보임)
  const layers = Array.from({ length: STACK_LAYERS }, (_, i) => {
    const im = el('img', 'bha-tama__layer') as HTMLImageElement;
    im.alt = '';
    im.hidden = true;
    im.dataset.layer = String(i);
    im.style.setProperty('--layer-shade', (0.6 - (0.24 * i) / (STACK_LAYERS - 1)).toFixed(2));
    return im;
  });
  // 옆면 두께 띠 (C.63·C.64, GDD 28장 2번·29장): 뒤집는 동안만 3D 로 세워 종이처럼 안 보이게. 옆면 그림이 있으면 그 그림, 없으면 몸체 색 CSS 띠
  const edgeL = el('div', 'bha-tama__edge bha-tama__edge--l');
  const edgeR = el('div', 'bha-tama__edge bha-tama__edge--r');
  const backFace = el('div', 'bha-tama__back');
  const backArt = el('img', 'bha-tama__art') as HTMLImageElement;
  backArt.alt = '';
  backArt.hidden = true;
  const grille = el('div', 'bha-tama__grille');
  const plate = el('dl', 'bha-tama__plate');
  backFace.append(backArt, grille, plate);
  backFace.hidden = true;
  const key = el('div', 'bha-key');
  const seg1 = el('div', 'bha-key__seg1');
  const chain = el('i', 'bha-key__chain');
  const seg2 = el('div', 'bha-key__seg2');
  seg1.append(chain, seg2);
  key.append(seg1);
  key.hidden = true;
  const ctrl = el('div', 'bha-tama__ctrl');
  const designBtn = button({ label: '디자인', icon: 'i-rare', size: 'small', variant: 'ghost', onClick: () => openDesigns() });
  designBtn.dataset.tama = 'design';
  const flipBtn = button({ label: '뒤집기', icon: 'i-swap', size: 'small', onClick: () => flip() });
  flipBtn.dataset.tama = 'flip';
  const zoomBtn = button({ label: '화면 확대', icon: 'i-plus', size: 'small', variant: 'ghost', onClick: () => toggle(false) });
  zoomBtn.dataset.tama = 'zoom-in';
  ctrl.append(flipBtn, designBtn, zoomBtn);
  // 그림 기기의 버튼 4개 누름 영역 (다마고치 모드에서 CSS 버튼 대신, GDD 27장 v5.33): 누르면 기기 버튼과 같다
  const hits = new Map<DeviceButton, HTMLButtonElement>();
  const HIT_LABEL: Record<DeviceButton, string> = { up: '위', down: '아래', ok: '확정', back: '취소' };
  for (const b of DEVICE_BUTTONS) {
    const hb = el('button', 'bha-tama__hit');
    hb.type = 'button';
    hb.dataset.hit = b;
    hb.setAttribute('aria-label', HIT_LABEL[b]);
    hb.hidden = true;
    hb.onclick = () => {
      if (b === 'up') dev.move(-1);
      else if (b === 'down') dev.move(1);
      else if (b === 'ok') dev.confirm();
      else dev.cancel();
    };
    hits.set(b, hb);
  }
  root.append(...layers, edgeL, edgeR, body, bodyArt, ring, backFace, key, ctrl, ...hits.values());
  frame.append(root);
  // 화면(LCD) 탭 = 줌인. 줌아웃 중에만 LCD 를 덮는다 (화면은 그 밑에서 그대로 움직인다)
  const shield = el('button', 'bha-tama__shield');
  shield.type = 'button';
  shield.setAttribute('aria-label', '화면 확대 (다마고치 모드 끄기)');
  shield.dataset.tama = 'screen';
  shield.hidden = true;
  shield.onclick = () => toggle(false);
  dev.lcd.append(shield);

  // ── 지금 입은 키링·기기 디자인 ──
  const worn = (cat: 'keyring' | 'device'): CosmeticItemDef | undefined => {
    const c = getCosmetic(save?.wear[cat]);
    return c && c.category === cat ? c : undefined;
  };
  let keyId = '';
  const paintKey = () => {
    const c = worn('keyring');
    const shape = c ? keyringShapeOf(c, faction) : null;
    const id = c ? `${c.id}:${shape}` : '';
    if (id === keyId) return;
    keyId = id;
    seg2.replaceChildren();
    key.dataset.keyring = c?.id ?? '';
    if (!c || !shape) return;
    key.dataset.shape = shape;
    key.style.setProperty('--key-body', `var(--bha-cos-keyring-${shape}-body)`);
    key.style.setProperty('--key-line', `var(--bha-cos-keyring-${shape}-line)`);
    key.title = cosmeticName(c, faction);
    const art = keyringArt(c, shape);
    if (art) {
      // 그림 키링: 그림의 구멍(hole, %)이 줄 끝에 오게 놓는다
      const img = el('img', 'bha-key__art') as HTMLImageElement;
      img.alt = '';
      img.src = `${BASE}${art}`;
      const hole = c.hole ?? { x: 50, y: 6 };
      img.style.transform = `translate(${-hole.x}%, ${-hole.y}%)`;
      img.style.transformOrigin = `${hole.x}% ${hole.y}%`;
      seg2.append(img);
    } else seg2.append(charmSvg(shape));
  };

  let artId = '';
  const paintDevice = () => {
    const c = worn('device');
    const art = c ? deviceArt(c) : null;
    const id = c && art ? c.id : '';
    if (id === artId) return;
    artId = id;
    artSpec = c && art ? c.device! : null;
    artNat = null;
    artBox = null;
    sideNat = null;
    thicknessPct = c && art ? c.thickness ?? null : null;
    frame.classList.toggle('has-tama-art', false);
    frame.classList.toggle('has-side-art', false);
    for (const e of [edgeL, edgeR]) e.style.removeProperty('--side-art');
    bodyArt.hidden = true;
    backArt.hidden = true;
    for (const l of layers) l.hidden = true;
    if (!c || !art) return relayout();
    bodyArt.src = `${BASE}${art.front}`;
    for (const l of layers) l.src = bodyArt.src;
    if (art.back) backArt.src = `${BASE}${art.back}`;
    const place = () => {
      if (!bodyArt.naturalWidth || artId !== c.id) return;
      artNat = { w: bodyArt.naturalWidth, h: bodyArt.naturalHeight };
      frame.classList.add('has-tama-art');
      bodyArt.hidden = false;
      backArt.hidden = !art.back;
      for (const l of layers) l.hidden = false;
      relayout();
    };
    bodyArt.onload = place;
    if (bodyArt.complete) place();
    // 옆면 그림 (없으면 CSS 두께)
    const sidePath = deviceSideArt(c);
    if (sidePath) {
      const img = new Image();
      img.onload = () => {
        if (artId !== c.id || !img.naturalWidth) return;
        sideNat = { w: img.naturalWidth, h: img.naturalHeight };
        // 사용자 지정 속성 안의 url() 은 스타일시트 위치 기준이라(assets/ 밑) 문서 기준 절대 주소로 넣는다
        const abs = new URL(`${BASE}${sidePath}`, document.baseURI).href;
        for (const e of [edgeL, edgeR]) e.style.setProperty('--side-art', `url("${abs}")`);
        frame.classList.add('has-side-art');
        relayout();
      };
      img.src = `${BASE}${sidePath}`;
    }
  };
  /** 지금 LCD 의 기기 안 자리 (그림 기기의 화면 구멍에 맞출 것) */
  const lcdRect = (): Rect => {
    const l = dev.lcd;
    let x = 0, y = 0;
    for (let e: HTMLElement | null = l; e && e !== frame; e = e.offsetParent as HTMLElement | null) {
      x += e.offsetLeft;
      y += e.offsetTop;
    }
    return { x, y, w: l.offsetWidth, h: l.offsetHeight };
  };

  // ── 기록 판 ──
  const paintPlate = () => {
    plate.replaceChildren();
    if (!faction || !save) {
      plate.append(el('dt', '', '기록'), el('dd', '', '슬롯을 고르면 이 기기의 기록이 나온다.'));
      return;
    }
    const form = save.evolution.formId ? tryGetForm(save.evolution.formId) : undefined;
    const name = form ? formName(form, faction.id, playerElementsOf(save.evolution)) : faction.tierNames[save.evolution.tierIndex]!;
    const rows = plateRows({ name, stage: `${save.evolution.tierIndex + 1}단계`, playMs: save.machine.playMs, rebirths: save.rebirth.count, createdAt: save.machine.createdAt });
    for (const [k, v] of rows) {
      const dt = el('dt', '', k);
      const dd = el('dd', '', v);
      dd.dataset.row = k;
      plate.append(dt, dd);
    }
  };

  // ── 배치 ──
  const box = (e: HTMLElement, r: Rect) => {
    e.style.left = `${r.x}px`;
    e.style.top = `${r.y}px`;
    e.style.width = `${r.w}px`;
    e.style.height = `${r.h}px`;
  };
  const stageOf = (f: Fit): string => {
    fit = f;
    artBox = artSpec && artNat ? deviceArtPlacement(lcdRect(), artNat, artSpec) : null;
    layout = tamaLayout(f.w, f.h, artBox, flipDeg, view);
    view = clampView(view, layout.zoom, layout.box, f.w, f.h);
    gravityLocal = tiltOn() ? gravityLocal : defaultGravity(f.rotated);
    return on ? layout.stage : '';
  };
  function relayout(): void {
    dev.restage();
    if (!layout) return;
    box(body, layout.body);
    box(backFace, layout.body);
    const thick = edgeThickness(layout.body, sideNat, thicknessPct);
    box(edgeL, { x: layout.body.x, y: layout.body.y, w: thick, h: layout.body.h });
    box(edgeR, { x: layout.body.x + layout.body.w - thick, y: layout.body.y, w: thick, h: layout.body.h });
    if (artBox) {
      // 겹 두께: 옆면 그림이 없을 때만 (있으면 CSS 가 숨김). 겹마다 뒤로 조금씩
      const depth = stackDepths(layers.length, edgeThickness(layout.body, null, thicknessPct));
      layers.forEach((l, i) => {
        box(l, artBox!.box);
        l.style.setProperty('--layer-z', `${-depth[i]!}px`);
      });
      box(bodyArt, artBox.box);
      box(backArt, { x: 0, y: 0, w: artBox.box.w, h: artBox.box.h });
    }
    for (const [b, hb] of hits) {
      hb.hidden = !artBox || !on || back;
      if (artBox) box(hb, artBox.buttons[b]);
    }
    box(ctrl, layout.ctrl);
    const rg = back ? layout.ringBack : layout.ring;
    ring.style.left = `${rg.x}px`;
    ring.style.top = `${rg.y}px`;
    ring.style.setProperty('--ring-r', `${BODY.ringR}px`);
    key.style.left = `${rg.x}px`;
    key.style.top = `${rg.y}px`;
    key.style.setProperty('--chain-l', `${CHAIN_L}px`);
  }
  dev.setStage(stageOf);

  // ── 진자 ──
  let pend: Pendulum = restingAt(0);
  let raf = 0;
  let last = 0;
  const reduced = () => motionReduced();
  const paintPend = () => {
    seg1.style.transform = `rotate(${pend.a1}rad)`;
    seg2.style.transform = `rotate(${pend.a2 - pend.a1}rad)`;
    key.dataset.a1 = pend.a1.toFixed(4);
    key.dataset.a2 = pend.a2.toFixed(4);
  };
  const tick = (t: number) => {
    raf = 0;
    const dt = last ? (t - last) / 1000 : PHYS.dt;
    last = t;
    pend = stepPendulum(pend, gravityLocal, dt, reduced());
    paintPend();
    if (!isResting(pend, gravityLocal) && on && !document.hidden) raf = requestAnimationFrame(tick);
    else {
      last = 0;
      key.dataset.resting = 'true';
    }
  };
  const wake = () => {
    if (!on || raf || key.hidden) return;
    key.dataset.resting = 'false';
    last = 0;
    raf = requestAnimationFrame(tick);
  };
  const settle = () => {
    pend = restingAt(Math.atan2(-gravityLocal.x, gravityLocal.y));
    paintPend();
  };

  // 탭·끌기: 화면 좌표의 움직임을 기기 안 방향으로 바꿔(세로 회전 출력이면 90도) 충격으로 준다
  let drag: { x: number; y: number } | null = null;
  const localDelta = (dx: number, dy: number) => toDeviceVec({ x: dx, y: dy }, fit?.rotated ?? false);
  key.addEventListener('pointerdown', (e) => {
    const r = key.getBoundingClientRect();
    const d = localDelta(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    pend = kick(pend, tapKick(d.x), reduced());
    drag = { x: e.clientX, y: e.clientY };
    try {
      key.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처를 못 해도 탭은 된다 */
    }
    wake();
    e.preventDefault();
  });
  key.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const d = localDelta(e.clientX - drag.x, e.clientY - drag.y);
    drag = { x: e.clientX, y: e.clientY };
    pend = kick(pend, -d.x * PHYS.drag, reduced());
    wake();
  });
  const endDrag = () => {
    drag = null;
  };
  key.addEventListener('pointerup', endDrag);
  key.addEventListener('pointercancel', endDrag);

  // ── 확대·축소 (GDD 27장 v5.33, 사용자 원문 "엄지, 검지 손가락으로 늘렷다줄엿다"): 두 손가락 핀치·PC 휠, 확대 상태에서 한 손가락 끌기 = 이동,
  //    빈 곳 두 번 탭 = 기본 크기. 최소 = 기기 전체(배율 1), 최대 = 평소 확대 화면 정도. 키링 위에서 시작한 한 손가락은 키링 끌기
  const pts = new Map<number, { x: number; y: number }>();
  let pinch: { d0: number; v0: TamaView } | null = null;
  let pan: { x: number; y: number; moved: boolean } | null = null;
  let eatClick = false;
  let lastTap = 0;
  /** 화면 점 → 화면 가운데 기준 기기 안 좌표 (세로 회전 출력·PC 배율 보정) */
  const atScreen = (x: number, y: number) => {
    if (!fit) return { x: 0, y: 0 };
    const l = toLocal(fit, x, y);
    return { x: l.x - fit.w / 2, y: l.y - fit.h / 2 };
  };
  const setView = (v: TamaView, smooth = false) => {
    if (!layout || !fit) return;
    const next = clampView(v, layout.zoom, layout.box, fit.w, fit.h);
    if (next.uz === view.uz && next.px === view.px && next.py === view.py) return;
    view = next;
    if (smooth) animate(240);
    dev.restage();
    frame.dataset.tamaZoom = view.uz.toFixed(3);
  };
  const dist = () => {
    const [a, b] = [...pts.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const mid = () => {
    const [a, b] = [...pts.values()];
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
  };
  document.addEventListener('pointerdown', (e) => {
    if (!on) return;
    if (pts.size === 0) eatClick = false;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      pinch = { d0: Math.max(1, dist()), v0: view };
      pan = null;
      drag = null; // 키링 끌기는 멈춘다
      eatClick = true;
    } else if (pts.size === 1) {
      pan = key.contains(e.target as Node) ? null : { x: e.clientX, y: e.clientY, moved: false };
    }
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!on || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2 && layout && fit) {
      const m = mid();
      setView(zoomAt(pinch.v0, dist() / pinch.d0, atScreen(m.x, m.y), layout.zoom, layout.box, fit.w, fit.h));
      e.preventDefault();
    } else if (pan && view.uz > 1.001) {
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < 8) return;
      pan.moved = true;
      eatClick = true;
      pan.x = e.clientX;
      pan.y = e.clientY;
      const d = toDeviceVec({ x: dx, y: dy }, fit?.rotated ?? false);
      const sc = fit?.scale ?? 1;
      setView({ ...view, px: view.px + d.x / sc, py: view.py + d.y / sc });
    }
  }, true);
  const lift = (e: PointerEvent) => {
    if (!pts.delete(e.pointerId)) return;
    if (pts.size < 2) pinch = null;
    if (pts.size > 0) return;
    // 빈 곳(버튼·화면·키링이 아닌 곳) 두 번 탭 = 기본 크기
    const t = e.target as Element | null;
    const plain = !pan?.moved && !eatClick && !(t && t.closest('button, .bha-key'));
    pan = null;
    if (!plain || !on) return;
    const now = e.timeStamp;
    if (now - lastTap < 320) {
      setView(VIEW_HOME, true);
      lastTap = 0;
    } else lastTap = now;
  };
  document.addEventListener('pointerup', lift, true);
  document.addEventListener('pointercancel', lift, true);
  // 핀치·끌기로 끝난 손가락의 click 은 버리고(화면 덮개가 줌인하지 않게) 다음 손가락부터 다시 받는다
  document.addEventListener('click', (e) => {
    if (!eatClick) return;
    eatClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
  document.addEventListener('wheel', (e) => {
    if (!on || e.ctrlKey || !layout || !fit) return;
    setView(zoomAt(view, wheelFactor(e.deltaY), atScreen(e.clientX, e.clientY), layout.zoom, layout.box, fit.w, fit.h));
    e.preventDefault();
  }, { passive: false });

  // ── 기울기 (설정 [기울기로 흔들기], 기본 꺼짐) ──
  const tiltOn = () => prefs.tilt && on;
  let listening = false;
  let sensed = { x: 0, y: 1 };
  const onOrient = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    const angle = (screen.orientation?.angle ?? (window as { orientation?: number }).orientation ?? 0) as number;
    sensed = smoothVec(sensed, screenGravity(e.beta, e.gamma, angle));
    const next = toDeviceVec(sensed, fit?.rotated ?? false);
    const moved = Math.hypot(next.x - gravityLocal.x, next.y - gravityLocal.y) > 0.01;
    gravityLocal = next;
    if (moved) wake();
  };
  const syncTilt = () => {
    const want = tiltOn() && typeof window.DeviceOrientationEvent !== 'undefined';
    if (want && !listening) window.addEventListener('deviceorientation', onOrient);
    if (!want && listening) window.removeEventListener('deviceorientation', onOrient);
    listening = want;
    if (!want) {
      gravityLocal = defaultGravity(fit?.rotated ?? false);
      wake();
    }
  };

  // ── 켜기·끄기 ──
  // 변환 전환이 끝나면(transitionend) 다음 단계. 값이 안 바뀌어 이벤트가 안 오면 넉넉한 시간 뒤에 끝낸다
  let animTimer = 0;
  let animDone: (() => void) | null = null;
  const finishAnim = () => {
    window.clearTimeout(animTimer);
    const d = animDone;
    animDone = null;
    frame.classList.remove('is-tama-anim');
    d?.();
  };
  frame.addEventListener('transitionend', (e) => {
    if (e.target === frame && e.propertyName === 'transform' && animDone) finishAnim();
  });
  const animate = (ms: number, done?: () => void, ease = 'var(--bha-ease-out)') => {
    frame.classList.add('is-tama-anim');
    frame.style.setProperty('--tama-dur', `${ms}ms`);
    frame.style.setProperty('--tama-ease', ease);
    window.clearTimeout(animTimer);
    animDone = done ?? (() => {});
    animTimer = window.setTimeout(finishAnim, ms * 3 + 300);
  };
  const zoomMs = () => (reduced() ? 160 : 640);

  function setFaces(): void {
    frame.classList.toggle('is-tama-back', back);
    backFace.hidden = !back;
    relayout();
  }

  function toggle(want = !on): void {
    if (want === on) return;
    on = want;
    view = VIEW_HOME;
    delete frame.dataset.tamaZoom;
    prefs = saveTamagoPrefs(store(), { ...prefs, on });
    document.documentElement.classList.toggle('bha-tama-on', on);
    if (on) {
      root.hidden = false;
      key.hidden = !worn('keyring');
      shield.hidden = false;
      frame.classList.add('is-tama');
      paintKey();
      paintDevice();
      paintPlate();
      relayout(); // 몸체·고리를 먼저 그려 둔 뒤 줌아웃
      animate(zoomMs());
      settle();
      pend = kick(pend, tapKick(1) * 0.6, reduced()); // 꺼낼 때 한 번 흔들린다
      wake();
    } else {
      closeDesigns?.();
      if (back) {
        back = false;
        flipDeg = 0;
        setFaces();
      }
      shield.hidden = true;
      animate(zoomMs(), () => {
        if (on) return;
        root.hidden = true;
        frame.classList.remove('is-tama');
      });
      dev.restage();
    }
    syncTilt();
    window.dispatchEvent(new CustomEvent(TAMAGO_EVENT));
  }

  // ── [디자인] 목록 (GDD 30장): 가진 기기 디자인 중 하나를 고르면 바로 바뀐다. 착용은 트랙별(지금 트랙의 wear.device) ──
  let closeDesigns: (() => void) | null = null;
  function openDesigns(): void {
    if (closeDesigns) return closeDesigns();
    if (!on || !save) return;
    const s = save;
    const layer = el('div', 'bha-overlay bha-overlay--in-app bha-designs');
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', '기기 디자인');
    const modal = el('div', 'bha-modal');
    modal.append(el('h2', 'bha-modal__title', '기기 디자인'), el('p', 'bha-modal__body', '다마고치 모드에서 보이는 기기 모양. 고르면 바로 바뀐다.'));
    const list = el('div', 'bha-designs__list');
    const rows = () => {
      list.replaceChildren();
      const cur = s.wear.device ?? null;
      const entries: { id: string | null; name: string; note: string }[] = [
        { id: null, name: '기본형', note: '기본 제공' },
        ...ownedDeviceDesigns(s).map((c) => ({ id: c.id, name: cosmeticName(c, faction), note: sourceNote(c) })),
      ];
      for (const e of entries) {
        const worn = e.id === cur;
        const row = el('button', `bha-designs__row${worn ? ' is-worn' : ''}`);
        row.type = 'button';
        row.dataset.design = e.id ?? 'basic';
        row.setAttribute('aria-pressed', String(worn));
        row.append(el('b', 'bha-designs__name', e.name), el('small', 'bha-designs__note', e.note), el('span', 'bha-designs__worn', worn ? '착용 중' : ''));
        row.onclick = () => pick(e.id);
        list.append(row);
      }
    };
    const pick = (id: string | null) => {
      if (id === null) unwearCategory(s, 'device');
      else if (!wearCosmetic(s, id)) return;
      hooks.persist?.();
      paintDevice();
      rows();
    };
    rows();
    const close = () => {
      if (!closeDesigns) return;
      closeDesigns = null;
      unregister();
      layer.remove();
      shield.hidden = !on;
    };
    const actions = el('div', 'bha-modal__actions');
    actions.append(button({ label: '닫기', variant: 'primary', onClick: close }));
    modal.append(list, actions);
    layer.append(modal);
    getOverlayHost().append(layer);
    const unregister = registerLayer(layer, close);
    closeDesigns = close;
    shield.hidden = true; // 화면 덮개가 목록 탭을 가리지 않게
  }

  let flipping = false;
  function flip(): void {
    if (!on || flipping) return;
    if (reduced()) {
      back = !back;
      return setFaces();
    }
    flipping = true;
    frame.classList.add('is-tama-flipping');
    const half = 260;
    flipDeg = 90;
    animate(half, () => {
      back = !back;
      setFaces();
      flipDeg = -90;
      dev.restage();
      void frame.offsetWidth; // 옆으로 선 상태를 확정한 뒤 반대쪽에서 돌아온다
      flipDeg = 0;
      requestAnimationFrame(() => {
        animate(half, () => {
          flipping = false;
          frame.classList.remove('is-tama-flipping');
        });
        dev.restage();
      });
    }, 'linear'); // 앞 절반은 고르게 돌아 옆으로 선다
    dev.restage();
  }

  // PC 단축키 (18-5 "어디서나"): B = 다마고치 모드 켬/끔
  window.addEventListener('keydown', (e) => {
    if (e.code !== TAMAGO_CODE || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.isComposing || isTypingTarget(e.target) || !currentViewState().pc) return;
    toggle();
    e.preventDefault();
  });
  // 설정 화면에서 켜고 끈 값을 따라간다
  window.addEventListener(TAMAGO_EVENT, () => {
    const p = loadTamagoPrefs(store());
    prefs = { ...p, on };
    if (p.on !== on) toggle(p.on);
    else syncTilt();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) wake();
  });

  if (prefs.on) toggle(true);

  return {
    setContext(f, s) {
      closeDesigns?.();
      faction = f;
      save = s;
      keyId = '';
      paintKey();
      paintDevice();
      paintPlate();
      if (on) {
        key.hidden = !worn('keyring');
        settle();
        wake();
      }
    },
    toggle,
    isOn: () => on,
    flip,
    openDesigns,
    debug: () => ({ on, back, pend: { ...pend }, gravity: { ...gravityLocal }, zoom: layout?.zoom ?? 1, resting: !raf }),
  };
}

/** 아이폰: [기울기로 흔들기]를 켤 때 움직임 센서 허용을 묻는다 (사용자가 누른 직후에만 부를 수 있다). 다른 기기는 바로 granted, 센서가 없으면 unsupported */
export async function requestTiltPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  const D = (typeof window !== 'undefined' ? window.DeviceOrientationEvent : undefined) as (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }) | undefined;
  if (!D) return 'unsupported';
  if (typeof D.requestPermission !== 'function') return 'granted';
  try {
    return (await D.requestPermission()) === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/** 기울기 설정을 켜거나 끈다 (설정 화면). 켤 때 허용을 못 받으면 꺼 둔 채로 안내 */
export async function setTiltPref(want: boolean): Promise<boolean> {
  const p = loadTamagoPrefs(store());
  if (want) {
    const r = await requestTiltPermission();
    if (r !== 'granted') {
      showToast({ eyebrow: '기울기로 흔들기', title: r === 'denied' ? '움직임 허용을 받지 못했다' : '이 기기에는 기울기 센서가 없다', meta: '키링은 탭·끌기로 흔들 수 있다.' }, 0, 3200);
      return false;
    }
  }
  saveTamagoPrefs(store(), { ...p, tilt: want });
  window.dispatchEvent(new CustomEvent(TAMAGO_EVENT));
  return want;
}
