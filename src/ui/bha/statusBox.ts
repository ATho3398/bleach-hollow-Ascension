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

/** 상태 박스 줄 (C.281 모양): 한 줄씩 [아이콘 | 둥근 막대 | 숫자]. 상태이상(쇠약·피곤·빈사)은 맨 앞 줄, 막대 가득 + 숫자 자리에 이름(+ 푸는 법 짧게) */
export function statusGaugeRows(chips: readonly StatusChip[]): HTMLElement[] {
  const ordered = [...chips.filter((c) => c.value === null), ...chips.filter((c) => c.value !== null)];
  return ordered.map((c) => {
    const row = el('span', `bha-room__gauge bha-room__chip--${c.kind}${c.danger ? ' is-danger' : ''}${c.value === null ? ' is-state' : ''}`);
    const track = el('span', 'bha-room__gaugetrack');
    const fill = el('i');
    fill.style.width = `${c.value === null ? 100 : Math.max(0, Math.min(100, c.value))}%`;
    track.append(fill);
    row.append(icon(c.icon), track, el('span', 'bha-room__gaugenum bha-num', c.value === null ? c.label : String(Math.round(c.value))));
    // 상태이상 줄 아래 푸는 법 짧게 (GDD 193장 15: '모험 1번' 류) — 자세한 것은 툴팁·ⓘ
    if (c.short) row.append(el('span', 'bha-room__gaugehint', c.short));
    if (c.hint) row.title = c.hint;
    return row;
  });
}

/** 상태 박스(.bha-room__status) 안을 다시 그린다: 줄 + 이름표(있으면 박스 위 가운데) + 읽기 글·툴팁. ariaLead = 읽기 글 앞 (방 = '상태 보기: ') */
export function paintStatusBox(box: HTMLElement, chips: readonly StatusChip[], nameTag: HTMLElement | null, ariaLead = ''): void {
  box.setAttribute('aria-label', `${ariaLead}${chips.map((c) => (c.value === null ? c.label : `${c.label} ${c.value}`)).join(', ')}`);
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
  return meter({ kind: 'player', label: '체력', icon: 'i-heal', value: now, max, compact: true, inside: true, zoneLow: 0.3, danger: fraction < 0.3, valueText: `${now} / ${max}` });
}
