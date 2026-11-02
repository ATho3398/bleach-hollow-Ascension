// 둥지 계열 화면 전용 DOM 헬퍼 (U-3, T-3): 상태 블록, 돌보기, 능력치 6줄, 덱 행, 토스트.
// 공용 헬퍼는 ./dom, 속성 표시는 ./element. 순수 계산은 ./nestLogic (테스트 대상).
import { infoTip } from './infoTip';
import { statusInfo, type StatusInfoKind } from './statusInfo';
import { fullnessOf } from './fullness';
import { STAT_IDS, type Stats, type TerrainTileDef } from '../../data/schema';
import { statName } from '../../data/elements';
import { BALANCE } from '../../config/balance';
import { button, el, icon, meter, provisionalTag } from './dom';
import { getOverlayHost } from './overlayHost';
import { NEST_ACTIONS, type FactionConfig, type NestAction } from '../../engine/faction';

/** 능력치 절대 상한 (GDD 22-1) */
const STAT_MAX = BALANCE.provisional.stats.statMax;

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
    feed: { icon: 'i-care-feed', cls: 'feed', sub: `${faction.fullnessName} +` },
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
  /** 교감 (GDD 102-6 · 109장 3번): 상태 수치 목록 안 같은 모양 한 줄. stage = 단계 이름 */
  bond?: { value: number; max: number; stage: string; info?: string[] };
}

/** 상태 4바: 배부름(허기를 뒤집어 표시, C.63)·컨디션·안정 수치·리스크. 경고 문구는 기존 규칙 그대로 */
export function statusBlock(faction: FactionConfig, s: StatusOpts): HTMLElement {
  const root = el('div', 'bha-nest__status');
  const withTip = (m: HTMLElement, kind: StatusInfoKind, label: string, value?: number): HTMLElement => {
    m.querySelector('.bha-meter__label')?.append(infoTip(label, () => statusInfo(kind, faction, value)));
    return m;
  };
  // 이름 옆 ⓘ (C.176, GDD 104장 2): 누르면(폰)·올리면(PC) 설명 창. 옛 '광기·자아 설명' 패널은 이 창으로 옮겼다
  root.append(
    withTip(meter({ kind: 'hunger', label: faction.fullnessName, icon: 'i-hunger', value: Math.round(fullnessOf(s.hunger)), max: 100 }), 'hunger', faction.fullnessName, fullnessOf(s.hunger)), // 지금 구간 ◀ (GDD 159장 22)
    withTip(meter({
      kind: 'cond', label: '컨디션', icon: 'i-cond', value: Math.round(s.condition), max: 100,
      danger: s.condition < s.condWarn, note: s.condition < s.condWarn ? '나쁨: 전투에 공허 블록 ↑' : undefined,
    }), 'cond', '컨디션', s.condition),
    withTip(meter({ kind: 'stab', label: faction.stabilityName, icon: 'i-stab', value: Math.round(s.stability), max: s.stabilityMax }), 'stab', faction.stabilityName, s.stability),
    withTip(meter({
      kind: 'risk', label: faction.riskGaugeName, icon: 'i-risk', value: Math.round(s.risk), max: s.riskLimit,
      zone: s.riskWarn / s.riskLimit, danger: s.risk >= s.riskWarn, note: s.risk >= s.riskWarn ? '높음: 모험 시작부터 위험' : undefined,
    }), 'risk', faction.riskGaugeName, s.risk),
  );
  if (s.bond) {
    const v = Math.round(s.bond.value);
    const m = meter({ kind: 'bond', label: '교감', icon: 'i-care-pet', value: v, max: s.bond.max, valueText: `${v} / ${s.bond.max} · ${s.bond.stage}` });
    m.querySelector('.bha-meter__label')?.append(infoTip('교감', s.bond.info ?? (() => statusInfo('bond', faction, v))));
    root.append(m);
  }
  return root;
}

/** 능력치 6줄 (GDD 20-3): 종족값 + 노력치. C.131(GDD 77장 ①)부터 막대 없이 이름 + 값만 (ref 는 옛 호출 호환용).
 *  노력치(+계승)는 값 옆 따로 굵게·한 단계 크게 (.bha-ev, GDD 160장 6) */
export function statsBlock(factionId: string, stats: Stats, ev: Stats, _ref: number, carry?: Stats): HTMLElement {
  const root = el('div', 'bha-stack bha-stats');
  for (const k of STAT_IDS) {
    const v = Math.round(stats[k]);
    const c = carry?.[k] ?? 0;
    const extra = [ev[k] > 0 ? `+${ev[k]}` : '', c > 0 ? `계승 +${c}` : ''].filter(Boolean).join(' · ');
    // 능력치 절대 상한 (GDD 22-1): 닿으면 '상한' 표시
    const capped = v >= STAT_MAX ? ' 상한' : '';
    const row = statRow(statName(k, factionId), `${v}${capped}`);
    if (extra) row.append(evText(extra));
    if (capped) row.dataset.capped = 'true';
    root.append(row);
  }
  return root;
}

