// 진화 제단·진화 연출 (GDD 20-5). 문구는 종족 설정(tierNames, slotName, appearanceChange)·진화 데이터에서 읽는다.
// 진화 타이밍(걸음 수)·후보는 숨긴다(v4.1): 제단은 지금 진화체·속성·고유 특성만 보이고, 진화는 둥지에 돌아오면 저절로 일어난다.
import { abilityNameByEffect, formName, physProcText, tryGetForm } from '../data/evolution';
import { STAT_IDS, type FormDef, type StatId, type Stats } from '../data/schema';
import { statName } from '../data/elements';
import { normalSlotNote } from '../data/help/textFormat';
import { ABILITY_SLOT_LABEL, abilityIdLine, abilityLines, combatEvolutionOf, equippedAbilitiesOf, transcendentTraitsOf, formAbilitiesOf, formDisplayName, isMaxTier, playerElementsOf, tierDisplayName, zeroStats, type AbilityGain, type AbilityLine, type EvolutionState } from '../engine/evolution';
import type { FactionConfig } from '../engine/faction';
import { BALANCE } from '../config/balance';
import { fixParticles } from '../engine/josa';
import { getDetachTrait } from '../engine/traitShop';
import { CUTSCENE_PROVISIONAL, cutsceneLines } from '../data/evolution/cutscene';
import { button, h, icon, mountApp, notice, panel, provisionalTag } from './bha/dom';
import { elementDot, elementsMark } from './bha/element';
import { toward } from './bha/nestLogic';
import { playCosmeticFx } from './bha/cosmeticFx';
import { devText, shownName } from './displayName';
import { asBack } from './bha/screenBack';
import { v2Icon } from './bha/iconMap';
import { heroEl } from './bha/battle';
import type { ArtUrls } from '../data/art/manifest';

const EV = BALANCE.provisional.evolution;

/** 외형 변화 문구: 호로 = 본체 파츠, 사신 = 본체 그대로 참백도 외형 (종족 설정 appearanceChange) */
export function appearanceText(faction: FactionConfig): string {
  return faction.appearanceChange ? '본체의 파츠가 변한다 (뿔·꼬리·가면 무늬)' : `본체는 그대로, ${faction.slotName}의 외형이 변한다`;
}

/** 종족값 한 줄 (예 "체력 61 · 힘 58 · …") */
export function statsLine(factionId: string, stats: Stats): string {
  return STAT_IDS.map((k) => `${statName(k, factionId)} ${stats[k]}`).join(' · ');
}

/** 진화체 설명 줄 (도감 상세): 종족값 · 외형 */
export function formEffectLines(faction: FactionConfig, form: FormDef): string[] {
  return [`${faction.slotName} +${EV.slotsPerEvolution}칸`, `종족값 ${statsLine(faction.id, form.stats)}`, form.stab ? `자기 속성 보정 ×${form.stab}` : '', appearanceText(faction)].filter(Boolean);
}

/** 지금 특성 줄 (GDD 39장 → 126-1 수정, C.220): 특성 칸에 낀 것 (보유·장착이 없는 옛 모양이면 진화체 특성 전부) */
export function evolutionAbilityLines(stat: EvolutionState, factionId: string): AbilityLine[] {
  // 초월자 전투 기반 (GDD 12-4 v6.037, C.436): 물공 블록 특성 등은 고른 기반의 진화체로 — 전투와 같은 규칙
  const evo = combatEvolutionOf(stat);
  const form = evo.formId ? tryGetForm(evo.formId) : undefined;
  return abilityLines(evo.abilities ? equippedAbilitiesOf(form ?? null, evo.abilities) : formAbilitiesOf(form ?? null, evo.ev, evo.ability), factionId);
}

/** 도감용 특성 줄: 성향은 진화 순간 노력치로 정해지므로 규칙만, 속성·전용은 진화체 label 로 */
export function dexAbilityLines(form: FormDef, factionId: string): AbilityLine[] {
  const fa = formAbilitiesOf(form, zeroStats(), null);
  const twin = formAbilitiesOf(form, zeroStats(), 'hp').dispositions.length > 1;
  return [{ slot: '성향', name: twin ? '노력치 1·2위 둘' : '노력치 최고 능력치', description: '진화하는 순간 정해진다' }, ...abilityLines(fa, factionId)];
}

