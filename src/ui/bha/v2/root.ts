// LCD 인게임 UI v2 루트 (C.151, docs/bha-ui-handoff README 0·5): `.bha-root` = 640×330 고정 좌표계.
// 실제 LCD 창(약 646×360)에 맞게 --v2-scale 로 줄이고 가운데에 놓는다. 테마는 루트 클래스 하나(`bha-${종족 설정 theme}`)로만 바뀐다 — 종족 id 분기 없음.
import type { FactionConfig } from '../../../engine/faction';
import { endScreen } from '../screenScope';

/** 핸드오프가 그린 LCD 크기 (README 0) */
export const V2_W = 640;
export const V2_H = 330;

/** 창 크기(w×h)에 640×330 을 통째로 넣는 배율 (순수) — 1 을 넘기지 않아 글자가 키워져 번지지 않는다 */
export function v2Scale(w: number, h: number): number {
  if (!(w > 0) || !(h > 0)) return 1;
  return Math.min(1, w / V2_W, h / V2_H);
}

/** 루트 클래스: 기본 + 종족 테마 (예 `bha-root bha-hollow`) */
export function v2RootClass(faction: Pick<FactionConfig, 'theme'>): string {
  return `bha-root bha-${faction.theme}`;
}

export interface V2Mount {
  /** LCD 창을 채우는 틀 */
  host: HTMLElement;
  /** 640×330 루트 — 화면 요소는 여기에 붙인다 */
  root: HTMLElement;
  /** 크기 관찰 해제 */
  dispose: () => void;
}

/** LCD 창(view) 안에 v2 루트를 만든다. 옛 화면 틀(mountApp)을 거치지 않고 창 전체를 쓴다 */
export function mountV2Root(view: HTMLElement, faction: Pick<FactionConfig, 'theme'>, ...nodes: (Node | string)[]): V2Mount {
  const host = document.createElement('div');
  host.className = 'bha-v2host';
  const root = document.createElement('div');
  root.className = v2RootClass(faction);
  root.append(...nodes);
  host.append(root);
  endScreen(view); // 앞 화면이 screenSignal 로 건 리스너를 푼다 (C.139)
  view.replaceChildren(host);
  const fit = (): void => {
    root.style.setProperty('--v2-scale', String(v2Scale(host.clientWidth, host.clientHeight)));
    root.style.setProperty('--v2-w', String(V2_W));
    root.style.setProperty('--v2-h', String(V2_H));
  };
  fit();
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
  ro?.observe(host);
  return { host, root, dispose: () => ro?.disconnect() };
}
