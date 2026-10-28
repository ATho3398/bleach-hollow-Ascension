// 가방 '장비' 탭 (GDD 108장 C.179 장비 화면 → 109장 4번 C.180 가방 첫 탭으로 옮김).
// 왼쪽 = 캐릭터 외형 + 착용 칸(왼쪽 세로 무기·방어구·신발 / 오른쪽 세로 장신구 1·2·소모품 칸) + 이름·단계 + 능력치 줄(미리 보기 ▲▼),
// 오른쪽 = 탭(전체·무기·방어구·신발·장신구·소모품) + 바둑판 + 아래 줄(보관 개수·[정렬]·[자동 착용]·[일괄 판매]).
// 조작: ▲▼ = 차례로 고르기, 좌우 키 = 왼쪽 칸 ↔ 오른쪽 바둑판(탭 위에서는 탭 바꾸기), ✓ = 상세 창(착용·해제·강화·판매), 뒤로 = 가방 닫기 → 방. 끌어다 칸에 놓기(C.149 슬롯 화면과 같은 enableDrag).
// 종족 무관 — 칸·화면 이름은 종족 설정 gearSlotNames·gearScreen, 판정·기록은 inventory.ts·engine/gear.ts.
import { BALANCE } from '../config/balance';
import { GEAR_GRADE_NAMES, GEAR_KIND_ICONS, GEAR_KINDS, GEAR_SLOT_KIND, GEAR_SLOTS, slotsForKind, type GearKind, type GearSlot } from '../data/gear';
import { STAT_IDS, type StatId } from '../data/schema';
import { statName } from '../data/elements';
import { roomOf, type FactionConfig } from '../engine/faction';
import { currentStats, formDisplayName } from '../engine/evolution';
import { carryOfItems, enhanceCost, equippedSlotOf, findGear, gearScore, gearStatsOf, sellGold, type GearItem } from '../engine/gear';
import { artSkinOf, statBonusOf, type SaveData } from '../game';
import {
  autoEquipGear, BATTLE_ITEM_IDS, bulkSellGear, bulkSellTargets, consumableName, enhanceGearItem, equipGearItem, gearKindName, gearName, gearSlotName, gearSpecialText, gearStatText,
  sellGearEntry, setBattleItem, sortedGear, unequipGearItem,
} from '../inventory';
import { shownName } from './displayName';
import { confirmDialog } from './confirmDialog';
import { button, h, icon } from './bha/dom';
import { categoryTabs, iconArt, itemCard, itemDialog, itemGrid } from './bha/itemUi';
import { showToast } from './bha/nest';
import { roomCharArt } from './bha/room';
import { enableDrag } from './bha/dragdrop';
import { critPercentText } from './lcdScreens';
import type { Device } from './bha/device';

type EquipTab = 'all' | GearKind | 'battle';
type SortMode = 'grade' | 'kind' | 'plus';
const SORT_NAMES: Record<SortMode, string> = { grade: '등급순', kind: '종류순', plus: '강화순' };
/** 화면 사이에 남는 UI 상태 (탭·정렬). focus = 다시 그린 뒤 하이라이트를 돌려줄 칸·카드 (GDD 109장 1번: 안 그러면 첫 칸 무기로 돌아갔다) */
const ui: { tab: EquipTab; sort: SortMode; focus: string | null } = { tab: 'all', sort: 'grade', focus: null };

export function equipTitle(faction: Pick<FactionConfig, 'gearScreen'>): string {
  return faction.gearScreen?.title ?? '장비';
}
export function battleSlotName(faction: Pick<FactionConfig, 'gearScreen'>): string {
  return faction.gearScreen?.battleSlot ?? '소모품';
}

/** 장비 그림: 종류 아이콘 + 등급 색 (그림 파일은 나중 — GDD 91장 8번) */
export function gearArt(kind: GearKind, grade: string): HTMLElement {
  const a = iconArt(GEAR_KIND_ICONS[kind]);
  a.classList.add(`is-grade-${grade}`);
  return a;
}

