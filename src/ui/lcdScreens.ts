// 방 물건이 여는 기능 화면: 돌보기·상태 / 상자(슬롯·덱) / 제단(진화). LCD 가로 2단 배치 (T-3).
// 취소(뒤로)는 기기 버튼이 맡아 화면에는 돌아가기 버튼을 두지 않는다. 탭·돌보기·덱 조작은 화면을 다시 만들지 않고 그 자리에서 고쳐 선택 위치가 유지된다.
import { critChanceBonus } from '../engine/absorb/build';
import { roomOf } from '../engine/faction';
import { BALANCE } from '../config/balance';
import { baseTilesFor, deckTilesFor, tileName, upgradeIdOf } from '../data/tiles';
import { canSynthesize, deckSizeOf, equipSkin, statBonusOf, synthesizeTile, type SaveData } from '../game';
import { skinItemId } from '../data/shop';
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
import { deckRow, showToast, statsBlock, statusBlock, tileKindOf } from './bha/nest';
import { abilityEffectsOf, currentStats, elementDamageOf, formAbilitiesOf, playerElementsOf, refStatOf, zeroStats, type AbilityLine, type EvolutionState } from '../engine/evolution';
import { tryGetForm } from '../data/evolution';
import { canRebirth } from '../engine/rebirth';
import { carryLine, rebirthMark } from './rebirthView';
import { elementDamageLine, elementsMark } from './bha/element';
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
  // 막대 기준 = 마지막 단계 기준 능력치 (고정, GDD 32-1): 내 단계로 나누지 않아 진화·노력치가 막대로 보인다
  stats.append(statsBlock(faction.id, currentStats(evo, faction.id, statBonusOf(save).total), evo.ev, refStatOf(BALANCE.provisional.stats.tierTotals.length - 1), evo.carry));
  // 속성 피해 5종 (C.101, GDD 48장 4번): 0 이어도 보인다
  stats.append(elementDamageLine(elementDamageOf(evo), ELEMENT_DAMAGE_IDS, faction.id));
  // 치명타 (C.63, GDD 28장 5번): 기본 + 장착 특성 critChance (물리·마법 합친 하나, 상한 있음)
  const critLine = h('p', 'bha-small');
  critLine.dataset.crit = '';
  critLine.append('치명 ', h('b', 'bha-num', critPercentText(save.build, save.evolution)), ` · 치명 피해 ×${BALANCE.provisional.combat.critMultiplier}`);
  stats.append(critLine);
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
  lcdPage(dev.view, { cls: 'bha-care-page' }, lcdHead({ title, sub, logo: logoMark(faction, 'bha-logo--md') ?? undefined }), [status, holdingsPanel(faction, save), skinPanel(faction, save, persist)], [stats, weakSlot, h('p', 'bha-faint', `괄호는 노력치(+${faction.rebirth.name} 계승). 돌보기는 홈 아래 독에서 한다. ${versionLabel()}`)]);
}

/** 스킨 고르기 (GDD 25-1·26-5·25-9): [기본(진화체)]와 이 종족이 입을 수 있고 **보유한**(상점 영옥 탭에서 산) 스킨. 고르면 바로 입고 저장하며 목록은 그 자리에서 표시만 바뀐다.
 *  종족이 다른 스킨·안 산 스킨은 목록에 안 보인다. 보유한 스킨이 없으면 상점 안내만 */
function skinPanel(faction: FactionConfig, save: SaveData, persist: () => void): HTMLElement {
  const skins = skinsFor(faction.id).filter((sk) => save.shared.cosmetics.includes(skinItemId(sk.id)));
  const p = panel({ title: '스킨' });
  p.setAttribute('aria-label', '스킨');
  p.dataset.skins = String(skins.length);
  if (skins.length === 0) {
    p.append(h('p', 'bha-faint', skinsFor(faction.id).length > 0 ? `가진 스킨이 없다. 방의 ${roomOf(faction).props.shop}(상점) 영옥 탭에서 산다.` : '이 종족이 입을 수 있는 스킨은 아직 없다.'));
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
  coins.append(`${TRADE_CURRENCY_NAME} `, h('b', 'bha-num', String(save.shared.tradeCoins)), ' ', h('span', 'bha-faint', '상점 골드 탭'));
  const jade = h('p', 'bha-small');
  jade.dataset.currency = 'jade';
  jade.append(`${JADE_NAME} `, h('b', 'bha-num', String(save.shared.jade)), ' ', h('span', 'bha-faint', '상점 영옥 탭 (꾸밈)'));
  p.append(food, crystals, coins, jade);
  if (save.shared.rerollTickets > 0) p.append(h('p', 'bha-small', `다시 뽑기권 ${save.shared.rerollTickets}장`));
  return p;
}

type ChestTab = 'slots' | 'deck';
const chestUi: { tab: ChestTab; traits: TraitsTabState; synth: boolean } = { tab: 'slots', traits: { swapTrait: null }, synth: false };

/** 상자: 슬롯(왼쪽 슬롯 칸 / 오른쪽 보유 특성) · 타일 덱(왼쪽 설명 / 오른쪽 타일 행) */
export function chestView(dev: Device, faction: FactionConfig, save: SaveData, title: string, persist: () => void): void {
  const deckSize = deckSizeOf(save);
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
    // 타일 합성 (GDD 25-5 ⑤): 같은 타일 3장 → 상위 타일("+") 1장. 오른쪽 목록을 합성 목록으로 바꾼다
    const cost = BALANCE.provisional.tileVariants.synthCost;
    const synthBtn = button({
      label: chestUi.synth ? '덱 고르기로' : '합성', icon: chestUi.synth ? 'i-deck' : 'i-plus', block: true,
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
    const deckList = h('div', 'bha-stack');
    const count = (id: string) => save.tiles.deck.filter((x) => x === id).length;
    for (const t of deckTilesFor(faction.id)) {
      const owned = save.tiles.collection[t.id] ?? 0;
      if (t.upgradeOf && owned === 0 && count(t.id) === 0) continue; // 상위 타일은 가진 것만
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

/** 상태 화면 특성 줄: 진화체가 있으면 성향(비었으면 생략) + 속성·전용, 1단계면 null (C.93) */
export function statusAbilityLines(evo: EvolutionState, factionId: string): AbilityLine[] | null {
  return evo.formId ? evolutionAbilityLines(evo, factionId) : null;
}
