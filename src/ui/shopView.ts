// 상점 (GDD 25-9, S-16 C.60): 방 물건 상점(C.63, 이름은 종족 설정 room.props.shop). 머리 = 가진 골드·영옥 + [골드]/[영옥] 탭. 줄마다 이름·효과 한 줄·가격·[사기]
// (모자라면 잠김 + "골드 n 부족"). 영옥 품목과 배치 칸만 확인 창 1번, 나머지는 바로 산다. C.140 (GDD 86장 4번): 산 꾸밈·스킨은 보관함에서 착용(여기선 "보유").
// 떠돌이 상인(GDD 85장 5번)이 와 있으면 제목 토글에 [떠돌이 상인] — 같은 줄 모양, 티어는 숨김(품목 등급만).
// 판정·구매·착용은 src/shop.ts, 화면은 그 결과만 그린다 (종족 분기 없음 — 이름은 종족 설정·데이터).
import { petNoticeOf } from '../inventory';
import { CATEGORIES, getCosmetic, getGoldItem, cosmeticToken, itemCategoryOf, ITEM_CATEGORY_NAMES, keyringShapeOf, SHOP_PROVISIONAL, type CosmeticCategory, type ItemCategory } from '../data/shop';
import { JADE_NAME, TRADE_CURRENCY_NAME } from '../data/economy';
import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { buyShopItem, buyWandererItem, goldRows, jadeRows, wandererRows, type BuyResult, type ShopRow } from '../shop';
import { getWandererItem, WANDERER_PROVISIONAL } from '../data/shop';
import { GEAR_KIND_ICONS } from '../data/gear';
import { provisionalTag } from './bha/dom';
import { h } from './bha/dom';
import { charArt } from '../data/art/manifest';
import { categoryTabs, iconArt, imageArt, itemCard, itemDialog, itemGrid, swatchArt } from './bha/itemUi';
import type { Device } from './bha/device';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { showToast } from './bha/nest';
import { confirmDialog } from './confirmDialog';
import { showGuide, tileDrawCard } from './guideView';
import { markGuideDone } from '../engine/tutorial';

export type ShopTab = ItemCategory | 'wanderer';
/** 색 견본이 참조하는 토큰 부분 (나머지는 토큰 하나) */
const SWATCH_PART: Partial<Record<CosmeticCategory, string>> = { bar: 'line', shell: 'body', cut: 'line', room: 'line' };
/** 마지막으로 본 탭 (다시 열면 그 탭) */
const shopUi: { tab: ShopTab } = { tab: 'food' };
/** 쌓아 사는 골드 품목 (수량 고르기): 나머지는 한 번에 하나 */
const STACKABLE = new Set(['food', 'calm', 'wake', 'reroll', 'trainingTicket']);
/** 한 번에 살 수 있는 최대 수량 (화면 상한) */
const QTY_CAP = 99;

export interface ShopHandlers {
  /** 구매·착용을 저장한다 */
  persist: () => void;
  /** 착용이 바뀌었을 때 (옛 호출 호환 — C.140 부터 착용은 보관함) */
  onWear?: () => void;
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
      const src = charArt(faction.id, save.evolution.tierIndex, '', base, undefined, undefined, cos.look).src;
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
    const ic = !gold ? 'i-rare' : gold.kind === 'food' ? 'i-hunger' : gold.kind === 'calm' ? 'i-risk' : gold.kind === 'wake' ? 'i-cond' : gold.kind === 'tileDraw' || gold.kind === 'rareTile' ? 'i-tile-combo' : gold.kind === 'deckSlot' ? 'i-deck' : gold.kind === 'reroll' ? 'i-swap' : 'i-practice';
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
      desc: [row.effect, cos && cos.category !== 'skin' ? `${CATEGORIES.find((c) => c.id === cos.category)?.where ?? ''}`.trim() : ''].filter(Boolean).join(' · ') || (cos?.category === 'skin' ? '입히면 모습이 바뀐다. 사면 보관함에서 장착한다.' : ''),
      art: artOf(row, true),
      tag: cos?.category === 'skin' ? '미리보기' : undefined,
      have: row.have ?? (row.owned ? '보유' : undefined),
      qty: { max },
      lock: row.owned ? '이미 가지고 있다 — 보관함에서 장착한다' : row.lock,
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

  const cardOf = (row: ShopRow & { grade?: string }): HTMLElement => {
    const owned = Boolean(row.owned);
    const c = itemCard({
      id: row.id, name: row.name, detail: row.effect || (owned ? '보관함에서 착용' : undefined),
      art: artOf(row), badge: owned ? '보유' : row.have ?? undefined,
      foot: owned ? '보관함에서 착용' : row.price === null ? '—' : `${cur(row.currency)} ${row.price}`,
      state: owned ? 'owned' : row.canBuy ? undefined : 'locked',
      onClick: () => openDetail(row),
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
    const hasWanderer = save.shared.wanderer.visit !== null;
    if (shopUi.tab === 'wanderer' && !hasWanderer) shopUi.tab = 'food';
    const rows: (ShopRow & { grade?: string })[] = shopUi.tab === 'wanderer'
      ? wandererRows(save, faction)
      : [...goldRows(save, faction), ...jadeRows(save, faction)].filter((r) => (itemCategoryOf(r.id) ?? 'etc') === shopUi.tab);
    const cats = (['food', 'consumable', 'equipment', 'skin', 'tile', 'etc'] as const).map((id) => ({
      id, label: ITEM_CATEGORY_NAMES[id],
    }));
    const tabs = categoryTabs([...cats, ...(hasWanderer ? [{ id: 'wanderer', label: '떠돌이 상인' }] : [])], shopUi.tab, (id) => {
      shopUi.tab = id as ShopTab;
      lastScroll = 0;
      render();
    }, '상품 분류');
    const empty = shopUi.tab === 'equipment' ? '지금 파는 장비가 없다.' : shopUi.tab === 'wanderer' ? '오늘은 더 살 것이 없다.' : shopUi.tab === 'skin' && rows.length === 0 ? `${faction.name}이(가) 입을 수 있는 스킨은 아직 없다.` : '지금 파는 물건이 없다.';
    const grid = itemGrid(rows.map(cardOf), empty);
    const note = shopUi.tab === 'wanderer'
      ? [h('p', 'bha-small', '특별한 물건은 떠돌이 상인만 판다. 칸마다 하나씩, 다음 원정에서 돌아오면 떠난다.'), ...(WANDERER_PROVISIONAL ? [provisionalTag('임시 품목')] : [])]
      : [];
    const page = lcdPage(root, { cls: 'bha-shop bha-shop--cards', cols: 'minmax(0, 1fr)' }, lcdHead({ title: '상점', sub }), [tabs, ...note, grid], []);
    page.app.dataset.tab = shopUi.tab;
    grid.scrollTop = lastScroll;
  }
  render();
}
