// 붕옥 화면 (GDD 22-3·22-9 → 244장, C.414): 재료 3종으로 붕옥 개발 10단계(반각성 50% → 공명 100%) → 모든 트랙 등급 1위 → 합체 미리보기 → 확인 2번 → 연출.
// 왼쪽 = 붕옥 그림(100%면 불꽃)·개발 %, 오른쪽 = 탭 개발(재료 칸)·단계·합체·도감 (C.421). 종족 문구는 각 트랙의 종족 설정에서 읽는다 (종족 분기 없음). 수치는 BALANCE.provisional.hogyoku.
import { BALANCE } from '../config/balance';
import { getFaction } from '../data/factions';
import { formName, tryGetForm } from '../data/evolution';
import { JADE_NAME, SOUL_CRYSTAL_NAME, TRADE_CURRENCY_NAME } from '../data/economy';
import { HOGYOKU_SHARD_NAME, HOGYOKU_STAGE_NAMES, HOGYOKU_STEP_NAMES, RESONANCE_ESSENCE_NAME, transcendentConditionText } from '../data/hogyoku';
import { developCost, type HogyokuCost } from '../engine/transcend';
import { TRANSCENDENTS, tryGetTranscendent, type TranscendentDef } from '../data/transcendents';
import type { FactionConfig } from '../engine/faction';
import { formDisplayName, playerElementsOf } from '../engine/evolution';
import type { FusionRecord } from '../engine/runLog';
import { allTracks, developGate, fusionGate, fusionInputOf, fusionPreview, statBonusOf, trackIsTopRank, type DevelopBlock, type FusionBlock, type SaveData, type TrackKey } from '../game';
import { rankOf } from '../engine/rank';
import { button, chip, h, icon, info, meter, mountApp, notice, panel, provisionalTag } from './bha/dom';
import { artIcon, artSrc } from './bha/artIcon';
import { categoryTabs } from './bha/itemUi';
import { edgeCue, enableDragScroll } from './bha/dragScroll';
import { showToast } from './bha/nest';
import { elementsMark } from './bha/element';
import type { Device } from './bha/device';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { toward } from './bha/nestLogic';
import { rebirthMark } from './rebirthView';
import { rankLabel } from './rankView';
import { shownName } from './displayName';
import { asBack } from './bha/screenBack';

const HX = BALANCE.provisional.hogyoku;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** 받침이 있으면 '이', 없으면 '가' (한글이 아니면 '이(가)') */
export function subjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '이(가)';
  return code % 28 === 0 ? '가' : '이';
}

/** 트랙 하나의 이름: 진화체 이름(없으면 단계 이름) */
export function trackName(t: Pick<SaveData, 'factionId' | 'evolution'>): string {
  const f = getFaction(t.factionId);
  return shownName(formDisplayName(t.evolution, f.id));
}

/** 합체가 막힌 이유 한 줄 */
export function fusionBlockText(b: FusionBlock): string {
  switch (b) {
    case 'tab': return '붕옥이 아직 나타나지 않았다.';
    case 'resonance': return '붕옥이 공명해야 한다 — 두 종족의 스토리를 모두 끝내면.';
    case 'tracks': return '두 캐릭터가 모두 있어야 한다.';
    case 'develop': return `붕옥 개발을 100%(${HX.maxLevel}단계)까지 채워야 한다.`;
    case 'rank': return '두 캐릭터 모두 등급 1위여야 한다.';
    case 'expedition': return '진행 중인 모험이 있다. 모험을 끝내야 한다.';
    case 'complete': return '초월체 6종을 모두 모았다. 더는 합체할 수 없다.';
  }
}

/** 개발이 막힌 이유 한 줄 */
export function developBlockText(b: DevelopBlock): string {
  switch (b) {
    case 'tab': return '붕옥이 아직 나타나지 않았다.';
    case 'max': return '붕옥 개발 100% — 더 올릴 단계가 없다.';
    case 'resonance': return `${HX.halfLevel * 10}%부터는 공명이 필요하다 — 다른 종족의 스토리도 모두 끝내면 붕옥이 공명한다.`;
    case 'soul': return `${SOUL_CRYSTAL_NAME}${subjectParticle(SOUL_CRYSTAL_NAME)} 모자라다 (강적 처치·등급전 승리·환생).`;
    case 'shard': return `${HOGYOKU_SHARD_NAME}${subjectParticle(HOGYOKU_SHARD_NAME)} 모자라다 (스토리 화 첫 클리어·장 보스·탑 ${BALANCE.provisional.hogyokuShards.towerEvery}층마다).`;
    case 'essence': return `${RESONANCE_ESSENCE_NAME}${subjectParticle(RESONANCE_ESSENCE_NAME)} 모자라다 (진화할 때마다·공명).`;
  }
}

