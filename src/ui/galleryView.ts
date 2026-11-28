// 책장 [일러스트] [애니메이션] 탭 (GDD 14-8 v6.256 '일러스트·애니메이션 탭(다시 보기)', C.570 — 사용자 2026-11-28 "도감에, 일러스트, 애니메이션 창 만들고
// 다시볼 수 있게 만드셈. 일러도 추가해줄거임. 그리고 테스트모드에선 다 볼 수 있게. 애니는 진화, 첫 시작 등등.").
// ① 일러스트 = 바둑판 썸네일(데이터 src/data/gallery) → 누르면 화면 가득 크게(◀ ▶ 넘기기 · 닫기). 못 연 것 = 실루엣 + '???'. 지금은 빈 목록이면 안내 한 줄.
// ② 애니메이션 = 게임에 있는 전체 화면 연출을 다시 튼다 — 탄생(첫 시작) · 진화(실제로 지나간 바뀌기 전 → 뒤 모습) · 아란칼화/참백도 구상화(깬 뒤 화면) · 환생.
//    본 적 있는 것만 열림(engine/gallery 가 기록에서 읽는다). 다시 보기는 연출만 틀고 게임 상태는 바꾸지 않으며, 아무 데나 누르면 닫는다(3번 터치 취소 창 없음).
// 테스트 모드 = 두 탭 전부 열림 + 진화 연출은 모든 진화체 쌍을 골라 본다. 종족마다 다른 연출·이름은 종족 설정(엔진 분기 없음).
import { artUrls } from '../data/art/manifest';
import { formName, formsOfTier, tryGetForm } from '../data/evolution';
import { FACTIONS, getFaction } from '../data/factions';
import { ILLUSTRATIONS, type IllustDef } from '../data/gallery';
import type { FormDef } from '../data/schema';
import { MAX_TIER_INDEX } from '../engine/evolution';
import { roomOf, type FactionConfig } from '../engine/faction';
import { animSlots, illustsFor, illustUnlocked, illustUnlockText, testAnimSlots, type AnimEntry, type AnimSlot, type GallerySave } from '../engine/gallery';
import type { SaveData } from '../game';
import { heroArtOf, heroEl } from './bha/battle';
import { dexCaption, dexCard, dexGrid } from './bha/dexGrid';
import { button, el, h, icon } from './bha/dom';
import { itemDialog } from './bha/itemUi';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { logoMark } from './bha/logo';
import { getOverlayHost, registerLayer } from './bha/overlayHost';
import { playBirth } from './birthFx';
import { evolutionView } from './evolutionPanel';
import { rebirthView } from './rebirthView';
import { ascensionResultView } from './rankView';
import { shownName } from './displayName';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export const ILLUST_EMPTY_TEXT = '아직 일러스트가 없다 — 그림이 들어오면 여기에 모인다.';
export const ANIM_GROUP_LABEL: Record<AnimEntry['kind'], string> = { birth: '탄생', evolve: '진화', ascension: '각성', rebirth: '환생' };

// ───────────────────────── 일러스트 ─────────────────────────

function illustArt(d: IllustDef, open: boolean): HTMLElement {
  const box = h('span', `bha-art bha-art--frame bha-gallery__art${open ? '' : ' is-silhouette'}`);
  const src = artUrls(d.art, BASE).src;
  if (src) {
    const img = h('img', 'bha-art-img bha-gallery__img') as HTMLImageElement;
    img.src = src;
    img.alt = '';
    img.draggable = false;
    box.append(img);
  } else box.append(icon(open ? 'i-dex' : 'i-unknown'));
  return box;
}

