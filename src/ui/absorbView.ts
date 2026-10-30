// 흡수 화면 (GDD 4장, 4-1): 전투 승리 후 흡수 / 놓아줌 → 특성 후보 선택 → 슬롯 장착(가득 차면 교체/포기).
// 문구는 FactionConfig(absorbActionName, chainName, riskGaugeName, stabilityName …)에서 읽는다.
import { BALANCE } from '../config/balance';
import { fixParticles } from '../engine/josa';
import { findEnemyDef } from '../data/bosses';
import { NORMAL_ELEMENT, elementName, statName, weaknessesOf } from '../data/elements';
import { normalSlotNote } from '../data/help/textFormat';
import { STAT_IDS, pickFaction, type EnemyDef } from '../data/schema';
import { getTrait, traitDescription, traitName } from '../data/traits';
import { absorbModeRule, absorbRisk, basicAttackMultiplier, enhanceAttackBonus, enhanceLevel, isFull, ownsElement, ownsTraitBlock, type AbsorbMode, type AbsorbOffer } from '../engine/absorb';
import { absorbEvOf, chooseAbsorb, chooseRelease, type ExpeditionState } from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import { PROVISIONAL_NOTE } from './buildPanel';
import { button, chip, el, icon, meter, notice, tag } from './bha/dom';
import { lcdPage } from './bha/lcdpage';
import { playCosmeticFx } from './bha/cosmeticFx';
import { elementColor, elementDot, elementMark, paintElement } from './bha/element';
import { devText, plainText, shownName } from './displayName';
import { confirmDialog } from './confirmDialog';
import { openAbsorbStatus } from './absorbStatus';
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
}

const STEP_LABELS = ['선택', '특성 고르기', '교체'] as const;

