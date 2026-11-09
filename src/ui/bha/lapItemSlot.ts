// 모험 소모품 칸 (GDD 212장 3): 바퀴 끝 창(다음 바퀴 준비) 머리 줄의 작은 버튼 — 끼운 것 '회복약 ×2'(빈 칸이면 '소모품 비었음'), 누르면 고르기 창에서 가방의 다른 소모품으로 바꿔 끼우거나 뺀다.
// 머리 줄(높이 48 고정)에 두어 본문(길·손 타일)을 밀지 않는다(C.358 — C.356 의 버튼 위 한 줄은 손 타일 카드를 가렸다). 다음 바퀴 상태 한 줄은 title·aria.
// 출발 준비 창에 소모품 칸이 생기면 같은 부품을 쓴다. 판정·바꾸기는 src/inventory.ts(setLapItem·lapItemLine), 이 파일은 그리기만 한다. 종족 무관.
import { button } from './dom';

export interface LapItemSlotSpec {
  /** 칸 상태 한 줄 ("회복약 ×2 · 다음 바퀴 1번 쓸 수 있다") — title·aria */
  line: string;
  /** 버튼 글 ("회복약 ×2" / 빈 칸 "소모품 비었음") */
  short: string;
  /** 칸에 끼운 것이 있나 */
  filled: boolean;
  /** 바꿀 수 있는 것이 있나 (가방에 다른 소모품이 없고 빈 칸이면 버튼 흐림) */
  canChange: boolean;
  onChange: () => void;
}

export function lapItemSlot(s: LapItemSlotSpec): HTMLElement {
  const btn = button({ label: s.short, icon: 'i-heal', variant: 'ghost', size: 'small', disabled: !s.canChange, onClick: s.onChange });
  btn.classList.add('bha-lapitem');
  btn.dataset.lapItem = s.filled ? 'filled' : 'empty';
  btn.dataset.lapItemChange = '';
  btn.title = `${s.line} — 눌러서 바꾸기`;
  btn.setAttribute('aria-label', `소모품 칸: ${s.line} — 바꾸기`);
  return btn;
}
