// 사냥터 배경 그림 층 (GDD 34-1): 걷기 화면은 층별 시차 스크롤(가로 반복, transform 만 움직인다), 전투 화면은 정지.
// 층 위에 어둡기 덮개를 한 겹 깔아 LCD 위 글자가 읽히게 한다. 그림이 없으면 아무것도 만들지 않는다(지금 모습 그대로).
import { groundBgId, towerBgId, type FactionConfig } from '../../engine/faction';
import { sceneBg, type SceneBg } from '../../data/art/backgrounds';
import { el } from './dom';

const ART_BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 이 종족의 사냥터 배경 (없으면 null) */
export function groundSceneBg(faction: Pick<FactionConfig, 'huntingGrounds'>, groundId: string | undefined): SceneBg | null {
  return sceneBg(groundBgId(faction, groundId), ART_BASE);
}

/** 등급전·보스전 무대 배경 (종족 설정 arenaBg, 없으면 null) */
export function arenaSceneBg(faction: Pick<FactionConfig, 'arenaBg'>): SceneBg | null {
  return sceneBg(faction.arenaBg, ART_BASE);
}

/** 배경 층 묶음 (`.bha-scenebg`). moving = 걷기 화면(흐름), 아니면 정지 */
export function sceneBgEl(bg: SceneBg, moving: boolean): HTMLElement {
  const box = el('div', `bha-scenebg${moving ? ' is-moving' : ''}`);
  box.setAttribute('aria-hidden', 'true');
  box.dataset.scene = bg.id;
  for (const l of bg.layers) {
    const layer = el('span', 'bha-scenebg__layer');
    // 사용자 정의 속성 안의 상대 주소는 스타일시트 위치 기준으로 풀리므로 문서 기준 절대 주소로 넣는다
    layer.style.setProperty('--bg-url', `url("${new URL(l.url, document.baseURI).href}")`);
    layer.style.setProperty('--layer-h', String(l.height));
    if (l.bottom) layer.style.setProperty('--layer-b', String(l.bottom));
    layer.style.setProperty('--tile-ratio', String(l.ratio));
    layer.style.setProperty('--layer-speed', String(l.speed));
    box.append(layer);
  }
  box.append(el('span', 'bha-scenebg__dim'));
  return box;
}

/** 탑 전투 배경 (보스 층 = 무대, 보통 층 = ★에 맞는 사냥터, 없으면 null) */
export function towerSceneBg(faction: Parameters<typeof towerBgId>[0], floor: { star: number; kind: string }): SceneBg | null {
  return sceneBg(towerBgId(faction, floor), ART_BASE);
}
