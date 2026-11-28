// 진화 제단·진화 연출 (GDD 20-5). 문구는 종족 설정(tierNames, slotName, appearanceChange)·진화 데이터에서 읽는다.
// 진화 타이밍(걸음 수)·후보는 숨긴다(v4.1): 제단은 지금 진화체·속성·고유 특성만 보이고, 진화는 둥지에 돌아오면 저절로 일어난다.
import { abilityNameByEffect, formName, physProcText, tryGetForm } from '../data/evolution';
import { lookUnitName } from '../engine/evolution/lookDex';
import { STAT_IDS, type FormDef, type StatId, type Stats } from '../data/schema';
import { statName } from '../data/elements';
import { normalSlotNote } from '../data/help/textFormat';
import { ABILITY_SLOT_LABEL, abilityIdLine, abilityLines, combatEvolutionOf, equippedAbilitiesOf, transcendentTraitsOf, formAbilitiesOf, formDisplayName, isMaxTier, playerElementsOf, tierDisplayName, zeroStats, type AbilityGain, type AbilityLine, type EvolutionState } from '../engine/evolution';
import type { FactionConfig } from '../engine/faction';
import { BALANCE } from '../config/balance';
import { fixParticles } from '../engine/josa';
import { getDetachTrait } from '../engine/traitShop';
import { evoFormEntry, evoInvestOf, evoNumsOf, evoReleaseNums, evoText, fillEvoText } from '../data/evolution/uniques';
import { button, h, icon, mountApp, notice, panel, provisionalTag } from './bha/dom';
import { elementDot, elementsMark } from './bha/element';
import { toward } from './bha/nestLogic';
import { playCosmeticFx } from './bha/cosmeticFx';
import { devText, shownName } from './displayName';
import { asBack } from './bha/screenBack';
import { v2Icon } from './bha/iconMap';
import { heroEl } from './bha/battle';
import type { ArtUrls } from '../data/art/manifest';
import { loadPixelFx, playPixelFx, type PixelFxPlay } from './bha/pixelFx';
import { prefersReducedMotion } from './fxSettings';
import { confirmDialog } from './confirmDialog';

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

/** 내 몸의 투자율 (상태 화면 설명의 지금 값, C.535): effort = 그 몸 타입 노력치 투자율(공속 몸은 간격 기준), blockLv = 그 속성 블록 투자율 — 전투와 같은 값 */
export interface EvoInvestNow {
  effort: number;
  blockLv: number;
}

/** 4단계 진화체 고유 능력 줄 (GDD 8-7 1차, C.499): 고유 능력 · 특수 블록(있으면) · 해방(레스렉시온/만해) 변형 · 해방 없음. 데이터가 없는 진화체면 빈 목록.
 *  숫자는 하나만 (GDD 8-7 v6.195, C.535): invest(내 몸 투자율)가 있으면 지금 내 값, 없으면(도감 등) 기본값 — 능력치 투자 안내 괄호는 쓰지 않는다 */
export function evoUniqueLines(formId: string | null | undefined, factionId: string, releaseName: string, invest?: EvoInvestNow): { label: string; text: string }[] {
  const entry = evoFormEntry(formId, factionId);
  if (!entry || !formId) return [];
  const out: { label: string; text: string }[] = [];
  const n = evoNumsOf(formId, factionId);
  const base = Object.fromEntries(Object.entries(n).filter(([k]) => k !== 'release')) as Record<string, number>;
  const a = entry.ability;
  if (a) {
    const per = invest ? evoInvestOf(a, invest) : undefined;
    const fill = (t: string, nums: Record<string, number>): string => fillEvoText(t, nums, per);
    const name = evoText(a.name, factionId);
    out.push({ label: '고유 능력', text: `${name ? `${name} — ` : ''}${fill(evoText(a.description, factionId), base)}` });
    for (const sp of Object.values(a.specials ?? {})) {
      const d = evoText(sp.description, factionId);
      const off = evoText(sp.offNote, factionId); // 꺼진 동안 안내 (C.508)
      out.push({ label: '특수 블록', text: `「${evoText(sp.name, factionId)}」${d ? ` — ${fill(d, base)}` : ''}${off ? ` · ${fill(off, base)}` : ''}` });
    }
    if (a.releaseDescription) out.push({ label: releaseName, text: fill(evoText(a.releaseDescription, factionId), evoReleaseNums(n)) });
  }
  if (entry.release === 'none') out.push({ label: releaseName, text: '없음 — 해방하지 않는다' });
  return out;
}

