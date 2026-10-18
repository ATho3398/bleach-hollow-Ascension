// 슬롯 고르기 화면 (Q-3, C.31): [새로 시작]·[불러오기]가 빈 슬롯/덮어쓸 슬롯을 고르는 곳. 행은 button 이라 위/아래/확정과 터치 모두 된다.
import type { FactionConfig } from '../engine/faction';
import type { SlotSummary } from '../saveSlots';
import { el, notice, panel } from './bha/dom';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { slotRows } from './startView';

export type SlotPickMode = 'new' | 'import';

const TEXT: Record<SlotPickMode, { title: string; sub: string; help: string }> = {
  new: { title: '새로 시작', sub: '세이브를 만들 슬롯을 고른다', help: '비어 있는 슬롯을 고르면 바로 종족 선택으로 간다. 이미 기록이 있는 슬롯을 고르면 덮어쓸지 한 번 더 묻는다.' },
  import: { title: '불러오기', sub: '백업을 넣을 슬롯을 고른다', help: '백업 파일이나 복사해 둔 글을 고른 슬롯에 넣는다. 기록이 있는 슬롯이면 덮어쓰기 전에 확인하고, 덮어쓰기 전의 세이브는 한 번 보관한다.' },
};

export function slotPickView(root: HTMLElement, mode: SlotPickMode, summaries: readonly SlotSummary[], factions: readonly FactionConfig[], onPick: (s: SlotSummary) => void): void {
  const t = TEXT[mode];
  const list = panel({ title: '세이브 슬롯' }, slotRows(summaries, factions, onPick));
  const right = panel({ title: t.title }, el('p', 'bha-faint', t.help));
  const hasBroken = summaries.some((s) => s.state === 'broken');
  const rightNodes: Node[] = [right];
  if (hasBroken) rightNodes.push(notice('warn', '읽을 수 없는 슬롯은 덮어쓸 수 있다. 덮어쓰기 전의 내용은 슬롯 백업에 한 번 보관한다.'));
  lcdPage(root, { cls: 'bha-slotpage' }, lcdHead({ title: t.title, sub: t.sub }), [list], rightNodes);
}