/** 보유 보너스 한 줄: "붕옥 개발 +5% · 초월체 2종 +4% = 전 능력치 +9%" (없으면 null) */
export function bonusLine(save: Pick<SaveData, 'hogyoku' | 'transcendentDex'>): string | null {
  const b = statBonusOf(save);
  if (b.total <= 0) return null;
  const parts: string[] = [];
  if (b.liberation > 0) parts.push(`붕옥 개발 +${pct(b.liberation)}`);
  if (b.transcendents > 0) parts.push(`초월체 ${save.transcendentDex.length}종 +${pct(b.transcendents)}`);
  return `${parts.join(' · ')} = 전 능력치 +${pct(b.total)}`;
}

/** 붕옥 상태 (GDD 244장 2 안 B): 반각성 → 공명 → 합체 가능 */
export function hogyokuStage(save: SaveData): keyof typeof HOGYOKU_STAGE_NAMES {
  if (!save.hogyoku.resonance) return 'half';
  return fusionGate(save).ok ? 'ready' : 'resonance';
}

/** 재료 3종 = 아이템 칸 (GDD 12-3, C.421): 아이콘 · 이름 · 가진 수 / 다음 단계에 드는 수 · ⓘ 얻는 곳. 재료 그림이 없어 스프라이트 아이콘으로 대신 */
export const HOGYOKU_MATERIALS = [
  { id: 'soul', icon: 'i-rare', name: SOUL_CRYSTAL_NAME, have: (s: SaveData) => s.shared.soulCrystals, from: () => { const c = BALANCE.provisional.soulCrystals; return `강적 처치 +${c.perElite} · 등급전 승리 +${c.perRankWin} · 환생 +${c.perRebirth}`; } },
  { id: 'shard', icon: 'i-special', name: HOGYOKU_SHARD_NAME, have: (s: SaveData) => s.shared.hogyokuShards, from: () => `스토리 화 첫 클리어 · 장 보스 첫 처치 · 탑 ${BALANCE.provisional.hogyokuShards.towerEvery}층마다` },
  { id: 'essence', icon: 'i-sp', name: RESONANCE_ESSENCE_NAME, have: (s: SaveData) => s.shared.resonanceEssence, from: () => '진화할 때마다 · 공명' },
] as const;

function materialSlots(save: SaveData, cost: HogyokuCost | null): HTMLElement {
  const grid = h('div', 'bha-hgmats');
  grid.setAttribute('aria-label', '붕옥 재료');
  grid.dataset.materials = '';
  for (const m of HOGYOKU_MATERIALS) {
    const have = m.have(save);
    const need = cost ? cost[m.id] : null;
    const cell = h('div', `bha-hgmat${need === null ? '' : have >= need ? ' is-ok' : ' is-short'}`);
    cell.dataset.material = m.id;
    const ib = h('button', 'bha-hgmat__info');
    (ib as HTMLButtonElement).type = 'button';
    ib.setAttribute('aria-label', `${m.name} 얻는 곳`);
    ib.append(icon('i-help'));
    ib.onclick = () => showToast({ eyebrow: '얻는 곳', title: m.name, meta: m.from() }, 0, 3200);
    cell.append(icon(m.icon, 'lg'), h('span', 'bha-hgmat__name', m.name), h('b', 'bha-hgmat__n', need === null ? `${have}` : `${have} / ${need}`), ib);
    grid.append(cell);
  }
  return grid;
}

