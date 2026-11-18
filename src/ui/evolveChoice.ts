// 진화 미루기 창 (GDD 8-5 [초안] 추천안, C.497): 진화 기준에 닿아 둥지로 돌아오면 진화 연출 전에 [미루기] [진화]를 고른다.
// 미루면 그 단계에 머물고 다음 귀환 때 다시 묻는다. 숨은 조건(허무형 = 미루기 0회)은 화면에 말하지 않는다.
// 기기 취소·Esc 로는 닫히지 않는다 — 실수로 미루기가 세어지지 않게(둘 중 하나를 꼭 고른다). 기본 초점 = [진화](추천).
import { confirmDialog } from './confirmDialog';

export const EVOLVE_CHOICE_TITLE = '몸에 변화가 일어나려 한다';
export const EVOLVE_CHOICE_BODY = '지금 진화할까? 미루면 지금 모습으로 남고, 다음에 둥지로 돌아올 때 다시 묻는다.';

/** [진화] [미루기] 창을 연다. 하나를 고르면 닫히고 그 콜백 */
export function evolveChoiceDialog(o: { onEvolve: () => void; onDefer: () => void }): () => void {
  return confirmDialog({
    title: EVOLVE_CHOICE_TITLE,
    body: EVOLVE_CHOICE_BODY,
    yes: '진화',
    no: '미루기',
    noCancel: true,
    cls: 'bha-evolve-choice',
    onYes: o.onEvolve,
    onNo: o.onDefer,
  });
}