/** 노력치 글자 (GDD 160장 6): 노력치가 보이는 곳은 전부 이 모양 — 굵게·한 단계 크게 (bha 토큰만, components.css .bha-ev) */
export function evText(text: string): HTMLElement {
  return el('b', 'bha-ev bha-num', text);
}

/** 능력치 한 줄: 이름 · 값 (막대 없음). 누르면 펼쳐지는 설명은 없다 — 능력치별 설명은 능력치 칸 제목 옆 ⓘ 창 (GDD 160장 7) */
export function statRow(name: string, value: string): HTMLElement {
  const row = el('div', 'bha-statrow');
  row.append(el('span', 'bha-statrow__name', name), el('b', 'bha-statrow__value bha-num', value));
  return row;
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
  if (o.provisional) name.append(' ', provisionalTag());
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

/** 한 번에 보이는 토스트 수. 나머지는 자리가 나는 대로 차례로 (GDD 43장 1번 → 100장 #4: 1개 → 119장 6: 위에서 아래로 3개까지 쌓임) */
const TOAST_VISIBLE = 3;
const toastState = new WeakMap<HTMLElement, { slots: (HTMLElement | null)[]; queue: ((slot: number) => void)[] }>();

/** 알림 띠(.bha-toast): 화면 위 가장자리 얇은 한 줄. 위에서 내려와(is-in) holdMs 뒤 올라가고(is-out) animationend 에서 제거한다.
 *  화면 맨 위에 3개까지 위에서 아래로 쌓이고(GDD 119장 6) 나머지는 앞 띠가 사라지면 차례로 뜬다. index 는 옛 호출 호환용(등장 간격만) */
export function showToast(o: { eyebrow: string; title: string; meta?: string; center?: boolean }, index = 0, holdMs = 2500, host: HTMLElement = getOverlayHost()): HTMLElement {
  // center = 화면 가운데 (GDD 109장 5번 튜토리얼 달성): 같은 모양, 잠깐 뜨고 사라지며 누르면 바로 닫힌다
  const toast = el('div', `bha-toast${o.center ? ' bha-toast--center' : ''} is-in`);
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  if (o.meta) toast.title = o.meta; // 한 줄 띠라 보조 설명은 숨기고 툴팁으로만
  const ic = el('span', 'bha-toast__icon');
  ic.append(icon('i-title'));
  const text = el('span', 'bha-toast__text');
  text.append(el('span', 'bha-toast__eyebrow', o.eyebrow), ' ', el('span', 'bha-toast__title', o.title));
  toast.append(ic, text);
  const st = toastState.get(host) ?? { slots: Array.from({ length: TOAST_VISIBLE }, () => null), queue: [] };
  toastState.set(host, st);
  const show = (slot: number) => {
    st.slots[slot] = toast;
    toast.style.setProperty('--toast-i', String(slot)); // 칸 간격은 CSS(.bha-toast)
    host.append(toast);
    let gone = false;
    const remove = () => {
      if (gone) return;
      gone = true;
      toast.remove();
      st.slots[slot] = null;
      st.queue.shift()?.(slot);
    };
    // 연출이 꺼진(reduced-motion) 환경에서도 animationend 가 오므로 이 이벤트로 정리한다. 안전 장치로 타이머도 둔다.
    toast.addEventListener('animationend', (e) => {
      if ((e as AnimationEvent).animationName.includes('toast-out')) remove();
    });
    if (o.center) toast.addEventListener('click', remove);
    setTimeout(() => {
      toast.classList.remove('is-in');
      toast.classList.add('is-out');
      setTimeout(remove, 800);
    }, holdMs + index * 300);
  };
  const start = () => {
    const free = st.slots.findIndex((x) => !x);
    if (free >= 0) show(free);
    else st.queue.push(show);
  };
  // 설정 화면이 열려 있는 동안은 알림을 미뤘다가 닫히면 띄운다 (GDD 159장 17: 보상·도감 알림이 설정 머리줄을 덮었다)
  if (settingsOpen()) deferUntilSettingsClosed(start);
  else start();
  return toast;
}

const settingsOpen = (): boolean => typeof document !== 'undefined' && document.querySelector('[data-screen="settings"]') !== null;
const deferred: (() => void)[] = [];
let deferTimer: ReturnType<typeof setInterval> | null = null;
function deferUntilSettingsClosed(run: () => void): void {
  deferred.push(run);
  if (deferTimer !== null) return;
  deferTimer = setInterval(() => {
    if (settingsOpen()) return;
    clearInterval(deferTimer!);
    deferTimer = null;
    for (const r of deferred.splice(0)) r();
  }, 300);
}
