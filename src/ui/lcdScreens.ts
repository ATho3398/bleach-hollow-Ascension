// 방 물건이 여는 기능 화면: 돌보기·상태 / 상자(슬롯·덱) / 제단(진화). LCD 가로 2단 배치 (T-3).
// 취소(뒤로)는 기기 버튼이 맡아 화면에는 돌아가기 버튼을 두지 않는다. 탭·돌보기·덱 조작은 화면을 다시 만들지 않고 그 자리에서 고쳐 선택 위치가 유지된다.
import { BALANCE } from '../config/balance';
import { tilesFor, tileName } from '../data/tiles';
import { equipSkin, type SaveData } from '../game';
import { skinsFor, skinLabel } from '../data/skins';
import { charArt } from '../data/art/manifest';
import { versionLabel } from '../version';
import { traitsTab, type TraitsTabState } from './buildPanel';
import { evolutionColumns } from './evolutionPanel';
import { button, h, icon, notice, panel, provisionalTag, seg } from './bha/dom';
import { FOOD_IDS, type FactionConfig } from '../engine/faction';
import { JADE_NAME, SOUL_CRYSTAL_NAME, TRADE_CURRENCY_NAME } from '../data/economy';
import { lcdHead, lcdPage, selectLast } from './bha/lcdpage';
import type { Device } from './bha/device';
import { deckRow, statsBlock, statusBlock } from './bha/nest';
import { abilityName } from '../data/evolution';
import { currentStats, playerElementsOf, refStatOf, zeroStats } from '../engine/evolution';
import { canRebirth } from '../engine/rebirth';
import { carryLine, rebirthMark } from './rebirthView';
import { elementsMark } from './bha/element';
import { countText, toward } from './bha/nestLogic';
import { tileHint } from './labels';

/** 상태 자리: 왼쪽 상태 4바(허기·컨디션·안정 수치·리스크) / 오른쪽 능력치 6줄·속성·고유 특성(GDD 20-3) + 쇠약 안내. 돌보기(먹이·재우기·쓰다듬기)는 홈 하단 독으로 옮겼다 (GDD 18-2) */
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
  paint();
  const evo = save.evolution;
  const stats = panel({ title: '능력치', aside: elementsMark(playerElementsOf(evo), faction.id) });
  stats.setAttribute('aria-label', '능력치');
  stats.append(statsBlock(faction.id, currentStats(evo, faction.id), evo.ev, refStatOf(evo.tierIndex), evo.carry));
  const mark = rebirthMark(save.rebirth.count);
  if (mark) {
    const line = h('p', 'bha-faint');
    line.append(mark, ` ${faction.rebirth.name} ${save.rebirth.count}회 · 계승 노력치 ${carryLine(faction.id, evo.carry ?? zeroStats())}`);
    stats.append(line);
  }
  if (evo.ability) stats.append(h('p', 'bha-faint', `고유 특성: ${abilityName(evo.ability, faction.id)}`));
  lcdPage(dev.view, { cls: 'bha-care-page' }, lcdHead({ title, sub }), [status, holdingsPanel(faction, save), skinPanel(faction, save, persist)], [stats, weakSlot, h('p', 'bha-faint', `괄호는 노력치(+${faction.rebirth.name} 계승). 돌보기는 홈 아래 독에서 한다. ${versionLabel()}`)]);
}

/** 스킨 고르기 (GDD 25-1·26-5, C.55): [기본(진화체)]와 이 종족이 입을 수 있는 스킨. 상점 전까지는 있는 스킨이 전부 열려 있다(provisional). 고르면 바로 입고 저장하며 목록은 그 자리에서 표시만 바뀐다.
 *  종족이 다른 스킨은 목록에 안 보인다(데이터의 종족 필드). 입을 수 있는 스킨이 없는 종족은 그 안내만 */
