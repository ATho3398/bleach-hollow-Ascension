// 전투 화면 v3 (GDD 3-5, UI 디자인 U-2, R-2): 실시간 자동 전투 + 일자 8칸 스킬 블록 바. 원정과 연습이 같이 쓴다.
// 엔진 틱(0.1초)을 실시간 1x/2x 로 돌린다. 클릭(같은 블록 위에서 누르고 뗌) = 블록 사용(붙은 같은 블록이 함께 발동해 체인).
// 블록 순서는 바꿀 수 없다(GDD 17-2): 나온 순서대로 쓴다. 클릭 판정은 여기서, 엔진은 use 결과만 받는다.
// 텍스트는 FactionConfig·데이터에서 읽고 종족 id 로 분기하지 않는다.
// 화면 모양(DOM·클래스)은 디자인 패키지 battle.html 을 따른다. 전투는 고정 틱으로 계속 갱신되므로 DOM 을 통째로 다시 만들지 않고
// 바뀐 곳만 갱신한다(블록은 uid 로 같은 요소를 계속 쓰고, 묶음·삽입 막대는 달라졌을 때만 바꾼다).
import { enemyPatternKind } from '../data/enemies';
import { comboName } from '../data/evolution';
import { pickFaction } from '../data/schema';
import { traitAbbr, traitName } from '../data/traits';
import { absorbReasons } from '../engine/absorb';
import {
  BASIC_SKILL_ID, blockEffect, blockElementOf, canLiberate, chainGroupsOf, comboOf, sourceOf, drainCombatEvents, elapsedSeconds, LIBERATION_GAUGE_MAX, liberationActive, maxChain, runsOf, step, timeLeftSeconds,
  type Block, type CombatEvent, type CombatInput, type CombatParams, type CombatState,
} from '../engine/combat';
import { FAMILY_TIERS, familyOf, roomOf, type FactionConfig } from '../engine/faction';
import { frameTicks } from '../engine/tutorial';
import { button, chip, el, icon, meter, mountApp, notice, provisionalTag, setMeter, tag } from './bha/dom';
import { onHold } from './bha/hold';
import {
  blockEl, blockVisual, heroEl, chainLevelAt, cutEl, floatPool, groupCuts, floatSpot, foeArtOf, foeEl, heroArtOf, HURT_SPOTS, logLineEl, LOG_ICON, PATTERN_VIEW, pickAbbr, ABBR_LINE_CHARS,
  playOnce, replayOnce, runEl, runSpecs, secondsText, setText, trayEl, gaugeFill, gaugeSlots, headGaugeEl, trackTotal, type HeadGauge,
  type BlockSpec, type BlockVisual, type FloatKind, type FloatOpts, type LogRole, type RunSpec,
} from './bha/battle';
import { elementColor, elementDot, elementMark } from './bha/element';
import { weaknessesOf } from '../data/elements';
import { elementLocalRect, pointerLocal } from './bha/viewport';
import { battleLabels, comboBlockLabel, familyAbbr, familySkillName, liberationBlockLabel, skillBlockLabel, type BattleLabels } from './labels';
import { helpOverlay } from './helpView';
import { tutorialOverlay, type TutorialHandle } from './tutorialOverlay';
import { releaseUse, slotAt } from './pointer';
import { registerShortcutHandlers } from './bha/shortcuts';
import { currentViewState } from './viewScale';
import { cueOf, emitFeedback, hookAudioUnlock, strongestCue, type FxCue } from './fx';
import { locoOf, setLoco } from './bha/loco';
import { loadFxSettings, prefersReducedMotion } from './fxSettings';
import { attackFx, fxModeOf } from './attackFx';

export interface BattleViewOptions {
  /** 조우 연출 윗줄: 원정이면 바퀴·칸·타일 정보. 없으면 "전투 연습" */
  banner?: string;
  /** 있으면 화면 맨 위에 안내 한 줄(.bha-notice)을 보인다 (체험 전투 "기록되지 않음" 등) */
  notice?: string;
  /** 폭주 중이면 그 이름 (GDD 23-2, 종족 설정 frenzyName): 위 막대에 상태 칩, 화면 테두리 */
  frenzy?: string;
  /** 있으면 '그만두기' 버튼을 보인다 (원정 중에는 없다) */
  onQuit?: () => void;
  /** 있으면 전투 시작 직전에 첫 플레이 튜토리얼을 보여 준다 (GDD 14-2). 끝나거나 건너뛰면 한 번 불린다. 튜토리얼 동안 전투 시간은 멈춘다 */
  tutorial?: { onDone: () => void };
  /** 육성 단계(0부터): 단계별 캐릭터 그림 파일(char-<종족>-<번호>)을 고른다. 없으면 1단계 취급 */
  tierIndex?: number;
  /** 현재 진화체 id (이동 방식 GDD 18-11). 1단계는 null */
  formId?: string | null;
  /** 해방 버튼 (GDD 22-5): 있으면(5단계 이상) 저장 필살기 옆에 보인다. 쓸 수 있는지는 엔진 params.liberationEnabled, 못 쓰면 note(무엇이 부족한지 한 줄)와 함께 잠긴 버튼 */
  liberation?: { note: string | null };
  /** 전투가 끝나고 결과 오버레이의 버튼을 누르면 한 번 불린다 */
  onEnd: (s: CombatState) => void;
}

/** 블록 이름 (GDD 20장 v5.4): 스킬 = `속성_계열`·`속성_막기`·`속성_회복`(기본 블록 = 내 캐릭터 속성 + 블록 계열), 필살 = `필살`, 공허 = `공허`, 콤보 = `콤보_계열` */
export function blockName(b: Block, labels: BattleLabels, factionId: string, p: CombatParams): string {
  if (b.kind === 'special') return labels.specialBlock;
  if (b.kind === 'void') return labels.voidBlock;
  if (b.kind === 'combo') return comboBlockLabel(labels, comboOf(p, b.traitId)?.family);
  if (b.kind === 'liberation') return liberationBlockLabel(factionId, p.playerElements[0]);
  const src = sourceOf(p, b.traitId);
  const name = skillBlockLabel(labels, factionId, blockElementOf(p, b), b.family ?? src?.family, src?.role ?? 'attack');
  return name ?? (b.traitId && b.traitId !== BASIC_SKILL_ID ? traitName(b.traitId, factionId) : labels.skillBlock);
}

/** 블록 약어 = 블록 이름. 한 줄(4자)을 넘으면 `_` 뒤에서 줄을 나눈다 (예 노멀_ 막기) */
export function blockAbbr(b: Block, labels: BattleLabels, factionId: string, p: CombatParams): string {
  const name = blockName(b, labels, factionId, p);
  return pickAbbr(undefined, Array.from(name).length > ABBR_LINE_CHARS ? name.replace('_', '_ ') : name);
}

/** 사건의 스킬 블록 표시 이름 (기본 블록은 속성이 없으므로 내 캐릭터 속성) */
function eventBlockLabel(e: Extract<CombatEvent, { kind: 'block' }>, s: CombatState, labels: BattleLabels, factionId: string): string {
  const element = e.element ?? (e.traitId === BASIC_SKILL_ID ? s.params.playerElements[0] ?? null : null);
  return skillBlockLabel(labels, factionId, element, e.family, e.role) ?? (e.traitId && e.traitId !== BASIC_SKILL_ID ? traitName(e.traitId, factionId) : labels.skillBlock);
}

interface LogLine {
  role: LogRole;
  icon: string;
  text: string;
}

