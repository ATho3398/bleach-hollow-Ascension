// 화면 공용 도구
import { fixParticles } from '../engine/josa';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = fixParticles(text);  // 이름을 끼운 문구의 "이(가)" 등을 받침에 맞게 (C.93)
  return e;
}
