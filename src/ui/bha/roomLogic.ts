// 메인 방 화면의 순수 계산 (tests/room-ui.test.ts)
import type { RoomConfig } from '../../engine/faction';
import { bondStage, CARE_STATUS_NAMES } from '../../engine/nest';
import { fullnessOf } from './fullness';

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
}

/** 상태 칩 풀리는 법 한 줄 (GDD 102-2·102-3) */
export const CARE_STATUS_HINTS = {
  weak: '배부름을 20 넘게 채우고 원정을 한 번 다녀오거나 링거',
  tired: '컨디션을 30 넘게 올리고 원정을 한 번 다녀오거나 에너지 드링크',
  collapsed: '상점 약 칸의 치료제를 먹여야 일어난다',
} as const;

/** 방 캐릭터 머리 위 상태 칩 (GDD 18-8): 배부름(C.63, 허기를 뒤집어 표시)·컨디션·리스크 게이지·교감(GDD 102-6) + 쓰러짐·쇠약·피곤 칩(GDD 102-7).
 *  위험 구간은 기존 경고 기준(허기 80↑, 컨디션 40↓, 리스크 60↑)과 같다 */
export function statusChips(
  s: { hunger: number; condition: number; risk: number; weakened: boolean; tired?: boolean; collapsed?: boolean; bond?: number },
  names: { riskGaugeName: string; fullnessName?: string },
  warn = { hunger: 80, condition: 40, risk: 60 },
): StatusChip[] {
  const chips: StatusChip[] = [
    // 배부름 (C.63): 값은 100 − 허기 (가득 = 100), 위험 구간은 그대로(허기 80↑ = 배부름 20↓)
    { kind: 'hunger', label: names.fullnessName ?? '배부름', icon: 'i-hunger', value: Math.round(fullnessOf(s.hunger)), danger: s.hunger >= warn.hunger },
    { kind: 'cond', label: '컨디션', icon: 'i-cond', value: Math.round(s.condition), danger: s.condition < warn.condition },
    { kind: 'risk', label: names.riskGaugeName, icon: 'i-risk', value: Math.round(s.risk), danger: s.risk >= warn.risk },
  ];
  if (s.bond !== undefined) chips.push({ kind: 'bond', label: '교감', icon: 'i-care-pet', value: Math.round(s.bond), danger: false });
  if (s.collapsed) chips.push({ kind: 'collapsed', label: CARE_STATUS_NAMES.collapsed, icon: 'i-broken', value: null, danger: true, hint: CARE_STATUS_HINTS.collapsed });
  if (s.weakened) chips.push({ kind: 'weak', label: CARE_STATUS_NAMES.weak, icon: 'i-hunger', value: null, danger: true, hint: CARE_STATUS_HINTS.weak });
  if (s.tired) chips.push({ kind: 'tired', label: CARE_STATUS_NAMES.tired, icon: 'i-cond', value: null, danger: true, hint: CARE_STATUS_HINTS.tired });
  return chips;
}

/** 쓰러짐·사망으로 막힌 곳 안내 띠 (GDD 102-3) */
export function careBlockText(b: 'collapsed' | 'dead'): { eyebrow: string; title: string; meta: string } {
  return b === 'dead'
    ? { eyebrow: CARE_STATUS_NAMES.dead, title: '죽은 몸으로는 아무 데도 갈 수 없다', meta: '방에서 [부활]을 해야 다시 시작한다.' }
    : { eyebrow: CARE_STATUS_NAMES.collapsed, title: '쓰러져서 모험을 나갈 수 없다 — 치료제가 필요하다', meta: `원정·훈련·탑·쟁탈전이 막혔다. ${CARE_STATUS_HINTS.collapsed}.` };
}

/** 복귀 알림 띠 (GDD 102-7): "○시간 동안 비웠다 — 배부름 −n · 컨디션 −n · 영압 안정도 −n". 줄어든 것이 없으면 그 칸은 뺀다 */
export function absenceText(r: { hours: number; flow: { hunger: number; condition: number; stability: number } }, names: { fullnessName: string; stabilityName: string }): string {
  const h = r.hours >= 1 ? `${Math.floor(r.hours)}시간` : `${Math.max(1, Math.round(r.hours * 60))}분`;
  const parts = [
    r.flow.hunger >= 0.5 ? `${names.fullnessName} −${Math.round(r.flow.hunger)}` : '',
    r.flow.condition <= -0.5 ? `컨디션 −${Math.round(-r.flow.condition)}` : '',
    r.flow.stability <= -0.5 ? `${names.stabilityName} −${Math.round(-r.flow.stability)}` : '',
  ].filter(Boolean);
  return parts.length ? `${h} 동안 비웠다 — ${parts.join(' · ')}` : `${h} 동안 비웠다`;
}

/** 돌봄 요청·거절 말풍선 키 (GDD 82장): 문구는 종족 설정 room.talk 의 이 키에서 */
export function careTalkKey(kind: 'ask' | 'refuse', action: 'pet' | 'sleep'): keyof RoomConfig['talk'] {
  const keys = { ask: { pet: 'askPet', sleep: 'askSleep' }, refuse: { pet: 'refusePet', sleep: 'refuseSleep' } } as const;
  return keys[kind][action];
}
