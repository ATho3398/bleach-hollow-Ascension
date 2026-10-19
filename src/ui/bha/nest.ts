// 둥지 계열 화면 전용 DOM 헬퍼 (U-3, T-3): 상태 블록, 돌보기, 능력치 6줄, 덱 행, 토스트.
// 공용 헬퍼는 ./dom, 속성 표시는 ./element. 순수 계산은 ./nestLogic (테스트 대상).
import { STAT_IDS, type Stats, type TerrainTileDef } from '../../data/schema';
import { statName } from '../../data/elements';
import { button, el, icon, meter } from './dom';
import { getOverlayHost } from './overlayHost';
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

/** 능력치 6줄 (GDD 20-3): 종족값 + 노력치. 막대 끝은 그 단계 기준 능력치의 1.6배 */
export function statsBlock(factionId: string, stats: Stats, ev: Stats, ref: number): HTMLElement {
  const root = el('div', 'bha-stack bha-stats');
  const max = Math.round(ref * 1.6);
  for (const k of STAT_IDS) {
    root.append(meter({
      kind: 'stored', label: statName(k, factionId), value: Math.round(stats[k]), max, compact: true, thin: true,
      valueText: ev[k] > 0 ? `${Math.round(stats[k])} (+${ev[k]})` : String(Math.round(stats[k])),
    }));
  }
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

/** 칭호 해금 토스트: 위에서 내려와(is-in) 2.5초 뒤 올라가고(is-out) animationend 에서 제거한다. 여러 개면 위에서부터 겹치지 않게 쌓는다 */
export function showToast(o: { eyebrow: string; title: string; meta?: string }, index = 0, holdMs = 2500, host: HTMLElement = getOverlayHost()): HTMLElement {
  const toast = el('div', 'bha-toast is-in');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.style.setProperty('--toast-i', String(index)); // 겹치지 않게 쌓는 간격은 CSS(.bha-toast, 기본 72px · LCD 는 lcd.css)
  const ic = el('span', 'bha-toast__icon');
  ic.append(icon('i-title'));
  const body = el('span');
  body.append(el('span', 'bha-toast__eyebrow', o.eyebrow), el('br'), el('span', 'bha-toast__title', o.title));
  if (o.meta) body.append(el('br'), el('span', 'bha-toast__meta', o.meta));
  toast.append(ic, body);
  host.append(toast);
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