/** 개발 단계 목록 (GDD 244장 4: 단계 이름·효과 문구): 단계마다 이름 · 효과 · 재료 · 상태(✓ 다음 / 공명 필요) */
function stepList(save: SaveData): HTMLElement {
  const h0 = save.hogyoku;
  const p = panel({ title: '개발 단계', aside: `${h0.level} / ${HX.maxLevel}` });
  p.setAttribute('aria-label', '붕옥 개발 단계');
  const list = info(HOGYOKU_STEP_NAMES.slice(0, HX.maxLevel).map((name, i) => {
    const lv = i + 1;
    const c = developCost(lv);
    const done = h0.level >= lv;
    const locked = lv > HX.halfLevel && !h0.resonance;
    const state = done ? ' ✓' : lv === h0.level + 1 ? (locked ? ' 공명' : ' 다음') : locked ? ' 공명' : '';
    return {
      label: `${lv * 10}% ${name}`,
      value: `+${pct(HX.perLevelBonus)} · ${c.soul}/${c.shard}/${c.essence}${state}`,
      mod: done ? ('good' as const) : locked ? undefined : lv === h0.level + 1 ? ('em' as const) : undefined,
    };
  }));
  list.querySelectorAll('.bha-info__row').forEach((row, i) => {
    (row as HTMLElement).dataset.level = String(i + 1);
    (row as HTMLElement).dataset.done = String(h0.level >= i + 1);
  });
  p.append(list, h('p', 'bha-faint', `단계마다 두 캐릭터 전 능력치 +${pct(HX.perLevelBonus)}(영구). 재료 = ${SOUL_CRYSTAL_NAME} / ${HOGYOKU_SHARD_NAME} / ${RESONANCE_ESSENCE_NAME}. '공명' = 공명해야 열림. ${HX.halfLevel * 10}%까지 = ${HOGYOKU_STAGE_NAMES.half}, 그 뒤 = ${HOGYOKU_STAGE_NAMES.resonance} 필요. 합체하면 ${HX.halfLevel * 10 + 10}~100% 진행만 처음으로(오른 능력치는 남는다).`));
  return p;
}

/** 초월체 도감 (전시): 6칸, 모은 것은 이름·컨셉·몇 번째 합체, 못 모은 것은 ??? + 조건 공개 (GDD 244장 5) */
function transcendentDexPanel(save: SaveData): HTMLElement {
  const owned = new Map(save.transcendentDex.map((e) => [e.id, e]));
  const p = panel({ title: '초월체 도감', aside: `${owned.size} / ${TRANSCENDENTS.length}` });
  p.setAttribute('aria-label', '초월체 도감');
  p.dataset.owned = String(owned.size);
  const list = info(TRANSCENDENTS.map((d) => {
    const got = owned.get(d.id);
    return got
      ? { label: `${d.order}. ${d.name} · ${got.fusionIndex}번째 합체`, value: d.concept, mod: 'stack' as const }
      : { label: `${d.order}. ???`, value: `조건: ${transcendentConditionText(d.condition)}` };
  }));
  list.querySelectorAll('.bha-info__row').forEach((row, i) => {
    const d = TRANSCENDENTS[i]!;
    (row as HTMLElement).dataset.transcendent = d.id;
    (row as HTMLElement).dataset.owned = String(owned.has(d.id));
  });
  p.append(list);
  const line = bonusLine(save);
  p.append(h('p', 'bha-faint', line ? `보유 보너스: ${line}` : `보유 보너스: 붕옥 개발 단계마다 +${pct(HX.perLevelBonus)}, 초월체 1종마다 +${pct(HX.perTranscendentBonus)} (두 캐릭터 모두)`));
  if (owned.size >= TRANSCENDENTS.length) p.append(notice('rare', '초월체 6종을 모두 모았다. 칭호 「붕옥 완성」. 이후 합체는 막히고 육성은 계속된다.', { title: '붕옥 완성' }));
  return p;
}

/** 두 캐릭터 조건 표: 이름 · 등급(1위면 ✓) */
function rankChecklist(save: SaveData): HTMLElement {
  const tracks = allTracks(save);
  const dl = info(tracks.map((t) => {
    const f = getFaction(t.factionId);
    const top = trackIsTopRank(t);
    return { label: `${f.name} · ${trackName(t)}`, value: top ? `${rankLabel(f, rankOf(t.rank))} ✓` : `${rankLabel(f, rankOf(t.rank))} → ${rankLabel(f, 1)} 필요`, mod: top ? ('good' as const) : ('bad' as const) };
  }));
  dl.setAttribute('aria-label', '합체 조건');
  dl.querySelectorAll('.bha-info__row').forEach((row, i) => ((row as HTMLElement).dataset.top = String(trackIsTopRank(tracks[i]!))));
  return dl;
}

