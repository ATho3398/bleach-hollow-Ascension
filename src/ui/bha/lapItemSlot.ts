// 모험 소모품 칸 한 줄 (GDD 212장 3): 바퀴 끝 창(다음 바퀴 준비)에서 소모품 칸에 끼운 것을 보이고 [바꾸기]로 가방의 다른 소모품으로 바꿔 끼우거나 뺀다.
// 출발 준비 창에 소모품 칸이 생기면 같은 부품을 쓴다. 판정·바꾸기는 src/inventory.ts(setLapItem·lapItemLine), 이 파일은 그리기만 한다. 종족 무관.
import { button, el, icon } from './dom';

export interface LapItemSlotSpec {
  /** 칸 상태 한 줄 ("회복약 ×2 · 이번 바퀴 1번 쓸 수 있다") */
  line: string;
  /** 칸에 끼운 것이 있나 (없으면 [끼우기]) */
  filled: boolean;
  /** 바꿀 수 있는 것이 있나 (가방에 다른 소모품이 없고 빈 칸이면 버튼 흐림) */
  canChange: boolean;
  onChange: () => void;
}

export function lapItemSlot(s: LapItemSlotSpec): HTMLElement {
  const row = el('div', 'bha-lapitem');
  row.dataset.lapItem = s.filled ? 'filled' : 'empty';
  const label = el('span', 'bha-lapitem__label');
  label.append(icon('i-heal'), '소모품');
  const text = el('span', 'bha-lapitem__line', s.line);
  text.title = s.line;
  const btn = button({ label: s.filled ? '바꾸기' : '끼우기', variant: 'ghost', size: 'small', disabled: !s.canChange, onClick: s.onChange });
  btn.dataset.lapItemChange = '';
  row.append(label, text, btn);
  return row;
}
