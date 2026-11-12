// 방 물건이 여는 기능 화면: 돌보기·상태 / 상자(슬롯·덱) / 제단(진화). LCD 가로 2단 배치 (T-3).
// 취소(뒤로)는 기기 버튼이 맡아 화면에는 돌아가기 버튼을 두지 않는다. 탭·돌보기·덱 조작은 화면을 다시 만들지 않고 그 자리에서 고쳐 선택 위치가 유지된다.
import { detachedOf, detachEffectText, detachTotals, getDetachTrait } from '../engine/traitShop';
import { pickDialog } from './pickDialog';
import { infoTip, type InfoBody } from './bha/infoTip';
import { critChanceBonus } from '../engine/absorb/build';
import { marketOf, roomOf } from '../engine/faction';
import { BALANCE } from '../config/balance';
import { baseTilesFor, deckTilesFor, getTile, tileName, upgradeIdOf } from '../data/tiles';
import { artSkinOf, canSynthesize, equipSkin, statBonusOf, synthesizeTile, type SaveData, artTierIndexOf } from '../game';
import { homeHp, homeMaxHp, statusStatDisplay } from '../home';
import { nestShown, riseFrom, statusFillFx, type GaugeShown } from './bha/statusBox';
import { changeItems } from './bha/changeNote';
import { changedKeys } from './bha/gaugeBlink';
import { roomCharArt } from './bha/room';
import { ownedTileList, placementLimitOf } from '../tilePresets';
import { choosePet, HEAL_ROOM_LOCK, equipInventoryItem, setBattleItem, gearSlotName, inventoryOf, petAffinityText, unequipInventoryItem, useInventoryItem, type InventoryEntry } from '../inventory';
import { slotsForKind } from '../data/gear';
import { gearCarry } from '../engine/gear';
import { battleSlotName, equipTab, equipTitle, gearArt, openGear } from './equipView';
import { screenSignal } from './bha/screenScope';
import { petArtSrc, petIconId } from './bha/pet';
import { fixParticles } from '../engine/josa';
import { categoryName, cosmeticToken, getCosmetic, getGoldItem, BATTLE_ITEMS_NAME, ITEM_CATEGORY_NAMES, MEDICINE_NAME, keyringShapeOf, SKIN_SUBTABS, SKIN_SUB_EMPTY, skinListed, skinSubOf, type SkinSubTab, type CosmeticCategory } from '../data/shop';
import { gateHint, gateOpen } from '../unlockGate';
import { openSortie, sortieArt, sortieSlotsRow, SORTIE_NAME } from './sortieView';
import { categoryTabs, iconArt, imageArt, itemCard, itemDialog, itemGrid, swatchArt } from './bha/itemUi';
import { deviceCards, deviceEntries } from './bha/deviceCards';
import { tileCss, tileIconId } from './bha/expedition';
import { skinItemId } from '../data/shop';
import { MATERIAL_DESC, MATERIALS_EMPTY, ownedMaterials } from '../data/materials';
import { unlockHintText } from '../engine/unlocks';
import { consumableGroupOf, equipTrait, TILES_LOCKED_TEXT, TRAIT_LOCKED_IN_RUN, unequipTrait } from '../shop';
import { bonusLine } from './hogyokuView';
import { skinsFor, skinLabel } from '../data/skins';
import { shownName } from './displayName';
import { charArt } from '../data/art/manifest';
import { traitsTab, type TraitsTabState } from './buildPanel';
import { abilityParagraph, evolutionAbilityLines, evolutionColumns } from './evolutionPanel';
import { button, h, icon, notice, panel, provisionalTag, seg } from './bha/dom';
import { FOOD_IDS, type FactionConfig } from '../engine/faction';
import { JADE_NAME, TRADE_CURRENCY_NAME } from '../data/economy';
import { lcdHead, lcdPage, selectLast } from './bha/lcdpage';
import type { Device } from './bha/device';
import { evText, showToast, statRow, statsBlock, statusBlock, tileKindOf } from './bha/nest';
import { abilityEffectsOf, abilityIdLine, currentStats, equippedAbilitiesOf, elementDamageOf, evCaps, evCounted, evTotal, formAbilitiesOf, playerElementsOf, refStatOf, zeroStats, type AbilityLine, type EvolutionState } from '../engine/evolution';
import { confirmDialog } from './confirmDialog';
import { tryGetForm } from '../data/evolution';
import { STAT_IDS } from '../data/schema';
import { STAT_USE, statInfoLines } from '../data/help/statText';
import { statName } from '../data/elements';
import { canRebirth } from '../engine/rebirth';
import { carryLine, rebirthMark } from './rebirthView';
import { elementDamageRows, elementsMark } from './bha/element';
import { ELEMENT_DAMAGE_IDS } from '../engine/combat';
import { countText, toward } from './bha/nestLogic';
import { tileHint, variantModsText } from './labels';
import { logoMark } from './bha/logo';
import { bondStage, CARE_STATUS_NAMES, dyingLeftMs } from '../engine/nest';
import { BOND_STAGE_NAMES, careStatusShort, dyingClock, statusChips } from './bha/roomLogic';
import { statusInfo, type StatusInfoKind } from './bha/statusInfo';
import type { VariantMods } from '../engine/expedition';

/** 치명 두 값 (GDD 126-1 확정 ②, C.220): 평타 치명 / 블록 치명 확률(0~1)과 상한·가산 내역. 기본 + 장착 특성 + 칸에 낀 진화체 특성 + 장비,
 *  블록 치명은 블록형 몸(물공 블록이 없는 몸)만 블록 보정(blockPlayCrit)을 더한다 — 전투와 같은 규칙 */
export function critChances(build: SaveData['build'], evo?: SaveData['evolution'], gearCrit = 0): { basic: number; block: number; basicMax: number; blockMax: number; bonus: number; blockPlay: number } {
  const CX = BALANCE.provisional.combat;
  const form = evo?.formId ? tryGetForm(evo.formId) : undefined;
  const fa = evo ? (evo.abilities ? equippedAbilitiesOf(form ?? null, evo.abilities) : formAbilitiesOf(form ?? null, evo.ev, evo.ability)) : null;
  const fromForm = fa ? abilityEffectsOf(fa).critChance : 0;
  const bonus = critChanceBonus(build) + fromForm + gearCrit;
  const blockPlay = fa?.phys ? 0 : CX.blockPlayCrit;
  const detach = detachTotals(detachedOf(evo?.abilities)).blockCrit; // 탈착 특성 '집중' (GDD 150장 4): 블록 치명만, 상한도 같이
  const basicMax = CX.critChanceMax + fromForm;
  const blockMax = CX.blockCritChanceMax + fromForm + detach;
  return { basic: Math.min(basicMax, CX.critChance + bonus), block: Math.min(blockMax, CX.blockCritChance + bonus + blockPlay + detach), basicMax, blockMax, bonus, blockPlay };
}

const pctText = (x: number) => `${Math.round(x * 100)}%`;

/** 옛 이름: 평타 치명 확률 "5%" */
export function critPercentText(build: SaveData['build'], evo?: SaveData['evolution'], gearCrit = 0): string {
  return pctText(critChances(build, evo, gearCrit).basic);
}

/** 상태 자리: 왼쪽 상태 3바(배부름·컨디션·리스크) / 오른쪽 능력치 6줄·속성·고유 특성(GDD 20-3) + 쇠약 안내. 돌보기(먹이·재우기·쓰다듬기)는 홈 하단 독으로 옮겼다 (GDD 18-2) */
export interface CareHandlers {
  /** 진화 정보 패널(C.137, GDD 85장 7): 진화체 도감·진화 도움말·환생 */
  onDex: () => void;
  onHelp: () => void;
  onRebirth: () => void;
  /** 가방 장비 탭 바로가기 (GDD 108장 1번 · 109장 4번): 장착 칸 대신 바로가기 한 줄 */
  onGear: () => void;
}