/** 특성 줄 → 문단 (줄마다 "성향 특성 이름 — 설명"). 비면 "아직 없음" */
export function abilityParagraph(lines: readonly AbilityLine[], cls = 'bha-dim'): HTMLElement {
  const p = h('p', cls);
  p.dataset.abilities = String(lines.length);
  if (lines.length === 0) p.append('특성: 아직 없음 (진화하면 생긴다)');
  lines.forEach((l, i) => {
    if (i > 0) p.append(h('br'));
    const tag = h('span', '', `${ABILITY_SLOT_LABEL[l.slot]} 특성 `);
    tag.dataset.abilitySlot = l.slot;
    p.append(tag, h('b', '', l.name), ` — ${l.description}`);
  });
  return p;
}

/** 초월 특성 칸 (GDD 12-4 v6.039, C.436): 초월자 트랙만 — 전투 기반과 상관없이 늘 붙는 특성(기반 특성 칸과 별도). 내용 [미정]이면 '효과 없음' + 임시 표.
 *  상태 화면·가방 빌드 탭이 같이 쓴다. 초월 특성이 없으면 null */
export function transcendentTraitBlock(evo: Pick<EvolutionState, 'transcendentTraits'>): HTMLElement | null {
  const list = transcendentTraitsOf(evo);
  if (list.length === 0) return null;
  const box = h('div', 'bha-stack bha-stack--tight');
  box.dataset.transcendentTraits = String(list.length);
  const head = h('p', 'bha-small');
  head.append(h('b', '', '초월 특성'), ' · 전투 기반과 상관없이 늘 붙는다');
  box.append(head);
  for (const t of list) {
    const p = h('p', 'bha-faint');
    p.dataset.transcendentTrait = t.id;
    p.append(h('b', '', t.name), ` — ${t.description}`, t.empty ? ' · 효과 없음' : '');
    if (t.provisional) p.append(' ', provisionalTag());
    box.append(p);
  }
  return box;
}

/** 전투 중 특성 발동 글자 (연타! / 되갚기! / 다시 일어남! / 연쇄!) — 이름은 데이터에서 */
export function abilityProcText(effect: string, factionId: string): string {
  // 물공 블록·특성 발동 글자 (GDD 49장, 데이터 proc) → 없으면 특성 이름!
  return physProcText(effect, factionId) ?? `${abilityNameByEffect(effect, factionId) ?? effect}!`;
}

/**
 * 진화 제단 화면의 두 열: 왼쪽 = 단계·진화체 이름·속성·고유 특성 / 오른쪽 = 진화 안내(타이밍은 비밀) 또는 마지막 단계 안내.
 * own = 진화가 없는 트랙(초월자 — game.noEvolutionLabel)의 이름·종류: 진화체 이름·단계 대신 '초월자 이름 / 초월자 · 속성', 마지막 단계 안내 없음 (사용자 2026-11-15, GDD 12-4)
 */
export function evolutionColumns(faction: FactionConfig, evo: EvolutionState, own: { name: string; kind: string } | null = null): { left: HTMLElement[]; right: HTMLElement[] } {
  if (own) {
    const form = h('div', 'bha-evo__form');
    const els = h('span', 'bha-dim');
    els.append(`${own.kind} · 속성 `, elementsMark(playerElementsOf(evo), faction.id));
    form.append(h('span', 'bha-evo__formname', own.name), els);
    return { left: [form], right: [] };
  }
  // 실패형 줄기는 단계 이름·진화체 이름 모두 1단계 이름 (GDD 49-8 2번)
  const tierName = tierDisplayName(evo, faction.id);
  const current = evo.formId ? tryGetForm(evo.formId) : undefined;
  const form = h('div', 'bha-evo__form');
  const formName_ = h('span', 'bha-evo__formname', shownName(formDisplayName(evo, faction.id)));
  if (current?.provisional) formName_.append(' ', provisionalTag());
  const els = h('span', 'bha-dim');
  els.append(`${evo.tierIndex + 1}단계 · ${tierName} · 속성 `, elementsMark(playerElementsOf(evo), faction.id));
  form.append(formName_, els);
  const left = [form, abilityParagraph(evolutionAbilityLines(evo, faction.id))];
  if (isMaxTier(evo)) {
    return {
      left,
      right: [notice('rare', `더 이상 진화하지 않는다. ${faction.absorbActionName} 기록은 칭호 조건에 계속 쌓인다.`, { title: `마지막 단계(${tierName})에 도달했다`, icon: 'i-rare' })],
    };
  }
  // 진화 안내 글(타이밍은 비밀 …)은 도움말 [진화]로 옮겼다 (GDD 241-C 9, C.406) — 상태 화면에는 지금 진화체 정보만
  return { left, right: [] };
}

