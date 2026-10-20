// 연출 꾸밈 재생 (GDD 25-11, C.61): 등장·진화·흡수·승리 연출. 입은 연출(루트 data-cos-<분류>, cosmetics.ts 가 건다)이 없으면 아무것도 하지 않는다(기본 = 지금처럼).
// 모양은 cosmetics.css 의 .bha-cfx 가 그린다. 색은 꾸밈 토큰(--bha-cos-*)을 --cfx 로 넘기기만 한다.
// 모션 줄이기(기기 '동작 줄이기' 또는 설정 '화면 흔들림' 끔)이면 움직임 없이 짧은 페이드 한 번.
import { cosmeticToken, getCosmetic } from '../../data/shop';
import { loadFxSettings, prefersReducedMotion } from '../fxSettings';

export type CosmeticFxKind = 'enter' | 'evo' | 'absorb' | 'win';

/** 연출 길이(ms): 등장 1초(GDD 25-11), 나머지는 정한 값 (GDD 25-12) */
export const COSMETIC_FX_MS: Readonly<Record<CosmeticFxKind, number>> = { enter: 1000, evo: 3000, absorb: 900, win: 1400 };
/** 모션 줄이기 때의 짧은 페이드 길이 */
export const REDUCED_FX_MS = 320;
/** 입자 수 (꽃잎·빛 흩어짐) */
const PARTICLES: Readonly<Record<string, number>> = { petal: 14, light: 12 };

const dataKey = (c: CosmeticFxKind): string => `cos${c[0]!.toUpperCase()}${c.slice(1)}`;

/** 지금 입은 그 분류의 모양 키 (없으면 null = 기본) */
export function wornLook(kind: CosmeticFxKind | 'cut' | 'talk' | 'room' | 'frame', root: HTMLElement = document.documentElement): string | null {
  return root.dataset[`cos${kind[0]!.toUpperCase()}${kind.slice(1)}`] ?? null;
}

/** 연출 길이 (순수): 모션 줄이기면 짧은 페이드 */
export function fxDuration(kind: CosmeticFxKind, reduced: boolean): number {
  return reduced ? REDUCED_FX_MS : COSMETIC_FX_MS[kind];
}

/** 모션 줄이기가 켜져 있나 */
export function motionReduced(): boolean {
  let shakeOff = false;
  try {
    shakeOff = !loadFxSettings(localStorage).shake;
  } catch {
    /* 저장소를 못 쓰면 기기 설정만 따른다 */
  }
  return prefersReducedMotion() || shakeOff;
}

/**
 * host 위에 연출을 한 번 얹는다. 입은 연출이 없으면 null(아무 일도 없음). 끝나면 겹침을 치우고 onEnd.
 * host 는 위치 기준(absolute/relative)이어야 한다. 반환: 얹은 겹침 요소.
 */
export function playCosmeticFx(kind: CosmeticFxKind, host: HTMLElement, onEnd?: () => void): HTMLElement | null {
  const look = wornLook(kind);
  const item = look ? getCosmetic(`${kind}-${look}`) : undefined;
  if (!look || !item) return null;
  const reduced = motionReduced();
  const ms = fxDuration(kind, reduced);
  const ov = document.createElement('div');
  ov.className = `bha-cfx bha-cfx--${kind} bha-cfx--${kind}-${look}${reduced ? ' is-reduced' : ''}`;
  ov.dataset.cfx = `${kind}-${look}`;
  ov.setAttribute('aria-hidden', 'true');
  ov.style.setProperty('--cfx-ms', `${ms}ms`);
  ov.style.setProperty('--cfx', `var(${cosmeticToken(item)})`);
  if (!reduced) {
    for (let i = 0; i < (PARTICLES[look] ?? 0); i++) {
      const p = document.createElement('i');
      p.className = 'bha-cfx__p';
      // 흩어짐 방향은 번호로 정한다 (난수 없음 — 캡처·테스트가 같은 모양)
      const a = (i / (PARTICLES[look] ?? 1)) * Math.PI * 2;
      p.style.setProperty('--i', String(i));
      p.style.setProperty('--x', String(20 + ((i * 37) % 60)));
      p.style.setProperty('--y', String(30 + ((i * 53) % 50)));
      p.style.setProperty('--dx', String(Math.round(Math.cos(a) * 40)));
      p.style.setProperty('--dy', String(look === 'petal' ? 40 + (i % 4) * 8 : -30 - (i % 4) * 8));
      ov.append(p);
    }
  }
  const hostCls = reduced ? 'has-cfx-reduced' : `has-cfx-${kind}-${look}`;
  host.style.setProperty('--cfx-ms', `${ms}ms`);
  // 겹침이 host 안에 자리 잡도록: 위치 기준이 아니면 연출 동안만 relative
  const lent = getComputedStyle(host).position === 'static';
  if (lent) host.style.position = 'relative';
  host.classList.add(hostCls);
  host.append(ov);
  window.setTimeout(() => {
    ov.remove();
    host.classList.remove(hostCls);
    if (lent) host.style.removeProperty('position');
    onEnd?.();
  }, ms + 40);
  return ov;
}

/** 원정 출발 → 걷기 화면 첫 등장 연출을 한 번만 (app.ts 가 출발 때 걸고, 걷기 화면이 한 번 쓴다) */
let enterArmed = false;
export function armEnterFx(): void {
  enterArmed = true;
}
export function takeEnterFx(): boolean {
  const was = enterArmed;
  enterArmed = false;
  return was;
}
