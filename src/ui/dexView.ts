// 진화체 도감 화면 (GDD 4-2 v1.0, U-3 새 디자인): 단계 탭(발견 수) · 카드 그리드. 해금된 진화체는 이름·요구 계통 마크·효과, 미해금은 "?" 잠금 칸.
// 기본형은 목록 맨 뒤, 지금 진화체는 "지금" 표시. 이름은 자리 표시(임시).
import { FORM_TABLE, formHint, formName, formsOfTier } from '../data/evolution';
import type { FormDef } from '../data/schema';
import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { button, h, icon, mountApp, provisionalTag, seg } from './bha/dom';
import { lineageKey } from './bha/lineage';
import { formCardModel, sortFormsForDex, toward } from './bha/nestLogic';
import { evolutionNote, formEffectLines } from './evolutionPanel';

function formCard(faction: FactionConfig, f: FormDef, unlocked: ReadonlySet<string>, currentFormId: string | null): HTMLElement {
  const m = formCardModel(f, unlocked, currentFormId);
  if (m.state === 'unknown') {
    const c = h('article', 'bha-formcard bha-formcard--unknown');
    c.setAttribute('aria-label', '미발견');
    c.append(icon('i-unknown'), h('small', '', '미발견'));
    return c;
  }
  const key = m.lineage ? lineageKey(m.lineage) : undefined;
  const c = h('article', ['bha-formcard', m.base ? 'bha-formcard--base' : '', m.current ? 'is-current' : '', key ? `bha-lin--${key}` : ''].filter(Boolean).join(' '));
  const marks = h('span', 'bha-formcard__marks');
  if (f.label.lineages.length === 0) marks.append(h('span', 'bha-faint', '조건 없음'));
  for (const l of f.label.lineages) {
    const k = lineageKey(l);
    if (!k) continue;
    const mk = h('span');
    mk.style.color = `var(--bha-lin-${k})`;
    mk.append(icon(`i-lin-${k}`));
    marks.append(mk);
  }
  const effect = h('p', 'bha-formcard__effect');
  const lines = formEffectLines(faction, f);
  effect.append(formHint(f, faction.id), h('br'), lines[1]!, h('br'), lines[2]!);
  const foot = h('span', 'bha-formcard__foot');
  if (f.provisional) foot.append(provisionalTag());
  c.append(marks, h('h3', 'bha-formcard__name', formName(f, faction.id)), effect, foot);
  return c;
}

export function dexView(root: HTMLElement, faction: FactionConfig, save: SaveData, onBack: () => void, tier = 2): void {
  const unlocked = new Set(save.formDex);
  const found = FORM_TABLE.filter((f) => unlocked.has(f.id)).length;

  const top = h('header', 'bha-topbar');
  const main = h('div', 'bha-topbar__main');
  const sub = h('p', 'bha-topbar__sub');
  sub.append('발견 ', h('b', '', String(found)), ` / ${FORM_TABLE.length} · 진화한 적 있는 진화체만 보인다`);
  main.append(h('h1', 'bha-topbar__title', '진화체 도감'), sub);
  top.append(main);

  const tiers = [2, 3, 4, 5];
  const tabs = seg(
    tiers.map((t) => {
      const forms = formsOfTier(t);
      return { id: String(t), label: faction.tierNames[t - 1]!, count: `${forms.filter((f) => unlocked.has(f.id)).length}/${forms.length}` };
    }),
    String(tier),
    (id) => dexView(root, faction, save, onBack, Number(id)),
    { stack: true },
  );
  tabs.setAttribute('aria-label', '단계');

  const forms = formsOfTier(tier);
  const gotInTier = forms.filter((f) => unlocked.has(f.id)).length;
  const desc = h('p', 'bha-dim', `${tier}단계 · ${faction.tierNames[tier - 1]} — ${forms.length}종 중 ${gotInTier}종 발견`);
  const grid = h('div', 'bha-formgrid');
  for (const f of sortFormsForDex(forms)) grid.append(formCard(faction, f, unlocked, save.evolution.formId));

  const dock = h('div', 'bha-dock');
  dock.append(button({ label: toward(faction.nestName), icon: 'i-nest', size: 'lg', block: true, onClick: onBack }));
  mountApp(root, {}, top, tabs, desc, grid, evolutionNote(), dock);
}
