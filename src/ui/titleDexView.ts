// 칭호 도감 화면 (GDD 8장, 14-7): 등급·히든 등급·특별 태그 탭. 해금한 칭호는 종족별 이름·해금 시각,
// 미해금 히든은 "?" 칸(조건 비공개), 일반 등급은 이름 목록. 조건은 전부 임시라 작게 표시한다.
import { TITLES, titleName } from '../data/titles';
import type { TitleDef, TitleKind } from '../data/schema';
import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { button, h, icon, mountApp, provisionalTag, seg } from './bha/dom';
import { showToast } from './bha/nest';
import { titleRowKind, toward } from './bha/nestLogic';

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

  const top = h('header', 'bha-topbar');
  const main = h('div', 'bha-topbar__main');
  const sub = h('p', 'bha-topbar__sub');
  sub.append('해금 ', h('b', '', String(save.titles.length)), ` / ${TITLES.length}`);
  main.append(h('h1', 'bha-topbar__title', '칭호 도감'), sub);
  top.append(main);

  const tabs = seg(
    TITLE_TABS.map((t) => {
      const defs = TITLES.filter((d) => d.kind === t.kind);
      return { id: t.kind, label: t.label, count: `${defs.filter((d) => at.has(d.id)).length}/${defs.length}` };
    }),
    kind,
    (id) => titleDexView(root, faction, save, onBack, id as TitleKind),
    { stack: true },
  );
  tabs.setAttribute('aria-label', '칭호 종류');

  const list = h('div', 'bha-titlelist');
  for (const def of TITLES.filter((d) => d.kind === kind)) {
    const unlockedAt = at.get(def.id) ?? null;
    const v = titleCellView(def, faction.id, unlockedAt);
    const rk = titleRowKind(def, unlockedAt);
    const row = h('div', `bha-titlerow bha-titlerow--${rk}`);
    const ic = h('span', 'bha-titlerow__icon');
    ic.append(icon(rk === 'unlocked' ? 'i-title' : rk === 'locked' ? 'i-lock' : 'i-unknown'));
    const body = h('span', 'bha-titlerow__main');
    if (rk === 'hidden') {
      row.setAttribute('aria-label', '숨겨진 칭호');
      body.append(h('span', 'bha-titlerow__name', '???'), h('span', 'bha-titlerow__meta', '조건 비공개'));
      row.append(ic, body, h('span', 'bha-titlerow__state', '미해금'));
    } else {
      const meta = h('span', 'bha-titlerow__meta');
      meta.append(rk === 'unlocked' ? `${v.sub ?? ''}` : def.condition ? '' : '조건 미정');
      if (def.provisional) meta.append(' ', provisionalTag('임시 조건'));
      body.append(h('span', 'bha-titlerow__name', v.text), meta);
      row.append(ic, body, h('span', 'bha-titlerow__state', rk === 'unlocked' ? '해금' : '미해금'));
    }
    list.append(row);
  }

  const note = h('p', 'bha-faint', TITLE_NOTE);
  const dock = h('div', 'bha-dock');
  dock.append(button({ label: toward(faction.nestName), icon: 'i-nest', size: 'lg', block: true, onClick: onBack }));
  mountApp(root, {}, top, tabs, list, note, dock);
}

/** 아직 알리지 않은 해금을 토스트(.bha-toast)로 보여 주고 seen 처리한다. 2.5초 뒤 올라가며(is-out) animationend 에서 제거한다 */
export function showTitleToasts(save: SaveData, faction: FactionConfig, persist: () => void): void {
  const fresh = save.titles.filter((t) => !t.seen);
  if (fresh.length === 0) return;
  fresh.forEach((u, i) => {
    const def = TITLES.find((d) => d.id === u.titleId);
    if (!def) return;
    showToast({ eyebrow: '칭호 해금', title: titleName(def, faction.id), meta: def.provisional ? '임시 조건 · 칭호 도감에서 확인' : '칭호 도감에서 확인' }, i);
    u.seen = true;
  });
  persist();
}
