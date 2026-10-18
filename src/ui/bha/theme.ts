// 종족 테마 (HANDOFF 3, CLAUDE.md 규칙 2): 종족 설정의 theme 값을 루트 data-bha-theme 에 넣는다. 종족 id 로 분기하지 않는다.
import type { FactionConfig } from '../../engine/faction';

export function applyTheme(faction: Pick<FactionConfig, 'theme'>, doc: Document = document): void {
  doc.documentElement.dataset.bhaTheme = faction.theme;
}