/** 화면 가득 크게 보기: ◀ ▶ 넘기기(열린 그림끼리) · 닫기 · 기기 ◀/Esc = 닫기 */
export function illustViewer(list: readonly IllustDef[], start: number): () => void {
  let i = Math.max(0, Math.min(list.length - 1, start));
  const layer = el('div', 'bha-overlay bha-overlay--in-app bha-illustview');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  const img = el('img', 'bha-illustview__img') as HTMLImageElement;
  img.alt = '';
  img.draggable = false;
  const cap = el('p', 'bha-illustview__cap');
  const paint = () => {
    const d = list[i]!;
    img.src = artUrls(d.art, BASE).src ?? '';
    layer.setAttribute('aria-label', d.title);
    cap.textContent = `${d.title} · ${i + 1} / ${list.length}`;
    prev.disabled = i === 0;
    next.disabled = i === list.length - 1;
  };
  let unregister: () => void = () => {};
  const close = () => {
    unregister();
    layer.remove();
  };
  const prev = button({ label: '이전', iconOnly: true, icon: 'i-chevron-left', variant: 'ghost', onClick: () => { if (i > 0) { i--; paint(); } } });
  const next = button({ label: '다음', iconOnly: true, icon: 'i-chevron-right', variant: 'ghost', onClick: () => { if (i < list.length - 1) { i++; paint(); } } });
  const x = button({ label: '닫기', iconOnly: true, icon: 'i-close', variant: 'ghost', onClick: close });
  prev.classList.add('bha-illustview__prev');
  next.classList.add('bha-illustview__next');
  x.classList.add('bha-illustview__close');
  layer.append(img, cap, prev, next, x);
  layer.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') prev.click();
    else if (e.key === 'ArrowRight') next.click();
  });
  getOverlayHost().append(layer);
  unregister = registerLayer(layer, close);
  paint();
  x.focus({ preventScroll: true });
  return close;
}

/** 일러스트 탭: 바둑판 썸네일. 열린 것 = 그림 + 제목 → 크게 보기, 못 연 것 = 실루엣 + '???' → 조건 한 줄(임시) */
export function illustView(root: HTMLElement, faction: FactionConfig, save: SaveData, title: string | Node, test = false): void {
  const all = illustsFor(faction.id);
  const g = save as unknown as GallerySave;
  const open = all.filter((d) => illustUnlocked(d, g, test));
  const grid = dexGrid('일러스트');
  if (all.length === 0) grid.append(h('p', 'bha-faint bha-gallery__empty', ILLUST_EMPTY_TEXT));
  for (const d of all) {
    const ok = illustUnlocked(d, g, test);
    grid.append(dexCard({
      name: ok ? d.title : '???', unknown: !ok, art: illustArt(d, ok), marks: null,
      onOpen: () => (ok ? illustViewer(open, open.indexOf(d)) : itemDialog({ heading: '일러스트', name: '???', desc: illustUnlockText(d, faction.tierNames), art: illustArt(d, false), hero: true, cls: 'bha-dexmodal', actions: [] })),
    }));
  }
  const sub = h('span');
  sub.append('열림 ', h('b', '', String(open.length)), ` / ${all.length}`);
  lcdPage(root, { cls: 'bha-dex-page bha-dexgrid-page bha-gallery', cols: 'minmax(0, 1fr)' }, lcdHead({ title, sub, logo: logoMark(faction, 'bha-logo--md') ?? undefined }), [grid], []);
}

// ───────────────────────── 애니메이션 ─────────────────────────

/** 그 종족·단계·외형의 그림 */
function artOf(factionId: string, tierIndex: number, look: string | null) {
  const f = getFaction(factionId);
  return heroArtOf(roomOf(f), factionId, tierIndex, look);
}

/** 아란칼화/구상화를 깬 뒤 그림 단계 (종족 설정 ascension.artTier — game.artTierIndexOf 와 같은 식) */
function ascArtTier(f: FactionConfig, tierIndex: number): number {
  const A = f.ascension;
  return A.lookChange && A.artTier !== undefined ? A.artTier - 1 : tierIndex;
}

function animArtBox(entry: AnimEntry | null, factionId: string, tierIndex: number, seen: boolean): HTMLElement {
  const box = h('span', `bha-art bha-art--frame bha-gallery__art${seen ? '' : ' is-silhouette'}`);
  const f = getFaction(factionId);
  const art = entry?.kind === 'evolve' ? artOf(factionId, entry.toTier, entry.toLook)
    : entry?.kind === 'ascension' ? artOf(factionId, ascArtTier(f, entry.tierIndex), null)
    : artOf(factionId, tierIndex, null);
  if (art.src || art.frames?.length || art.rig) box.append(heroEl(art).root);
  else box.append(icon(seen ? 'i-dex' : 'i-unknown'));
  return box;
}