/** 사건 한 줄 (전투 연출 텍스트) */
function eventLine(e: CombatEvent, s: CombatState, labels: BattleLabels, factionId: string): LogLine | null {
  const n = (v: number) => Math.round(v);
  switch (e.kind) {
    case 'block': {
      // 블록 이름은 `속성_계열`(GDD 20장 v5.4), 계열 공격은 단계 기술 이름(17-3)을 뒤에 붙인다
      const skillName = e.block === 'skill' ? familySkillName(labels, e.family, e.chain) : null;
      const name = e.block === 'skill'
        ? `${eventBlockLabel(e, s, labels, factionId)}${e.chain > 1 ? ` ${labels.chain}${e.chain}` : ''}${skillName ? ` 「${skillName}」` : ''}`
        : e.block === 'special' ? labels.specialBlock : e.block === 'combo' ? comboBlockLabel(labels, comboOf(s.params, e.traitId)?.family) : e.block === 'liberation' ? liberationBlockLabel(factionId, e.element) : labels.voidBlock;
      const parts = [`${name}! ${n(e.damage)} 피해${e.matchup === 'strong' ? ` (${labels.matchupText.strong})` : e.matchup === 'weak' ? ` (${labels.matchupText.weak})` : ''}`];
      if (e.heal > 0) parts.push(`${labels.role.heal} +${n(e.heal)}`);
      if (e.guardSeconds > 0) parts.push(`${labels.role.guard} ${e.guardSeconds.toFixed(1)}초`);
      if (e.bonus === 'stagger') parts.push('적 행동 지연');
      if (e.bonus === 'reflect') parts.push('반사 준비');
      if (e.bonus === 'cleanse') parts.push('봉인 해제');
      if (e.block === 'void') parts.push(`${labels.riskGauge} ↑`);
      const text = parts.join(' · ');
      if (e.block === 'void') return { role: 'void', icon: 'i-void', text };
      if (e.block === 'special' || e.block === 'combo' || e.block === 'liberation') return { role: 'chain', icon: 'i-special', text };
      if (e.chain > 1) return { role: 'chain', icon: `i-chain-${Math.min(3, e.chain)}`, text };
      const role: LogRole = e.role ?? 'attack';
      return { role, icon: LOG_ICON[role], text };
    }
    case 'combo':
      return { role: 'chain', icon: 'i-special', text: `콤보! ${comboBlockLabel(labels, comboOf(s.params, e.comboId)?.family)} 블록이 생겼다 (${comboName(e.comboId, factionId)})` };
    case 'stored-use':
      return { role: 'chain', icon: 'i-stored', text: `${labels.storedSkill}! ${n(e.damage)} 피해 · ${labels.role.guard} ${e.guardSeconds}초 (남은 충전 ${e.charges})` };
    case 'stored-ready':
      return { role: 'chain', icon: 'i-stored', text: `${labels.storedSkill} 충전! (${e.charges}/${s.params.storedChargesMax})` };
    case 'heavy-cast':
      return { role: 'cast', icon: 'i-cast', text: `강공격 예고! ${e.seconds}초 안에 ${labels.role.guard} 블록으로 막아라` };
    case 'heavy-hit':
      return e.guarded
        ? { role: 'guard', icon: 'i-guard', text: `강공격을 막았다! ${n(e.damage)} 피해${e.reflected > 0 ? ` · ${n(e.reflected)} 반사` : ''}` }
        : { role: 'cast', icon: 'i-cast', text: `강공격 적중! ${n(e.damage)} 피해` };
    case 'seal':
      return { role: 'cast', icon: 'i-seal', text: `봉인! ${e.seconds}초 동안 ${labels.skillBlock} 생성 정지` };
    case 'stance':
      return { role: 'guard', icon: 'i-guard', text: `방어 자세! ${e.seconds}초 동안 내 블록 피해 감소 · 블록을 쓰면 반격` };
    case 'stance-end':
      return { role: 'guard', icon: 'i-guard', text: '방어 자세가 풀렸다' };
    case 'counter':
      return { role: 'cast', icon: 'i-cast', text: `반격! ${n(e.damage)} 피해${e.guarded ? ' (막기로 경감)' : ''}` };
    case 'shuffle':
      return { role: 'chain', icon: 'i-swap', text: '블록 바의 순서가 섞였다' };
    case 'liberate':
      return { role: 'chain', icon: 'i-special', text: `${labels.liberation.cutin} ${e.seconds}초 동안 능력치 상승 · ${liberationBlockLabel(factionId, s.params.playerElements[0])} ${e.blocks}칸` };
    case 'liberation-end':
      return { role: 'void', icon: 'i-risk', text: `${labels.liberation.endText} ${labels.riskGauge} +${Math.round(e.risk)}` };
    case 'end':
      return e.status === 'won' ? { role: 'chain', icon: 'i-flag-win', text: `${pickFaction(s.enemy.def.name, factionId)}을(를) 쓰러뜨렸다!` } : null;
    default:
      return null;
  }
}

function safeStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** 상태 칩 하나: 아이콘 + 이름 + 값(시간·횟수) */
function statusChip(mod: 'guard' | 'seal' | undefined, iconId: string, label: string): { root: HTMLElement; value: HTMLElement } {
  const root = el('span', mod ? `bha-chip bha-chip--${mod}` : 'bha-chip');
  const value = el('span', 'bha-chip__time');
  root.append(icon(iconId), label, ' ', value);
  root.hidden = true;
  return { root, value };
}

/** 상태 바 값 글자(첫 글자 노드)만 바꾼다 */
function setMeterValue(root: HTMLElement, value: number, max?: number): void {
  const t = root.querySelector('.bha-meter__value')?.firstChild;
  const text = String(value);
  if (t && t.nodeValue !== text) t.nodeValue = text;
  // 최대값이 바뀌는 경우(해방 중 최대 체력, GDD 22-5)
  const small = max === undefined ? null : root.querySelector('.bha-meter__value small');
  if (small && max !== undefined && small.textContent !== ` / ${max}`) {
    small.textContent = ` / ${max}`;
    root.setAttribute('aria-valuemax', String(max));
  }
}

