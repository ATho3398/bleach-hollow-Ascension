// 붕옥·초월체 (GDD 22-3·22-9): 종족 무관 공통 로직. 초월체 결정·보유 보너스·붕옥 게이지. 수치는 BALANCE.provisional.hogyoku.
import { BALANCE } from '../config/balance';
import type { AttackCategory } from '../data/schema';
import { TRANSCENDENTS, type TranscendentCondition, type TranscendentDef } from '../data/transcendents';

const HX = BALANCE.provisional.hogyoku;

/** 합체 판정에 쓰는 한 캐릭터의 상태 (속성·공격 분류·히든 진화체 여부·환생 횟수) */
export interface FusionInput {
  rebirths: number;
  hidden: boolean;
  elements: readonly string[];
  category: AttackCategory;
}

/** 조건 하나가 맞는가. otherwise 는 다른 조건(otherwise 제외)이 하나도 맞지 않을 때 */
export function conditionMet(c: TranscendentCondition, chars: readonly FusionInput[], defs: readonly TranscendentDef[] = TRANSCENDENTS): boolean {
  if (chars.length === 0) return false;
  switch (c.type) {
    case 'rebirthSum':
      return chars.reduce((n, x) => n + x.rebirths, 0) >= c.min;
    case 'allHidden':
      return chars.every((x) => x.hidden);
    case 'sameElement':
      return chars[0]!.elements.some((e) => chars.every((x) => x.elements.includes(e)));
    case 'allCategory':
      return chars.every((x) => x.category === c.category);
    case 'otherwise':
      return !defs.some((d) => d.condition.type !== 'otherwise' && conditionMet(d.condition, chars, defs));
  }
}

/** 이 조합이면 무엇이 되나 (GDD 22-3): 위에서부터 조건을 보고 이미 가진 것은 건너뛴다. 조건 맞는 미보유가 없으면 미보유 중 표 아래쪽부터.
 *  다 가졌으면 null (합체 막힘) */
export function decideTranscendent(chars: readonly FusionInput[], owned: readonly string[], defs: readonly TranscendentDef[] = TRANSCENDENTS): TranscendentDef | null {
  const left = defs.filter((d) => !owned.includes(d.id));
  if (left.length === 0) return null;
  return left.find((d) => conditionMet(d.condition, chars, defs)) ?? left[left.length - 1]!;
}

/** 모든 초월체를 모았나 */
export function allTranscendentsOwned(owned: readonly string[], defs: readonly TranscendentDef[] = TRANSCENDENTS): boolean {
  return defs.every((d) => owned.includes(d.id));
}

/** 슬롯 보너스 (GDD 12-3·12-4 v6.014) = 붕옥 강화로 올린 강 수 합 × 0.1% (영구 — 합체로 26~50강 진행이 0 이 되어도 오른 몫은 남는다) + 초월체 1종마다 +2%(최대 종 수만큼).
 *  전 능력치에 곱하는 배율의 + 부분 (0.05 = +5%). liberation = 붕옥 개발 몫(옛 이름 그대로) */
export function slotStatBonus(developedSteps: number, transcendents: number, defs: readonly TranscendentDef[] = TRANSCENDENTS): { liberation: number; transcendents: number; total: number } {
  const liberation = Math.round(Math.max(0, Math.floor(developedSteps)) * HX.perStepBonus * 1e6) / 1e6;
  const tr = Math.min(defs.length, Math.max(0, transcendents)) * HX.perTranscendentBonus;
  return { liberation, transcendents: tr, total: Math.round((liberation + tr) * 1e6) / 1e6 };
}

/** 붕옥 강화 트랙 id = 재료 id (balance hogyoku.trackIds — 종족 무관) */
export type HogyokuTrackId = (typeof HX.trackIds)[number];
export const HOGYOKU_TRACK_IDS: readonly HogyokuTrackId[] = HX.trackIds;

/** 붕옥 개발 재료 3종 (GDD 12-3) — 트랙마다 강 수, 재료마다 개수 등에 같이 쓴다 */
export type HogyokuCost = Record<HogyokuTrackId, number>;

/** 트랙 track 을 n강(1~trackMax)으로 올리는 데 드는 그 트랙 재료 수 */
export function trackStepCost(track: HogyokuTrackId, n: number): number {
  void track; // 세 트랙 같은 식 (GDD 12-3 v6.016: n강 = n개) — 트랙마다 달라지면 여기서
  return Math.max(1, Math.floor(n)) * HX.costPerLevel;
}

/** 트랙 track 의 from+1 ~ to 강 재료 합 */
export function trackCostSum(track: HogyokuTrackId, from: number, to: number): number {
  let sum = 0;
  for (let n = Math.max(0, from) + 1; n <= Math.min(HX.trackMax, to); n++) sum += trackStepCost(track, n);
  return sum;
}

/** 개발 %(종합 해방도, 0~1) = 세 트랙 강 수 평균 ÷ trackMax */
export function hogyokuProgress(tracks: Readonly<HogyokuCost>): number {
  const ids = HOGYOKU_TRACK_IDS;
  const avg = ids.reduce((a, id) => a + Math.min(HX.trackMax, Math.max(0, tracks[id] ?? 0)), 0) / ids.length;
  return avg / HX.trackMax;
}