/** 칸 이름 (종족 설정 이름) */
export function animName(slot: Pick<AnimSlot, 'entry' | 'group' | 'factionId' | 'tiers'>): string {
  const f = getFaction(slot.factionId);
  const e = slot.entry;
  if (!e) return '???';
  switch (e.kind) {
    case 'birth': return `${f.name} 탄생`;
    case 'evolve': {
      const to = tryGetForm(e.toFormId);
      return `${e.fromTier + 1}→${e.toTier + 1}단계 ${shownName(to ? formName(to, f.id) : f.tierNames[e.toTier] ?? '')}`;
    }
    case 'ascension': return f.ascension.name;
    case 'rebirth': return `${f.rebirth.name} ${e.record.count}회`;
  }
}

/** 다시 보기: 연출만 튼다(세이브를 건드리지 않는다). 끝나거나 아무 데나 누르면 onClose */
export function replayAnim(root: HTMLElement, entry: AnimEntry, onClose: () => void): void {
  const f = getFaction(entry.factionId);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.removeEventListener('pointerdown', onTap, true);
    onClose();
  };
  const onTap = (ev: Event) => {
    ev.stopPropagation();
    ev.preventDefault();
    close();
  };
  // 연출 화면 표시(오른쪽 위 재화 칩 없음 — app tickCorner 가 data-screen 'replay' 를 본다) + 아무 데나 누르면 닫기
  const tapToClose = () => {
    const app = root.querySelector<HTMLElement>('.bha-app');
    if (app) app.dataset.screen = 'replay';
    root.querySelector('.bha-corner')?.remove();
    window.setTimeout(() => { if (!closed) root.addEventListener('pointerdown', onTap, true); }, 0);
  };
  switch (entry.kind) {
    case 'birth': {
      // 탄생 연출은 원래 화면을 누르면 건너뛴다 — 끝나면 닫힘
      if (!playBirth(f, { onDone: close })) close();
      return;
    }
    case 'evolve': {
      const form = tryGetForm(entry.toFormId);
      if (!form) return close();
      evolutionView(root, f, entry.fromTier, entry.toTier, form, close, undefined, {
        elements: form.elements ?? [], ability: null, failLine: form.label.kind === 'fail', look: entry.toLook,
        art: artOf(f.id, entry.toTier, entry.toLook), fromArt: artOf(f.id, entry.fromTier, entry.fromLook),
      }, { replay: true });
      tapToClose();
      return;
    }
    case 'ascension': {
      ascensionResultView(root, f, true, f.ascension.completeText, { onBack: close }, entry.formId, artOf(f.id, ascArtTier(f, entry.tierIndex), null));
      tapToClose();
      return;
    }
    case 'rebirth': {
      rebirthView(root, f, entry.record, { jade: 0 }, close);
      tapToClose();
      return;
    }
  }
}

