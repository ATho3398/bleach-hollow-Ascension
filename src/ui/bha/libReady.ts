// '해방 가능!' 알림 (GDD 215장, C.353). 옛 발밑 기운(.bha-libaura — 줄기·입자·맥동, 임시)은 C.473 에서 삭제: 해방 준비 = 오라 시트(bankaiAura.ts, GDD 15-6).
// 알림 = 해방 게이지가 가득 차는 순간(준비 안 됨 → 됨) 한 번, 전투 장면 가운데 위쪽, 약 1.2초, 누름 통과.
import { el } from './dom';

/** 알림 문구: 종족 설정의 해방 이름 + ' 가능!' (이름은 종족 json liberation.name / baseName — 코드에 쓰지 않는다) */
export function libReadyText(name: string): string {
  return `${name} 가능!`;
}

/** 준비 상태를 매 화면 갱신마다 넣으면, 준비 안 됨 → 됨으로 바뀐 순간에만 true. 가득 찬 채로 있는 동안은 다시 울리지 않는다 */
export function libReadyEdge(): (ready: boolean) => boolean {
  let prev = false;
  return (ready) => {
    const rose = ready && !prev;
    prev = ready;
    return rose;
  };
}

/** 가운데 위쪽 알림(.bha-libready): 장면에 한 번 넣어 두고, 울릴 때마다 글자를 바꿔 다시 튼다 */
export function libReadyNoticeEl(): HTMLElement {
  const n = el('div', 'bha-libready');
  n.setAttribute('role', 'status');
  n.setAttribute('aria-live', 'polite');
  n.append(el('span', 'bha-libready__text'));
  return n;
}
