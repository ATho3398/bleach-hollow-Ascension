// 원정 걷기 중 [가방] (GDD 144장 3, C.223): 체력 회복 물건 4종 중 골라 쓴다. 기기 ▲▼ = 고르기 · ✓ = 쓰기 · 뒤로 = 닫기 (122장).
// 쓰면 창 위 체력 막대가 0.8초 동안 차오르고 숫자도 따라 오른다(GDD 201장 — 회복 수치 글자·따로 뜨는 창 없음)와 남은 개수. 판정·차감은 src/inventory.ts useHealItemOnWalk, 이 파일은 그리기만 한다. 종족 무관.
import { button, el, meter } from './dom';
import { iconArt, itemCard, itemGrid } from './itemUi';
import { ACTION_FILL_MS, tween } from './actionFx';
import { applyBlink, blinkGauges, tagGauge } from './gaugeBlink';
import { trapModalFocus } from './modalFocus';
import { getOverlayHost, registerLayer } from './overlayHost';

export interface HealBagItem {
  id: string;
  name: string;
  count: number;
  /** 효과 한 줄 ("체력 +10%") */
  detail: string;
  /** 소모품 칸에 끼운 것 (GDD 212장 1 — 모험 중 쓸 수 있는 유일한 것) */
  slotted?: boolean;
  /** 못 쓰는 이유 (끼운 것이 아님 · 이번 바퀴에 씀 등, GDD 212장 1·2). 있으면 카드 흐림, 누르면 이유 한 줄 */
  lock?: string | null;
}

export interface HealBagSpec {
  /** 지금 가진 회복 물건 (0개도 흐리게 보인다) */
  items: () => HealBagItem[];
  /** 소모품 칸 상태 한 줄 (GDD 212장 2: '회복약 ×2 · 이번 바퀴 1번 쓸 수 있다' / '이번 바퀴에 이미 썼다'). 없으면 숨김 */
  status?: () => string;
  /** 지금 체력 비율 0~1 */
  hp: () => number;
  /** 쓴다: 성공이면 전·후 비율, 못 쓰면 이유 */
  use: (id: string) => { ok: true; from: number; to: number } | { ok: false; reason: string };
  onClose: () => void;
}

/** 가방 창을 연다. 돌려주는 함수는 창을 닫는다 */
export function healBag(o: HealBagSpec): () => void {
  const layer = el('div', 'bha-overlay bha-overlay--in-app bha-confirm bha-healbag');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', '가방 — 회복 물건');
  const modal = el('div', 'bha-modal');
  let closed = false;
  let untrap: () => void = () => {};
  let unregister: () => void = () => {};
  let note = '';
  /** 차오르는 중 보여 줄 체력 비율 (null = 지금 값) */
  let fillHp: number | null = null;
  let stopFill: () => void = () => {};
  const hpSlot = el('div', 'bha-healbag__hp');
  const paintHp = () => {
    const pct = Math.round((fillHp ?? o.hp()) * 100);
    hpSlot.replaceChildren(tagGauge(meter({ kind: 'player', label: '체력', icon: 'i-heal', value: pct, max: 100, compact: true, inside: true, zoneLow: 0.3, danger: pct < 30, valueText: `${pct}%` }), 'hp'));
    applyBlink(hpSlot); // 쓰는 동안 깜빡임 (GDD 208장 3)
  };
  const close = () => {
    if (closed) return;
    closed = true;
    stopFill();
    unregister();
    layer.remove();
    untrap();
    o.onClose();
  };
  const render = (focusId?: string) => {
    const pct = Math.round(o.hp() * 100);
    paintHp();
    const cards = o.items().map((it) => {
      const c = itemCard({
        id: it.id, name: it.name, detail: it.detail, art: iconArt('i-heal'), badge: `×${it.count}`,
        foot: it.slotted ? (it.lock ? '끼움 · 씀' : '끼움') : undefined,
        state: it.lock || !(it.count > 0 && pct < 100) ? 'locked' : it.slotted ? 'worn' : undefined,
        onClick: () => {
          if (it.lock) {
            note = it.lock;
            return render(it.id);
          }
          const r = o.use(it.id);
          if (!r.ok) {
            note = r.reason;
            return render(it.id);
          }
          note = '';
          stopFill();
          render(it.id);
          if (Math.round(r.from * 100) !== Math.round(r.to * 100)) blinkGauges(hpSlot, ['hp']); // 바뀌는 체력 막대·아이콘만 깜빡임 (GDD 208장 3)
          stopFill = tween(ACTION_FILL_MS, (t) => {
            fillHp = t >= 1 ? null : r.from + (r.to - r.from) * t;
            paintHp();
          }, undefined, false);
        },
      });
      return c;
    });
    modal.replaceChildren(
      el('h2', 'bha-modal__title', '가방 — 회복 물건'),
      hpSlot,
      ...(o.status ? [el('p', 'bha-modal__body bha-healbag__slot', o.status())] : []),
      itemGrid(cards, '회복 물건이 없다. 상점 약 칸에서 산다.', 'i-heal'),
      ...(note ? [el('p', 'bha-modal__body', note)] : []),
      (() => {
        const a = el('div', 'bha-modal__actions');
        a.append(button({ label: '닫기', variant: 'ghost', onClick: close }));
        return a;
      })(),
    );
    const f = (focusId && modal.querySelector<HTMLElement>(`[data-item="${focusId}"]`)) || modal.querySelector<HTMLElement>('.bha-itemcard');
    f?.focus({ preventScroll: true });
  };
  layer.append(modal);
  getOverlayHost().append(layer);
  render();
  untrap = trapModalFocus(layer);
  render(); // 초점을 첫 물건으로 (trap 이 첫 버튼에 둔 초점을 바꾼다)
  unregister = registerLayer(layer, close);
  return close;
}
