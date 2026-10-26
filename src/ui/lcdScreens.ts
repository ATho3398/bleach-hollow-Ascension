// 방 물건이 여는 기능 화면: 돌보기·상태 / 상자(슬롯·덱) / 제단(진화). LCD 가로 2단 배치 (T-3).
// 취소(뒤로)는 기기 버튼이 맡아 화면에는 돌아가기 버튼을 두지 않는다. 탭·돌보기·덱 조작은 화면을 다시 만들지 않고 그 자리에서 고쳐 선택 위치가 유지된다.
import { critChanceBonus } from '../engine/absorb/build';
import { roomOf } from '../engine/faction';
import { BALANCE } from '../config/balance';
import { baseTilesFor, getTile, synergyName, tileName, upgradeIdOf } from '../data/tiles';
import { canSynthesize, equipSkin, statBonusOf, synthesizeTile, type SaveData } from '../game';
import { applyTilePreset, cellsOfPlan, deleteTilePreset, ownedTileList, placementLimitOf, renameTilePreset, saveTilePreset, tilePresetsFor } from '../tilePresets';
import { beginPlanning, createExpedition } from '../engine/expedition';
import { roadPlanner } from './bha/road';
import { presetPanel } from './bha/tilePresets';
import { choosePet, equipInventoryItem, inventoryOf, petAffinityText, unequipInventoryItem, useInventoryItem, type InventoryEntry } from '../inventory';
import { petArtSrc, petIconId } from './bha/pet';
import { fixParticles } from '../engine/josa';
import { categoryName, cosmeticToken, getCosmetic, ITEM_CATEGORIES, ITEM_CATEGORY_NAMES, keyringShapeOf, type CosmeticCategory, type ItemCategory } from '../data/shop';
import { categoryTabs, iconArt, imageArt, itemCard, itemDialog, itemGrid, swatchArt } from './bha/itemUi';
import { tileCss, tileIconId } from './bha/expedition';
import { skinItemId } from '../data/shop';
import { TILES_LOCKED_TEXT } from '../shop';
import { bonusLine } from './hogyokuView';
import { skinsFor, skinLabel } from '../data/skins';
import { charArt } from '../data/art/manifest';
import { versionLabel } from '../version';
import { traitsTab, type TraitsTabState } from './buildPanel';
import { abilityParagraph, evolutionAbilityLines, evolutionColumns } from './evolutionPanel';
import { button, h, icon, notice, panel, provisionalTag, seg } from './bha/dom';
import { FOOD_IDS, type FactionConfig } from '../engine/faction';
import { JADE_NAME, SOUL_CRYSTAL_NAME, TRADE_CURRENCY_NAME } from '../data/economy';
import { lcdHead, lcdPage, selectLast } from './bha/lcdpage';
import type { Device } from './bha/device';
import { viewTitle } from './bha/viewtitle';
import { riskText } from '../data/help/riskText';
import { showToast, statRow, statsBlock, statusBlock, tileKindOf } from './bha/nest';
import { abilityEffectsOf, currentStats, elementDamageOf, formAbilitiesOf, playerElementsOf, refStatOf, zeroStats, type AbilityLine, type EvolutionState } from '../engine/evolution';
import { tryGetForm } from '../data/evolution';
import { STAT_IDS } from '../data/schema';
import { statName } from '../data/elements';
import { canRebirth } from '../engine/rebirth';
import { carryLine, rebirthMark } from './rebirthView';
import { elementDamageRows, elementsMark } from './bha/element';
import { ELEMENT_DAMAGE_IDS } from '../engine/combat';
import { countText, toward } from './bha/nestLogic';
import { tileHint, variantModsText } from './labels';
import { logoMark } from './bha/logo';
import type { VariantMods } from '../engine/expedition';

