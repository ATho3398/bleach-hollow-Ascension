// 종이인형 작업본 (GDD 96장 36): 고정한 값·새 그림이 먼저 들어가는 곳. 편집기·시험 페이지가 쓴다(게임은 src/data/art/rig 의 게임본).
// "게임 넣어" = scripts/rig/promote.py 가 작업본을 게임본으로 옮긴다.
import rigRaw from '../../docs/design/rig-draft/humanoid.json';
import motionsRaw from '../../docs/design/rig-draft/motions.json';
import beastRaw from '../../docs/design/rig-draft/beast.json';
import beastMotionsRaw from '../../docs/design/rig-draft/beast-motions.json';
import serpentRaw from '../../docs/design/rig-draft/serpent.json';
import serpentMotionsRaw from '../../docs/design/rig-draft/serpent-motions.json';
import spiderRaw from '../../docs/design/rig-draft/spider.json';
import spiderMotionsRaw from '../../docs/design/rig-draft/spider-motions.json';
import wraithRaw from '../../docs/design/rig-draft/wraith.json';
import wraithMotionsRaw from '../../docs/design/rig-draft/wraith-motions.json';
import aizenRaw from '../../docs/design/rig-draft/aizen.json';
import aizenMotionsRaw from '../../docs/design/rig-draft/aizen-motions.json';
import ichigoRaw from '../../docs/design/rig-draft/ichigo.json';
import ichigoMotionsRaw from '../../docs/design/rig-draft/ichigo-motions.json';
import mugetsuRaw from '../../docs/design/rig-draft/mugetsu.json';
import mugetsuMotionsRaw from '../../docs/design/rig-draft/mugetsu-motions.json';
import mugetsuFlameRaw from '../../docs/design/rig-draft/mugetsu-flame.json';
import type { FlameSpec } from './flame';
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
  /** 인형 위에 얹는 불꽃 층(작업본 전용, GDD 115-A 135) */
  flame?: FlameSpec;
}
const beast = readMotions(beastMotionsRaw);
const serpent = readMotions(serpentMotionsRaw);
const spider = readMotions(spiderMotionsRaw);
const wraith = readMotions(wraithMotionsRaw);
const aizen = readMotions(aizenMotionsRaw);
const ichigo = readMotions(ichigoMotionsRaw);
const mugetsu = readMotions(mugetsuMotionsRaw);
export const DRAFT_RIGS: Record<string, DraftRig> = {
  humanoid: { rig: DRAFT, motions: DRAFT_MOTIONS, sets: DRAFT_MOTION_SETS },
  beast: { rig: beastRaw as unknown as Rig, motions: beast.motions, sets: beast.sets },
  serpent: { rig: serpentRaw as unknown as Rig, motions: serpent.motions, sets: serpent.sets },
  spider: { rig: spiderRaw as unknown as Rig, motions: spider.motions, sets: spider.sets }, // 거미형(GDD 115-A 106)
  wraith: { rig: wraithRaw as unknown as Rig, motions: wraith.motions, sets: wraith.sets }, // 부유형(GDD 115-A 114)
  aizen: { rig: aizenRaw as unknown as Rig, motions: aizen.motions, sets: aizen.sets }, // 아이젠(대기만, GDD 115-A 124 — 작업본만)
  ichigo: { rig: ichigoRaw as unknown as Rig, motions: ichigo.motions, sets: ichigo.sets }, // 이치고(혈쇄, 대기만, GDD 115-A 128 — 작업본만)
  mugetsu: { rig: mugetsuRaw as unknown as Rig, motions: mugetsu.motions, sets: mugetsu.sets, flame: mugetsuFlameRaw as unknown as FlameSpec }, // 이치고(무월 — 이름 추정, 대기만, GDD 115-A 129 — 작업본만)
};