/** 테스트 모드 진화 연출 고르기: 바뀐 뒤 진화체를 누르면 바뀌기 전(앞 단계 진화체 전부)을 고르는 창 */
function testEvolveCards(faction: FactionConfig, play: (e: AnimEntry) => void): HTMLElement[] {
  const out: HTMLElement[] = [];
  const live = (tier: number): FormDef[] => formsOfTier(tier).filter((x) => !x.retired);
  for (let toTier = 1; toTier <= MAX_TIER_INDEX; toTier++) {
    out.push(dexCaption(`진화 ${toTier}→${toTier + 1}단계 (고르기)`));
    for (const to of live(toTier + 1)) {
      const name = shownName(formName(to, faction.id));
      const froms: (FormDef | null)[] = toTier === 1 ? [null] : live(toTier);
      out.push(dexCard({
        name, unknown: false, art: animArtBox(null, faction.id, toTier, true), marks: null,
        onOpen: () => {
          let closeDlg: () => void = () => {};
          const pick = (from: FormDef | null) => {
            closeDlg();
            play({ kind: 'evolve', factionId: faction.id, fromTier: toTier - 1, toTier, fromFormId: from?.id ?? null, toFormId: to.id, fromLook: null, toLook: null });
          };
          const list = h('div', 'bha-stack bha-stack--tight bha-gallery__pick');
          for (const from of froms) list.append(button({ label: from ? `← ${shownName(formName(from, faction.id))}` : `← ${faction.tierNames[0]}`, onClick: () => pick(from) }));
          closeDlg = itemDialog({ heading: '진화 연출 — 바뀌기 전 고르기', name, desc: '', content: [list], art: animArtBox(null, faction.id, toTier, true), hero: true, cls: 'bha-dexmodal', actions: [] });
        },
      }));
    }
  }
  return out;
}

/** 애니메이션 탭: 종류별 머리줄(탄생·진화·각성·환생) + 카드. 본 것만 열림(테스트 모드 = 전부 + 진화 쌍 고르기). reopen = 다시 보기를 닫고 이 탭으로 */
export function animView(root: HTMLElement, faction: FactionConfig, save: SaveData, title: string | Node, test = false, reopen?: () => void): void {
  const factionIds = FACTIONS.map((x) => x.id);
  const slots = test ? testAnimSlots(factionIds, MAX_TIER_INDEX) : animSlots(save as unknown as GallerySave, factionIds, MAX_TIER_INDEX);
  // 지금 종족 먼저
  const order = [faction.id, ...factionIds.filter((x) => x !== faction.id)];
  const back = reopen ?? (() => animView(root, faction, save, title, test));
  const play = (e: AnimEntry) => replayAnim(root, e, back);
  const grid = dexGrid('애니메이션');
  const nodes: HTMLElement[] = [];
  for (const fid of order) {
    const f = getFaction(fid);
    const mine = slots.filter((s) => s.factionId === fid);
    if (mine.length === 0 && !test) continue;
    nodes.push(dexCaption(`${f.name} · 본 연출 ${mine.filter((s) => s.seen).length}/${mine.length}`));
    for (const s of mine) {
      const tierIndex = s.group === 'evolve' ? (s.tiers?.[1] ?? 0) : s.group === 'ascension' ? MAX_TIER_INDEX : 0;
      const name = s.seen ? animName(s) : s.tiers ? `${s.tiers[0] + 1}→${s.tiers[1] + 1}단계 ???` : '???';
      nodes.push(dexCard({
        name, unknown: !s.seen, art: animArtBox(s.entry, fid, tierIndex, s.seen), marks: h('span', 'bha-chip', ANIM_GROUP_LABEL[s.group]),
        cls: `bha-gallery__anim bha-gallery__anim--${s.group}`,
        onOpen: () => (s.seen && s.entry ? play(s.entry) : itemDialog({ heading: `애니메이션 · ${ANIM_GROUP_LABEL[s.group]}`, name: '???', desc: '본 적 있는 연출만 다시 볼 수 있다.', art: animArtBox(null, fid, tierIndex, false), hero: true, cls: 'bha-dexmodal', actions: [] })),
      }));
    }
    if (test) nodes.push(...testEvolveCards(f, play));
  }
  grid.replaceChildren(...nodes);
  const seen = slots.filter((s) => s.seen).length;
  const sub = h('span');
  sub.append(test ? '테스트 모드 · 전부 열림 ' : '본 연출 ', h('b', '', String(seen)), ` / ${slots.length}`);
  lcdPage(root, { cls: 'bha-dex-page bha-dexgrid-page bha-gallery', cols: 'minmax(0, 1fr)' }, lcdHead({ title, sub, logo: logoMark(faction, 'bha-logo--md') ?? undefined }), [grid], []);
}

/** 테스트·점검용: 지금 데이터의 일러스트 수 */
export const illustCount = (): number => ILLUSTRATIONS.length;