export function careView(dev: Device, faction: FactionConfig, save: SaveData, title: string, persist: () => void, hd: CareHandlers): void {
  const n = save.nest;
  const RX = BALANCE.provisional.risk;
  const runs = save.runLog.runs;
  const sub = h('span');
  sub.append('사냥터 ', h('b', '', faction.huntingGroundName), ' · 모험 ', h('b', '', String(runs.length)), '회 · 귀환 ', h('b', '', String(runs.filter((r) => r.outcome === 'returned').length)), ' · 패배 ', h('b', '', String(runs.filter((r) => r.outcome === 'defeated').length)));

  const status = panel({ title: '상태' });
  status.setAttribute('aria-label', '상태');
  // 상태이상 칸 (183장 S15): 맨 위 '상태이상' 이름 + 칩 줄. 걸린 게 없으면 칸째 숨김 (GDD 160장 5)
  const weakSlot = h('section', 'bha-care__ailments');
  weakSlot.setAttribute('aria-label', '상태이상');
  const weakList = h('div', 'bha-care__ailmentlist');
  const paint = () => {
    status.querySelector('.bha-nest__status')?.remove();
    status.append(statusBlock(faction, {
      hunger: n.hunger, condition: n.condition, risk: n.risk, riskLimit: RX.limit, condWarn: 40, riskWarn: 60,
      // 교감 (GDD 102-6 · 109장 3번): 따로 떨어진 줄 대신 상태 수치 목록 안 같은 막대 한 줄
      // 설명 글은 이름 옆 ⓘ 창 (C.176, GDD 104장 2)
      bond: {
        value: n.bond, max: BALANCE.provisional.nest.bond.max, stage: BOND_STAGE_NAMES[bondStage(n.bond)],
      },
    }));
    /** 돌봄 상태 블록 (GDD 3-2, v6.004): 모든 블록 같은 폭 — [아이콘 | 윗줄 '이름 · 푸는 법' / 아랫줄 '남은 시간'(있는 것만) | ⓘ 오른쪽 끝] */
    const fix = careStatusShort(n, { feedName: faction.nestActionsShort?.feed ?? faction.nestActions.feed });
    const stateRow = (kind: 'danger' | 'warn', iconId: string, title: string, info: StatusInfoKind, short: string, left?: string) => {
      const row = h('div', `bha-small bha-nest__state bha-nest__state--${kind}`);
      const text = h('span', 'bha-nest__statetext');
      const top = h('span', 'bha-nest__stateline');
      top.append(h('b', '', title), ' ', h('span', 'bha-faint', `· ${short}`));
      text.append(top);
      if (left) text.append(h('span', 'bha-nest__stateleft', left));
      row.append(icon(iconId), text, infoTip(title, () => statusInfo(info, faction)));
      return row;
    };
    // C.185 (GDD 111장 4): 설명은 상태 ⓘ 창과 같은 문구 (손해 → 풀리는 법)
    const states = [
      ...(n.dead ? [stateRow('danger', 'i-broken', CARE_STATUS_NAMES.dead, 'dead', fix.dead)] : []),
      ...(n.collapsed && !n.dead ? [stateRow('danger', 'i-broken', CARE_STATUS_NAMES.collapsed, 'collapsed', fix.collapsed, `남은 시간 ${dyingClock(dyingLeftMs(n, Date.now()) ?? 0)}`)] : []),
      ...(n.weakened ? [stateRow('warn', 'i-hunger', CARE_STATUS_NAMES.weak, 'weak', fix.weak)] : []),
      ...(n.tired ? [stateRow('warn', 'i-cond', CARE_STATUS_NAMES.tired, 'tired', fix.tired)] : []),
    ];
    weakList.replaceChildren(...states);
    weakSlot.replaceChildren(h('p', 'bha-care__label', '상태이상'), weakList);
    weakSlot.hidden = states.length === 0; // 걸린 상태이상이 없으면 칸째 안 보이고 능력치가 위로 (GDD 160장 5)
  };
  paint();
  // 광기·자아 설명 패널(C.141)은 C.176 에 상태 막대 이름 옆 ⓘ 창으로 옮겼다 (GDD 104장 2, bha/statusInfo.ts)
  const evo = save.evolution;
  const stats = panel({ title: '능력치', aside: elementsMark(playerElementsOf(evo), faction.id) });
  stats.setAttribute('aria-label', '능력치');
  // 막대 기준 = 마지막 단계 기준 능력치 (고정, GDD 32-1): 내 단계로 나누지 않아 진화·노력치가 막대로 보인다
  const shown = statusStatDisplay(save); // 화면 값 (GDD 245장 4): 체력·속도·방어·정신력은 전투에서 쓰는 모양으로
  const statBox = statsBlock(faction.id, currentStats(evo, faction.id, statBonusOf(save).total), evo.ev, refStatOf(BALANCE.provisional.stats.tierTotals.length - 1), evo.carry, { hp: shown.hp, spd: shown.spd, def: shown.def, spr: shown.spr });
  // 능력치 칸 = 이름·값만 (GDD 189장 6): 칸마다 있던 ⓘ 를 빼고 칸 전체가 설명 단추 — 누르면(기기 버튼으로 골라도) 예전 ⓘ 와 같은 창.
  // 단추는 칸을 덮는 투명 ⓘ(cellTip) 라 글자 폭을 먹지 않는다. 전체 설명은 제목 옆 ⓘ 그대로
  [...statBox.children].forEach((row, i) => {
    const id = STAT_IDS[i];
    if (id) cellTip(row as HTMLElement, statName(id, faction.id), () => STAT_USE[id]);
  });
  stats.append(statBox);
  // 치명타 (C.63, GDD 28장 5번 · C.131 77장 ②③): 속도 밑에 다른 능력치처럼 한 줄에 하나. 확률 줄에 마우스를 올리면(폰은 터치) 최대치
  const CXM = BALANCE.provisional.combat;
  const gc = gearCarry(save.shared.gear);
  // 치명 두 줄 (GDD 126-1 확정 ②, C.220): 평타 치명 / 블록 치명. 설명은 능력치 ⓘ 창 (GDD 160장 7·165장 2 — 최대만, '기본 n%' 없음)
  const cc = critChances(save.build, save.evolution, gc?.crit ?? 0);
  const critRows = statRow('일반 공격 치명', pctText(cc.basic));
  critRows.dataset.crit = 'basic';
  const blockCritRow = statRow('블록 치명', pctText(cc.block));
  blockCritRow.dataset.crit = 'block';
  const critMul = Math.round((CXM.critMultiplier + (gc?.critDamage ?? 0)) * 100) / 100;
  const critDmg = statRow('치명타 피해', `×${critMul}`);
  // 능력치 설명은 전부 제목 옆 ⓘ 창 한 곳 (GDD 141장 2 · 160장 7 · 165장 2): 능력치마다 한 줄 '이름 = 하는 일'
  stats.querySelector('.bha-panel__title')?.append(infoTip('능력치', () => statInfoLines(faction, { basic: pctText(cc.basicMax), block: pctText(cc.blockMax) })));
  // 속성 피해 5종 (C.101, GDD 48장 4번 · C.137 85장 8): 치명타 밑에 속성마다 한 줄씩, 0 이어도 보인다
  const rows = [critRows, blockCritRow, critDmg, ...elementDamageRows(elementDamageOf(evo), ELEMENT_DAMAGE_IDS, faction.id)];
  // 치명·속성 피해 칸도 칸 전체를 누르면 설명 (능력치 전체 설명 창 — 칸마다 따로 쓴 설명이 없다)
  for (const r of rows) cellTip(r, (r.querySelector('.bha-statrow__name')?.textContent ?? '').trim(), () => statInfoLines(faction, { basic: pctText(cc.basicMax), block: pctText(cc.blockMax) }));
  // 노력치 합계 줄은 능력치 6칸 바로 아래 (GDD 189장: 첫 화면에 보이게). 치명·속성 피해 칸은 그 아래 따로 두 열
  const extraBox = h('div', 'bha-stack bha-stats bha-care__stats2');
  extraBox.append(...rows);
  // 붕옥 해방·초월체 보유 보너스 (GDD 22-3): 능력치에 이미 곱해져 있다
  const bonus = bonusLine(save);
  if (bonus) {
    const line = h('p', 'bha-small');
    line.dataset.bonus = String(statBonusOf(save).total);
    line.append('붕옥·초월체 보너스: ', h('b', '', bonus));
    stats.append(line);
  }
  // 노력치 합계 / 이 단계 상한 (GDD 182장 3): '노력치가 가득 찼다'가 왜인지 보이게
  const cap = evCaps(evo.tierIndex);
  const evLineP = h('p', 'bha-faint');
  evLineP.dataset.evTotal = String(evTotal(evo.ev));
  // 튜토리얼 보상(상한 밖, GDD 217장 2)은 상한 숫자에 세지 않고 따로 적는다
  const counted = evTotal(evCounted(evo));
  const free = evo.evFree ? evTotal(evo.evFree) : 0;
  // GDD 243장 9-6: 한 번에 읽히게 — '모은 양 / 이 단계 최대'와 따로 받은 튜토리얼 몫을 나눠 쓴다
  evLineP.append('노력치 ', evText(`${Math.round(counted * 100) / 100} / ${cap.total}`), ` — 이 단계에서 모을 수 있는 최대 (능력치 하나는 ${cap.perStat}까지)`);
  if (free > 0) evLineP.append(h('br'), `튜토리얼 보상 +${Math.round(free * 100) / 100} — 최대치에 세지 않는다`);
  // '초록 +n' 뜻 = 표 아래 작은 줄 (GDD 189장 5: 제목 줄에서 내림)
  evLineP.append(h('br'), h('span', 'bha-care__evhint', `능력치 옆 초록 +숫자 = 노력치로 오른 몫(${faction.rebirth.name} 계승 포함)`));
  statBox.after(evLineP);
  evLineP.after(extraBox);
  const mark = rebirthMark(save.rebirth.count);
  if (mark) {
    const line = h('p', 'bha-faint');
    line.append(mark, ` ${faction.rebirth.name} ${save.rebirth.count}회 · 계승 노력치 `, evText(carryLine(faction.id, evo.carry ?? zeroStats())));
    stats.append(line);
  }
  // 특성 2줄 (GDD 39장): 성향 / 속성·전용. 성향이 비어 있어도(C.89 전 세이브·테스트 모드 몸) 속성·전용 특성은 전투에 실리므로 진화체면 보인다 (C.93)
  // 특성 칸 (GDD 126-1 수정 → 147~151장, C.226): 3·4단계 진화 때 받은 특성(보기 전용). 칸 = 기본 1 + 4단계 진화 1 + 환생당 1 (최대 4). 칸이 없는 옛 모양(점검 도구)이면 진화체 특성 줄
  const abil = evo.abilities ? null : statusAbilityLines(evo, faction.id);
  if (abil) stats.append(abilityParagraph(abil, 'bha-faint'));
  if (evo.abilities) stats.append(abilitySlotsBlock(faction, save, () => { persist(); careView(dev, faction, save, title, persist, hd); }));
  // 진화 정보 (옛 제단 화면, C.137 85장 7): 능력치 아래로 내려 보인다
  const evoPanel = panel({ title: '진화 정보' });
  evoPanel.setAttribute('aria-label', '진화 정보');
  evoPanel.dataset.evolution = '';
  const cols = evolutionColumns(faction, evo);
  const evoMark = rebirthMark(save.rebirth.count);
  if (evoMark) cols.left[0]?.querySelector('.bha-evo__formname')?.append(' ', evoMark);
  // 이름 줄 전체 폭 (GDD 189장 16): 임시 칩은 이름 줄에서 빼 아래 '단계 · 속성' 줄 앞으로
  const formEl = cols.left[0];
  const formTag = formEl?.querySelector('.bha-evo__formname > .bha-tag');
  if (formTag) formEl?.querySelector('.bha-evo__formname + .bha-dim')?.prepend(formTag, ' ');
  evoPanel.append(...cols.left.slice(0, 1), ...cols.right);
  const rebirthOk = canRebirth(evo);
  if (rebirthOk) evoPanel.append(h('p', 'bha-faint', `${faction.rebirth.name}하면 1단계로 돌아가 다시 키운다. 도감·칭호와 노력치 일부, 받은 특성, 블록 1개는 남는다.`));
  // 아래 고정 버튼 줄 (183장 S15): [진화체 도감][도움말][환생] — 환생을 못 할 때도 흐리게 자리 유지 (PROMPT 5절 1)
  const rb = button({ label: faction.rebirth.name, icon: 'i-evolve', variant: 'danger', disabled: !rebirthOk, onClick: hd.onRebirth });
  rb.dataset.sc = 'rebirth';
  const evoBtns = h('div', 'bha-care__actions');
  evoBtns.append(button({ label: '진화체 도감', icon: 'i-dex', onClick: hd.onDex }), button({ label: '도움말', icon: 'i-help', onClick: hd.onHelp }), rb);
  // GDD 108장 1번 (C.179): 장착 5칸 대신 바로가기 한 줄 + 장비 합산 숫자만. 바로가기 = 가방 장비 탭 (109장 4번)
  const gear = gearShortcut(faction, save, hd.onGear);
  // 오른쪽 = 스크롤 칸(능력치 → 진화 정보) + 아래 고정 버튼 줄. 개발 정보·버전 문단은 뺐다 (183장 S15)
  const rightScroll = h('div', 'bha-care__scroll');
  rightScroll.append(stats, evoPanel);
  // 루트에 아직 bha-v2 를 달지 않는다. 옛 dl.bha-info 는 .bha-infotable 로 바뀌어(C.296) 이름 겹침은 없지만, v2 .bha-info(ⓘ 36 칸·여백 −8)가 능력치 줄 ⓘ 자리를 바꾸므로 달 때는 화면 쪽에서 ⓘ 자리를 같이 본다
  // [진화체 도감][도움말][환생] = 두 열 아래 전체 폭 띠 (GDD 189장 7: 오른쪽 열 아래에 붙어 표를 덮고 판 밖으로 튀어나오던 것). 두 열은 그 위에서 각자 스크롤
  lcdPage(dev.view, { cls: 'bha-care-page', foot: [evoBtns] }, lcdHead({ title, sub, logo: logoMark(faction, 'bha-logo--md') ?? undefined }), [weakSlot, status, gear, skinPanel(faction, save, persist)], [rightScroll]);
}

