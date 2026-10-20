// 사진 (GDD 25-11, C.61): 방 장면(배경·내 캐릭터 그림·착용 꾸밈·이름표)을 캔버스에 직접 그려 PNG 로 만든다. 외부 라이브러리 없음 (DOM 캡처 금지, 11-1).
// 색은 디자인 토큰(--bha-*)을 실행 때 읽어 쓴다 (코드에 색 직접 금지). 세이브에는 아무것도 남기지 않는다.
import { COSMETIC_ITEMS, cosmeticToken } from '../../data/shop';

/** 사진 크기: 장면 720×480 + 아래 한 줄 64 + 액자 테두리 28 */
export const PHOTO = { scene: { w: 720, h: 480 }, frame: 28, caption: 64 } as const;
export const PHOTO_SIZE = { w: PHOTO.scene.w + PHOTO.frame * 2, h: PHOTO.scene.h + PHOTO.caption + PHOTO.frame * 2 } as const;

export interface FrameChoice {
  /** 액자 품목 id (null = 기본 액자, 무료) */
  id: string | null;
  name: string;
  /** 모양 키 (bone·ink·gold, 기본 = null) */
  look: string | null;
}

/** 고를 수 있는 액자: 기본 + 산 것 (순서는 상점 표 순서) */
export function frameChoices(owned: readonly string[]): FrameChoice[] {
  return [
    { id: null, name: '기본', look: null },
    ...COSMETIC_ITEMS.filter((c) => c.category === 'frame' && owned.includes(c.id)).map((c) => ({ id: c.id, name: c.name, look: c.look })),
  ];
}

/** 파일 이름: bha-<종족>-<날짜>.png (날짜 YYYY-MM-DD, 지역 시각) */
export function photoFileName(factionId: string, d: Date): string {
  return `bha-${factionId}-${dateText(d)}.png`;
}

