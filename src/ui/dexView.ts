// 진화체 도감 화면 (GDD 4-2 v1.0): 단계별 탭. 해금된 진화체는 이름·요구 계통 힌트·효과, 미해금은 "?" 칸. 이름은 자리 표시(임시)
import { formsOfTier, formHint, formName } from '../data/evolution';
import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { el, mountScreen } from './dom';
import { EVOLUTION_NOTE, formEffectLines } from './evolutionPanel';

export function dexView(root: HTMLElement, faction: FactionConfig, save: SaveData, onBack: () => void, tier = 2): void {
  const unlocked = new Set(save.formDex);
  const tabs = el('div', 'dex-tabs');
  for (let t = 2; t <= 5; t++) {
    const forms = formsOfTier(t);
    const got = forms.filter((f) => unlocked.has(f.id)).length;
    const b = el('button', `small${t === tier ? ' on' : ''}`, `${faction.tierNames[t - 1]} ${got}/${forms.length}`);
    b.onclick = () => dexView(root, faction, save, onBack, t);
    tabs.append(b);
  }
  const list = el('div', 'dex-list');
  // 기본형은 목록 맨 뒤
  for (const f of [...formsOfTier(tier)].sort((a, b) => Number(!!a.fallback) - Number(!!b.fallback))) {
    if (!unlocked.has(f.id)) {
      list.append(el('div', 'dex-cell locked', '?'));
      continue;
    }
    const cell = el('div', 'dex-cell');
    cell.append(el('b', '', formName(f, faction.id)), el('div', 'dim', formHint(f, faction.id)), ...formEffectLines(faction, f).slice(1, 3).map((t) => el('small', 'dim', t)));
    list.append(cell);
  }
  const back = el('button', '', `${faction.nestName}으로`);
  back.onclick = onBack;
  mountScreen(root, el('h1', '', '진화체 도감'), tabs, el('p', 'dim', `${tier}단계 · ${faction.tierNames[tier - 1]}: 진화한 적 있는 진화체만 보인다.`), list, el('small', 'dim', EVOLUTION_NOTE), back);
}