const GRADE_RANK: Record<string, number> = { legendary: 0, epic: 1, rare: 2, normal: 3 };

/** 정렬 (GDD 108장 4번 [정렬]: 등급·종류·강화순 토글). 낀 것은 늘 앞 */
export function sortGear(items: readonly GearItem[], mode: SortMode, isWorn: (uid: string) => boolean): GearItem[] {
  const kindRank = (k: GearKind) => GEAR_KINDS.indexOf(k);
  const by: Record<SortMode, (a: GearItem, b: GearItem) => number> = {
    grade: (a, b) => GRADE_RANK[a.grade]! - GRADE_RANK[b.grade]! || b.plus - a.plus || kindRank(a.kind) - kindRank(b.kind),
    kind: (a, b) => kindRank(a.kind) - kindRank(b.kind) || GRADE_RANK[a.grade]! - GRADE_RANK[b.grade]! || b.plus - a.plus,
    plus: (a, b) => b.plus - a.plus || GRADE_RANK[a.grade]! - GRADE_RANK[b.grade]! || kindRank(a.kind) - kindRank(b.kind),
  };
  return [...items].sort((a, b) => Number(isWorn(b.uid)) - Number(isWorn(a.uid)) || by[mode](a, b) || b.gotAt - a.gotAt);
}

/** 이 장비를 끼면 바뀌는 칸: 같은 종류 빈 칸 → 첫 칸 (equipGear 와 같은 규칙). 이미 꼈으면 null */
export function targetSlotOf(save: Pick<SaveData, 'shared'>, it: GearItem): GearSlot | null {
  const g = save.shared.gear;
  if (equippedSlotOf(g, it.uid)) return null;
  const slots = slotsForKind(it.kind);
  return slots.find((s) => g.equipped[s] === null) ?? slots[0]!;
}

/** 지금 낀 장비 목록 (칸 하나를 다른 장비로 바꾼 경우도) */
function wornItems(save: Pick<SaveData, 'shared'>, swap?: { slot: GearSlot; uid: string | null }): GearItem[] {
  const g = save.shared.gear;
  return GEAR_SLOTS.map((s) => (swap && swap.slot === s ? swap.uid : g.equipped[s])).filter((u): u is string => u !== null).map((u) => findGear(g, u)).filter((i): i is GearItem => !!i);
}

/** 능력치 줄 값: 진화 능력치 + 장비 합계 (치명은 장비 몫만 %) */
export function equipStats(save: SaveData, swap?: { slot: GearSlot; uid: string | null }): Record<StatId | 'crit', number> {
  const base = currentStats(save.evolution, save.factionId, statBonusOf(save).total);
  const c = carryOfItems(wornItems(save, swap));
  const out = { crit: c.crit } as Record<StatId | 'crit', number>;
  for (const k of STAT_IDS) out[k] = base[k] + (c.stats[k] ?? 0);
  return out;
}

/** 비교 줄 (GDD 108장 4번 '착용 중인 것과 비교 ▲▼'): 낀 장비 대비 이 장비의 능력치 차이. 차이가 없으면 빈 배열 */
export function compareLines(it: GearItem, cur: GearItem | undefined, faction: Pick<FactionConfig, 'id'>): string[] {
  const a = gearStatsOf(it);
  const b = cur ? gearStatsOf(cur) : {};
  const out: string[] = [];
  for (const k of [...STAT_IDS, 'crit'] as const) {
    const d = (a[k] ?? 0) - (b[k] ?? 0);
    if (Math.abs(d) < 1e-9) continue;
    const name = k === 'crit' ? '치명' : statName(k, faction.id);
    const v = k === 'crit' ? `${Math.round(Math.abs(d) * 1000) / 10}%` : String(Math.abs(Math.round(d)));
    out.push(`${name} ${d > 0 ? '▲' : '▼'}${v}`);
  }
  return out;
}

