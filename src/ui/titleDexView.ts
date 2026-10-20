// 칭호 도감 화면 (GDD 8장, 14-7, T-3 가로 배치): 머리에 등급·히든 등급·특별 태그 탭, 왼쪽 칭호 목록, 오른쪽 고른 칭호의 상세. 해금한 칭호는 종족별 이름·해금 시각,
// 미해금 히든은 "?" 칸(조건 비공개), 일반 등급은 이름 목록. 조건은 전부 임시라 작게 표시한다.
import { TITLES, titleName } from '../data/titles';
import type { TitleDef, TitleKind } from '../data/schema';
import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { h, icon, provisionalTag, seg } from './bha/dom';
import { lcdHead, lcdPage, masterDetail, selectLast, type ListRow } from './bha/lcdpage';
import { showToast } from './bha/nest';
import { getOverlayHost } from './bha/overlayHost';
import { titleRowKind } from './bha/nestLogic';

export const TITLE_TABS: { kind: TitleKind; label: string }[] = [
  { kind: 'rank', label: '등급' },
  { kind: 'hidden-rank', label: '히든 등급' },
  { kind: 'tag', label: '특별 태그' },
  { kind: 'story', label: '스토리' },
  { kind: 'tower', label: '탑' },
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

function titleRow(def: TitleDef, factionId: string, unlockedAt: number | null): ListRow {
  const v = titleCellView(def, factionId, unlockedAt);
  const rk = titleRowKind(def, unlockedAt);
  const ic = icon(rk === 'unlocked' ? 'i-title' : rk === 'locked' ? 'i-lock' : 'i-unknown');
  const name = rk === 'hidden' ? '???' : v.text;
  const state = rk === 'unlocked' ? '해금' : '미해금';
  return {
    label: rk === 'hidden' ? '숨겨진 칭호' : name,
    cls: `bha-mdrow--${rk}`,
    content: [ic, h('span', 'bha-mdrow__name', name), h('small', 'bha-mdrow__state', state)],
    detail: () => {
      const head = h('div', 'bha-mddetail__head');
      head.append(h('h2', 'bha-mddetail__title', name), h('span', rk === 'unlocked' ? 'bha-chip bha-chip--good' : 'bha-chip', state));
      const body = h('p', 'bha-mddetail__body');
      if (rk === 'hidden') body.append('조건 비공개');
      else {
        body.append(rk === 'unlocked' ? (v.sub ?? '') : def.condition ? '조건은 임시다' : '조건 미정');
        if (def.provisional) body.append(' ', provisionalTag('임시 조건'));
      }
      return [head, body, h('p', 'bha-faint', TITLE_NOTE)];
    },
  };
}

export function titleDexView(root: HTMLElement, faction: FactionConfig, save: SaveData, kind: TitleKind = 'rank', lead?: HTMLElement): void {
  const at = new Map(save.titles.map((t) => [t.titleId, t.at]));
  const rowsOf = (k: TitleKind) => TITLES.filter((d) => d.kind === k).map((d) => titleRow(d, faction.id, at.get(d.id) ?? null));
  const md = masterDetail(rowsOf(kind), 0, '칭호');
  const tabs = seg(
    TITLE_TABS.map((t) => {
      const defs = TITLES.filter((d) => d.kind === t.kind);
      return { id: t.kind, label: t.label, count: `${defs.filter((d) => at.has(d.id)).length}/${defs.length}` };
    }),
    kind,
    (id) => md.setRows(rowsOf(id as TitleKind)),
    { stack: true },
  );
  tabs.setAttribute('aria-label', '칭호 종류');
  const sub = h('span');
  sub.append('해금 ', h('b', '', String(save.titles.length)), ` / ${TITLES.length}`);
  lcdPage(root, { cls: 'bha-titles-page', cols: 'minmax(0, 0.9fr) minmax(0, 1.1fr)' }, lcdHead({ title: '칭호 도감', sub, aside: [...(lead ? [lead] : []), selectLast(tabs)] }), [md.list], [md.detail]);
}

/** 아직 알리지 않은 해금을 토스트(.bha-toast)로 보여 주고 seen 처리한다. 2.5초 뒤 올라가며(is-out) animationend 에서 제거한다 */
export function showTitleToasts(save: SaveData, faction: FactionConfig, persist: () => void): void {
  const fresh = save.titles.filter((t) => !t.seen);
  if (fresh.length === 0) return;
  const base = getOverlayHost().querySelectorAll('.bha-toast').length; // 튜토리얼 달성 토스트가 떠 있으면 그 아래로 (C.52)
  fresh.forEach((u, i) => {
    const def = TITLES.find((d) => d.id === u.titleId);
    if (!def) return;
    showToast({ eyebrow: '칭호 해금', title: titleName(def, faction.id), meta: def.provisional ? '임시 조건 · 책장 > 칭호 도감에서 확인' : '책장 > 칭호 도감에서 확인' }, base + i);
    u.seen = true;
  });
  persist();
}