/** 진화 결과 화면에 넘기는 지금 상태: 속성·성향 특성·노력치(실패형 2위 성향) */
export interface EvolutionExtra {
  elements: string[];
  ability: StatId | null;
  ev?: Stats;
  /** 실패형 줄기 (GDD 49-8 2번): 단계·진화체 이름을 1단계 이름으로 */
  failLine?: boolean;
  /** 실제 종족값 (실패형 줄기 낮춤 반영). 없으면 진화체 값 */
  stats?: Stats;
  /** 이 진화로 특성 받은 결과 (GDD 148·149장, C.225·C.226)와 받은 뒤 그 특성 세기. 있으면 특성 행은 이 한 줄 */
  abilityGain?: AbilityGain;
  abilityScale?: number;
  /** 이 진화로 늘어난 특성 칸 (GDD 151장 2: 4단계 진화 처음 +1)과 늘어난 뒤 칸 수 */
  abilitySlotsAdded?: number;
  abilitySlots?: number;
  /** 새 진화체 그림 (GDD 241-B 7): 진화 뒤 캐릭터 그림(종이인형·스프라이트 그대로 — 전투 heroArtOf 와 같은 것). 없으면 옛 아이콘만 */
  art?: ArtUrls;
}

/** 진화 결과 화면에 넘길 특성 결과 (받은 뒤 세기는 보유 목록에서) */
export function gainExtra(evo: EvolutionState, gain: AbilityGain, slotsAdded = 0): Pick<EvolutionExtra, 'abilityGain' | 'abilityScale' | 'abilitySlotsAdded' | 'abilitySlots'> {
  return {
    abilityGain: gain,
    ...(gain.kind !== 'none' && evo.abilities?.owned[gain.id] !== undefined ? { abilityScale: evo.abilities.owned[gain.id] } : {}),
    ...(slotsAdded > 0 && evo.abilities ? { abilitySlotsAdded: slotsAdded, abilitySlots: evo.abilities.slots } : {}),
  };
}

/** 진화 결과 특성 한 줄 (GDD 148·149장): 새로 받음 / 3단계 특성 → 4단계 특성(바뀜) / 이미 가짐 / 칸이 없어 못 받음. 특성을 주지 않는 진화면 null */
export function abilityGainRow(gain: AbilityGain, scale: number, factionId: string): { icon: string; label: string; value: string; mod: 'good' | 'stack' } | null {
  if (gain.kind === 'none') return null;
  const line = abilityIdLine(gain.id, scale, factionId);
  if (!line) return null;
  const nameOf = (id: string) => abilityIdLine(id, 1, factionId)?.name ?? id;
  const gone = (ids: string[] | undefined) => (ids ?? []).map((id) => `${nameOf(id)} 사라짐 · `).join('');
  switch (gain.kind) {
    // 진화 특성 우선 (GDD 150장 3): 칸을 비우려고 뺀 탈착 특성은 안내 한 줄
    case 'new': return { icon: 'i-rare', label: '특성', value: `새로 받음 · ${line.name} — ${line.description}${gain.bumped ? fixParticles(` · 칸이 모자라 ${getDetachTrait(gain.bumped)?.name ?? gain.bumped}은(는) 보유 목록으로 뺐다`) : ''}`, mod: 'good' };
    case 'replaced': return { icon: 'i-rare', label: '특성', value: `${gone(gain.gone)}바뀜 · ${nameOf(gain.from)} → ${line.name} — ${line.description}`, mod: 'good' };
    case 'owned': return { icon: 'i-rare', label: '특성', value: `${gone(gain.gone)}${line.name} — 이미 가진 특성이라 다시 받지 않았다`, mod: 'stack' };
    case 'full': return { icon: 'i-rare', label: '특성', value: `특성 칸이 없어 받지 못했다 (${line.name})`, mod: 'stack' };
  }
}