/** 장비 상세 창 (기존 보관함·상태 화면 상세 창을 옮겨 옴, GDD 91장 5·6번 + 108장 4번 비교 ▲▼): [착용](장신구는 칸 둘)/[해제] · [강화 골드 n] · [판매] */
export function openGear(faction: FactionConfig, save: SaveData, uid: string, changed: () => void): void {
  const g = save.shared.gear;
  const it = findGear(g, uid);
  if (!it) return;
  const slot = equippedSlotOf(g, uid);
  const locked = save.activeExpedition != null ? '원정 중에는 바꿀 수 없다' : null;
  const cost = enhanceCost(it);
  const GX = BALANCE.provisional.gear;
  const lines = [
    `${GEAR_GRADE_NAMES[it.grade]} · ★${it.star} · 강화 +${it.plus}/${GX.maxPlus}${slot ? ` · ${gearSlotName(slot, faction)}에 착용 중` : ''}`,
    `능력치: ${gearStatText(it, faction)}`,
    ...(it.special ? [`특수: ${gearSpecialText(it, faction)}`] : []),
    cost === null ? '최대 강화' : `강화 +${it.plus + 1}: ${gearStatText(it, faction, it.plus + 1)} (실패 없음, 능력치 +${Math.round(GX.plusStep * 100)}%p)`,
  ];
  if (!slot) {
    for (const s of slotsForKind(it.kind)) {
      const cur = g.equipped[s] ? findGear(g, g.equipped[s]!) : undefined;
      const cmp = compareLines(it, cur, faction);
      lines.push(`비교 (${gearSlotName(s, faction)}${cur ? ` · ${gearName(cur, faction)}` : ' · 비어 있음'}): ${cmp.length ? cmp.join(' · ') : '같음'}`);
    }
  }
  let close: () => void = () => {};
  const actions: Parameters<typeof itemDialog>[0]['actions'] = [];
  if (slot) {
    actions.push({ key: 'unequip', label: () => '해제', variant: 'ghost', disabled: locked !== null, onClick: () => { close(); if (unequipGearItem(save, uid)) changed(); } });
  } else {
    const many = slotsForKind(it.kind).length > 1;
    for (const s of slotsForKind(it.kind)) {
      const cur = g.equipped[s] ? findGear(g, g.equipped[s]!) : undefined;
      actions.push({
        key: `equip-${s}`, label: () => (many ? `${gearSlotName(s, faction)}에 착용${cur ? ' (교체)' : ''}` : `착용${cur ? ' (교체)' : ''}`), variant: 'primary', disabled: locked !== null,
        onClick: () => {
          close();
          if (equipGearItem(save, uid, s)) {
            showToast({ eyebrow: equipTitle(faction), title: `${gearName(it, faction)} 착용`, meta: cur ? `${gearName(cur, faction)}은(는) 보관으로` : gearSlotName(s, faction) }, 0, 2400);
            changed();
          }
        },
      });
    }
  }
  actions.push({
    key: 'enhance', label: () => (cost === null ? '최대 강화' : `강화 +${it.plus + 1} · 골드 ${cost}`), variant: 'primary', disabled: cost === null || save.shared.tradeCoins < cost,
    note: cost !== null && save.shared.tradeCoins < cost ? `골드 ${cost - save.shared.tradeCoins} 모자람` : undefined,
    onClick: () => {
      const r = enhanceGearItem(save, uid);
      close();
      showToast({ eyebrow: '장비 강화', title: r.ok ? `${gearName(it, faction)} 강화 성공` : '강화할 수 없다', meta: r.ok ? `골드 −${r.gold} · ${gearStatText(it, faction)}` : r.reason }, 0, 2400);
      if (r.ok) {
        changed();
        openGear(faction, save, uid, changed);
      }
    },
  });
  if (!slot) {
    actions.push({
      key: 'sell', label: () => `판매 · 골드 +${sellGold(it)}`, variant: 'danger', disabled: locked !== null,
      onClick: () => {
        confirmDialog({
          title: `${gearName(it, faction)}을(를) 판다`, body: `골드 +${sellGold(it)}. 되돌릴 수 없다.`, danger: true, yes: '판매',
          onYes: () => { close(); if (sellGearEntry(save, uid) !== null) changed(); },
        });
      },
    });
  }
  close = itemDialog({
    heading: equipTitle(faction), name: gearName(it, faction), desc: lines.join('\n'), art: gearArt(it.kind, it.grade),
    have: `골드 ${save.shared.tradeCoins} · 장비 ${g.items.length}/${GX.cap}`, lock: locked, actions,
  });
}

