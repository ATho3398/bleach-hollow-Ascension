// 적 도감 화면 (GDD 200장, C.330 → 220장 1·2): 책장 묶음(진화체 도감·칭호 도감 ▾)의 세 번째 도감. 틀은 진화체 도감과 같다 — 바둑판 카드(그림·이름·속성) + 누르면 상세 창, 위 '발견 n / 전체'·정렬 버튼.
// 카드 = 일반(속성 8 × 짐승형·부유형·갑각형) · 강적 24 · 보스 3(탑 층 보스도 같은 보스라 같은 칸). 만나기 전 = 그림 실루엣 + '???'(속성·등급 숨김),
// 만난 뒤 = 그림 · 이름 · 속성 · 강적·보스 등급(198장 grade — 여기서만 보인다) · 잡은 수 'n마리' · 흡수 종류별 횟수(200장 9, 0도 자리 고정) · 처음 만난 곳 한 줄. 처음 만난 카드는 '새' 점 하나(알림 없음), 상세를 보면 지운다.
// 종족 분기 없음: 이름·속성 이름·사냥터/탑 이름은 종족 설정·데이터에서 읽는다. 기기 ▲▼ = 카드 이동, ✓ = 상세 창, ◀ = 창 닫기(공용 창 레이어).
import { ELEMENT_IDS } from '../data/elements';
import { enemyGradeName } from '../data/enemies';
import { ENEMY_DEX_SORTS, newDexSortState, nextDexSort, sortDex, type DexSortFacts } from '../engine/dexSort';
import { GROUNDS } from '../data/grounds';
import { pickFaction } from '../data/schema';
import { groundName, towerLabels, type FactionConfig } from '../engine/faction';
import { ABSORB_KINDS, emptyAbsorbs, ENEMY_CARD_KINDS, ENEMY_CARDS, enemyDexCounts, enemyKnown, markEnemyCardSeen, parseWhere, type EnemyCard, type EnemyCardKind, type EnemyDex, type EnemyDexEntry } from '../engine/enemyDex';
import type { SaveData } from '../game';
import { foeArtOf } from './bha/battle';
import { h, icon } from './bha/dom';
import { elementMark, paintElement } from './bha/element';
import { lcdHead, lcdPage, selectLast } from './bha/lcdpage';
import { dexCaption, dexCard, dexGrid, dexSortButton } from './bha/dexGrid';
import { itemDialog } from './bha/itemUi';
import { logoMark } from './bha/logo';
import { shownName } from './displayName';

/** 종류 이름 (적 테이블의 등급 — 종족 무관 용어) */
export const ENEMY_KIND_LABEL: Record<EnemyCardKind, string> = { normal: '일반', elite: '강적', boss: '보스' };

/** 잡은 수 글자 */
export const killsText = (kills: number): string => `${kills}마리`;

/** 흡수 종류별 횟수 한 줄 (200장 9): 종족 설정 absorbModeNames 이름 그대로, 0인 갈래도 자리 고정 — '포식 2 · 속성 포식 0 · 능력치 포식 1 · 놓아주기 0' */
export function absorbsText(faction: Pick<FactionConfig, 'absorbModeNames'>, entry: Pick<EnemyDexEntry, 'absorbs'>): string {
  const ab = entry.absorbs ?? emptyAbsorbs();
  return ABSORB_KINDS.map((k) => `${faction.absorbModeNames[k]} ${ab[k] ?? 0}`).join(' · ');
}

/** 흡수 줄 칸 (C.332): 네 갈래를 2칸 × 2줄 격자로 고정 — 칸마다 이름 왼쪽·숫자 오른쪽, 한 칸은 쪼개지지 않는다(0 칸도 자리 고정, 200장 9).
 *  글자 내용은 absorbsText 와 같다(칸 사이에 ' · ' 대신 격자 간격) */
