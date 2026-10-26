// 슬롯 고르기 화면 (Q-3 C.31, GDD 19-3): [새로 시작]은 빈 슬롯/덮어쓸 슬롯을, [불러오기]는 열 세이브를 고르는 곳(백업 가져오기는 그 안의 작은 버튼). 행은 button 이라 위/아래/확정과 터치 모두 된다.
import type { FactionConfig } from '../engine/faction';
import type { SlotSummary } from '../saveSlots';
import { el, notice, panel } from './bha/dom';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { lastPlayedSlot } from '../saveSlots';
import { button } from './bha/dom';
import { slotLine, slotRows } from './startView';

/** 열 수 있는 슬롯 = 세이브가 정상인 슬롯. 기본 = 가장 최근에 한 슬롯 (없으면 null). 이어하기는 이 기본 슬롯을 바로 연다, 불러오기는 이것을 강조한다 */
export function continueChoices(summaries: readonly SlotSummary[]): { openable: number[]; defaultSlot: number | null } {
  return { openable: summaries.filter((s) => s.state === 'ok' || (s.state === 'broken' && s.recoverable)).map((s) => s.slot), defaultSlot: lastPlayedSlot(summaries) };
}

/** 새로 시작의 기본 슬롯 = 번호가 가장 작은 빈 슬롯 (빈 슬롯이 없으면 null: 덮어쓸 슬롯을 직접 고른다) */
export function firstEmptySlot(summaries: readonly SlotSummary[]): number | null {
  return summaries.find((s) => s.state === 'empty')?.slot ?? null;
}

/** new = 새로 시작(빈 슬롯 우선, 덮어쓰기 확인), load = 불러오기(정상 슬롯만, 백업 가져오기는 작은 버튼), import = 백업 파일을 넣을 슬롯 */
export type SlotPickMode = 'new' | 'load' | 'import';

const TEXT: Record<SlotPickMode, { title: string; sub: string; help: string }> = {
  load: { title: '불러오기', sub: '열 세이브를 고른다', help: '슬롯을 고르고 ✓ 확인을 누르면 그 세이브를 마지막으로 보던 화면부터 연다. 비어 있거나 읽을 수 없는 슬롯은 열 수 없다.' },
  new: { title: '새로 시작', sub: '세이브를 만들 슬롯을 고른다', help: '슬롯을 고르고 ✓ 확인을 누르면 비어 있는 슬롯은 바로 종족 선택으로 간다. 기록이 있는 슬롯은 덮어쓸지 한 번 더 묻는다. 지우려면 [삭제].' },
  import: { title: '백업 가져오기', sub: '백업을 넣을 슬롯을 고른다', help: '슬롯을 고르고 ✓ 확인을 누르면 백업 파일이나 복사해 둔 글을 그 슬롯에 넣는다. 기록이 있는 슬롯이면 덮어쓰기 전에 확인하고, 덮어쓰기 전의 세이브는 한 번 보관한다.' },
};

export interface SlotPickExtra {
  /** load 모드의 [백업 파일 가져오기] 작은 버튼 */
  onImport?: () => void;
  /** [삭제] 버튼 (GDD 93장). 확인창과 실제 지우기는 호출한 쪽이 한다 */
  onDelete?: (s: SlotSummary) => void;
  /** 처음 골라 둘 슬롯 (삭제 뒤 같은 슬롯을 그대로 고른 채 다시 그릴 때) */
  selected?: number | null;
}

/** 슬롯을 누르면 고르기만 하고, 시작·불러오기는 오른쪽 [✓ 확인] 으로만 한다 (GDD 93장). 기기 ✓ 도 고른 버튼을 누르는 것이라 같은 길이다 */
export function slotPickView(root: HTMLElement, mode: SlotPickMode, summaries: readonly SlotSummary[], factions: readonly FactionConfig[], onPick: (s: SlotSummary) => void, extra: SlotPickExtra = {}): void {
  const t = TEXT[mode];
  const { openable, defaultSlot } = continueChoices(summaries);
  const isLoad = mode === 'load';
  const canPick = (s: SlotSummary): boolean => (isLoad ? openable.includes(s.slot) : true);
  const start = extra.selected !== undefined ? extra.selected : isLoad ? defaultSlot : mode === 'new' ? firstEmptySlot(summaries) : null;
  let selected: number | null = start !== null && summaries.some((s) => s.slot === start) ? start : null;

  const info = el('div', 'bha-slotpage__sel');
  const actions = el('div', 'bha-slotpage__actions');
  const right = panel({ title: t.title }, el('p', 'bha-faint', t.help), info, actions);
  const rows = slotRows(summaries, factions, (s) => {
    selected = s.slot;
    sync();
  }, selected);
  const list = panel({ title: '세이브 슬롯' }, rows);

  function sync(): void {
    for (const r of rows.querySelectorAll<HTMLElement>('.bha-slot')) r.classList.toggle('is-last', r.dataset.slot === String(selected));
    const sum = summaries.find((s) => s.slot === selected) ?? null;
    info.replaceChildren();
    actions.replaceChildren();
    if (sum) {
      const line = slotLine(sum, factions);
      info.append(el('strong', 'bha-slotpage__sel-main', `슬롯 ${sum.slot} · ${line.main}`));
      if (line.sub) info.append(el('span', 'bha-faint', line.sub));
    } else info.append(el('span', 'bha-faint', '슬롯을 먼저 고른다'));
    const ok = button({ label: '확인', icon: 'i-check', variant: 'primary', disabled: !sum || !canPick(sum), onClick: () => sum && onPick(sum) });
    ok.dataset.sc = 'slots.ok';
    actions.append(ok);
    if (extra.onDelete) {
      const del = button({ label: '삭제', icon: 'i-close', variant: 'danger', disabled: !sum || sum.state === 'empty', onClick: () => sum && extra.onDelete?.(sum) });
      del.dataset.sc = 'slots.delete';
      actions.append(del);
    }
    if (isLoad && extra.onImport) {
      const imp = button({ label: '백업 파일 가져오기', icon: 'i-deck', size: 'small', variant: 'ghost', onClick: extra.onImport });
      imp.dataset.sc = 'slots.import';
      actions.append(imp);
    }
  }
  sync();
  const hasBroken = summaries.some((s) => s.state === 'broken');
  const rightNodes: Node[] = [right];
  if (hasBroken && !isLoad) rightNodes.push(notice('warn', '읽을 수 없는 슬롯은 덮어쓸 수 있다. 덮어쓰기 전의 내용은 슬롯 백업에 한 번 보관한다.'));
  lcdPage(root, { cls: 'bha-slotpage' }, lcdHead({ title: t.title, sub: t.sub }), [list], rightNodes);
}
