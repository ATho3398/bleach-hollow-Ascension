// 방 물건이 여는 기능 화면 (T-1): 돌보기·상태 / 상자(슬롯·덱) / 제단(진화). 옛 둥지 화면의 내용을 LCD 창 안에 임시로 옮긴 것이다.
// 가로 비율 재구성은 T-3. 취소(뒤로)는 기기 버튼이 맡아 화면에는 돌아가기 버튼을 두지 않는다.
import { BALANCE } from '../config/balance';
import { tilesFor, tileName } from '../data/tiles';
import { doNestAction } from '../engine/nest';
import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { versionLabel } from '../version';
import { traitsTab, type TraitsTabState } from './buildPanel';
import { evolutionPanel } from './evolutionPanel';
import { h, icon, mountApp, notice, panel, seg } from './bha/dom';
import type { Device } from './bha/device';
import { careButtons, deckRow, statusBlock } from './bha/nest';
import { countText, toward } from './bha/nestLogic';
import { tileHint } from './labels';

function topbar(title: string, sub?: string): HTMLElement {
  const top = h('header', 'bha-topbar');
  const main = h('div', 'bha-topbar__main');
  main.append(h('h1', 'bha-topbar__title', title));
  if (sub) main.append(h('p', 'bha-topbar__sub', sub));
  top.append(main);
  return top;
}

/** 돌보기 자리: 상태 4바(허기·컨디션·안정 수치·리스크) + 돌보기 3 + 기록 */
export function careView(dev: Device, faction: FactionConfig, save: SaveData, title: string, persist: () => void): void {
  const n = save.nest;
  const RX = BALANCE.provisional.risk;
  const runs = save.runLog.runs;
  const sub = h('span');
  sub.append('사냥터 ', h('b', '', faction.huntingGroundName), ' · 원정 ', h('b', '', String(runs.length)), '회 · 귀환 ', h('b', '', String(runs.filter((r) => r.outcome === 'returned').length)), ' · 패배 ', h('b', '', String(runs.filter((r) => r.outcome === 'defeated').length)));
  const top = topbar(title);
  const subLine = h('p', 'bha-topbar__sub');
  subLine.append(sub);
  top.querySelector('.bha-topbar__main')?.append(subLine);
  const status = panel({});
  status.setAttribute('aria-label', '상태');
  status.append(statusBlock(faction, {
    hunger: n.hunger, condition: n.condition, stability: n.stability, stabilityMax: RX.stabilityMax, risk: n.risk, riskLimit: RX.limit, condWarn: 40, riskWarn: 60,
  }));
  const weak = n.weakened ? notice('danger', `지난 원정에서 패배했다. ${toward(faction.nestActions.sleep)} 회복한다.`, { title: faction.defeatStateName, icon: 'i-broken' }) : null;
  const care = panel({ title: '돌보기', aside: '원정 사이에 무엇이든 몇 번이든' });
  care.append(careButtons(faction, (a) => {
    doNestAction(save.nest, a);
    persist();
    careView(dev, faction, save, title, persist);
  }));
  mountApp(dev.view, { cls: 'bha-lcdscreen' }, top, status, ...(weak ? [weak] : []), care, h('p', 'bha-nest__foot', versionLabel()));
}

type ChestTab = 'slots' | 'deck';
const chestUi: { tab: ChestTab; traits: TraitsTabState } = { tab: 'slots', traits: { swapTrait: null } };

/** 상자: 슬롯·보유 특성 / 타일 덱 (옛 특성·덱 탭) */
export function chestView(dev: Device, faction: FactionConfig, save: SaveData, title: string, persist: () => void): void {
  const rerender = () => chestView(dev, faction, save, title, persist);
  const deckSize = BALANCE.provisional.expedition.deckSize;
  const deckCount = save.tiles.deck.length;

  const slots = h('div', 'bha-stack');
  slots.append(...traitsTab(faction, save.build, chestUi.traits, () => {
    persist();
    rerender();
  }));
  const deckPanel = panel({ title: '타일 덱', aside: h('span', deckCount === 0 ? 'bha-chip bha-chip--danger' : 'bha-chip', countText(deckCount, deckSize)) });
  deckPanel.querySelector('.bha-panel__title')?.prepend(icon('i-deck'));
  deckPanel.append(h('p', 'bha-dim', '원정 중 보상으로 이 덱에서 타일이 뽑힌다. 뽑힌 타일만 길 옆에 놓을 수 있다.'));
  const deckList = h('div', 'bha-stack');
  const count = (id: string) => save.tiles.deck.filter((x) => x === id).length;
  for (const t of tilesFor(faction.id)) {
    const owned = save.tiles.collection[t.id] ?? 0;
    deckList.append(deckRow({
      name: tileName(t.id, faction.id), hint: tileHint(t), owned, count: count(t.id), tile: t, provisional: true,
      canAdd: count(t.id) < owned && deckCount < deckSize,
      onMinus: () => {
        save.tiles.deck.splice(save.tiles.deck.indexOf(t.id), 1);
        persist();
        rerender();
      },
      onPlus: () => {
        save.tiles.deck.push(t.id);
        persist();
        rerender();
      },
    }));
  }
  deckPanel.append(deckList);
  slots.hidden = chestUi.tab !== 'slots';
  deckPanel.hidden = chestUi.tab !== 'deck';
  const tabs = seg([{ id: 'slots', label: '슬롯' }, { id: 'deck', label: '덱', count: countText(deckCount, deckSize) }], chestUi.tab, (id) => {
    chestUi.tab = id as ChestTab;
    slots.hidden = id !== 'slots';
    deckPanel.hidden = id !== 'deck';
  });
  mountApp(dev.view, { cls: 'bha-lcdscreen' }, topbar(title), tabs, slots, deckPanel);
}

/** 제단: 진화 패널 (옛 돌보기 탭의 진화 부분) */
export function altarView(dev: Device, faction: FactionConfig, save: SaveData, title: string, hd: { onEvolve: () => void; onDex: () => void; onHelp: () => void }): void {
  mountApp(dev.view, { cls: 'bha-lcdscreen' }, topbar(title), evolutionPanel(faction, save.evolution, hd.onEvolve, hd.onDex, hd.onHelp));
}
