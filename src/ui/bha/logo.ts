// 종족 로고 (GDD 50): 설정의 `logo` 그림 키(public/art/<키>.png) 하나만 읽는다. 단색 투명 그림이라 알파만 마스크로 쓰고 글자색(currentColor)으로 칠한다 — 테마가 바뀌면 색도 따라간다.
import type { FactionConfig } from '../../engine/faction';
import { el } from './dom';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 로고 그림 주소 (키가 없으면 null) */
export function logoUrl(f: Pick<FactionConfig, 'logo'>, base = BASE): string | null {
  return f.logo ? `${base}art/${f.logo}.png` : null;
}

/** 커스텀 속성에 넣는 url("…"): baseURI(문서 주소)가 있으면 절대 주소로 만든다 */
export function logoCssUrl(url: string, baseURI?: string): string {
  return `url("${baseURI ? new URL(url, baseURI).href : url}")`;
}

/** 로고 한 개. size = bha-logo--sm | --md | --xl. 로고가 없는 종족이면 null (호출한 쪽이 기존 표시를 그대로 둔다) */
export function logoMark(f: Pick<FactionConfig, 'logo' | 'name'>, size: string): HTMLElement | null {
  const url = logoUrl(f);
  if (!url) return null;
  const mark = el('span', `bha-logo ${size}`);
  // 커스텀 속성 안의 url() 은 CSS 파일 기준으로 풀린다 → 빌드(base './')에서 './art/…' 가 /assets/art/… 로 가서 404 였다(C.111). 문서 기준 절대 주소로 만든다
  mark.style.setProperty('--bha-logo-url', logoCssUrl(url, typeof document !== 'undefined' ? document.baseURI : undefined));
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', `${f.name} 로고`);
  return mark;
}