/** 칸 전체 설명 단추 (GDD 189장 6): 칸을 덮는 투명 ⓘ — 눌렀을 때·기기로 골랐을 때 예전 ⓘ 와 같은 창. 칸 글자는 그대로 읽힌다 */
function cellTip(row: HTMLElement, label: string, body: () => InfoBody): void {
  const tip = infoTip(label, body);
  tip.classList.add('bha-care__celltip');
  tip.setAttribute('aria-label', `${row.getAttribute('aria-label') ?? (row.textContent ?? '').replace(/\s+/g, ' ').trim()} — 설명`);
  row.classList.add('has-celltip');
  // 값 + 노력치(+n·계승)를 한 덩어리로: 칸이 좁으면(폰·글자 확대) 이름 아래 줄 오른쪽으로 통째 내려간다 — 자르거나 칸 밖으로 안 나간다
  const parts = [...row.querySelectorAll(':scope > .bha-statrow__value, :scope > .bha-ev')];
  if (parts.length) {
    const val = h('span', 'bha-care__val');
    parts[0]!.before(val);
    val.append(...parts);
  }
  row.append(tip);
}

/** 스킨 고르기 (GDD 25-1·26-5·25-9): [기본(진화체)]와 이 종족이 입을 수 있고 **보유한**(상점 영옥 탭에서 산) 스킨. 고르면 바로 입고 저장하며 목록은 그 자리에서 표시만 바뀐다.
 *  종족이 다른 스킨·안 산 스킨은 목록에 안 보인다. 보유한 스킨이 없으면 상점 안내만 */
