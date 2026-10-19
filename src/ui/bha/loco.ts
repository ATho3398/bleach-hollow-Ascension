// 캐릭터 이동 방식 화면 연결 (GDD 18-11): 해석한 값을 data-loco 로 붙이면 loco.css 가 부유·걷기·날기 움직임을 입힌다.
// 우선순위 = (개발용 ?loco= 파라미터) > 그림 manifest > 진화체 > 종족 기본 > walk. 전투 수치와 무관한 표시 전용.
import { tryGetForm } from '../../data/evolution';
import type { ArtUrls } from '../../data/art/manifest';
import type { FactionConfig } from '../../engine/faction';
import { locomotionFromQuery, resolveLocomotion, type Locomotion } from '../../engine/locomotion';

/** 떠 있는 높이(몸 높이 비율): 부유 10~15% 중간, 날기 25~35% 중간. loco.css 의 --loco-f 와 맞출 것 */
export const LOCO_LIFT: Record<Locomotion, number> = { walk: 0, float: 0.12, fly: 0.3 };

function queryOverride(): Locomotion | undefined {
  try {
    return typeof location === 'undefined' ? undefined : locomotionFromQuery(location.search);
  } catch {
    return undefined;
  }
}

/** 지금 캐릭터의 이동 방식. formId = save.evolution.formId (1단계는 null) */
export function locoOf(faction: Pick<FactionConfig, 'locomotion'>, formId: string | null | undefined, art?: Pick<ArtUrls, 'locomotion'> | null): Locomotion {
  return queryOverride() ?? resolveLocomotion({ art: art?.locomotion, form: formId ? tryGetForm(formId)?.locomotion : undefined, faction: faction.locomotion });
}

/** 요소에 이동 방식을 붙인다 (CSS 가 data-loco 로 움직임·떠 있는 높이를 정한다) */
export function setLoco(node: HTMLElement, loco: Locomotion): void {
  node.dataset.loco = loco;
}
