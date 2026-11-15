// 가방 > 스킨 > 캐릭터 (GDD 5절 '캐릭터 스킨 분류' v6.044, C.440): 대분류 [진화체][특수][한정] → 중분류 → 카드 격자(스킨 하나당 한 칸).
// 카드를 누르면 상세 창 = 큰 미리보기 + 색 칩(속성 색·성별) + [장착]/[해제]. 캐릭터 스킨은 여기서만 바꾼다(상태 화면 목록 삭제 — 테스트 패널은 그대로).
// 분류·중분류 이름은 데이터(스킨 cls·종족 설정 skinGroups/단계 이름)에서 — 종족 분기 없음.
import { charArt } from '../../data/art/manifest';
import { characterSkinEntries, LIMITED_SUB_NAMES, SKIN_CLASS_NAMES, skinSubGroups, type SkinEntry, type SkinVariant } from '../../data/skins/lookOptions';
import { SKIN_CLASSES, type SkinClass } from '../../data/skins';
import { elementName } from '../../data/elements';
import { SKIN_SUB_EMPTY } from '../../data/shop';
import { artTierIndexOf, equipSkin, type SaveData } from '../../game';
import type { FactionConfig } from '../../engine/faction';
import { categoryTabs, iconArt, imageArt, itemCard, itemDialog, itemGrid } from './itemUi';
import { elementDot } from './element';
import { el } from './dom';

/** 고른 대분류·중분류 (화면을 다시 그려도 유지) */
export const skinPickUi: { cls: SkinClass; sub: Partial<Record<SkinClass, string>> } = { cls: 'form', sub: {} };

