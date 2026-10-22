// 안내 문구 줄바꿈 (GDD 73장, C.126): 본문 한 덩어리를 줄 단위로 그린다. 문구 데이터에서 "\n" = 줄바꿈, `**이름**` = 항목 이름(굵게).
// 항목을 나열하는 안내(포식 네 갈래·타일 설명 등)가 한 줄에 이어 붙어 읽기 힘들던 것을 항목당 한 줄로 푼다. 공용 한 곳이라 튜토리얼·안내 카드·도움말이 같이 쓴다.
import { el } from './dom';

export interface Seg {
  /** 굵게(항목 이름) */
  b: boolean;
  s: string;
}

/** 본문 → 줄 목록 (줄마다 굵게/보통 조각). 빈 줄은 버린다. `**` 짝이 안 맞으면 그 뒤는 보통 글씨 */
export function parseLines(text: string): Seg[][] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const segs: Seg[] = [];
      const parts = line.split('**');
      // 짝수 개수 조각이면(여는 ** 만 있고 닫는 것이 없음) 마지막 ** 는 글자 그대로 둔다
      const paired = parts.length % 2 === 1 ? parts.length : parts.length - 1;
      for (let i = 0; i < paired; i++) {
        const s = i === paired - 1 && parts.length !== paired ? parts.slice(i).join('**') : parts[i]!;
        if (s !== '') segs.push({ b: i % 2 === 1, s });
      }
      return segs;
    });
}

/** 줄이 하나면 `p`(전과 같다), 둘 이상이면 줄마다 `p` 를 담은 `div`. cls 는 바깥 요소에 붙는다 */
export function linesBody(text: string, cls: string): HTMLElement {
  const lines = parseLines(text);
  const row = (segs: Seg[], tag: 'p' | 'span' = 'p'): HTMLElement => {
    const r = el(tag, tag === 'p' && lines.length > 1 ? 'bha-lines__row' : '');
    for (const g of segs) r.append(g.b ? el('b', 'bha-lines__name', g.s) : document.createTextNode(g.s));
    return r;
  };
  if (lines.length <= 1) {
    const p = row(lines[0] ?? []);
    p.className = cls;
    return p;
  }
  const box = el('div', `${cls} bha-lines`);
  for (const l of lines) box.append(row(l));
  return box;
}