function skinPanel(faction: FactionConfig, save: SaveData, persist: () => void): HTMLElement {
  const skins = skinsFor(faction.id);
  const p = panel(skins.length > 0 ? { title: '스킨', aside: provisionalTag('임시: 전부 열림') } : { title: '스킨' });
  p.setAttribute('aria-label', '스킨');
  p.dataset.skins = String(skins.length);
  if (skins.length === 0) {
    p.append(h('p', 'bha-faint', '이 종족이 입을 수 있는 스킨은 아직 없다.'));
    return p;
  }
  const list = h('div', 'bha-stack bha-stack--tight');
  const rows: { id: string | null; btn: HTMLButtonElement }[] = [];
  const mark = () => {
    for (const r of rows) {
      const on = (save.skin ?? null) === r.id;
      r.btn.classList.toggle('is-on', on);
      r.btn.setAttribute('aria-pressed', String(on));
    }
  };
  const add = (id: string | null, label: string, thumb: string | null) => {
    const btn = button({ label, block: true, onClick: () => {
      if (!equipSkin(save, id)) return;
      persist();
      mark();
    } });
    if (thumb) {
      const img = h('img', 'bha-skinthumb') as HTMLImageElement;
      img.src = thumb;
      img.alt = '';
      img.draggable = false;
      btn.prepend(img);
    }
    btn.dataset.skin = id ?? '';
    rows.push({ id, btn });
    list.append(btn);
  };
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  add(null, '기본(진화체)', charArt(faction.id, save.evolution.tierIndex, '', base).src);
  for (const sk of skins) add(sk.id, skinLabel(sk), charArt(faction.id, save.evolution.tierIndex, '', base, undefined, undefined, sk.id).src);
  mark();
  p.append(list, h('p', 'bha-faint', '입으면 단계와 상관없이 방·원정·전투 모두 스킨 그림으로 바뀐다. 스킨에 없는 동작은 기본 움직임을 쓴다.'));
  return p;
}

/** 가진 것 (GDD 23-1·22-3·23-4·25-1): 먹이 종류별 개수, 영혼 결정, 골드(쓰는 곳 준비 중), 영옥(꾸밈 재화, 쓰는 곳 준비 중) */
function holdingsPanel(faction: FactionConfig, save: SaveData): HTMLElement {
  const p = panel({ title: '가진 것' });
  p.setAttribute('aria-label', '가진 것');
  const food = h('p', 'bha-small');
  food.append('먹이: ', FOOD_IDS.map((id) => `${faction.foodNames[id]} ${save.shared.food[id]}`).join(' · '));
  const crystals = h('p', 'bha-small');
  crystals.append(`${SOUL_CRYSTAL_NAME} `, h('b', 'bha-num', String(save.shared.soulCrystals)));
  const coins = h('p', 'bha-small');
  coins.dataset.currency = 'trade';
  coins.append(`${TRADE_CURRENCY_NAME} `, h('b', 'bha-num', String(save.shared.tradeCoins)), ' ', provisionalTag('쓰는 곳 준비 중'));
  const jade = h('p', 'bha-small');
  jade.dataset.currency = 'jade';
  jade.append(`${JADE_NAME} `, h('b', 'bha-num', String(save.shared.jade)), ' ', provisionalTag('꾸밈 · 쓰는 곳 준비 중'));
  p.append(food, crystals, coins, jade);
  return p;
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

/** 제단: 진화 (왼쪽 지금 진화체·속성·고유 특성 / 오른쪽 진화 안내 — 타이밍은 비밀, 귀환하면 저절로 진화, GDD 20-5).
 *  5단계 이상이면 오른쪽 아래 [환생] (GDD 22-7, 이름은 종족 설정 rebirth.name). 그 아래 단계에서는 버튼이 없다 */
export function altarView(dev: Device, faction: FactionConfig, save: SaveData, title: string, hd: { onDex: () => void; onHelp: () => void; onRebirth: () => void }): void {
  const cols = evolutionColumns(faction, save.evolution);
  const mark = rebirthMark(save.rebirth.count);
  if (mark) cols.left[0]?.querySelector('.bha-evo__formname')?.append(' ', mark);
  if (canRebirth(save.evolution)) {
    const b = button({ label: faction.rebirth.name, icon: 'i-evolve', variant: 'danger', block: true, onClick: hd.onRebirth });
    b.dataset.sc = 'rebirth';
    cols.right.push(h('p', 'bha-faint', `${faction.rebirth.name}하면 1단계로 돌아가 다시 키운다. 도감·칭호와 노력치 일부, 특성 1개는 남는다.`), b);
  }
  const head = lcdHead({
    title,
    aside: [
      selectLast(button({ label: '진화체 도감', icon: 'i-dex', onClick: hd.onDex })),
      selectLast(button({ label: '진화 도움말', icon: 'i-help', iconOnly: true, onClick: hd.onHelp })),
    ],
  });
  lcdPage(dev.view, { cls: 'bha-altar-page' }, head, cols.left, cols.right);
}
