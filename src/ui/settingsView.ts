// 설정 화면 (GDD 14-3, C.18): 블록 클릭 판정 시간·드래그 임계치. localStorage 별도 키에 저장하고 세이브 구조는 건드리지 않는다.
import { el, mountScreen } from './dom';
import {
  clampPointerRules, DEFAULT_POINTER_RULES, loadPointerRules, POINTER_RANGES, resetPointerRules, savePointerRules, type PointerRules,
} from './pointer';

function slider(label: string, unit: string, range: readonly [number, number], step: number, value: number, onChange: (v: number) => void, hint: string): HTMLElement {
  const box = el('div', 'setting');
  const out = el('b', '', `${value}${unit}`);
  const input = el('input');
  input.type = 'range';
  input.min = String(range[0]);
  input.max = String(range[1]);
  input.step = String(step);
  input.value = String(value);
  input.oninput = () => {
    const v = Number(input.value);
    out.textContent = `${v}${unit}`;
    onChange(v);
  };
  const head = el('div', 'row');
  head.append(el('span', '', label), out);
  box.append(head, input, el('small', 'dim', `${hint} (범위 ${range[0]}~${range[1]}${unit}, 기본 ${label.startsWith('클릭') ? DEFAULT_POINTER_RULES.clickMaxSeconds : DEFAULT_POINTER_RULES.dragThresholdPx}${unit})`));
  return box;
}

export function settingsView(root: HTMLElement, onBack: () => void): void {
  const storage = (() => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  })();
  let rules: PointerRules = loadPointerRules(storage);
  const apply = (patch: Partial<PointerRules>) => {
    rules = savePointerRules(storage, clampPointerRules({ ...rules, ...patch }));
  };
  const reset = el('button', '', '기본값으로 되돌리기');
  reset.onclick = () => {
    resetPointerRules(storage);
    settingsView(root, onBack);
  };
  const back = el('button', 'primary', '돌아가기');
  back.onclick = onBack;
  mountScreen(
    root,
    el('h1', '', '설정'),
    el('h2', '', '블록 조작'),
    slider('클릭 판정 시간', '초', POINTER_RANGES.clickMaxSeconds, 0.05, rules.clickMaxSeconds, (v) => apply({ clickMaxSeconds: v }), '누른 지 이 시간 안에 떼면 블록 사용. 넘기면 사용 안 됨'),
    slider('드래그 임계치', 'px', POINTER_RANGES.dragThresholdPx, 1, rules.dragThresholdPx, (v) => apply({ dragThresholdPx: v }), '이만큼 움직이면 순서 바꾸기(드래그)로 본다'),
    el('small', 'dim', '이 설정은 이 기기에만 저장되고 게임 세이브에는 들어가지 않는다.'),
    reset,
    back,
  );
}