function skinPanel(faction: FactionConfig, save: SaveData, persist: () => void): HTMLElement {
  const skins = skinsFor(faction.id).filter((sk) => save.shared.cosmetics.includes(skinItemId(sk.id)));
  const p = panel({ title: '스킨' });
  p.setAttribute('aria-label', '스킨');
  p.dataset.skins = String(skins.length);
  if (skins.length === 0) {
    p.append(h('p', 'bha-faint', skinsFor(faction.id).length > 0 ? `가진 스킨이 없다. ${marketOf(faction).name}의 ${marketOf(faction).props.skinShop}에서 산다.` : '이 종족이 입을 수 있는 스킨은 아직 없다.'));
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
  add(null, '기본(진화체)', charArt(faction.id, artTierIndexOf(save), '', base, undefined, undefined, save.evolution.look).src);
  for (const sk of skins) add(sk.id, shownName(skinLabel(sk)), charArt(faction.id, artTierIndexOf(save), '', base, undefined, undefined, sk.id).src);
  mark();
  p.append(list, h('p', 'bha-faint', '입으면 단계와 상관없이 방·모험·전투 모두 스킨 그림으로 바뀐다. 스킨에 없는 동작은 기본 움직임을 쓴다.'));
  return p;
}

/** 가방 머리 재화 칩 (GDD 241-D 6): 골드·영옥 — 상점 머리와 같은 칩 */
export function bagWallet(save: Pick<SaveData, 'shared'>): HTMLElement {
  const wallet = h('div', 'bha-shop__wallet bha-bagwallet');
  const chip = (cls: string, ic: string, name: string, v: number): HTMLElement => {
    const c = h('span', `bha-chip ${cls}`);
    c.setAttribute('aria-label', `${name} ${v}`);
    c.title = name;
    c.dataset.currency = cls === 'bha-chip--gold' ? 'trade' : 'jade';
    c.append(icon(ic), h('b', 'bha-num', String(v)));
    return c;
  };
  wallet.append(chip('bha-chip--gold', 'v2-coin', TRADE_CURRENCY_NAME, save.shared.tradeCoins), chip('bha-chip--jade', 'v2-gem', JADE_NAME, save.shared.jade));
  return wallet;
}

// 상태 화면의 '가진 것' 칸(먹이·영혼 결정·골드·영옥)은 뺐다 (GDD 241-C 9, C.406) — 재화는 가방·상점 머리에서 본다

type ChestTab = 'gear' | 'slots' | 'tiles' | 'items' | 'skin' | 'material';
const chestUi: { tab: ChestTab; traits: TraitsTabState; synth: boolean } = { tab: 'gear', traits: {}, synth: false };

/** 가방을 장비 탭으로 연다 (상태 화면 장비 바로가기, GDD 109장 4번) */
/** 가방을 물건 탭의 소모품 분류로 연다 (튜토리얼 회복 안내 — 구급상자·체력 포션, GDD 123장 5 수정) */
export function openChestAtConsumables(): void {
  chestUi.tab = 'items';
  itemsUi.group = 'medicine';
}

export function openChestAtGear(): void {
  chestUi.tab = 'gear';
}

/** 상자(보관함): 슬롯(왼쪽 슬롯 칸 / 오른쪽 보유 특성) · 타일(왼쪽 설명·배치 프리셋 / 오른쪽 가진 타일 — 덱 없음, GDD 85장 11번) · 물건(카테고리별 보관품, 쓰기·끼기 — GDD 86장 4·5번).
 *  C.140 최소 화면 — 카드형 UI 는 C.141 */
export function chestView(dev: Device, faction: FactionConfig, save: SaveData, title: string, persist: () => void, onWear?: () => void, onTilePlace?: () => void): void {
  const tileCount = () => ownedTileList(save.tiles, faction.id).length;

  // 위쪽 탭 [장비 · 슬롯 · 타일 · 소모품 · 스킨 · 펫 · 기타] (C.149, 94장 A-6 · 109장 4번 장비 = 첫 탭 · 154장 1 기타 = 재료 · 159장 24 물건 → 소모품, 스킨은 위 탭으로).
  // 장비·타일·펫·기타에는 가진 수를 같이 보인다 (기타 = 재료 + 다시 뽑기권·수련권)
  // 펫은 장비 탭 안 '펫' 분류로 옮겼다 (GDD 241-D 3)
  const headTabs = (): HTMLElement => selectLast(categoryTabs([
    // 장비 탭 숫자 = 장비 수 (GDD 159장 27 → 193장 9: 전투 소모품은 소모품 탭 한 곳)
    { id: 'gear', label: equipTitle(faction), count: save.shared.gear.items.length }, { id: 'slots', label: '슬롯' }, { id: 'tiles', label: '타일', count: tileCount() }, { id: 'items', label: ITEM_CATEGORY_NAMES.consumable }, { id: 'skin', label: ITEM_CATEGORY_NAMES.skin }, { id: 'material', label: '기타', count: ownedMaterials(save.shared.items).length + etcEntries(save, faction).length },
  ], chestUi.tab, (id) => {
    chestUi.tab = id as ChestTab;
    fill();
  }, `${title} 보기`));
  // 머리 = 재화(골드·영옥 — 가방을 열면 늘 보인다, GDD 241-D 6) + 탭
  const head = (): HTMLElement[] => [bagWallet(save), headTabs()];
  const page = lcdPage(dev.view, { cls: 'bha-chest-page', cols: '1fr 1fr' }, lcdHead({ title, aside: head() }), [], []);
  const signal = screenSignal(dev.view);
  /** 탭 그림마다 새로 받는 신호 (장비 탭 좌우 키 리스너가 다시 그릴 때마다 쌓이지 않게) */
  let tabCtl = new AbortController();
  signal.addEventListener('abort', () => tabCtl.abort());

  // 가방 탭 줄 좌우 키 (GDD 109장 4번 '탭 좌우 키'): 하이라이트가 탭 줄에 있을 때 옆 탭으로
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (document.querySelector('.bha-itemdialog, .bha-confirm')) return;
    const cur = page.app.querySelector<HTMLElement>('.bha-lcdpage__aside .bha-sel[role="tab"]');
    if (!cur) return;
    const all = [...cur.parentElement!.querySelectorAll<HTMLElement>('[role="tab"]')];
    all[(all.indexOf(cur) + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length]?.click();
    e.preventDefault();
  }, { signal });

  function fill(): void {
    tabCtl.abort();
    tabCtl = new AbortController();
    // 탭의 타일·펫 수와 눌린 탭을 새로 맞춘다 (탭 줄만 다시 만든다)
    dev.view.querySelector('.bha-chest-page .bha-lcdpage__aside')?.replaceChildren(...head());
    // 두 열/한 열 전환은 탭마다 먼저 맞춘다 (C.159 A2: 물건·펫 탭에서 숨긴 오른쪽 열이 슬롯 탭으로 돌아와도 숨은 채여서 장착 칸만 보였다)
    const body = page.left.parentElement!;
    if (!(['gear', 'slots', 'tiles', 'items', 'skin', 'material'] as ChestTab[]).includes(chestUi.tab)) chestUi.tab = 'gear';
    const oneCol = chestUi.tab === 'items' || chestUi.tab === 'skin' || chestUi.tab === 'material';
    body.style.gridTemplateColumns = oneCol ? 'minmax(0, 1fr)' : chestUi.tab === 'gear' ? '252px minmax(0, 1fr)' : '1fr 1fr';
    page.right.hidden = oneCol;
    page.app.classList.toggle('bha-equip-page', chestUi.tab === 'gear');
    page.app.querySelector(':scope > .bha-eqfoot')?.remove();
    if (chestUi.tab === 'gear' && !gateOpen(save, 'gear')) {
      // 장비는 2단계에 열린다 (GDD 241-0): 잠김 안내 한 줄
      const lock = panel({ title: equipTitle(faction), aside: h('span', 'bha-chip', '잠김') });
      lock.dataset.gearLocked = '';
      lock.querySelector('.bha-panel__title')?.prepend(icon('i-lock'));
      lock.append(h('p', 'bha-dim', gateHint(faction, 'gear')));
      page.left.replaceChildren(lock);
      page.right.replaceChildren(h('div'));
      return;
    }
    if (chestUi.tab === 'gear') {
      // 장비 탭 (GDD 109장 4번): C.179 장비 화면 → 리디자인 v2 S14 (아래 고정 줄은 화면 맨 아래 두 열에 걸쳐)
      const t = equipTab(dev, faction, save, { persist, rerender: fill, scope: () => page.app, signal: tabCtl.signal });
      page.left.replaceChildren(t.left);
      page.right.replaceChildren(t.right);
      page.app.append(t.foot);
      t.restore();
      return;
    }
    if (chestUi.tab === 'slots') {
      const [slotsPanel, ownedPanel] = traitsTab(faction, save.build, chestUi.traits, () => {
        persist();
        fill();
      }, save.evolution.tierIndex);
      page.left.replaceChildren(slotsPanel!);
      page.right.replaceChildren(ownedPanel!);
      return;
    }
    // 기타 탭 (GDD 154장, C.229): 재료 22종만. 쓰임·얻는 곳은 아직 없다 — 보기만
    if (chestUi.tab === 'material') {
      page.left.replaceChildren(materialsTab(faction, save, () => {
        persist();
        fill();
      }));
      page.right.replaceChildren(h('div'));
      return;
    }
    // 물건 탭은 한 열 (카드 격자가 폭을 다 쓴다), 나머지는 두 열
    if (oneCol) {
      const [l, r] = itemsTab(faction, save, () => {
        persist();
        onWear?.();
        fill();
      }, chestUi.tab === 'skin' ? 'skin' : 'items');
      page.left.replaceChildren(l);
      page.right.replaceChildren(r);
      return;
    }
    // 첫 진화 전에는 타일이 잠겨 있다 (GDD 64장 1번): 덱 대신 잠금 안내
    if (!save.tiles.unlocked) {
      const lock = panel({ title: '타일', aside: h('span', 'bha-chip', TILES_LOCKED_TEXT) });
      lock.dataset.tilesLocked = '';
      lock.querySelector('.bha-panel__title')?.prepend(icon('i-lock'));
      lock.append(h('p', 'bha-dim', `${unlockHintText(faction, 'tiles')}. 그때 ${BALANCE.provisional.expedition.starterTiles.map((id) => tileName(id, faction.id)).join(' · ')} 1장씩을 받고, 그 뒤로는 소모품 상점 [타일 뽑기]로 모은다.`));
      page.left.replaceChildren(lock);
      page.right.replaceChildren(h('p', 'bha-faint', '지금 모험은 타일 없이 기본 길을 걷는다.'));
      return;
    }
    const info = panel({ title: '가진 타일', aside: h('span', 'bha-chip', `${tileCount()}장`) });
    info.querySelector('.bha-panel__title')?.prepend(icon('i-deck'));
    // 한 줄 요약만, 합성 규칙은 합성 목록을 열었을 때만 (GDD 159장 29)
    info.append(h('p', 'bha-dim', `모험 출발 때 길에 최대 ${placementLimitOf(save)}칸 놓는다.`));
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
    info.append(synthBtn);
    // 타일 배치하러 가기 (GDD 241-D 7): 모험 출발 때와 같은 배치판 — 놓아 보고 프리셋으로 저장
    if (onTilePlace) {
      const placeBtn = button({ label: '타일 배치하러 가기', icon: 'i-deck', block: true, variant: 'primary', onClick: onTilePlace });
      placeBtn.dataset.sc = 'tile-place';
      info.append(placeBtn);
    }
    if (chestUi.synth) info.append(h('p', 'bha-faint', `같은 타일 ${cost}장 → "+" 상위 타일 1장`));
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
          h('span', 'bha-deckrow__desc', `${variantModsText(BALANCE.provisional.tileVariants.upgrade[t.kind] as VariantMods, faction.id).join(' · ')} · 재료 ${have}/${cost}${upHave > 0 ? ` · 보유 ${upHave}` : ''}`),
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
    // 가진 타일 목록 (GDD 100장 #57): 배치(길에 놓기·프리셋)는 원정 출발 화면에서만 — 보관함은 보기·합성만
    const owned = deckTilesFor(faction.id).filter((t) => (save.tiles.collection[t.id] ?? 0) > 0);
    const list = h('div', 'bha-stack');
    list.dataset.ownedTiles = '';
    for (const t of owned) {
      const row = h('div', 'bha-deckrow');
      const kind = tileKindOf(t);
      row.style.setProperty('--tile', `var(--bha-tile-${kind.cls})`);
      const ic = h('span', 'bha-deckrow__icon');
      ic.append(icon(kind.icon));
      const main = h('span', 'bha-deckrow__main');
      main.append(h('span', 'bha-deckrow__name', tileName(t.id, faction.id)), h('span', 'bha-deckrow__desc', `${tileHint(t, faction.id)} · 보유 ${save.tiles.collection[t.id]}`));
      row.append(ic, main);
      list.append(row);
    }
    if (owned.length === 0) list.append(h('p', 'bha-faint', '가진 타일이 없다. 소모품 상점 [타일 뽑기]로 모은다.'));
    info.append(h('p', 'bha-faint', onTilePlace ? '[타일 배치하러 가기]에서 놓아 보고 프리셋으로 저장한다.' : '길에 놓기는 모험 출발 화면에서 한다.'));
    page.left.replaceChildren(info);
    page.right.replaceChildren(list);
  }
  fill();
}

