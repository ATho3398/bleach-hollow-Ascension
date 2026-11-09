// 해방 준비 오라 · '해방 가능!' 알림 (GDD 215장, C.353)
// 오라 = 캐릭터 발밑에서 위로 솟구치는 기운(줄기·입자·맥동). 테두리형 빛은 쓰지 않는다(기기 초점 .bha-sel 과 구분).
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

/** 기운 줄기: 가로 자리(%)·키(그림 높이 비율) — 가운데가 가장 높은 불꽃 모양 */
const FLAMES: readonly (readonly [number, number])[] = [[16, 0.6], [32, 0.85], [50, 1.05], [68, 0.85], [84, 0.6]];
/** 입자: 가로 자리(%)·옆 흔들림(px) */
const SPARKS: readonly (readonly [number, number])[] = [[12, 4], [26, -3], [38, 5], [48, -4], [58, 3], [70, -5], [80, 4], [90, -2]];

/** 발밑 기운 요소(.bha-libaura): 캐릭터 그림(.bha-hero) 첫 자식으로 넣는다. 보이는 것은 CSS(.is-lib-ready) */
export function libAuraEl(): HTMLElement {
  const aura = el('span', 'bha-libaura');
  aura.setAttribute('aria-hidden', 'true');
  aura.append(el('span', 'bha-libaura__base'));
  FLAMES.forEach(([x, h], i) => {
    const f = el('span', 'bha-libaura__flame');
    f.style.setProperty('--x', `${x}%`);
    f.style.setProperty('--h', `${h * 100}%`);
    f.style.setProperty('--i', String(i));
    aura.append(f);
  });
  SPARKS.forEach(([x, dx], i) => {
    const s = el('span', 'bha-libaura__spark');
    s.style.setProperty('--x', `${x}%`);
    s.style.setProperty('--dx', `${dx}px`);
    s.style.setProperty('--i', String(i));
    aura.append(s);
  });
  return aura;
}

/** 가운데 위쪽 알림(.bha-libready): 장면에 한 번 넣어 두고, 울릴 때마다 글자를 바꿔 다시 튼다 */
export function libReadyNoticeEl(): HTMLElement {
  const n = el('div', 'bha-libready');
  n.setAttribute('role', 'status');
  n.setAttribute('aria-live', 'polite');
  n.append(el('span', 'bha-libready__text'));
  return n;
}
