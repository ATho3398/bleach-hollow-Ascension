// 상점 (GDD 25-9, S-16 C.60): 장터 안 상점(C.201, 이름은 종족 설정 market.props.shop). 머리 = 가진 골드·영옥 + [골드]/[영옥] 탭. 줄마다 이름·효과 한 줄·가격·[사기]
// (모자라면 잠김 + "골드 n 부족"). 영옥 품목과 배치 칸만 확인 창 1번, 나머지는 바로 산다. C.140 (GDD 86장 4번): 산 꾸밈·스킨은 보관함에서 착용(여기선 "보유").
// 떠돌이 상인(GDD 85장 5번)은 장터의 따로 된 창(mode 'wanderer', C.201 GDD 127장 2) — 같은 카드 모양, 티어는 숨김(품목 등급만).
// 판정·구매·착용은 src/shop.ts, 화면은 그 결과만 그린다 (종족 분기 없음 — 이름은 종족 설정·데이터).
import { equipInventoryItem, petNoticeOf, unequipInventoryItem } from '../inventory';
import { CATEGORIES, getCosmetic, getGoldItem, cosmeticToken, itemCategoryOf, ITEM_CATEGORY_NAMES, SKIN_SUBTABS, SKIN_SUB_EMPTY, skinListed, skinSubOf, type SkinSubTab, keyringShapeOf, SHOP_PROVISIONAL, type CosmeticCategory, type ItemCategory, type MedicineCure } from '../data/shop';
import { JADE_NAME, TRADE_CURRENCY_NAME } from '../data/economy';
import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { artTierIndexOf } from '../game';
import { buyShopItem, buyWandererItem, goldRows, healDaily, SOLD_OUT_TODAY, jadeRows, wandererRows, type BuyResult, type ShopRow } from '../shop';
import { getWandererItem, WANDERER_PROVISIONAL } from '../data/shop';
import { GEAR_KIND_ICONS } from '../data/gear';
import { provisionalTag } from './bha/dom';
import { h } from './bha/dom';
import { charArt } from '../data/art/manifest';
import { categoryTabs, iconArt, imageArt, itemCard, itemDialog, itemGrid, swatchArt } from './bha/itemUi';
import { deviceCards, deviceEntries } from './bha/deviceCards';
import type { Device } from './bha/device';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { showToast } from './bha/nest';
import { confirmDialog } from './confirmDialog';
import { showGuide, tileDrawCard } from './guideView';
import { markGuideDone } from '../engine/tutorial';
import { shownName } from './displayName';

/** 상점 탭: 아이템 분류 + 약(GDD 102-4: '음식' 옆 칸, 보관함에서는 소모품) + 떠돌이 상인 */
export type ShopTab = ItemCategory | 'medicine' | 'wanderer';
/** 색 견본이 참조하는 토큰 부분 (나머지는 토큰 하나) */
const SWATCH_PART: Partial<Record<CosmeticCategory, string>> = { bar: 'line', shell: 'body', cut: 'line', room: 'line' };
/** 마지막으로 본 탭 (다시 열면 그 탭) */
const shopUi: { tab: ShopTab; skinSub: SkinSubTab } = { tab: 'food', skinSub: 'character' };
/** 쌓아 사는 골드 품목 (수량 고르기): 나머지는 한 번에 하나 */
const STACKABLE = new Set(['food', 'calm', 'wake', 'medicine', 'battle', 'reroll', 'trainingTicket']);
/** 한 번에 살 수 있는 최대 수량 (화면 상한) */
const QTY_CAP = 99;
/** 약 아이콘 (GDD 102-4, 있는 아이콘 재사용): 구급상자 = 회복 · 링거 = 배부름 · 에너지 드링크 = 컨디션 */
const MEDICINE_ICONS: Record<MedicineCure, string> = { collapsed: 'i-heal', weak: 'i-hunger', tired: 'i-cond' };
/** 이 줄이 약 칸인가: 약 3종(GDD 102-4) + 체력 회복 물건 4종(GDD 145장 4 — 하루 판매 수) */
const isMedicine = (id: string): boolean => getGoldItem(id)?.kind === 'medicine' || healDaily(id) !== null;

export interface ShopHandlers {
  /** 구매·착용을 저장한다 */
  persist: () => void;
  /** 착용이 바뀌었을 때 (옛 호출 호환 — C.140 부터 착용은 보관함) */
  onWear?: () => void;
  /** 'wanderer' = 장터의 떠돌이 상인 창 (GDD 127장 2, C.201): 떠돌이 상인 품목만, 탭 없음. 없으면 보통 상점(떠돌이 상인 탭은 장터로 옮겨 없음) */
  mode?: 'wanderer';
}

