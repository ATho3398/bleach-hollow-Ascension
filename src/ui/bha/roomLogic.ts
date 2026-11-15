// 메인 방 화면의 순수 계산 (tests/room-ui.test.ts)
import type { RoomConfig } from '../../engine/faction';
import { BALANCE } from '../../config/balance';
import { bondStage, CARE_STATUS_NAMES, mealOverdue } from '../../engine/nest';

const CP = BALANCE.provisional.nest.care;
import { fullnessOf } from './fullness';
import { fixParticles } from '../../engine/josa';

export type Mood = 'idle' | 'tired' | 'risk' | 'weak' | 'collapsed';

/** 캐릭터 기분: 쓰러짐(GDD 102-3) > 쇠약 > 리스크 경고(한계의 60/한계 이상) > 피곤(상태 또는 컨디션 40 미만) */
export function moodOf(s: { weakened: boolean; tired?: boolean; collapsed?: boolean; condition: number; risk: number; riskLimit: number }, condWarn = 40, riskWarn = 60): Mood {
  if (s.collapsed) return 'collapsed';
  if (s.weakened) return 'weak';
  if (s.risk >= riskWarn && s.riskLimit > 0) return 'risk';
  if (s.tired || s.condition < condWarn) return 'tired';
  return 'idle';
}

/** 말풍선 문구 고르기. rand 는 0~1 미만(테스트에서 고정) */
export function pickLine(talk: RoomConfig['talk'], key: keyof RoomConfig['talk'], rand: () => number = Math.random): string {
  const list = talk[key];
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))] ?? '…';
}

/** 교감 단계 대사 키 (GDD 102-6 ④): 0~29 서먹 / 30~69 친함 / 70~ 단짝 */
export function bondTalkKey(bond: number): 'bondShy' | 'bondClose' | 'bondBest' {
  return (['bondShy', 'bondClose', 'bondBest'] as const)[bondStage(bond)];
}

/** 교감 단계 이름 */
export const BOND_STAGE_NAMES = ['서먹', '친함', '단짝'] as const;

/** 평소 혼잣말 키: 절반은 교감 단계 대사, 나머지는 기쁨(가끔)·평소 */
export function idleTalkKey(bond: number, rand: () => number = Math.random): keyof RoomConfig['talk'] {
  const r = rand();
  return r < 0.5 ? bondTalkKey(bond) : r < 0.7 ? 'happy' : 'idle';
}

export interface StatusChip {
  kind: 'hunger' | 'cond' | 'risk' | 'bond' | 'weak' | 'tired' | 'collapsed';
  /** 표시 이름(종족 설정에서 온 것은 호출한 쪽이 넘긴다) */
  label: string;
  icon: string;
  /** 칩에 보이는 값. 상태 칩(쇠약·피곤·쓰러짐)은 값 없음 — 이름이 보인다 */
  value: number | null;
  danger: boolean;
  /** 상태 칩: 풀리는 법 한 줄 (툴팁) */
  hint?: string;
  /** 상태 칩: 풀리는 법 아주 짧게 — 방 상태 박스 줄에 보인다 (GDD 193장 15: 컨디션 100 인데 피곤이 남아 버그처럼 보였다) */
  short?: string;
}

/** 상태 칩 풀리는 법 한 줄 (GDD 102-2·102-3, C.185 '~다' 체 · 문턱은 BALANCE). 자세한 설명은 상태 ⓘ 창(statusInfo) */
export const CARE_STATUS_HINTS = {
  weak: '먹이를 먹이고 모험을 한 번 다녀오거나 링거를 먹이면 풀린다', // 쇠약 = 먹이를 안 먹인 지 care.weakAfterHours 시간 (GDD 241-C 6)
  tired: `컨디션을 ${CP.tiredCondition} 넘게 올리고 모험을 한 번 다녀오거나 에너지 드링크를 먹이면 풀린다`,
  collapsed: '상점 약 칸의 구급상자를 쓰면 풀린다. 남은 시간이 다 되거나 모험에서 지면 사망한다.',
} as const;