export interface HogyokuHandlers {
  onDevelop: () => void;
  onPreview: () => void;
  /** 화면을 떠나면 끊는다 (탭 가로 끌기) */
  signal?: AbortSignal;
}

/** 붕옥 창 오른쪽 탭 (C.421): 개발 / 단계 / 합체 / 도감 — 가방 장비 탭과 같은 가로 끌기 탭 */
export type HogyokuTab = 'develop' | 'steps' | 'fusion' | 'dex';
export const HOGYOKU_TABS: readonly { id: HogyokuTab; label: string }[] = [
  { id: 'develop', label: '개발' }, { id: 'steps', label: '단계' }, { id: 'fusion', label: '합체' }, { id: 'dex', label: '도감' },
];
let hogyokuTab: HogyokuTab = 'develop';

/** 불꽃 이펙트가 켜지는가 (C.421): 붕옥 개발 100%(완전 각성)일 때만. 합체 뒤 6~10단계가 0이 되면 꺼진다 */
export function hogyokuFlameOn(save: Pick<SaveData, 'hogyoku'>): boolean {
  return save.hogyoku.level >= HX.maxLevel;
}

/** 왼쪽 붕옥 그림 칸 (가방 장비 탭의 캐릭터 칸처럼): 붕옥 그림 크게(64 → 정수 배율) · 100%면 뒤에 불꽃 16프레임 반복 · 개발 % · 단계 이름 · 상태 띠 */
function orbFigure(save: SaveData, stage: ReturnType<typeof hogyokuStage>): HTMLElement {
  const hg = save.hogyoku;
  const fig = h('div', 'bha-hgorb');
  fig.setAttribute('aria-label', `붕옥 개발 ${hg.level * 10}%`);
  fig.dataset.level = String(hg.level);
  const stageBox = h('div', 'bha-hgorb__art');
  const flameSrc = hogyokuFlameOn(save) ? artSrc('hogyoku.flame') : null;
  if (flameSrc) {
    const flame = h('span', 'bha-hgorb__flame');
    flame.style.setProperty('--hg-flame', `url("${typeof document === 'undefined' ? flameSrc : new URL(flameSrc, document.baseURI).href}")`);
    flame.setAttribute('aria-hidden', 'true');
    stageBox.append(flame);
    fig.classList.add('is-full');
  }
  const orbSrc = artSrc('hogyoku.orb');
  if (orbSrc) {
    const img = h('img', 'bha-hgorb__img') as HTMLImageElement;
    img.src = orbSrc;
    img.alt = '';
    img.draggable = false;
    stageBox.append(img);
  } else stageBox.append(artIcon('prop.hogyoku', 'i-evolve'));
  fig.append(stageBox);

  const stages = h('div', 'bha-hogyoku__stages');
  stages.setAttribute('aria-label', '붕옥 상태');
  stages.dataset.stage = stage;
  for (const k of ['half', 'resonance', 'ready'] as const) {
    const on = k === stage;
    const c = chip(HOGYOKU_STAGE_NAMES[k], on ? 'rare' : undefined);
    if (!on) c.classList.add('is-off');
    c.dataset.stage = k;
    stages.append(c);
  }
  const who = h('div', 'bha-hgorb__who');
  who.append(h('b', '', `붕옥 개발 ${hg.level * 10}%`), h('small', '', hg.level > 0 ? HOGYOKU_STEP_NAMES[hg.level - 1] ?? '' : '개발 전'));
  fig.append(who, meter({ kind: hg.resonance ? 'sp' : 'stored', label: '개발', value: hg.level, max: HX.maxLevel, full: hg.level >= HX.maxLevel }), stages);
  return fig;
}

