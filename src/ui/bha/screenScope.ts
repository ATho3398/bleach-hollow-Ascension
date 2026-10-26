// 화면 수명 (C.139, GDD 88장 4·6): 한 root 에 그려진 화면이 쓰는 window 리스너 등을 AbortSignal 하나로 묶는다.
// 그 root 에 다음 화면이 그려질 때(mountApp) 앞 화면의 신호가 끊겨 리스너가 한 번에 풀린다.
const scopes = new WeakMap<Node, AbortController>();

/** 지금 root 에 그려진 화면의 신호. 화면을 그린(mountApp) 뒤에 받는다 */
export function screenSignal(root: Node): AbortSignal {
  let c = scopes.get(root);
  if (!c) scopes.set(root, (c = new AbortController()));
  return c.signal;
}

/** root 의 화면이 끝났다: 그 화면이 받은 신호를 끊는다 (mountApp 이 새 화면을 그리기 직전에 부른다) */
export function endScreen(root: Node): void {
  scopes.get(root)?.abort();
  scopes.delete(root);
}