/** 쇠약 풀리는 법 한 줄 — 돌보기 이름은 종족 설정(nestActionsShort.feed: 호로 '먹이' / 사신 '식사', GDD 243장 9) */
export function weakHintOf(feedName: string): string {
  return fixParticles(`${feedName}을(를) 주고 모험을 한 번 다녀오거나 링거를 먹이면 풀린다`);
}

/** 상태이상 푸는 법 아주 짧게 (GDD 193장 15, 102-2·102-3): 수치를 문턱 넘게 채웠으면 '모험 1번', 아직이면 채울 수치 이름. 빈사 = 구급상자, 사망 = 부활 */
export function careStatusShort(s: { hunger: number; condition: number; lastMealAt?: number }, names: { feedName?: string; fullnessName?: string }, nowMs: number = Date.now()): { weak: string; tired: string; collapsed: string; dead: string } {
  return {
    // 쇠약 (GDD 241-C 6): 아직 안 먹였으면 먹이부터, 먹였으면 모험 1번
    weak: mealOverdue({ lastMealAt: s.lastMealAt ?? 0 }, nowMs) ? `${names.feedName ?? '먹이'} 주기` : '모험 1번',
    tired: s.condition > CP.tiredCondition ? '모험 1번' : '컨디션 채우기',
    collapsed: '구급상자',
    dead: '부활',
  };
}

/** 방 캐릭터 머리 위 상태 칩 (GDD 18-8): 배부름(C.63, 허기를 뒤집어 표시)·컨디션·리스크 게이지·교감(GDD 102-6) + 쓰러짐·쇠약·피곤 칩(GDD 102-7).
 *  위험 구간은 기존 경고 기준(허기 80↑, 컨디션 40↓, 리스크 60↑)과 같다 */
export function statusChips(
  s: { hunger: number; condition: number; risk: number; weakened: boolean; tired?: boolean; collapsed?: boolean; dead?: boolean; lastMealAt?: number },
  names: { riskGaugeName: string; fullnessName?: string; feedName?: string; nestActionsShort?: { feed?: string } },
  warn = { hunger: 80, condition: 40, risk: 60 },
): StatusChip[] {
  const chips: StatusChip[] = [
    // 배부름 (C.63): 값은 100 − 허기 (가득 = 100), 위험 구간은 그대로(허기 80↑ = 배부름 20↓)
    { kind: 'hunger', label: names.fullnessName ?? '배부름', icon: 'i-hunger', value: Math.round(fullnessOf(s.hunger)), danger: s.hunger >= warn.hunger },
    { kind: 'cond', label: '컨디션', icon: 'i-cond', value: Math.round(s.condition), danger: s.condition < warn.condition },
    // 방 = 배부름·컨디션·리스크 3줄 (영압 안정도 줄은 C.391 GDD 239장 4 에서 삭제). 교감은 상태 화면에서만
    { kind: 'risk', label: names.riskGaugeName, icon: 'i-risk', value: Math.round(s.risk), danger: s.risk >= warn.risk },
  ];
  // 돌보기 이름 (GDD 243장 9): 종족 설정 nestActionsShort.feed — 사신 화면에 '먹이'가 나오지 않게
  const feedName = names.feedName ?? names.nestActionsShort?.feed;
  const short = careStatusShort(s, { ...names, feedName });
  if (s.dead) chips.push({ kind: 'collapsed', label: CARE_STATUS_NAMES.dead, icon: 'i-broken', value: null, danger: true, hint: '방의 [부활]로 다시 시작한다', short: short.dead });
  else if (s.collapsed) chips.push({ kind: 'collapsed', label: CARE_STATUS_NAMES.collapsed, icon: 'i-broken', value: null, danger: true, hint: CARE_STATUS_HINTS.collapsed, short: short.collapsed });
  if (s.weakened) chips.push({ kind: 'weak', label: CARE_STATUS_NAMES.weak, icon: 'i-hunger', value: null, danger: true, hint: feedName ? weakHintOf(feedName) : CARE_STATUS_HINTS.weak, short: short.weak });
  if (s.tired) chips.push({ kind: 'tired', label: CARE_STATUS_NAMES.tired, icon: 'i-cond', value: null, danger: true, hint: CARE_STATUS_HINTS.tired, short: short.tired });
  return chips;
}