const base = (): string => (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 외형 id 의 미리보기 그림 */
function previewSrc(faction: FactionConfig, save: SaveData, lookId: string): string | null {
  return charArt(faction.id, artTierIndexOf(save), '', base(), undefined, undefined, lookId).src;
}

/** 칩 글자: 속성 색이면 속성 이름, 성별이면 남/여, 하나뿐이면 '기본' */
export function variantLabel(v: SkinVariant, factionId: string): string {
  if (v.element) return elementName(v.element, factionId);
  if (v.gender) return v.gender === 'female' ? '여' : '남';
  return '기본';
}

/** 지금 입은 칸 (없으면 -1) */
const wornIndex = (e: SkinEntry, save: SaveData): number => e.variants.findIndex((v) => v.id === save.skin);

/** 상세 창: 큰 미리보기 + 색 칩 + [장착]/[해제] */
export function openSkinDetail(faction: FactionConfig, save: SaveData, e: SkinEntry, test: boolean, changed: () => void): void {
  let pick = Math.max(0, wornIndex(e, save));
  const art = imageArt(previewSrc(faction, save, e.variants[pick]!.id) ?? '');
  const chips = el('div', 'bha-row bha-skinpick__chips');
  chips.setAttribute('role', 'radiogroup');
  chips.setAttribute('aria-label', '색');
  const note = el('p', 'bha-faint bha-skinpick__note');
  const sync = () => {
    const v = e.variants[pick]!;
    const src = previewSrc(faction, save, v.id);
    if (src) art.setAttribute('src', src);
    const modal = art.closest('.bha-itemmodal');
    if (src) modal?.querySelector<HTMLImageElement>('.bha-itemmodal__icon img')?.setAttribute('src', src);
    chips.querySelectorAll<HTMLButtonElement>('.bha-skinpick__chip').forEach((b, i) => {
      b.classList.toggle('is-on', i === pick);
      b.setAttribute('aria-checked', String(i === pick));
    });
    const on = save.skin === v.id;
    const act = modal?.querySelector<HTMLButtonElement>('[data-act="skin-equip"]');
    if (act) act.textContent = on ? '해제' : '장착';
    note.textContent = on ? '지금 입고 있다.' : e.variants.findIndex((x) => x.id === save.skin) >= 0 ? `지금은 ${variantLabel(e.variants[wornIndex(e, save)]!, faction.id)}을(를) 입고 있다.` : '';
  };
  e.variants.forEach((v, i) => {
    const b = el('button', 'bha-chip bha-skinpick__chip');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.look = v.id;
    if (v.element) b.append(elementDot(v.element, faction.id));
    b.append(variantLabel(v, faction.id));
    b.onclick = () => { pick = i; sync(); };
    chips.append(b);
  });
  const content: Node[] = [];
  if (e.variants.length > 1) content.push(el('b', 'bha-small', e.variants.every((v) => v.gender) ? '모습 고르기' : '색 고르기'), chips);
  if (e.waiting) content.push(el('p', 'bha-faint', '그림 대기 — 지금은 자리 표시 모습이다. 그림이 오면 바뀐다.'));
  content.push(note, el('p', 'bha-faint', '입으면 단계와 상관없이 방·모험·전투 모두 스킨 그림으로 바뀐다. 능력치는 그대로.'));
  const close = itemDialog({
    id: `skin:${e.key}`, heading: '캐릭터 스킨', name: e.name, desc: '', art, hero: true, content,
    actions: [{
      key: 'skin-equip', label: () => (save.skin === e.variants[pick]!.id ? '해제' : '장착'),
      onClick: () => {
        const id = e.variants[pick]!.id;
        if (!equipSkin(save, save.skin === id ? null : id, { test })) return;
        close();
        changed();
      },
    }],
  });
  sync();
}

/** 캐릭터 하위 탭 내용: 대분류 탭 · 중분류 탭 · 카드 격자 */
export function characterSkinTab(faction: FactionConfig, save: SaveData, test: boolean, changed: () => void): HTMLElement[] {
  const entries = characterSkinEntries(faction.id, { test, owned: save.shared.cosmetics, dex: save.transcendentDex.map((x) => x.id) });
  const cls = skinPickUi.cls;
  const clsTabs = categoryTabs(SKIN_CLASSES.map((c) => ({ id: c, label: SKIN_CLASS_NAMES[c], count: entries.filter((x) => x.cls === c).length })), cls, (id) => { skinPickUi.cls = id as SkinClass; changed(); }, '스킨 분류', true);
  clsTabs.classList.add('bha-skinpick__cls');
  // 대분류·중분류 탭을 한 줄에 (가로 844 에서 카드 격자 두 줄이 보이게) — 넘치면 중분류 줄만 가로로 민다
  const bar = el('div', 'bha-row bha-skinpick__bar');
  bar.append(clsTabs);
  const out: HTMLElement[] = [bar];
  const subs = skinSubGroups(faction.id, cls);
  let rows = entries.filter((x) => x.cls === cls);
  if (subs.length > 0) {
    const cur = subs.some((s) => s.id === skinPickUi.sub[cls]) ? skinPickUi.sub[cls]! : subs[0]!.id;
    const subTabs = categoryTabs(subs.map((s) => ({ id: s.id, label: cls === 'limited' ? LIMITED_SUB_NAMES[s.id as keyof typeof LIMITED_SUB_NAMES] : s.name, count: rows.filter((x) => x.sub === s.id).length })), cur, (id) => { skinPickUi.sub[cls] = id; changed(); }, '스킨 중분류', true);
    subTabs.classList.add('bha-skinpick__sub');
    bar.append(subTabs);
    rows = rows.filter((x) => x.sub === cur);
  }
  const cards = rows.map((e) => {
    const w = wornIndex(e, save);
    const v = e.variants[Math.max(0, w)]!;
    const src = previewSrc(faction, save, v.id);
    return itemCard({
      id: e.key, name: e.name, art: src ? imageArt(src) : iconArt('i-rare'),
      detail: e.waiting ? '그림 대기' : e.variants.length < 2 ? '' : e.variants.every((v) => v.gender) ? '남·여' : `색 ${e.variants.length}`,
      badge: w >= 0 ? '착용 중' : undefined, state: w >= 0 ? 'worn' : undefined,
      foot: w >= 0 ? (e.variants.length > 1 ? '색·해제' : '해제') : '장착',
      onClick: () => openSkinDetail(faction, save, e, test, changed),
    });
  });
  out.push(itemGrid(cards, SKIN_SUB_EMPTY));
  return out;
}
