// 강적 조우 WARNING 경고 화면 (GDD 76장, C.128): 전투 시작 전 약 1.5초, 슈팅 게임 보스 경고처럼 — 위·아래 붉은 사선 띠가 흐르고, 가운데 WARNING 이 깜빡이고,
// "강적 출현 — 이름" + 속성 칩. 히든 속성(혈·독·허)이면 "히든 속성" 줄을 더하고 띠 색을 그 속성 색 토큰으로. 화면을 누르면 건너뛴다. 소리 없음.
import { el } from './bha/dom';
import { elementMark } from './bha/element';
import { getOverlayHost, registerLayer } from './bha/overlayHost';
import { prefersReducedMotion } from './fxSettings';
import { isHiddenElement, warningBandToken, warningLine, warningMs, type WarningKind } from './warningLogic';

export interface WarningOptions {
  kind: WarningKind;
  /** 적 이름(종족 표기 적용 후) */
  name: string;
  elementId: string;
  factionId: string;
  /** 끝났거나 건너뛰었을 때 (전투 화면을 연다) */
  onDone: () => void;
}

export interface WarningHandle {
  skip(): void;
}

export function playWarning(o: WarningOptions): WarningHandle {
  const reduced = prefersReducedMotion();
  const hidden = isHiddenElement(o.elementId);
  const layer = el('div', `bha-warn${reduced ? ' is-still' : ''}${hidden ? ' is-hidden-element' : ''}`);
  layer.setAttribute('role', 'alertdialog');
  layer.setAttribute('aria-label', warningLine(o.kind, o.name));
  layer.style.setProperty('--warn-color', `var(${warningBandToken(o.elementId)})`);

  const top = el('div', 'bha-warn__band bha-warn__band--top');
  const bottom = el('div', 'bha-warn__band bha-warn__band--bottom');
  const center = el('div', 'bha-warn__center');
  const line = el('p', 'bha-warn__line');
  line.append(warningLine(o.kind, o.name), ' ', elementMark(o.elementId, o.factionId));
  center.append(el('h2', 'bha-warn__word', 'WARNING'), line);
  if (hidden) {
    const h = el('p', 'bha-warn__hidden');
    h.append('히든 속성 ', elementMark(o.elementId, o.factionId));
    center.append(h);
  }
  const skipBtn = el('button', 'bha-warn__skip') as HTMLButtonElement;
  skipBtn.type = 'button';
  skipBtn.setAttribute('aria-label', '건너뛰기');
  layer.append(top, bottom, center, skipBtn);
  getOverlayHost().append(layer);
  const unregister = registerLayer(layer, () => finish());
  skipBtn.focus({ preventScroll: true });

  let done = false;
  let timer = window.setTimeout(() => finish(), warningMs(reduced));
  function finish(): void {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    unregister();
    layer.remove();
    o.onDone();
  }
  skipBtn.onclick = () => finish();
  return { skip: finish };
}
