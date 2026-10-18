// 둥지 계열 화면 전용 DOM 헬퍼 (U-3): 상태 블록, 돌보기, 계통 누적 막대, 덱 행, 더보기 메뉴, 탭바, 토스트.
// 공용 헬퍼는 ./dom, 계통 마크는 ./lineage. 순수 계산은 ./nestLogic (테스트 대상).
import type { TerrainTileDef } from '../../data/schema';
import { lineageName } from '../../data/lineages';
import { button, el, icon, meter, panel } from './dom';
import { lineageKey } from './lineage';
import { linbarModel, type LinbarModel } from './nestLogic';
import { LINEAGES } from '../../data/lineages';
import { NEST_ACTIONS, type FactionConfig, type NestAction } from '../../engine/faction';

/** 타일 종류 → 덱 행 색·아이콘 (디자인 --bha-tile-*). combo 는 색이 없어 환경으로 본다 */
const TILE_KIND: Record<string, { cls: string; icon: string }> = {
  'prey-nest': { cls: 'prey', icon: 'i-tile-prey' },
  'elite-den': { cls: 'elite', icon: 'i-tile-elite' },
  environment: { cls: 'env', icon: 'i-tile-env' },
  rest: { cls: 'rest', icon: 'i-tile-rest' },
  combo: { cls: 'env', icon: 'i-tile-combo' },
};
export const tileKindOf = (t: Pick<TerrainTileDef, 'kind'>) => TILE_KIND[t.kind] ?? TILE_KIND.environment!;

/** 돌보기 3버튼: 이름은 종족 설정, 아래 작은 글씨는 효과 */
export function careButtons(faction: FactionConfig, onAct: (a: NestAction) => void): HTMLElement {
  const meta: Record<NestAction, { icon: string; cls: string; sub: string }> = {
    feed: { icon: 'i-care-feed', cls: 'feed', sub: '허기 −' },
    sleep: { icon: 'i-care-sleep', cls: 'sleep', sub: '컨디션 +' },
    pet: { icon: 'i-care-pet', cls: 'pet', sub: `${faction.stabilityName} +` },
  };
  const root = el('div', 'bha-care');
  for (const a of NEST_ACTIONS) {
    const b = el('button', `bha-care__btn bha-care__btn--${meta[a].cls}`);
    b.type = 'button';
    b.append(icon(meta[a].icon), el('span', '', faction.nestActions[a]), el('small', '', meta[a].sub));
    b.onclick = () => onAct(a);
    root.append(b);
  }
  return root;
}

export interface StatusOpts {
  hunger: number;
  condition: number;
  stability: number;
  stabilityMax: number;
  risk: number;
  riskLimit: number;
  /** 컨디션 경고 기준 (미만이면 위험) / 리스크 경고 기준 (이상이면 높음) */
  condWarn: number;
  riskWarn: number;
}

/** 상태 4바: 허기·컨디션·안정 수치·리스크. 경고 문구는 기존 규칙 그대로 */
export function statusBlock(faction: FactionConfig, s: StatusOpts): HTMLElement {
  const root = el('div', 'bha-nest__status');
  root.append(
    meter({ kind: 'hunger', label: '허기', icon: 'i-hunger', value: Math.round(s.hunger), max: 100 }),
    meter({
      kind: 'cond', label: '컨디션', icon: 'i-cond', value: Math.round(s.condition), max: 100,
      danger: s.condition < s.condWarn, note: s.condition < s.condWarn ? '나쁨: 전투에 공허 블록 ↑' : undefined,
    }),
    meter({ kind: 'stab', label: faction.stabilityName, icon: 'i-stab', value: Math.round(s.stability), max: s.stabilityMax }),
    meter({
      kind: 'risk', label: faction.riskGaugeName, icon: 'i-risk', value: Math.round(s.risk), max: s.riskLimit,
      zone: s.riskWarn / s.riskLimit, danger: s.risk >= s.riskWarn, note: s.risk >= s.riskWarn ? '높음: 원정 시작부터 위험' : undefined,
    }),
  );
  return root;
}

/** 계통 누적 막대: 조각 폭 --n, 범례 5칸(횟수·1위 강조·0이면 흐림) */
export function linbar(faction: FactionConfig, scores: Record<string, number | undefined>, need: number): HTMLElement {
  const m: LinbarModel = linbarModel(scores, LINEAGES.map((l) => l.id), need);
  const root = el('div', 'bha-linbar');
  const track = el('div', 'bha-linbar__track');
  track.setAttribute('aria-label', '계통 분포');
  for (const s of m.segs) {
    const key = lineageKey(s.id);
    const seg = el('span', `bha-linbar__seg${key ? ` bha-lin--${key}` : ''}`);
    seg.style.setProperty('--n', String(s.n));
    track.append(seg);
  }
  if (m.empty > 0) {
    const empty = el('span', 'bha-linbar__empty');
    empty.style.flex = `${m.empty} 1 0`;
    track.append(empty);
  }
  const legend = el('div', 'bha-linbar__legend');
  for (const l of LINEAGES) {
    const key = lineageKey(l.id);
    const n = scores[l.id] ?? 0;
    const item = el('span', ['bha-linbar__item', key ? `bha-lin--${key}` : '', n === 0 ? 'is-zero' : '', m.lead === l.id ? 'is-lead' : ''].filter(Boolean).join(' '));
    if (key) item.append(icon(`i-lin-${key}`));
    item.append(el('b', '', String(n)), el('small', '', lineageName(l.id, faction.id)));
    legend.append(item);
  }
  root.append(track, legend);
  return root;
}

