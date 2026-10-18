// 둥지 / 대원실 화면 (GDD 7장, U-3 새 디자인): 위 = 이름·기록·상태 4바 / 가운데 = 탭 내용 / 아래 = 행동 독(원정 출발·이어하기·전투 연습, 항상 보임) + 하단 탭 4개.
// 탭: 돌보기(돌보기 3 + 진화 패널) · 특성(슬롯·보유 특성 정리) · 덱(타일 덱 편성) · 더보기(도감·연습·종족·설정·도움말).
// 탭 전환은 DOM 을 다시 만들지 않고 hidden 만 바꾼다. 행동(돌보기·덱·특성)은 다시 그리되 탭과 탭별 스크롤 위치를 유지한다.
import { BALANCE } from '../config/balance';
import { FORM_TABLE, formName, tryGetForm } from '../data/evolution';
import { tilesFor, tileName } from '../data/tiles';
import { TITLES } from '../data/titles';
import { doNestAction, applyIdle } from '../engine/nest';
import type { FactionConfig } from '../engine/faction';
import { sanitizeDeck, type SaveData } from '../game';
import { versionLabel } from '../version';
import { traitsTab, type TraitsTabState } from './buildPanel';
import { evolutionPanel } from './evolutionPanel';
import { button, h, icon, mountApp, notice, panel, provisionalTag } from './bha/dom';
import { careButtons, deckRow, menuRow, statusBlock, tabbar } from './bha/nest';
import { countText, toward, traitBadgeCount } from './bha/nestLogic';
import { tileHint } from './labels';

export interface NestViewHandlers {
  onDepart: () => void;
  onPractice: () => void;
  /** 진화 확정: 앱이 performEvolution 을 부르고 연출 화면을 보여 준다 */
  onEvolve: () => void;
  /** 진화체 도감 화면 */
  onDex: () => void;
  /** 칭호 도감 화면 (C.14) */
  onTitles: () => void;
  onChangeFaction: () => void;
  onSettings: () => void;
  /** [?] 도움말 (C.19). screen = 먼저 펼칠 화면 요약 */
  onHelp: (screen: 'nest' | 'evolution') => void;
  persist: () => void;
  /** 저장된 원정이 있으면 이어하기 (GDD 14-1) */
  resume: { info: string; onResume: () => void } | null;
  /** 이어하기를 숨긴 이유 (손상·구버전) 안내 한 줄 */
  resumeNote: string;
}

type NestTab = 'home' | 'traits' | 'deck' | 'more';
const TAB_IDS: NestTab[] = ['home', 'traits', 'deck', 'more'];

/** 화면을 다시 그려도 남는 UI 상태: 고른 탭, 탭별 스크롤, 특성 교체 중인 특성 */
const ui = { tab: 'home' as NestTab, scroll: { home: 0, traits: 0, deck: 0, more: 0 } as Record<NestTab, number>, traits: { swapTrait: null } as TraitsTabState };

