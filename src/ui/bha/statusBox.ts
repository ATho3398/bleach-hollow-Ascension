// 머리 위 상태 박스 · 발밑 체력 막대 공용 부품 (GDD 190장 3 = C.301 · 192장 2 = C.303 · 197장 4 = C.318 온천 통일).
// 방(roomView)과 온천(spaView)이 같은 함수로 그린다 — 모양(줄·박스·이름표·ⓘ·체력 막대)은 room.css 의 .bha-room__* 한 곳. 종족 차이는 넘겨받은 이름(faction)뿐
import type { FactionConfig } from '../../engine/faction';
import { CARE_STATUS_NAMES, dyingLeftMs, type NestState } from '../../engine/nest';
import { el, icon, meter } from './dom';
import { hpNumbers } from './battle';
import { infoTip, type InfoBody } from './infoTip';
import { roomStatusInfo } from './statusInfo';
import { CARE_STATUS_HINTS, dyingClock, statusChips, type StatusChip } from './roomLogic';
import type { SaveData } from '../../game';
import { formDisplayName } from '../../engine/evolution';
import { rebirthMark } from '../rebirthView';
import { shownName } from '../displayName';
import { ACTION_FILL_MS, beginAction, tween } from './actionFx';
import { getOverlayHost } from './overlayHost';
import { fullnessOf } from './fullness';
import { changeNoteBox, showChangeNote, type ChangeItem } from './changeNote';
import { applyBlink, blinkGauges, changedKeys, GAUGE_BLINK_AFTER, GAUGE_BLINK_PERIOD_MS, tagGauge, type GaugeKey } from './gaugeBlink';

/** 상태 박스 줄 (C.281 모양): 한 줄씩 [아이콘 | 둥근 막대 | 숫자]. 상태이상(쇠약·피곤·빈사)은 맨 앞 줄, 막대 가득 + 숫자 자리에 이름 */
export function statusGaugeRows(chips: readonly StatusChip[]): HTMLElement[] {
  const ordered = [...chips.filter((c) => c.value === null), ...chips.filter((c) => c.value !== null)];
  return ordered.map((c) => {
    const row = el('span', `bha-room__gauge bha-room__chip--${c.kind}${c.danger ? ' is-danger' : ''}${c.value === null ? ' is-state' : ''}`);
    const track = el('span', 'bha-room__gaugetrack');
    const fill = el('i');
    fill.style.width = `${c.value === null ? 100 : Math.max(0, Math.min(100, c.value))}%`;
    track.append(fill);
    row.append(icon(c.icon), track, el('span', 'bha-room__gaugenum bha-num', c.value === null ? c.label : String(Math.round(c.value))));
    // 푸는 법 줄은 두지 않는다 (GDD v6.004 3-2 — 박스가 줄마다 같은 폭·같은 자리). 푸는 법은 툴팁·ⓘ·상태 화면
    if (c.hint) row.title = c.hint;
    if (c.value !== null) row.dataset.gauge = c.kind; // 바뀌는 값 깜빡임 대상 (GDD 208장 3, gaugeBlink)
    return row;
  });
}

/** 상태 박스(.bha-room__status) 안을 다시 그린다: 줄 + 이름표(있으면 박스 위 가운데) + 읽기 글·툴팁. ariaLead = 읽기 글 앞 (방 = '상태 보기: ') */
export function paintStatusBox(box: HTMLElement, chips: readonly StatusChip[], nameTag: HTMLElement | null, ariaLead = ''): void {
  // 값은 정수로 (GDD 243장 9-9: 차오르는 연출 중 '배부름 99.98394…' 소수가 읽기 글에 나오던 것)
  box.setAttribute('aria-label', `${ariaLead}${chips.map((c) => (c.value === null ? c.label : `${c.label} ${Math.round(c.value)}`)).join(', ')}`);
  // 상태 칩(쇠약·피곤·쓰러짐) 풀리는 법 한 줄 툴팁 (GDD 102-7)
  box.title = chips.filter((c) => c.hint).map((c) => `${c.label}: ${c.hint}`).join('\n');
  box.replaceChildren(...statusGaugeRows(chips));
  if (nameTag) box.prepend(nameTag);
}

