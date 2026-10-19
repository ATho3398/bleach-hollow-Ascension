// 공격 연출(몸통박치기) 강도 상수 (GDD 17-4, R-4, C.35). 화면 연출 전용이라 balance.ts 가 아니라 여기에 둔다.
// 값은 전부 CSS px / ms. 단계가 올라갈수록 물러나는 거리·돌진 속도·크기·잔상·피격 흔들림이 커진다.
import type { AttackFxKind } from '../engine/faction';


/** 연출 강도 단계: 기본 공격 < 체인 1·2·3 < 약점 < 필살 */
export type AttackTier = 'basic' | 'chain1' | 'chain2' | 'chain3' | 'weak' | 'special';

/** 약한 순서 (큐에서 센 것을 고를 때) */
export const ATTACK_TIER_ORDER: readonly AttackTier[] = ['basic', 'chain1', 'chain2', 'chain3', 'weak', 'special'];

export interface AttackFxLevel {
  /** 예비 동작: 뒤로 물러나는 거리(px)와 시간(ms) */
  backPx: number;
  backMs: number;
  /** 돌진 시간(ms). 짧을수록 빠르다 */
  lungeMs: number;
  /** 부딪힌 채 머무는 시간(ms) */
  holdMs: number;
  /** 제자리로 돌아오는 시간(ms) */
  returnMs: number;
  /** 부딪힐 때 크기 배율 */
  scale: number;
  /** 예비 동작 때 뒤로 젖히는 각도(도) */
  tiltDeg: number;
  /** 돌진 중 투명도 복제(잔상) 개수. 최대 2 */
  ghosts: number;
  /** 맞는 쪽이 밀리는 거리(px) */
  knockPx: number;
  /** 피격 연출 길이(ms) */
  hitMs: number;
  /** 피격 번쩍임 밝기 배율 */
  hitBright: number;
}

export const ATTACK_FX: Readonly<Record<AttackTier, AttackFxLevel>> = {
  basic:  { backPx: 4,  backMs: 90,  lungeMs: 130, holdMs: 30, returnMs: 170, scale: 1.0,  tiltDeg: 2, ghosts: 0, knockPx: 3,  hitMs: 200, hitBright: 1.8 },
  chain1: { backPx: 7,  backMs: 100, lungeMs: 115, holdMs: 40, returnMs: 180, scale: 1.04, tiltDeg: 3, ghosts: 1, knockPx: 5,  hitMs: 220, hitBright: 2.0 },
  chain2: { backPx: 11, backMs: 110, lungeMs: 100, holdMs: 50, returnMs: 190, scale: 1.08, tiltDeg: 4, ghosts: 1, knockPx: 8,  hitMs: 240, hitBright: 2.3 },
  chain3: { backPx: 16, backMs: 120, lungeMs: 85,  holdMs: 60, returnMs: 200, scale: 1.14, tiltDeg: 6, ghosts: 2, knockPx: 12, hitMs: 270, hitBright: 2.7 },
  weak:   { backPx: 20, backMs: 130, lungeMs: 75,  holdMs: 70, returnMs: 210, scale: 1.2,  tiltDeg: 7, ghosts: 2, knockPx: 15, hitMs: 300, hitBright: 3.0 },
  special:{ backPx: 26, backMs: 150, lungeMs: 65,  holdMs: 90, returnMs: 230, scale: 1.3,  tiltDeg: 9, ghosts: 2, knockPx: 20, hitMs: 340, hitBright: 3.4 },
};

/** 잔상 투명도 (복제 순서대로) */
export const GHOST_OPACITY: readonly number[] = [0.4, 0.22];
/** 잔상이 몸보다 늦게 따라오는 간격(ms) */
export const GHOST_LAG_MS = 28;

/** 돌진이 닿는 거리 = 두 그림 사이 간격 × 이 비율 (그림이 서로 겹치지 않을 만큼) */
export const REACH_RATIO = 0.82;
/** 막힌(guard) 공격을 맞을 때 피격 밀림·번쩍임을 줄이는 비율 */
export const GUARDED_HIT_RATIO = 0.4;

/** 배속은 재생 속도로 그대로 반영한다. 1~4배 */
export const FX_RATE_MIN = 1;
export const FX_RATE_MAX = 4;

/** 이 시간(ms)이 지나도 연출이 안 끝나면 강제로 끝낸 것으로 본다 (큐가 멈추는 것 방지) */
export const FX_SAFETY_MS = 1500;

// ───────────── 계열별 공격 연출 (GDD 19-2, C.45) ─────────────
// 계열마다 종족 설정 families[].fx 로 연출 종류를 고른다. 여기는 종류별 움직임·효과 값만 있고 종족을 모른다.

/** 몸의 움직임: lunge = 돌진해 붙어서 친다 / cast = 제자리에서 쏜다(몸은 반동만) */
export type FamilyMove = 'lunge' | 'cast';

export interface FamilyMotion {
  move: FamilyMove;
  /** lunge 돌진 거리 배율 (기본 몸통박치기 거리 대비) */
  reach: number;
  /** cast: 투사체·광선이 상대에게 닿기까지(ms, 1배 기준). lunge 는 0 */
  travelMs: number;
  /** 효과 한 번의 길이(ms, 1배 기준) */
  markMs: number;
}

/** 연출 종류별 움직임 (조 할퀴기 자국 / 교 턱 닫힘 / 탄 투사체 / 참 칼선 호 / 권 충격 원 / 귀 빛 구체·광선) */
export const FAMILY_MOTION: Readonly<Record<AttackFxKind, FamilyMotion>> = {
  claw:   { move: 'lunge', reach: 0.9,  travelMs: 0,   markMs: 260 },
  bite:   { move: 'lunge', reach: 1.0,  travelMs: 0,   markMs: 300 },
  shot:   { move: 'cast',  reach: 0,    travelMs: 230, markMs: 260 },
  slash:  { move: 'lunge', reach: 0.95, travelMs: 0,   markMs: 260 },
  impact: { move: 'lunge', reach: 1.0,  travelMs: 0,   markMs: 300 },
  beam:   { move: 'cast',  reach: 0,    travelMs: 160, markMs: 340 },
};

/** 단계별 효과: 1단계 = 기본 공격 한 번 / 2단계 = 연타(다단 히트) / 3단계 = 대형 효과 + 화면 흔들림 */
export interface FamilyStageFx {
  /** 효과(타격) 횟수 */
  hits: number;
  /** 타격 사이 간격(ms, 1배 기준) */
  gapMs: number;
  /** 효과 크기 배율 (마지막 타격) */
  scale: number;
  /** 화면 흔들림 */
  shake: boolean;
}

export const FAMILY_STAGE_FX: readonly FamilyStageFx[] = [
  { hits: 1, gapMs: 0,   scale: 1,   shake: false },
  { hits: 3, gapMs: 110, scale: 1.1, shake: false },
  { hits: 3, gapMs: 90,  scale: 2.0, shake: true },
];

/** 기술 이름 띄우는 시간(ms, 1배 기준) */
export const SKILL_NAME_MS = 1100;