/** 전투용 소모품 상세 창 (GDD 108장 3번): [소모품 칸에 넣기]/[빼기] */
function openBattleItem(faction: FactionConfig, save: SaveData, id: string, changed: () => void): void {
  const inSlot = save.shared.battleItem === id;
  const n = save.shared.items[id] ?? 0;
  const locked = save.activeExpedition != null ? '원정 중에는 바꿀 수 없다' : null;
  let close: () => void = () => {};
  const slotName = battleSlotName(faction);
  close = itemDialog({
    heading: slotName, name: consumableName(id),
    desc: [`보관 ${n}개${inSlot ? ` · ${slotName} 칸에 넣음` : ''}`, `${slotName} 칸에 넣으면 전투 [소모품 사용]이 이것을 쓴다 (전투당 1회, 1개 소모).`, ...(n === 0 ? ['개수가 0이면 칸은 흐리게 남고 버튼은 꺼진다.'] : [])].join('\n'),
    art: iconArt('i-heal'), have: `보관 ${n}개`, lock: locked,
    actions: [inSlot
      ? { key: 'unequip', label: () => '빼기', variant: 'ghost', disabled: locked !== null, onClick: () => { close(); if (setBattleItem(save, null)) changed(); } }
      : { key: 'equip', label: () => `${slotName} 칸에 넣기`, variant: 'primary', disabled: locked !== null, onClick: () => { close(); if (setBattleItem(save, id)) changed(); } }],
  });
}

export interface EquipTabHost {
  persist: () => void;
  /** 가방 화면을 다시 그린다 (장비 탭 그대로) */
  rerender: () => void;
  /** 끌어다 놓기 범위 (가방 화면 전체) */
  scope: () => HTMLElement;
  /** 이 그림이 바뀌거나 화면이 끝나면 끊기는 신호 (좌우 키 리스너) */
  signal: AbortSignal;
}

