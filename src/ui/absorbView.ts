// 흡수 화면 (GDD 4장, 4-1): 전투 승리 후 흡수 / 놓아줌 → 특성 후보 선택 → 슬롯 장착(가득 차면 교체/포기).
// 문구는 FactionConfig(absorbActionName, chainName, riskGaugeName, stabilityName …)에서 읽는다.
import { BALANCE } from '../config/balance';
import { fixParticles } from '../engine/josa';
import { findEnemyDef } from '../data/bosses';
import { NORMAL_ELEMENT, elementName, statName, weaknessesOf } from '../data/elements';
import { MINUS, normalSlotNote, signed } from '../data/help/textFormat';
import { STAT_IDS, pickFaction, type EnemyDef, type StatId } from '../data/schema';
import { getTrait, traitDescription, traitName } from '../data/traits';
import { absorbModeRule, enhanceLevel, isFull, ownsElement, ownsTraitBlock, type AbsorbMode, type AbsorbOffer } from '../engine/absorb';
import { chooseAbsorb, chooseRelease, previewAbsorb, type ExpeditionState } from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import { button, chip, el, icon, meter, mountApp, notice, tag } from './bha/dom';
import { v2Icon } from './bha/iconMap';
import { showToast } from './bha/nest';
import { playCosmeticFx } from './bha/cosmeticFx';
import { elementColor, elementDot, elementMark, paintElement } from './bha/element';
import { devText, plainText, shownName } from './displayName';
import { confirmDialog } from './confirmDialog';
import { openAbsorbStatus } from './absorbStatus';
import { traitDiffLine } from './traitDiff';
import { onScreenBack } from './bha/screenBack';

const AX = BALANCE.provisional.absorb;
const RX = BALANCE.provisional.risk;

/** 이 적의 약점 속성 이름들 ("뇌" / 융합은 "뇌·흙"). 없으면 null (노멀·특수 속성 적) */
export function weaknessText(enemy: Pick<EnemyDef, 'element'>, factionId: string): string | null {
  const w = weaknessesOf([enemy.element]);
  return w.length ? w.map((x) => elementName(x, factionId)).join('·') : null;
}

/** 흡수 안내 (C.125, GDD 70·71장): 조건 없이 이기면 언제나, 특성 후보는 그 적의 속성 특성에서만 */
export function absorbRuleText(faction: FactionConfig, enemy: Pick<EnemyDef, 'element'>): string {
  // C.176 (GDD 106장 1): 가진 속성이어도 그 속성 블록이 후보로 뜬다 — 가진 블록을 고르면 새 블록 없이 강화만
  return fixParticles(`이기면 언제나 ${faction.absorbActionName}할 수 있다. 후보는 그 속성(${elementName(enemy.element, faction.id)}) 블록이다. 안 가진 블록은 새 블록 + 강화, 이미 가진 블록(${elementName(NORMAL_ELEMENT, faction.id)}은(는) 기본 블록)은 강화만 오른다.`);
}

/** 한 단계의 두 열 내용: 왼쪽(설명·선택 상대 정보) / 오른쪽(고를 것·조작) — 가로 LCD (T-2) */
interface StepParts {
  /** 단계 표시 옆에 보이는 제목 */
  title: string;
  main: HTMLElement[];
  side: HTMLElement[];
  /** 아래 고정 줄 (GDD 183장 S11): 왼쪽 = 돌아가기·고른 갈래, 오른쪽 = 실행 버튼. 자리 고정(173장 2) */
  dock: HTMLElement[];
}

const STEP_LABELS = ['갈래', '블록'] as const; // GDD 183장 S11: 1 갈래 · 2 블록(193장 14 이름 통일: 흡수로 얻는 전투 블록 = '블록'. 3 교체는 193장 13 C.312 에 2단계 한 화면으로 합침)

/** 포식 갈래 이름·이 흡수가 뭔지 한 줄 (GDD 52·100장 #47 → 163장 2): 갈래 버튼 이름과 설명 칸 첫 줄이 이 한 곳에서 읽는다. 이름은 종족 설정 absorbModeNames (GDD 158장 6) */
export function absorbModeText(faction: Pick<FactionConfig, 'absorbModeNames' | 'riskGaugeName' | 'stabilityName'>): Record<AbsorbMode | 'none', { label: string; sub: string }> {
  const n = faction.absorbModeNames;
  return {
    both: { label: n.both, sub: '블록과 능력치를 함께 얻는다.' },
    trait: { label: n.trait, sub: '속성 블록만 얻는다. 능력치는 오르지 않는다.' },
    stat: { label: n.stat, sub: `능력치만 ${absorbModeRule('stat').ev}배로 얻는다. 블록은 얻지 않는다.` },
    none: { label: n.none, sub: '얻지 않고 놓아준다.' },
  };
}

/** 갈래 순서 (버튼 왼쪽부터) */
export const ABSORB_MODES = ['both', 'trait', 'stat', 'none'] as const;
export type AbsorbChoice = (typeof ABSORB_MODES)[number];

/** 노력치 차이 → "힘 +2 · 체력 +1". 모두 같은 값이면 "모두 +n" (첫 흡수 연습) */
export function evLine(ev: Partial<Record<StatId, number>>, factionId: string): string {
  const got = STAT_IDS.filter((k) => (ev[k] ?? 0) > 0);
  if (got.length === 0) return '';
  if (got.length === STAT_IDS.length && got.every((k) => ev[k] === ev[got[0]!])) return `모두 +${ev[got[0]!]}`;
  return got.map((k) => `${statName(k, factionId)} +${ev[k]}`).join(' · ');
}

