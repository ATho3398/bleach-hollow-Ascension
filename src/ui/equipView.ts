// 가방 '장비' 탭 (GDD 108장 C.179 장비 화면 → 109장 4번 C.180 가방 첫 탭으로 옮김).
// 왼쪽 = 캐릭터 외형 + 착용 칸 60×66(왼쪽 세로 무기·방어구·신발·펫 / 오른쪽 세로 장신구 1·2·3·소모품 칸) + 이름·단계 (리디자인 v2 S14 — 능력치 줄은 상세 창으로, 241-D 2·3 장신구 3·펫 칸),
// 오른쪽 = 탭(전체·무기·방어구·신발·장신구·펫 — 좁히지 않고 가로 드래그) + 바둑판 4열, 아래 고정 줄(보관 개수·[정렬]·[자동 착용]·[일괄 판매]).
// 조작: ▲▼ = 차례로 고르기, 좌우 키 = 왼쪽 칸 ↔ 오른쪽 바둑판(탭 위에서는 탭 바꾸기), ✓ = 상세 창(착용·해제·강화·판매), 뒤로 = 가방 닫기 → 방. 끌어다 칸에 놓기(C.149 슬롯 화면과 같은 enableDrag).
// 종족 무관 — 칸·화면 이름은 종족 설정 gearSlotNames·gearScreen, 판정·기록은 inventory.ts·engine/gear.ts.
import { BALANCE } from '../config/balance';
import { GEAR_GRADE_NAMES, GEAR_KIND_ICONS, GEAR_KINDS, GEAR_SLOT_KIND, GEAR_SLOTS, slotsForKind, type GearKind, type GearSlot } from '../data/gear';
import { STAT_IDS, type StatId } from '../data/schema';
import { statName } from '../data/elements';
import { roomOf, type FactionConfig } from '../engine/faction';
import { currentStats, formDisplayName } from '../engine/evolution';
import { carryOfItems, enhanceCost, equippedSlotOf, findGear, gearScore, gearStatsOf, sellGold, type GearItem } from '../engine/gear';
import { artSkinOf, statBonusOf, type SaveData, artTierIndexOf } from '../game';
import {
  autoEquipGear, bulkSellGear, bulkSellTargets, consumableName, enhanceGearItem, equipGearItem, gearKindName, gearName, gearSlotName, gearSpecialText, gearStatText,
  choosePet, inventoryOf, ownedBattleItems, petAffinityText, petEffectText, petName, sellGearEntry, setBattleItem, sortedGear, unequipGearItem,
} from '../inventory';
import { affinityOf } from '../engine/pet';
import { petArtSrc, petIconId } from './bha/pet';
import { imageArt } from './bha/itemUi';
import { gateHint, gateOpen } from '../unlockGate';
import { enableDragScroll } from './bha/dragScroll';
import { battleItemBrief } from '../shop';
import { pickDialog } from './pickDialog';
import { shownName } from './displayName';
import { confirmDialog } from './confirmDialog';
import { button, h, icon } from './bha/dom';
import { categoryTabs, iconArt, itemCard, itemDialog, itemGrid } from './bha/itemUi';
import { showToast } from './bha/nest';
import { roomCharArt } from './bha/room';
import { enableDrag } from './bha/dragdrop';
import type { Device } from './bha/device';