function absorbsGrid(faction: Pick<FactionConfig, 'absorbModeNames'>, entry: Pick<EnemyDexEntry, 'absorbs'>): HTMLElement {
  const ab = entry.absorbs ?? emptyAbsorbs();
  const grid = h('span', 'bha-edex__absorbs');
  grid.setAttribute('aria-label', absorbsText(faction, entry));
  for (const k of ABSORB_KINDS) {
    const cell = h('span', 'bha-edex__ab');
    cell.dataset.kind = k;
    cell.append(h('span', 'bha-edex__ab-name', faction.absorbModeNames[k]), h('b', 'bha-edex__ab-num', String(ab[k] ?? 0)));
    grid.append(cell);
  }
  return grid;
}

/** 처음 만난 곳 한 줄: 사냥터 이름·탑 이름은 종족 설정. 모르면 '기록 없음'(런 로그에서 채운 옛 기록) */
export function whereText(faction: FactionConfig, where: string | null | undefined): string {
  const w = parseWhere(where);
  if (!w) return '기록 없음';
  if (w.kind === 'tower') return towerLabels(faction).name;
  return groundName(faction, w.id, Math.max(0, GROUNDS.findIndex((g) => g.id === w.id)));
}

/** 그림 칸: 파일(`enemy-<적id>.png`, GDD 17-6 자동 인식)이 있으면 그 그림, 없으면 아이콘(미발견 ? / 만난 뒤 강적 소굴 마크 — 보스 그림은 아직 없다). 미발견은 실루엣(.is-silhouette) */
function enemyArtBox(enemyId: string, known: boolean, cls: string): HTMLElement {
  const box = h('span', `bha-art bha-art--frame bha-edex__art ${cls}${known ? '' : ' is-silhouette'}`);
  const art = foeArtOf(enemyId);
  if (art?.src) {
    const img = h('img', 'bha-art-img bha-edex__img') as HTMLImageElement;
    img.src = art.src;
    img.alt = '';
    img.draggable = false;
    if (art.scale !== 1) img.style.setProperty('--art-scale', String(art.scale)); // 종이인형 정지 그림(칸이 넓음)은 배율로 지금 적 그림 크기에 맞춤 (GDD 115-A 85)
    box.append(img);
  } else box.append(icon(known ? 'i-tile-elite' : 'i-unknown'));
  return box;
}

/** 카드 머리 칩: 종류, 강적·보스는 등급(198장 — 도감에서만) */
function cardChips(card: EnemyCard): HTMLElement[] {
  const out = [h('span', 'bha-chip', ENEMY_KIND_LABEL[card.kind])];
  const grade = card.kind === 'normal' ? null : enemyGradeName(card.def);
  if (grade) out.push(h('span', 'bha-chip bha-chip--good', grade));
  return out;
}

/** 상세 창 본문 (예전 오른쪽 상세 칸 내용 전부): 종류·등급 칩 · 속성 · 잡은 수 · 흡수 종류별 횟수 · 처음 만난 곳 */
function cardDetail(faction: FactionConfig, card: EnemyCard, entry: EnemyDexEntry): Node[] {
  // 머리 줄(C.332): 칩 묶음은 한 덩어리 — 이름은 창 머리에 있다
  const chips = h('span', 'bha-edex__chips');
  chips.append(...cardChips(card));
  const id = h('div', 'bha-edex__id');
  id.append(chips);
  const body = h('p', 'bha-mddetail__body bha-edex__body');
  const line = (label: string, value: Node | string) => {
    const row = h('span', 'bha-edex__line');
    row.append(h('span', 'bha-edex__label', label), typeof value === 'string' ? h('b', 'bha-edex__value', value) : value);
    return row;
  };
  body.append(line('속성', elementMark(card.def.element, faction.id)), line('잡은 수', killsText(entry.kills)), line('흡수', absorbsGrid(faction, entry)), line('처음 만난 곳', whereText(faction, entry.where)));
  return [id, body];
}

