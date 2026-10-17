// 시드 고정 난수 (mulberry32). 같은 시드 = 같은 전투.
// 상태가 평범한 객체라 structuredClone 으로 전투 상태째 복제할 수 있다.

export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** [0, 1) */
export function nextFloat(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** [0, n) 정수 */
export function nextInt(rng: Rng, n: number): number {
  return Math.floor(nextFloat(rng) * n);
}
