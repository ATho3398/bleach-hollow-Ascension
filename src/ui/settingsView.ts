// 설정 화면 (GDD 14-3, C.18 / U-1 새 디자인): 블록 클릭 판정 시간·드래그 임계치. localStorage 별도 키에 저장하고 세이브 구조는 건드리지 않는다.
import { button, el, notice, slider } from './bha/dom';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { nudgeValue } from './bha/util';
import {
  clampPointerRules, DEFAULT_POINTER_RULES, loadPointerRules, POINTER_RANGES, resetPointerRules, savePointerRules, type PointerRules,
} from './pointer';

export function settingsView(root: HTMLElement, onHelp?: () => void, restored = false): void {
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

  // 클릭 판정 시간 + 눌림 시간 미리보기
  const press = el('div', 'bha-press');
  press.style.setProperty('--t', String(rules.clickMaxSeconds));
  press.append(el('span', 'bha-press__ok'), el('span', 'bha-press__lbl bha-press__lbl--ok', '이 안에 떼면 사용'), el('span', 'bha-press__lbl bha-press__lbl--no', '사용 안 됨'));
  const pressScale = el('div', 'bha-press__scale');
  pressScale.append(el('span', '', '0초'), el('span', '', '0.4초'), el('span', '', '0.8초'));
  const tap = slider({
    id: 'set-tap', label: '클릭 판정 시간', unit: '초', ...rangeOf('clickMaxSeconds'), step: 0.05, value: rules.clickMaxSeconds,
    format: (v) => v.toFixed(2), defaultText: `기본 ${DEFAULT_POINTER_RULES.clickMaxSeconds}`,
    hint: '눌렀다 떼는 시간이 이보다 길면 사용 안 됨 (들었다 놓은 것으로 본다).',
    onInput: (v) => {
      apply({ clickMaxSeconds: v });
      press.style.setProperty('--t', String(v));
    },
  });
  withSteppers(tap, 'set-tap', 0.05, '클릭 판정 시간');
  tap.append(press, pressScale);

  // 드래그 거리 + 임계 원 미리보기
  const ring = el('span', 'bha-dragprev__ring');
  ring.style.setProperty('--d', String(rules.dragThresholdPx));
  const pad = el('span', 'bha-dragprev__pad');
  pad.append(ring, el('span', 'bha-dragprev__dot'));
  const prev = el('div', 'bha-dragprev');
  prev.append(pad, el('p', '', '손가락이 점선 원 밖으로 움직이면 드래그(순서 바꾸기)로 본다. 작을수록 쉽게 끌리고, 클수록 누르기가 안정적이다.'));
  const drag = slider({
    id: 'set-drag', label: '드래그 거리', unit: 'px', ...rangeOf('dragThresholdPx'), step: 1, value: rules.dragThresholdPx,
    format: (v) => String(v), defaultText: `기본 ${DEFAULT_POINTER_RULES.dragThresholdPx}`,
    onInput: (v) => {
      apply({ dragThresholdPx: v });
      ring.style.setProperty('--d', String(v));
    },
  });
  withSteppers(drag, 'set-drag', 1, '드래그 거리');
  drag.append(prev);

  const panelOf = (...n: Node[]) => {
    const p = el('section', 'bha-panel');
    p.append(...n);
    return p;
  };

  const reset = button({
    label: '기본값 복원', icon: 'i-loop',
    onClick: () => {
      resetPointerRules(storage);
      settingsView(root, onHelp, true);
    },
  });
  const foot: Node[] = [reset];
  if (onHelp) foot.push(button({ label: '도움말·튜토리얼 다시 보기', icon: 'i-help', onClick: onHelp }));
  foot.push(restored
    ? notice('good', `기본값으로 되돌렸다 (${DEFAULT_POINTER_RULES.clickMaxSeconds}초 · ${DEFAULT_POINTER_RULES.dragThresholdPx}px).`)
    : el('p', 'bha-faint', '이 기기에만 저장되고 게임 세이브에는 들어가지 않는다.'));
  lcdPage(root, { cls: 'bha-settings-page', foot }, lcdHead({ title: '설정', sub: '조작 판정 — 블록과 저장 필살기에 똑같이 적용' }), [panelOf(tap)], [panelOf(drag)]);
}

/** 슬라이더 양옆에 −/+ 버튼을 붙인다: 위/아래/확정 버튼만으로도 값을 한 칸씩 바꿀 수 있게 (슬라이더 입력 자체는 손가락용, 선택 대상에서 뺀다) */
function withSteppers(root: HTMLElement, id: string, step: number, name: string): void {
  const input = root.querySelector<HTMLInputElement>(`#${id}`)!;
  input.setAttribute('data-dev-skip', '');
  const nudge = (dir: 1 | -1) => {
    input.value = String(nudgeValue(Number(input.value), dir, step, Number(input.min), Number(input.max)));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const row = el('div', 'bha-slider__row');
  input.replaceWith(row);
  row.append(
    button({ label: `${name} 줄이기`, icon: 'i-minus', iconOnly: true, onClick: () => nudge(-1) }),
    input,
    button({ label: `${name} 늘리기`, icon: 'i-plus', iconOnly: true, onClick: () => nudge(1) }),
  );
}

function rangeOf(k: keyof typeof POINTER_RANGES): { min: number; max: number } {
  return { min: POINTER_RANGES[k][0], max: POINTER_RANGES[k][1] };
}
