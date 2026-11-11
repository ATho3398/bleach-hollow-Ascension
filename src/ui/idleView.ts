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

/** 대기 보상 표시에 쓰는 세이브 조각 — 받을 수 있나는 교감 보너스(nest.bond)까지 본다 (GDD 241-A 7) */
type IdleSave = Pick<SaveData, 'idlePending'> & { nest?: Pick<SaveData, 'nest'>['nest'] };

/** 방 아이콘 배지: 쌓인 시간(시간 단위로 내림, 1시간 미만이면 분). 받을 만큼(합계 minMinutes 이상, 95장 B1) 안 쌓였으면 null */
export function idleBadge(save: IdleSave): string | null {
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

/** 덜 돈 차이를 적지 않는 몫 (GDD 222장 3): 쌓인 시간의 5% 미만 차이는 까닭 줄 없음 */
export const IDLE_SHORTFALL_MIN = 0.05;
/** 덜 돈 까닭 한 줄 (GDD 193장 17 → 222장 3): 실제로 걸린 상태만 — 빈사·사망(못 돎) · 배고픔(배부름 바닥에서 멈춤) · 쇠약(절반만 돎).
 *  지금 둥지 상태로 본다(쌓을 때와 같은 상태 — 다시 열 때 쌓고 바로 띄운다). 걸린 게 없거나 차이가 아주 작으면(5% 미만) null */
export function idleShortfall(
  p: { hours: number; activeHours: number },
  nest: { collapsed?: boolean; dead?: boolean; hunger?: number; weakened?: boolean },
): string | null {
  if (p.activeHours + 1e-6 >= p.hours) return null;
  if ((nest.collapsed || nest.dead) && p.activeHours <= 1e-6) return `${nest.dead ? CARE_STATUS_NAMES.dead : CARE_STATUS_NAMES.collapsed}라 자동 모험을 하지 못했다`;
  if (p.hours - p.activeHours < p.hours * IDLE_SHORTFALL_MIN) return null;
  const why = [
    nest.collapsed || nest.dead ? `${nest.dead ? CARE_STATUS_NAMES.dead : CARE_STATUS_NAMES.collapsed}라 쉬었다` : '',
    (nest.hunger ?? 0) >= 100 ? '배가 고파 멈췄다' : '',
    nest.weakened ? `${CARE_STATUS_NAMES.weak}이라 절반만 모험했다` : '', // '쇠약' 받침 — 이름이 종족 설정이 아니라 고정이라 조사도 고정
  ].filter(Boolean);
  return why.length > 0 ? `덜 모험했다 — ${why.join(' · ')}` : null;
}

/** 받은 뒤 요약 (런 로그 IdleRecord): 제목 + 본문 한 단락 */
export function idleSummaryText(r: IdleRecord, faction: Pick<FactionConfig, 'foodNames' | 'id'>): { title: string; body: string; got: string } {
  const got = [
    `${TRADE_CURRENCY_NAME} +${r.gold}`,
    r.steps > 0 ? `진화 걸음 +${r.steps}` : '',
    r.ev > 0 ? `노력치 +${r.ev}` : '',
    r.food > 0 ? `${faction.foodNames[IX.foodId as FoodId]} +${r.food}` : '',
    r.tiles.length > 0 ? `타일 ${r.tiles.map((id) => tileName(id, faction.id)).join('·')}` : '',
    (r.gear ?? 0) > 0 ? `장비 ${r.gear}개` : '',
  ].filter(Boolean);
  // 시간은 적지 않는다 (GDD 193장 17: 비운 시간·쌓인 시간·돈 시간 셋이 섞였다) — 받은 것만
  const stopped = r.activeHours <= 0 ? ' (모험하지 못했다)' : ''; // 까닭을 짐작해 적지 않는다 (GDD 222장 3)
  return {
    title: '대기 보상을 받았다',
    body: `자동 모험 ${r.laps}바퀴${stopped}. 받은 것: ${got.join(' · ') || '없음'}.`,
    got: got.join(' · ') || '받은 것 없음',
  };
}

/** 규칙 한 줄 (아이콘 창, C.170 GDD 100장 #16: 3줄 → 1줄. 받기 기준·최대 시간은 진행 막대가 보인다) */
export function idleRuleText(): string {
  return `플레이와 관계없이 흐른 시간만큼 자동으로 모험한다. 보상은 직접 모험했을 때의 ${Math.round(IX.share * 100)}%다.`;
}

/** 진행 막대 한 줄 (#16): "쌓인 시간 3분 / 10분부터 받기 · 최대 24시간". 받을 수 있으면 최대 시간 기준 */
export function idleProgress(save: IdleSave): { minutes: number; max: number; text: string } {
  const minutes = Math.round((save.idlePending?.hours ?? 0) * 60);
  const ready = idleClaimable(save);
  // GDD 241-A 7: 시간은 찼어도 한 바퀴도 못 돌았으면 '받을 수 있다'라고 하지 않는다
  const short = !ready && minutes >= IX.minMinutes;
  const max = ready || short ? IX.maxHours * 60 : IX.minMinutes;
  const state = ready ? '받을 수 있다' : short ? '아직 받을 보상이 없다' : `${IX.minMinutes}분부터 받기`;
  return { minutes, max, text: `${hm(minutes / 60)} / ${state} · 최대 ${IX.maxHours}시간` };
}

/** 켜 둔 동안 방 '대기 보상' 아이콘 배지 갱신 (95장 B1, 1분마다): 방 화면이 그린 버튼(data-sc="idle-reward")의 배지만 바꾼다 — 방이 아니면 아무것도 안 함 */
export function refreshIdleBadge(scope: ParentNode, save: IdleSave): void {
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
  // 한 바퀴도 못 돌았으면(222장 3: 0바퀴 = 보상 0) '골드 +0' 대신 안내 한 줄만
  if (y.laps > 0) for (const line of idleYieldLines(y, faction)) ul.append(el('li', '', line));
  else if (p.activeHours > 1e-6) ul.append(el('li', 'bha-small', '아직 한 바퀴를 다 돌지 못했다. 조금 더 쌓이면 받는다.'));
  // 시간 줄은 뺐다 (GDD 193장 17: 창 제목·진행 막대 시간 하나만). 덜 돈 까닭만 한 줄, 시간 없이
  const why = idleShortfall(p, save.nest);
  if (why) ul.append(el('li', 'bha-small', why));
  return ul;
}

/** '비운 동안 줄어든 것' 묶음 (GDD 237장 1·2): 보상 줄과 구분되게 위험 색(기존 토큰 --bha-danger) — 이미 반영된 결과라 안내만 */
export function absenceLossBlock(lines: readonly string[]): HTMLElement {
  const box = el('div', 'bha-idleloss');
  box.dataset.absenceLoss = '';
  box.append(el('p', 'bha-idleloss__head', '비운 동안 줄어든 것'));
  const ul = el('ul', 'bha-modal__list bha-idleloss__list');
  for (const l of lines) ul.append(el('li', '', l));
  box.append(ul);
  return box;
}

/** 복귀 창 (92장 2번): 몇 시간 만에 왔는지 + 쌓인 보상 + [받기]. [나중에] 로 닫으면 보상은 아이콘에 남는다.
 *  loss (GDD 237장 1): 비운 동안 줄어든 것 — 복귀 때 한 번만(나중에 아이콘으로 받을 때는 안 보임) */
export function showIdleReturn(acc: IdleAccrual, save: SaveData, faction: FactionConfig, onClaim: () => IdleRecord | null, loss: readonly string[] = []): void {
  const capped = acc.added + 1e-6 < Math.min(acc.awayHours, IX.maxHours) || acc.awayHours > IX.maxHours;
  const content = el('div', 'bha-idlebox');
  content.append(listOf(save, faction));
  if (loss.length) content.append(absenceLossBlock(loss));
  confirmDialog({
    title: `${hm(acc.awayHours)} 만에 돌아왔다`,
    body: capped ? `대기 보상은 최대 ${IX.maxHours}시간까지만 쌓인다. 쌓인 보상:` : '자리를 비운 동안 자동 모험으로 쌓인 보상:',
    content,
    yes: '받기',
    no: '나중에',
    onYes: () => {
      onClaim(); // 받은 것 알림은 뺐다 (GDD 233장 1) — 얼마나 받는지는 이 창 목록에 이미 보인다
    },
  });
}

/** 대기 보상 창이 안 뜨는 복귀 (GDD 237장 3): 같은 창 모양으로 '○시간 ○분 만에 돌아왔다' + 줄어든 것만 + [확인]. 줄어든 것이 없으면 부르지 않는다 */
export function showAbsenceReturn(awayHours: number, loss: readonly string[]): void {
  confirmDialog({ title: `${hm(awayHours)} 만에 돌아왔다`, body: '', content: absenceLossBlock(loss), yes: '확인', single: true, onYes: () => {} });
}

/** 방 '대기 보상' 아이콘 창 (92장 1번): 규칙 한 줄 + 쌓인 시간 진행 막대 + 지금 쌓인 것 + [받기]. 받을 게 없으면 [받기]는 비활성으로 자리만 지킨다 (100장 #16) */
export function showIdlePanel(save: SaveData, faction: FactionConfig, onClaim: () => IdleRecord | null): void {
  const has = idleClaimable(save) && (idlePendingYield(save)?.laps ?? 0) > 0; // 한 바퀴도 못 돌았으면 [받기] 비활성 — 시간은 계속 쌓인다 (222장 3)
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
      onClaim(); // 받은 것 알림은 뺐다 (GDD 233장 1) — 얼마나 받는지는 이 창 목록에 이미 보인다
    },
  });
}