function cardOf(faction: FactionConfig, card: EnemyCard, dex: EnemyDex, persist: (() => void) | undefined): HTMLElement {
  const entry = dex[card.id];
  const kindName = ENEMY_KIND_LABEL[card.kind];
  if (!entry || !enemyKnown(dex, card.id)) {
    return dexCard({
      name: '???', unknown: true, art: enemyArtBox(card.id, false, 'bha-edex__art--card'), marks: null,
      onOpen: () => itemDialog({ heading: kindName, name: '미발견', desc: '만난 적만 보인다.', art: enemyArtBox(card.id, false, 'bha-edex__art--hero'), hero: true, cls: 'bha-dexmodal', actions: [] }),
    });
  }
  const name = shownName(pickFaction(card.def.name, faction.id));
  const newDot = entry.fresh ? h('i', 'bha-edex__new bha-dexcard__new') : null;
  if (newDot) newDot.setAttribute('aria-label', '새');
  return dexCard({
    name, unknown: false, art: enemyArtBox(card.id, true, 'bha-edex__art--card'), marks: elementMark(card.def.element, faction.id),
    dot: newDot, cls: `bha-edex__row--${card.kind}`,
    paint: (node) => paintElement(node, card.def.element),
    onOpen: () => {
      // 상세를 보면 '새' 점을 지운다 (GDD 200장 7)
      if (markEnemyCardSeen(dex, card.id)) {
        newDot?.remove();
        persist?.();
      }
      itemDialog({ heading: kindName, name, desc: '', content: cardDetail(faction, card, entry), art: enemyArtBox(card.id, true, 'bha-edex__art--hero'), hero: true, cls: 'bha-dexmodal bha-edex', actions: [] });
    },
  });
}

/** 적 도감 (220장 1·2): 바둑판 + 정렬 버튼. 기본 정렬은 일반 → 강적 → 보스 + 종류 머리줄(발견 n/전체) */
export function enemyDexView(root: HTMLElement, faction: FactionConfig, save: SaveData, title: string | Node = '적 도감', persist?: () => void): void {
  const dex = (save.enemyDex ??= {});
  const counts = enemyDexCounts(dex);
  const sortState = (save.dexSort ??= newDexSortState());
  const cards = ENEMY_CARD_KINDS.flatMap((kind) => ENEMY_CARDS.filter((c) => c.kind === kind));
  const facts = (c: EnemyCard): DexSortFacts => ({
    known: enemyKnown(dex, c.id), name: pickFaction(c.def.name, faction.id), element: ELEMENT_IDS.indexOf(c.def.element),
    kind: ENEMY_CARD_KINDS.indexOf(c.kind), kills: dex[c.id]?.kills ?? 0, group: ENEMY_CARD_KINDS.indexOf(c.kind),
  });
  const grid = dexGrid('적');
  const fill = (): void => {
    const nodes: HTMLElement[] = [];
    let lastKind: EnemyCardKind | null = null;
    for (const c of sortDex(cards, sortState.enemies, facts)) {
      if (sortState.enemies === 'default' && c.kind !== lastKind) {
        lastKind = c.kind;
        nodes.push(dexCaption(`${ENEMY_KIND_LABEL[c.kind]} ${counts.byKind[c.kind].found}/${counts.byKind[c.kind].total}`));
      }
      nodes.push(cardOf(faction, c, dex, persist));
    }
    grid.replaceChildren(...nodes);
    grid.scrollTop = 0;
  };
  fill();
  const sort = dexSortButton(sortState.enemies, () => {
    sortState.enemies = nextDexSort(ENEMY_DEX_SORTS, sortState.enemies);
    persist?.();
    fill();
    return sortState.enemies;
  });
  const sub = h('span');
  sub.append('발견 ', h('b', '', String(counts.found)), ` / ${counts.total}`);
  lcdPage(root, { cls: 'bha-dex-page bha-dexgrid-page bha-edex', cols: 'minmax(0, 1fr)' }, lcdHead({ title, sub, logo: logoMark(faction, 'bha-logo--md') ?? undefined, aside: [selectLast(sort)] }), [grid], []);
}