/** 상태 ⓘ (C.176, GDD 104장 2): 박스 오른쪽 바깥. 지금 칩마다 뜻·풀리는 법 + 빈사면 남은 시간(열 때마다 지금 시각, GDD 177장 2) */
export function statusInfoButton(chipsNow: () => StatusChip[], faction: FactionConfig, nest: Parameters<typeof dyingLeftMs>[0]): HTMLButtonElement {
  const withDyingLeft = (body: InfoBody): InfoBody => {
    if (!nest.collapsed || nest.dead || typeof body === 'string' || Array.isArray(body)) return body;
    return {
      ...body,
      groups: body.groups.map((g) => (g.title === CARE_STATUS_NAMES.collapsed ? { ...g, mark: undefined, lines: [`남은 시간 ${dyingClock(dyingLeftMs(nest, Date.now()) ?? 0)}`, CARE_STATUS_HINTS.collapsed] } : g)),
    };
  };
  const btn = infoTip('상태', () => withDyingLeft(roomStatusInfo(chipsNow(), faction)));
  btn.classList.add('bha-room__statusinfo');
  return btn;
}

/**
 * 박스 위 이름표 (GDD 100장 #8 · 25-9 · 22-7 · 199장 7): 캐릭터 이름이 있으면 늘 '이름(굵게) + 작게 진화체 이름'(C.326).
 * 이름이 없으면(옛 세이브 — 이어할 때 정함) 예전처럼 이름표 테 꾸밈을 입었거나 환생(★)·투트랙일 때만 진화체 이름, 아니면 null(이름표 없음).
 * tracks = 트랙 전환을 쓸 수 있는 화면인지 (방 = 전환 손잡이가 있을 때만)
 */
export function statusNameTag(save: Pick<SaveData, 'rebirth' | 'otherTracks' | 'wear' | 'evolution'> & { name?: string | null }, faction: FactionConfig, tracks = true): HTMLElement | null {
  const stars = rebirthMark(save.rebirth.count);
  const form = shownName(formDisplayName(save.evolution, faction.id));
  if (save.name) {
    const tag = el('span', 'bha-small bha-room__name bha-room__name--own');
    tag.append(el('b', 'bha-room__nameown', save.name), el('span', 'bha-room__nameform', form));
    if (stars) tag.append(stars);
    tag.title = `${save.name} · ${form}`;
    return tag;
  }
  if (!stars && !(tracks && save.otherTracks.length > 0) && !save.wear.plate) return null;
  const tag = el('span', 'bha-small bha-room__name', form);
  if (stars) tag.append(' ', stars);
  return tag;
}

/** 지금 보이는 배부름·컨디션으로 칩을 다시 만든다 (온천처럼 값이 시간마다 바뀌는 화면 — 위험 표시도 그 값으로) */
export function liveStatusChips(n: NestState, faction: FactionConfig, live?: { fullness?: number; condition?: number }): StatusChip[] {
  const s = { ...n, ...(live?.fullness !== undefined ? { hunger: 100 - live.fullness } : {}), ...(live?.condition !== undefined ? { condition: live.condition } : {}) };
  return statusChips(s, faction);
}

/** 발밑 체력 막대 (C.281 모양, GDD 192장 2): 기존 체력 막대(meter player) 하나 — 숫자 '현재 / 최대' 는 막대 안 가운데, 30% 아래 위험 구간·위험 색 */
export function homeHpMeter(fraction: number, maxHp: number): HTMLElement {
  const { now, max } = hpNumbers(fraction * maxHp, maxHp);
  return tagGauge(meter({ kind: 'player', label: '체력', icon: 'i-heal', value: now, max, compact: true, inside: true, zoneLow: 0.3, danger: fraction < 0.3, valueText: `${now} / ${max}` }), 'hp');
}

// ── 회복 차오름 (GDD 201장): 전투 밖에서 상태창 값이 오르면 '+n' 숫자 대신 막대가 이전 값 → 새 값으로 ACTION_FILL_MS(0.8초) 동안 차고 옆 숫자도 따라 오른다.
//    줄어든 값은 바로 새 값(201장 5). 동작 줄이기 설정이면 tween 이 바로 끝 = 바로 새 값.

/** 상태창이 보여 주는 값 한 벌: 배부름(0~100)·컨디션·리스크·체력 비율(0~1) — 영압 안정도는 C.391 (GDD 239장 4) 에서 삭제 */
export interface GaugeShown { hunger: number; cond: number; risk: number; hp: number }
const GAUGE_KEYS = ['hunger', 'cond', 'risk', 'hp'] as const;

/** 둥지 값으로 한 벌 (체력 비율은 부르는 쪽이 넘긴다 — 방 = previewHomeHp, 가방 = homeHp) */
export function nestShown(n: Pick<NestState, 'hunger' | 'condition' | 'risk'>, hp: number): GaugeShown {
  return { hunger: fullnessOf(n.hunger), cond: n.condition, risk: n.risk, hp };
}

