// 잠긴 화면의 뒤로 (GDD 128장 4, C.202): 원정 흐름(걷기·흡수·결과·바퀴 끝 창)처럼 화면 스택이 뒤로 빠지지 않는 화면도
// 뒤로(◀·Esc·폰 뒤로)가 '무언가'를 하게 한다 — 창 닫기 / 일시정지 / 넘어가기 확인. 열린 레이어(확인 창 등)가 있으면 그쪽이 먼저 닫는다.
import { registerCancelHook } from './shortcuts';

/**
 * 화면 뒤로 처리기를 건다. alive() 가 false 면 등록을 지운다(화면을 떠났다). mine() 이 false 면(잠깐 다른 화면이 덮음) 이번 뒤로는 건드리지 않는다.
 * run() 이 false 를 돌려주면 처리 안 한 것으로 본다. 돌려주는 함수로 등록을 푼다
 */
export function onScreenBack(o: { alive: () => boolean; mine?: () => boolean; run: () => boolean | void }): () => void {
  return registerCancelHook((top) => {
    if (!o.alive()) return 'gone';
    if (top || (o.mine && !o.mine())) return false;
    return o.run() !== false;
  }, { button: true });
}

/** 잠긴 화면에서 '뒤로 = 이 버튼'으로 표시한다 (결과 [확인]·연출 [계속]·[건너뛰기]). app 의 뒤로가 처리기 없는 잠긴 화면에서 이것을 누른다 */
export function asBack<T extends HTMLElement>(b: T): T {
  b.dataset.back = '';
  return b;
}
