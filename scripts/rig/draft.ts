// 종이인형 작업본 (GDD 96장 36): 고정한 값·새 그림이 먼저 들어가는 곳. 편집기·시험 페이지가 쓴다(게임은 src/data/art/rig 의 게임본).
// "게임 넣어" = scripts/rig/promote.py 가 작업본을 게임본으로 옮긴다.
import rigRaw from '../../docs/design/rig-draft/humanoid.json';
import motionsRaw from '../../docs/design/rig-draft/motions.json';
import beastRaw from '../../docs/design/rig-draft/beast.json';
import beastMotionsRaw from '../../docs/design/rig-draft/beast-motions.json';
import serpentRaw from '../../docs/design/rig-draft/serpent.json';
import serpentMotionsRaw from '../../docs/design/rig-draft/serpent-motions.json';
import { readMotions, type Motion, type MotionSets, type Rig } from '../../src/data/art/rig/pose';

const humanoid = readMotions(motionsRaw);
export const DRAFT: Rig = rigRaw as unknown as Rig;
export const DRAFT_MOTIONS: Record<string, Motion> = humanoid.motions;
export const DRAFT_MOTION_SETS: MotionSets = humanoid.sets;

/** 뼈대마다(사람형·짐승형·뱀형, GDD 115-A 41·44): 뼈대 + 기본 동작 + 동작 묶음 */
export interface DraftRig {
  rig: Rig;
  motions: Record<string, Motion>;
  sets: MotionSets;
}
const beast = readMotions(beastMotionsRaw);
const serpent = readMotions(serpentMotionsRaw);
export const DRAFT_RIGS: Record<string, DraftRig> = {
  humanoid: { rig: DRAFT, motions: DRAFT_MOTIONS, sets: DRAFT_MOTION_SETS },
  beast: { rig: beastRaw as unknown as Rig, motions: beast.motions, sets: beast.sets },
  serpent: { rig: serpentRaw as unknown as Rig, motions: serpent.motions, sets: serpent.sets },
};