/** 가방 장비 탭 (GDD 109장 4번): 왼쪽(착용 칸·외형·능력치) · 오른쪽(탭·바둑판·아래 줄). restore = 붙인 뒤 부르면 하이라이트를 방금 누른 칸·카드로 돌려준다 */
export function equipTab(dev: Device, faction: FactionConfig, save: SaveData, hd: EquipTabHost): { left: HTMLElement; right: HTMLElement; restore: () => void } {
  const g = save.shared.gear;
  const GX = BALANCE.provisional.gear;
  const slotName = battleSlotName(faction);
  const redraw = (focus: string | null) => {
    ui.focus = focus;
    hd.rerender();
  };
  const changed = () => {
    hd.persist();
    hd.rerender();
  };
  /** 상세 창에서 바꾼 뒤 다시 그릴 때 하이라이트를 그 칸·카드에 둔다 */
  const changedAt = (focus: string) => () => {
    ui.focus = focus;
    changed();
  };
  const isWorn = (uid: string) => equippedSlotOf(g, uid) !== null;
  const battleOwned = BATTLE_ITEM_IDS.filter((id) => (save.shared.items[id] ?? 0) > 0 || save.shared.battleItem === id);

  // ── 왼쪽: 착용 칸 · 외형 · 이름 · 능력치 ──
  const slotBtn = (s: GearSlot): HTMLButtonElement => {
    const it = g.equipped[s] ? findGear(g, g.equipped[s]!) : undefined;
    const b = h('button', `bha-eqslot${it ? ` is-grade-${it.grade}` : ' is-empty'}`);
    b.type = 'button';
    b.dataset.slot = s;
    b.dataset.drag = 'slot';
    b.append(icon(GEAR_KIND_ICONS[GEAR_SLOT_KIND[s]]), h('span', 'bha-eqslot__name', gearSlotName(s, faction)));
    if (it?.plus) b.append(h('b', 'bha-eqslot__plus', `+${it.plus}`));
    b.setAttribute('aria-label', `${gearSlotName(s, faction)}: ${it ? gearName(it, faction) : '비어 있음'}`);
    b.title = it ? gearName(it, faction) : '비어 있음 — 오른쪽에서 골라 착용';
    b.onclick = () => {
      if (it) return openGear(faction, save, it.uid, changedAt(`slot:${s}`));
      ui.tab = GEAR_SLOT_KIND[s];
      redraw(`slot:${s}`);
    };
    return b;
  };
  const bid = save.shared.battleItem;
  const bn = bid ? save.shared.items[bid] ?? 0 : 0;
  const battleBtn = h('button', `bha-eqslot bha-eqslot--battle${bid ? '' : ' is-empty'}${bid && bn === 0 ? ' is-dim' : ''}`);
  battleBtn.type = 'button';
  battleBtn.dataset.slot = 'battle';
  battleBtn.dataset.drag = 'slot';
  battleBtn.append(icon('i-heal'), h('span', 'bha-eqslot__name', bid ? shownName(consumableName(bid)) : slotName));
  if (bid) battleBtn.append(h('b', 'bha-eqslot__plus', `×${bn}`));
  battleBtn.setAttribute('aria-label', `${slotName}: ${bid ? `${consumableName(bid)} ${bn}개` : '비어 있음'}`);
  battleBtn.onclick = () => {
    if (bid) return openBattleItem(faction, save, bid, changedAt('slot:battle'));
    ui.tab = 'battle';
    redraw('slot:battle');
  };
  const colL = h('div', 'bha-eqcol');
  colL.append(...(['weapon', 'armor', 'shoes'] as GearSlot[]).map(slotBtn));
  const colR = h('div', 'bha-eqcol');
  colR.append(...(['acc1', 'acc2'] as GearSlot[]).map(slotBtn), battleBtn);
  const figure = h('div', 'bha-eqfigure');
  const art = roomCharArt(roomOf(faction), faction.id, save.evolution.tierIndex, artSkinOf(save));
  if (art.src) {
    const img = h('img', 'bha-eqfigure__img');
    img.src = art.src;
    img.alt = '';
    img.draggable = false;
    figure.append(img);
  } else figure.append(icon('i-nest'));
  const who = h('div', 'bha-eqfigure__who');
  who.append(h('b', '', shownName(formDisplayName(save.evolution, faction.id))), h('small', '', `${save.evolution.tierIndex + 1}단계 ${faction.tierNames[save.evolution.tierIndex] ?? ''}`));
  figure.append(who);
  const doll = h('div', 'bha-eqdoll');
  doll.append(colL, figure, colR);

  // 능력치 줄 (GDD 108장 2번): 장비 합산 반영. 바둑판 카드를 고르면(하이라이트·마우스) 그 장비로 바꿨을 때를 ▲▼ 로 미리 보인다
  const statsRow = h('div', 'bha-eqstats');
  statsRow.setAttribute('aria-label', '능력치');
  const now = equipStats(save);
  const paintStats = (swap?: { slot: GearSlot; uid: string | null }) => {
    const next = swap ? equipStats(save, swap) : now;
    statsRow.replaceChildren(...[...STAT_IDS, 'crit' as const].map((k) => {
      const cell = h('span', 'bha-eqstat');
      cell.dataset.stat = k;
      // 치명은 상태 화면과 같은 '치명타 확률'(진화·흡수 몫 포함, 최대치 자름) — ▲▼ 는 장비 몫 차이
      const v = k === 'crit' ? critPercentText(save.build, save.evolution, now.crit) : String(now[k]);
      cell.append(h('small', '', k === 'crit' ? '치명' : statName(k, faction.id)), h('b', 'bha-num', v));
      const d = next[k] - now[k];
      if (Math.abs(d) > 1e-9) cell.append(h('em', d > 0 ? 'bha-eqstat__up' : 'bha-eqstat__down', `${d > 0 ? '▲' : '▼'}${k === 'crit' ? `${Math.round(Math.abs(d) * 1000) / 10}%` : Math.abs(Math.round(d))}`));
      return cell;
    }));
  };
  paintStats();

  // ── 오른쪽: 탭 · 바둑판 · 아래 줄 ──
  const kindTabs: EquipTab[] = ['all', ...GEAR_KINDS, 'battle'];
  const tabName = (t: EquipTab) => (t === 'all' ? '전체' : t === 'battle' ? slotName : gearKindName(t, faction));
  const countOf = (t: EquipTab) => (t === 'all' ? g.items.length + battleOwned.length : t === 'battle' ? battleOwned.length : g.items.filter((i) => i.kind === t).length);
  const tabs = categoryTabs(kindTabs.map((t) => ({ id: t, label: tabName(t), count: countOf(t) })), ui.tab, (id) => {
    ui.tab = id as EquipTab;
    redraw(null);
  }, '장비 분류');
  const gearCards = (ui.tab === 'battle' ? [] : sortGear(ui.tab === 'all' ? g.items : g.items.filter((i) => i.kind === ui.tab), ui.sort, isWorn)).map((it) => {
    const worn = equippedSlotOf(g, it.uid);
    const card = itemCard({
      id: it.uid, name: gearName(it, faction), art: gearArt(it.kind, it.grade), grade: it.grade,
      badge: worn ? (slotsForKind(it.kind).length > 1 ? `착용 · ${gearSlotName(worn, faction)}` : '착용') : undefined,
      state: worn ? 'worn' : undefined,
      onClick: () => openGear(faction, save, it.uid, changedAt(`item:${it.uid}`)),
    });
    card.dataset.drag = 'gear';
    const target = targetSlotOf(save, it);
    const preview = () => paintStats(target ? { slot: target, uid: it.uid } : undefined);
    card.addEventListener('bha-select', preview);
    card.addEventListener('pointerenter', preview);
    card.addEventListener('pointerleave', () => paintStats());
    return card;
  });
  const battleCards = (ui.tab === 'battle' || ui.tab === 'all' ? battleOwned : []).map((id) => {
    const n = save.shared.items[id] ?? 0;
    const card = itemCard({
      id, name: consumableName(id), art: iconArt('i-heal'), badge: save.shared.battleItem === id ? `넣음 ×${n}` : `×${n}`,
      state: save.shared.battleItem === id ? 'worn' : undefined,
      onClick: () => openBattleItem(faction, save, id, changedAt(`item:${id}`)),
    });
    card.dataset.drag = 'battle';
    return card;
  });
  const empty = ui.tab === 'battle'
    ? `전투용 소모품이 없다. 상점에서 사면 여기에 들어온다. ${slotName} 칸에 넣은 것을 전투 [소모품 사용]이 쓴다.`
    : '장비가 없다. 원정 드롭(강적·보스에게서 잘 나온다)·상점 장비 탭·떠돌이 상인에게서 얻는다.';
  const grid = itemGrid([...gearCards, ...battleCards], empty);
  grid.classList.add('bha-itemgrid--equip');

  const locked = save.activeExpedition != null;
  const sortBtn = button({ label: SORT_NAMES[ui.sort], icon: 'i-swap', size: 'small', onClick: () => {
    const order: SortMode[] = ['grade', 'kind', 'plus'];
    ui.sort = order[(order.indexOf(ui.sort) + 1) % order.length]!;
    redraw('act:sort');
  } });
  sortBtn.dataset.act = 'sort';
  const autoBtn = button({ label: '자동 착용', icon: 'i-check', size: 'small', variant: 'primary', disabled: locked, onClick: () => {
    confirmDialog({
      title: '자동 착용', body: '빈 칸에는 가장 센 장비를, 낀 칸은 더 센 것이 있을 때만 바꾼다.', yes: '자동 착용', no: '아니오',
      onYes: () => {
        const n = autoEquipGear(save);
        showToast({ eyebrow: equipTitle(faction), title: n > 0 ? `${n}칸 바꿨다` : '바꿀 장비가 없다', meta: n > 0 ? '능력치 줄에 반영' : '빈 칸이 없고 더 센 장비도 없다' }, 0, 2400);
        if (n > 0) changedAt('act:auto')();
      },
    });
  } });
  autoBtn.dataset.act = 'auto';
  const sellTargets = bulkSellTargets(save);
  const sellBtn = button({ label: '일괄 판매', icon: 'i-rare', size: 'small', variant: 'danger', disabled: locked || sellTargets.length === 0, onClick: () => {
    const gold = sellTargets.reduce((a, it) => a + sellGold(it), 0);
    confirmDialog({
      title: '일괄 판매', body: `${GEAR_GRADE_NAMES.normal} 등급 · 안 낀 장비 ${sellTargets.length}개를 판다. 골드 +${gold}. 되돌릴 수 없다.`, yes: '판매', no: '아니오', danger: true,
      onYes: () => {
        const r = bulkSellGear(save);
        showToast({ eyebrow: equipTitle(faction), title: `${r.count}개 판매`, meta: `골드 +${r.gold}` }, 0, 2400);
        if (r.count > 0) changedAt('act:bulk-sell')();
      },
    });
  } });
  sellBtn.dataset.act = 'bulk-sell';
  const foot = h('div', 'bha-eqfoot');
  foot.append(h('span', 'bha-chip bha-eqfoot__count', `${g.items.length}/${GX.cap}`), sortBtn, autoBtn, sellBtn);

  const right = h('div', 'bha-eqright');
  right.append(tabs, grid, foot);
  const left = h('div', 'bha-eqleft');
  left.append(doll, statsRow);
  if (locked) left.append(h('p', 'bha-faint', '원정 중에는 장비를 바꿀 수 없다.'));


  // 끌어다 놓기 (C.149 슬롯 화면과 같은 방식): 카드 → 같은 종류 칸(착용) · 소모품 카드 → 소모품 칸, 칸 → 오른쪽 바둑판(해제)
  type Src = { kind: 'gear' | 'battle' | 'slot'; id: string };
  const wire = (root: HTMLElement) => enableDrag<Src>({
    root,
    scope: hd.scope,
    sourceOf: (n) => {
      if (locked) return null;
      if (n.dataset.drag === 'gear' && n.dataset.item) return { kind: 'gear', id: n.dataset.item };
      if (n.dataset.drag === 'battle' && n.dataset.item) return { kind: 'battle', id: n.dataset.item };
      if (n.dataset.drag === 'slot' && n.dataset.slot) {
        const s = n.dataset.slot;
        if (s === 'battle') return save.shared.battleItem ? { kind: 'slot', id: s } : null;
        return g.equipped[s as GearSlot] ? { kind: 'slot', id: s } : null;
      }
      return null;
    },
    targetSelector: '.bha-eqslot[data-slot], .bha-eqright',
    onDrop: (src, target) => {
      const to = target?.dataset.slot;
      let ok = false;
      if (src.kind === 'gear' && to && to !== 'battle') {
        const it = findGear(g, src.id);
        if (it && GEAR_SLOT_KIND[to as GearSlot] === it.kind) ok = equipGearItem(save, src.id, to as GearSlot) !== null;
      } else if (src.kind === 'battle' && to === 'battle') ok = setBattleItem(save, src.id);
      else if (src.kind === 'slot' && target?.classList.contains('bha-eqright')) {
        if (src.id === 'battle') ok = setBattleItem(save, null);
        else {
          const uid = g.equipped[src.id as GearSlot];
          ok = !!uid && unequipGearItem(save, uid);
        }
      }
      if (ok) changedAt(to ? `slot:${to}` : src.kind === 'slot' ? `slot:${src.id}` : `item:${src.id}`)();
    },
  });
  wire(left);
  wire(right);

  // 좌우 키 (GDD 108장 5번): 왼쪽 칸 ↔ 오른쪽 바둑판, 장비 분류 탭 위에서는 옆 탭(가방 탭 줄은 가방 화면이 맡는다). 기기 선택(▲▼)을 그 항목까지 옮긴다
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (document.querySelector('.bha-itemdialog, .bha-confirm')) return;
    const cur = hd.scope().querySelector<HTMLElement>('.bha-sel');
    if (!cur || !(left.contains(cur) || right.contains(cur))) return;
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    let target: HTMLElement | null = null;
    if (cur.matches('[role="tab"]')) {
      const all = [...tabs.querySelectorAll<HTMLElement>('[role="tab"]')];
      const next = all[(all.indexOf(cur) + dir + all.length) % all.length];
      next?.click();
      e.preventDefault();
      return;
    }
    const slots = [...doll.querySelectorAll<HTMLElement>('.bha-eqslot')];
    const cards = [...grid.querySelectorAll<HTMLElement>('.bha-itemcard')];
    if (slots.includes(cur)) {
      // 왼쪽 세로줄 → 오른쪽 세로줄 → 바둑판
      const i = slots.indexOf(cur);
      if (dir > 0) target = i < 3 ? slots[i + 3]! : cards[0] ?? tabs.querySelector<HTMLElement>('[aria-selected="true"]');
      else target = i >= 3 ? slots[i - 3]! : null;
    } else if (cards.includes(cur) || right.contains(cur)) {
      if (dir < 0) {
        const cols = Math.max(1, Math.round(grid.clientWidth / Math.max(1, cards[0]?.offsetWidth ?? 1)));
        const i = cards.indexOf(cur);
        target = i >= 0 && i % cols !== 0 ? cards[i - 1]! : slots[3] ?? null;
      } else {
        const i = cards.indexOf(cur);
        target = i >= 0 && i + 1 < cards.length ? cards[i + 1]! : null;
      }
    }
    if (!target) return;
    e.preventDefault();
    const fwd = !!(cur.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING);
    for (let n = 0; n < 300 && !target.classList.contains('bha-sel'); n++) dev.move(fwd ? 1 : -1);
  };
  window.addEventListener('keydown', onKey, { signal: hd.signal });

  const restore = () => {
    const key = ui.focus;
    ui.focus = null;
    if (!key) return;
    const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    const at = kind === 'slot' ? doll.querySelector<HTMLElement>(`.bha-eqslot[data-slot="${id}"]`)
      : kind === 'act' ? foot.querySelector<HTMLElement>(`[data-act="${id}"]`)
      : [...grid.querySelectorAll<HTMLElement>('.bha-itemcard')].find((c) => c.dataset.item === id) ?? null;
    // 기기 선택은 새 화면에서 키보드 초점이 있는 항목을 고른다 (device.ts refresh)
    at?.focus({ preventScroll: true });
  };
  return { left, right, restore };
}
