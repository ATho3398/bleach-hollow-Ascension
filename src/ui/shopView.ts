// 상점 (GDD 25-9, S-16 C.60): 독 [더보기] → [상점]. 머리 = 가진 골드·영옥 + [골드]/[영옥] 탭. 줄마다 이름·효과 한 줄·가격·[사기]
// (모자라면 잠김 + "골드 n 부족"). 영옥 품목과 덱 칸만 확인 창 1번, 나머지는 바로 산다. 꾸밈은 산 뒤 그 줄에서 [착용]/[해제].
// 판정·구매·착용은 src/shop.ts, 화면은 그 결과만 그린다 (종족 분기 없음 — 이름은 종족 설정·데이터).
import { CATEGORIES, cosmeticName, getCosmetic, cosmeticToken, keyringShapeOf, SHOP_PROVISIONAL, type CosmeticCategory } from '../data/shop';
import { JADE_NAME, TRADE_CURRENCY_NAME } from '../data/economy';
import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { buyShopItem, goldRows, jadeRows, unwearCategory, wearCosmetic, type BuyResult, type ShopRow } from '../shop';
import { button, h, provisionalTag, seg } from './bha/dom';
import type { Device } from './bha/device';
import { lcdHead, lcdPage, selectLast } from './bha/lcdpage';
import { showToast } from './bha/nest';
import { confirmDialog } from './confirmDialog';

export type ShopTab = 'gold' | 'jade';
/** 색 견본이 참조하는 토큰 부분 (나머지는 토큰 하나) */
const SWATCH_PART: Partial<Record<CosmeticCategory, string>> = { bar: 'line', shell: 'body', cut: 'line', room: 'line' };
/** 영옥 탭 왼쪽 열 = 캐릭터·연출, 오른쪽 열 = 화면·방·말풍선·액자 (GDD 25-11) */
const LEFT_CATEGORIES: readonly CosmeticCategory[] = ['skin', 'aura', 'tint', 'trail', 'enter', 'evo', 'absorb', 'win'];
/** 마지막으로 본 탭 (다시 열면 그 탭) */
const shopUi: { tab: ShopTab } = { tab: 'gold' };

export interface ShopHandlers {
  /** 구매·착용을 저장한다 */
  persist: () => void;
  /** 착용이 바뀌었을 때 (기기 껍데기 등 화면 전체 꾸밈을 바로 다시 건다) */
  onWear: () => void;
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
  let lastScroll: [number, number] = [0, 0];

  const buy = (row: ShopRow) => {
    const go = () => {
      const r = buyShopItem(save, faction, row.id);
      if (!r.ok) {
        showToast({ eyebrow: '상점', title: '살 수 없다', meta: r.reason }, 0, 2600);
        return render();
      }
      hd.persist();
      showToast(boughtText(row, r), 0, 2600);
      render();
    };
    if (row.confirm) {
      const t = shopConfirmText(row);
      confirmDialog({ title: t.title, body: t.body, yes: '사기', no: '아니오', onYes: go });
    } else go();
  };

  const wear = (row: ShopRow, on: boolean) => {
    if (on) wearCosmetic(save, row.id);
    else unwearCategory(save, row.category!);
    hd.persist();
    hd.onWear();
    render();
  };

