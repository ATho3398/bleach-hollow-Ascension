// 종이인형 작업본 (GDD 96장 36): 고정한 값·새 그림이 먼저 들어가는 곳. 편집기·시험 페이지가 쓴다(게임은 src/data/art/rig 의 게임본).
// "게임 넣어" = scripts/rig/promote.py 가 작업본을 게임본으로 옮긴다.
import rigRaw from '../../docs/design/rig-draft/humanoid.json';
import motionsRaw from '../../docs/design/rig-draft/motions.json';
import type { Motion, Rig } from '../../src/data/art/rig/pose';

export const DRAFT: Rig = rigRaw as unknown as Rig;
export const DRAFT_MOTIONS: Record<string, Motion> = Object.fromEntries(
  Object.entries(motionsRaw as Record<string, unknown>).filter(([k]) => k !== 'note'),
) as Record<string, Motion>;