type EquipTab = 'all' | GearKind | 'pet';
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
  const locked = save.activeExpedition != null ? '모험 중에는 바꿀 수 없다' : null;
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
      const accLock = it.kind === 'accessory' && !gateOpen(save, 'accessory') ? gateHint(faction, 'accessory') : null; // 241-0 수정: 장신구 = 해방 클리어 후
      actions.push({
        key: `equip-${s}`, label: () => (many ? `${gearSlotName(s, faction)}에 착용${cur ? ' (교체)' : ''}` : `착용${cur ? ' (교체)' : ''}`), variant: 'primary', disabled: locked !== null || accLock !== null, note: accLock ?? undefined,
        onClick: () => {
          close();
          if (equipGearItem(save, uid, s)) changed(); // 착용 알림은 뺐다 (GDD 233장 5) — 칸·능력치 줄이 바뀐다
        },
      });
    }
  }
  actions.push({
    key: 'enhance', label: () => (cost === null ? '최대 강화' : `강화 +${it.plus + 1} · 골드 ${cost}`), variant: 'primary', disabled: cost === null || save.shared.tradeCoins < cost,
    note: cost === null ? '더 강화할 수 없다' : save.shared.tradeCoins < cost ? `골드 ${cost - save.shared.tradeCoins} 모자람` : undefined,
    onClick: () => {
      const r = enhanceGearItem(save, uid);
      close();
      if (!r.ok) showToast({ eyebrow: '장비 강화', title: '강화할 수 없다', meta: r.reason }, 0, 2400); // 강화 성공 알림은 뺐다 (GDD 233장 5·6) — 실패 이유만
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
  const locked = save.activeExpedition != null ? '모험 중에는 바꿀 수 없다' : null;
  let close: () => void = () => {};
  const slotName = battleSlotName(faction);
  close = itemDialog({
    heading: slotName, name: consumableName(id),
    // 남은 개수는 본문 한 곳만 (GDD 159장 28: '보관' → '남은 개수', 아이콘 밑 줄 삭제, 버튼 이름 대괄호·괄호 부가 설명 정리)
    desc: [`남은 개수 ${n}${inSlot ? ` · ${slotName} 칸에 넣음` : ''}`, `${slotName} 칸에 넣으면 전투 중 한 번 쓴다.`, ...(n === 0 ? ['다 쓰면 칸은 흐리게 남고 버튼은 꺼진다.'] : [])].join('\n'),
    art: iconArt('i-heal'), lock: locked,
    actions: [
      ...(inSlot && ownedBattleItems(save).some((o) => o !== id)
        ? [{ key: 'swap', label: () => '바꾸기', variant: 'primary' as const, disabled: locked !== null, onClick: () => { close(); pickBattleItem(faction, save, changed); } }]
        : []),
      inSlot
        ? { key: 'unequip', label: () => '빼기', variant: 'ghost', disabled: locked !== null, onClick: () => { close(); if (setBattleItem(save, null)) changed(); } }
        : { key: 'equip', label: () => `${slotName} 칸에 넣기`, variant: 'primary', disabled: locked !== null, onClick: () => { close(); if (setBattleItem(save, id)) changed(); } },
    ],
  });
}

/** 소모품 칸 고르기 창 (GDD 193장 6): 가진 전투 소모품(회복 물건·전투 각성제) 목록 — 고르면 칸에 넣는다. 없으면 어디서 얻는지 한 줄 */
export function pickBattleItem(faction: Pick<FactionConfig, 'gearScreen'>, save: SaveData, changed: () => void): void {
  const slotName = battleSlotName(faction);
  if (save.activeExpedition != null) {
    showToast({ eyebrow: slotName, title: '모험 중에는 바꿀 수 없다', meta: '빈 칸은 전투 화면 [소모품]을 눌러 고른다' }, 0, 2400);
    return;
  }
  const owned = ownedBattleItems(save).filter((id) => id !== save.shared.battleItem);
  if (owned.length === 0) {
    showToast({ eyebrow: slotName, title: '넣을 전투 소모품이 없다', meta: '상점 약·전투 소모품 탭에서 산다' }, 0, 2400);
    return;
  }
  pickDialog({
    title: `${slotName} 고르기`,
    body: `${slotName} 칸에 넣으면 전투 중 한 번 쓴다.`,
    options: owned.map((id) => ({ key: id, label: `${consumableName(id)} ×${save.shared.items[id] ?? 0} · ${battleItemBrief(id)}`, onPick: () => { if (setBattleItem(save, id)) changed(); } })),
    cls: owned.length > 3 ? 'bha-shoppick--two' : undefined,
  });
}

/** 펫 그림 (그림 파일이 없으면 효과 아이콘) */
export function petCardArt(id: string): HTMLElement {
  const src = petArtSrc(id);
  return src ? imageArt(src) : iconArt(petIconId(id));
}

/** 펫 상세 창 (GDD 90장 → 241-D 3 장비 탭): 효과·친밀도·전투 공격 + [데리고 가기]/[두고 가기] */
export function openPet(faction: FactionConfig, save: SaveData, id: string, changed: () => void): void {
  const o = save.shared.pets.owned[id];
  if (!o) return;
  const on = save.shared.pets.active === id;
  const locked = save.activeExpedition != null ? '모험 중에는 바꿀 수 없다' : null;
  let close: () => void = () => {};
  close = itemDialog({
    heading: '펫', name: petName(id, faction), art: petCardArt(id), lock: locked,
    desc: [`${on ? '데리고 다니는 중 · ' : ''}${petEffectText(id, affinityOf(o.laps))}`, '전투에서 같이 공격한다.', petAffinityText(save, id)].join('\n'),
    actions: [{
      key: on ? 'leave' : 'take', label: () => (on ? '두고 가기' : '데리고 가기'), variant: on ? 'ghost' : 'primary', disabled: locked !== null,
      onClick: () => { close(); if (choosePet(save, on ? null : id)) changed(); },
    }],
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

/** 가방 장비 탭 (GDD 109장 4번 → 183장 v2): 왼쪽(착용 칸 6개·외형·이름·단계) · 오른쪽(탭·바둑판) · 아래 고정 줄(foot — 화면이 맨 아래에 붙인다). restore = 붙인 뒤 부르면 하이라이트를 방금 누른 칸·카드로 돌려준다 */
export function equipTab(dev: Device, faction: FactionConfig, save: SaveData, hd: EquipTabHost): { left: HTMLElement; right: HTMLElement; foot: HTMLElement; restore: () => void } {
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

  // ── 왼쪽: 착용 칸 · 외형 · 이름 · 능력치 ──
  // 장신구 3칸은 해방 클리어 후 (GDD 241-0 수정) — 잠긴 칸은 자물쇠, 누르면 언제 열리는지
  const accOpen = gateOpen(save, 'accessory');
  const slotBtn = (s: GearSlot): HTMLButtonElement => {
    const it = g.equipped[s] ? findGear(g, g.equipped[s]!) : undefined;
    if (!accOpen && GEAR_SLOT_KIND[s] === 'accessory' && !it) {
      const lb = h('button', 'bha-eqslot is-empty is-locked');
      lb.type = 'button';
      lb.dataset.slot = s;
      lb.append(icon('i-lock'), h('span', 'bha-eqslot__name', gearSlotName(s, faction)));
      lb.setAttribute('aria-label', `${gearSlotName(s, faction)}: 잠김`);
      lb.onclick = () => showToast({ eyebrow: equipTitle(faction), title: '잠겨 있다', meta: gateHint(faction, 'accessory') }, 0, 2400);
      return lb;
    }
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
  // 칸 글자는 짧게 '소모품'(GDD 189장 엑셀 15 — 60 폭 칸에서 '전투 소…' 말줄임). 창 머리·aria·안내는 종족 설정 이름 그대로
  battleBtn.append(icon('i-heal'), h('span', 'bha-eqslot__name', bid ? shownName(consumableName(bid)) : '소모품'));
  if (bid) battleBtn.append(h('b', 'bha-eqslot__plus', `×${bn}`));
  battleBtn.setAttribute('aria-label', `${slotName}: ${bid ? `${consumableName(bid)} ${bn}개` : '비어 있음'}`);
  // 빈 칸을 누르면 고르기 창 (GDD 193장 6). 전투 소모품 카드는 가방 '소모품' 탭 한 곳에만 있다 (193장 9 — 이 탭의 '전투 소모품' 분류는 뺐다)
  // 전투 소모품 칸은 3단계부터 (GDD 241-0 수정) — 잠기면 자물쇠, 누르면 언제 열리는지
  const battleOpen = gateOpen(save, 'battleItem');
  if (!battleOpen) {
    battleBtn.classList.add('is-locked');
    battleBtn.replaceChildren(icon('i-lock'), h('span', 'bha-eqslot__name', '소모품'));
    battleBtn.setAttribute('aria-label', `${slotName}: 잠김`);
    battleBtn.dataset.drag = '';
  }
  battleBtn.onclick = () => {
    if (!battleOpen) return showToast({ eyebrow: slotName, title: '잠겨 있다', meta: gateHint(faction, 'battleItem') }, 0, 2400);
    if (bid) return openBattleItem(faction, save, bid, changedAt('slot:battle'));
    pickBattleItem(faction, save, changedAt('slot:battle'));
  };
  // 펫 칸 (GDD 241-D 3): 데리고 다니는 펫. 첫 환생 전에는 잠김 — 누르면 언제 열리는지 (241-0)
  const petOpen = gateOpen(save, 'pet');
  const pid = save.shared.pets.active;
  const petBtn = h('button', `bha-eqslot bha-eqslot--pet${pid ? '' : ' is-empty'}${petOpen ? '' : ' is-locked'}`);
  petBtn.type = 'button';
  petBtn.dataset.slot = 'pet';
  petBtn.dataset.drag = 'slot';
  petBtn.append(petOpen ? (pid ? petCardArt(pid) : icon('i-care-pet')) : icon('i-lock'), h('span', 'bha-eqslot__name', pid ? shownName(petName(pid, faction)) : '펫'));
  petBtn.setAttribute('aria-label', `펫: ${!petOpen ? '잠김' : pid ? petName(pid, faction) : '비어 있음'}`);
  petBtn.onclick = () => {
    if (!petOpen) return showToast({ eyebrow: '펫', title: '잠겨 있다', meta: gateHint(faction, 'pet') }, 0, 2400);
    if (pid) return openPet(faction, save, pid, changedAt('slot:pet'));
    ui.tab = 'pet';
    redraw('slot:pet');
  };
  const colL = h('div', 'bha-eqcol');
  colL.append(...(['weapon', 'armor', 'shoes'] as GearSlot[]).map(slotBtn), petBtn);
  const colR = h('div', 'bha-eqcol');
  colR.append(...(['acc1', 'acc2', 'acc3'] as GearSlot[]).map(slotBtn), battleBtn);
  const figure = h('div', 'bha-eqfigure');
  const art = roomCharArt(roomOf(faction), faction.id, artTierIndexOf(save), artSkinOf(save));
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

  // 능력치 줄은 리디자인 v2(PROMPT 6절 S14)에서 뺐다 — 캐릭터 아래는 이름·단계만, 수치·비교 ▲▼ 는 칸·카드를 누른 상세 창(openGear 비교 줄)에서 본다

  // ── 오른쪽: 탭 · 바둑판 · 아래 줄 ──
  const kindTabs: EquipTab[] = ['all', ...GEAR_KINDS, 'pet'];
  if (!kindTabs.includes(ui.tab)) ui.tab = 'all';
  const tabName = (t: EquipTab) => (t === 'all' ? '전체' : t === 'pet' ? '펫' : gearKindName(t, faction));
  const petIds = Object.keys(save.shared.pets.owned);
  const countOf = (t: EquipTab) => (t === 'all' ? g.items.length : t === 'pet' ? petIds.length : g.items.filter((i) => i.kind === t).length);
  const tabs = categoryTabs(kindTabs.map((t) => ({ id: t, label: tabName(t), count: countOf(t) })), ui.tab, (id) => {
    ui.tab = id as EquipTab;
    redraw(null);
  }, '장비 분류');
  enableDragScroll(tabs, hd.signal); // 탭은 좁히지 않고 가로로 끌어 본다 (GDD 241-D 3)
  // 펫 탭 (GDD 241-D 3 — 가방 위 '펫' 탭을 이리로): 가진 펫 카드, 누르면 데리고 가기/두고 가기. 첫 환생 전에는 잠김 한 줄
  const petCards = ui.tab !== 'pet' || !petOpen ? [] : inventoryOf(save, faction).filter((e) => e.category === 'pet').map((e) => {
    const on = save.shared.pets.active === e.id;
    const card = itemCard({
      id: e.id, name: e.name, detail: petEffectText(e.id, affinityOf(save.shared.pets.owned[e.id]?.laps ?? 0)), art: petCardArt(e.id),
      badge: on ? '동행 중' : undefined, state: on ? 'worn' : undefined,
      onClick: () => openPet(faction, save, e.id, changedAt(`item:${e.id}`)),
    });
    card.dataset.drag = 'pet';
    return card;
  });
  const gearCards = ui.tab === 'pet' ? petCards : sortGear(ui.tab === 'all' ? g.items : g.items.filter((i) => i.kind === ui.tab), ui.sort, isWorn).map((it) => {
    const worn = equippedSlotOf(g, it.uid);
    const card = itemCard({
      id: it.uid, name: gearName(it, faction), art: gearArt(it.kind, it.grade), grade: it.grade,
      badge: worn ? (slotsForKind(it.kind).length > 1 ? `착용 · ${gearSlotName(worn, faction)}` : '착용') : undefined,
      state: worn ? 'worn' : undefined,
      onClick: () => openGear(faction, save, it.uid, changedAt(`item:${it.uid}`)),
    });
    card.dataset.drag = 'gear';
    return card;
  });
  const empty = ui.tab === 'pet'
    ? (petOpen ? '아직 펫이 없다. 모험 바퀴 끝 보상·떠돌이 상인에게서 얻는다.' : gateHint(faction, 'pet'))
    : '장비가 없다. 모험 드롭(강적·보스에게서 잘 나온다)·장비 상점·떠돌이 상인에게서 얻는다.';
  const grid = itemGrid(gearCards, empty);
  grid.classList.add('bha-itemgrid--equip');

  const locked = save.activeExpedition != null;
  const sortBtn = button({ label: SORT_NAMES[ui.sort], icon: 'i-swap', size: 'small', onClick: () => {
    const order: SortMode[] = ['grade', 'kind', 'plus'];
    ui.sort = order[(order.indexOf(ui.sort) + 1) % order.length]!;
    redraw('act:sort');
  } });
  sortBtn.dataset.act = 'sort';
  const LOCKED = '모험 중에는 장비를 바꿀 수 없다';
  /** 못 쓰는 아래 줄 버튼 = 흐리게 자리 유지, 누르면 이유 한 줄 (C.291, PROMPT 5절 4) */
  const why = (b: HTMLButtonElement, reason: string | null): void => {
    if (!reason) return;
    b.classList.add('is-disabled');
    b.setAttribute('aria-disabled', 'true');
    b.onclick = () => showToast({ eyebrow: equipTitle(faction), title: b.textContent ?? '', meta: reason }, 0, 2000);
  };
  const autoBtn = button({ label: '자동 착용', icon: 'i-check', size: 'small', variant: 'primary', onClick: () => {
    confirmDialog({
      title: '자동 착용', body: `빈 칸에는 가장 센 장비를, 장착한 칸은 더 센 것이 있을 때만 바꾼다. ${slotName} 칸이 비었으면 가진 회복 물건을 넣는다.`, yes: '자동 착용', no: '아니요',
      onYes: () => {
        const n = autoEquipGear(save);
        // 바꾼 칸 알림은 뺐다 (GDD 233장 5) — 능력치 줄에 반영된다. 바꿀 게 없을 때 이유만 남긴다 (233장 6)
        if (n > 0) changedAt('act:auto')();
        else showToast({ eyebrow: equipTitle(faction), title: '바꿀 것이 없다', meta: '빈 칸이 없고 더 센 장비도 없다' }, 0, 2400);
      },
    });
  } });
  autoBtn.dataset.act = 'auto';
  why(autoBtn, locked ? LOCKED : null);
  const sellTargets = bulkSellTargets(save);
  const sellBtn = button({ label: '일괄 판매', icon: 'i-rare', size: 'small', variant: 'danger', onClick: () => {
    const gold = sellTargets.reduce((a, it) => a + sellGold(it), 0);
    confirmDialog({
      title: '일괄 판매', body: `${GEAR_GRADE_NAMES.normal} 등급 · 장착하지 않은 장비 ${sellTargets.length}개를 판다. 골드 +${gold}. 되돌릴 수 없다.`, yes: '판매', no: '아니요', danger: true,
      onYes: () => {
        const r = bulkSellGear(save); // 판매 알림은 뺐다 (GDD 233장 5) — 골드·목록이 바뀐다
        if (r.count > 0) changedAt('act:bulk-sell')();
      },
    });
  } });
  sellBtn.dataset.act = 'bulk-sell';
  why(sellBtn, locked ? LOCKED : sellTargets.length === 0 ? `팔 ${GEAR_GRADE_NAMES.normal} 등급 장비가 없다(장착한 것은 안 판다)` : null);
  // 아래 고정 줄 (v2 .bha-dock, PROMPT 6절 S14): 가방 화면 맨 아래 두 열에 걸쳐 놓는다 (chestView)
  const foot = h('div', 'bha-eqfoot');
  const count = h('span', 'bha-chip bha-eqfoot__count');
  const countNum = h('span', 'bha-num');
  countNum.append(h('span', 'bha-num bha-num--w2', String(g.items.length)), `/${GX.cap}`);
  count.append(countNum);
  count.setAttribute('aria-label', `장비 ${g.items.length}/${GX.cap}`);
  foot.append(count, sortBtn, autoBtn, sellBtn);

  const right = h('div', 'bha-eqright');
  right.append(tabs, grid);
  const left = h('div', 'bha-eqleft');
  left.append(doll);
  if (locked) left.append(h('p', 'bha-eqnote', '모험 중에는 장비를 바꿀 수 없다.'));


  // 끌어다 놓기 (C.149 슬롯 화면과 같은 방식): 카드 → 같은 종류 칸(착용) · 소모품 카드 → 소모품 칸, 칸 → 오른쪽 바둑판(해제)
  type Src = { kind: 'gear' | 'battle' | 'slot' | 'pet'; id: string };
  const wire = (root: HTMLElement) => enableDrag<Src>({
    root,
    scope: hd.scope,
    sourceOf: (n) => {
      if (locked) return null;
      if (n.dataset.drag === 'gear' && n.dataset.item) return { kind: 'gear', id: n.dataset.item };
      if (n.dataset.drag === 'battle' && n.dataset.item) return { kind: 'battle', id: n.dataset.item };
      if (n.dataset.drag === 'pet' && n.dataset.item) return { kind: 'pet', id: n.dataset.item };
      if (n.dataset.drag === 'slot' && n.dataset.slot) {
        const s = n.dataset.slot;
        if (s === 'battle') return save.shared.battleItem ? { kind: 'slot', id: s } : null;
        if (s === 'pet') return save.shared.pets.active ? { kind: 'slot', id: s } : null;
        return g.equipped[s as GearSlot] ? { kind: 'slot', id: s } : null;
      }
      return null;
    },
    targetSelector: '.bha-eqslot[data-slot], .bha-eqright',
    onDrop: (src, target) => {
      const to = target?.dataset.slot;
      let ok = false;
      if (src.kind === 'pet' && to === 'pet') ok = choosePet(save, src.id);
      else if (src.kind === 'gear' && to && to !== 'battle' && to !== 'pet') {
        const it = findGear(g, src.id);
        if (it && GEAR_SLOT_KIND[to as GearSlot] === it.kind) ok = equipGearItem(save, src.id, to as GearSlot) !== null;
      } else if (src.kind === 'battle' && to === 'battle' && battleOpen) ok = setBattleItem(save, src.id);
      else if (src.kind === 'slot' && target?.classList.contains('bha-eqright')) {
        if (src.id === 'battle') ok = setBattleItem(save, null);
        else if (src.id === 'pet') ok = choosePet(save, null);
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
      if (dir > 0) target = i < 4 ? slots[i + 4]! : cards[0] ?? tabs.querySelector<HTMLElement>('[aria-selected="true"]');
      else target = i >= 4 ? slots[i - 4]! : null;
    } else if (cards.includes(cur) || right.contains(cur)) {
      if (dir < 0) {
        const cols = Math.max(1, Math.round(grid.clientWidth / Math.max(1, cards[0]?.offsetWidth ?? 1)));
        const i = cards.indexOf(cur);
        target = i >= 0 && i % cols !== 0 ? cards[i - 1]! : slots[4] ?? null;
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
  return { left, right, foot, restore };
}
