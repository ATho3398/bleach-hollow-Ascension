// 세로로 들었는지 (GDD 16-4 T-2): 세로면 "가로로 돌려주세요" 안내가 화면을 덮는다(device.css 의 같은 조건).
// 전투·원정은 세로가 되면 자동으로 일시정지하고, 가로로 돌아와도 저절로 재개하지 않는다(사용자가 확정으로 계속).
export const PORTRAIT_QUERY = '(orientation: portrait)';

export function isPortrait(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PORTRAIT_QUERY).matches;
}

/** 세로로 바뀌는 순간 fn 을 부른다. alive() 가 false 가 되면 스스로 풀린다 */
export function onPortrait(fn: () => void, alive: () => boolean): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  const mq = window.matchMedia(PORTRAIT_QUERY);
  const handler = () => {
    if (!alive()) return mq.removeEventListener('change', handler);
    if (mq.matches) fn();
  };
  mq.addEventListener('change', handler);
}