/** 사망으로 막힌 곳 안내 띠 (GDD 102-3). 빈사는 막지 않는다(출발 확인 창, v5.228 수정) */
export function careBlockText(_b: 'dead'): { eyebrow: string; title: string; meta: string } {
  return { eyebrow: CARE_STATUS_NAMES.dead, title: '방에서 [부활]해야 다시 움직일 수 있다', meta: '죽은 몸으로는 아무 데도 갈 수 없다.' };
}

/** 빈사 남은 시간 "5시간 59분" (올림 분, 1시간 미만이면 "59분" — GDD 176장 15: "6:00"이 6분처럼 보였다) */
export function dyingClock(leftMs: number): string {
  const m = Math.max(0, Math.ceil(leftMs / 60_000));
  const hh = Math.floor(m / 60);
  return hh > 0 ? `${hh}시간 ${m % 60}분` : `${m % 60}분`;
}

/** 복귀 알림 띠 (GDD 102-7): "○시간 동안 비웠다 — 배부름 −n · 컨디션 −n" (안정도는 C.391 삭제). 줄어든 것이 없으면 그 칸은 뺀다 */
export function absenceText(r: { hours: number; flow: { hunger: number; condition: number } }, names: { fullnessName: string }): string {
  const h = r.hours >= 1 ? `${Math.floor(r.hours)}시간` : `${Math.max(1, Math.round(r.hours * 60))}분`;
  const parts = [
    r.flow.hunger >= 0.5 ? `${names.fullnessName} −${Math.round(r.flow.hunger)}` : '',
    r.flow.condition <= -0.5 ? `컨디션 −${Math.round(-r.flow.condition)}` : '',
  ].filter(Boolean);
  return parts.length ? `${h} 동안 비웠다 — ${parts.join(' · ')}` : `${h} 동안 비웠다`;
}

/** 보상 없이 줄어든 것만 있는 복귀 창을 띄우나 (GDD 243장 8): idle.lossOnlyMinMinutes(1시간) 이상 비웠을 때만 */
export function lossOnlyReturnShown(hours: number): boolean {
  return hours * 60 >= BALANCE.provisional.idle.lossOnlyMinMinutes;
}

/** 비운 동안 줄어든 것 줄 (GDD 237장 1): 배부름·컨디션 −n(줄어든 것만, 안정 수치는 C.391 삭제) + 이번에 빈사·사망으로 이어졌으면 그 한 줄. 없으면 빈 목록 */
export function absenceLossLines(r: { flow: { hunger: number; condition: number }; collapsed?: boolean; died?: boolean }, names: { fullnessName: string }): string[] {
  const parts = [
    r.flow.hunger >= 0.5 ? `${names.fullnessName} −${Math.round(r.flow.hunger)}` : '',
    r.flow.condition <= -0.5 ? `컨디션 −${Math.round(-r.flow.condition)}` : '',
  ].filter(Boolean);
  const out = parts.length ? [parts.join(' · ')] : [];
  if (r.died) out.push(`${CARE_STATUS_NAMES.dead} — 비운 사이 빈사 시간이 다 됐다`);
  else if (r.collapsed) out.push(`${CARE_STATUS_NAMES.collapsed} — 오래 비워 쓰러졌다`);
  return out;
}

/** 돌봄 요청·거절 말풍선 키 (GDD 82장): 문구는 종족 설정 room.talk 의 이 키에서 */
export function careTalkKey(kind: 'ask' | 'refuse', action: 'pet' | 'sleep'): keyof RoomConfig['talk'] {
  const keys = { ask: { pet: 'askPet', sleep: 'askSleep' }, refuse: { pet: 'refusePet', sleep: 'refuseSleep' } } as const;
  return keys[kind][action];
}
