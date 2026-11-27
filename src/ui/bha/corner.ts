// 오른쪽 위 재화 칩 (GDD 14-4 v6.242 '오른쪽 위 재화 칩', C.561 — 사용자 2026-11-27 "수련장 외에도 오른쪽 위에 골드랑 영옥 갯수 항상(모험때 뺴고) 띄워놓고,
// 뭐 수련장 가면 그때만 수련권으로 바꾸는 식으로 해"): 모험(걷기·전투·바퀴 끝) 밖의 모든 화면 머리 줄 오른쪽 위에 골드·영옥 칩(상점 재화 칩과 같은 부품),
// 수련장 화면들에서는 그 자리를 수련권(지금 트랙 장수) 칩으로. 우라하라 남은 시간 칩(C.549)은 이 칸 안 재화 칩 왼쪽.
// 머리 줄(bha-lcdpage__head · bha-exp__head)이 있으면 그 줄 끝에, 없는 화면(방·월드맵·시장)은 LCD 오른쪽 위 같은 자리에 띄운다. 붙이기·갱신은 app.ts 가 한다.
import { JADE_NAME, TRADE_CURRENCY_NAME } from '../../data/economy';
import type { SaveData } from '../../game';
import { el, icon } from './dom';

export type CornerKind = 'money' | 'tickets';

/** 수련장 화면들 = 수련권 칩 (GDD 8-9 v6.242): 카드 화면 · 본능 수련 목록 · 한 판 결과 */
export const TICKET_SCREENS: ReadonlySet<string> = new Set(['practice', 'training', 'training-result']);
/** 칩이 없는 화면: 처음·슬롯·연출·모험(걷기·전투·바퀴 끝·결산 = 'expedition' 한 덩어리)·미니게임 한 판·시험 */
const NO_CORNER: ReadonlySet<string> = new Set([
  'title', 'slot-new', 'slot-load', 'slot-import', 'intro', 'identity',
  'expedition', 'training-play', 'tutorial-demo', 'test',
  'evolve-cutscene', 'fusion-scene', 'rebirth-scene',
]);

/** 화면 id → 오른쪽 위 칩 종류 (null = 없음). 전투(…-battle)와 그 결과(…-result)는 모험·전투 흐름이라 뺀다 — 수련 한 판 결과는 수련장 화면 */
export function cornerKindOf(screenId: string | undefined | null): CornerKind | null {
  if (!screenId || NO_CORNER.has(screenId)) return null;
  if (TICKET_SCREENS.has(screenId)) return 'tickets';
  if (screenId.endsWith('-battle') || screenId.endsWith('-result')) return null;
  return 'money';
}

/** 재화 칩 하나 (상점·가방 머리와 같은 부품: bha-chip + 아이콘 + 고정 폭 숫자) */
export function currencyChip(kind: 'trade' | 'jade' | 'ticket', value: number): HTMLElement {
  const spec = { trade: ['bha-chip--gold', 'v2-coin', TRADE_CURRENCY_NAME], jade: ['bha-chip--jade', 'v2-gem', JADE_NAME], ticket: ['bha-chip--ticket', 'i-practice', '수련권'] }[kind];
  const c = el('span', `bha-chip ${spec[0]}`);
  c.setAttribute('aria-label', `${spec[2]} ${value}`);
  c.title = spec[2]!;
  c.dataset.currency = kind;
  c.append(icon(spec[1]!), el('b', 'bha-num', String(value)));
  return c;
}

/** 칩 값 (순수): 골드·영옥 = 공유 재화, 수련권 = 지금 트랙 장수 */
export function cornerValues(kind: CornerKind, save: Pick<SaveData, 'shared' | 'training'>): { kind: 'trade' | 'jade' | 'ticket'; value: number }[] {
  return kind === 'tickets'
    ? [{ kind: 'ticket', value: save.training.tickets }]
    : [{ kind: 'trade', value: save.shared.tradeCoins }, { kind: 'jade', value: save.shared.jade }];
}

/** 오른쪽 위 칸을 화면에 붙이거나 값을 고친다 (같은 값이면 그대로 — 1초 시계가 불러도 깜빡이지 않게). 칸 = .bha-corner (안에 우라하라 칩 → 재화 칩) */
export function placeCorner(app: HTMLElement, kind: CornerKind, save: Pick<SaveData, 'shared' | 'training'>): HTMLElement {
  const head = app.querySelector<HTMLElement>(':scope > header.bha-lcdpage__head, :scope > header.bha-exp__head');
  const host = head ?? app;
  let box = app.querySelector<HTMLElement>(':scope > .bha-corner, :scope > header > .bha-corner');
  if (box && box.parentElement !== host) (box.remove(), (box = null));
  if (!box) {
    box = el('div', 'bha-corner');
    box.dataset.corner = '';
    host.append(box);
  }
  box.classList.toggle('is-float', !head);
  const vals = cornerValues(kind, save);
  const key = `${kind}:${vals.map((v) => v.value).join(',')}`;
  if (box.dataset.corner !== key) {
    box.dataset.corner = key;
    box.dataset.kind = kind;
    box.querySelectorAll(':scope > [data-currency]').forEach((n) => n.remove());
    box.append(...vals.map((v) => currencyChip(v.kind, v.value)));
  }
  return box;
}
