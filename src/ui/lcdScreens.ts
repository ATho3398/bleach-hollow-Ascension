// 방 물건이 여는 기능 화면: 돌보기·상태 / 상자(슬롯·덱) / 제단(진화). LCD 가로 2단 배치 (T-3).
// 취소(뒤로)는 기기 버튼이 맡아 화면에는 돌아가기 버튼을 두지 않는다. 탭·돌보기·덱 조작은 화면을 다시 만들지 않고 그 자리에서 고쳐 선택 위치가 유지된다.
import { BALANCE } from '../config/balance';
import { tilesFor, tileName } from '../data/tiles';
import { doNestAction } from '../engine/nest';
import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { versionLabel } from '../version';
import { traitsTab, type TraitsTabState } from './buildPanel';
import { evolutionColumns } from './evolutionPanel';
import { button, h, icon, notice, panel, seg } from './bha/dom';
import { lcdHead, lcdPage, selectLast } from './bha/lcdpage';
import type { Device } from './bha/device';
import { careButtons, deckRow, statusBlock } from './bha/nest';
import { countText, toward } from './bha/nestLogic';
import { tileHint } from './labels';

/** 돌보기 자리: 왼쪽 상태 4바(허기·컨디션·안정 수치·리스크) / 오른쪽 돌보기 3 + 쇠약 안내 */
export function careView(dev: Device, faction: FactionConfig, save: SaveData, title: string, persist: () => void): void {
  const n = save.nest;
  const RX = BALANCE.provisional.risk;
  const runs = save.runLog.runs;
  const sub = h('span');
  sub.append('사냥터 ', h('b', '', faction.huntingGroundName), ' · 원정 ', h('b', '', String(runs.length)), '회 · 귀환 ', h('b', '', String(runs.filter((r) => r.outcome === 'returned').length)), ' · 패배 ', h('b', '', String(runs.filter((r) => r.outcome === 'defeated').length)));

  const status = panel({ title: '상태' });
  status.setAttribute('aria-label', '상태');
  const weakSlot = h('div', 'bha-stack');
  const paint = () => {
    status.querySelector('.bha-nest__status')?.remove();
    status.append(statusBlock(faction, {
      hunger: n.hunger, condition: n.condition, stability: n.stability, stabilityMax: RX.stabilityMax, risk: n.risk, riskLimit: RX.limit, condWarn: 40, riskWarn: 60,
    }));
    weakSlot.replaceChildren(...(n.weakened ? [notice('danger', `지난 원정에서 패배했다. ${toward(faction.nestActions.sleep)} 회복한다.`, { title: faction.defeatStateName, icon: 'i-broken' })] : []));
  };
  const care = panel({ title: '돌보기' });
  care.append(careButtons(faction, (a) => {
    doNestAction(save.nest, a);
    persist();
    paint();
  }));
  paint();
  lcdPage(dev.view, { cls: 'bha-care-page' }, lcdHead({ title, sub }), [status], [care, weakSlot, h('p', 'bha-faint', `원정 사이에 무엇이든 몇 번이든. ${versionLabel()}`)]);
}

type ChestTab = 'slots' | 'deck';
const chestUi: { tab: ChestTab; traits: TraitsTabState } = { tab: 'slots', traits: { swapTrait: null } };

/** 상자: 슬롯(왼쪽 슬롯 칸 / 오른쪽 보유 특성) · 타일 덱(왼쪽 설명 / 오른쪽 타일 행) */
export function chestView(dev: Device, faction: FactionConfig, save: SaveData, title: string, persist: () => void): void {
  const deckSize = BALANCE.provisional.expedition.deckSize;
  const countOfDeck = () => save.tiles.deck.length;

  const tabs = seg([{ id: 'slots', label: '슬롯' }, { id: 'deck', label: '덱', count: countText(countOfDeck(), deckSize) }], chestUi.tab, (id) => {
    chestUi.tab = id as ChestTab;
    fill();
  });
  tabs.classList.add('bha-seg--sm');
  tabs.setAttribute('aria-label', '상자 종류');
  const page = lcdPage(dev.view, { cls: 'bha-chest-page', cols: '1fr 1fr' }, lcdHead({ title, aside: [tabs] }), [], []);

  function fill(): void {
    const deckCount = countOfDeck();
    const deckTab = tabs.querySelector('[data-id="deck"] .bha-seg__count');
    if (deckTab) deckTab.textContent = countText(deckCount, deckSize);
    if (chestUi.tab === 'slots') {
      const [slotsPanel, ownedPanel] = traitsTab(faction, save.build, chestUi.traits, () => {
        persist();
        fill();
      });
      page.left.replaceChildren(slotsPanel!);
      page.right.replaceChildren(ownedPanel!);
      return;
    }
    const info = panel({ title: '타일 덱', aside: h('span', deckCount === 0 ? 'bha-chip bha-chip--danger' : 'bha-chip', countText(deckCount, deckSize)) });
    info.querySelector('.bha-panel__title')?.prepend(icon('i-deck'));
    info.append(h('p', 'bha-dim', '원정 중 보상으로 이 덱에서 타일이 뽑힌다. 뽑힌 타일만 길 옆에 놓을 수 있다.'));
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
          fill();
        },
        onPlus: () => {
          save.tiles.deck.push(t.id);
          persist();
          fill();
        },
      }));
    }
    page.left.replaceChildren(info);
    page.right.replaceChildren(deckList);
  }
  fill();
}

/** 제단: 진화 (왼쪽 단계·진행·계통 / 오른쪽 후보·결과·[진화]) */
export function altarView(dev: Device, faction: FactionConfig, save: SaveData, title: string, hd: { onEvolve: () => void; onDex: () => void; onHelp: () => void }): void {
  const cols = evolutionColumns(faction, save.evolution, hd.onEvolve);
  const head = lcdHead({
    title,
    aside: [
      selectLast(button({ label: '진화체 도감', icon: 'i-dex', onClick: hd.onDex })),
      selectLast(button({ label: '진화 도움말', icon: 'i-help', iconOnly: true, onClick: hd.onHelp })),
    ],
  });
  const canEvolveNow = cols.right.some((e) => e.classList.contains('bha-btn--primary'));
  const { right } = lcdPage(dev.view, { cls: 'bha-altar-page' }, head, cols.left, cols.right);
  right.classList.toggle('is-ready', canEvolveNow);
}