/** 치명타 확률 표시 "5%" (C.63): 기본 + 장착 특성, 상한 critChanceMax (치명 특성이 있는 몸은 상한 + 그 특성 값, GDD 45장 1번 — 전투와 같은 규칙) */
export function critPercentText(build: SaveData['build'], evo?: SaveData['evolution']): string {
  const CX = BALANCE.provisional.combat;
  // 진화체 속성 특성 '날카로운 물결'(GDD 39장)의 치명타 확률도 더한다
  const form = evo?.formId ? tryGetForm(evo.formId) : undefined;
  const fromForm = evo ? abilityEffectsOf(formAbilitiesOf(form ?? null, evo.ev, evo.ability)).critChance : 0;
  return `${Math.round(Math.min(CX.critChanceMax + fromForm, CX.critChance + critChanceBonus(build) + fromForm) * 100)}%`;
}

/** 상태 자리: 왼쪽 상태 4바(배부름·컨디션·안정 수치·리스크) / 오른쪽 능력치 6줄·속성·고유 특성(GDD 20-3) + 쇠약 안내. 돌보기(먹이·재우기·쓰다듬기)는 홈 하단 독으로 옮겼다 (GDD 18-2) */
export interface CareHandlers {
  /** 진화 정보 패널(C.137, GDD 85장 7): 진화체 도감·진화 도움말·환생 */
  onDex: () => void;
  onHelp: () => void;
  onRebirth: () => void;
}

