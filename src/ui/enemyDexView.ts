// 적 도감 화면 (GDD 200장, C.330): 책장 묶음(진화체 도감·칭호 도감 ▾)의 세 번째 도감. 틀은 진화체 도감과 같다 — 왼쪽 목록 · 오른쪽 상세, 위 '발견 n / 전체'.
// 카드 = 일반(속성 8 × 짐승형·부유형·갑각형) · 강적 24 · 보스 3(탑 층 보스도 같은 보스라 같은 칸). 만나기 전 = 그림 실루엣 + '???'(속성·등급 숨김),
// 만난 뒤 = 그림 · 이름 · 속성 · 강적·보스 등급(198장 grade — 여기서만 보인다) · 잡은 수 'n마리' · 흡수 종류별 횟수(200장 9, 0도 자리 고정) · 처음 만난 곳 한 줄. 처음 만난 카드는 '새' 점 하나(알림 없음), 상세를 보면 지운다.
// 종족 분기 없음: 이름·속성 이름·사냥터/탑 이름은 종족 설정·데이터에서 읽는다. 기기 ▲▼✓◀ = masterDetail 그대로.
import { enemyGradeName } from '../data/enemies';
import { GROUNDS } from '../data/grounds';
import { pickFaction } from '../data/schema';
import { groundName, towerLabels, type FactionConfig } from '../engine/faction';
import { ABSORB_KINDS, emptyAbsorbs, ENEMY_CARD_KINDS, ENEMY_CARDS, enemyDexCounts, enemyKnown, markEnemyCardSeen, parseWhere, type EnemyCard, type EnemyCardKind, type EnemyDex, type EnemyDexEntry } from '../engine/enemyDex';
import type { SaveData } from '../game';
import { foeArtOf } from './bha/battle';
import { h, icon } from './bha/dom';
import { elementMark, paintElement } from './bha/element';
import { lcdHead, lcdPage, masterDetail, type ListRow } from './bha/lcdpage';
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

function cardRow(faction: FactionConfig, card: EnemyCard, dex: EnemyDex, persist: (() => void) | undefined, caption?: string): ListRow {
  const entry = dex[card.id];
  if (!entry || !enemyKnown(dex, card.id)) {
    return {
      label: '미발견', cls: 'is-unknown', caption,
      content: [enemyArtBox(card.id, false, 'bha-edex__art--row'), h('span', 'bha-mdrow__name', '???'), h('small', 'bha-mdrow__state', '미발견')],
      detail: () => {
        const d = h('div', 'bha-mdhint');
        d.append(enemyArtBox(card.id, false, 'bha-edex__art--hero'), h('b', '', '미발견'), h('small', '', '만난 적만 보인다.'));
        return [d];
      },
    };
  }
  const name = shownName(pickFaction(card.def.name, faction.id));
  const newDot = entry.fresh ? h('i', 'bha-edex__new') : null;
  if (newDot) newDot.setAttribute('aria-label', '새');
  return {
    label: name, caption,
    cls: `bha-edex__row--${card.kind}`,
    paint: (node: HTMLElement) => paintElement(node, card.def.element),
    content: [enemyArtBox(card.id, true, 'bha-edex__art--row'), h('span', 'bha-mdrow__name', name), ...(newDot ? [newDot] : []), h('small', 'bha-mdrow__state', killsText(entry.kills))],
    detail: () => {
      // 상세를 보면 '새' 점을 지운다 (GDD 200장 7)
      if (markEnemyCardSeen(dex, card.id)) {
        newDot?.remove();
        persist?.();
      }
      const head = h('div', 'bha-mddetail__head bha-edex__head');
      const title = h('h2', 'bha-mddetail__title', name);
      // 머리 줄(C.332): 그림 | [이름 + 칩 묶음]. 칩 묶음은 한 덩어리 — 이름 오른쪽에 한 줄, 넘치면 이름 아래 한 줄로(그림 아래로 떨어지지 않는다)
      const chips = h('span', 'bha-edex__chips');
      chips.append(...cardChips(card));
      const id = h('div', 'bha-edex__id');
      id.append(title, chips);
      head.append(enemyArtBox(card.id, true, 'bha-edex__art--hero'), id);
      const body = h('p', 'bha-mddetail__body bha-edex__body');
      const line = (label: string, value: Node | string) => {
        const row = h('span', 'bha-edex__line');
        row.append(h('span', 'bha-edex__label', label), typeof value === 'string' ? h('b', 'bha-edex__value', value) : value);
        return row;
      };
      body.append(line('속성', elementMark(card.def.element, faction.id)), line('잡은 수', killsText(entry.kills)), line('흡수', absorbsGrid(faction, entry)), line('처음 만난 곳', whereText(faction, entry.where)));
      return [head, body];
    },
  };
}

/** 적 도감: 일반 → 강적 → 보스 한 목록 + 종류 머리줄(발견 n/전체). 첫 선택 = 맨 위(새 카드를 바로 고르면 '새' 점이 보이기도 전에 지워진다) */
export function enemyDexView(root: HTMLElement, faction: FactionConfig, save: SaveData, title: string | Node = '적 도감', persist?: () => void): void {
  const dex = (save.enemyDex ??= {});
  const counts = enemyDexCounts(dex);
  const rows = ENEMY_CARD_KINDS.flatMap((kind) =>
    ENEMY_CARDS.filter((c) => c.kind === kind).map((c, i) => cardRow(faction, c, dex, persist, i === 0 ? `${ENEMY_KIND_LABEL[kind]} ${counts.byKind[kind].found}/${counts.byKind[kind].total}` : undefined)),
  );
  const md = masterDetail(rows, 0, '적');
  const sub = h('span');
  sub.append('발견 ', h('b', '', String(counts.found)), ` / ${counts.total}`);
  lcdPage(root, { cls: 'bha-dex-page bha-edex', cols: 'minmax(0, 0.9fr) minmax(0, 1.1fr)' }, lcdHead({ title, sub, logo: logoMark(faction, 'bha-logo--md') ?? undefined }), [md.list], [md.detail]);
}
