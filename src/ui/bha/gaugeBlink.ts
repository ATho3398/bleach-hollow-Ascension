// 바뀌는 상태 값 깜빡임 (GDD 208장 3): 상태창 값(배부름·컨디션·영압 안정도/리스크·체력)이 오르거나 내리는 동안 그 막대와 아이콘만 깜빡인다.
// 바뀌는 동안(차오름 0.8초) + 끝난 뒤 짧게(0.25초 간격 3번). 안 바뀐 값은 그대로. 동작 줄이기(prefers-reduced-motion)면 CSS 가 깜빡임 대신 테두리 강조 한 번(room.css).
// 그리는 쪽은 막대 줄마다 data-gauge="<값 이름>" 을 달고, 다시 그릴 때마다 applyBlink(host) 를 부른다 — 줄이 새로 만들어져도 박자(animation-delay)가 이어진다. 종족 무관.
import { ACTION_FILL_MS } from './actionFx';

/** 깜빡임 한 번 간격 (마스터 수치 0.25초 — 화면 연출값이라 balance 밖) */
export const GAUGE_BLINK_PERIOD_MS = 750; // C.345 (GDD 208장 보충): 사용자 "점멸 주기 너무 빨라서 정신없어. 1/3로 낮춰" — 0.25초 → 0.75초. room.css bha-gauge-blink 시간과 같은 값
/** 바뀐 뒤 더 깜빡이는 횟수 */
export const GAUGE_BLINK_AFTER = 3;
/** 깜빡이는 막대 줄에 붙는 클래스 */
export const BLINK_CLASS = 'is-changing';

/** 깜빡임 대상 값 이름 = 상태창 줄 이름(roomLogic StatusChip.kind) + 체력 */
export type GaugeKey = 'hunger' | 'cond' | 'stab' | 'risk' | 'hp';

interface BlinkState { keys: Set<string>; t0: number; until: number; timer: ReturnType<typeof setTimeout> | 0 }
const states = new WeakMap<HTMLElement, BlinkState>();

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 막대 줄(또는 meter)에 값 이름을 단다 */
export function tagGauge<T extends HTMLElement>(node: T, key: GaugeKey): T {
  node.dataset.gauge = key;
  return node;
}

/** 두 값 묶음에서 반올림해 숫자가 달라진 값 이름 (오름·내림 모두). 체력은 비율(0~1)이라 % 로 비교 */
export function changedKeys<T extends Partial<Record<GaugeKey, number>>>(a: T | null | undefined, b: T): GaugeKey[] {
  if (!a) return [];
  const out: GaugeKey[] = [];
  for (const k of ['hunger', 'cond', 'stab', 'risk', 'hp'] as const) {
    const x = a[k], y = b[k];
    if (x === undefined || y === undefined) continue;
    const diff = k === 'hp' ? Math.round(x * 100) !== Math.round(y * 100) : Math.round(x) !== Math.round(y);
    if (diff) out.push(k);
  }
  return out;
}

/**
 * host 안 data-gauge 줄 중 keys 에 든 것만 ms(바뀌는 시간) + 끝난 뒤 3번 깜빡인다.
 * 이미 깜빡이는 중이면 박자를 그대로 두고 값 이름을 더하고 끝 시각을 늦춘다(온천처럼 0.1초마다 바뀌는 화면).
 */
export function blinkGauges(host: HTMLElement, keys: readonly string[], ms = ACTION_FILL_MS): void {
  if (keys.length === 0) return;
  const t = now();
  const until = t + Math.max(0, ms) + GAUGE_BLINK_PERIOD_MS * GAUGE_BLINK_AFTER;
  let s = states.get(host);
  if (s && s.until > t) {
    for (const k of keys) s.keys.add(k);
    s.until = Math.max(s.until, until);
    clearTimeout(s.timer);
  } else {
    s = { keys: new Set(keys), t0: t, until, timer: 0 };
    states.set(host, s);
  }
  const st = s;
  st.timer = setTimeout(() => {
    if (states.get(host) !== st) return;
    states.delete(host);
    for (const node of host.querySelectorAll<HTMLElement>(`[data-gauge].${BLINK_CLASS}`)) {
      node.classList.remove(BLINK_CLASS);
      node.style.removeProperty('--blink-delay');
    }
  }, Math.max(0, st.until - t));
  applyBlink(host);
}

/** 지금 깜빡이는 값 이름 (테스트·proof 용) */
export function blinkingKeys(host: HTMLElement): string[] {
  return [...(states.get(host)?.keys ?? [])];
}

/** 다시 그린 뒤 부른다: host 가 깜빡이는 중이면 data-gauge 줄에 깜빡임 클래스를 붙인다 (박자 = 처음 깜빡인 때부터, 새로 만든 줄도 같은 박자). 끝나면 타이머가 뗀다 */
export function applyBlink(host: HTMLElement): void {
  const s = states.get(host);
  if (!s) return;
  const delay = `${-Math.round(now() - s.t0)}ms`;
  for (const node of host.querySelectorAll<HTMLElement>('[data-gauge]')) {
    const on = s.keys.has(node.dataset.gauge ?? '');
    node.classList.toggle(BLINK_CLASS, on);
    if (on) node.style.setProperty('--blink-delay', delay);
    else node.style.removeProperty('--blink-delay');
  }
}