/** 가방 소모품 탭 (GDD 86장 4·5번 · 159장 24): 칸 탭(음식 · 약 · 전투 소모품) + 카드 격자. 카드를 누르면 상세 창([사용]).
 *  스킨·펫은 위쪽 탭이 따로, 다시 뽑기권·수련권은 위쪽 '기타' 탭 */
type BagGroup = 'food' | 'medicine' | 'battle' | 'sortie';
const BAG_GROUPS: readonly [BagGroup, string][] = [['food', ITEM_CATEGORY_NAMES.food], ['medicine', MEDICINE_NAME], ['battle', BATTLE_ITEMS_NAME], ['sortie', SORTIE_NAME]]; // 출정품 칸 (GDD 241-D 5)
const itemsUi: { group: BagGroup; skinSub: SkinSubTab } = { group: 'food', skinSub: 'character' };
/** 가방 칸 하나가 드는 소모품 칸 (음식·소모품만, 나머지 null). 다시 뽑기권·수련권 = 'etc' (위쪽 '기타' 탭) */
export function bagGroupOf(e: Pick<InventoryEntry, 'id' | 'category'>): BagGroup | 'etc' | null {
  if (e.category === 'food') return 'food';
  if (e.category === 'consumable') return consumableGroupOf(e.id);
  return e.category === 'etc' ? 'etc' : null;
}
/** 위쪽 '기타' 탭에 재료와 같이 보이는 권(다시 뽑기권·수련권) */
function etcEntries(save: SaveData, faction: FactionConfig): InventoryEntry[] {
  return inventoryOf(save, faction).filter((e) => bagGroupOf(e) === 'etc');
}