/** 게이지 변화 "+3 (5 → 8)" / 그대로면 "그대로 (5)" */
export function gaugeDelta(from: number, to: number): string {
  const a = Math.round(from);
  const b = Math.round(to);
  return a === b ? `그대로 (${a})` : `${signed(b - a)} (${a} → ${b})`;
}

/** 놓아주기 리스크 줄 (GDD 168장 2): 늘 "−1 (5 → 4)", 0 이면 "−1 (0, 0 아래로는 안 내려간다)" */
export function releaseDelta(from: number, to: number): string {
  const a = Math.round(from);
  const b = Math.round(to);
  const d = `${MINUS}${RX.releaseRelief}`;
  return a === b ? `${d} (${a}, 0 아래로는 안 내려간다)` : `${d} (${a} → ${b})`;
}

/** 설명 칸 줄 (GDD 163장 2): 이 흡수가 뭔지 / 능력치 / 리스크 게이지 변화(+ 한계 경고) / 받는 것. 값은 엔진 previewAbsorb 그대로 */
export function absorbDescLines(faction: FactionConfig, exp: ExpeditionState, m: AbsorbChoice): { kind: 'what' | 'stat' | 'risk' | 'warn' | 'gain'; text: string }[] {
  const p = previewAbsorb(exp, m);
  const out: { kind: 'what' | 'stat' | 'risk' | 'warn' | 'gain'; text: string }[] = [{ kind: 'what', text: absorbModeText(faction)[m].sub }];
  const ev = evLine(p.ev, faction.id);
  if (ev) out.push({ kind: 'stat', text: `능력치: ${ev}` });
  else if (evCapped(exp, m)) out.push({ kind: 'warn', text: EV_FULL_TEXT }); // GDD 176장 11: 노력치 상한이면 능력치 0 을 말로
  // 놓아주기 = 리스크 게이지 −releaseRelief (GDD 168장 2): 게이지가 0 이라 더 못 내려가도 설명은 같은 값 (확인 창·도움말과 같게)
  // 리스크 줄은 바뀔 때만 ('그대로' 줄 없음), 첫 흡수 연습에서는 전부 숨김 (GDD 197장 1·2)
  if (showRiskLine(exp, m)) out.push({ kind: 'risk', text: `${faction.riskGaugeName}: ${m === 'none' ? releaseDelta(p.riskFrom, p.riskTo) : gaugeDelta(p.riskFrom, p.riskTo)}` });
  if (p.frenzy) out.push({ kind: 'warn', text: `한계(${RX.limit})에 닿아 ${faction.frenzyName} 상태가 된다.` });
  const gain: string[] = [];
  if (p.tiles > 0) gain.push(`타일 +${p.tiles}`);
  if (Math.round(p.stabilityTo) !== Math.round(p.stabilityFrom)) gain.push(`${faction.stabilityName} ${gaugeDelta(p.stabilityFrom, p.stabilityTo)}`);
  if (gain.length) out.push({ kind: 'gain', text: `받는 것: ${gain.join(' · ')}` });
  return out;
}

/** 노력치 상한 안내 (GDD 176장 11) */
export const EV_FULL_TEXT = '노력치가 가득 찼다. 능력치는 오르지 않는다.';

/** 능력치를 주는 갈래인데 노력치가 이미 가득 차 아무것도 안 오르나 (GDD 176장 11) */
export function evCapped(exp: ExpeditionState, m: AbsorbChoice): boolean {
  return m !== 'none' && absorbModeRule(m).ev > 0 && evLine(previewAbsorb(exp, m).ev, '') === '';
}

/** 흡수가 끝난 뒤 한 줄 (GDD 176장 11): "능력치 힘 +2 · 광기 +1 (7 → 8)" (리스크가 안 바뀌면 리스크 부분 없음, 197장) / 상한이면 "노력치가 가득 찼다 · …". 값은 previewAbsorb 그대로(실행 전에 부른다) */
export function absorbResultLine(faction: FactionConfig, exp: ExpeditionState, m: AbsorbChoice): string {
  const p = previewAbsorb(exp, m);
  const ev = evLine(p.ev, faction.id);
  const parts = [ev ? `능력치 ${ev}` : evCapped(exp, m) ? '노력치가 가득 찼다' : ''];
  // 리스크가 안 바뀌면 리스크 부분은 뺀다 (GDD 197장, C.320)
  if (showRiskLine(exp, m)) parts.push(`${faction.riskGaugeName} ${m === 'none' ? releaseDelta(p.riskFrom, p.riskTo) : gaugeDelta(p.riskFrom, p.riskTo)}`);
  return parts.filter(Boolean).join(' · ');
}

/** [흡수] 버튼 글자 (GDD 172장 2): 고른 갈래 이름 + '하기'. 이름이 이미 '~기'(놓아주기)면 그대로. 이름은 종족 설정 absorbModeNames */
export function absorbRunLabel(label: string): string {
  return /기$/.test(label) ? label : `${label}하기`;
}

/**
 * 갈래 버튼 4개 + 설명 칸 + [흡수] 버튼 (GDD 163장 2·3 → 172장 1~3 → 173장 1: 버튼은 왼쪽 열 맨 아래 고정 자리, 갈래가 바뀌어도 안 움직인다): 갈래 버튼 = 고르기만(다시 눌러도 실행 안 함, 설명 칸이 바뀐다),
 * 설명 칸 바로 아래 [흡수] 버튼(글자 = 고른 갈래 이름 + '하기')을 눌러야 실행. 기기 ▲▼ = 갈래 → [흡수] 버튼(DOM 순서), ✓ = 갈래면 고르기·버튼이면 실행.
 * 처음엔 첫 갈래가 골라진 상태. 흡수 화면과 첫 흡수 연습 화면이 같이 쓴다
 */
