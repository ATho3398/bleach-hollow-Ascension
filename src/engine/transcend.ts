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

/** 슬롯 보너스 (GDD 244장 4·5) = 붕옥 개발로 오른 단계 수 × 1% (영구 — 합체로 6~10단계 진행이 0 이 되어도 오른 몫은 남는다) + 초월체 1종마다 +2%(최대 종 수만큼).
 *  전 능력치에 곱하는 배율의 + 부분 (0.05 = +5%). liberation = 붕옥 개발 몫(옛 이름 그대로 — 5단계 = 옛 붕옥 해방 +5%) */
export function slotStatBonus(developedSteps: number, transcendents: number, defs: readonly TranscendentDef[] = TRANSCENDENTS): { liberation: number; transcendents: number; total: number } {
  const liberation = Math.max(0, Math.floor(developedSteps)) * HX.perLevelBonus;
  const tr = Math.min(defs.length, Math.max(0, transcendents)) * HX.perTranscendentBonus;
  return { liberation, transcendents: tr, total: liberation + tr };
}

/** 붕옥 개발 재료 3종 (GDD 244장 3) */
export interface HogyokuCost {
  soul: number;
  shard: number;
  essence: number;
}

/** 단계 level(1~10)로 올리는 데 드는 재료 (balance hogyoku.develop 표) */
export function developCost(level: number): HogyokuCost {
  const d = HX.develop;
  const i = Math.min(d.soul.length, Math.max(1, Math.floor(level))) - 1;
  return { soul: d.soul[i]!, shard: d.shard[i]!, essence: d.essence[i]! };
}

/** from+1 ~ to 단계 재료 합 */
export function developCostSum(from: number, to: number): HogyokuCost {
  const out: HogyokuCost = { soul: 0, shard: 0, essence: 0 };
  for (let l = from + 1; l <= to; l++) {
    const c = developCost(l);
    out.soul += c.soul;
    out.shard += c.shard;
    out.essence += c.essence;
  }
  return out;
}