/** 카드 설명 한 줄 (C.146, 사용자 "i6"): 배지가 이미 말하는 "착용 중"·"보유"·"데리고 다니는 중"은 빼고, 스킨 카드는 꾸밈 분류 이름을 보인다 */
export function cardDetailOf(e: Pick<InventoryEntry, 'detail' | 'category' | 'cosmeticCategory' | 'brief'>): string {
  if (e.brief) return e.brief; // 음식·소모품은 짧은 효과 한 줄 (GDD 159장 25)
  // 캐릭터 스킨은 하위 탭이 이미 '캐릭터'라 카드마다 '스킨' 반복 줄을 뺀다 (GDD 100장 #61)
  if (e.category === 'skin' && (e.detail === '착용 중' || e.detail === '보유')) return e.cosmeticCategory && e.cosmeticCategory !== 'skin' ? categoryName(e.cosmeticCategory as CosmeticCategory) : '';
  return e.detail.replace(/^데리고 다니는 중 · /, '');
}
/** 카드 아래 동작 칩: 사용 · 착용/해제 · 데리고 가기/두고 가기 · 장착/강화 (없으면 undefined) */
export function actionChipOf(e: Pick<InventoryEntry, 'action' | 'gear'> & { lock?: string | null; battleSlot?: InventoryEntry['battleSlot']; sortie?: InventoryEntry['sortie'] }): string | undefined {
  if (e.gear) return e.gear.slot ? '해제·강화' : '장착·강화';
  if (e.sortie) return e.sortie.slots.length ? '칸에 넣음' : '칸에 넣기'; // 출정품 (GDD 241-D 5)
  // 전투에만 쓰는 소모품 (GDD 193장 9): 가방에서 [사용]은 없고 전투 소모품 칸에 넣는다
  if (e.action === null && e.battleSlot) return e.battleSlot.inSlot ? '칸에 넣음' : '칸에 넣기';
  switch (e.action) {
    // 지금 못 쓰면 '사용' 대신 쓰는 곳·이유 (GDD 176장 16: 방에서 회복 물건 카드가 '사용'인데 열면 꺼져 있었다)
    case 'use': return !e.lock ? '사용' : e.lock === HEAL_ROOM_LOCK ? '모험 중' : '못 씀';
    case 'equip': return '착용';
    case 'unequip': return '해제';
    case 'take': return '데리고 가기';
    case 'leave': return '두고 가기';
    default: return undefined;
  }
}

function itemsTab(faction: FactionConfig, save: SaveData, changed: () => void, mode: 'items' | 'skin' | 'pet'): [HTMLElement, HTMLElement] {
  // 펫·스킨은 위쪽 탭이 따로 (C.149 · GDD 159장 24). 타일·장비도 위쪽 탭 (GDD 100장 #56 · 109장 4번)
  const all = inventoryOf(save, faction);
  // 스킨: 옛 기기 껍데기 색·견본·시험 기기는 빼고(GDD 99장 3, C.163), '기기' 하위 탭은 기본 + 가진 정식 기기 카드(누르면 장착)
  const listed = (e: InventoryEntry) => e.category !== 'skin' || skinListed(getCosmetic(e.id));
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  // 탭 숫자 = 그 탭의 카드(종류) 수 (C.146, 사용자 "i5": 이전에는 음식은 개수 합·스킨은 종류 수라 기준이 달랐다). 개수는 카드의 ×n
  const tabs = categoryTabs(BAG_GROUPS.map(([g, label]) => ({
    id: g, label, count: all.filter((e) => bagGroupOf(e) === g).length,
  })), itemsUi.group, (id) => {
    itemsUi.group = id as BagGroup;
    changed();
  }, '소모품 칸');
  const artOf = (e: InventoryEntry): HTMLElement => {
    // 장비 (GDD 91장 8번): 그림이 없으니 종류 아이콘 + 등급 색
    if (e.gear) return gearArt(e.gear.kind, e.gear.grade);
    if (e.sortie) return sortieArt(e.id);
    if (e.category === 'tile') return iconArt(tileIconId(tileCss(getTile(e.id).kind)));
    if (e.category === 'pet') {
      const src = petArtSrc(e.id);
      return src ? imageArt(src) : iconArt(petIconId(e.id));
    }
    if (e.category === 'skin') {
      const c = getCosmetic(e.id);
      if (c?.category === 'skin') {
        const src = charArt(faction.id, artTierIndexOf(save), '', base, undefined, undefined, c.look).src;
        return src ? imageArt(src) : iconArt('i-rare');
      }
      if (c && c.category !== 'device') return swatchArt(c.category, c.category === 'keyring' ? `var(--bha-cos-keyring-${keyringShapeOf(c, faction)}-body)` : `var(${cosmeticToken(c, ({ bar: 'line', shell: 'body', cut: 'line', room: 'line' } as Record<string, string>)[c.category] ?? '')})`, c.category === 'tint' ? `var(${cosmeticToken(c)})` : undefined);
      return iconArt('i-rare');
    }
    const med = getGoldItem(e.id)?.cures; // 약 (GDD 102-4): 상점과 같은 아이콘
    if (med) return iconArt(med === 'collapsed' ? 'i-heal' : med === 'weak' ? 'i-hunger' : 'i-cond');
    return iconArt(e.category === 'food' ? 'i-hunger' : e.category === 'consumable' ? (e.id.includes('calm') || e.id === 'elixir' ? 'i-risk' : e.id === 'reroll' ? 'i-swap' : 'i-cond') : 'i-practice');
  };
  const rows = mode === 'pet' ? all.filter((e) => e.category === 'pet')
    : mode === 'skin' ? all.filter((e) => e.category === 'skin' && listed(e) && skinSubOf(e.cosmeticCategory) === itemsUi.skinSub)
    : all.filter((e) => bagGroupOf(e) === itemsUi.group);
  const devices = mode === 'skin' && itemsUi.skinSub === 'device' ? deviceCards(save, faction, changed) : null;
  const cards = devices ?? rows.map((e) => itemCard({
    id: e.id, name: e.name, detail: cardDetailOf(e), art: artOf(e),
    grade: e.gear?.grade,
    badge: e.sortie?.slots.length ? `넣음 ×${e.count}` : e.gear ? (e.gear.slot ? (slotsForKind(e.gear.kind).length > 1 ? `장착 · ${gearSlotName(e.gear.slot, faction)}` : '장착') : undefined) : e.action === 'unequip' ? '착용 중' : e.action === 'leave' ? '동행 중' : e.category === 'pet' ? undefined : e.battleSlot?.inSlot ? `넣음 ×${e.count}` : e.count > 1 || e.category !== 'skin' ? `×${e.count}` : undefined,
    // 전투 소모품 칸에 든 것 = 장비 칸에 낀 것과 같은 표시 (GDD 193장 9 — 장비 탭에 있던 '넣음' 카드가 이리로)
    state: e.action === 'unequip' || e.action === 'leave' || e.battleSlot?.inSlot || e.sortie?.slots.length ? 'worn' : e.lock ? 'locked' : undefined,
    foot: actionChipOf(e), // 누르면 무엇을 하는지 (GDD 100장 #59)
    onClick: () => (e.sortie ? openSortie(save, e.id, changed) : openItem(faction, save, e, artOf(e), changed)),
  }));
  // 잠긴 칸 (GDD 243장 2): 전투 소모품 = 3단계 · 출정품 = 첫 환생 — 빈 칸이면 '상점에서 사면…' 대신 잠김 한 줄(자물쇠)만
  const gate = mode !== 'items' ? null : itemsUi.group === 'battle' ? 'battleItem' as const : itemsUi.group === 'sortie' ? 'sortie' as const : null;
  const lockedEmpty = gate !== null && !gateOpen(save, gate) && cards.length === 0;
  const empty = lockedEmpty ? gateHint(faction, gate!) : mode === 'skin' ? SKIN_SUB_EMPTY : mode === 'pet' ? '아직 펫이 없다. 첫 환생 선물·모험 바퀴 끝 보상·떠돌이 상인에게서 얻는다.' : '비어 있다. 상점에서 사면 여기에 들어온다.';
  const box = h('div', 'bha-stack bha-itembox');
  if (mode === 'items') box.append(tabs);
  if (mode === 'items' && itemsUi.group === 'sortie' && !lockedEmpty) box.append(sortieSlotsRow(faction, save, changed)); // 출정품 칸 2개 (GDD 241-D 5)
  if (mode === 'skin') {
    // 스킨 하위 탭 (C.153, GDD 95장 A3): 상점과 같은 구분
    const skins = all.filter((e) => e.category === 'skin' && listed(e));
    box.append(categoryTabs(SKIN_SUBTABS.map(([id, label]) => ({ id, label, count: id === 'device' ? deviceEntries(save, faction).length : skins.filter((e) => skinSubOf(e.cosmeticCategory) === id).length })), itemsUi.skinSub, (id) => { itemsUi.skinSub = id as SkinSubTab; changed(); }, '스킨 종류', true));
  }
  box.append(itemGrid(cards, empty, lockedEmpty ? 'i-lock' : undefined));
  return [box, h('div')];
}

