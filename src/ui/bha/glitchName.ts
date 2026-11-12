// 이름 글리치 (GDD 12-4 v6.027, C.430 — 사용자 "미싱노마냥 이름 일부 의도적으로 깨지게"): 초월자 데이터 nameGlitch 인 이름이 화면에 찍히면
// 평소엔 원래 이름, 1~3초 무작위 간격으로 1~2글자가 0.1~0.2초 깨진 글자로 바뀌었다 돌아오고, 가끔 RGB 어긋남. 글자 칸 폭은 원래 글자 그대로(겹쳐 그림) — 레이아웃이 안 흔들린다.
// 읽기 이름(aria-label)·저장값은 원래 이름. 동작 줄이기면 고정 깨짐 1글자. 화면에서 빠진 이름은 다음 타이머에서 멈춘다(누수 없음).
// 화면에 이름이 찍히는 길이 많아(도감·합체·이름표·전환 메뉴·알림 띠·확인 창·결과 …) 앱 루트에 관찰자 하나(installNameGlitch)를 두고 글자 노드를 바꾼다 — 화면마다 고칠 필요 없음.
// 이름을 직접 그리는 곳은 transcendentNameNode 를 쓴다. 종족·초월자 id 분기 없음 — 데이터 표시(nameGlitch)만 본다.
import { TRANSCENDENTS, type TranscendentDef } from '../../data/transcendents';
import { prefersReducedMotion } from '../fxSettings';

/** 깨진 글자 (GDD 12-4 v6.027) */
export const GLITCH_CHARS = ['▓', '█', '░', '¿', 'Ж', '⌧'] as const;
/** 타이밍 (ms): 다음 깨짐까지 1~3초 · 깨진 채 0.1~0.2초 · RGB 어긋남 확률 */
export const GLITCH_TIMING = { gapMin: 1000, gapMax: 3000, holdMin: 100, holdMax: 200, rgbChance: 0.3 } as const;

/** 글리치 이름 목록 (데이터 nameGlitch) */
export function glitchNames(defs: readonly TranscendentDef[] = TRANSCENDENTS): string[] {
  return defs.filter((d) => d.nameGlitch === true).map((d) => d.name);
}

/** 한 번 깨질 때: 바꿀 글자 자리(공백 제외 1~2개)와 깨진 글자. rand = 0 이상 1 미만 */
export function glitchFrame(name: string, rand: () => number = Math.random): { at: number[]; chars: string[]; rgb: boolean } {
  const slots = [...name].map((c, i) => (c.trim() ? i : -1)).filter((i) => i >= 0);
  if (slots.length === 0) return { at: [], chars: [], rgb: false };
  const n = Math.min(slots.length, rand() < 0.5 ? 1 : 2);
  const left = [...slots];
  const at: number[] = [];
  while (at.length < n) at.push(left.splice(Math.floor(rand() * left.length), 1)[0]!); // 같은 자리를 두 번 고르지 않는다
  at.sort((a, b) => a - b);
  return { at, chars: at.map(() => GLITCH_CHARS[Math.floor(rand() * GLITCH_CHARS.length)]!), rgb: rand() < GLITCH_TIMING.rgbChance };
}

/** 동작 줄이기·캡처 고정 때 늘 깨져 있는 한 글자 (가운데) */
export function fixedGlitchAt(name: string): number {
  const slots = [...name].map((c, i) => (c.trim() ? i : -1)).filter((i) => i >= 0);
  return slots[Math.floor(slots.length / 2)] ?? 0;
}

// 캡처·테스트 모드: 모든 글리치 이름을 깨진 순간에 고정 (C.430 "타이머를 테스트 모드에서 고정해 찍기")
let frozen = false;
const live = new Set<HTMLElement>();
export function setGlitchFrozen(on: boolean): void {
  frozen = on;
  for (const el of [...live]) (el.isConnected ? paint : (x: HTMLElement) => live.delete(x))(el);
}

function charsOf(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>('.bha-glitch__c')];
}

function clearFrame(el: HTMLElement): void {
  for (const c of charsOf(el)) { c.classList.remove('is-on'); delete c.dataset.g; }
  el.classList.remove('is-rgb');
}