/** 개발 탭: 재료 3종 칸 · 다음 단계 강화 재료 · [개발] · 막힌 이유 · 설명 */
function developTab(save: SaveData, hd: HogyokuHandlers): HTMLElement[] {
  const hg = save.hogyoku;
  const gate = developGate(save);
  const max = hg.level >= HX.maxLevel;
  const core = panel({ title: max ? '개발 100% — 완전 각성' : `다음 ${gate.next * 10}% · ${HOGYOKU_STEP_NAMES[gate.next - 1] ?? ''}`, aside: max ? undefined : '드는 재료' });
  core.setAttribute('aria-label', '붕옥 개발');
  core.append(materialSlots(save, gate.cost));
  if (!max) {
    const btn = button({ label: `${gate.next * 10}% 개발 — 전 능력치 +${pct(HX.perLevelBonus)}`, icon: 'i-plus', variant: 'primary', block: true, disabled: !gate.ok, onClick: hd.onDevelop });
    btn.dataset.sc = 'hogyoku-develop';
    core.append(btn);
  }
  for (const m of gate.missing.filter((x) => x !== 'tab' && x !== 'max')) core.append(h('p', 'bha-faint', `· ${developBlockText(m)}`));
  const about = h('p', 'bha-faint', `붕옥 재료 3종을 바쳐 한 단계씩 개발한다. 단계마다 두 캐릭터 전 능력치 +${pct(HX.perLevelBonus)}(영구). ${HX.halfLevel * 10}%까지 = ${HOGYOKU_STAGE_NAMES.half}, 그 뒤 = ${HOGYOKU_STAGE_NAMES.resonance} 필요. 100%가 되면 합체할 수 있다. 재료 칸 ? = 얻는 곳.`);
  const line = bonusLine(save);
  return [core, ...(line ? [h('p', 'bha-small', `보유 보너스: ${line}`)] : []), about];
}

/** 합체 탭: 지금 두 캐릭터라면 → 「○○」 · 조건 · [합체 미리보기] */
function fusionTab(save: SaveData, hd: HogyokuHandlers): HTMLElement {
  const fusion = panel({ title: '초월체 합체', aside: provisionalTag('임시 조건') });
  fusion.setAttribute('aria-label', '초월체 합체');
  const pv = fusionPreview(save);
  if (pv.def) {
    const now = h('p', 'bha-small');
    now.dataset.preview = pv.def.id;
    now.append('지금 두 캐릭터라면 → ', h('b', '', `「${pv.def.name}」`));
    fusion.append(now);
  }
  fusion.append(h('p', 'bha-small', `붕옥 개발 100% + ${HOGYOKU_STAGE_NAMES.resonance} + 두 캐릭터 모두 등급 1위 → 두 캐릭터가 초월체 하나가 된다. 되돌릴 수 없다.`), rankChecklist(save));
  const fg = fusionGate(save);
  for (const m of fg.missing.filter((x) => x !== 'tab' && x !== 'rank')) fusion.append(h('p', 'bha-faint', `· ${fusionBlockText(m)}`));
  const prev = button({ label: '합체 미리보기', icon: 'i-chevron-right', variant: fg.ok ? 'danger' : 'ghost', block: true, disabled: !fg.ok, onClick: hd.onPreview });
  prev.dataset.sc = 'hogyoku-preview';
  fusion.append(prev);
  return fusion;
}

/** 붕옥 화면 (GDD 12-2·12-3, C.421 배치): 왼쪽 = 붕옥 그림 크게(100%면 뒤에 불꽃)·개발 %·단계 이름·상태 띠,
 *  오른쪽 = 탭(개발: 재료 3종 칸·[개발]·설명 / 단계: 개발 단계 목록 / 합체: 지금 두 캐릭터라면·조건 / 도감: 초월체 도감) */
export function hogyokuView(dev: Device, save: SaveData, hd: HogyokuHandlers): void {
  const stage = hogyokuStage(save);
  const sub = h('span');
  sub.append(`두 캐릭터가 재료를 같이 모은다 `, provisionalTag('임시 수치'));
  const head = lcdHead({ title: '붕옥', sub });

  const body = h('div', 'bha-hgbody');
  const fill = () => {
    body.replaceChildren(...(hogyokuTab === 'develop' ? developTab(save, hd) : hogyokuTab === 'steps' ? [stepList(save)] : hogyokuTab === 'fusion' ? [fusionTab(save, hd)] : [transcendentDexPanel(save)]));
    body.dataset.tab = hogyokuTab;
  };
  const tabs = categoryTabs(HOGYOKU_TABS.map((t) => ({ id: t.id, label: t.label })), hogyokuTab, (id) => {
    hogyokuTab = id as HogyokuTab;
    tabs.querySelectorAll<HTMLElement>('[role="tab"]').forEach((b) => {
      const on = b.dataset.tab === id;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
    });
    fill();
  }, '붕옥 분류');
  enableDragScroll(tabs, hd.signal); // 가방 장비 탭과 같은 가로 끌기 (GDD 9절)
  edgeCue(tabs, tabs.querySelector<HTMLElement>('.is-on'), hd.signal);
  fill();

  lcdPage(dev.view, { cls: 'bha-hogyoku-page' }, head, [orbFigure(save, stage)], [tabs, body]);
}