/** 가방 '기타' 창 (GDD 154장 1~4, C.229): 가진 재료 카드 격자. 누르면 상세 창(설명·보유 수, 행동 버튼 없음). 0개면 한 줄 */
function materialsTab(faction: FactionConfig, save: SaveData, changed: () => void): HTMLElement {
  const box = h('div', 'bha-stack bha-itembox');
  box.dataset.materials = '';
  // 다시 뽑기권·수련권 (GDD 159장 24: 소모품 탭에서 '기타' 칸을 없애며 이리로)
  const tickets = etcEntries(save, faction).map((e) => {
    const art = () => iconArt(e.id === 'reroll' ? 'i-swap' : 'i-practice');
    return itemCard({ id: e.id, name: e.name, detail: e.detail, art: art(), badge: `×${e.count}`, onClick: () => openItem(faction, save, e, art(), changed) });
  });
  const cards = ownedMaterials(save.shared.items).map(({ def, count }) => {
    const art = () => iconArt(def.icon);
    return itemCard({
      id: def.id, name: def.name, detail: def.note ?? MATERIAL_DESC, art: art(), badge: `×${count}`,
      onClick: () => itemDialog({ id: def.id, heading: '재료', name: def.name, desc: `${def.note ? `${def.note}. ` : ''}${MATERIAL_DESC}.`, art: art(), have: `보유 ${count}`, actions: [] }),
    });
  });
  box.append(itemGrid([...tickets, ...cards], MATERIALS_EMPTY));
  return box;
}

/** 상태 화면의 장비 바로가기 한 줄 (GDD 108장 1번 · 109장 4번): [가방 · 장비] 버튼(가방 장비 탭) + 장비 합산 능력치 숫자 */
function gearShortcut(faction: FactionConfig, save: SaveData, onGear: () => void): HTMLElement {
  const c = gearCarry(save.shared.gear);
  const sum = c ? [
    ...STAT_IDS.filter((k) => c.stats[k]).map((k) => `${statName(k, faction.id)} +${c.stats[k]}`),
    ...(c.crit > 0 ? [`치명 +${Math.round(c.crit * 1000) / 10}%`] : []),
  ].join(' · ') : '';
  const row = h('div', 'bha-row bha-gearshortcut');
  row.dataset.gear = '';
  const btn = button({ label: `${roomOf(faction).props.chest} · ${equipTitle(faction)}`, icon: 'i-attack', size: 'small', onClick: onGear });
  btn.dataset.act = 'gear-screen';
  // 장비 해금 전에는 '장착한 장비가 없다' 줄을 숨긴다 (GDD 243장 4 보충) — 버튼은 그대로(누르면 가방 장비 탭의 잠김 안내)
  row.append(btn);
  if (sum || gateOpen(save, 'gear')) row.append(h('span', 'bha-small', sum ? `장비 합계: ${sum}` : '장착한 장비가 없다.'));
  return row;
}

/**
 * 아이템 쓰기 연출 (GDD 132장 3 · 201장): 상태창이 가려진 가방 화면이라 머리 위 상태창(같은 박스 + 발밑 체력 막대)을 잠깐 띄워
 * 오른 값이 0.8초 동안 차오르게 한다(회복 수치 글자 없음). 바뀐 값이 없으면(구급상자 등) false — 부르는 쪽이 예전처럼 알림 띠
 */
function useFx(faction: FactionConfig, save: SaveData, e: InventoryEntry, itemArt: HTMLElement, before: GaugeShown): boolean {
  const to = nestShown(save.nest, homeHp(save).fraction);
  const from = riseFrom(before, to);
  // 바뀐 값(오름·내림 — 광기 내림 약 등)이 있으면 상태창을 띄워 그 막대·아이콘만 깜빡임 (GDD 208장 3·4). 오른 값만 차오른다.
  // 상태창 창 제목('…을(를) 썼다')이 알림 띠와 같은 말이고 자리(화면 위 가운데)도 같아 겹치므로, 창을 띄우면 띠는 없다. 바뀐 값이 없으면(구급상자 등) 아무것도 안 띄운다 (GDD 233장 5)
  const blink = changedKeys(before, to);
  if (!from && blink.length === 0) return false;
  const src = roomCharArt(roomOf(faction, save.wear.talk), faction.id, artTierIndexOf(save), artSkinOf(save)).src;
  statusFillFx({ title: fixParticles(`${e.name}을(를) 썼다`), art: src ? imageArt(src) : (itemArt.cloneNode(true) as HTMLElement), chips: () => statusChips(save.nest, faction), from: from ?? to, to, maxHp: homeMaxHp(save), owner: save.nest, blink, note: changeItems(before, to, faction, blink) }); // 바뀐 값 칩 (GDD 209장)
  return true;
}