export function battleView(root: HTMLElement, faction: FactionConfig, s: CombatState, opts: BattleViewOptions): void {
  const labels = battleLabels(faction);
  const p = s.params;
  const enemy = s.enemy.def;
  const enemyName = pickFaction(enemy.name, faction.id);
  const top = maxChain(p);
  const cap = p.trayCapacity;
  /** 설정 화면 '전투 효과' (피해 숫자·진동·효과음·흔들림). 전투 시작 때 읽는다 */
  const fx = loadFxSettings(safeStorage());
  if (fx.sound) hookAudioUnlock();
  /** 적 속성 칩 (GDD 20-2): 속성 + 약점 속성(원소만). 약점은 그 속성 블록이 ×1.2 */
  const weakIds = weaknessesOf([enemy.element]);
  const elementChip = (): HTMLElement => {
    const c = el('span', 'bha-chip bha-chip--weak');
    c.append(elementMark(enemy.element, faction.id));
    if (weakIds.length > 0) {
      c.append(' · ', icon('i-weak'), '약점 ');
      weakIds.forEach((w) => c.append(elementDot(w, faction.id)));
    }
    return c;
  };

  // ── 1. 적 이름·약점 (장면 왼쪽 위 칩) ──
  const foeName = el('div', 'bha-battle__foename');
  foeName.append(el('h1', 'bha-battle__name', enemyName));
  if (enemy.class === 'elite') foeName.append(tag('강적', 'elite'));
  if (enemy.provisional) foeName.append(provisionalTag());
  const weakChip = elementChip();
  const foeHead = el('header', 'bha-battle__foehead');
  foeHead.append(foeName, weakChip);

  const patternView = PATTERN_VIEW[enemyPatternKind(enemy)];
  if (patternView) {
    const pc = el('span', 'bha-chip bha-chip--pattern');
    pc.append(icon(patternView.icon), patternView.label);
    foeHead.append(pc);
  }

  // ── 2. 유닛 두 칸: 머리 위 게이지 / 그림 / 작은 체력바 (GDD 18-6) ──
  // 머리 위 게이지: 적 = 강공격 예고(시전 바, 항상 한 칸 자리를 지킨다) + 방어 자세, 나 = 봉인 + 막기. 엔진 이벤트·상태에서 읽기만 한다
  const castGauge = headGaugeEl('cast', 'i-cast', '강공격 예고');
  const stanceGauge = headGaugeEl('stance', 'i-guard');
  const sealGauge = headGaugeEl('seal', 'i-seal');
  const guardGauge = headGaugeEl('guard', 'i-guard');
  let blockedUntil = 0;
  let blockedDamage = 0;
  const heads = (...gauges: HeadGauge[]): HTMLElement => {
    const h = el('div', 'bha-unit__heads');
    h.append(...gauges.map((g) => g.root));
    return h;
  };
  const foeHeads = heads(castGauge, stanceGauge);
  foeHeads.dataset.help = 'battle.cast';
  const meHeads = heads(sealGauge, guardGauge);
  const totals = { seal: 0, guard: 0, stance: 0 };

  const foe = foeEl(enemy.class === 'elite' ? 'foe-b' : 'foe-a', elementColor(enemy.element), foeArtOf(enemy.id));
  // 내 그림 한 장 (몸통박치기 연출 대상, GDD 17-4). 그림 파일이 없으면 자리표시 도형
  const heroArt = heroArtOf(roomOf(faction), faction.id, opts.tierIndex ?? 0);
  const heroLoco = locoOf(faction, opts.formId, heroArt);
  const hero = heroEl(heroArt, heroLoco);

  const enemyMeter = meter({ kind: 'enemy', label: '적 체력', value: Math.ceil(s.enemy.hp - 1e-6), max: Math.round(s.enemy.maxHp), ghost: s.enemy.hp, compact: true });
  const playerMeter = meter({ kind: 'player', label: '내 체력', value: Math.ceil(s.player.hp - 1e-6), max: Math.round(s.player.maxHp), ghost: s.player.hp, compact: true });
  const unit = (cls: string, headsEl: HTMLElement, fig: HTMLElement, hp: HTMLElement): HTMLElement => {
    const u = el('div', `bha-unit ${cls}`);
    if (cls.includes('--me')) setLoco(u, heroLoco); // 유닛 틀에도 붙여 그림 크기(떠오를 여유)를 CSS 가 잡는다
    const figBox = el('div', 'bha-unit__fig');
    figBox.append(fig);
    const hpBox = el('div', 'bha-unit__hp');
    hpBox.append(hp);
    u.append(headsEl, figBox, hpBox);
    return u;
  };
  const units = el('div', 'bha-battle__units');
  units.append(unit('bha-unit--me', meHeads, hero.root, playerMeter), unit('bha-unit--foe', foeHeads, foe, enemyMeter));

  const floats = el('div', 'bha-battle__floats');
  const log = el('div', 'bha-log');
  log.setAttribute('aria-live', 'polite');
  log.dataset.help = 'battle.stage';
  const arena = el('section', 'bha-battle__arena');
  arena.setAttribute('aria-label', '전투 상황');
  // 효과 레이어: 번쩍임 한 장(투명도만 애니메이션). 조작을 막지 않는다
  const fxFlash = el('div', 'bha-fxflash');
  fxFlash.setAttribute('aria-hidden', 'true');
  // 계열 공격 효과·기술 이름 레이어 (GDD 19-2): 자국·투사체·광선·이름이 여기 뜬다. 조작을 막지 않는다
  const fxLayer = el('div', 'bha-afx-layer');
  fxLayer.setAttribute('aria-hidden', 'true');

  // ── 3. 내 상태: 영력(SP) 바 + 상태 칩 (블록 바 위 왼쪽) ──
  const voidChip = statusChip(undefined, 'i-void', labels.voidBlock);
  const chain3Chip = statusChip(undefined, 'i-chain-3', `${labels.chain}${top}`);
  const meStatus = el('div', 'bha-battle__mestatus');
  meStatus.append(voidChip.root, chain3Chip.root);
  const spMeter = meter({ kind: 'sp', label: labels.sp, icon: 'i-sp', value: Math.round(s.sp), max: p.spMax, compact: true });
  const spNoteText = el('span');
  const spNote = el('span', 'bha-battle__spnote');
  spNote.append(icon('i-special'), spNoteText);
  spNote.hidden = true;
  const spWrap = el('div', 'bha-battle__sp');
  spWrap.dataset.help = 'battle.sp';
  spWrap.append(spMeter, spNote);

  // ── 4. 블록 바 ──
  const tray = trayEl(cap);
  tray.root.dataset.help = 'battle.tray';
  tray.grid.dataset.help = 'battle.runrow';
  const trayNote = el('p', 'bha-tray__note');
  // 범례: 역할 = 아이콘 + 색 (칸 안에는 이름 대신 약어와 아이콘)
  const legend = el('div', 'bha-legend');
  legend.dataset.help = 'battle.legend';
  legend.setAttribute('aria-label', '범례');
  const legendItem = (mod: string, iconId: string, text: string) => {
    const it = el('span', `bha-legend__item bha-legend__item--${mod}`);
    it.append(icon(iconId), el('span', '', text));
    return it;
  };
  legend.append(
    legendItem('attack', 'i-attack', labels.role.attack),
    legendItem('guard', 'i-guard', labels.role.guard),
    legendItem('heal', 'i-heal', labels.role.heal),
    legendItem('special', 'i-special', labels.specialBlock),
    legendItem('void', 'i-void', labels.voidBlock),
    ...(p.combos.length > 0 ? [legendItem('special', 'i-special', '콤보 블록')] : []),
  );

  // 저장 필살기 버튼 (GDD 14-6): 블록과 같은 클릭 판정. 충전 칸 3개 + 게이지
  const storedBtn = el('button', 'bha-stored is-disabled');
  storedBtn.type = 'button';
  storedBtn.dataset.help = 'battle.stored';
  const storedMeta = el('span', 'bha-stored__meta');
  const storedGaugeFill = el('i');
  const storedGauge = el('span', 'bha-stored__gauge');
  storedGauge.append(storedGaugeFill);
  const storedName = el('span', 'bha-stored__name');
  storedName.append(el('span', '', labels.storedSkill), provisionalTag());
  const storedBody = el('span', 'bha-stored__body');
  storedBody.append(storedName, storedMeta, storedGauge);
  const storedIcon = el('span', 'bha-stored__icon');
  storedIcon.append(icon('i-stored'));
  const storedPipRow = el('span', 'bha-stored__pips');
  const storedPips = Array.from({ length: p.storedChargesMax }, () => el('i'));
  storedPipRow.append(...storedPips);
  storedBtn.append(storedIcon, storedBody, storedPipRow);

  // 해방 버튼 (GDD 22-5): 5단계 이상이면 저장 필살기 옆. 게이지가 차면 누를 수 있고(전투당 1회), 자격이 없으면 잠겨 있다
  const libOn = !!opts.liberation;
  const libBtn = el('button', 'bha-stored bha-stored--liberation is-disabled');
  libBtn.type = 'button';
  const libIcon = el('span', 'bha-stored__icon');
  libIcon.append(icon(p.liberationEnabled ? 'i-special' : 'i-lock'));
  const libName = el('span', 'bha-stored__name');
  libName.append(el('span', '', labels.liberation.name), provisionalTag());
  const libMeta = el('span', 'bha-stored__meta');
  const libGaugeFill = el('i');
  const libGauge = el('span', 'bha-stored__gauge');
  libGauge.append(libGaugeFill);
  const libBody = el('span', 'bha-stored__body');
  libBody.append(libName, libMeta, libGauge);
  libBtn.append(libIcon, libBody);
  libBtn.hidden = !libOn;
  if (!p.liberationEnabled) libBtn.classList.add('is-locked');
  const libChip = statusChip(undefined, 'i-special', labels.liberation.name);
  libChip.root.classList.add('bha-chip--liberation');
  libChip.root.hidden = true;
  meStatus.prepend(libChip.root);
  // 해방 컷인 (공통 연출 하나, 11-5 변주는 미정): 장면 위에 한 줄
  const libCut = el('div', 'bha-libcut');
  libCut.setAttribute('aria-hidden', 'true');
  libCut.append(el('span', 'bha-libcut__text', labels.liberation.cutin));

  // 블록 바 바로 위 줄: 왼쪽 = 영력 바·상태 칩·범례, 오른쪽 = 저장 필살기 버튼(엄지가 닿는 자리) (GDD 18-6)
  const midInfo = el('div', 'bha-battle__midinfo');
  const spRow = el('div', 'bha-battle__sprow');
  spRow.append(spWrap, meStatus);
  midInfo.append(spRow, legend);
  const mid = el('div', 'bha-battle__mid');
  mid.append(midInfo, ...(libOn ? [libBtn] : []), storedBtn);
  const controls = el('section', 'bha-battle__controls');
  controls.setAttribute('aria-label', '블록 조작');
  controls.append(mid, tray.root, trayNote);

  // ── 7. 하단 컨트롤 ──
  let speed = 1;
  let paused = false;
  /** 튜토리얼·도움말·조우 연출이 열려 있는 동안 true: 엔진 시간이 흐르지 않고 입력도 받지 않는다 (결정성에 영향 없음, engine/tutorial frameTicks) */
  let overlayOpen = false;
  let tutorialOpen = false;
  let stopped = false;
  const halted = () => paused || overlayOpen;

  const speedBtn = button({ iconOnly: true, size: 'small', label: '배속 바꾸기' });
  const speedText = el('span', 'bha-num', '1x');
  speedText.style.fontWeight = '800';
  speedBtn.append(speedText);
  const pauseBtn = button({ iconOnly: true, size: 'small', label: '일시정지', icon: 'i-pause' });
  pauseBtn.dataset.devConfirm = ''; // 기기 [확정] 버튼 = 일시정지 (전투는 터치 위주, dev-log C.25)
  const helpBtn = button({ iconOnly: true, size: 'small', label: '도움말', icon: 'i-help' });
  const timeNum = el('b', '', String(Math.ceil(timeLeftSeconds(s))));
  const timeEl = el('span', 'bha-battle__time');
  timeEl.append(icon('i-timer'), el('span', 'bha-battle__timelabel', '남은 시간'), ' ', timeNum, '초');
  // 위 오른쪽 모서리: 남은 시간 + (그만두기) + 배속·일시정지·도움말을 작게
  const bar = el('div', 'bha-battle__bar');
  bar.append(timeEl);
  let quitBtn: HTMLButtonElement | null = null;
  if (opts.onQuit) {
    quitBtn = button({ label: '그만두기', iconOnly: true, size: 'small', icon: 'i-quit' });
    quitBtn.classList.add('bha-btn--quit');
    quitBtn.onclick = () => quit();
    bar.append(quitBtn);
  }
  bar.append(speedBtn, pauseBtn, helpBtn);
  if (opts.frenzy) {
    const fc = chip(opts.frenzy, 'danger');
    fc.classList.add('bha-frenzychip');
    fc.prepend(icon('i-risk', 'sm'));
    bar.prepend(fc);
  }

  const flashVoid = el('div', 'bha-edgeflash bha-edgeflash--void');
  const flashHit = el('div', 'bha-edgeflash bha-edgeflash--hit');

  // 한 열 (GDD 18-6): 장면(적 이름·모서리 버튼·유닛 둘·로그가 그 위에 얹힘) / 영력·저장 필살기 줄 / 좌우 폭 전부를 쓰는 블록 바 8칸
  const topRow = el('div', 'bha-battle__toprow');
  topRow.append(foeHead, bar);
  arena.append(units, topRow, fxLayer, floats, fxFlash, libCut, log);
  const app = mountApp(root, { fixed: true, cls: 'bha-battle' }, ...(opts.notice ? [notice('info', opts.notice)] : []), arena, controls, flashVoid, flashHit);
  app.classList.toggle('is-frenzy', !!opts.frenzy);

  const quit = () => {
    stopped = true;
    opts.onQuit?.();
  };

  // ── 오버레이 (조우 · 일시정지 · 결과) ──
  let overlayEl: HTMLElement | null = null;
  const showOverlay = (inner: HTMLElement): HTMLElement => {
    overlayEl?.remove();
    const ov = el('div', 'bha-overlay bha-overlay--in-app');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    const ovTitle = inner.querySelector('h2');
    if (ovTitle) {
      ovTitle.id = 'bha-battle-ov-title';
      ov.setAttribute('aria-labelledby', ovTitle.id);
    }
    ov.append(inner);
    app.append(ov);
    overlayEl = ov;
    return ov;
  };
  const hideOverlay = () => {
    overlayEl?.remove();
    overlayEl = null;
  };
  const ovMark = (iconId: string, color?: string) => {
    const m = el('span', 'bha-battle-ov__mark');
    m.append(icon(iconId));
    if (color) m.style.color = color;
    return m;
  };

  // ── 튜토리얼·도움말 ──
  let tutorial: TutorialHandle | null = null;
  let tutorialPractice = false;
  const syncPausedLook = () => app.classList.toggle('is-paused', paused || (tutorialOpen && !tutorialPractice));
  const startTutorial = () => {
    if (tutorial) return;
    overlayOpen = true;
    tutorialOpen = true;
    syncPausedLook();
    tutorial = tutorialOverlay(faction, {
      // 직접 해 보기 장면: 전투가 다시 흐르고 블록 바를 만질 수 있다. 장면을 나가면 다시 멈춘다
      onPractice: (on) => {
        tutorialPractice = on;
        overlayOpen = !on;
        syncPausedLook();
      },
      onFinish: () => {
        tutorialPractice = false;
        tutorial = null;
        overlayOpen = false;
        tutorialOpen = false;
        syncPausedLook();
        opts.tutorial?.onDone();
      },
    });
  };
  const openHelp = () => {
    if (overlayOpen) return;
    overlayOpen = true; // 열려 있는 동안 전투를 멈춘다
    helpOverlay(faction, { screen: 'battle', onClose: () => (overlayOpen = false), onReplayTutorial: () => { overlayOpen = false; startTutorial(); } });
  };
  helpBtn.onclick = openHelp;
  pauseBtn.dataset.sc = 'pause';
  speedBtn.dataset.sc = 'speed';
  helpBtn.dataset.sc = 'help';
  storedBtn.dataset.sc = 'stored';
  libBtn.dataset.sc = 'liberate';
  tray.cells.forEach((c, i) => (c.dataset.sc = `block.${i + 1}`));

  // ── 일시정지·배속 ──
  const setPaused = (on: boolean) => {
    if (s.status !== 'playing' || overlayOpen) return;
    paused = on;
    attack.setPaused(halted());
    pauseBtn.replaceChildren(icon(on ? 'i-play' : 'i-pause'));
    pauseBtn.setAttribute('aria-label', on ? '계속' : '일시정지');
    tray.root.classList.toggle('is-paused', on);
    syncPausedLook();
    if (!on) return hideOverlay();
    const inner = el('div', 'bha-battle-ov');
    const actions = el('div', 'bha-battle-ov__actions');
    actions.append(button({ label: '계속', variant: 'primary', size: 'lg', icon: 'i-play', onClick: () => setPaused(false) }));
    const row = el('div', 'bha-grid2');
    row.append(button({ label: '도움말', icon: 'i-help', onClick: openHelp }));
    if (opts.onQuit) row.append(button({ label: '그만두기', variant: 'danger', icon: 'i-quit', onClick: () => quit() }));
    actions.append(row);
    inner.append(ovMark('i-pause'), el('h2', 'bha-battle-ov__title', '일시정지'), el('p', 'bha-battle-ov__sub', '전투가 멈춰 있다. 블록 바와 시간도 멈춘다.'), actions);
    showOverlay(inner);
  };
  pauseBtn.onclick = () => setPaused(!paused);
  // 처음 화면 복귀 확인창(Q-3)이 열리면 전투를 멈추고, 아니오로 닫히면 우리가 멈춘 것만 풀어 준다
  let heldByApp = false;
  const offHold = onHold((sig) => {
    if (!app.isConnected || stopped) return offHold();
    if (sig === 'hold') {
      if (!paused && !overlayOpen && s.status === 'playing') {
        setPaused(true);
        heldByApp = true;
      }
    } else if (sig === 'release') {
      if (heldByApp && paused) setPaused(false);
      heldByApp = false;
    } else {
      stopped = true;
      tutorial?.dismiss(); // 튜토리얼은 본 것으로 치지 않는다 (다음 첫 전투에서 다시)
      tutorial = null;
      offHold();
    }
  });
  speedBtn.onclick = () => {
    speed = speed === 1 ? 2 : 1;
    attack.setSpeed(speed);
    setText(speedText, `${speed}x`);
    speedBtn.classList.toggle('is-on', speed === 2);
  };

  // ── 사건 로그 · 플로팅 숫자 · 번쩍임 ──
  const lines: HTMLElement[] = [];
  const say = (line: LogLine) => {
    const node = logLineEl(line.role, line.icon, line.text);
    log.append(node);
    lines.push(node);
    while (lines.length > 3) lines.shift()!.remove();
    playOnce(node, 'is-new');
  };
  let floatCount = 0;
  let hurtCount = 0;
  const pool = floatPool(floats);
  /** 피해 숫자(내가 준 것·받은 것·공허)는 설정에서 끌 수 있다. 막기·회복·체인 표시는 그대로 */
  const spawnFloat = (kind: FloatKind, text: string, opt: FloatOpts = {}) => {
    if (!fx.damageNumbers && (kind === 'attack' || kind === 'hurt' || kind === 'void')) return;
    pool.show(kind, text, kind === 'hurt' ? HURT_SPOTS[hurtCount++ % HURT_SPOTS.length]! : floatSpot(floatCount++), opt);
  };
  /** 번쩍임: 한 번에 한 종류만 */
  const FLASH_CLASSES = ['is-chain2', 'is-chain3', 'is-guard', 'is-cast', 'is-special', 'is-win', 'is-lose'];
  const flash = (cls: string, ms = 500) => {
    fxFlash.classList.remove(...FLASH_CLASSES);
    replayOnce(fxFlash, cls, ms);
  };
  /** 화면 흔들림은 무대(블록 바 밖)만, 짧게. 블록 판정 좌표에는 영향이 없다 */
  const shake = () => {
    if (fx.shake) replayOnce(arena, 'is-shake', 320);
  };
  const cues: FxCue[] = [];
  /** 공격 연출 (GDD 17-4): 사건이 난 뒤 연출만 얹는다. 모션 줄이기·화면 흔들림 끔이면 돌진 없이 번쩍임만 */
  const attack = attackFx({
    player: { root: hero.root, body: hero.body, dir: 1, loco: heroLoco },
    enemy: { root: foe, body: foe.querySelector<HTMLElement>('.bha-foe__body')!, dir: -1 },
    top,
    mode: fxModeOf(prefersReducedMotion(), fx.shake),
    unit: () => 1.6, // 장면이 커졌으므로 물러남·밀림 거리도 함께 키운다
    // 계열별 공격 (GDD 19-2): 연출 종류는 종족 설정 계열 데이터(fx)에서, 기술 이름은 17-3 단계 기술 이름
    layer: fxLayer,
    familyFx: (id) => familyOf(faction, id)?.fx,
    nameOf: (e) => {
      if (e.kind === 'stored-use') return { name: labels.storedSkill, ult: true };
      if (e.kind !== 'block' || e.damage <= 0) return null;
      if (e.block === 'special') return { name: labels.specialBlock, ult: true };
      if (e.block === 'combo') return { name: e.traitId ? comboName(e.traitId, faction.id) : labels.specialBlock, ult: true };
      if (e.block !== 'skill' || e.role !== 'attack') return null;
      const name = familySkillName(labels, e.family, Math.min(e.chain, FAMILY_TIERS));
      return name ? { name } : null;
    },
    shake,
  });
  const n0 = (v: number) => String(Math.round(v));
  let specialNoteUntil = 0;
  const react = (e: CombatEvent) => {
    const cue = cueOf(e, top);
    if (cue) cues.push(cue);
    attack.react(e);
    if (e.kind === 'block' || e.kind === 'stored-use') tutorial?.blockUsed();
    switch (e.kind) {
      case 'player-attack':
        break;
      case 'block': {
        if (e.block === 'void') {
          spawnFloat('void', `−${n0(e.damage)}`, { iconId: 'i-void' });
          replayOnce(flashVoid, 'is-on', 900);
        } else if (e.block === 'skill' && e.role === 'guard') {
          spawnFloat('guard', secondsText(e.guardSeconds), { iconId: 'i-guard' });
        } else if (e.block === 'skill' && e.role === 'heal') {
          spawnFloat('heal', n0(e.heal));
        } else {
          spawnFloat('attack', `−${n0(e.damage)}`, { crit: e.chain >= top, weak: e.matchup === 'strong', chained: e.chain > 1 });
        }
        // 상성 문구 (GDD 20-2, 종족 설정 matchupText)
        if (e.matchup === 'strong') spawnFloat('strong', labels.matchupText.strong);
        else if (e.matchup === 'weak') spawnFloat('dull', labels.matchupText.weak);
        if (e.chain > 1) {
          // 계열 공격은 단계 기술 이름을 공격 연출이 장면 위쪽에 크게 띄운다(GDD 19-2). 그 밖(막기·회복·기본 블록)은 체인 N
          if (!familySkillName(labels, e.family, e.chain)) spawnFloat('chain', `${labels.chain}${e.chain}!`, { chain3: e.chain >= top });
          flash(e.chain >= top ? 'is-chain3' : 'is-chain2');
        }
        if (e.block === 'special' || e.block === 'combo') flash('is-special', 600);
        break;
      }
      case 'combo':
        spawnFloat('chain', `콤보! ${comboName(e.comboId, faction.id)}`, { chain3: true });
        flash('is-special', 600);
        break;
      case 'liberate':
        replayOnce(libCut, 'is-on', 1400);
        flash('is-special', 700);
        shake();
        break;
      case 'liberation-end':
        replayOnce(flashVoid, 'is-on', 900);
        break;
      case 'stored-use':
        spawnFloat('attack', `−${n0(e.damage)}`, { crit: true });
        spawnFloat('guard', secondsText(e.guardSeconds), { iconId: 'i-guard' });
        flash('is-special', 600);
        break;
      case 'enemy-attack':
        if (e.guarded) {
          spawnFloat('guard', labels.role.guard, { iconId: 'i-guard' });
          flash('is-guard');
        } else if (e.damage > 0) {
          replayOnce(flashHit, 'is-on', 600);
          spawnFloat('hurt', `−${n0(e.damage)}`);
        }
        break;
      case 'heavy-hit':
        if (e.guarded) {
          blockedUntil = performance.now() + 1200;
          blockedDamage = e.damage;
          spawnFloat('guard', labels.role.guard, { iconId: 'i-guard' });
          flash('is-guard', 600);
        } else {
          replayOnce(flashHit, 'is-on', 600);
          spawnFloat('hurt', `−${n0(e.damage)}`, { crit: true });
          shake();
        }
        break;
      case 'heavy-cast':
        flash('is-cast', 600);
        break;
      case 'counter':
        if (e.guarded) {
          flash('is-guard');
        } else {
          replayOnce(flashHit, 'is-on', 600);
          spawnFloat('hurt', `−${n0(e.damage)}`);
        }
        break;
      case 'end':
        flash(e.status === 'won' ? 'is-win' : 'is-lose', 900);
        break;
      case 'spawn':
        if (e.block === 'special' || e.block === 'combo') {
          specialNoteUntil = performance.now() + 1800;
          replayOnce(spMeter, 'is-burst', 900);
        }
        break;
      default:
        break;
    }
  };

  // ── 블록 바 그리기 (바뀐 곳만) ──
  /** 누르고 있는 블록: uid 로 추적한다 (그 사이 앞 블록이 쓰여 칸 번호가 바뀌어도 따라간다) */
  let down: { uid: number; id: number } | null = null;
  const indexOfUid = (uid: number) => s.tray.findIndex((b) => b.uid === uid);
  const blockEls = new Map<number, HTMLElement>();
  const placedAt = new Map<number, number>();
  let seeded = false;
  let runSig = '';
  let runEls: { spec: RunSpec; node: HTMLElement }[] = [];
  let cutEls: HTMLElement[] = [];
  let noteKey = '';

  const makeBlock = (b: Block): HTMLElement => {
    const eff = blockEffect(s, b);
    const isBasic = b.kind === 'skill' && (b.traitId === BASIC_SKILL_ID || !b.traitId);
    const spec: BlockSpec = {
      visual: blockVisual(b.kind, isBasic, eff?.skill.role ?? null),
      abbr: blockAbbr(b, labels, faction.id, s.params),
      label: blockName(b, labels, faction.id, s.params),
      weak: eff?.matchup === 'strong',
      uid: b.uid,
      family: familyAbbr(labels, b.family),
      familyId: b.family ?? undefined,
      elementColor: (() => {
        const elId = blockElementOf(s.params, b);
        return elId ? elementColor(elId) : undefined;
      })(),
    };
    return blockEl(spec);
  };
  const visualOf = (node: HTMLElement): BlockVisual => (node.dataset.visual as BlockVisual | undefined) ?? 'basic';

  /** 쓰여서 바에서 사라진 블록: 제자리에서 발동 연출(is-fire)을 하고 지운다 (엔진은 바로 오른쪽 블록을 당긴다) */
  const fireAway = (node: HTMLElement) => {
    const g = elementLocalRect(tray.grid);
    const r = elementLocalRect(node);
    node.classList.remove('is-pressed', 'is-popin', 'is-cue');
    node.style.cssText = `position:absolute;left:${r.left - g.left}px;top:${r.top - g.top}px;width:${r.width}px;height:${r.height}px;z-index:5;margin:0`;
    tray.grid.append(node);
    node.classList.add('is-fire');
    const done = () => node.remove();
    node.addEventListener('animationend', done);
    window.setTimeout(done, 700);
  };

  const drawTray = () => {
    const count = s.tray.length;
    // 사라진 블록
    const present = new Set(s.tray.map((b) => b.uid));
    const gone: number[] = [];
    for (const [uid, node] of blockEls) {
      if (present.has(uid)) continue;
      gone.push(placedAt.get(uid) ?? -1);
      blockEls.delete(uid);
      placedAt.delete(uid);
      fireAway(node);
    }
    // 체인 묶음 연출: 두 개 이상 한꺼번에 사라졌으면 그 묶음 표시도 발동
    if (gone.length >= 2) {
      const hit = runEls.find((r) => gone.some((i) => i + 1 >= r.spec.start && i + 1 < r.spec.start + r.spec.len));
      if (hit) {
        const ghost = hit.node.cloneNode(true) as HTMLElement;
        ghost.classList.add('is-fire');
        tray.grid.append(ghost);
        const done = () => ghost.remove();
        ghost.addEventListener('animationend', done);
        window.setTimeout(done, 900);
      }
    }
    // 묶음 (GDD 19-2): 같은 계열 덩어리를 앞에서부터 최대 체인 개씩 나눈 발동 묶음 + 덩어리 안 묶음 경계 표시
    const groups = chainGroupsOf(s.tray, top);
    const specs = runSpecs(groups, (i) => s.tray[i]?.kind === 'skill', top);
    const cuts = groupCuts(runsOf(s.tray), groups).filter((i) => s.tray[i]?.kind === 'skill');
    const sig = `${specs.map((r) => `${r.start}:${r.len}`).join('|')}/${cuts.join(',')}`;
    if (sig !== runSig) {
      runSig = sig;
      for (const r of runEls) r.node.remove();
      for (const c of cutEls) c.remove();
      runEls = specs.map((spec) => ({ spec, node: runEl(spec, labels.chain) }));
      cutEls = cuts.map(cutEl);
      for (const r of runEls) tray.grid.append(r.node);
      for (const c of cutEls) tray.grid.append(c);
    }
    // 칸마다 블록 배치 + 상태 클래스
    const casting = s.enemy.cast !== null;
    tray.cells.forEach((cell, i) => {
      const b = s.tray[i];
      if (!b) {
        if (cell.firstChild) cell.replaceChildren();
        return;
      }
      let node = blockEls.get(b.uid);
      if (!node) {
        node = makeBlock(b);
        blockEls.set(b.uid, node);
        if (seeded) playOnce(node, 'is-popin');
      }
      placedAt.set(b.uid, i);
      if (node.parentElement !== cell) cell.replaceChildren(node);
      const level = chainLevelAt(specs, i);
      node.classList.toggle('is-chain2', level === 2);
      node.classList.toggle('is-chain3', level >= 3);
      node.classList.toggle('is-cue', casting && visualOf(node) === 'guard');
      node.classList.toggle('is-pressed', !!down && down.uid === b.uid);
    });
    seeded = true;
    // 안내 줄: 봉인
    const sealed = s.sealTicks > 0;
    tray.root.classList.toggle('is-sealed', sealed);
    let key = '';
    let build: (() => void) | null = null;
    if (sealed) {
      key = 'sealed';
      build = () => trayNote.replaceChildren(wrapNote('i-seal', `봉인 중: 새 ${labels.skillBlock}이(가) 생기지 않는다. 있는 블록은 쓸 수 있다`));
    }
    if (key !== noteKey) {
      noteKey = key;
      if (build) build();
      else trayNote.replaceChildren();
    }
  };
  const wrapNote = (iconId: string, text: string): HTMLElement => {
    const w = el('span');
    w.append(icon(iconId, 'sm'), text);
    return w;
  };

  const meterCache = { enemy: '', player: '', sp: '' };
  const drawHud = () => {
    const now = performance.now();
    // 체력·SP
    const eRatio = `${Math.round(s.enemy.hp * 10)}`;
    if (meterCache.enemy !== eRatio) {
      meterCache.enemy = eRatio;
      setMeter(enemyMeter, s.enemy.hp, s.enemy.maxHp, s.enemy.hp);
      setMeterValue(enemyMeter, Math.ceil(s.enemy.hp - 1e-6));
    }
    const pRatio = `${Math.round(s.player.hp * 10)}/${Math.round(s.player.maxHp)}`;
    if (meterCache.player !== pRatio) {
      meterCache.player = pRatio;
      setMeter(playerMeter, s.player.hp, s.player.maxHp, s.player.hp);
      setMeterValue(playerMeter, Math.ceil(s.player.hp - 1e-6), Math.round(s.player.maxHp));
      playerMeter.classList.toggle('is-danger', s.player.hp / s.player.maxHp < 0.3);
    }
    const spKey = `${Math.round(s.sp * 10)}`;
    if (meterCache.sp !== spKey) {
      meterCache.sp = spKey;
      setMeter(spMeter, s.sp, p.spMax);
      setMeterValue(spMeter, Math.round(s.sp));
    }
    const spFull = s.sp >= p.spMax;
    spMeter.classList.toggle('is-full', spFull);
    const noteText = spFull ? `${labels.specialBlock} 대기 (빈 칸 필요)` : now < specialNoteUntil ? `${labels.specialBlock} 블록 생성!` : '';
    spNote.hidden = noteText === '';
    if (noteText) setText(spNoteText, noteText);

    setText(timeNum, String(Math.ceil(timeLeftSeconds(s))));
    timeEl.classList.toggle('is-urgent', timeLeftSeconds(s) <= 10);

    // 머리 위 게이지: 강공격 예고(시전 바)·방어 자세 (적), 봉인·막기 (나). 엔진 상태에서 읽기만 한다
    const cast = s.enemy.cast;
    const wantBlocked = !cast && now < blockedUntil;
    const stanceSec = s.enemy.stance ? s.enemy.stance.ticks * p.tickSeconds : 0;
    const sealSec = s.sealTicks * p.tickSeconds;
    const guardSec = s.guard.ticks * p.tickSeconds;
    totals.stance = trackTotal(totals.stance, stanceSec);
    totals.seal = trackTotal(totals.seal, sealSec);
    totals.guard = trackTotal(totals.guard, guardSec);
    const foeSlots = gaugeSlots([true, stanceSec > 0]);
    const meSlots = gaugeSlots([sealSec > 0, guardSec > 0]);
    castGauge.set(
      cast
        ? { on: true, fill: (cast.total - cast.ticks) / cast.total, label: `강공격 예고! ${secondsText(cast.ticks * p.tickSeconds)}`, slot: foeSlots[0]! }
        : wantBlocked
          ? { on: true, fill: 1, label: `막았다! 피해 ${Math.round(blockedDamage)}`, slot: foeSlots[0]!, done: true }
          : { on: false, fill: 0, label: '', slot: foeSlots[0]! },
    );
    stanceGauge.set({ on: stanceSec > 0, fill: gaugeFill(stanceSec, totals.stance), label: `방어 자세 ${secondsText(stanceSec)}`, slot: foeSlots[1]! });
    sealGauge.set({ on: sealSec > 0, fill: gaugeFill(sealSec, totals.seal), label: `봉인 ${secondsText(sealSec)}`, slot: meSlots[0]! });
    guardGauge.set({ on: guardSec > 0, fill: gaugeFill(guardSec, totals.guard), label: `${labels.role.guard} ${secondsText(guardSec)}`, slot: meSlots[1]! });
    foe.classList.toggle('is-casting', cast !== null);
    foe.classList.toggle('is-guard', s.enemy.stance !== null);
    storedBtn.classList.toggle('is-alert', cast !== null && s.storedCharges > 0);

    // 상태 칩
    voidChip.root.hidden = s.voidUsed <= 0;
    if (s.voidUsed > 0) setText(voidChip.value, `${s.voidUsed}회`);
    chain3Chip.root.hidden = s.chain3Count <= 0;
    if (s.chain3Count > 0) setText(chain3Chip.value, `${s.chain3Count}회`);
    setText(tray.veilText, `봉인 — ${labels.skillBlock} 생성 정지 ${secondsText(s.sealTicks * p.tickSeconds)}`);

    // 저장 필살기
    storedPips.forEach((pip, i) => pip.classList.toggle('is-on', i < s.storedCharges));
    storedBtn.style.setProperty('--fill', (Math.min(1, (s.storedCharges >= p.storedChargesMax ? p.storedGaugeMax : s.storedGauge) / p.storedGaugeMax)).toFixed(3));
    const ready = s.storedCharges > 0;
    storedBtn.classList.toggle('is-ready', ready);
    storedBtn.classList.toggle('is-full', s.storedCharges >= p.storedChargesMax);
    storedBtn.classList.toggle('is-disabled', !ready);
    storedBtn.setAttribute('aria-disabled', String(!ready));
    storedBtn.setAttribute('aria-label', `${labels.storedSkill}, 충전 ${s.storedCharges}칸`);
    // 칸 안에는 충전 수만(짧게). 자세한 설명은 이름표·도움말
    const metaText = `충전 ${s.storedCharges}/${p.storedChargesMax}`;
    storedBtn.title = ready
      ? `${Math.round(p.storedPowerInAttacks)}회분 피해 · ${p.storedGuardSeconds}초 ${labels.role.guard}`
      : `${Math.floor(s.storedGauge)} / ${p.storedGaugeMax} — 블록을 쓸수록 충전`;
    setText(storedMeta, metaText);

    // 해방 (GDD 22-5)
    const libActive = liberationActive(s);
    app.classList.toggle('is-liberated', libActive);
    libChip.root.hidden = !libActive;
    if (libActive) setText(libChip.value, secondsText(s.liberation.ticksLeft * p.tickSeconds));
    if (libOn) {
      const lb = s.liberation;
      const used = lb.usedAtTick !== null;
      const ready = canLiberate(s);
      libBtn.style.setProperty('--fill', (used ? (libActive ? lb.ticksLeft / Math.max(1, Math.round(p.liberationSeconds / p.tickSeconds)) : 0) : lb.gauge / LIBERATION_GAUGE_MAX).toFixed(3));
      libBtn.classList.toggle('is-ready', ready);
      libBtn.classList.toggle('is-disabled', !ready);
      libBtn.classList.toggle('is-active', libActive);
      libBtn.setAttribute('aria-disabled', String(!ready));
      const libText = !p.liberationEnabled
        ? opts.liberation?.note ?? '잠김'
        : libActive ? `해방 중 ${secondsText(lb.ticksLeft * p.tickSeconds)}` : used ? '이 전투에서 사용함' : ready ? '준비됨 — 눌러 해방' : `게이지 ${Math.floor(lb.gauge)}%`;
      setText(libMeta, libText);
      libBtn.title = libText;
      libBtn.setAttribute('aria-label', `${labels.liberation.name}, ${libText}`);
    }
  };

  // ── 입력: 포인터 이벤트(터치·마우스 공통). 클릭 = 같은 블록 위에서 누르고 뗀 것. 시간·거리 제한은 없다 ──
  const queue: CombatInput[] = [];
  // 칸 찾기는 기기 안 좌표(가로 방향)로: 세로 폰에서는 기기를 돌려 놓았으므로 화면 좌표를 바꿔 쓴다 (GDD 16-6)
  const slotOf = (e: { clientX: number; clientY: number }) => {
    const r = elementLocalRect(tray.grid);
    return slotAt(pointerLocal(e).x, r.left, r.width, cap);
  };
  // 저장 필살기 버튼: 블록과 같은 판정 (버튼 위에서 누르고 버튼 위에서 떼면 사용)
  let storedDown: number | null = null;
  const overStored = (e: PointerEvent) => {
    const r = storedBtn.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  storedBtn.addEventListener('pointerdown', (e) => {
    if (storedDown !== null || s.status !== 'playing') return;
    storedBtn.setPointerCapture(e.pointerId);
    storedDown = e.pointerId;
    storedBtn.classList.add('is-pressed');
  });
  storedBtn.addEventListener('pointercancel', () => {
    storedDown = null;
    storedBtn.classList.remove('is-pressed');
  });
  storedBtn.addEventListener('pointerup', (e) => {
    if (storedDown !== e.pointerId) return;
    storedDown = null;
    storedBtn.classList.remove('is-pressed');
    if (overStored(e) && s.status === 'playing' && !halted()) queue.push({ type: 'stored' });
  });
  libBtn.addEventListener('click', () => {
    if (canLiberate(s) && !halted()) queue.push({ type: 'liberate' });
  });
  const endPress = () => {
    down = null;
    drawTray();
  };
  tray.root.addEventListener('pointerdown', (e) => {
    if (down || s.status !== 'playing' || halted()) return;
    const b = s.tray[slotOf(e)];
    if (!b) return;
    tray.root.setPointerCapture(e.pointerId);
    down = { uid: b.uid, id: e.pointerId };
    drawTray();
  });
  tray.root.addEventListener('pointercancel', endPress);
  tray.root.addEventListener('pointerup', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const input = releaseUse(down.uid, slotOf(e), s.tray);
    if (input && s.status === 'playing' && !halted()) queue.push(input);
    endPress();
  });
  // PC 단축키 (GDD 18-5): 숫자 N = N번 칸 블록, Q = 저장 필살기. 클릭과 같은 판정(releaseUse)을 쓴다
  const offKeys = registerShortcutHandlers({
    ...Object.fromEntries(Array.from({ length: p.trayCapacity }, (_, i) => [`block.${i + 1}`, () => {
      const blk = s.tray[i];
      if (!app.isConnected || stopped || !blk || s.status !== 'playing' || halted()) return false;
      const input = releaseUse(blk.uid, i, s.tray);
      if (input) queue.push(input);
      return !!input;
    }])),
    stored: () => {
      if (!app.isConnected || stopped || s.status !== 'playing' || halted()) return false;
      queue.push({ type: 'stored' });
      return true;
    },
    liberate: () => {
      if (!app.isConnected || stopped || !canLiberate(s) || halted()) return false;
      queue.push({ type: 'liberate' });
      return true;
    },
  });
  void offKeys;
  // 키보드: 블록에 초점을 두고 Enter/Space = 사용 (PC 모드의 Space 는 일시정지 단축키라 Enter 만)
  tray.root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && !(e.key === ' ' && !currentViewState().pc)) return;
    const uid = Number((e.target as HTMLElement).dataset.uid);
    const from = Number.isFinite(uid) ? indexOfUid(uid) : -1;
    if (from < 0 || s.status !== 'playing' || halted()) return;
    e.preventDefault();
    queue.push({ type: 'use', cell: from });
  });

  // ── 끝: 결과 오버레이 (버튼을 누르면 다음 화면) ──
  let ended = false;
  const showResult = () => {
    const finish = () => {
      if (ended) return;
      ended = true;
      opts.onEnd(s);
    };
    const inner = el('div', s.status === 'won' ? 'bha-battle-ov bha-battle-ov--win' : 'bha-battle-ov bha-battle-ov--lose');
    const actions = el('div', 'bha-battle-ov__actions');
    if (s.status === 'won') {
      const canAbsorb = absorbReasons(s).length > 0;
      const go = button({ label: canAbsorb ? `${faction.absorbActionName} 가능` : '계속', variant: 'primary', size: 'lg', icon: canAbsorb ? 'i-absorb' : undefined, onClick: finish });
      go.append(icon('i-chevron-right'));
      actions.append(go);
      inner.append(
        ovMark('i-flag-win'),
        el('span', 'bha-battle-ov__eyebrow', `전투 시간 ${Math.round(elapsedSeconds(s))}초 · ${labels.chain}${top} ${s.chain3Count}회`),
        el('h2', 'bha-battle-ov__title', '승리'),
        el('p', 'bha-battle-ov__sub', `${enemyName}을(를) 쓰러뜨렸다.`),
        actions,
      );
    } else {
      const timeout = s.lossReason === 'timeout';
      const go = button({ label: '결과 보기', size: 'lg', onClick: finish });
      go.append(icon('i-chevron-right'));
      actions.append(go);
      const sub = el('p', 'bha-battle-ov__sub', timeout ? `남은 시간 안에 쓰러뜨리지 못했다. 적 체력 ${Math.ceil(s.enemy.hp - 1e-6)} / ${Math.round(s.enemy.maxHp)}` : '체력이 0이 되었다.');
      inner.append(
        ovMark(timeout ? 'i-timer' : 'i-broken', timeout ? 'var(--bha-warn)' : 'var(--bha-danger)'),
        el('span', 'bha-battle-ov__eyebrow', timeout ? '시간 초과 패배' : '패배'),
        el('h2', 'bha-battle-ov__title', timeout ? '시간이 다 됐다' : labels.defeatState),
        sub,
        actions,
      );
    }
    showOverlay(inner);
    actions.querySelector<HTMLElement>('button')?.focus();
  };

  // ── 실시간 루프: 화면 프레임마다 쌓인 시간만큼 엔진 틱을 돌린다 (1x/2x) ──
  const tickMs = p.tickSeconds * 1000;
  let acc = 0;
  let fxHalted = false;
  let last = performance.now();
  const frame = (now: number) => {
    if (stopped) return;
    const dt = Math.min(250, now - last);
    last = now;
    if (s.status === 'playing') {
      if (halted() !== fxHalted) attack.setPaused((fxHalted = halted()));
      const f = frameTicks(acc, dt, speed, tickMs, halted());
      acc = f.acc;
      for (let n = 0; n < f.ticks && s.status === 'playing'; n++) step(s, queue.splice(0, queue.length));
    }
    if (halted()) queue.length = 0;
    for (const ev of drainCombatEvents(s)) {
      const line = eventLine(ev, s, labels, faction.id);
      if (line) say(line);
      react(ev);
    }
    if (cues.length) {
      const c = strongestCue(cues);
      cues.length = 0;
      if (c) emitFeedback(c, fx);
    }
    drawHud();
    drawTray();
    if (s.status !== 'playing') {
      stopped = true;
      if (s.status === 'lost') say({ role: 'cast', icon: 'i-broken', text: s.lossReason === 'timeout' ? '시간 제한을 넘겼다…' : `${labels.defeatState}…` });
      endPress();
      if (tutorialOpen) tutorial?.close(); // 직접 해 보기 중에 끝나면 튜토리얼도 마무리
      window.setTimeout(showResult, 700);
      return;
    }
    requestAnimationFrame(frame);
  };

  drawHud();
  drawTray();
  say({ role: 'cast', icon: 'i-cast', text: `${enemyName}과(와) 조우! 블록을 눌러 쓰고, 붙여 놓아 ${labels.chain}!` });
  requestAnimationFrame(frame);

  // 조우 연출 (전투 시간은 멈춰 있다): 눌러서 넘기거나 잠시 뒤 사라진 다음 튜토리얼이 있으면 시작한다
  const encounter = el('div', 'bha-battle-ov bha-battle-ov--encounter');
  const stats = el('div', 'bha-battle-ov__stats');
  if (enemy.class === 'elite') stats.append(tag('강적', 'elite'));
  stats.append(elementChip());
  if (patternView) {
    const pc = el('span', 'bha-chip bha-chip--pattern');
    pc.append(icon(patternView.icon), patternView.label);
    stats.append(pc);
  }
  encounter.append(
    el('span', 'bha-battle-ov__eyebrow', opts.banner ?? '전투 연습'),
    el('span', 'bha-battle-ov__line'),
    el('h2', 'bha-battle-ov__title', `${enemyName}과(와) 조우!`),
    el('span', 'bha-battle-ov__line'),
    stats,
  );
  overlayOpen = true;
  const encounterOverlay = showOverlay(encounter);
  let encounterDone = false;
  const endEncounter = () => {
    if (encounterDone) return;
    encounterDone = true;
    hideOverlay();
    overlayOpen = false;
    if (opts.tutorial) startTutorial();
  };
  encounterOverlay.addEventListener('pointerdown', endEncounter);
  window.setTimeout(endEncounter, 1500);
}