export function dateText(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 사진 아래 한 줄: 이름 · 단계 · 날짜 */
export function captionText(name: string, stage: string, d: Date): string {
  return `${name} · ${stage} · ${dateText(d)}`;
}

export interface PhotoScene {
  /** 내 캐릭터 그림 주소 (없으면 자리표시 도형) */
  charSrc: string | null;
  charScale: number;
  charOffsetY: number;
  /** 방 배경 그림 주소 (없으면 벽·바닥 면) */
  sceneSrc: string | null;
  /** 입은 꾸밈 (분류 → 모양 키): 오라·색조·방 꾸미기·이름표 테 */
  look: { aura?: string; tint?: string; room?: string; plate?: string };
  name: string;
  stage: string;
  date: Date;
  /** 고른 액자 (기본이면 look null) */
  frame: FrameChoice;
}

type Css = (name: string) => string;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 사진을 canvas 에 그린다 (크기는 PHOTO_SIZE). 그림 파일이 없거나 못 불러오면 자리표시 도형으로 */
export async function drawPhoto(canvas: HTMLCanvasElement, sc: PhotoScene): Promise<void> {
  canvas.width = PHOTO_SIZE.w;
  canvas.height = PHOTO_SIZE.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cs = getComputedStyle(document.documentElement);
  const css: Css = (n) => cs.getPropertyValue(n).trim();
  const tok = (cat: string, look: string, part = '') => css(cosmeticToken({ category: cat as 'room', look }, part));
  const [charImg, sceneImg] = await Promise.all([sc.charSrc ? loadImage(sc.charSrc) : null, sc.sceneSrc ? loadImage(sc.sceneSrc) : null]);
  const F = PHOTO.frame;
  const { w: SW, h: SH } = PHOTO.scene;

  // 바탕: 액자 안쪽 전체를 장면 색으로
  ctx.fillStyle = css('--bha-bg-0') || '#000';
  ctx.fillRect(0, 0, PHOTO_SIZE.w, PHOTO_SIZE.h);
  ctx.save();
  ctx.translate(F, F);
  ctx.beginPath();
  ctx.rect(0, 0, SW, SH);
  ctx.clip();

  // ── 방 장면: 배경 그림 또는 벽·바닥 (방 꾸미기 테마가 있으면 그 색) ──
  const room = sc.look.room;
  const wall = room ? tok('room', room, 'wall') : css('--bha-bg-1');
  const floor = room ? tok('room', room, 'floor') : css('--bha-bg-2');
  const line = room ? tok('room', room, 'line') : css('--bha-line-2');
  if (sceneImg && !room) {
    ctx.drawImage(sceneImg, 0, 0, SW, SH);
  } else {
    const floorY = Math.round(SH * 0.62);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, SW, floorY);
    ctx.fillStyle = floor;
    ctx.fillRect(0, floorY, SW, SH - floorY);
    ctx.strokeStyle = line;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    ctx.lineTo(SW, floorY);
    ctx.stroke();
    // 테마 무늬: dusk = 가로 줄 / bloom = 꽃잎 점 / night = 달과 별
    ctx.fillStyle = line;
    ctx.globalAlpha = 0.5;
    if (room === 'dusk') for (let y = 36; y < floorY; y += 34) ctx.fillRect(0, y, SW, 2);
    if (room === 'bloom') for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % SW, (i * 53) % (floorY - 10), 7, 4);
    if (room === 'night') {
      for (let i = 0; i < 30; i++) ctx.fillRect((i * 89) % SW, (i * 41) % (floorY - 20), 3, 3);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(SW * 0.8, SH * 0.2, 34, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!room) {
      // 기본 방: 벽 세로 줄 (방 모양 room 의 자리표시와 같은 느낌)
      ctx.fillStyle = css('--bha-bg-2');
      for (let x = 0; x < SW; x += 56) ctx.fillRect(x, 0, 2, floorY);
    }
  }

  // ── 내 캐릭터: 오라 → (색조 필터) 그림 ──
  const cx = SW / 2;
  const footY = SH * 0.86;
  const size = SH * 0.62;
  if (sc.look.aura) {
    const g = ctx.createRadialGradient(cx, footY - size * 0.5, 4, cx, footY - size * 0.5, size * 0.75);
    g.addColorStop(0, tok('aura', sc.look.aura));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SW, SH);
  }
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, footY + 6, size * 0.3, size * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  if (sc.look.tint && 'filter' in ctx) ctx.filter = tok('tint', sc.look.tint);
  if (charImg) {
    const s = size * sc.charScale;
    const dy = (sc.charOffsetY / 100) * size;
    // 그림은 정사각 캔버스 기준선(아래 8%) — 발바닥이 footY 에 오게 맞춘다
    ctx.drawImage(charImg, cx - s / 2, footY - s * 0.92 + dy, s, s);
  } else {
    // 자리표시 도형: 둥근 몸 + 눈 둘 (그림이 없을 때의 방 캐릭터와 같은 모양)
    ctx.fillStyle = css('--bha-text-2');
    ctx.strokeStyle = css('--bha-line-2');
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(cx, footY - size * 0.3, size * 0.3, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = css('--bha-bg-0');
    ctx.beginPath();
    ctx.arc(cx - size * 0.1, footY - size * 0.36, size * 0.04, 0, Math.PI * 2);
    ctx.arc(cx + size * 0.1, footY - size * 0.36, size * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ── 이름표 (왼쪽 위): 이름표 테 꾸밈이 있으면 그 색 테 ──
  ctx.font = `700 22px ${css('--bha-font-display') || 'sans-serif'}`;
  const tw = ctx.measureText(sc.name).width + 28;
  ctx.fillStyle = css('--bha-bg-0');
  ctx.globalAlpha = 0.78;
  ctx.fillRect(16, 16, tw, 40);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = sc.look.plate ? tok('plate', sc.look.plate) : css('--bha-line-2');
  ctx.lineWidth = sc.look.plate ? 3 : 1;
  ctx.strokeRect(16, 16, tw, 40);
  ctx.fillStyle = css('--bha-text-1');
  ctx.textBaseline = 'middle';
  ctx.fillText(sc.name, 30, 37);
  ctx.restore();

  // ── 아래 한 줄: 이름 · 단계 · 날짜 ──
  ctx.fillStyle = css('--bha-bg-1');
  ctx.fillRect(F, F + SH, SW, PHOTO.caption);
  ctx.fillStyle = css('--bha-text-1');
  ctx.font = `600 22px ${css('--bha-font-body') || css('--bha-font-display') || 'sans-serif'}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(captionText(sc.name, sc.stage, sc.date), PHOTO_SIZE.w / 2, F + SH + PHOTO.caption / 2);
  ctx.textAlign = 'start';

  // ── 액자 ──
  drawFrame(ctx, sc.frame.look, css);
}

function drawFrame(ctx: CanvasRenderingContext2D, look: string | null, css: Css): void {
  const { w, h } = PHOTO_SIZE;
  const F = PHOTO.frame;
  const color = look ? css(`--bha-cos-frame-${look}`) : css('--bha-line-2');
  const edge = (x: number, y: number, ww: number, hh: number) => ctx.fillRect(x, y, ww, hh);
  ctx.fillStyle = look ? color : css('--bha-bg-2');
  const t = look ? F : 6;
  edge(0, 0, w, t);
  edge(0, h - t, w, t);
  edge(0, 0, t, h);
  edge(w - t, 0, t, h);
  if (!look) return;
  // 입체감: 바깥은 어둡게, 안쪽은 밝게 한 줄
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  edge(0, 0, w, 3);
  edge(0, h - 3, w, 3);
  edge(0, 0, 3, h);
  edge(w - 3, 0, 3, h);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  edge(t - 4, t - 4, w - 2 * t + 8, 2);
  edge(t - 4, h - t + 2, w - 2 * t + 8, 2);
  edge(t - 4, t - 4, 2, h - 2 * t + 8);
  edge(w - t + 2, t - 4, 2, h - 2 * t + 8);
  // 모서리 장식
  ctx.fillStyle = look === 'ink' ? css('--bha-text-3') : 'rgba(0,0,0,0.4)';
  for (const [x, y] of [[8, 8], [w - 20, 8], [8, h - 20], [w - 20, h - 20]] as const) edge(x, y, 12, 12);
  if (look === 'gold') {
    // 금박 빛 번쩍임 한 줄
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    edge(0, 0, w, t);
    edge(0, h - t, w, t);
    edge(0, 0, t, h);
    edge(w - t, 0, t, h);
  }
}

/** 캔버스 → PNG 파일로 저장 (기기 다운로드) */
export function savePhoto(canvas: HTMLCanvasElement, fileName: string): Promise<boolean> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      resolve(true);
    }, 'image/png');
  });
}
