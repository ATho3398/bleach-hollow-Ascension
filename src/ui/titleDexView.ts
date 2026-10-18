// 칭호 도감 화면 (GDD 8장, 14-7): 등급·히든 등급·특별 태그 탭. 해금한 칭호는 종족별 이름·해금 시각,
// 미해금 히든은 "?" 칸(조건 비공개), 일반 등급은 이름 목록. 조건은 전부 임시라 작게 표시한다.
import { TITLES, titleName } from '../data/titles';
import type { TitleDef, TitleKind } from '../data/schema';
import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { el, mountScreen } from './dom';

export const TITLE_TABS: { kind: TitleKind; label: string }[] = [
  { kind: 'rank', label: '등급' },
  { kind: 'hidden-rank', label: '히든 등급' },
  { kind: 'tag', label: '특별 태그' },
];

export const TITLE_NOTE = '칭호 조건은 모두 임시이거나 아직 없다(기획서 11-7 미정). "임시" 표시가 붙은 칭호만 해금될 수 있다.';

export function formatUnlockTime(ms: number): string {
  const d = new Date(ms + 9 * 3600_000); // KST 표기
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** 칸 하나의 표시 내용. 미해금 히든은 이름도 조건도 노출하지 않는다 */
export function titleCellView(def: TitleDef, factionId: string, unlockedAt: number | null): { locked: boolean; text: string; sub: string | null } {
  if (unlockedAt !== null) return { locked: false, text: titleName(def, factionId), sub: `해금 ${formatUnlockTime(unlockedAt)}` };
  if (def.hidden) return { locked: true, text: '?', sub: null };
  return { locked: false, text: titleName(def, factionId), sub: '미해금' };
}

export function titleDexView(root: HTMLElement, faction: FactionConfig, save: SaveData, onBack: () => void, kind: TitleKind = 'rank'): void {
  const at = new Map(save.titles.map((t) => [t.titleId, t.at]));
  const tabs = el('div', 'dex-tabs title-tabs');
  for (const t of TITLE_TABS) {
    const defs = TITLES.filter((d) => d.kind === t.kind);
    const got = defs.filter((d) => at.has(d.id)).length;
    const b = el('button', `small${t.kind === kind ? ' on' : ''}`, `${t.label} ${got}/${defs.length}`);
    b.onclick = () => titleDexView(root, faction, save, onBack, t.kind);
    tabs.append(b);
  }
  const list = el('div', 'dex-list');
  for (const def of TITLES.filter((d) => d.kind === kind)) {
    const v = titleCellView(def, faction.id, at.get(def.id) ?? null);
    const cell = el('div', `dex-cell${v.locked ? ' locked' : ''}`);
    if (v.locked) cell.textContent = v.text;
    else {
      cell.append(el('b', '', v.text));
      if (v.sub) cell.append(el('small', 'dim', v.sub));
      if (def.provisional && at.has(def.id)) cell.append(el('small', 'provisional-tag', '임시 조건'));
    }
    list.append(cell);
  }
  const back = el('button', '', `${faction.nestName}으로`);
  back.onclick = onBack;
  mountScreen(root, el('h1', '', '칭호 도감'), tabs, list, el('small', 'dim', TITLE_NOTE), back);
}

/** 아직 알리지 않은 해금을 텍스트 토스트로 보여 주고 seen 처리한다 */
export function showTitleToasts(save: SaveData, faction: FactionConfig, persist: () => void): void {
  const fresh = save.titles.filter((t) => !t.seen);
  if (fresh.length === 0) return;
  fresh.forEach((u, i) => {
    const def = TITLES.find((d) => d.id === u.titleId);
    if (!def) return;
    const toast = el('div', 'toast', `칭호 해금: ${titleName(def, faction.id)} (임시 조건)`);
    toast.style.top = `${12 + i * 44}px`;
    document.body.append(toast);
    setTimeout(() => toast.remove(), 4000);
    u.seen = true;
  });
  persist();
}