/** 보관함 카드 상세 창: 쓰기·장착·해제 (GDD 86장 5번) */
function openItem(faction: FactionConfig, save: SaveData, e: InventoryEntry, art: HTMLElement, changed: () => void): void {
  if (e.gear) return openGear(faction, save, e.id, changed);
  const actions: Parameters<typeof itemDialog>[0]['actions'] = [];
  let close: () => void = () => {};
  if (e.action === 'use') {
    actions.push({
      key: 'use', label: () => '사용', disabled: e.lock !== null,
      onClick: () => {
        close();
        const before = nestShown(save.nest, homeHp(save).fraction);
        const r = useInventoryItem(save, faction, e.id);
        // 오른 값이 있으면 상태창 차오름만 (GDD 201장 2: 회복 수치 알림 없음). '사용' 확인 알림은 뺐다 (GDD 233장 5) — 뱉음·못 씀만 알림 띠 (233장 6)
        // 상태이상을 풀었을 때만 알림 한 줄 '○○이(가) 풀렸다' (GDD 234장 1) — 상태창(차오름)이 같은 자리에 뜨면 겹치지 않게 띠만
        if (r.ok && r.cured?.length) showToast({ eyebrow: '가방', title: fixParticles(`${r.cured.join('·')}이(가) 풀렸다`) }, 0, 2400);
        else if (r.ok && !r.spat) useFx(faction, save, e, art, before);
        else showToast({ eyebrow: '가방', title: r.ok ? fixParticles(`${e.name}을(를) 뱉었다`) : '쓸 수 없다', meta: r.ok ? r.detail : r.reason }, 0, 2400); // 뱉음 = 10분에 3개 넘김 (GDD 109장 6)
        if (r.ok) changed();
      },
    });
  } else if (e.action === 'take' || e.action === 'leave') {
    const on = e.action === 'take';
    actions.push({
      key: on ? 'take' : 'leave', label: () => (on ? '데리고 가기' : '두고 가기'), variant: on ? 'primary' : 'ghost', disabled: e.lock !== null,
      onClick: () => {
        close();
        if (choosePet(save, on ? e.id : null)) changed(); // 데리고 다님·두고 감 알림은 뺐다 (GDD 233장 5)
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
  // 전투 소모품 칸 넣기·빼기 (GDD 193장 9 — 장비 탭 '전투 소모품' 분류를 없애고 여기 한 곳에서): 원정 중에는 못 바꾼다(장비와 같이)
  if (e.battleSlot) {
    const slot = battleSlotName(faction);
    const inSlot = e.battleSlot.inSlot;
    const lock = save.activeExpedition != null ? '모험 중에는 바꿀 수 없다' : null;
    actions.push({
      key: inSlot ? 'battle-out' : 'battle-in', label: () => (inSlot ? `${slot} 칸에서 빼기` : `${slot} 칸에 넣기`), variant: inSlot ? 'ghost' : actions.length > 0 ? undefined : 'primary', disabled: lock !== null,
      note: lock ?? undefined,
      onClick: () => {
        close();
        if (setBattleItem(save, inSlot ? null : e.id)) changed(); // 넣음·뺌 알림은 뺐다 (GDD 233장 5)
      },
    });
  }
  close = itemDialog({
    // 상세 창은 자세한 수치(detail), 목록 칸만 짧은 한 줄(brief) — GDD 159장 25. 머리 = 소모품 칸 이름(음식·약·전투 소모품)
    id: e.id, heading: BAG_GROUPS.find(([g]) => g === bagGroupOf(e))?.[1] ?? ITEM_CATEGORY_NAMES[e.category], name: e.name, desc: cardDetailOf({ ...e, brief: undefined }), art, have: e.category === 'pet' ? petAffinityText(save, e.id) : `보유 ${e.count}`,
    tag: getCosmetic(e.id)?.category === 'skin' ? '미리보기' : undefined, lock: e.lock, actions,
  });
}

/** 특성 칸 묶음 (GDD 126-1 수정 → 147~149장, C.226 · 150장 5, C.227): 진화 특성은 보기 전용(받으면 영구), 탈착 특성(특성 상점) 칸에만 [빼기],
 *  빈 칸에는 가진 탈착 특성이 있으면 [끼우기](고르기 창). 원정 중에는 잠금(버튼 흐림 + 이유 한 줄). 바꾸면 changed()(저장 + 다시 그림) */
function abilitySlotsBlock(faction: FactionConfig, save: SaveData, changed: () => void): HTMLElement {
  const evo = save.evolution;
  const box = h('div', 'bha-stack bha-stack--tight');
  box.dataset.abilitySlots = '';
  const l = evo.abilities!;
  const det = detachedOf(l);
  const used = l.equipped.length + det.length;
  const head = h('p', 'bha-small');
  head.append(h('b', '', `특성 칸 ${used}/${l.slots}`), ` · 3·4단계 진화 때 받고 ${faction.rebirth.name}해도 남는다`);
  box.append(head);
  const locked = save.activeExpedition ? TRAIT_LOCKED_IN_RUN : null;
  const spare = save.shared.traits.filter((id) => !det.includes(id));
  const shop = marketOf(faction).props.traitShop;
  for (let i = 0; i < l.slots; i++) {
    const p = h('p', 'bha-faint');
    p.dataset.abilitySlot = String(i);
    const id = l.equipped[i];
    const dId = id ? undefined : det[i - l.equipped.length];
    if (id) {
      const line = abilityIdLine(id, l.owned[id] ?? 1, faction.id);
      if (line) p.append(h('b', '', `${i + 1}칸 · ${line.name}`), ` — ${line.description}`, id === l.pending ? ' · 4단계 진화 때 바뀐다' : '');
      else p.append(`${i + 1}칸 · 비어 있음`);
    } else if (dId) {
      const t = getDetachTrait(dId);
      p.dataset.detach = dId;
      p.append(h('b', '', `${i + 1}칸 · ${t?.name ?? dId}`), ` — ${t ? detachEffectText(t) : ''} · ${shop}`, ' ');
      const out = button({ label: '빼기', size: 'small', disabled: locked !== null, onClick: () => { if (unequipTrait(save, dId)) changed(); } });
      out.dataset.act = 'detach-out';
      p.append(out);
    } else {
      p.append(`${i + 1}칸 · 비어 있음`);
      if (spare.length > 0) {
        p.append(' ');
        const put = button({ label: '끼우기', size: 'small', disabled: locked !== null, onClick: () => pickDialog({
          title: '탈착 특성 끼우기',
          body: `${i + 1}칸에 끼울 특성을 고른다.`,
          options: spare.map((sid) => {
            const t = getDetachTrait(sid)!;
            return { key: sid, label: `${t.name} · ${detachEffectText(t)}`, onPick: () => { if (equipTrait(save, sid)) changed(); } };
          }),
        }) });
        put.dataset.act = 'detach-in';
        p.append(put);
      }
    }
    box.append(p);
  }
  if (locked && (det.length > 0 || spare.length > 0)) box.append(h('p', 'bha-faint', `탈착 특성: ${locked}`));
  return box;
}

/** 상태 화면 특성 줄: 진화체가 있으면 성향(비었으면 생략) + 속성·전용, 1단계면 null (C.93) */
export function statusAbilityLines(evo: EvolutionState, factionId: string): AbilityLine[] | null {
  return evo.formId ? evolutionAbilityLines(evo, factionId) : null;
}
