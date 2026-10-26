// 대기 모드 결과 요약 (GDD 85장 6번, C.140 최소 UI — 꾸미기는 C.141): 돌아왔을 때 한 번, 확인 창 하나로 보여 준다.
// 문구는 런 로그 요약(IdleRecord)만 읽는다. 종족 이름(먹이)은 종족 설정.
import { BALANCE } from '../config/balance';
import { TRADE_CURRENCY_NAME } from '../data/economy';
import { tileName } from '../data/tiles';
import type { FactionConfig, FoodId } from '../engine/faction';
import type { IdleRecord } from '../engine/runLog';
import { confirmDialog } from './confirmDialog';

const hm = (h: number): string => {
  const m = Math.round(h * 60);
  return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`;
};

/** 요약 문구: 제목 + 본문 한 단락 */
export function idleSummaryText(r: IdleRecord, faction: Pick<FactionConfig, 'foodNames' | 'id'>): { title: string; body: string } {
  const got = [
    `${TRADE_CURRENCY_NAME} +${r.gold}`,
    r.steps > 0 ? `진화 걸음 +${r.steps}` : '',
    r.ev > 0 ? `노력치 +${r.ev}` : '',
    r.food > 0 ? `${faction.foodNames[BALANCE.provisional.idle.foodId as FoodId]} +${r.food}` : '',
    r.tiles.length > 0 ? `타일 ${r.tiles.map((id) => tileName(id, faction.id)).join('·')}` : '',
  ].filter(Boolean);
  const stopped = r.activeHours < r.hours ? ` (배고파서·지쳐서 ${hm(r.activeHours)}만 돌았다)` : '';
  return {
    title: `대기 모드 — ${hm(r.hours)} 동안 자동 모험`,
    body: `${r.laps}바퀴${stopped}. 직접 돌았을 때의 ${Math.round(r.share * 100)}%만 받는다: ${got.join(' · ') || '받은 것 없음'}.`,
  };
}

export function showIdleSummary(r: IdleRecord, faction: FactionConfig, onClose: () => void = () => {}): void {
  const t = idleSummaryText(r, faction);
  confirmDialog({ title: t.title, body: t.body, yes: '확인', single: true, onYes: onClose });
}