/** 진화 후 달라진 점 행들(임시 수치): 슬롯·체력·속성·특성·능력치 한 줄 (GDD 176장 20: 외형 줄·종족값 수치 뺌) */
export function evolutionEffectRows(
  faction: FactionConfig, form: FormDef, _slotsAfter?: number, extra?: EvolutionExtra,
): { icon: string; label: string; value: string | Node; sub?: string; mod?: 'good' | 'stack' }[] {
  const slots = EV.slotsPerEvolution;
  const rows: { icon: string; label: string; value: string | Node; sub?: string; mod?: 'good' | 'stack' }[] = [
    {
      icon: 'i-slot', label: faction.slotName, mod: 'good',
      value: `+${slots}칸`, // 몇 칸 → 몇 칸·종족값 수치는 상태 화면·도감 상세에서 (GDD 176장 20)
    },
    { icon: 'i-heal', label: '체력', value: '가득 회복', mod: 'good' }, // 진화하면 체력 가득 (GDD 145장 2)
  ];
  if (extra) rows.push({ icon: 'i-weak', label: '속성', value: elementsMark(extra.elements, faction.id) });
  if (extra?.abilitySlotsAdded && extra.abilitySlots !== undefined) {
    rows.push({ icon: 'i-rare', label: '특성 칸', value: `+${extra.abilitySlotsAdded}칸`, mod: 'good' });
  }
  if (extra?.abilityGain) {
    const r = abilityGainRow(extra.abilityGain, extra.abilityScale ?? 1, faction.id);
    if (r) rows.push(r);
  } else {
    const lines = extra ? (extra.ev ? abilityLines(formAbilitiesOf(form, extra.ev, extra.ability), faction.id) : abilityLines(formAbilitiesOf(form, zeroStats(), extra.ability), faction.id)) : [];
    for (const l of lines) rows.push({ icon: 'i-rare', label: `${ABILITY_SLOT_LABEL[l.slot]} 특성`, value: `${l.name} — ${l.description}`, mod: 'stack' });
  }
  // 종족값 수치·외형 줄(개발자 말)은 빼고 한 줄 (GDD 176장 20) — 수치는 상태 화면·진화체 도감 상세
  rows.push({ icon: 'i-cond', label: '능력치', value: '진화체 기본 능력치가 바뀌었다', mod: 'stack' });
  return rows;
}

/**
 * 진화 연출 → 결과 (evolve.html). 연출 줄은 0.9초 간격으로 떠오르고(--k, CSS 지연) 3.6초 뒤 결과로 바뀐다.
 * [건너뛰기]로 바로 결과를 볼 수 있다. 연출 문구는 src/data/evolution/cutscene.json (종족 설정 값을 끼워 쓴다).
 */
