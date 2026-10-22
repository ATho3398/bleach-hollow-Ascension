// 원정 계열 화면(원정·한계 돌파·결과·흡수·전투 연습) 전용 헬퍼 (U-4). 순수 함수는 tests/bha-expedition.test.ts 에서 검사한다.
import type { EnemyDef, TerrainTileDef } from '../../data/schema';
import type { EndReason, ExpeditionPhase } from '../../engine/expedition';
import { el, icon, type InfoRow } from './dom';

// ── 순수 함수 ──

export type TileCss = 'prey' | 'elite' | 'env' | 'rest' | 'event';

/** 타일 종류 → 디자인 클래스/아이콘 키. 조합(combo) 타일은 환경 모양으로 보인다 (슬롯에 직접 놓는 타일은 4종뿐) */
export function tileCss(kind: TerrainTileDef['kind']): TileCss {
  return { 'prey-nest': 'prey', 'elite-den': 'elite', environment: 'env', rest: 'rest', combo: 'env', event: 'event' }[kind] as TileCss;
}
/** 이벤트 타일(GDD 25-5 ③)은 전용 아이콘이 없어 조합 아이콘을 쓴다 */
export const tileIconId = (css: TileCss): string => (css === 'event' ? 'i-tile-combo' : `i-tile-${css}`);

/** 지금 고른 타일을 이 칸에 놓을 수 있는가: 지금 위치보다 앞쪽 빈 슬롯만 (엔진 규칙을 화면이 그대로 반영) */
export function canPlaceAt(o: { slot: string | null; index: number; pos: number; phase: ExpeditionPhase; hasSelected: boolean }): boolean {
  return !o.slot && o.hasSelected && (o.phase === 'moving' || o.phase === 'nest-choice') && o.index > o.pos;
}

export type MsgKind = '' | 'warn' | 'fight' | 'rest';

/** 메시지 줄 종류: 전투 대기 = fight, 휴식 = rest, 메시지가 없고 허기가 급상승 중이면 warn */
export function msgKind(phase: ExpeditionPhase, msg: string, hungerSpike: boolean): MsgKind {
  if (phase === 'battle') return 'fight';
  if (phase === 'rest') return 'rest';
  if (!msg && hungerSpike) return 'warn';
  return '';
}

/** 머리 위 말풍선 글자 (GDD 18-7): 알림(msg)이 있으면 그것, 없으면 허기 경고·일시정지·도착만, 그냥 걷는 중에는 빈 글자(말풍선 감춤) */
export function bubbleText(o: { phase: ExpeditionPhase; paused: boolean; msg: string; kind: MsgKind; nestName: string }): string {
  if (o.msg) return o.msg;
  if (o.kind === 'warn') return '배가 빠르게 고파진다! 귀환을 서두르자';
  if (o.phase === 'moving' && o.paused) return '일시정지';
  if (o.phase === 'nest-choice') return `${o.nestName}에 도착했다`;
  return '';
}

/** 조우 말풍선을 보여 주고 전투로 넘어가기까지 (1x 기준 ms, 배속만큼 짧아진다) */
/** 보스 기척 배너 아래 줄 (GDD 37장 2번, 순수): "7번 칸 · 강적 소굴 · 3칸 앞" — 그 칸에 서 있으면 "지금 이 칸" */
export function bossOmenSub(cell: number, pos: number, tileLabel: string | null): string {
  const left = cell - pos;
  return `${cell}번 칸${tileLabel ? ` · ${tileLabel}` : ''} · ${left > 0 ? `${left}칸 앞` : '지금 이 칸'}`;
}

export const ENCOUNTER_DELAY_MS = 700;
/** 감시 타이머 (GDD 19-1): 조우 뒤 멈추지 않은 시간이 이만큼 지나도 전투가 안 열리면 바로 진입한다 (실제 시간, 배속 무관) */
export const ENCOUNTER_WATCHDOG_MS = 3000;
export const WATCHDOG_POLL_MS = 500;

export type WatchdogAction = 'none' | 'resume' | 'enter-battle';

/** 감시 타이머 판단 (순수): 멈춤 중이면 아무것도 안 한다. 조우 대기가 한도를 넘었거나 전투 진입 예약이 사라졌으면 진입,
 *  이동·휴식 예약이 없거나 타이머가 안 걸려 있으면 다시 건다 */
export function watchdogAction(o: {
  phase: ExpeditionPhase; blocked: boolean; pending: 'step' | 'phase' | null; armed: boolean; encounterWaitMs: number; limitMs?: number;
}): WatchdogAction {
  if (o.blocked) return 'none';
  if (o.phase === 'battle') {
    if (o.encounterWaitMs >= (o.limitMs ?? ENCOUNTER_WATCHDOG_MS) || o.pending !== 'phase') return 'enter-battle';
    return o.armed ? 'none' : 'resume';
  }
  if (o.phase === 'moving') return o.pending === 'step' && o.armed ? 'none' : 'resume';
  if (o.phase === 'rest') return o.pending === 'phase' && o.armed ? 'none' : 'resume';
  return 'none';
}

export const MSG_ICON: Record<MsgKind, string> = { '': 'i-play', warn: 'i-hunger', fight: 'i-tile-elite', rest: 'i-tile-rest' };

/** 원정이 끝난 이유 → 결과 화면 톤. 귀환 계열 = win, 패배 계열 = lose */
export function endTone(reason: EndReason): 'win' | 'lose' {
  return reason === 'returned' || reason === 'forced-max-laps' || reason === 'story-clear' || reason === 'tutorial-clear' ? 'win' : 'lose';
}

export interface PracticeFilter {
  /** 적 속성 id, 'all' 이면 전체 */
  element: string;
  /** 'all' | 'normal' | 'elite' */
  rank: string;
}

export const ALL = 'all';

/** 전투 연습 목록 필터 (순서는 그대로) */
export function filterFoes<T extends Pick<EnemyDef, 'class' | 'element'>>(foes: readonly T[], f: PracticeFilter): T[] {
  return foes.filter((e) => (f.element === ALL || e.element === f.element) && (f.rank === ALL || e.class === f.rank));
}

// ── DOM 헬퍼 ──

/** 정보 표 값: 본문 + 흐린 보조 글자 ("4 / 기본 4") */
export function val(main: string, small?: string): HTMLElement {
  const s = el('span', '', main);
  if (small) s.append(' ', el('small', '', small));
  return s;
}

export interface IconInfoRow extends Omit<InfoRow, 'label'> {
  label: string;
  icon?: string;
}

/** 아이콘이 붙은 정보 표 (결과·연습 결과): dl.bha-info > div.bha-info__row > dt(아이콘+글자) + dd */
export function iconInfo(rows: IconInfoRow[]): HTMLElement {
  const dl = el('dl', 'bha-info');
  for (const r of rows) {
    const row = el('div', r.mod ? `bha-info__row bha-info__row--${r.mod}` : 'bha-info__row');
    const dt = el('dt');
    if (r.icon) dt.append(icon(r.icon));
    dt.append(r.label);
    const dd = el('dd');
    dd.append(r.value);
    row.append(dt, dd);
    dl.append(row);
  }
  return dl;
}