/** 합체 판정 줄 한 캐릭터: 종족 · 이름 · 속성 · 히든 · 환생 (공격 분류는 화면에 안 보임, GDD 137장 1) */
function charCard(t: Pick<SaveData, TrackKey>): HTMLElement {
  const f = getFaction(t.factionId);
  const inp = fusionInputOf(t);
  const p = panel({ title: `${f.name} · ${trackName(t)}`, aside: elementsMark([...inp.elements], f.id) });
  p.dataset.faction = t.factionId;
  const line = h('p', 'bha-small');
  line.append(`${inp.hidden ? '히든 진화체' : '일반 진화체'} · 환생 ${inp.rebirths}회 `);
  const mark = rebirthMark(inp.rebirths);
  if (mark) line.append(mark);
  p.append(line);
  return p;
}

/** 합체로 사라지는 것 / 남는 것 (GDD 22-3) */
export function fusionLists(): { gone: string[]; keeps: string[] } {
  return {
    gone: [
      '지금 두 캐릭터 (초월체 도감에 전시된다)',
      '두 캐릭터의 능력치·노력치·진화·특성·걸음·등급·등급 이력·수련·환생 횟수 — 새 두 캐릭터는 1단계 완전 초기 (환생 계승 없음)',
      `붕옥 개발 ${HX.halfLevel * 10 + 10}~100% 진행 (다음 합체를 위해 다시 개발)`,
    ],
    keeps: [
      '도감·칭호 기록, 초월체 도감',
      `붕옥 개발 ${HX.halfLevel * 10}%까지·공명, 개발로 오른 능력치 (새 캐릭터에도)`,
      `음식·가진 타일·${TRADE_CURRENCY_NAME}·${JADE_NAME}·남은 붕옥 재료`,
      '스토리 진행·보스 도감·입은 스킨',
    ],
  };
}

/** 합체 확인 1 (미리보기): 왼쪽 = 두 캐릭터, 오른쪽 = "이 조합이면 ○○" + 사라짐/남음 + [다음 — 최종 확인] */
export function fusionConfirmView(dev: Device, save: SaveData, hd: { onNext: (def: TranscendentDef) => void }): void {
  const pv = fusionPreview(save);
  const head = lcdHead({ title: '초월체 합체 — 확인 1/2', sub: `${allTracks(save).map((t) => getFaction(t.factionId).name).join(' + ')} → 초월체` });
  const left: HTMLElement[] = allTracks(save).map(charCard);
  const right: HTMLElement[] = [];
  if (pv.def) {
    const p = panel({ title: '이 조합이면', mod: 'accent', aside: provisionalTag('임시 조건') });
    p.setAttribute('aria-label', '합체 미리보기');
    p.dataset.preview = pv.def.id;
    p.append(h('p', 'bha-lcdpage__title', `「${pv.def.name}」${subjectParticle(pv.def.name)} 된다`), h('p', 'bha-small', pv.def.concept));
    p.append(h('p', 'bha-faint', pv.matched ? '두 캐릭터의 상태가 이 초월체의 조건에 맞았다.' : '조건이 맞는 초월체를 이미 가지고 있어, 아직 없는 초월체 중 표 아래쪽부터 채운다.'));
    if (save.transcendentDex.length === 0) p.append(h('p', 'bha-small', `첫 초월체 보상: ${JADE_NAME} +${HX.firstTranscendentJade}`));
    right.push(p);
  }
  const lists = fusionLists();
  const ul = (items: string[]) => {
    const u = h('ul', 'bha-stack bha-stack--tight');
    for (const t of items) u.append(h('li', 'bha-small', t));
    return u;
  };
  left.push(panel({ title: '사라진다' }, ul(lists.gone)), panel({ title: '남는다' }, ul(lists.keeps)));
  const next = button({ label: '다음 — 최종 확인', icon: 'i-chevron-right', variant: 'danger', block: true, disabled: !pv.def, onClick: () => pv.def && hd.onNext(pv.def) });
  next.dataset.sc = 'fusion-next';
  right.push(next);
  lcdPage(dev.view, { cls: 'bha-hogyoku-page bha-fusion-page' }, head, left, right);
}