  const rowEl = (row: ShopRow): HTMLElement => {
    const box = h('div', `bha-shoprow${row.canBuy ? '' : row.owned ? ' is-owned' : ' is-locked'}${row.worn ? ' is-worn' : ''}`);
    box.dataset.item = row.id;
    const main = h('div', 'bha-shoprow__main');
    const name = h('b', 'bha-shoprow__name');
    const cos = getCosmetic(row.id);
    if (cos && cos.category !== 'skin' && cos.category !== 'device') {
      // 색 견본: 그 꾸밈의 토큰을 참조만 한다 (키링은 종족 설정의 모양 색)
      const sw = h('i', `bha-shoprow__swatch bha-shoprow__swatch--${cos.category}`);
      sw.style.setProperty('--sw', cos.category === 'keyring' ? `var(--bha-cos-keyring-${keyringShapeOf(cos, faction)}-body)` : `var(${cosmeticToken(cos, SWATCH_PART[cos.category] ?? '')})`);
      if (cos.category === 'tint') sw.style.setProperty('--sw-filter', `var(${cosmeticToken(cos)})`);
      name.append(sw);
    }
    name.append(row.name);
    main.append(name);
    if (row.effect) main.append(h('small', 'bha-shoprow__effect', row.effect));
    if (row.have) main.append(h('small', 'bha-shoprow__have', row.worn ? `${row.have} · 착용 중` : row.have));
    const act = h('div', 'bha-shoprow__act');
    if (row.owned) {
      act.append(row.worn
        ? button({ label: '해제', size: 'small', variant: 'ghost', onClick: () => wear(row, false) })
        : button({ label: '착용', size: 'small', variant: 'primary', onClick: () => wear(row, true) }));
    } else {
      const cur = row.currency === 'gold' ? TRADE_CURRENCY_NAME : JADE_NAME;
      act.append(h('span', 'bha-shoprow__price', row.price === null ? '—' : `${cur} ${row.price}`));
      const b = button({ label: '사기', size: 'small', variant: row.canBuy ? 'primary' : undefined, disabled: !row.canBuy, icon: row.canBuy ? undefined : 'i-lock', onClick: () => buy(row) });
      b.dataset.buy = row.id;
      act.append(b);
      if (row.lock) act.append(h('small', 'bha-shoprow__lock', row.lock));
    }
    box.append(main, act);
    return box;
  };

  function render(): void {
    const prev = root.querySelectorAll<HTMLElement>('.bha-shop .bha-lcdpage__col');
    if (prev.length === 2) lastScroll = [prev[0]!.scrollTop, prev[1]!.scrollTop];
    const sub = h('span', 'bha-shop__wallet');
    sub.append(`${TRADE_CURRENCY_NAME} `, h('b', 'bha-num', String(save.shared.tradeCoins)), ` · ${JADE_NAME} `, h('b', 'bha-num', String(save.shared.jade)));
    sub.dataset.gold = String(save.shared.tradeCoins);
    sub.dataset.jade = String(save.shared.jade);
    if (SHOP_PROVISIONAL) sub.append(' ', provisionalTag('임시 가격'));
    const tabs = seg([{ id: 'gold', label: TRADE_CURRENCY_NAME }, { id: 'jade', label: JADE_NAME }], shopUi.tab, (id) => {
      shopUi.tab = id as ShopTab;
      lastScroll = [0, 0];
      render();
    }, { small: true });
    let left: HTMLElement[] = [];
    let right: HTMLElement[] = [];
    if (shopUi.tab === 'gold') {
      const rows = goldRows(save, faction).map(rowEl);
      // 먹이 5종은 왼쪽, 나머지(소모품·편의)는 오른쪽
      left = rows.slice(0, 5);
      right = rows.slice(5);
    } else {
      const rows = jadeRows(save, faction);
      const groups: HTMLElement[] = [];
      for (const cat of CATEGORIES) {
        const list = rows.filter((r) => r.category === cat.id);
        if (list.length === 0) continue;
        const wornAny = list.some((r) => r.worn);
        const g = h('section', 'bha-shopgroup');
        g.dataset.category = cat.id;
        const head = h('header', 'bha-shopgroup__head');
        head.append(h('h3', 'bha-shopgroup__title', cat.name), h('small', 'bha-faint', wornAny ? '착용 중 · [해제]로 기본' : '기본'));
        g.append(head, ...list.map(rowEl));
        groups.push(g);
      }
      if (!rows.some((r) => r.category === ('skin' as CosmeticCategory))) {
        const g = h('section', 'bha-shopgroup');
        const head = h('header', 'bha-shopgroup__head');
        head.append(h('h3', 'bha-shopgroup__title', '스킨'));
        g.append(head, h('p', 'bha-faint', `${faction.name}이(가) 입을 수 있는 스킨은 아직 없다.`));
        groups.unshift(g);
      }
      left = groups.filter((g) => LEFT_CATEGORIES.includes(g.dataset.category as CosmeticCategory) || g.dataset.category === undefined);
      right = groups.filter((g) => !left.includes(g));
    }
    const page = lcdPage(root, { cls: 'bha-shop', cols: 'minmax(0, 1fr) minmax(0, 1fr)' }, lcdHead({ title: '상점', sub, aside: [selectLast(tabs)] }), left, right);
    page.app.dataset.tab = shopUi.tab;
    page.left.scrollTop = lastScroll[0];
    page.right.scrollTop = lastScroll[1];
  }
  render();
}
