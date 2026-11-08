// 대기 모드 (GDD 85장 6번 · 92장, C.147): 돌아오면 복귀 창("○시간 ○분 만에 돌아왔다" + 쌓인 보상 + [받기]), 방 위 줄 '대기 보상' 아이콘 창(규칙 + 쌓인 것 + [받기]).
// 그냥 닫으면 보상은 받을 보상(save.idlePending)으로 남는다. 문구는 미리 보기(idlePendingYield)·받은 기록(IdleRecord)만 읽는다. 종족 이름(먹이)은 종족 설정.
import { BALANCE } from '../config/balance';
import { TRADE_CURRENCY_NAME } from '../data/economy';
import { tileName } from '../data/tiles';
import type { FactionConfig, FoodId } from '../engine/faction';
import type { IdleYield } from '../engine/idle';
import { CARE_STATUS_NAMES } from '../engine/nest';
import type { IdleRecord } from '../engine/runLog';
import { idleClaimable, idlePendingYield, type IdleAccrual, type SaveData } from '../game';
import { el, meter } from './bha/dom';
import { confirmDialog } from './confirmDialog';

const IX = BALANCE.provisional.idle;

/** 시간 문구: 1시간 30분 · 45분 */
export const hm = (h: number): string => {
  const m = Math.round(h * 60);
  return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`;
};

/** 방 아이콘 배지: 쌓인 시간(시간 단위로 내림, 1시간 미만이면 분). 받을 만큼(합계 minMinutes 이상, 95장 B1) 안 쌓였으면 null */
export function idleBadge(save: Pick<SaveData, 'idlePending'>): string | null {
  const p = save.idlePending;
  if (!p || !idleClaimable(save)) return null;
  return p.hours >= 1 ? `${Math.floor(p.hours)}시간` : `${Math.round(p.hours * 60)}분`;
}

/** 쌓인 보상 목록 (미리 보기 — 타일은 장 수만) */
export function idleYieldLines(y: IdleYield, faction: Pick<FactionConfig, 'foodNames'>): string[] {
  return [
    `${TRADE_CURRENCY_NAME} +${y.gold}`,
    y.steps > 0 ? `진화 걸음 +${y.steps}` : '',
    y.ev > 0 ? `노력치 +${y.ev}` : '',
    y.food > 0 ? `${faction.foodNames[IX.foodId as FoodId]} +${y.food}` : '',
    y.tiles > 0 ? `타일 ${y.tiles}장` : '',
    // 장비는 확정 개수만 (GDD 193장 17: '장비 0~1개' 범위가 헷갈렸다 — 남은 확률로 하나 더 나오면 받은 뒤 요약에 실제 개수)
    y.gear > 0 ? `장비 ${y.gear}개` : '',
    y.laps > 0 ? `자동 모험 ${y.laps}바퀴` : '',
  ].filter(Boolean);
}

/** 덜 돈 까닭 한 줄 (GDD 193장 17): 빈사면 '빈사라 자동 모험을 하지 못했다', 배고픔·쇠약으로 덜 돌았으면 그 말. 다 돌았으면 null */
export function idleShortfall(p: { hours: number; activeHours: number }, nest: { collapsed?: boolean }): string | null {
  if (p.activeHours + 1e-6 >= p.hours) return null;
  if (nest.collapsed && p.activeHours <= 1e-6) return `${CARE_STATUS_NAMES.collapsed}라 자동 모험을 하지 못했다`;
  return '배고프거나 지쳐서 덜 돌았다';
}

/** 받은 뒤 요약 (런 로그 IdleRecord): 제목 + 본문 한 단락 */
export function idleSummaryText(r: IdleRecord, faction: Pick<FactionConfig, 'foodNames' | 'id'>): { title: string; body: string } {
  const got = [
    `${TRADE_CURRENCY_NAME} +${r.gold}`,
    r.steps > 0 ? `진화 걸음 +${r.steps}` : '',
    r.ev > 0 ? `노력치 +${r.ev}` : '',
    r.food > 0 ? `${faction.foodNames[IX.foodId as FoodId]} +${r.food}` : '',
    r.tiles.length > 0 ? `타일 ${r.tiles.map((id) => tileName(id, faction.id)).join('·')}` : '',
    (r.gear ?? 0) > 0 ? `장비 ${r.gear}개` : '',
  ].filter(Boolean);
  // 시간은 적지 않는다 (GDD 193장 17: 비운 시간·쌓인 시간·돈 시간 셋이 섞였다) — 받은 것만
  const stopped = r.activeHours + 1e-6 < r.hours ? ` (${r.activeHours <= 0 ? '모험하지 못했다' : '배고프거나 지쳐서 덜 돌았다'})` : '';
  return {
    title: '대기 보상을 받았다',
    body: `자동 모험 ${r.laps}바퀴${stopped}. 받은 것: ${got.join(' · ') || '없음'}.`,
  };
}

/** 규칙 한 줄 (아이콘 창, C.170 GDD 100장 #16: 3줄 → 1줄. 받기 기준·최대 시간은 진행 막대가 보인다) */
export function idleRuleText(): string {
  return `켜 두든 꺼 두든 흐른 시간만큼 자동으로 모험한다. 보상은 직접 돌았을 때의 ${Math.round(IX.share * 100)}%다.`;
}

/** 진행 막대 한 줄 (#16): "쌓인 시간 3분 / 10분부터 받기 · 최대 24시간". 받을 수 있으면 최대 시간 기준 */
export function idleProgress(save: Pick<SaveData, 'idlePending'>): { minutes: number; max: number; text: string } {
  const minutes = Math.round((save.idlePending?.hours ?? 0) * 60);
  const ready = idleClaimable(save);
  const max = ready ? IX.maxHours * 60 : IX.minMinutes;
  return { minutes, max, text: `${hm(minutes / 60)} / ${ready ? '받을 수 있다' : `${IX.minMinutes}분부터 받기`} · 최대 ${IX.maxHours}시간` };
}

/** 켜 둔 동안 방 '대기 보상' 아이콘 배지 갱신 (95장 B1, 1분마다): 방 화면이 그린 버튼(data-sc="idle-reward")의 배지만 바꾼다 — 방이 아니면 아무것도 안 함 */
export function refreshIdleBadge(scope: ParentNode, save: Pick<SaveData, 'idlePending'>): void {
  const btn = scope.querySelector<HTMLElement>('[data-sc="idle-reward"]');
  if (!btn) return;
  const text = idleBadge(save);
  let badge = btn.querySelector<HTMLElement>('.bha-room__idlebadge');
  if (!text) {
    badge?.remove();
    btn.removeAttribute('title');
    return;
  }
  if (!badge) btn.append((badge = el('small', 'bha-room__idlebadge')));
  if (badge.textContent !== text) badge.textContent = text;
  btn.title = `대기 보상 ${text} 쌓임`;
}

function listOf(save: SaveData, faction: FactionConfig): HTMLElement {
  const ul = el('ul', 'bha-modal__list');
  const p = save.idlePending;
  const y = idlePendingYield(save);
  if (!p || !y) {
    ul.append(el('li', 'bha-small', '쌓인 보상이 없다.'));
    return ul;
  }
  if (p.activeHours > 1e-6) for (const line of idleYieldLines(y, faction)) ul.append(el('li', '', line)); // 하나도 안 돌았으면 '골드 +0' 대신 까닭 한 줄만
  // 시간 줄은 뺐다 (GDD 193장 17: 창 제목·진행 막대 시간 하나만). 덜 돈 까닭만 한 줄, 시간 없이
  const why = idleShortfall(p, save.nest);
  if (why) ul.append(el('li', 'bha-small', why));
  return ul;
}

/** 받기 뒤 요약 알림 */
function showClaimed(r: IdleRecord, faction: FactionConfig): void {
  const t = idleSummaryText(r, faction);
  confirmDialog({ title: t.title, body: t.body, yes: '확인', single: true, onYes: () => {} });
}

/** 복귀 창 (92장 2번): 몇 시간 만에 왔는지 + 쌓인 보상 + [받기]. [나중에] 로 닫으면 보상은 아이콘에 남는다 */
export function showIdleReturn(acc: IdleAccrual, save: SaveData, faction: FactionConfig, onClaim: () => IdleRecord | null): void {
  const capped = acc.added + 1e-6 < Math.min(acc.awayHours, IX.maxHours) || acc.awayHours > IX.maxHours;
  confirmDialog({
    title: `${hm(acc.awayHours)} 만에 돌아왔다`,
    body: capped ? `대기 보상은 최대 ${IX.maxHours}시간까지만 쌓인다. 쌓인 보상:` : '꺼 둔 동안 자동 모험으로 쌓인 보상:',
    content: listOf(save, faction),
    yes: '받기',
    no: '나중에',
    onYes: () => {
      const r = onClaim();
      if (r) showClaimed(r, faction);
    },
  });
}

/** 방 '대기 보상' 아이콘 창 (92장 1번): 규칙 한 줄 + 쌓인 시간 진행 막대 + 지금 쌓인 것 + [받기]. 받을 게 없으면 [받기]는 비활성으로 자리만 지킨다 (100장 #16) */
export function showIdlePanel(save: SaveData, faction: FactionConfig, onClaim: () => IdleRecord | null): void {
  const has = idleClaimable(save);
  const pr = idleProgress(save);
  const box = el('div', 'bha-idlebox');
  box.append(meter({ kind: 'sp', label: '쌓인 시간', icon: 'i-timer', value: Math.min(pr.minutes, pr.max), max: pr.max, valueText: pr.text, compact: true }));
  if (save.idlePending && idlePendingYield(save)) box.append(listOf(save, faction));
  confirmDialog({
    title: '대기 보상',
    body: idleRuleText(),
    content: box,
    yes: '받기',
    no: '닫기',
    yesDisabled: !has,
    onYes: () => {
      if (!has) return;
      const r = onClaim();
      if (r) showClaimed(r, faction);
    },
  });
}