/** 최종 확인(확인 2) 문구 */
export function fusionFinalText(def: TranscendentDef): { title: string; body: string } {
  return { title: '합체 최종 확인', body: `되돌릴 수 없다. 두 캐릭터는 「${def.name}」${subjectParticle(def.name)} 되어 사라지고, 새 두 캐릭터가 1단계부터 시작한다. (직전 상태는 자동 백업된다)` };
}

/**
 * 합체 연출: 하얗게 바랬다가 돌아오며 문구 3줄 → 결과(초월체 이름·컨셉, 사라진 두 캐릭터, 새 두 트랙 1단계, 보상) + [둥지로].
 * 3.4초 뒤 결과, [건너뛰기]로 바로. 환생 연출과 같은 bha-evolve 틀
 */
export function fusionView(root: HTMLElement, faction: FactionConfig, record: FusionRecord, save: SaveData, onDone: () => void): void {
  const def = tryGetTranscendent(record.transcendentId)!;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const linesSection = h('section');
  const lines = h('div', 'bha-evolve__lines');
  lines.setAttribute('aria-live', 'polite');
  ['붕옥이 두 영혼을 삼킨다.', '하나가 되었다.', `초월체 「${def.name}」.`].forEach((t, i) => {
    const line = h('p', 'bha-evolve__line', t);
    line.style.setProperty('--k', String(i));
    lines.append(line);
  });
  const result = h('section', 'bha-evolve__result');
  result.hidden = true;
  const show = () => {
    if (timer !== undefined) clearTimeout(timer);
    linesSection.hidden = true;
    result.hidden = false;
  };
  linesSection.append(h('span'), lines, asBack(button({ label: '건너뛰기', variant: 'ghost', onClick: show })));

  const main = h('div', 'bha-evolve__resmain');
  main.append(h('span', 'bha-evolve__eyebrow', `${record.index}번째 합체 · 초월체`), h('h1', 'bha-evolve__title', def.name), h('p', 'bha-evolve__path', def.concept));
  const home = asBack(button({ label: toward(faction.nestName), icon: 'i-nest', variant: 'primary', size: 'lg', block: true, onClick: () => {
    if (timer !== undefined) clearTimeout(timer);
    onDone();
  } }));
  main.append(home);
  const side = h('div', 'bha-evolve__resside');
  const got = panel({ title: '합체 결과', aside: provisionalTag('임시 수치') });
  const dl = h('dl', 'bha-infotable');
  const row = (label: string, value: string) => {
    const r = h('div', 'bha-info__row bha-info__row--stack');
    r.append(h('dt', '', label), h('dd', '', value));
    dl.append(r);
  };
  row('하나가 된 두 캐릭터', record.characters.map((c) => {
    const f = getFaction(c.factionId);
    const form = c.formId ? tryGetForm(c.formId) : undefined;
    return `${f.name} ${shownName(form ? formName(form, f.id, c.elements) : f.tierNames[c.tierIndex]!)}`;
  }).join(' + '));
  row('새로 시작', allTracks(save).map((t) => `${getFaction(t.factionId).name} 1단계 ${getFaction(t.factionId).tierNames[0]}`).join(' · '));
  row('초월체 도감', `${save.transcendentDex.length} / ${TRANSCENDENTS.length}`);
  row('보상', [record.jade ? `${JADE_NAME} +${record.jade}` : null, bonusLine(save)].filter(Boolean).join(' · ') || '없음');
  got.append(dl);
  side.append(got);
  if (save.transcendentDex.length >= TRANSCENDENTS.length) side.append(chip('칭호 「붕옥 완성」', 'rare'));
  result.append(main, side);

  mountApp(root, { cls: 'bha-evolve bha-rebirth bha-fusion' }, h('span', 'bha-evolve__burst'), linesSection, result);
  timer = setTimeout(show, 3400);
}
