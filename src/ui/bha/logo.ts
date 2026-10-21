// 종족 로고 (GDD 50): 설정의 `logo` 그림 키(public/art/<키>.png) 하나만 읽는다. 단색 투명 그림이라 알파만 마스크로 쓰고 글자색(currentColor)으로 칠한다 — 테마가 바뀌면 색도 따라간다.
import type { FactionConfig } from '../../engine/faction';
import { el } from './dom';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 로고 그림 주소 (키가 없으면 null) */
export function logoUrl(f: Pick<FactionConfig, 'logo'>, base = BASE): string | null {
  return f.logo ? `${base}art/${f.logo}.png` : null;
}

/** 로고 한 개. size = bha-logo--sm | --md | --xl. 로고가 없는 종족이면 null (호출한 쪽이 기존 표시를 그대로 둔다) */
export function logoMark(f: Pick<FactionConfig, 'logo' | 'name'>, size: string): HTMLElement | null {
  const url = logoUrl(f);
  if (!url) return null;
  const mark = el('span', `bha-logo ${size}`);
  mark.style.setProperty('--bha-logo-url', `url("${url}")`);
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', `${f.name} 로고`);
  return mark;
}