function showFrame(el: HTMLElement, at: readonly number[], chars: readonly string[], rgb: boolean): void {
  const cs = charsOf(el);
  at.forEach((i, k) => { const c = cs[i]; if (c) { c.dataset.g = chars[k]!; c.classList.add('is-on'); } });
  el.classList.toggle('is-rgb', rgb);
}

/** 지금 상태로 다시 그림: 고정(캡처)이면 깨진 순간, 동작 줄이기면 고정 1글자, 아니면 원래 이름 */
function paint(el: HTMLElement): void {
  clearFrame(el);
  const name = el.getAttribute('aria-label') ?? '';
  if (frozen) showFrame(el, [fixedGlitchAt(name), [...name].length - 1].filter((v, i, a) => a.indexOf(v) === i), ['▓', '¿'], true);
  else if (prefersReducedMotion()) showFrame(el, [fixedGlitchAt(name)], ['▓'], false);
}

function schedule(el: HTMLElement): void {
  const T = GLITCH_TIMING;
  const gap = T.gapMin + Math.random() * (T.gapMax - T.gapMin);
  window.setTimeout(() => {
    if (!el.isConnected) { live.delete(el); return; } // 화면에서 빠졌다 — 멈춤
    if (frozen || prefersReducedMotion()) { paint(el); schedule(el); return; }
    const f = glitchFrame(el.getAttribute('aria-label') ?? '');
    showFrame(el, f.at, f.chars, f.rgb);
    window.setTimeout(() => { if (!frozen) clearFrame(el); schedule(el); }, T.holdMin + Math.random() * (T.holdMax - T.holdMin));
  }, gap);
}

/** 글리치 이름 요소: 글자마다 칸(원래 글자 폭 그대로, 깨진 글자는 위에 겹쳐 그림). 읽기 이름 = 원래 이름 */
export function glitchNameEl(name: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'bha-glitch';
  el.setAttribute('aria-label', name);
  el.setAttribute('role', 'text');
  for (const ch of name) {
    const c = document.createElement('span');
    c.className = 'bha-glitch__c';
    c.setAttribute('aria-hidden', 'true');
    c.textContent = ch;
    el.append(c);
  }
  live.add(el);
  paint(el);
  if (typeof window !== 'undefined') schedule(el);
  return el;
}

/** 초월자 이름을 화면에 그리는 노드 하나 (C.430): 데이터 nameGlitch 면 글리치 요소, 아니면 글자 그대로 */
export function transcendentNameNode(def: Pick<TranscendentDef, 'name' | 'nameGlitch'>): Node {
  return def.nameGlitch ? glitchNameEl(def.name) : document.createTextNode(def.name);
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'TITLE', 'OPTION']);

/** 글자 노드 하나에서 글리치 이름을 찾아 글리치 요소로 바꾼다 */
function wrapText(t: Text, names: readonly string[]): void {
  const p = t.parentElement;
  if (!p || SKIP.has(p.tagName) || p.closest('.bha-glitch')) return;
  const text = t.data;
  const hit = names.map((n) => ({ n, i: text.indexOf(n) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i)[0];
  if (!hit) return;
  const after = t.splitText(hit.i);
  const rest = after.splitText(hit.n.length);
  after.replaceWith(glitchNameEl(hit.n));
  wrapText(rest, names);
}

function scan(node: Node, names: readonly string[]): void {
  if (node.nodeType === Node.TEXT_NODE) { wrapText(node as Text, names); return; }
  if (!(node instanceof Element) || SKIP.has(node.tagName) || node.closest('.bha-glitch')) return;
  const all = node.textContent ?? '';
  if (!names.some((n) => all.includes(n))) return;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let x = walker.nextNode(); x; x = walker.nextNode()) if (names.some((n) => (x as Text).data.includes(n))) texts.push(x as Text);
  for (const t of texts) wrapText(t, names);
}

/** 앱 루트 하나에 건다 (C.430): 이후 그려지는 모든 글자에서 글리치 이름을 글리치 요소로. 끌 때 쓰는 함수를 돌려준다 */
export function installNameGlitch(root: Node = document.body, names: readonly string[] = glitchNames()): () => void {
  if (names.length === 0 || typeof MutationObserver === 'undefined') return () => {};
  scan(root, names);
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') scan(m.target, names);
      else m.addedNodes.forEach((n) => scan(n, names));
    }
  });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
  return () => mo.disconnect();
}