export function careView(dev: Device, faction: FactionConfig, save: SaveData, title: string, persist: () => void, hd: CareHandlers): void {
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
  // 광기·자아 설명 (C.141, GDD 84장 9번): 수치마다 어떤 손해가 있는지를 balance 값에서 읽은 숫자로 적는다
  const rt = riskText(faction);
  const explain = panel({ title: `${faction.riskGaugeName}·${faction.stabilityName}` });
  explain.setAttribute('aria-label', `${faction.riskGaugeName}·${faction.stabilityName} 설명`);
  explain.dataset.riskExplain = '';
  const block = (title: string, ...groups: [string, string[]][]) => {
    const box = h('div', 'bha-riskexplain');
    box.append(h('b', 'bha-riskexplain__title', title));
    for (const [label, lines] of groups) {
      box.append(h('span', 'bha-riskexplain__label', label));
      const ul = h('ul', 'bha-riskexplain__list');
      for (const t of lines) ul.append(h('li', '', t));
      box.append(ul);
    }
    return box;
  };
  explain.append(
    block(faction.riskGaugeName, ['손해', rt.riskLoss], ['오르는 길', rt.riskUp], ['내리는 길', rt.riskDown]),
    block(faction.stabilityName, ['손해', rt.stabilityLoss], ['오르내림', rt.stabilityMove]),
  );
  const evo = save.evolution;
  const stats = panel({ title: '능력치', aside: elementsMark(playerElementsOf(evo), faction.id) });
  stats.setAttribute('aria-label', '능력치');
  // 막대 기준 = 마지막 단계 기준 능력치 (고정, GDD 32-1): 내 단계로 나누지 않아 진화·노력치가 막대로 보인다
  stats.append(statsBlock(faction.id, currentStats(evo, faction.id, statBonusOf(save).total), evo.ev, refStatOf(BALANCE.provisional.stats.tierTotals.length - 1), evo.carry));
  // 치명타 (C.63, GDD 28장 5번 · C.131 77장 ②③): 속도 밑에 다른 능력치처럼 한 줄에 하나. 확률 줄에 마우스를 올리면(폰은 터치) 최대치
  const CXM = BALANCE.provisional.combat;
  const critRows = statRow('치명타 확률', critPercentText(save.build, save.evolution), `최대 ${Math.round(CXM.critChanceMax * 100)}%`);
  critRows.dataset.crit = '';
  const critDmg = statRow('치명타 피해', `×${CXM.critMultiplier}`);
  // 속성 피해 5종 (C.101, GDD 48장 4번 · C.137 85장 8): 치명타 밑에 속성마다 한 줄씩, 0 이어도 보인다
  const rows = [critRows, critDmg, ...elementDamageRows(elementDamageOf(evo), ELEMENT_DAMAGE_IDS, faction.id)];
  const speedRow = stats.querySelector('.bha-stats')?.lastElementChild;
  if (speedRow) speedRow.after(...rows);
  else stats.append(...rows);
  // 붕옥 해방·초월체 보유 보너스 (GDD 22-3): 능력치에 이미 곱해져 있다
  const bonus = bonusLine(save);
  if (bonus) {
    const line = h('p', 'bha-small');
    line.dataset.bonus = String(statBonusOf(save).total);
    line.append('붕옥·초월체 보너스: ', h('b', '', bonus));
    stats.append(line);
  }
  const mark = rebirthMark(save.rebirth.count);
  if (mark) {
    const line = h('p', 'bha-faint');
    line.append(mark, ` ${faction.rebirth.name} ${save.rebirth.count}회 · 계승 노력치 ${carryLine(faction.id, evo.carry ?? zeroStats())}`);
    stats.append(line);
  }
  // 특성 2줄 (GDD 39장): 성향 / 속성·전용. 성향이 비어 있어도(C.89 전 세이브·테스트 모드 몸) 속성·전용 특성은 전투에 실리므로 진화체면 보인다 (C.93)
  const abil = statusAbilityLines(evo, faction.id);
  if (abil) stats.append(abilityParagraph(abil, 'bha-faint'));
  // 진화 정보 (옛 제단 화면, C.137 85장 7): 능력치 아래로 내려 보인다
  const evoPanel = panel({ title: '진화 정보' });
  evoPanel.setAttribute('aria-label', '진화 정보');
  evoPanel.dataset.evolution = '';
  const cols = evolutionColumns(faction, evo);
  const evoMark = rebirthMark(save.rebirth.count);
  if (evoMark) cols.left[0]?.querySelector('.bha-evo__formname')?.append(' ', evoMark);
  evoPanel.append(...cols.left.slice(0, 1), ...cols.right);
  if (canRebirth(evo)) {
    const rb = button({ label: faction.rebirth.name, icon: 'i-evolve', variant: 'danger', block: true, onClick: hd.onRebirth });
    rb.dataset.sc = 'rebirth';
    evoPanel.append(h('p', 'bha-faint', `${faction.rebirth.name}하면 1단계로 돌아가 다시 키운다. 도감·칭호와 노력치 일부, 특성 1개는 남는다.`), rb);
  }
  evoPanel.append(h('div', 'bha-row', ''));
  const evoBtns = evoPanel.lastElementChild!;
  evoBtns.append(button({ label: '진화체 도감', icon: 'i-dex', onClick: hd.onDex }), button({ label: '진화 도움말', icon: 'i-help', iconOnly: true, onClick: hd.onHelp }));
  lcdPage(dev.view, { cls: 'bha-care-page' }, lcdHead({ title, sub, logo: logoMark(faction, 'bha-logo--md') ?? undefined }), [status, explain, holdingsPanel(faction, save), skinPanel(faction, save, persist)], [stats, evoPanel, weakSlot, h('p', 'bha-faint', `괄호는 노력치(+${faction.rebirth.name} 계승). 돌보기는 홈 아래 독에서 한다. ${versionLabel()}`)]);
}

/** 스킨 고르기 (GDD 25-1·26-5·25-9): [기본(진화체)]와 이 종족이 입을 수 있고 **보유한**(상점 영옥 탭에서 산) 스킨. 고르면 바로 입고 저장하며 목록은 그 자리에서 표시만 바뀐다.
 *  종족이 다른 스킨·안 산 스킨은 목록에 안 보인다. 보유한 스킨이 없으면 상점 안내만 */