/** 상태 화면 고유 능력 문단 (C.499): 줄마다 "고유 능력 — 설명". 없으면 null. 진화 정보 칸(진화체 이름·단계·속성 줄 아래)에 붙는다 (C.535, GDD 8-7 v6.195) */
export function evoUniqueParagraph(stat: EvolutionState, faction: FactionConfig, cls = 'bha-faint', invest?: EvoInvestNow): HTMLElement | null {
  const evo = combatEvolutionOf(stat);
  const lines = evoUniqueLines(evo.formId, faction.id, faction.liberation.name, invest);
  if (lines.length === 0) return null;
  const p = h('p', cls);
  p.dataset.evoUnique = String(lines.length);
  lines.forEach((l, i) => {
    if (i > 0) p.append(h('br'));
    p.append(h('b', '', l.label), ` ${l.text}`);
  });
  return p;
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
  /** 진화 뒤 외형 id (evolution.look — 모델 단위 진화체 이름, GDD 8-5 v6.096). 없으면 진화체 이름 */
  look?: string | null;
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
  /** 진화 전 그림 — 도트 진화 연출(종족 evolveFx)은 이 모습으로 시작해 임팩트 순간 art 로 바뀐다. 없으면 옛 연출(빛 속에서 드러남) */
  fromArt?: ArtUrls;
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

/** 진화 연출 갈고리 (GDD 8-5 v6.254, C.568): onCommit = 애니가 끝나 결과로 넘어가는 순간(진짜 진화를 여기서) ·
 *  onCancel = 3번 연달아 터치 → "진화를 취소할까?" [취소한다] — 없으면 터치 취소 없음(강제 진화·튜토리얼·테스트 패널) */
export interface EvolveCutHooks {
  onCommit?: () => void;
  onCancel?: () => void;
  /** 도감 다시 보기 (GDD 14-8 v6.256, C.570): 결과 화면 버튼 = [닫기](둥지로 대신). 연출만 — 진화하지 않는다 */
  replay?: boolean;
}

export const EVOLVE_CANCEL_TITLE = '진화를 취소할까?';

/** 연달아 터치 세기 (GDD 8-5 v6.254, C.568): 앞 터치와 간격이 gapMs 안이면 이어 세고 아니면 1부터. taps 번째면 true 를 돌려주고 0으로 */
export function tapCounter(taps: number, gapMs: number): (nowMs: number) => boolean {
  let n = 0;
  let last = -Infinity;
  return (nowMs) => {
    n = nowMs - last <= gapMs ? n + 1 : 1;
    last = nowMs;
    if (n < taps) return false;
    n = 0;
    last = -Infinity;
    return true;
  };
}

/** 멈출 수 있는 타이머 묶음 (C.568 연출 취소 창이 떠 있는 동안 애니·바뀌는 때·결과 넘김을 멈춘다) */
function pausableTimers() {
  type T = { fn: () => void; left: number; start: number; id: ReturnType<typeof setTimeout> | undefined };
  const list: T[] = [];
  let paused = false;
  const arm = (t: T) => {
    t.start = Date.now();
    t.id = setTimeout(() => {
      const i = list.indexOf(t);
      if (i >= 0) list.splice(i, 1);
      t.fn();
    }, t.left);
  };
  return {
    add(fn: () => void, ms: number): void {
      const t: T = { fn, left: ms, start: 0, id: undefined };
      list.push(t);
      if (!paused) arm(t);
    },
    pause(): void {
      if (paused) return;
      paused = true;
      for (const t of list) {
        if (t.id !== undefined) clearTimeout(t.id);
        t.id = undefined;
        t.left = Math.max(0, t.left - (Date.now() - t.start));
      }
    },
    resume(): void {
      if (!paused) return;
      paused = false;
      for (const t of list) arm(t);
    },
    clear(): void {
      for (const t of list.splice(0)) if (t.id !== undefined) clearTimeout(t.id);
    },
  };
}

/**
 * 진화 연출 → 결과 (evolve.html). 연출 = 화면 전체에 애니만(글줄·버튼·칩 등 다른 UI 없음 — GDD 8-5 v6.254, C.568), 3.6초 뒤 결과로 바뀐다.
 * hooks.onCancel 이 있으면 연출 중 화면을 3번 연달아(간격 balance evolution.cancel.tapGapMs 안) 누르면 연출이 멈추고 "진화를 취소할까?" [취소한다] [계속].
 * [계속](·기기 취소) = 멈춘 곳부터 이어서, [취소한다] = hooks.onCancel(진화하지 않음 — 화면을 닫는 것은 부른 쪽).
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
  hooks: EvolveCutHooks = {},
): void {
  const timers = pausableTimers();
  const burst = h('span', 'bha-evolve__burst');

  const linesSection = h('section');
  const crack = h('div', 'bha-evolve__crack');
  crack.append(v2Icon('spark', 'xl')); // 리디자인 v2: 깨진 가면(해골) 대신 두 종족 공통 '변화' 도트 아이콘 (GDD 183장 화면 D)
  // 새 진화체 그림 (GDD 241-B 7): 연출 동안 빛 속에서 모습이 드러나고(.bha-evolve__fig--reveal), 결과 왼쪽 판 맨 위에도. 그림이 없으면 옛 아이콘만
  const hasArt = (a?: ArtUrls): a is ArtUrls => !!a && !!(a.src || a.frames?.length || a.rig);
  const figOf = (cls: string, art = extra?.art): HTMLElement | null => {
    if (!hasArt(art)) return null;
    const fig = h('div', `bha-evolve__fig ${cls}`);
    fig.dataset.evolveFig = '';
    fig.append(heroEl(art).root);
    return fig;
  };
  // 도트 진화 연출 (사용자 2026-11-25): 종족 evolveFx 시트를 진화체 몸 가운데에 맞춰 재생 — 지금 진화체로 시작해 swapMs 임팩트 순간 다음 진화체로
  const pxCfg = faction.evolveFx && hasArt(extra?.fromArt) && hasArt(extra?.art) && !prefersReducedMotion() ? faction.evolveFx : null;
  const cutFig = figOf(pxCfg ? 'bha-evolve__fig--px' : 'bha-evolve__fig--reveal', pxCfg ? extra!.fromArt : extra?.art);
  if (cutFig) {
    crack.classList.add('has-fig');
    if (pxCfg) crack.classList.add('is-pixel');
    crack.append(cutFig);
  }
  // 진화 이유 (GDD 134장 3, C.211): 그 단계가 된 이유 1~2줄(종족 설정) — 결과 화면에만(연출 중 글줄 없음, v6.254). 실패 진화는 없음
  const reasons = extra?.failLine ? [] : (faction.evolutionReasons[to] ?? []);
  const resultSection = h('section', 'bha-evolve__result');
  const resultMain = h('div', 'bha-evolve__resmain');
  const resultSide = h('div', 'bha-evolve__resside');
  resultSection.hidden = true;

  let pxPlay: PixelFxPlay | null = null;
  const stopPx = () => {
    pxPlay?.stop();
    timers.clear();
  };
  let cutDone = false;
  const showResult = () => {
    if (cutDone) return;
    cutDone = true;
    stopPx();
    hooks.onCommit?.(); // 애니가 끝났다 — 여기서 진짜 진화 (C.568)
    linesSection.hidden = true;
    resultSection.hidden = false;
  };
  // 연출 = 애니만 (GDD 8-5 v6.254 — 옛 연출 글줄·[건너뛰기]·제안 문구 표시 없음)
  linesSection.dataset.evolveCut = '';
  linesSection.append(crack);

  const path = h('p', 'bha-evolve__path');
  const failLine = extra?.failLine === true;
  const shownTo = faction.tierNames[failLine ? 0 : to]!;
  path.append(`${from + 1}단계 `, h('b', '', faction.tierNames[failLine && form.label.kind !== 'fail' ? 0 : from]!), icon('i-chevron-right'), `${to + 1}단계 `, h('b', '', shownTo));
  const reason = reasons.length > 0 ? h('p', 'bha-small bha-dim', reasons.join(' ')) : null;
  if (reason) reason.dataset.evolveReason = '';
  const created = h('div', 'bha-evolve__new');
  for (const e of extra?.elements ?? form.elements ?? []) created.append(elementDot(e, faction.id));
  created.append(` 새 진화체: ${shownName(failLine ? shownTo : lookUnitName(faction, form, extra?.look) ?? formName(form, faction.id, extra?.elements ?? []))}`);
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

  const home = asBack(button({ label: hooks.replay ? '닫기' : toward(faction.nestName), icon: hooks.replay ? 'i-close' : 'i-nest', variant: 'primary', onClick: () => {
    stopPx();
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
  playCosmeticFx('evo', app); // 진화 연출 꾸밈 (GDD 25-11): 변하는 순간(연출 동안). 결과는 그대로
  timers.add(showResult, 3600);
  // 3번 연달아 터치 → 취소 확인 (GDD 8-5 v6.254, C.568): 연출이 멈추고(시트·바뀌는 때·결과 넘김·CSS/WAAPI 애니) 창. 결과 화면에서는 세지 않는다
  if (hooks.onCancel) {
    const C = BALANCE.provisional.evolution.cancel;
    const tap = tapCounter(C.taps, C.tapGapMs);
    const anims = (): Animation[] => (typeof app.getAnimations === 'function' ? app.getAnimations({ subtree: true }) : []);
    let asking = false;
    const pause = () => {
      timers.pause();
      pxPlay?.pause();
      for (const a of anims()) a.pause();
    };
    const resume = () => {
      asking = false;
      for (const a of anims()) a.play();
      pxPlay?.resume();
      timers.resume();
    };
    app.addEventListener('pointerdown', () => {
      if (cutDone || asking || !tap(performance.now())) return;
      asking = true;
      pause();
      confirmDialog({
        title: EVOLVE_CANCEL_TITLE,
        yes: '계속',
        no: '취소한다',
        cls: 'bha-evolve-cancel',
        onYes: resume,
        onCancel: resume, // 기기 취소·Esc = 계속 (실수로 취소되지 않게)
        onNo: () => {
          cutDone = true;
          stopPx();
          hooks.onCancel!();
        },
      });
    });
  }
  if (pxCfg && cutFig) playEvolvePixel(app, cutFig, pxCfg, extra!.fromArt!, extra!.art!, timers.add, (p) => { pxPlay = p; }, () => {
    // 시트를 못 받았다 → 옛 연출처럼 새 진화체가 빛 속에서 드러남
    cutFig.replaceChildren(heroEl(extra!.art!).root);
    cutFig.classList.replace('bha-evolve__fig--px', 'bha-evolve__fig--reveal');
    crack.classList.remove('is-pixel');
  });
}

/**
 * 도트 진화 연출 (사용자 2026-11-25 "사신 진화는 모델한테 영혼 모이면서, 점점 하얘지다가 다음 진화체로" · "임팩트 나오는 타이밍 맞춰서 다음 진화체 모델이 나오게" ·
 * "칼은 모델이 아니라 생각하고 몸만 기준으로 중앙배치"): 시트 기준점(= 진화체 몸 가운데)을 그림 상자 가운데에 놓는다 — 종이인형 그림 상자는 몸 가운데가
 * 상자 가운데라(무기는 몸 밖으로 뻗는다) 무기를 빼고 몸 기준이 된다. 하얘짐 = 같은 그림 한 겹을 흰 실루엣으로 덮어 투명도만 움직인다.
 */
function playEvolvePixel(
  app: HTMLElement, fig: HTMLElement, cfg: NonNullable<FactionConfig['evolveFx']>, fromArt: ArtUrls, toArt: ArtUrls,
  later: (fn: () => void, ms: number) => void, onPlay: (p: PixelFxPlay) => void, onFail: () => void,
): void {
  // 흰 겹 = 같은 그림을 한 장 더(종이인형은 동작을 따로 돌리므로 복사 대신 새로) — CSS 가 흰 실루엣으로 칠한다
  const whiteOf = (art: ArtUrls): HTMLElement => {
    const w = h('div', 'bha-evolve__fig-white');
    w.append(heroEl(art).root);
    return w;
  };
  const white = whiteOf(fromArt);
  if (cfg.whiten) fig.append(white);
  void loadPixelFx(cfg.fx).then((sheet) => {
    if (!fig.isConnected) return;
    if (!sheet) {
      white.remove();
      return onFail();
    }
    // 그림 상자(fig, 진화체 칸을 꽉 채움) 안에 붙인다 — 글줄이 떠오르며 칸이 움직여도 몸 가운데를 따라간다. 크기는 화면을 덮게(시트 = 화면 한 장)
    const a = app.getBoundingClientRect(), host = fig.parentElement ?? fig;
    const scale = Math.max(a.width / sheet.frame[0], a.height / sheet.frame[1]);
    const play = playPixelFx(host, sheet, { x: host.clientWidth / 2, y: host.clientHeight / 2, scale });
    play.el.classList.add('bha-evolve__px');
    onPlay(play);
    const w = cfg.whiten;
    if (w && typeof white.animate === 'function') white.animate([{ opacity: 0 }, { opacity: 1 }], { delay: w[0], duration: Math.max(1, w[1] - w[0]), easing: 'ease-in', fill: 'forwards' });
    later(() => {
      // 임팩트 순간: 다음 진화체로 (하얘졌다면 흰 채로 바뀌고 whiten[2] 동안 원래 색으로)
      const next = heroEl(toArt).root;
      fig.replaceChildren(next);
      if (!w) return;
      const wh = whiteOf(toArt);
      fig.append(wh);
      if (typeof wh.animate === 'function') wh.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Math.max(1, w[2]), easing: 'ease-out', fill: 'forwards' });
      else wh.remove();
    }, cfg.swapMs);
  });
}