export function evolutionView(
  root: HTMLElement,
  faction: FactionConfig,
  from: number,
  to: number,
  form: FormDef,
  onDone: () => void,
  slotsAfter?: number,
  extra?: EvolutionExtra,
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const burst = h('span', 'bha-evolve__burst');

  const linesSection = h('section');
  const crack = h('div', 'bha-evolve__crack');
  crack.append(v2Icon('spark', 'xl')); // 리디자인 v2: 깨진 가면(해골) 대신 두 종족 공통 '변화' 도트 아이콘 (GDD 183장 화면 D)
  // 새 진화체 그림 (GDD 241-B 7): 연출 동안 빛 속에서 모습이 드러나고(.bha-evolve__fig--reveal), 결과 왼쪽 판 맨 위에도. 그림이 없으면 옛 아이콘만
  const figOf = (cls: string): HTMLElement | null => {
    if (!extra?.art || (!extra.art.src && !extra.art.frames?.length && !extra.art.rig)) return null;
    const fig = h('div', `bha-evolve__fig ${cls}`);
    fig.dataset.evolveFig = '';
    fig.append(heroEl(extra.art).root);
    return fig;
  };
  const cutFig = figOf('bha-evolve__fig--reveal');
  if (cutFig) {
    crack.classList.add('has-fig');
    crack.append(cutFig);
  }
  const lines = h('div', 'bha-evolve__lines');
  lines.setAttribute('aria-live', 'polite');
  // 진화 이유 (GDD 134장 3, C.211): 그 단계가 된 이유 1~2줄(종족 설정)이 있으면 연출 마지막 줄을 대신하고 결과 화면에도 남는다. 실패 진화는 공통 줄 그대로
  const reasons = extra?.failLine ? [] : (faction.evolutionReasons[to] ?? []);
  const base = cutsceneLines(faction.id, { nest: faction.nestName, absorb: faction.absorbActionName, from: faction.tierNames[from]! });
  (reasons.length > 0 ? [...base.slice(0, -1), ...reasons] : base).forEach((t, i) => {
    const line = h('p', 'bha-evolve__line', t);
    line.style.setProperty('--k', String(i));
    lines.append(line);
  });
  const resultSection = h('section', 'bha-evolve__result');
  const resultMain = h('div', 'bha-evolve__resmain');
  const resultSide = h('div', 'bha-evolve__resside');
  resultSection.hidden = true;

  const showResult = () => {
    if (timer !== undefined) clearTimeout(timer);
    linesSection.hidden = true;
    resultSection.hidden = false;
  };
  const skip = asBack(button({ label: '건너뛰기', variant: 'ghost', onClick: showResult }));
  skip.classList.add('bha-evolve__go');
  // 리디자인 v2 (GDD 183장 화면 D): [건너뛰기] 와 결과의 [둥지로] 는 같은 아래 줄 오른쪽 자리 (173장 2 버튼 자리 고정)
  const skipDock = h('footer', 'bha-dock bha-evolve__dock');
  skipDock.append(skip);
  linesSection.append(crack, lines, skipDock);
  if (CUTSCENE_PROVISIONAL && devText()) linesSection.append(h('p', 'bha-faint', ''));
  if (CUTSCENE_PROVISIONAL && devText()) linesSection.lastElementChild!.append('연출 문구는 ', provisionalTag('제안 문구'));

  const path = h('p', 'bha-evolve__path');
  const failLine = extra?.failLine === true;
  const shownTo = faction.tierNames[failLine ? 0 : to]!;
  path.append(`${from + 1}단계 `, h('b', '', faction.tierNames[failLine && form.label.kind !== 'fail' ? 0 : from]!), icon('i-chevron-right'), `${to + 1}단계 `, h('b', '', shownTo));
  const reason = reasons.length > 0 ? h('p', 'bha-small bha-dim', reasons.join(' ')) : null;
  if (reason) reason.dataset.evolveReason = '';
  const created = h('div', 'bha-evolve__new');
  for (const e of extra?.elements ?? form.elements ?? []) created.append(elementDot(e, faction.id));
  created.append(` 새 진화체: ${shownName(failLine ? shownTo : formName(form, faction.id, extra?.elements ?? []))}`);
  if (form.hidden) created.append(' ', h('span', 'bha-chip bha-chip--rare', '히든'));
  if (form.provisional) created.append(' ', provisionalTag());

  const effects = panel({ title: '달라진 점', aside: provisionalTag('임시 수치'), mod: undefined });
  effects.classList.add('bha-evolve__effects');
  const dl = h('dl', 'bha-evolve__info'); // 옛 dl 목록 이름(.bha-info)은 v2 에서 ⓘ 버튼 — 이 화면은 제 이름으로
  for (const r of evolutionEffectRows(faction, form, slotsAfter, extra)) {
    const row = h('div', `bha-info__row${r.mod ? ` bha-info__row--${r.mod}` : ''}`);
    const dt = h('dt');
    dt.append(icon(r.icon), r.label);
    const dd = h('dd');
    dd.append(r.value);
    if (r.sub && r.mod === 'good') dd.append(' ', h('small', '', r.sub));
    row.append(dt, dd);
    dl.append(row);
  }
  effects.append(dl);

  const home = asBack(button({ label: toward(faction.nestName), icon: 'i-nest', variant: 'primary', onClick: () => {
    if (timer !== undefined) clearTimeout(timer);
    onDone();
  } }));
  home.classList.add('bha-evolve__go');
  const title = h('h1', 'bha-evolve__title', `${shownTo}!`);
  // 결과 = 머리(진화 · 단계 이름!) / 왼쪽 판 = 단계 경로 · 이유 · 새 진화체 / 오른쪽 판 = 달라진 점 / 아래 줄 = [둥지로]
  const resHead = h('header', 'bha-head bha-evolve__head');
  resHead.append(h('span', 'bha-badge bha-badge--brass bha-evolve__eyebrow', '진화'), title);
  resultMain.classList.add('bha-panel');
  const resFig = figOf('bha-evolve__fig--result');
  resultMain.append(...(resFig ? [resFig] : []), path, ...(reason ? [reason] : []), created);
  resultSide.append(effects); // 개발 메모 줄(진화 트리 임시·기획 20-5)은 GDD 168장 4 에서 삭제
  const resDock = h('footer', 'bha-dock bha-evolve__dock');
  resDock.append(home);
  resultSection.append(resHead, resultMain, resultSide, resDock);

  const app = mountApp(root, { cls: 'bha-evolve bha-v2 bha-evolvev2' }, burst, linesSection, resultSection);
  playCosmeticFx('evo', app); // 진화 연출 꾸밈 (GDD 25-11): 변하는 순간(연출 줄 동안). 결과·문구는 그대로
  timer = setTimeout(showResult, 3600);
}