export interface DeckRowOpts {
  name: string;
  hint: string;
  owned: number;
  count: number;
  tile: Pick<TerrainTileDef, 'kind'>;
  canAdd: boolean;
  provisional?: boolean;
  onMinus: () => void;
  onPlus: () => void;
}

/** 덱 행: 타일 아이콘(색) · 이름·효과·보유 · −/수량/+ */
export function deckRow(o: DeckRowOpts): HTMLElement {
  const kind = tileKindOf(o.tile);
  const row = el('div', o.count === 0 ? 'bha-deckrow is-zero' : 'bha-deckrow');
  row.style.setProperty('--tile', `var(--bha-tile-${kind.cls})`);
  const ic = el('span', 'bha-deckrow__icon');
  ic.append(icon(kind.icon));
  const name = el('span', 'bha-deckrow__name', o.name);
  if (o.provisional) name.append(' ', el('span', 'bha-tag bha-tag--provisional', '임시'));
  const desc = el('span', 'bha-deckrow__desc');
  desc.append(`${o.hint} · `, el('span', 'bha-deckrow__own', `보유 ${o.owned}`));
  const main = el('span', 'bha-deckrow__main');
  main.append(name, desc);
  const step = el('span', 'bha-deckrow__stepper');
  const minus = button({ iconOnly: true, label: `${o.name} 빼기`, icon: 'i-minus', disabled: o.count === 0, onClick: o.onMinus });
  const plus = button({ iconOnly: true, label: `${o.name} 더하기`, icon: 'i-plus', disabled: !o.canAdd, onClick: o.onPlus });
  step.append(minus, el('span', 'bha-deckrow__count', String(o.count)), plus);
  row.append(ic, main, step);
  return row;
}

/** 더보기 메뉴 한 줄 */
export function menuRow(o: { icon: string; label: string; meta?: string; onClick: () => void }): HTMLElement {
  const b = el('button', 'bha-menu__row');
  b.type = 'button';
  b.append(icon(o.icon), o.label, el('small', '', o.meta ?? ''), icon('i-chevron-right'));
  b.onclick = o.onClick;
  return b;
}

export interface TabItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
}

/** 하단 탭바 (role=tablist). 선택은 aria-selected, 배지는 0 이면 숨김 */
export function tabbar(items: TabItem[], selected: string, onSelect: (id: string) => void): HTMLElement {
  const root = el('nav', 'bha-tabbar');
  root.setAttribute('role', 'tablist');
  root.setAttribute('aria-label', '둥지 메뉴');
  const btns = items.map((it) => {
    const b = el('button', 'bha-tabbar__item');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset.tab = it.id;
    b.setAttribute('aria-selected', String(it.id === selected));
    b.append(icon(it.icon), it.label);
    if (it.badge) {
      const badge = el('span', 'bha-tabbar__badge', String(it.badge));
      badge.setAttribute('aria-label', `${it.badge}개`);
      b.append(badge);
    }
    b.onclick = () => {
      for (const o of btns) o.setAttribute('aria-selected', String(o === b));
      onSelect(it.id);
    };
    return b;
  });
  root.append(...btns);
  return root;
}

/** 칭호 해금 토스트: 위에서 내려와(is-in) 2.5초 뒤 올라가고(is-out) animationend 에서 제거한다. 여러 개면 위에서부터 겹치지 않게 쌓는다 */
export function showToast(o: { eyebrow: string; title: string; meta?: string }, index = 0, holdMs = 2500, doc: Document = document): HTMLElement {
  const toast = el('div', 'bha-toast is-in');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.style.marginTop = `${index * 72}px`;
  const ic = el('span', 'bha-toast__icon');
  ic.append(icon('i-title'));
  const body = el('span');
  body.append(el('span', 'bha-toast__eyebrow', o.eyebrow), el('br'), el('span', 'bha-toast__title', o.title));
  if (o.meta) body.append(el('br'), el('span', 'bha-toast__meta', o.meta));
  toast.append(ic, body);
  doc.body.append(toast);
  // 연출이 꺼진(reduced-motion) 환경에서도 animationend 가 오므로 이 이벤트로 정리한다. 안전 장치로 타이머도 둔다.
  const remove = () => toast.remove();
  toast.addEventListener('animationend', (e) => {
    if ((e as AnimationEvent).animationName.includes('toast-out')) remove();
  });
  setTimeout(() => {
    toast.classList.remove('is-in');
    toast.classList.add('is-out');
    setTimeout(remove, 800);
  }, holdMs + index * 300);
  return toast;
}

/** 패널 머리에 붙이는 작은 아이콘 + 글자 버튼 (진화체 도감 등) */
export function panelAction(label: string, iconId: string, onClick: () => void): HTMLButtonElement {
  return button({ label, icon: iconId, size: 'small', variant: 'ghost', onClick });
}

export { panel };