export function nestView(root: HTMLElement, faction: FactionConfig, save: SaveData, hd: NestViewHandlers): void {
  applyIdle(save.nest, Date.now());
  save.tiles.deck = sanitizeDeck(save.tiles, faction.id);
  hd.persist();
  const rerender = () => {
    ui.scroll[ui.tab] = window.scrollY;
    nestView(root, faction, save, hd);
  };
  const n = save.nest;
  const RX = BALANCE.provisional.risk;
  const deckSize = BALANCE.provisional.expedition.deckSize;
  const deckCount = save.tiles.deck.length;
  const runs = save.runLog.runs;

  // ── 머리: 이름·기록 + 도움말·설정 ──
  const top = h('header', 'bha-topbar');
  const main = h('div', 'bha-topbar__main');
  const sub = h('p', 'bha-topbar__sub');
  sub.append('사냥터 ', h('b', '', faction.huntingGroundName), ' · 원정 ', h('b', '', String(runs.length)), '회 · 귀환 ', h('b', '', String(runs.filter((r) => r.outcome === 'returned').length)), ' · 패배 ', h('b', '', String(runs.filter((r) => r.outcome === 'defeated').length)));
  main.append(h('h1', 'bha-topbar__title', faction.nestName), sub);
  const acts = h('div', 'bha-topbar__actions');
  acts.append(
    button({ label: '도움말', icon: 'i-help', iconOnly: true, variant: 'ghost', onClick: () => hd.onHelp('nest') }),
    button({ label: '설정', icon: 'i-settings', iconOnly: true, variant: 'ghost', onClick: hd.onSettings }),
  );
  top.append(main, acts);

  // ── 단계·진화체 칩 ──
  const evo = save.evolution;
  const stage = h('div', 'bha-nest__stage');
  const stageChip = h('span', 'bha-chip');
  stageChip.append(icon('i-evolve'), `${evo.tierIndex + 1}단계 · ${faction.tierNames[evo.tierIndex]}`);
  stage.append(stageChip);
  const form = evo.formId ? tryGetForm(evo.formId) : undefined;
  if (form) {
    const fc = h('span', 'bha-chip', formName(form, faction.id));
    if (form.provisional) fc.append(' ', provisionalTag());
    stage.append(fc);
  }

  // ── 상태 4바 + 쇠약 알림 ──
  const status = panel({});
  status.setAttribute('aria-label', '상태');
  status.append(statusBlock(faction, {
    hunger: n.hunger, condition: n.condition, stability: n.stability, stabilityMax: RX.stabilityMax, risk: n.risk, riskLimit: RX.limit, condWarn: 40, riskWarn: 60,
  }));
  const weak = n.weakened
    ? notice('danger', `지난 원정에서 패배했다. ${toward(faction.nestActions.sleep)} 회복한다.`, { title: faction.defeatStateName, icon: 'i-broken' })
    : null;

  // ── 탭 1: 돌보기 + 진화 ──
  const care = panel({ title: '돌보기', aside: '원정 사이에 무엇이든 몇 번이든' });
  care.append(careButtons(faction, (a) => {
    doNestAction(save.nest, a);
    hd.persist();
    rerender();
  }));
  const homeTab = tabPanel('home', care, evolutionPanel(faction, evo, hd.onEvolve, hd.onDex, () => hd.onHelp('evolution')));

  // ── 탭 2: 특성 ──
  const traitsPanels = traitsTab(faction, save.build, ui.traits, () => {
    hd.persist();
    rerender();
  });
  const traitsPanelsTab = tabPanel('traits', ...traitsPanels);

  // ── 탭 3: 덱 ──
  const deckPanel = panel({ title: '타일 덱', aside: h('span', deckCount === 0 ? 'bha-chip bha-chip--danger' : 'bha-chip', countText(deckCount, deckSize)) });
  deckPanel.querySelector('.bha-panel__title')?.prepend(icon('i-deck'));
  deckPanel.append(h('p', 'bha-dim', '원정 중 보상으로 이 덱에서 타일이 뽑힌다. 뽑힌 타일만 길 옆에 놓을 수 있다.'));
  const deckList = h('div', 'bha-stack');
  const count = (id: string) => save.tiles.deck.filter((x) => x === id).length;
  for (const t of tilesFor(faction.id)) {
    const owned = save.tiles.collection[t.id] ?? 0;
    deckList.append(deckRow({
      name: tileName(t.id, faction.id), hint: tileHint(t), owned, count: count(t.id), tile: t, provisional: true,
      canAdd: count(t.id) < owned && deckCount < deckSize,
      onMinus: () => {
        save.tiles.deck.splice(save.tiles.deck.indexOf(t.id), 1);
        hd.persist();
        rerender();
      },
      onPlus: () => {
        save.tiles.deck.push(t.id);
        hd.persist();
        rerender();
      },
    }));
  }
  deckPanel.append(deckList);
  const deckTab = tabPanel('deck', deckPanel);

  // ── 탭 4: 더보기 ──
  const formsFound = save.formDex.filter((id) => FORM_TABLE.some((f) => f.id === id)).length;
  const menu = h('nav', 'bha-menu');
  menu.setAttribute('aria-label', '더보기');
  menu.append(
    menuRow({ icon: 'i-dex', label: '진화체 도감', meta: countText(formsFound, FORM_TABLE.length), onClick: hd.onDex }),
    menuRow({ icon: 'i-title', label: '칭호 도감', meta: countText(save.titles.length, TITLES.length), onClick: hd.onTitles }),
    menuRow({ icon: 'i-practice', label: '전투 연습', onClick: hd.onPractice }),
    menuRow({ icon: 'i-swap-species', label: '종족 바꾸기', meta: faction.name, onClick: hd.onChangeFaction }),
    menuRow({ icon: 'i-settings', label: '설정 (조작 판정)', onClick: hd.onSettings }),
    menuRow({ icon: 'i-help', label: '도움말 · 튜토리얼', onClick: () => hd.onHelp('nest') }),
  );
  const moreTab = tabPanel('more', menu, h('p', 'bha-nest__foot', versionLabel()));

  // ── 행동 독: 원정 출발 / 이어하기 / 전투 연습 (항상 보임) ──
  const dock = h('div', 'bha-dock bha-dock--above-tabbar');
  const departBtn = (primary: boolean, label = '원정 출발') => {
    const b = button({ icon: 'i-nest', variant: primary ? 'primary' : undefined, size: 'lg', disabled: deckCount === 0, onClick: hd.onDepart });
    const l = h('span', 'bha-btn__label');
    l.append(h('span', '', label));
    if (primary) l.append(h('span', 'bha-btn__sub', `덱 ${deckCount} / ${deckSize}`));
    b.append(l);
    return b;
  };
  const warnInfo = (text: string) => {
    const p = h('p', 'bha-dock__info bha-dock__info--warn');
    p.append(icon('i-warn'), text);
    return p;
  };
  if (hd.resume) {
    const info = h('p', 'bha-dock__info');
    info.append(icon('i-return'), '이어하던 원정: ', h('b', '', hd.resume.info));
    const row = h('div', 'bha-dock__row');
    row.style.gridTemplateColumns = 'minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr)';
    row.append(
      button({ label: '원정 이어하기', variant: 'primary', size: 'lg', onClick: hd.resume.onResume }),
      button({ label: '새 원정', size: 'lg', disabled: deckCount === 0, onClick: hd.onDepart }),
      button({ label: '전투 연습', size: 'lg', onClick: hd.onPractice }),
    );
    dock.append(info, row, warnInfo('새 원정을 시작하면 이어하던 원정은 패배 처리 없이 버려진다.'));
    if (deckCount === 0) dock.append(warnInfo('덱이 비어 있어 새 원정을 시작할 수 없다. 덱 탭에서 타일을 넣는다.'));
  } else {
    if (hd.resumeNote) dock.append(warnInfo(`이어하기를 숨겼다: ${hd.resumeNote}`));
    if (deckCount === 0) dock.append(warnInfo('덱이 비어 있다. 덱 탭에서 타일을 1장 이상 넣어야 출발할 수 있다.'));
    const row = h('div', 'bha-dock__row bha-dock__row--two');
    row.append(departBtn(true), button({ label: '전투 연습', icon: 'i-practice', size: 'lg', onClick: hd.onPractice }));
    dock.append(row);
  }

  // ── 탭바 ──
  const panels: Record<NestTab, HTMLElement> = { home: homeTab, traits: traitsPanelsTab, deck: deckTab, more: moreTab };
  const bar = tabbar(
    [
      { id: 'home', label: '돌보기', icon: 'i-nest' },
      { id: 'traits', label: '특성', icon: 'i-slot', badge: traitBadgeCount(save.build) },
      { id: 'deck', label: '덱', icon: 'i-deck' },
      { id: 'more', label: '더보기', icon: 'i-dex' },
    ],
    ui.tab,
    (id) => {
      ui.scroll[ui.tab] = window.scrollY;
      ui.tab = id as NestTab;
      for (const t of TAB_IDS) panels[t].hidden = t !== ui.tab;
      window.scrollTo(0, ui.scroll[ui.tab]);
    },
  );
  for (const t of TAB_IDS) panels[t].hidden = t !== ui.tab;

  mountApp(root, { cls: 'bha-nest' }, top, stage, status, ...(weak ? [weak] : []), homeTab, traitsPanelsTab, deckTab, moreTab, dock, bar);
  window.scrollTo(0, ui.scroll[ui.tab]);
}

function tabPanel(id: NestTab, ...nodes: HTMLElement[]): HTMLElement {
  const t = h('div', 'bha-nest__tab');
  t.dataset.tab = id;
  t.setAttribute('role', 'tabpanel');
  t.append(...nodes);
  return t;
}