/** 포식 갈래 이름·한 줄 설명 (GDD 52·100장 #47): 포식 화면 버튼과 첫 포식 안내가 이 한 곳에서 읽는다. 행동 이름만 종족 설정 */
export function absorbModeText(faction: Pick<FactionConfig, 'absorbActionName' | 'riskGaugeName' | 'stabilityName'>): Record<AbsorbMode | 'none', { label: string; sub: string }> {
  const act = faction.absorbActionName;
  return {
    both: { label: `둘 다 ${act}`, sub: '특성 + 노력치' },
    trait: { label: '속성만', sub: '특성만 · 노력치 없음' },
    stat: { label: '스탯만', sub: `노력치 ×${absorbModeRule('stat').ev} · 특성 없음` },
    none: { label: `${act} 안 함`, sub: `놓아준다 · ${faction.riskGaugeName} −${RX.releaseRelief} · ${faction.stabilityName} +${RX.releaseStability}` },
  };
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
  let step: 'choose' | 'pick' | 'replace' = 'choose';
  let picked: string | null = null;
  /** 흡수 갈래 (GDD 52): 첫 단계에서 고른다. 특성 고르기·교체 단계는 이 갈래로 chooseAbsorb 를 부른다 */
  let mode: AbsorbMode = 'both';
  let error = '';
  /** 갈래 표시명 (공통 문구, 행동 이름만 종족 설정) — 첫 포식 안내와 같은 곳에서 읽는다 */
  const MODE_LABELS = absorbModeText(faction);
  /** 갈래별 노력치 문구 ("힘 +4 · 속도 +2"), 없으면 '' */
  const evTextOf = (m: AbsorbMode): string => {
    const ev = absorbEvOf(offer!, m, exp.difficulty, exp.streak);
    return STAT_IDS.filter((k) => (ev[k] ?? 0) > 0).map((k) => `${statName(k, faction.id)} +${ev[k]}`).join(' · ');
  };

  /** 이 화면이 끝났나 (뒤로 처리기를 푼다). owner = 이 흡수 화면 표시 */
  let done = false;
  const owner = `a${++absorbSeq}`;
  const finish = (r: { ok: true } | { ok: false; reason: string }, absorbed: boolean) => {
    if (r.ok) done = true;
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
    // 필요한 단계만 (GDD 100장 #53): 슬롯이 가득 차 교체할 수 있을 때만 ③
    const need = isFull(exp.build) && offer!.candidates.length > 0 ? 3 : 2;
    STEP_LABELS.slice(0, need).forEach((l, i) => {
      if (i) nav.append(el('b'));
      const sp = el('span', i + 1 === n ? 'is-active' : i + 1 < n ? 'is-done' : '');
      sp.append(el('i', '', String(i + 1)), l);
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
    const text = el('div');
    text.append(el('h2', 'bha-foecard__name', foeName), tags);
    card.append(foe, text);
    return card;
  };

  /** 슬롯 현황: 칸마다 특성 이름·종류·속성, 속성 보너스 진행/완성, 외형 파츠 문구 */
  const slotSummary = (): HTMLElement => {
    const b = exp.build;
    const box = el('div', 'bha-stack');
    const head = el('div', 'bha-row');
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
      const t = getTrait(id);
      const s = paintElement(el('div', 'bha-slot bha-slot--filled'), t.element);
      const meta = el('span', 'bha-slot__meta');
      meta.append(tag(faction.traitKindNames[t.kind], 'kind'), elementMark(t.element, faction.id));
      s.append(el('span', 'bha-slot__num', `${i + 1}번`), el('span', 'bha-slot__name', traitName(id, faction.id)), meta);
      grid.append(s);
    });
    box.append(grid);
    // 속성 강화 진행 (GDD 84장 8번). 같은 속성 3개 보너스(n/3)는 C.150 에 삭제 (GDD 94장 B 후속)
    const enh = Object.keys(b.enhance ?? {}).filter((l) => enhanceLevel(b, l) > 0).map((l) => `${elementName(l, faction.id)} ${enhanceLevel(b, l)}강`);
    if (enh.length > 0) box.append(el('p', 'bha-faint', `속성 강화: ${enh.join(' · ')}`));
    const parts = b.slots.filter((id): id is string => id !== null && getTrait(id).kind === 'part');
    if (parts.length > 0) {
      const how = faction.appearanceChange ? '본체 외형이 변한다' : `본체는 그대로, ${faction.slotName} 외형이 변한다`;
      box.append(el('p', 'bha-faint', `${faction.traitKindNames.part}: ${parts.map((id) => traitName(id, faction.id)).join(', ')} — ${how} (표시만)`));
    }
    return box;
  };

  const backBtn = (to: 'choose' | 'pick', block = true): HTMLButtonElement => {
    const b = button({ label: '돌아가기', icon: 'i-chevron-left', variant: block ? 'ghost' : undefined, block, size: block ? undefined : 'lg' });
    b.onclick = () => {
      step = to;
      render();
    };
    return b;
  };

  /** 이미 가진 속성인가 (GDD 94장 B, C.147): 그러면 흡수는 새 블록 없이 강화만. 노멀은 기본 블록을 늘 가진 것으로 본다 */
  const owned = (): boolean => ownsElement(exp.build, offer!.element);
  /** 강화 문구: "강화 n→n+1" (상한 뒤에는 횟수만). 노멀 강화는 기본 공격 블록에 붙는다 */
  function enhanceText(): string {
    const elId = offer!.element;
    const count = exp.build.enhance?.[elId] ?? 0;
    const max = AX.enhance.max;
    const lv = enhanceLevel(exp.build, elId);
    // 노멀 = 기본 공격 블록 배율(빈 칸 몫 포함, C.184 GDD 111장 3)
    const bonus = (n: number) => (elId === NORMAL_ELEMENT ? basicAttackMultiplier({ enhance: { [elId]: n }, slots: exp.build.slots }) - 1 : enhanceAttackBonus(n));
    const pct = (n: number) => (bonus(n) * 100).toFixed(1).replace(/\.0$/, '');
    const target = elId === NORMAL_ELEMENT ? '기본 공격 블록' : '공격 블록';
    return lv >= max
      ? `${elementName(elId, faction.id)} ${max}강 최대 · ${target} +${pct(max)}% · ${act} ${count}회 → ${count + 1}회`
      : `${elementName(elId, faction.id)} ${lv}강 → ${lv + 1}강 · ${target} +${pct(lv)}% → +${pct(lv + 1)}%`;
  }
  /** 속성 강화 줄 (흡수 첫 단계): 가진 속성 = "강화 n→n+1" / 처음 먹는 속성 = "새 블록" + 강화 */
  function enhanceRow(): HTMLElement {
    const sp = el('span');
    if (owned()) sp.append(chip('강화'), ' ', enhanceText());
    // GDD 111장 후속 결정 2: 노멀 강화 설명에 진화 판정 빈 칸 규칙 한 줄
    if (offer!.element === NORMAL_ELEMENT) sp.append(el('br'), el('small', 'bha-faint', normalSlotNote(faction.slotName)));
    else sp.append(chip('새 블록'), ' ', `${elementName(offer!.element, faction.id)} 블록을 처음 얻는다 · ${enhanceText()}`);
    return sp;
  }

  function chooseStep(): StepParts {
    const riskOf = (m: AbsorbMode) => absorbRisk(offer!.strength, m);
    const breaks = (m: AbsorbMode) => exp.risk + riskOf(m) >= RX.limit;
    const risk = riskOf('both');
    const willBreak = breaks('both');
    const nodes: HTMLElement[] = [el('p', 'bha-dim bha-absorb__lead', `${foeName}을(를) 쓰러뜨렸다.`), foeCard()];
    // GDD 100장 #44·45: 설명 표는 버튼 아래 작은 글과 같은 내용이라 뺐다. 왼쪽 = 상대 + 갈래 버튼 2×2, 오른쪽 = 슬롯 목록만(3칸이 가려지지 않게)
    const enh = el('p', 'bha-small');
    enh.append(enhanceRow());
    nodes.push(
      enh,
      el('p', 'bha-faint', `${act}하면 ${faction.fullnessName} 가득 · 타일 +1.`),
    );
    const side: HTMLElement[] = [
      meter({
        kind: 'risk', label: `지금 ${faction.riskGaugeName}`, icon: 'i-risk', value: Math.round(exp.risk), max: RX.limit, zone: 0.6, danger: exp.risk >= 60 || willBreak,
        note: willBreak ? `${act}하면 ${faction.frenzyName}! (${Math.round(exp.risk)} + ${Math.round(risk)} = ${Math.round(exp.risk + risk)})` : undefined,
      }),
      slotSummary(),
    ];
    if (error) side.push(notice('danger', error, { title: `${act}을(를) 처리하지 못했다` }));
    const sub = (b: HTMLButtonElement, text: string) => {
      b.append(el('small', '', text));
      return b;
    };
    /** 버튼 아래 작은 글: 갈래 설명 + 리스크 (가진 속성은 특성 대신 강화, C.150) */
    const modeSub = (m: AbsorbMode): string => {
      if (breaks(m)) return `${faction.frenzyName} 상태가 된다`;
      return `${MODE_LABELS[m].sub} · ${faction.riskGaugeName} +${Math.round(riskOf(m))}`;
    };
    const modeBtn = (m: AbsorbMode, icon: string, go: () => void): HTMLButtonElement => {
      const b = sub(button({ label: MODE_LABELS[m].label, icon, variant: breaks(m) ? 'danger' : m === 'both' ? 'primary' : undefined, size: 'lg', onClick: go }), modeSub(m));
      b.dataset.mode = m;
      return b;
    };
    const both = modeBtn('both', 'i-absorb', () => { mode = 'both'; step = 'pick'; render(); });
    const trait = modeBtn('trait', 'i-absorb', () => { mode = 'trait'; step = 'pick'; render(); });
    const stat = modeBtn('stat', 'i-absorb', () => { mode = 'stat'; finish(chooseAbsorb(exp, null, undefined, 'stat'), true); });
    const r = sub(button({ label: MODE_LABELS.none.label, icon: 'i-release', size: 'lg', onClick: () => finish(chooseRelease(exp), false) }), `놓아준다 · ${faction.riskGaugeName} −${RX.releaseRelief}`);
    r.dataset.mode = 'none';
    const actions = el('div', 'bha-absorb__actions bha-absorb__actions--modes');
    actions.append(both, trait, stat, r);
    nodes.push(actions);
    return { title: `${act} 가능`, main: nodes, side };
  }

  /** 특성 후보 카드 (2단계 고르기 = 버튼, 3단계 교체 = 넣을 특성 보기 article) */
  function candCard(id: string, tagName: 'button' | 'article'): HTMLElement {
    const t = getTrait(id);
    const c = paintElement(el(tagName, 'bha-cand'), t.element);
    if (c instanceof HTMLButtonElement) c.type = 'button';
    const mark = el('span', 'bha-cand__mark');
    mark.append(elementDot(t.element, faction.id));
    const top = el('span', 'bha-cand__top');
    // C.176 (GDD 106장 1): 카드마다 지금 몇 강인지 — 안 가진 블록 = '새 블록', 가진 블록 = 'n강 → n+1강'(고르면 강화만). 강화는 속성 단위(84장 8)
    const lv = enhanceLevel(exp.build, t.element);
    const step = lv >= AX.enhance.max ? `${AX.enhance.max}강 최대` : `${lv}강 → ${lv + 1}강`;
    const have = ownsTraitBlock(exp.build, id);
    const badge = chip(have ? step : '새 블록');
    badge.dataset.candStep = have ? 'owned' : 'new';
    top.append(el('span', 'bha-cand__name', traitName(id, faction.id)), badge, ...traitTags(id));
    // 강화 단계는 머리 배지에 있으니 아래 줄은 한 번만 짧게 (C.218, GDD 140장 3)
    const foot = el('span', 'bha-cand__foot');
    foot.append(el('span', '', have ? `이미 가진 블록 — ${elementName(t.element, faction.id)} 강화만` : `새 블록 · ${elementName(t.element, faction.id)} ${step}`));
    // 카드 자체가 고르기 버튼이라는 표시 (GDD 100장 #50)
    if (tagName === 'button') foot.append(el('b', 'bha-cand__pick', '✓ 고르기'));
    const body = el('span', 'bha-cand__body');
    body.append(top, el('span', 'bha-cand__desc', plainText(traitDescription(id, faction.id))), foot);
    c.append(mark, body);
    return c;
  }

  /** 새 화면의 기본 선택 (✓ 로 바로 누를 것): 기기 선택은 초점이 있는 항목을 먼저 고른다 */
  let first: HTMLElement | null = null;

  function pickStep(): StepParts {
    // 흡수 연출 꾸밈(GDD 25-11)이 사라지게 할 적이 확정 순간에도 보이도록 적 카드를 같이 둔다
    const nodes: HTMLElement[] = [foeCard(), el('p', 'bha-dim', `${MODE_LABELS[mode].label}: ${foeName}에게서 얻을 특성을 고른다. 고르면 빈 슬롯에 들어간다.`)];
    const side: HTMLElement[] = [];
    if (offer!.candidates.length === 0) {
      // 후보가 없을 때(그 속성 특성이 없는 적 등): 가진 속성이면 강화만
      const none = el('div', 'bha-panel bha-panel--inset bha-center bha-absorb__none');
      if (owned()) none.append(icon('i-evolve', 'lg'), el('b', '', '이미 가진 속성 — 강화만'), el('p', '', enhanceText()), el('p', 'bha-dim', '이번에는 고를 블록 후보가 없다.'));
      else none.append(icon('i-unknown', 'lg'), el('b', '', '나올 수 있는 특성이 없다'), el('p', 'bha-dim', '새로 얻을 특성이 없다. 효과만 얻는다.'));
      const go = button({ label: owned() ? `강화하고 ${act}` : `특성 없이 ${act}`, variant: 'primary', size: 'lg', block: true, onClick: () => finish(chooseAbsorb(exp, null, undefined, mode), true) });
      first = go;
      side.push(none, go);
    } else {
      const list = el('div', 'bha-stack');
      for (const id of offer!.candidates) {
        const c = candCard(id, 'button');
        first ??= c;
        c.onclick = () => {
          // 가진 블록은 슬롯이 가득이어도 교체 없이 강화만 (106장 1)
          if (isFull(exp.build) && !ownsTraitBlock(exp.build, id)) {
            picked = id;
            step = 'replace';
            render();
          } else finish(chooseAbsorb(exp, id, undefined, mode), true);
        };
        list.append(c);
      }
      side.push(list);
    }
    // 다시 뽑기 (GDD 25-9): 흡수 1번에 1장. 다 쓰거나 이미 다시 뽑았으면 잠김
    const n = reroll?.tickets() ?? 0;
    if (reroll && offer!.candidates.length > 0 && (n > 0 || offer!.rerolled)) {
      const line = el('div', 'bha-absorb__reroll');
      // 숫자는 가진 장 수 하나만 (GDD 100장 #51)
      const rb = button({ label: `다시 뽑기 · ${n}장`, icon: 'i-swap', size: 'small', disabled: offer!.rerolled === true || n <= 0, onClick: () => {
        if (reroll.use()) render();
      } });
      rb.dataset.sc = 'reroll';
      line.append(rb, el('small', 'bha-faint', offer!.rerolled ? `이번 ${act}에서는 이미 다시 뽑았다` : '후보를 한 번 다시 뽑는다 · 1장 씀'));
      side.push(line);
    }
    nodes.push(backBtn('choose'));
    // 후보 0개면 '0개 중 1개 고르기' 대신 (GDD 100장 #49)
    return { title: offer!.candidates.length === 0 ? '새 특성 없음 — 강화만' : `특성 후보 ${offer!.candidates.length}개 (1개 고르기)`, main: nodes, side };
  }

  function replaceStep(): StepParts {
    // 왼쪽 = 넣을 새 특성 카드(2단계와 같은 카드), 오른쪽 = 슬롯 줄 '이것과 바꾸기' (GDD 100장 #52)
    const nodes: HTMLElement[] = [
      foeCard(),
      el('p', 'bha-small', '넣을 특성'),
      candCard(picked!, 'article'),
      el('p', 'bha-faint', `바뀐 특성은 보유 목록에 남아 ${faction.nestName}에서 다시 장착할 수 있다. 포기하면 특성 없이 ${act} 효과만 얻는다.`),
    ];
    const list = el('div', 'bha-stack');
    exp.build.slots.forEach((id, i) => {
      const t = getTrait(id!);
      const b = paintElement(el('button', 'bha-slot bha-slot--filled'), t.element);
      b.type = 'button';
      const meta = el('span', 'bha-slot__meta');
      meta.append(tag(faction.traitKindNames[t.kind], 'kind'), elementMark(t.element, faction.id));
      b.append(el('span', 'bha-slot__num', `${i + 1}번 · 이것과 바꾸기`), el('span', 'bha-slot__name', traitName(id!, faction.id)), meta);
      b.onclick = () => finish(chooseAbsorb(exp, picked, i, mode), true);
      first ??= b;
      list.append(b);
    });
    const giveUp = button({ variant: 'ghost', size: 'lg', onClick: () => finish(chooseAbsorb(exp, null, undefined, mode), true) });
    const lab = el('span', 'bha-btn__label');
    lab.append('포기', el('span', 'bha-btn__sub', `특성 없이 ${act}`));
    giveUp.append(lab);
    const grid = el('div', 'bha-grid2');
    grid.append(backBtn('pick', false), giveUp);
    nodes.push(grid);
    return { title: `${faction.slotName}: 가득 참`, main: nodes, side: [list] };
  }

  function render(): void {
    first = null;
    const stepNo = step === 'choose' ? 1 : step === 'pick' ? 2 : 3;
    const parts = step === 'choose' ? chooseStep() : step === 'pick' ? pickStep() : replaceStep();
    const side = [...parts.side];
    if (error && step !== 'choose') side.push(notice('danger', error, { title: `${act}을(를) 처리하지 못했다` }));
    // 임시 데이터 안내는 테스트 모드에서만, 왼쪽 열 맨 아래 (T-4, 플레이어 화면에서는 뺀다 — GDD 94장 A 2번과 같이, C.150)
    const main = devText() ? [...parts.main, el('p', 'bha-faint', PROVISIONAL_NOTE)] : parts.main;
    // 가로 LCD (T-3): 머리 = 단계 표시, 왼쪽·오른쪽 열이 각자 그 안에서 스크롤 (행동 버튼이 있는 오른쪽은 대부분 한 화면)
    const head = el('header', 'bha-absorb__head');
    // [내 상태] (GDD 128장 7): 장착 블록·강화·이번 원정 흡수·진화 쏠림 창
    const me = button({ label: '내 상태', icon: 'i-info', size: 'small', variant: 'ghost', onClick: () => openAbsorbStatus(faction, exp) });
    me.dataset.absorbMe = '';
    head.append(steps(stepNo), el('h1', 'bha-h1', parts.title), me);
    lcdPage(root, { cls: 'bha-absorbpage', cols: 'minmax(0, 0.9fr) minmax(0, 1.1fr)' }, head, main, side).app.dataset.owner = owner;
    (first as HTMLElement | null)?.focus({ preventScroll: true }); // 2·3단계 기본 선택 = 첫 후보·첫 슬롯 ([돌아가기] 가 아니라, GDD 100장 #50)
  }
  // 뒤로 (GDD 128장 4, C.202): 열린 창은 기기가 먼저 닫는다 → 2·3단계는 한 단계 앞으로 → 첫 단계는 '흡수 안 하고 넘어가기' 확인(기본 아니오)
  onScreenBack({
    // 다른 흡수 화면이 열렸으면 이 처리기는 끝난 것
    alive: () => !done && (root.querySelector<HTMLElement>('.bha-absorbpage')?.dataset.owner ?? owner) === owner,
    mine: () => root.querySelector<HTMLElement>('.bha-absorbpage')?.dataset.owner === owner,
    run: () => {
      if (step === 'replace') step = 'pick';
      else if (step === 'pick') step = 'choose';
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