export function absorbModePicker(faction: FactionConfig, exp: ExpeditionState, run: (m: AbsorbChoice) => void, extra?: (m: AbsorbChoice) => HTMLElement[], onSelect?: (m: AbsorbChoice) => void): { actions: HTMLElement; desc: HTMLElement; go: HTMLButtonElement; first: HTMLButtonElement } {
  const names = absorbModeText(faction);
  const actions = el('div', 'bha-absorb__actions bha-absorb__actions--modes');
  const desc = el('div', 'bha-panel bha-panel--inset bha-absorb__desc');
  desc.setAttribute('aria-live', 'polite');
  let sel: AbsorbChoice = ABSORB_MODES[0];
  const btns = ABSORB_MODES.map((m) => {
    const frenzy = m !== 'none' && previewAbsorb(exp, m).frenzy;
    const b = button({ label: names[m].label, variant: frenzy ? 'danger' : undefined, size: 'small' });
    b.dataset.mode = m;
    // 갈래 아래 작은 줄 = 이 갈래의 리스크 게이지 변화 (GDD 183장 S11 '위험 +n'). 값은 설명 칸과 같은 엔진 미리보기
    b.append(modeRiskLine(faction, exp, m));
    if (frenzy) b.title = `${faction.frenzyName} 상태가 된다`;
    // 능력치만 얻는 갈래인데 노력치가 가득 = 흐리게 (GDD 176장 11). 고를 수는 있다(설명 칸에서 이유를 읽게) — 자리도 그대로
    if (m === 'stat' && evCapped(exp, m)) b.setAttribute('aria-disabled', 'true');
    // ▲▼ 하이라이트가 옮겨 오면 고르기 (기기가 보내는 'bha-select', lcdpage.masterDetail 과 같은 방식)
    b.addEventListener('bha-select', () => select(m));
    // 손가락·기기 ✓ 모두 고르기만 (GDD 172장 1: 같은 버튼을 다시 눌러도 실행하지 않는다)
    // 손가락 = 그 버튼에 기기 하이라이트도 옮긴다. 기기 ✓·키보드(click detail 0) = 고른 뒤 하이라이트를 [흡수] 버튼으로
    // (▼ 로 갈래를 지나 버튼까지 가면 마지막 갈래 '놓아주기'가 골라지므로, 고른 갈래 그대로 버튼에 가는 길)
    b.onclick = (e) => {
      select(m);
      (e.detail > 0 ? b : go).dispatchEvent(new CustomEvent('bha-goto', { bubbles: true }));
    };
    return b;
  });
  // [흡수] 버튼: 설명 칸 바로 아래. 한계를 넘는 갈래면 빨간 버튼
  const go = button({ label: '', block: true, size: 'lg' });
  go.classList.add('bha-absorb__go');
  go.dataset.absorbGo = '';
  go.onclick = () => run(sel);
  // 설명 칸 = 버튼 위 남은 자리를 고정 높이로 쓴다(GDD 173장 1). 넘치면 그 안에서 스크롤 + 바닥 '▼ 더 있음'(ⓘ 창과 같은 방식, 168장 3)
  const more = el('div', 'bha-pop__more', '▼ 더 있음');
  more.setAttribute('aria-hidden', 'true');
  const syncMore = (): void => { more.hidden = desc.scrollTop + desc.clientHeight >= desc.scrollHeight - 2; };
  desc.addEventListener('scroll', syncMore, { passive: true });
  function select(m: AbsorbChoice): void {
    sel = m;
    btns.forEach((b) => {
      const on = b.dataset.mode === m;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    desc.dataset.descMode = m;
    desc.replaceChildren(...absorbDescLines(faction, exp, m).map((l) => {
      const cls = l.kind === 'what' ? 'bha-small bha-absorb__what' : l.kind === 'warn' ? 'bha-small bha-danger-text' : 'bha-small';
      const p = el('p', cls);
      p.dataset.line = l.kind;
      // '이름: 값' 줄은 두 열로 (GDD 183장 S11) — 글은 그대로, 첫 ': ' 에서 나눠 보여 주기만
      const at = l.kind === 'what' || l.kind === 'warn' ? -1 : l.text.indexOf(': ');
      if (at > 0) p.append(el('span', 'bha-absorb__k', l.text.slice(0, at)), el('b', 'bha-absorb__v', l.text.slice(at + 2)));
      else p.append(l.text);
      return p;
    }), ...(extra?.(m) ?? []), more);
    desc.scrollTop = 0;
    requestAnimationFrame(syncMore);
    const frenzy = m !== 'none' && previewAbsorb(exp, m).frenzy;
    go.textContent = absorbRunLabel(names[m].label);
    go.classList.toggle('bha-btn--danger', frenzy);
    go.classList.toggle('bha-btn--primary', !frenzy);
    go.dataset.goMode = m;
    onSelect?.(m);
  }
  actions.append(...btns);
  select(sel);
  return { actions, desc, go, first: btns[0]! };
}

/** 리스크 줄을 보이나 (GDD 197장 1·2): 첫 흡수 연습(exp.tutorial) = 전부 숨김(놓아주기 포함).
 *  그 밖엔 게이지가 실제로 바뀌는 갈래만 — 놓아주기도 게이지가 0 이라 못 내려가면 숨김(197장 C.320 마스터 결정, 168장 2 규칙(−n·0 아래 없음)은 그대로) */
export function showRiskLine(exp: ExpeditionState, m: AbsorbChoice): boolean {
  if (exp.tutorial) return false;
  const p = previewAbsorb(exp, m);
  return Math.round(p.riskTo) !== Math.round(p.riskFrom);
}

/** 갈래 버튼 아래 리스크 게이지 변화 한 줄 "광기 +3" / "광기 −1" (GDD 183장 S11). 안 바뀌면·첫 흡수 연습이면 '' (197장 1·2). 이름은 종족 설정 riskGaugeName */
export function modeRiskText(faction: Pick<FactionConfig, 'riskGaugeName'>, exp: ExpeditionState, m: AbsorbChoice): string {
  if (!showRiskLine(exp, m)) return '';
  if (m === 'none') return `${faction.riskGaugeName} ${MINUS}${RX.releaseRelief}`; // 놓아주기 = 늘 −n (설명 칸 releaseDelta 와 같게)
  const p = previewAbsorb(exp, m);
  return `${faction.riskGaugeName} ${signed(Math.round(p.riskTo) - Math.round(p.riskFrom))}`;
}

/** 리스크 줄이 없을 때도 같은 높이의 빈 줄을 둔다 (GDD 173장 2: 줄이 빠져도 갈래 버튼 높이·[흡수] 버튼 자리 그대로) */
function modeRiskLine(faction: FactionConfig, exp: ExpeditionState, m: AbsorbChoice): HTMLElement {
  const sm = el('small', 'bha-absorb__risk');
  const t = modeRiskText(faction, exp, m);
  if (t) sm.append(v2Icon('warning', 'sm'), t);
  else {
    sm.classList.add('bha-absorb__risk--none');
    sm.setAttribute('aria-hidden', 'true');
    sm.append(v2Icon('warning', 'sm'), '\u00a0');
  }
  return sm;
}

/** 흡수 화면 블록 이름 (GDD 158장 4): "물 권" — 속성 + 블록 이름. 슬롯 칸은 앞에 "n번" */
export function absorbBlockName(faction: Pick<FactionConfig, 'id'>, id: string): string {
  const t = getTrait(id);
  return `${elementName(t.element, faction.id)} ${traitName(id, faction.id)}`;
}

/** 속성 강화 수치 "n/100" (GDD 158장 4·84장 8: 강화는 속성 단위, 상한 BALANCE) */
export function enhanceFraction(build: Parameters<typeof enhanceLevel>[0], element: string): string {
  return `${enhanceLevel(build, element)}/${AX.enhance.max}`;
}

/** 흡수 화면에서는 블록 효과 수치 줄("효과: 위력 기본 공격 n회분")을 뺀다 — 수치는 가방 블록 상세에서 (GDD 158장 4·5) */
export function absorbDesc(text: string): string {
  return text.split('\n').filter((l) => !/^\s*(\[임시\]\s*)?효과\s*:/.test(l) && !/회분/.test(l)).join('\n');
}

/** 다시 뽑기권 (GDD 25-9): 남은 장수와 쓰기(성공하면 후보가 바뀐다). 없으면 버튼을 그리지 않는다 */
export interface RerollHandle {
  tickets: () => number;
  use: () => boolean;
}

let absorbSeq = 0;

export function absorbView(root: HTMLElement, faction: FactionConfig, exp: ExpeditionState, onDone: (absorbed: boolean) => void, reroll?: RerollHandle): void {
  const offer = exp.absorbOffer;
  if (!offer) return onDone(false);
  const enemy = findEnemyDef(offer.enemyId) // 보스(GDD 25-3)도 흡수 화면에 온다;
  const act = faction.absorbActionName;
  const foeName = shownName(pickFaction(enemy.name, faction.id));
  let step: 'choose' | 'pick' = 'choose';
  /** 슬롯 가득 한 화면(193장 13)에서 지금 고른 후보 */
  let picked: string | null = null;
  /** 흡수 갈래 (GDD 52): 첫 단계에서 고른다. 특성 고르기·교체 단계는 이 갈래로 chooseAbsorb 를 부른다 */
  let mode: AbsorbMode = 'both';
  let error = '';
  /** 갈래 표시명 (공통 문구, 행동 이름만 종족 설정) — 첫 포식 안내와 같은 곳에서 읽는다 */
  const MODE_LABELS = absorbModeText(faction);
  /** 이 화면이 끝났나 (뒤로 처리기를 푼다). owner = 이 흡수 화면 표시 */
  let done = false;
  const owner = `a${++absorbSeq}`;
  /** 흡수가 끝나면 띄울 한 줄 (GDD 176장 11) — 갈래를 실행하는 순간 정한다 */
  let resultLine = '';
  const finish = (r: { ok: true } | { ok: false; reason: string }, absorbed: boolean) => {
    if (r.ok) done = true;
    if (r.ok && absorbed && resultLine) showToast({ eyebrow: act, title: resultLine }, 0, 2500);
    if (!r.ok) {
      error = r.reason;
      render();
    } else if (absorbed) {
      // 흡수 연출 꾸밈 (GDD 25-11): 적이 사라지는 방식을 보여 준 뒤 넘어간다. 입은 연출이 없으면 바로
      const card = root.querySelector<HTMLElement>('.bha-foecard');
      if (!(card && playCosmeticFx('absorb', card, () => onDone(true)))) onDone(true);
    } else onDone(absorbed);
  };

  /** 특성 종류 태그 (희귀 칩은 C.213 에 삭제 — GDD 136장 1) */
  const traitTags = (id: string): HTMLElement[] => [tag(faction.traitKindNames[getTrait(id).kind], 'kind')];

  const steps = (n: number): HTMLElement => {
    const nav = el('nav', 'bha-steps');
    nav.setAttribute('aria-label', `${act} 단계`);
    STEP_LABELS.forEach((l, i) => {
      if (i) nav.append(el('em', '', '·'));
      const sp = el('span', i + 1 === n ? 'is-active' : i + 1 < n ? 'is-done' : '');
      sp.append(el('b', 'bha-num', String(i + 1)), l);
      nav.append(sp);
    });
    return nav;
  };

  const foeCard = (): HTMLElement => {
    const card = el('article', 'bha-foecard');
    const foe = el('div', 'bha-foe');
    foe.style.setProperty('--aura', elementColor(offer!.element));
    const body = el('span', 'bha-foe__body');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', offer!.elite ? '#foe-b' : '#foe-a');
    svg.append(use);
    body.append(svg);
    foe.append(el('span', 'bha-foe__aura'), body);
    const tags = el('div', 'bha-foecard__tags');
    tags.append(tag(offer!.elite ? '강적' : '일반', offer!.elite ? 'elite' : 'normal'), elementMark(offer!.element, faction.id));
    const text = el('div', 'bha-foecard__text');
    text.append(el('h2', 'bha-foecard__name', foeName), tags);
    card.append(foe, text);
    return card;
  };

  /** 슬롯 현황: 칸마다 특성 이름·종류·속성, 속성 보너스 진행/완성, 외형 파츠 문구 */
  const slotSummary = (): HTMLElement => {
    const b = exp.build;
    const box = el('div', 'bha-stack bha-absorb__slotbox');
    const head = el('div', 'bha-absorb__slothead');
    head.append(el('span', 'bha-dim', faction.slotName), el('b', 'bha-num', `${b.slots.filter(Boolean).length} / ${b.slots.length}`));
    box.append(head);
    const grid = el('div', 'bha-slots');
    b.slots.forEach((id, i) => {
      if (!id) {
        const s = el('div', 'bha-slot bha-slot--empty');
        s.append(el('span', 'bha-slot__num', `${i + 1}번`), icon('i-plus'), '비어 있음');
        grid.append(s);
        return;
      }
      // GDD 158장 4: 첫 줄 "1번 물 권", 아래 줄 속성 강화 "n/100" — 위력 등 수치는 가방 블록 상세에서
      const t = getTrait(id);
      const s = paintElement(el('div', 'bha-slot bha-slot--filled'), t.element);
      s.append(el('span', 'bha-slot__name', `${i + 1}번 ${absorbBlockName(faction, id)}`), el('span', 'bha-slot__enh bha-num', `강화 ${enhanceFraction(b, t.element)}`));
      grid.append(s);
    });
    box.append(grid);
    const parts = b.slots.filter((id): id is string => id !== null && getTrait(id).kind === 'part');
    if (parts.length > 0) {
      const how = faction.appearanceChange ? '본체 외형이 변한다' : `본체는 그대로, ${faction.slotName} 외형이 변한다`;
      box.append(el('p', 'bha-faint', `${faction.traitKindNames.part}: ${parts.map((id) => traitName(id, faction.id)).join(', ')} — ${how} (표시만)`));
    }
    return box;
  };

  const backBtn = (to: 'choose'): HTMLButtonElement => {
    const b = button({ label: '돌아가기', icon: 'i-chevron-left', variant: 'ghost' });
    b.classList.add('bha-absorb__back');
    b.onclick = () => {
      step = to;
      render();
    };
    return b;
  };

  /** 이미 가진 속성인가 (GDD 94장 B, C.147): 그러면 흡수는 새 블록 없이 강화만. 노멀은 기본 블록을 늘 가진 것으로 본다 */
  const owned = (): boolean => ownsElement(exp.build, offer!.element);
  /** 강화 문구: "물 강화 n/100 → n+1/100" (상한이면 그대로). 효과 % 같은 수치는 흡수 화면에서 뺀다 (GDD 158장 4) */
  function enhanceText(): string {
    const elId = offer!.element;
    const max = AX.enhance.max;
    const lv = enhanceLevel(exp.build, elId);
    return lv >= max ? `${elementName(elId, faction.id)} 강화 ${max}/${max} 최대` : `${elementName(elId, faction.id)} 강화 ${lv}/${max} → ${lv + 1}/${max}`;
  }
  /** 속성 강화 줄 (흡수 첫 단계): 가진 속성 = "강화 n→n+1" / 처음 먹는 속성 = "새 블록" + 강화 */
  function enhanceRow(): HTMLElement {
    const sp = el('span');
    // 가진 속성 = 강화만, 처음 먹는 속성 = 새 블록 + 강화 (옛 코드는 가진 속성에도 '새 블록' 줄이 한 번 더 붙었다 — C.236 수리)
    sp.append(chip(owned() ? '강화' : '새 블록'), ' ', enhanceText());
    // GDD 111장 후속 결정 2: 노멀 강화 설명에 진화 판정 빈 칸 규칙 한 줄
    if (offer!.element === NORMAL_ELEMENT) sp.append(el('br'), el('small', 'bha-faint', normalSlotNote(faction.slotName)));
    return sp;
  }

  function chooseStep(): StepParts {
    // GDD 163장 → 172장: 갈래 버튼 = 고르기만, 설명 칸 아래 [흡수] 버튼 = 실행. 버튼 아래(왼쪽 아래 전부) = 고른 갈래 설명 칸. 오른쪽 = 지금 리스크 게이지 + 슬롯
    // 아래 줄 왼쪽 '고른 갈래: ○○' (GDD 183장 S11) — 갈래를 고를 때마다 바뀐다
    const picked_ = el('b');
    const selLine = el('span', 'bha-sub bha-absorb__sel');
    selLine.append('고른 갈래: ', picked_);
    const picker = absorbModePicker(faction, exp, (m) => {
      resultLine = absorbResultLine(faction, exp, m); // 실행 전 미리보기 = 결과 (GDD 176장 11 흡수 결과 한 줄)
      if (m === 'none') return finish(chooseRelease(exp), false);
      mode = m;
      if (m === 'stat') return finish(chooseAbsorb(exp, null, undefined, 'stat'), true);
      step = 'pick';
      render();
    }, (m) => {
      // 블록을 얻는 갈래만: 속성 강화 줄 (새 블록 / 강화 n → n+1)
      if (m !== 'both' && m !== 'trait') return [];
      const enh = el('p', 'bha-small bha-absorb__enh');
      enh.append(enhanceRow());
      return [enh];
    }, (m) => { picked_.textContent = MODE_LABELS[m].label; });
    first = picker.first;
    // GDD 183장 S11: 왼쪽 판 = 상대 카드 + 지금 리스크 게이지 + 슬롯 / 오른쪽 = 갈래 4개 → 설명 칸(고정 높이) / 아래 줄 = 고른 갈래 · [○○하기] (DOM 순서 = 기기 ▲▼: 갈래 → 버튼)
    const [modes, desc, go] = [picker.actions, picker.desc, picker.go];
    // 설명 칸 바닥 '▼ 더 있음' = 공용 띠 (.bha-more--sticky, C.296). 첫 흡수 연습(옛 틀 .bha-absorbpage)은 .bha-pop__more 그대로
    desc.querySelector('.bha-pop__more')?.setAttribute('class', 'bha-more bha-more--sticky bha-absorb__more');
    const nodes: HTMLElement[] = [
      foeCard(),
      el('p', 'bha-dim bha-absorb__lead', `${foeName}을(를) 쓰러뜨렸다.`),
      meter({ kind: 'risk', label: `지금 ${faction.riskGaugeName}`, icon: 'i-risk', value: Math.round(exp.risk), max: RX.limit, zone: 0.6, danger: exp.risk >= 60 }),
      slotSummary(),
    ];
    const side: HTMLElement[] = [modes, desc];
    if (error) side.push(notice('danger', error, { title: `${act}을(를) 처리하지 못했다` }));
    return { title: `${act} 가능`, main: nodes, side, dock: [selLine, go] };
  }

  /** 특성 후보 카드 (2단계 고르기 = 버튼. 옛 3단계 교체의 article 은 C.312 에 삭제) */
  function candCard(id: string): HTMLButtonElement {
    const t = getTrait(id);
    const c = paintElement(el('button', 'bha-cand'), t.element);
    c.type = 'button';
    const mark = el('span', 'bha-cand__mark');
    mark.append(elementDot(t.element, faction.id));
    const top = el('span', 'bha-cand__top');
    // C.176 (GDD 106장 1): 카드마다 지금 몇 강인지 — 안 가진 블록 = '새 블록', 가진 블록 = 'n강 → n+1강'(고르면 강화만). 강화는 속성 단위(84장 8)
    // GDD 158장 4: 이름 = "물 권", 강화 수치 = "n/100". 위력 등 효과 수치는 흡수 화면에서 뺀다(가방 블록 상세에서 본다)
    const have = ownsTraitBlock(exp.build, id);
    const badge = chip(have ? '가진 블록' : '새 블록');
    badge.dataset.candStep = have ? 'owned' : 'new';
    top.append(el('span', 'bha-cand__name', absorbBlockName(faction, id)), badge, ...traitTags(id));
    const foot = el('span', 'bha-cand__foot');
    foot.append(el('span', 'bha-num', `강화 ${enhanceFraction(exp.build, t.element)}`));
    // 카드 자체가 고르기 버튼이라는 표시 (GDD 100장 #50)
    foot.append(el('b', 'bha-cand__pick', '✓ 고르기'));
    const body = el('span', 'bha-cand__body');
    const desc = absorbDesc(plainText(traitDescription(id, faction.id)));
    // GDD 193장 5 (C.312): 같은 속성 블록 설명이 글자까지 같아 고를 근거가 없었다 → 블록마다 실제 데이터 차이 한 줄 (계열·단계 기술·추가 효과)
    body.append(top, el('span', 'bha-cand__diff', traitDiffLine(faction, id)), ...(desc ? [el('span', 'bha-cand__desc', desc)] : []), foot);
    c.append(mark, body);
    return c;
  }

  /** 새 화면의 기본 선택 (✓ 로 바로 누를 것): 기기 선택은 초점이 있는 항목을 먼저 고른다 */
  let first: HTMLElement | null = null;

  function pickStep(): StepParts {
    // 흡수 연출 꾸밈(GDD 25-11)이 사라지게 할 적이 확정 순간에도 보이도록 적 카드를 같이 둔다
    // 노멀 후보는 칸에 안 들어가고 노멀 강화만 오른다 (GDD 111장 · 176장 12: 왼쪽 '빈 슬롯에 들어간다'와 카드 '칸에 들어가지 않는다'가 어긋났다)
    const dockGo: HTMLElement[] = [];
    const cands = offer!.candidates;
    const fresh = cands.filter((id) => !ownsTraitBlock(exp.build, id));
    // GDD 193장 13 (C.312): 슬롯이 가득이고 새 블록 후보가 있으면 한 화면 — 후보 버튼 줄 → 넣을 곳(칸마다 [이것과 바꾸기] + [보유에만 넣기]) · 아래 줄 [포기]. 옛 3단계 교체 화면은 없다
    const full = isFull(exp.build) && fresh.length > 0;
    const where = offer!.element === NORMAL_ELEMENT ? `고르면 ${elementName(NORMAL_ELEMENT, faction.id)} 강화가 오른다.`
      : full ? `${faction.slotName}이(가) 가득 찼다. 블록을 고른 뒤 넣을 곳을 고른다.` : '고르면 빈 슬롯에 들어간다.';
    const nodes: HTMLElement[] = [foeCard(), el('p', 'bha-dim', fixParticles(`${MODE_LABELS[mode].label}: ${foeName}에게서 얻을 블록을 고른다. ${where}`))];
    const side: HTMLElement[] = [];
    if (cands.length === 0) {
      // 후보가 없을 때(그 속성 특성이 없는 적 등): 가진 속성이면 강화만
      const none = el('div', 'bha-panel bha-panel--inset bha-center bha-absorb__none');
      if (owned()) none.append(icon('i-evolve', 'lg'), el('b', '', '이미 가진 속성 — 강화만'), el('p', '', enhanceText()), el('p', 'bha-dim', '이번에는 고를 블록 후보가 없다.'));
      else none.append(icon('i-unknown', 'lg'), el('b', '', '나올 수 있는 블록이 없다'), el('p', 'bha-dim', '새로 얻을 블록이 없다. 효과만 얻는다.'));
      const go = button({ label: owned() ? `강화하고 ${act}` : `블록 없이 ${act}`, variant: 'primary', onClick: () => finish(chooseAbsorb(exp, null, undefined, mode), true) });
      go.classList.add('bha-absorb__run');
      first = go;
      side.push(none);
      dockGo.push(go);
    } else if (full) {
      if (!picked || !fresh.includes(picked)) picked = fresh[0]!;
      // 후보 버튼 줄 = 갈래 버튼과 같은 모양(고르기만, 다시 눌러도 실행 안 함). 가진 블록 후보는 가득이어도 교체 없이 강화만(106장 1) — 누르면 바로
      const row = el('div', 'bha-absorb__actions bha-absorb__candbtns');
      // 고른 후보의 차이 한 줄 + 설명 = 왼쪽 판 (후보 버튼이 바뀌면 글만 바뀐다 — 버튼·넣을 곳 자리 고정, 173장 2)
      const pickDesc = el('div', 'bha-panel bha-panel--inset bha-absorb__pickdesc');
      pickDesc.setAttribute('aria-live', 'polite');
      const paintPickDesc = (id: string): void => {
        const desc = absorbDesc(plainText(traitDescription(id, faction.id)));
        pickDesc.replaceChildren(el('b', 'bha-absorb__diff', traitDiffLine(faction, id)), ...(desc ? [el('p', 'bha-small bha-dim', desc)] : []));
      };
      const dests = el('div', 'bha-stack bha-absorb__slotlist');
      const btns = cands.map((id) => {
        const t = getTrait(id);
        const have = ownsTraitBlock(exp.build, id);
        const b = paintElement(button({ size: 'small' }), t.element);
        b.dataset.candStep = have ? 'owned' : 'new';
        b.dataset.cand = id;
        const name = el('span', 'bha-absorb__candname');
        name.append(elementDot(t.element, faction.id), absorbBlockName(faction, id));
        b.append(name, el('small', 'bha-absorb__candsub', have ? '가진 블록 · 강화만' : `새 블록 · ${faction.traitKindNames[t.kind]}`));
        if (have) b.onclick = () => finish(chooseAbsorb(exp, id, undefined, mode), true);
        else {
          // ▲▼ 하이라이트가 옮겨 오면 고르기, 손가락 = 고르기, 기기 ✓·키보드(detail 0) = 고른 뒤 첫 넣을 곳으로 (갈래 버튼과 같은 길)
          b.addEventListener('bha-select', () => select(id));
          b.onclick = (e) => {
            select(id);
            if (e.detail === 0) dests.querySelector('button')?.dispatchEvent(new CustomEvent('bha-goto', { bubbles: true }));
          };
        }
        return b;
      });
      const select = (id: string): void => {
        picked = id;
        btns.forEach((b) => {
          const on = b.dataset.cand === id;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-pressed', String(on));
        });
        paintPickDesc(id);
      };
      row.append(...btns);
      // 넣을 곳: 칸마다 지금 블록 + 그 블록의 차이 한 줄(193장 5 — 바꾸는 쪽도 비교) → [이것과 바꾸기]
      exp.build.slots.forEach((id, i) => {
        const t = getTrait(id!);
        const b = paintElement(el('button', 'bha-slot bha-slot--filled'), t.element);
        b.type = 'button';
        b.append(el('span', 'bha-slot__name', `${i + 1}번 ${absorbBlockName(faction, id!)}`), el('span', 'bha-slot__enh bha-num', `강화 ${enhanceFraction(exp.build, t.element)} · 이것과 바꾸기`), el('span', 'bha-slot__diff', traitDiffLine(faction, id!, { short: true })));
        b.onclick = () => finish(chooseAbsorb(exp, picked, i, mode), true);
        dests.append(b);
      });
      // 보유에만 넣기 (193장 13): 칸은 그대로, 보유 목록에 넣어 둔다 — 둥지(대원실)에서 장착. 흡수 규칙·수치·런 로그는 교체와 같다
      const bag = el('button', 'bha-slot bha-slot--empty bha-absorb__bag');
      bag.type = 'button';
      bag.dataset.absorbBag = '';
      bag.append(icon('i-plus'), el('span', 'bha-slot__name', '보유에만 넣기'), el('span', 'bha-slot__enh', `${faction.nestName}에서 장착`));
      bag.onclick = () => finish(chooseAbsorb(exp, picked, 'owned', mode), true);
      dests.append(bag);
      select(picked);
      first = btns.find((b) => b.dataset.cand === picked) ?? btns[0]!;
      nodes.push(pickDesc, el('p', 'bha-faint bha-absorb__note', `바뀐 블록은 보유 목록에 남아 ${faction.nestName}에서 다시 장착할 수 있다. 포기하면 블록 없이 ${act} 효과만 얻는다.`));
      side.push(row, dests);
      const giveUp = button({ onClick: () => finish(chooseAbsorb(exp, null, undefined, mode), true) });
      giveUp.classList.add('bha-absorb__run');
      const lab = el('span', 'bha-btn__label');
      lab.append('포기', el('span', 'bha-btn__sub', `블록 없이 ${act}`));
      giveUp.append(lab);
      dockGo.push(giveUp);
    } else {
      // 후보 목록 = 남은 높이 고정(넘치면 그 안 스크롤) → 아래 [다시 뽑기] 줄 자리 고정 (GDD 173장 2)
      const list = el('div', 'bha-stack bha-absorb__cands');
      for (const id of cands) {
        const c = candCard(id);
        first ??= c;
        // 빈 슬롯이 있거나 가진 블록(강화만)이면 바로 (가득 + 새 블록은 위 full 한 화면)
        c.onclick = () => finish(chooseAbsorb(exp, id, undefined, mode), true);
        list.append(c);
      }
      side.push(list);
    }
    // 다시 뽑기 (GDD 25-9): 흡수 1번에 1장. 다 쓰거나 이미 다시 뽑았으면 잠김. 자리 = 아래 줄 [돌아가기] 옆 (C.312: 가득 한 화면에서 오른쪽 열을 넣을 곳 목록이 다 쓰므로, 두 경우 같은 자리)
    const n = reroll?.tickets() ?? 0;
    const dockMid: HTMLElement[] = [];
    if (reroll && cands.length > 0 && (n > 0 || offer!.rerolled)) {
      const line = el('div', 'bha-absorb__reroll');
      // 숫자는 가진 장 수 하나만 (GDD 100장 #51)
      const rb = button({ label: `다시 뽑기 · ${n}장`, icon: 'i-swap', size: 'small', disabled: offer!.rerolled === true || n <= 0, onClick: () => {
        if (reroll.use()) render();
      } });
      rb.dataset.sc = 'reroll';
      // 설명 한 줄은 아래 줄이 좁아(폰 글자 1.15 에서 [돌아가기]가 꺾였다) 버튼 툴팁으로
      rb.title = offer!.rerolled ? `이번 ${act}에서는 이미 다시 뽑았다` : '후보를 한 번 다시 뽑는다 · 1장 씀';
      line.append(rb);
      dockMid.push(line);
    }
    // 후보 0개면 '0개 중 1개 고르기' 대신 (GDD 100장 #49). 아래 줄 = [돌아가기] · 다시 뽑기 (+ 실행·[포기] 버튼, 오른쪽 고정 자리)
    const title = cands.length === 0 ? '새 블록 없음 — 강화만' : full ? `블록 후보 ${cands.length}개 · 넣을 곳 고르기` : `블록 후보 ${cands.length}개 (1개 고르기)`;
    return { title, main: nodes, side, dock: [backBtn('choose'), ...dockMid, ...dockGo] };
  }

  function render(): void {
    first = null;
    const stepNo = step === 'choose' ? 1 : 2;
    const parts = step === 'choose' ? chooseStep() : pickStep();
    const side = [...parts.side];
    if (error && step !== 'choose') side.push(notice('danger', error, { title: `${act}을(를) 처리하지 못했다` }));
    // 임시 데이터 개발 메모 줄은 삭제 (GDD 168장 4 — 테스트 모드에서도 안 보인다. 이름의 '임시' 표시는 그대로)
    const main = parts.main;
    // 리디자인 v2 (GDD 183장 S11): 머리 44 = 제목 · 단계 · [내 상태] / 왼쪽 판 = 상대 / 오른쪽 = 고를 것 / 아래 줄 56 = 버튼 고정 자리
    const head = el('header', 'bha-head bha-absorb__head');
    // [내 상태] (GDD 128장 7): 장착 블록·강화·이번 원정 흡수·진화 쏠림 창
    const me = button({ label: '내 상태', size: 'small', onClick: () => openAbsorbStatus(faction, exp) });
    me.prepend(v2Icon('figure'));
    me.dataset.absorbMe = '';
    head.append(el('h1', 'bha-title', parts.title), steps(stepNo), el('span', 'bha-absorb__grow'), me);
    const left = el('section', 'bha-panel bha-absorb__left');
    left.append(...main);
    const right = el('section', 'bha-absorb__right');
    right.append(...side);
    const dock = el('footer', 'bha-dock bha-absorb__dock');
    dock.append(...parts.dock);
    const app = mountApp(root, { cls: `bha-v2 bha-absorbv2 bha-absorbv2--${step}` }, head, left, right, dock);
    app.dataset.owner = owner;
    (first as HTMLElement | null)?.focus({ preventScroll: true }); // 기본 선택 = 첫 갈래(163장 1)·첫 후보·첫 슬롯 ([돌아가기] 가 아니라, GDD 100장 #50)
  }
  // 뒤로 (GDD 128장 4, C.202): 열린 창은 기기가 먼저 닫는다 → 2단계는 1단계로 → 첫 단계는 '흡수 안 하고 넘어가기' 확인(기본 아니오)
  onScreenBack({
    // 다른 흡수 화면이 열렸으면 이 처리기는 끝난 것
    alive: () => !done && (root.querySelector<HTMLElement>('.bha-absorbv2')?.dataset.owner ?? owner) === owner,
    mine: () => root.querySelector<HTMLElement>('.bha-absorbv2')?.dataset.owner === owner,
    run: () => {
      if (step === 'pick') step = 'choose';
      else {
        confirmDialog({
          title: `${act} 안 하고 넘어가기`,
          body: `${foeName}을(를) 놓아준다 · ${faction.riskGaugeName} −${RX.releaseRelief}`,
          yes: '넘어가기',
          no: '아니오',
          focusNo: true,
          onYes: () => {
            if (!done) finish(chooseRelease(exp), false);
          },
        });
        return;
      }
      error = '';
      render();
    },
  });
  render();
}