/** 이 캐릭터(둥지 객체)의 상태창에 마지막으로 보여 준 값 — 방을 다시 열 때 그 사이 오른 값(진화로 가득·부활·대기 회복 등)을 차오르게 */
const lastShown = new WeakMap<object, GaugeShown>();
export function rememberShown(owner: object, v: GaugeShown): void {
  lastShown.set(owner, { ...v });
}
export function shownBefore(owner: object): GaugeShown | undefined {
  return lastShown.get(owner);
}

/** 차오름 시작 값: 오른 값만 이전 값에서, 나머지는 지금 값. 오른 것이 없으면 null (반올림해 같은 숫자면 오른 것 아님) */
export function riseFrom(prev: GaugeShown | undefined, now: GaugeShown): GaugeShown | null {
  if (!prev) return null;
  const from = { ...now };
  let any = false;
  for (const k of GAUGE_KEYS) {
    const up = k === 'hp' ? Math.round(now.hp * 1000) > Math.round(prev.hp * 1000) : Math.round(now[k]) > Math.round(prev[k]);
    if (up) {
      from[k] = prev[k];
      any = true;
    }
  }
  return any ? from : null;
}

export function lerpShown(a: GaugeShown, b: GaugeShown, t: number): GaugeShown {
  const o = { ...b };
  for (const k of GAUGE_KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}

/** 칩 값을 차오르는 중인 값으로 덮어쓴다 (상태이상 줄은 그대로) */
export function chipsAt(chips: readonly StatusChip[], v: GaugeShown): StatusChip[] {
  return chips.map((c) => (c.value !== null && (c.kind === 'hunger' || c.kind === 'cond' || c.kind === 'risk') ? { ...c, value: v[c.kind] } : c));
}

/**
 * 상태창이 가려진 화면(가방 등)에서 회복했을 때 (GDD 201장 4): 머리 위 상태창(같은 박스 모양 + 발밑 체력 막대)을 화면 위 가운데에 잠깐 띄워
 * 이전 값 → 새 값으로 차오르게 하고, 끝나면 사라진다. 누름은 막지 않는다. 회복 수치 글자는 없다(행동 이름만)
 */
export function statusFillFx(o: { title: string; art?: HTMLElement; chips: () => StatusChip[]; from: GaugeShown; to: GaugeShown; maxHp: number; owner?: object; blink?: readonly GaugeKey[]; note?: readonly ChangeItem[] }): void {
  const end = beginAction();
  const box = el('div', 'bha-actfx');
  box.setAttribute('role', 'status');
  box.dataset.actfx = '';
  const head = el('div', 'bha-actfx__head');
  const who = el('div', 'bha-actfx__who');
  who.append(o.art ?? icon('i-heal'));
  head.append(who, el('b', 'bha-actfx__title', o.title));
  const status = el('div', 'bha-room__status bha-actfx__status');
  const hp = el('div', 'bha-room__hp bha-actfx__hp');
  // 바뀐 값 알림 (GDD 209장 — 방 가방): 상태창 박스 아래에 바뀐 값만 칩 한 줄. 넘겨받은 것만(수련 결과 등 다른 화면은 이번 대상 아님, 209장 5)
  const note = o.note && o.note.length > 0 ? changeNoteBox() : null;
  box.append(head, status, ...(note ? [note] : []), hp);
  getOverlayHost().append(box);
  if (note) showChangeNote(note, o.note!);
  const paint = (t: number) => {
    const v = lerpShown(o.from, o.to, t);
    status.replaceChildren(...statusGaugeRows(chipsAt(o.chips(), v)));
    hp.replaceChildren(homeHpMeter(v.hp, o.maxHp));
    applyBlink(box);
  };
  // 바뀐 값만 깜빡임 (GDD 208장 3): 부르는 쪽이 넘긴 것(내린 값 포함) 또는 차오르는 값
  paint(0);
  blinkGauges(box, o.blink ?? changedKeys(o.from, o.to));
  tween(ACTION_FILL_MS, paint, () => {
    if (o.owner) rememberShown(o.owner, o.to); // 방으로 돌아가도 같은 회복을 다시 차오르게 하지 않는다
    window.setTimeout(() => {
      box.classList.add('is-out');
      window.setTimeout(() => box.remove(), 250);
      end();
    }, ACTION_FILL_HOLD_MS);
  });
}
/** 가방 회복 창이 다 찬 뒤 머무는 시간 — 끝난 뒤 깜빡임(0.25초 × 3)이 다 보이게 (GDD 208장 3) */
const ACTION_FILL_HOLD_MS = GAUGE_BLINK_PERIOD_MS * GAUGE_BLINK_AFTER;
