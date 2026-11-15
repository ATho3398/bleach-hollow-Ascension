// 관절 편집기: 부위를 옮길 때 딸린 부위도 같이 (사용자 2026-10-29, GDD 96장 42).
// 머리 → 일반머리·뒷머리, 왼팔 → 엄지, 오른 위팔 → 아래팔, 다리 → 정강이·발. 딸린 부위(뒤에 오는 것)를 옮기면 그것만.
// 무엇이 딸렸는지는 뼈대 데이터 edit.follow. 딸린 부위의 뼈가 다르면(뒷머리·아래팔·정강이·발) 그 관절도 같이 옮겨 돌아가는 자리가 안 어긋난다.
import type { PartArt, Rig } from '../../src/data/art/rig/pose';

export interface FollowMove {
  /** 같이 옮길 부위 그림(고른 부위 먼저) */
  parts: { slot: string; part: PartArt }[];
  /** 같이 옮길 관절(뼈 id) — 이 몸의 관절에 넣는다 */
  bones: string[];
  /** 고른 부위의 관절(뼈 id) — 고른 부위가 그 뼈의 주 부위일 때만(사용자 2026-11-14 "부위 움직이면 관절도 그대로 따라가야지", GDD 115-A 132) */
  lead?: string;
}

/** look 외형에서 slot 부위를 옮길 때 같이 움직일 것. 고른 부위에 그림이 없으면 null */
/** sub = false 면 딸린 부위 없이 고른 부위만('하위 부위 함께 움직이기' 체크 풂, 115-A 132) */
export function followMove(rig: Rig, lookId: string, slot: string, sub = true): FollowMove | null {
  const look = rig.looks[lookId];
  if (!look) return null;
  const body = rig.bodies[look.body] ?? {};
  const partOf = (s: string): PartArt | undefined => body[s] ?? (typeof look[s] === 'object' ? (look[s] as PartArt) : undefined);
  const lead = partOf(slot);
  if (!lead) return null;
  const boneOf = (s: string) => rig.slots.find((x) => x.id === s)?.bone;
  const leadBone = boneOf(slot);
  const parts = [{ slot, part: lead }];
  const bones: string[] = [];
  for (const f of sub ? rig.edit?.follow?.[slot] ?? [] : []) {
    const p = partOf(f);
    if (p && !parts.some((x) => x.part === p)) parts.push({ slot: f, part: p });
    const b = boneOf(f);
    // 그림이 있는 딸린 부위의 관절만(턱 jaw 처럼 이 외형에 그림이 없는 부위의 관절은 안 건드림 — 115-A 71)
    if (p && b && b !== leadBone && !bones.includes(b)) bones.push(b);
  }
  // 주 부위 = 뼈와 이름이 같은 부위, 그런 부위가 없으면 그 뼈의 첫 부위
  const main = leadBone !== undefined && (slot === leadBone || (!rig.slots.some((x) => x.id === leadBone) && rig.slots.find((x) => x.bone === leadBone)?.id === slot));
  return main ? { parts, bones, lead: leadBone } : { parts, bones };
}