function skinPanel(faction: FactionConfig, save: SaveData, persist: () => void): HTMLElement {
  const skins = skinsFor(faction.id).filter((sk) => save.shared.cosmetics.includes(skinItemId(sk.id)));
  const p = panel({ title: '스킨' });
  p.setAttribute('aria-label', '스킨');
  p.dataset.skins = String(skins.length);
  if (skins.length === 0) {
    p.append(h('p', 'bha-faint', skinsFor(faction.id).length > 0 ? `가진 스킨이 없다. 방의 ${roomOf(faction).props.shop}(상점) 스킨 탭에서 산다.` : '이 종족이 입을 수 있는 스킨은 아직 없다.'));
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
  add(null, '기본(진화체)', charArt(faction.id, save.evolution.tierIndex, '', base, undefined, undefined, save.evolution.look).src);
  for (const sk of skins) add(sk.id, skinLabel(sk), charArt(faction.id, save.evolution.tierIndex, '', base, undefined, undefined, sk.id).src);
  mark();
  p.append(list, h('p', 'bha-faint', '입으면 단계와 상관없이 방·원정·전투 모두 스킨 그림으로 바뀐다. 스킨에 없는 동작은 기본 움직임을 쓴다.'));
  return p;
}

/** 가진 것 (GDD 23-1·22-3·23-4·25-9): 먹이 종류별 개수, 영혼 결정, 골드·영옥(상점), 다시 뽑기권 */
function holdingsPanel(faction: FactionConfig, save: SaveData): HTMLElement {
  const p = panel({ title: '가진 것' });
  p.setAttribute('aria-label', '가진 것');
  const food = h('p', 'bha-small');
  food.append('먹이: ', FOOD_IDS.map((id) => `${faction.foodNames[id]} ${save.shared.food[id]}`).join(' · '));
  const crystals = h('p', 'bha-small');
  crystals.append(`${SOUL_CRYSTAL_NAME} `, h('b', 'bha-num', String(save.shared.soulCrystals)));
  const coins = h('p', 'bha-small');
  coins.dataset.currency = 'trade';
  coins.append(`${TRADE_CURRENCY_NAME} `, h('b', 'bha-num', String(save.shared.tradeCoins)), ' ', h('span', 'bha-faint', '상점'));
  const jade = h('p', 'bha-small');
  jade.dataset.currency = 'jade';
  jade.append(`${JADE_NAME} `, h('b', 'bha-num', String(save.shared.jade)), ' ', h('span', 'bha-faint', '상점 스킨 탭 (꾸밈)'));
  p.append(food, crystals, coins, jade);
  if (save.shared.rerollTickets > 0) p.append(h('p', 'bha-small', `다시 뽑기권 ${save.shared.rerollTickets}장`));
  return p;
}

type ChestTab = 'slots' | 'tiles' | 'items';
const chestUi: { tab: ChestTab; traits: TraitsTabState; synth: boolean } = { tab: 'slots', traits: { swapTrait: null }, synth: false };

/** 상자(보관함): 슬롯(왼쪽 슬롯 칸 / 오른쪽 보유 특성) · 타일(왼쪽 설명·배치 프리셋 / 오른쪽 가진 타일 — 덱 없음, GDD 85장 11번) · 물건(카테고리별 보관품, 쓰기·끼기 — GDD 86장 4·5번).
 *  C.140 최소 화면 — 카드형 UI 는 C.141 */
export function chestView(dev: Device, faction: FactionConfig, save: SaveData, title: string, persist: () => void, onWear?: () => void): void {
  const tileCount = () => ownedTileList(save.tiles, faction.id).length;

  // 머리의 탭 줄 대신 제목 토글 "보관함 · 슬롯 ▾" (C.114). 타일 항목에는 가진 타일 수를 같이 보인다
  const viewTitleEl = (): HTMLElement => viewTitle([{ id: 'slots', label: '슬롯' }, { id: 'tiles', label: `타일 ${tileCount()}` }, { id: 'items', label: '물건' }], chestUi.tab, (id) => {
    chestUi.tab = id as ChestTab;
    fill();
  }, { prefix: title });
  const page = lcdPage(dev.view, { cls: 'bha-chest-page', cols: '1fr 1fr' }, lcdHead({ title: selectLast(viewTitleEl()) }), [], []);

  function fill(): void {
    // 제목 토글의 타일 항목에 보이는 타일 수를 새로 맞춘다 (제목 요소만 다시 만든다)
    dev.view.querySelector('.bha-chest-page .bha-lcdpage__title')?.replaceChildren(selectLast(viewTitleEl()));
    if (chestUi.tab === 'slots') {
      const [slotsPanel, ownedPanel] = traitsTab(faction, save.build, chestUi.traits, () => {
        persist();
        fill();
      }, save.evolution.tierIndex);
      page.left.replaceChildren(slotsPanel!);
      page.right.replaceChildren(ownedPanel!);
      return;
    }
    // 물건 탭은 한 열 (카드 격자가 폭을 다 쓴다), 나머지는 두 열
    const body = page.left.parentElement!;
    body.style.gridTemplateColumns = chestUi.tab === 'items' ? 'minmax(0, 1fr)' : '1fr 1fr';
    page.right.hidden = chestUi.tab === 'items';
    if (chestUi.tab === 'items') {
      const [l, r] = itemsTab(faction, save, () => {
        persist();
        onWear?.();
        fill();
      });
      page.left.replaceChildren(l);
      page.right.replaceChildren(r);
      return;
    }
    // 첫 진화 전에는 타일이 잠겨 있다 (GDD 64장 1번): 덱 대신 잠금 안내
    if (!save.tiles.unlocked) {
      const lock = panel({ title: '타일', aside: h('span', 'bha-chip', TILES_LOCKED_TEXT) });
      lock.dataset.tilesLocked = '';
      lock.querySelector('.bha-panel__title')?.prepend(icon('i-lock'));
      lock.append(h('p', 'bha-dim', `원정 타일은 첫 진화 후 열린다. 첫 진화 때 ${BALANCE.provisional.expedition.starterTiles.map((id) => tileName(id, faction.id)).join(' · ')} 1장씩을 받고, 그 뒤로는 상점 [타일 뽑기]로 모은다.`));
      page.left.replaceChildren(lock);
      page.right.replaceChildren(h('p', 'bha-faint', '지금 원정은 타일 없이 기본 길을 걷는다.'));
      return;
    }
    const info = panel({ title: '가진 타일', aside: h('span', 'bha-chip', `${tileCount()}장`) });
    info.querySelector('.bha-panel__title')?.prepend(icon('i-deck'));
    info.append(h('p', 'bha-dim', `원정 출발 때 가진 타일을 전부 보고 길에 최대 ${placementLimitOf(save)}칸 놓는다. 놓은 타일이 원정 보상으로 뽑힌다.`));
    // 타일 합성 (GDD 25-5 ⑤): 같은 타일 3장 → 상위 타일("+") 1장. 오른쪽 목록을 합성 목록으로 바꾼다
    const cost = BALANCE.provisional.tileVariants.synthCost;
    const synthBtn = button({
      label: chestUi.synth ? '가진 타일 보기로' : '합성', icon: chestUi.synth ? 'i-deck' : 'i-plus', block: true,
      onClick: () => {
        chestUi.synth = !chestUi.synth;
        fill();
      },
    });
    synthBtn.dataset.sc = 'synth';
    info.append(synthBtn, h('p', 'bha-faint', `합성: 같은 타일 ${cost}장 → 이름 뒤 "+" 상위 타일 1장 (상위 타일은 다시 합성하지 않는다)`));
    if (chestUi.synth) {
      const list = h('div', 'bha-stack');
      list.dataset.synth = '';
      for (const t of baseTilesFor(faction.id).filter((x) => canSynthesize(x.id))) {
        const up = upgradeIdOf(t.id)!;
        const have = save.tiles.collection[t.id] ?? 0;
        const row = h('div', have >= cost ? 'bha-deckrow' : 'bha-deckrow is-zero');
        const kind = tileKindOf(t);
        row.style.setProperty('--tile', `var(--bha-tile-${kind.cls})`);
        const ic = h('span', 'bha-deckrow__icon');
        ic.append(icon(kind.icon));
        const main = h('span', 'bha-deckrow__main');
        const upHave = save.tiles.collection[up] ?? 0;
        main.append(
          h('span', 'bha-deckrow__name', tileName(up, faction.id)),
          h('span', 'bha-deckrow__desc', `${variantModsText(BALANCE.provisional.tileVariants.upgrade[t.kind] as VariantMods).join(' · ')} · 재료 ${have}/${cost}${upHave > 0 ? ` · 보유 ${upHave}` : ''}`),
        );
        const go = button({
          label: `합성 (${cost}장)`, size: 'small', disabled: have < cost,
          onClick: () => {
            const r = synthesizeTile(save, t.id);
            if (!r.ok) return;
            persist();
            showToast({ eyebrow: '타일 합성', title: tileName(r.upgradedId, faction.id), meta: `${tileName(t.id, faction.id)} ${cost}장 → 1장` });
            fill();
          },
        });
        go.dataset.synthId = t.id;
        row.append(ic, main, go);
        list.append(row);
      }
      page.left.replaceChildren(info);
      page.right.replaceChildren(list);
      return;
    }
    // 배치 편집기 (GDD 85장 11번, C.141): 가진 타일을 카드로 보고 길 8칸에 놓아 보며 배치 프리셋을 만든다 (원정 출발 화면과 같은 판·같은 프리셋).
    // 저장하지 않는 임시 원정 상태 위에서 놓을 뿐이라 세이브는 프리셋 저장·삭제·이름 바꾸기만 바꾼다
    const board = createExpedition({
      factionId: faction.id, seed: 1, hunger: save.nest.hunger, condition: save.nest.condition, deck: ownedTileList(save.tiles, faction.id),
      build: save.build, evolution: save.evolution, tileVariants: true,
    });
    beginPlanning(board, placementLimitOf(save));
    const planner = roadPlanner({ exp: board, tileName: (id) => tileName(id, faction.id), synergyName: (id) => synergyName(id, faction.id) });
    const presets = presetPanel({
      list: () => tilePresetsFor(save.tiles, faction.id),
      save: (name, index) => {
        const r = saveTilePreset(save, name, cellsOfPlan(board), index);
        if (r.ok) persist();
        return r;
      },
      rename: (index, name) => {
        const ok = renameTilePreset(save, index, name);
        if (ok) persist();
        return ok;
      },
      remove: (index) => {
        const ok = deleteTilePreset(save, index);
        if (ok) persist();
        return ok;
      },
      load: (preset) => {
        const r = applyTilePreset(board, preset);
        planner.adopt();
        return `${preset.name} 불러옴: ${r.placed}칸${r.missing.length > 0 ? ` · 없는 타일 ${r.missing.length}장은 건너뜀` : ''}`;
      },
    }, (id) => tileName(id, faction.id), `최대 ${placementLimitOf(save)}칸`);
    info.append(presets);
    if (ownedTileList(save.tiles, faction.id).length === 0) planner.el.append(h('p', 'bha-faint', '가진 타일이 없다. 상점 [타일 뽑기]로 모은다.'));
    page.left.replaceChildren(info);
    page.right.replaceChildren(planner.el);
  }
  fill();
}

/** 보관함 물건 탭 (GDD 86장 4·5번, C.141): 카테고리 탭(음식·소모품·장비·스킨·타일·기타) + 카드 격자. 카드를 누르면 상세 창([사용]/[장착]/[해제]).
 *  장비는 품목이 생기기 전까지 "준비 중". 타일 카드는 가진 타일 보기 */
const itemsUi: { cat: ItemCategory; skinGroup: SkinGroup } = { cat: 'food', skinGroup: 'all' };

/** '스킨' 탭 안의 꾸밈 묶음 (C.146, 사용자 "i4"): 캐릭터 스킨·기기 디자인·키링·나머지 효과를 칩으로 나눈다 */
export const SKIN_GROUPS = [['all', '전체'], ['character', '캐릭터'], ['device', '기기'], ['keyring', '키링'], ['effect', '효과·꾸밈']] as const;
export type SkinGroup = (typeof SKIN_GROUPS)[number][0];
/** 꾸밈 분류(skin·device·keyring·aura …) → 묶음 */
export function skinGroupOf(cosmeticCategory: string | undefined): Exclude<SkinGroup, 'all'> {
  return cosmeticCategory === 'skin' ? 'character' : cosmeticCategory === 'device' ? 'device' : cosmeticCategory === 'keyring' ? 'keyring' : 'effect';
}
/** 카드 설명 한 줄 (C.146, 사용자 "i6"): 배지가 이미 말하는 "착용 중"·"보유"·"데리고 다니는 중"은 빼고, 스킨 카드는 꾸밈 분류 이름을 보인다 */
export function cardDetailOf(e: Pick<InventoryEntry, 'detail' | 'category' | 'cosmeticCategory'>): string {
  if (e.category === 'skin' && (e.detail === '착용 중' || e.detail === '보유')) return e.cosmeticCategory ? categoryName(e.cosmeticCategory as CosmeticCategory) : '';
  return e.detail.replace(/^데리고 다니는 중 · /, '');
}
function itemsTab(faction: FactionConfig, save: SaveData, changed: () => void): [HTMLElement, HTMLElement] {
  const all = inventoryOf(save, faction);
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  // 탭 숫자 = 그 탭의 카드(종류) 수 (C.146, 사용자 "i5": 이전에는 음식은 개수 합·스킨은 종류 수라 기준이 달랐다). 개수는 카드의 ×n
  const tabs = categoryTabs(ITEM_CATEGORIES.map((c) => ({
    id: c, label: ITEM_CATEGORY_NAMES[c], count: c === 'equipment' ? undefined : all.filter((e) => e.category === c).length,
  })), itemsUi.cat, (id) => { itemsUi.cat = id as ItemCategory; changed(); }, '보관함 분류');
  const artOf = (e: InventoryEntry): HTMLElement => {
    if (e.category === 'tile') return iconArt(tileIconId(tileCss(getTile(e.id).kind)));
    if (e.category === 'pet') {
      const src = petArtSrc(e.id);
      return src ? imageArt(src) : iconArt(petIconId(e.id));
    }
    if (e.category === 'skin') {
      const c = getCosmetic(e.id);
      if (c?.category === 'skin') {
        const src = charArt(faction.id, save.evolution.tierIndex, '', base, undefined, undefined, c.look).src;
        return src ? imageArt(src) : iconArt('i-rare');
      }
      if (c && c.category !== 'device') return swatchArt(c.category, c.category === 'keyring' ? `var(--bha-cos-keyring-${keyringShapeOf(c, faction)}-body)` : `var(${cosmeticToken(c, ({ bar: 'line', shell: 'body', cut: 'line', room: 'line' } as Record<string, string>)[c.category] ?? '')})`, c.category === 'tint' ? `var(${cosmeticToken(c)})` : undefined);
      return iconArt('i-rare');
    }
    return iconArt(e.category === 'food' ? 'i-hunger' : e.category === 'consumable' ? (e.id.includes('calm') || e.id === 'elixir' ? 'i-risk' : e.id === 'reroll' ? 'i-swap' : 'i-cond') : 'i-practice');
  };
  const inGroup = (e: InventoryEntry) => itemsUi.cat !== 'skin' || itemsUi.skinGroup === 'all' || skinGroupOf(e.cosmeticCategory) === itemsUi.skinGroup;
  const rows = all.filter((e) => e.category === itemsUi.cat && inGroup(e));
  const cards = rows.map((e) => itemCard({
    id: e.id, name: e.name, detail: cardDetailOf(e), art: artOf(e),
    badge: e.action === 'unequip' ? '착용 중' : e.action === 'leave' ? '동행 중' : e.category === 'pet' ? undefined : e.count > 1 || e.category !== 'skin' ? `×${e.count}` : undefined,
    state: e.action === 'unequip' || e.action === 'leave' ? 'worn' : e.lock ? 'locked' : undefined,
    onClick: () => openItem(faction, save, e, artOf(e), changed),
  }));
  const empty = itemsUi.cat === 'equipment' ? '장비는 준비 중이다.' : itemsUi.cat === 'pet' ? '아직 펫이 없다. 첫 진화 선물·원정 바퀴 끝 보상·떠돌이 상인에게서 얻는다.' : '비어 있다. 상점에서 사면 여기에 들어온다.';
  const box = h('div', 'bha-stack bha-itembox');
  box.append(tabs);
  if (itemsUi.cat === 'skin') {
    // 스킨 탭 칩 필터: 묶음마다 개수, 없는 묶음은 흐리게
    const chips = h('div', 'bha-itemchips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', '꾸밈 종류');
    const skins = all.filter((e) => e.category === 'skin');
    for (const [id, label] of SKIN_GROUPS) {
      const n = id === 'all' ? skins.length : skins.filter((e) => skinGroupOf(e.cosmeticCategory) === id).length;
      const b = h('button', `bha-itemchip${itemsUi.skinGroup === id ? ' is-on' : ''}${n === 0 && id !== 'all' ? ' is-zero' : ''}`);
      b.type = 'button';
      b.dataset.skinGroup = id;
      b.setAttribute('aria-pressed', String(itemsUi.skinGroup === id));
      b.append(label, h('small', 'bha-itemchip__count', String(n)));
      b.onclick = () => { itemsUi.skinGroup = id; changed(); };
      chips.append(b);
    }
    box.append(chips);
  }
  box.append(itemGrid(cards, empty));
  return [box, h('div')];
}

/** 보관함 카드 상세 창: 쓰기·장착·해제 (GDD 86장 5번) */
function openItem(faction: FactionConfig, save: SaveData, e: InventoryEntry, art: HTMLElement, changed: () => void): void {
  const actions: Parameters<typeof itemDialog>[0]['actions'] = [];
  let close: () => void = () => {};
  if (e.action === 'use') {
    actions.push({
      key: 'use', label: () => '사용', disabled: e.lock !== null,
      onClick: () => {
        close();
        const r = useInventoryItem(save, faction, e.id);
        showToast({ eyebrow: '보관함', title: r.ok ? `${e.name} 사용` : '쓸 수 없다', meta: r.ok ? r.detail : r.reason }, 0, 2400);
        if (r.ok) changed();
      },
    });
  } else if (e.action === 'take' || e.action === 'leave') {
    const on = e.action === 'take';
    actions.push({
      key: on ? 'take' : 'leave', label: () => (on ? '데리고 가기' : '두고 가기'), variant: on ? 'primary' : 'ghost', disabled: e.lock !== null,
      onClick: () => {
        close();
        if (choosePet(save, on ? e.id : null)) {
          showToast({ eyebrow: '펫', title: fixParticles(on ? `${e.name}을(를) 데리고 다닌다` : `${e.name}을(를) 두고 간다`), meta: on ? '원정 바퀴마다 친밀도가 오른다' : undefined }, 0, 2400);
          changed();
        }
      },
    });
  } else if (e.action === 'equip' || e.action === 'unequip') {
    const on = e.action === 'equip';
    actions.push({
      key: on ? 'equip' : 'unequip', label: () => (on ? '장착' : '해제'), variant: on ? 'primary' : 'ghost',
      onClick: () => {
        close();
        if (on ? equipInventoryItem(save, e.id) : unequipInventoryItem(save, e.id)) changed();
      },
    });
  }
  close = itemDialog({
    heading: ITEM_CATEGORY_NAMES[e.category], name: e.name, desc: cardDetailOf(e), art, have: e.category === 'pet' ? petAffinityText(save, e.id) : `보유: ${e.count}`,
    tag: getCosmetic(e.id)?.category === 'skin' ? '미리보기' : undefined, lock: e.lock, actions,
  });
}

/** 상태 화면 특성 줄: 진화체가 있으면 성향(비었으면 생략) + 속성·전용, 1단계면 null (C.93) */
export function statusAbilityLines(evo: EvolutionState, factionId: string): AbilityLine[] | null {
  return evo.formId ? evolutionAbilityLines(evo, factionId) : null;
}