/** 확인 창 문구 (영옥 품목·덱 칸) */
export function shopConfirmText(row: Pick<ShopRow, 'name' | 'price' | 'currency' | 'effect' | 'category'>): { title: string; body: string } {
  const cur = row.currency === 'gold' ? TRADE_CURRENCY_NAME : JADE_NAME;
  const where = row.category ? CATEGORIES.find((c) => c.id === row.category) : undefined;
  return {
    title: `${row.name} — ${cur} ${row.price}`,
    body: where ? `${where.name} · 보이는 곳: ${where.where}. 산 꾸밈은 두 트랙이 같이 가지고, 입는 것은 트랙마다 따로다.` : `${row.effect}. 되돌릴 수 없다.`,
  };
}

/** 산 뒤 토스트 한 줄 */
export function boughtText(row: Pick<ShopRow, 'name'>, r: BuyResult & { ok: true }): { eyebrow: string; title: string; meta: string } {
  const cur = r.currency === 'gold' ? TRADE_CURRENCY_NAME : JADE_NAME;
  return { eyebrow: `상점 — ${cur} −${r.price}`, title: row.name, meta: r.detail };
}

export function shopView(dev: Device, faction: FactionConfig, save: SaveData, hd: ShopHandlers): void {
  const root = dev.view;
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  let lastScroll = 0;
  const cur = (c: ShopRow['currency']): string => (c === 'gold' ? TRADE_CURRENCY_NAME : JADE_NAME);
  const only = hd.mode === 'wanderer';
  if (only) shopUi.tab = 'wanderer';
  else if (shopUi.tab === 'wanderer') shopUi.tab = 'food';

  /** 한 번 산다 (구매 창 [가격] 버튼). 쌓는 품목은 n 번 되풀이해 막히면 거기까지 */
  const buy = (row: ShopRow, qty: number) => {
    const wanderer = shopUi.tab === 'wanderer';
    const one = () => (wanderer ? buyWandererItem(save, faction, row.id) : buyShopItem(save, faction, row.id));
    const go = () => {
      let bought = 0;
      let spent = 0;
      let last: (BuyResult & { ok: true }) | null = null;
      let fail = '';
      const petLog0 = save.runLog.pets.length;
      for (let i = 0; i < qty; i++) {
        const r = one();
        if (!r.ok) { fail = r.reason; break; }
        bought++;
        spent += r.price;
        last = r;
      }
      if (!last) {
        showToast({ eyebrow: '상점', title: '살 수 없다', meta: fail }, 0, 2600);
        return render();
      }
      hd.persist();
      render();
      // 타일 뽑기 (GDD 64장 2번): 카드 한 장 뒤집기 → 첫 뽑기면 안내 (한 번)
      if (last.id === 'tile-draw' && last.tile) {
        tileDrawCard(faction, last.tile, save.tiles.collection[last.tile] ?? 1, () => {
          if (save.help.guides['tile-draw'] === 'done') return;
          markGuideDone(save.help, 'tile-draw');
          hd.persist();
          showGuide(faction, 'tile-draw');
        });
      } else showToast(bought > 1 ? { eyebrow: `상점 — ${cur(last.currency)} −${spent}`, title: `${row.name} ×${bought}`, meta: fail ? `${bought}개만 샀다: ${fail}` : last.detail } : boughtText(row, last), 0, 2600);
      // 펫 (GDD 90장): 상인 품목으로 얻은 펫은 이름이 보이게 한 줄 더
      save.runLog.pets.slice(petLog0).map((r) => petNoticeOf(r, faction)).forEach((n, i) => n && showToast(n, i + 1, 4200));
    };
    if (row.confirm) {
      const t = shopConfirmText(row);
      confirmDialog({ title: t.title, body: t.body, yes: '사기', no: '아니오', onYes: go });
    } else go();
  };

  /** 이 품목을 최대 몇 개 살 수 있나: 세이브를 복사해 같은 구매 함수를 되풀이해 본다 (상한·돈·보관 가득이 모두 같은 규칙) */
  const maxQty = (row: ShopRow): number => {
    const gold = getGoldItem(row.id);
    if (!gold || !STACKABLE.has(gold.kind) || shopUi.tab === 'wanderer') return 1;
    const sim = structuredClone(save);
    let n = 0;
    while (n < QTY_CAP && buyShopItem(sim, faction, row.id).ok) n++;
    return Math.max(1, n);
  };

  const artOf = (row: ShopRow, big = false): HTMLElement => {
    const cos = getCosmetic(row.id);
    if (cos?.category === 'skin') {
      const src = charArt(faction.id, artTierIndexOf(save), '', base, undefined, undefined, cos.look).src;
      return src ? imageArt(src) : iconArt('i-rare');
    }
    if (cos && cos.category !== 'device') {
      const color = cos.category === 'keyring' ? `var(--bha-cos-keyring-${keyringShapeOf(cos, faction)}-body)` : `var(${cosmeticToken(cos, SWATCH_PART[cos.category] ?? '')})`;
      return swatchArt(cos.category, color, cos.category === 'tint' ? `var(${cosmeticToken(cos)})` : undefined);
    }
    const gold = getGoldItem(row.id);
    // 장비 (GDD 91장): 기본 상점 = 그 종류 아이콘(노말), 떠돌이 상인 = 종류 무작위라 물음표 + 등급 색
    if (gold?.kind === 'gear') return gradeArt(iconArt(GEAR_KIND_ICONS[gold.gearKind!]), 'normal');
    const wi = getWandererItem(row.id);
    if (wi?.kind === 'gear') return gradeArt(iconArt('i-unknown'), wi.grade);
    const ic = !gold ? 'i-rare' : gold.kind === 'food' ? 'i-hunger' : gold.kind === 'calm' ? 'i-risk' : gold.kind === 'wake' ? 'i-cond' : gold.kind === 'medicine' ? MEDICINE_ICONS[gold.cures!] : healDaily(gold.id) !== null ? 'i-heal' : gold.kind === 'tileDraw' || gold.kind === 'rareTile' ? 'i-tile-combo' : gold.kind === 'deckSlot' ? 'i-deck' : gold.kind === 'reroll' ? 'i-swap' : 'i-practice';
    void big;
    return iconArt(ic);
  };

  const openDetail = (row: ShopRow) => {
    const cos = getCosmetic(row.id);
    const price = row.price ?? 0;
    const max = row.canBuy ? maxQty(row) : 1;
    const close = itemDialog({
      heading: '상품 구매',
      name: row.name,
      desc: [row.effect, cos && cos.category !== 'skin' ? `${CATEGORIES.find((c) => c.id === cos.category)?.where ?? ''}`.trim() : ''].filter(Boolean).join(' · ') || (cos?.category === 'skin' ? '입히면 모습이 바뀐다. 사면 카드를 눌러 바로 착용한다.' : ''),
      art: artOf(row, true),
      tag: cos?.category === 'skin' ? '미리보기' : undefined,
      have: row.have ?? (row.owned ? '보유' : undefined),
      qty: { max },
      lock: row.owned ? '이미 가지고 있다' : row.lock,
      actions: [{
        key: 'buy', label: (q) => (row.price === null ? '—' : `${cur(row.currency)} ${price * q}`), disabled: !row.canBuy || row.owned,
        onClick: (q) => { close(); buy(row, q); },
      }],
    });
  };

  /** 장비 그림에 등급 색 클래스 */
  const gradeArt = (a: HTMLElement, grade: string): HTMLElement => {
    a.classList.add(`is-grade-${grade}`);
    return a;
  };

  /** 가진 꾸밈은 상점에서도 바로 착용·해제 (GDD 100장 #64: 기기 탭과 같게 — 보관함까지 갈 필요 없음) */
  const toggleWear = (row: ShopRow) => {
    const on = !row.worn;
    if (!(on ? equipInventoryItem(save, row.id) : unequipInventoryItem(save, row.id))) return;
    hd.persist();
    hd.onWear?.();
    showToast({ eyebrow: '상점', title: `${shownName(row.name)} ${on ? '착용' : '해제'}` }, 0, 1800);
    render();
  };

  const cardOf = (row: ShopRow & { grade?: string }): HTMLElement => {
    const owned = Boolean(row.owned);
    // 보관 가득이면 가격 대신 '가득' (GDD 100장 #63: 가격이 살아 있어 살 수 있는 것처럼 보였다)
    const full = !owned && !row.canBuy && /가득/.test(row.lock ?? '');
    const soldOut = !owned && row.lock === SOLD_OUT_TODAY; // 회복 물건 하루 판매 수 (GDD 145장 4)
    const c = itemCard({
      id: row.id, name: row.name, detail: row.effect || undefined,
      art: artOf(row), badge: owned ? (row.worn ? '착용 중' : '보유') : row.have ?? undefined,
      foot: owned ? (row.worn ? '해제' : '착용') : soldOut ? SOLD_OUT_TODAY : full ? '가득' : row.price === null ? '—' : `${cur(row.currency)} ${row.price}`,
      state: owned ? (row.worn ? 'worn' : 'owned') : row.canBuy ? undefined : 'locked',
      onClick: () => (owned ? toggleWear(row) : openDetail(row)),
    });
    if (row.grade) c.dataset.grade = row.grade;
    if (getGoldItem(row.id)?.kind === 'gear') c.classList.add('is-grade-normal');
    else if (getWandererItem(row.id)?.kind === 'gear') c.classList.add(`is-grade-${row.grade}`);
    return c;
  };

  function render(): void {
    const prev = root.querySelector<HTMLElement>('.bha-shop .bha-itemgrid');
    if (prev) lastScroll = prev.scrollTop;
    const sub = h('span', 'bha-shop__wallet');
    sub.append(`${TRADE_CURRENCY_NAME} `, h('b', 'bha-num', String(save.shared.tradeCoins)), ` · ${JADE_NAME} `, h('b', 'bha-num', String(save.shared.jade)));
    sub.dataset.gold = String(save.shared.tradeCoins);
    sub.dataset.jade = String(save.shared.jade);
    if (SHOP_PROVISIONAL) sub.append(' ', provisionalTag('임시 가격'));
    const rows: (ShopRow & { grade?: string })[] = shopUi.tab === 'wanderer'
      ? wandererRows(save, faction)
      : shopUi.tab === 'medicine'
        ? goldRows(save, faction).filter((r) => isMedicine(r.id))
        : [...goldRows(save, faction), ...jadeRows(save, faction)].filter((r) => (itemCategoryOf(r.id) ?? 'etc') === shopUi.tab && !isMedicine(r.id));
    const cats = (['food', 'medicine', 'consumable', 'equipment', 'skin', 'tile', 'etc'] as const).map((id) => ({
      id, label: id === 'medicine' ? '약' : ITEM_CATEGORY_NAMES[id],
    }));
    const tabs = categoryTabs(cats, shopUi.tab, (id) => {
      shopUi.tab = id as ShopTab;
      lastScroll = 0;
      render();
    }, '상품 분류');
    // 스킨 탭 하위 탭 (C.153, GDD 95장 A3): 캐릭터 · 공격 이펙트 · 이동 이펙트 · 키링 · 기기 · 연출·꾸밈
    // 옛 기기 껍데기 색·견본·시험 기기는 빼고(GDD 99장 3), '기기' 하위 탭은 기본 + 가진 정식 기기 카드(누르면 장착)
    const skinRows = shopUi.tab === 'skin' ? rows.filter((r) => { const c = getCosmetic(r.id); return !c || skinListed(c); }) : [];
    const devices = shopUi.tab === 'skin' && shopUi.skinSub === 'device' ? deviceCards(save, faction, () => { hd.persist(); hd.onWear?.(); render(); }) : null;
    const subTabs = shopUi.tab === 'skin'
      // 숫자 = 지금 살 수 있는 수 '판매 n' (기기 탭은 가진 기기 '보유 n') — 보관함은 '보유 n' (GDD 100장 #65)
      ? categoryTabs(SKIN_SUBTABS.map(([id, label]) => ({ id, label, count: id === 'device' ? `보유 ${deviceEntries(save, faction).length}` : `판매 ${skinRows.filter((r) => skinSubOf(r.category) === id && !r.owned).length}` })), shopUi.skinSub, (id) => {
        shopUi.skinSub = id as SkinSubTab;
        lastScroll = 0;
        render();
      }, '스킨 종류', true)
      : null;
    const shown = shopUi.tab === 'skin' ? skinRows.filter((r) => skinSubOf(r.category) === shopUi.skinSub) : rows;
    const empty = shopUi.tab === 'equipment' ? '지금 파는 장비가 없다.' : shopUi.tab === 'wanderer' ? (save.shared.wanderer.visit ? '오늘은 더 살 것이 없다.' : '떠돌이 상인이 떠났다.') : shopUi.tab === 'skin' ? SKIN_SUB_EMPTY : '지금 파는 물건이 없다.';
    const grid = itemGrid(devices ?? shown.map(cardOf), empty);
    const note = shopUi.tab === 'wanderer'
      ? [h('p', 'bha-small', '특별한 물건은 떠돌이 상인만 판다. 칸마다 하나씩, 다음 원정에서 돌아오면 떠난다.'), ...(WANDERER_PROVISIONAL ? [provisionalTag('임시 품목')] : [])]
      : [];
    const page = lcdPage(root, { cls: 'bha-shop bha-shop--cards', cols: 'minmax(0, 1fr)' }, lcdHead({ title: only ? '떠돌이 상인' : '상점', sub }), [...(only ? [] : [tabs]), ...(subTabs ? [subTabs] : []), ...note, grid], []);
    page.app.dataset.tab = shopUi.tab;
    grid.scrollTop = lastScroll;
  }
  render();
}
