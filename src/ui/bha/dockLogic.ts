// 홈 하단 독의 순수 계산 (GDD 18-2, tests/dock.test.ts)
import type { FoodId, NestAction } from '../../engine/faction';
import type { FactionConfig } from '../../engine/faction';

/** 독이 위로 펼친 칸: 없음 / 먹이 종류 줄 / 더보기 줄. 한 번에 하나만 열린다 */
export type DockPanel = 'none' | 'food' | 'more';

/** 같은 버튼을 다시 누르면 닫고, 다른 칸이 열려 있으면 그것을 닫고 새로 연다 */
export function togglePanel(cur: DockPanel, which: Exclude<DockPanel, 'none'>): DockPanel {
  return cur === which ? 'none' : which;
}

/** 돌보기·먹이 선택·메뉴 실행·바깥 누름 뒤에는 닫는다 */
export const CLOSED: DockPanel = 'none';

export interface CareDelta {
  hunger: number;
  condition: number;
  stability: number;
  risk: number;
}

/** 돌보기 결과 한 줄(방 말풍선): "짐승 고기를 먹었다. 허기 −35 · 컨디션 +0" 대신 변한 수치만 보여 준다 */
export function careFeedback(faction: FactionConfig, action: NestAction, food: FoodId | null, d: CareDelta): string {
  const lead = action === 'feed' && food ? `${faction.foodNames[food]}: ` : `${faction.nestActions[action]}: `;
  const parts: string[] = [];
  const add = (name: string, v: number) => {
    const r = Math.round(v);
    if (r !== 0) parts.push(`${name} ${r > 0 ? '+' : '−'}${Math.abs(r)}`);
  };
  add('허기', d.hunger);
  add('컨디션', d.condition);
  add(faction.stabilityName, d.stability);
  add(faction.riskGaugeName, d.risk);
  return lead + (parts.length > 0 ? parts.join(' · ') : '변화 없음');
}
