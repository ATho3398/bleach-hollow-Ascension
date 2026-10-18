// 원정 계열 화면(원정·한계 돌파·결과·흡수·전투 연습) 전용 헬퍼 (U-4). 순수 함수는 tests/bha-expedition.test.ts 에서 검사한다.
import type { EnemyDef, TerrainTileDef } from '../../data/schema';
import type { EndReason, ExpeditionPhase } from '../../engine/expedition';
import { el, icon, type InfoRow } from './dom';

// ── 순수 함수 ──

export type TileCss = 'prey' | 'elite' | 'env' | 'rest';

/** 타일 종류 → 디자인 클래스/아이콘 키. 조합(combo) 타일은 환경 모양으로 보인다 (슬롯에 직접 놓는 타일은 4종뿐) */
export function tileCss(kind: TerrainTileDef['kind']): TileCss {
  return { 'prey-nest': 'prey', 'elite-den': 'elite', environment: 'env', rest: 'rest', combo: 'env' }[kind] as TileCss;
}
export const tileIconId = (css: TileCss): string => `i-tile-${css}`;

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

export const MSG_ICON: Record<MsgKind, string> = { '': 'i-play', warn: 'i-hunger', fight: 'i-tile-elite', rest: 'i-tile-rest' };

/** 원정이 끝난 이유 → 결과 화면 톤. 귀환 계열 = win, 패배 계열 = lose */
export function endTone(reason: EndReason): 'win' | 'lose' {
  return reason === 'returned' || reason === 'forced-max-laps' ? 'win' : 'lose';
}

export interface PracticeFilter {
  /** 약점 계통 id, 'all' 이면 전체 */
  lineage: string;
  /** 'all' | 'normal' | 'elite' */
  rank: string;
}

export const ALL = 'all';

/** 전투 연습 목록 필터 (순서는 그대로) */
export function filterFoes<T extends Pick<EnemyDef, 'class' | 'weaknessLineageId'>>(foes: readonly T[], f: PracticeFilter): T[] {
  return foes.filter((e) => (f.lineage === ALL || e.weaknessLineageId === f.lineage) && (f.rank === ALL || e.class === f.rank));
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
