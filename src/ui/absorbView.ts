// 흡수 화면 (GDD 4장, 4-1): 전투 승리 후 흡수 / 놓아줌 → 특성 후보 선택 → 슬롯 장착(가득 차면 교체/포기).
// 문구는 FactionConfig(absorbActionName, chainName, riskGaugeName, stabilityName …)에서 읽는다.
import { BALANCE } from '../config/balance';
import { findEnemyDef } from '../data/bosses';
import { elementName, statName, weaknessesOf } from '../data/elements';
import { STAT_IDS, pickFaction, type EnemyDef } from '../data/schema';
import { getTrait, traitDescription, traitName } from '../data/traits';
import { absorbModeRule, absorbRisk, completedElements, elementCounts, enhanceLevel, isFull, type AbsorbMode, type AbsorbOffer } from '../engine/absorb';
import { absorbEvOf, chooseAbsorb, chooseRelease, type ExpeditionState } from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import { PROVISIONAL_NOTE } from './buildPanel';
import { button, chip, el, icon, info, meter, notice, panel, tag } from './bha/dom';
import { lcdPage } from './bha/lcdpage';
import { val } from './bha/expedition';
import { playCosmeticFx } from './bha/cosmeticFx';
import { elementColor, elementDot, elementMark, paintElement } from './bha/element';

const AX = BALANCE.provisional.absorb;
const RX = BALANCE.provisional.risk;

/** 이 적의 약점 속성 이름들 ("뇌" / 융합은 "뇌·흙"). 없으면 null (노멀·특수 속성 적) */
export function weaknessText(enemy: Pick<EnemyDef, 'element'>, factionId: string): string | null {
  const w = weaknessesOf([enemy.element]);
  return w.length ? w.map((x) => elementName(x, factionId)).join('·') : null;
}

/** 흡수 안내 (C.125, GDD 70·71장): 조건 없이 이기면 언제나, 특성 후보는 그 적의 속성 특성에서만 */
export function absorbRuleText(faction: FactionConfig, enemy: Pick<EnemyDef, 'element'>): string {
  return `이기면 언제나 ${faction.absorbActionName} 가능. 특성 후보는 이 적의 속성(${elementName(enemy.element, faction.id)}) 특성에서만 나온다.`;
}

/** 한 단계의 두 열 내용: 왼쪽(설명·선택 상대 정보) / 오른쪽(고를 것·조작) — 가로 LCD (T-2) */
interface StepParts {
  /** 단계 표시 옆에 보이는 제목 */
  title: string;
  main: HTMLElement[];
  side: HTMLElement[];
}

const STEP_LABELS = ['선택', '특성 고르기', '교체'] as const;

/** 다시 뽑기권 (GDD 25-9): 남은 장수와 쓰기(성공하면 후보가 바뀐다). 없으면 버튼을 그리지 않는다 */
export interface RerollHandle {
  tickets: () => number;
  use: () => boolean;
}

export function absorbView(root: HTMLElement, faction: FactionConfig, exp: ExpeditionState, onDone: (absorbed: boolean) => void, reroll?: RerollHandle): void {
  const offer = exp.absorbOffer;
  if (!offer) return onDone(false);
  const enemy = findEnemyDef(offer.enemyId) // 보스(GDD 25-3)도 흡수 화면에 온다;
  const act = faction.absorbActionName;
  const foeName = pickFaction(enemy.name, faction.id);
  let step: 'choose' | 'pick' | 'replace' = 'choose';
  let picked: string | null = null;
  /** 흡수 갈래 (GDD 52): 첫 단계에서 고른다. 특성 고르기·교체 단계는 이 갈래로 chooseAbsorb 를 부른다 */
  let mode: AbsorbMode = 'both';
  let error = '';
  /** 갈래 표시명 (공통 문구, 행동 이름만 종족 설정) */
  const MODE_LABELS: Record<AbsorbMode, { label: string; sub: string }> = {
    both: { label: `둘 다 ${act}`, sub: '특성 + 노력치' },
    trait: { label: '속성만', sub: '특성만 · 노력치 없음' },
    stat: { label: '스탯만', sub: `노력치 ×${absorbModeRule('stat').ev} · 특성 없음` },
  };
  /** 갈래별 노력치 문구 ("힘 +4 · 속도 +2"), 없으면 '' */
  const evTextOf = (m: AbsorbMode): string => {
    const ev = absorbEvOf(offer!, m, exp.difficulty, exp.streak);
    return STAT_IDS.filter((k) => (ev[k] ?? 0) > 0).map((k) => `${statName(k, faction.id)} +${ev[k]}`).join(' · ');
  };

  const finish = (r: { ok: true } | { ok: false; reason: string }, absorbed: boolean) => {
    if (!r.ok) {
      error = r.reason;
      render();
    } else if (absorbed) {
      // 흡수 연출 꾸밈 (GDD 25-11): 적이 사라지는 방식을 보여 준 뒤 넘어간다. 입은 연출이 없으면 바로
      const card = root.querySelector<HTMLElement>('.bha-foecard');
      if (!(card && playCosmeticFx('absorb', card, () => onDone(true)))) onDone(true);
    } else onDone(absorbed);
  };

  /** 특성 종류 태그 + 희귀 칩 */
  const traitTags = (id: string): HTMLElement[] => {
    const t = getTrait(id);
    const out: HTMLElement[] = [tag(faction.traitKindNames[t.kind], 'kind')];
    if (t.rare) out.push(chip('희귀', 'rare'));
    return out;
  };

  const steps = (n: number): HTMLElement => {
    const nav = el('nav', 'bha-steps');
    nav.setAttribute('aria-label', '흡수 단계');
    STEP_LABELS.forEach((l, i) => {
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
    const counts = elementCounts(b);
    const done = completedElements(b);
    const progress = Object.entries(counts).map(([l, n]) => `${elementName(l, faction.id)} ${n}/${AX.elementBonusCount}`);
    if (done.length > 0) {
      box.append(notice('good', `${faction.lineageBonusName}: ${done.map((l) => elementName(l, faction.id)).join(', ')} 블록 위력(피해·막기·회복) +${Math.round(AX.elementSkillBonus * 100)}% (임시)`));
    } else if (progress.length > 0) {
      box.append(el('p', 'bha-faint', `${faction.lineageBonusName} 진행: ${progress.join(' · ')} (같은 속성 ${AX.elementBonusCount}개)`));
    }
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

  /** 속성 강화 줄: 지금 단계/상한 → 흡수(특성·속성 갈래)하면 +1. 상한 뒤에는 횟수만 */
  function enhanceRow(): HTMLElement {
    const elId = offer!.element;
    const count = exp.build.enhance?.[elId] ?? 0;
    const max = AX.enhance.max;
    const lv = enhanceLevel(exp.build, elId);
    const pct = (n: number) => (AX.enhance.attackPerLevel * n * 100).toFixed(1).replace(/\.0$/, '');
    const text = lv >= max
      ? `${elementName(elId, faction.id)} ${max}/${max} 최대 · 공격 블록 +${pct(max)}% · 흡수 ${count}회 → ${count + 1}회`
      : `${elementName(elId, faction.id)} ${lv}/${max} → ${lv + 1}/${max} · 공격 블록 +${pct(lv)}% → +${pct(lv + 1)}%`;
    return el('span', '', text);
  }

  function chooseStep(): StepParts {
    const riskOf = (m: AbsorbMode) => absorbRisk(offer!.strength, m);
    const breaks = (m: AbsorbMode) => exp.risk + riskOf(m) >= RX.limit;
    const risk = riskOf('both');
    const willBreak = breaks('both');
    const nodes: HTMLElement[] = [el('p', 'bha-dim bha-absorb__lead', `${foeName}을(를) 쓰러뜨렸다.`), foeCard()];
    const rareNote = offer!.rare ? notice('rare', '이 개체의 희귀 특성이 후보에 확정으로 나온다.', { title: '희귀 개체!' }) : null;
    const lin = el('span');
    lin.append(elementMark(offer!.element, faction.id));
    const risky = (n: string, good: boolean) => {
      const b = el('b', '', n);
      b.style.color = good ? 'var(--bha-good)' : 'var(--bha-risk)';
      return b;
    };
    const withNum = (...parts: (string | Node)[]) => {
      const sp = el('span');
      sp.append(...parts);
      return sp;
    };
    nodes.push(
      panel(
        {},
        info([
          { label: '상대', value: val(foeName, offer!.elite ? '강적' : '일반') },
          { label: '속성', value: lin },
          // 속성 강화 (GDD 84장 8번): 이미 가진 계열이어도 그 속성 적을 흡수하면 +1, 효과는 100 까지 (뒤에도 횟수는 센다)
          { label: '속성 강화', mod: 'stack', value: enhanceRow() },
          // 흡수 갈래 4줄 (GDD 52): 셋은 허기 리셋·타일 +1 공통, 리스크·노력치·특성이 다르다
          { label: MODE_LABELS.both.label, mod: 'stack', value: withNum(`특성·속성 O · ${faction.riskGaugeName} `, risky(`+${Math.round(risk)}`, false), evTextOf('both') ? ` · 노력치 ${evTextOf('both')}` : ' · 노력치 없음') },
          { label: MODE_LABELS.trait.label, mod: 'stack', value: withNum(`특성·속성 O · ${faction.riskGaugeName} `, risky(`+${Math.round(riskOf('trait'))}`, false), ' · 노력치 없음') },
          { label: MODE_LABELS.stat.label, mod: 'stack', value: withNum(`특성·속성 X · ${faction.riskGaugeName} `, risky(`+${Math.round(riskOf('stat'))}`, false), evTextOf('stat') ? ` · 노력치 ${evTextOf('stat')}` : ' · 노력치 없음') },
          { label: '놓아주면', mod: 'stack', value: withNum(`${faction.riskGaugeName} `, risky(`−${RX.releaseRelief}`, true), ` · ${faction.stabilityName} `, risky(`+${RX.releaseStability}`, true)) },
        ]),
      ),
      el('p', 'bha-faint', `${act}하는 세 갈래 모두 ${faction.fullnessName} 가득 · 타일 +1. 놓아주면 그대로.`),
      el('p', 'bha-faint bha-absorb__rule', absorbRuleText(faction, enemy)),
    );
    const side: HTMLElement[] = [
      meter({
        kind: 'risk', label: `지금 ${faction.riskGaugeName}`, icon: 'i-risk', value: Math.round(exp.risk), max: RX.limit, zone: 0.6, danger: exp.risk >= 60 || willBreak,
        note: willBreak ? `${act}하면 한계 돌파! (${Math.round(exp.risk)} + ${Math.round(risk)} = ${Math.round(exp.risk + risk)})` : undefined,
      }),
      ...(rareNote ? [rareNote] : []),
      slotSummary(),
    ];
    if (error) side.push(notice('danger', error, { title: `${act}을(를) 처리하지 못했다` }));
    const sub = (b: HTMLButtonElement, text: string) => {
      b.append(el('small', '', text));
      return b;
    };
    const modeBtn = (m: AbsorbMode, icon: string, go: () => void): HTMLButtonElement => {
      const b = sub(button({ label: MODE_LABELS[m].label, icon, variant: breaks(m) ? 'danger' : m === 'both' ? 'primary' : undefined, size: 'lg', onClick: go }), breaks(m) ? '한계 돌파한다' : MODE_LABELS[m].sub);
      b.dataset.mode = m;
      return b;
    };
    const both = modeBtn('both', 'i-absorb', () => { mode = 'both'; step = 'pick'; render(); });
    const trait = modeBtn('trait', 'i-absorb', () => { mode = 'trait'; step = 'pick'; render(); });
    const stat = modeBtn('stat', 'i-absorb', () => { mode = 'stat'; finish(chooseAbsorb(exp, null, undefined, 'stat'), true); });
    const r = sub(button({ label: `${act} 안 함`, icon: 'i-release', size: 'lg', onClick: () => finish(chooseRelease(exp), false) }), '놓아준다 · 안정 쪽으로');
    r.dataset.mode = 'none';
    const actions = el('div', 'bha-absorb__actions bha-absorb__actions--modes');
    actions.append(both, trait, stat, r);
    side.push(actions);
    return { title: `${act} 가능`, main: nodes, side };
  }

  function pickStep(): StepParts {
    // 흡수 연출 꾸밈(GDD 25-11)이 사라지게 할 적이 확정 순간에도 보이도록 적 카드를 같이 둔다
    const nodes: HTMLElement[] = [foeCard(), el('p', 'bha-dim', `${MODE_LABELS[mode].label}: ${foeName}에게서 얻을 특성을 고른다. 고르면 빈 슬롯에 들어간다.`)];
    const side: HTMLElement[] = [];
    if (offer!.candidates.length === 0) {
      const none = el('div', 'bha-panel bha-panel--inset bha-center bha-absorb__none');
      none.append(icon('i-unknown', 'lg'), el('b', '', '나올 수 있는 특성이 없다'), el('p', 'bha-dim', '새로 얻을 특성이 없다. 효과만 얻는다.'));
      side.push(none, button({ label: `특성 없이 ${act}`, variant: 'primary', size: 'lg', block: true, onClick: () => finish(chooseAbsorb(exp, null, undefined, mode), true) }));
    } else {
      const list = el('div', 'bha-stack');
      for (const id of offer!.candidates) {
        const t = getTrait(id);
        const n = (elementCounts(exp.build)[t.element] ?? 0) + 1;
        const shown = Math.min(n, AX.elementBonusCount);
        const c = paintElement(el('button', 'bha-cand'), t.element);
        c.type = 'button';
        const mark = el('span', 'bha-cand__mark');
        mark.append(elementDot(t.element, faction.id));
        const top = el('span', 'bha-cand__top');
        top.append(el('span', 'bha-cand__name', traitName(id, faction.id)), ...traitTags(id));
        const pips = el('span', 'bha-pips');
        for (let i = 0; i < AX.elementBonusCount; i++) pips.append(el('i', i < shown - 1 ? 'is-on' : i === shown - 1 ? 'is-next' : ''));
        const foot = el('span', 'bha-cand__foot');
        foot.append(pips, `장착하면 ${elementName(t.element, faction.id)} ${shown}/${AX.elementBonusCount}${n >= AX.elementBonusCount && !isFull(exp.build) ? ` → ${faction.lineageBonusName}!` : ''}`);
        const body = el('span', 'bha-cand__body');
        body.append(top, el('span', 'bha-cand__desc', traitDescription(id, faction.id)), foot);
        c.append(mark, body);
        c.onclick = () => {
          if (isFull(exp.build)) {
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
      const rb = button({ label: `다시 뽑기 (${n})`, icon: 'i-swap', size: 'small', disabled: offer!.rerolled === true || n <= 0, onClick: () => {
        if (reroll.use()) render();
      } });
      rb.dataset.sc = 'reroll';
      line.append(rb, el('small', 'bha-faint', offer!.rerolled ? '이번 흡수에서는 이미 다시 뽑았다' : '후보를 한 번 다시 뽑는다 (다시 뽑기권 1장)'));
      side.push(line);
    }
    nodes.push(backBtn('choose'));
    return { title: `특성 후보 ${offer!.candidates.length}개 (1개 고르기)`, main: nodes, side };
  }

  function replaceStep(): StepParts {
    const nodes: HTMLElement[] = [
      foeCard(),
      notice('warn', `${traitName(picked!, faction.id)}을(를) 어느 슬롯과 바꿀까? 교체된 특성은 보유 목록에 남아 둥지에서 다시 장착할 수 있다. 포기하면 특성 없이 ${act} 효과만 얻는다.`, { title: '어느 슬롯과 바꿀까?', icon: 'i-swap' }),
    ];
    const list = el('div', 'bha-stack');
    exp.build.slots.forEach((id, i) => {
      const t = getTrait(id!);
      const b = paintElement(el('button', 'bha-slot bha-slot--filled'), t.element);
      b.type = 'button';
      const meta = el('span', 'bha-slot__meta');
      meta.append(tag(faction.traitKindNames[t.kind], 'kind'), elementMark(t.element, faction.id));
      b.append(el('span', 'bha-slot__num', `${i + 1}번 교체`), el('span', 'bha-slot__name', traitName(id!, faction.id)), meta);
      b.onclick = () => finish(chooseAbsorb(exp, picked, i, mode), true);
      list.append(b);
    });
    const giveUp = button({ variant: 'danger', size: 'lg', onClick: () => finish(chooseAbsorb(exp, null, undefined, mode), true) });
    const lab = el('span', 'bha-btn__label');
    lab.append('포기', el('span', 'bha-btn__sub', `특성 없이 ${act}`));
    giveUp.append(lab);
    const grid = el('div', 'bha-grid2');
    grid.append(backBtn('pick', false), giveUp);
    nodes.push(grid);
    return { title: `${faction.slotName}: 가득 참`, main: nodes, side: [list] };
  }

  function render(): void {
    const stepNo = step === 'choose' ? 1 : step === 'pick' ? 2 : 3;
    const parts = step === 'choose' ? chooseStep() : step === 'pick' ? pickStep() : replaceStep();
    const side = [...parts.side];
    if (error && step !== 'choose') side.push(notice('danger', error, { title: `${act}을(를) 처리하지 못했다` }));
    // 임시 데이터 안내는 왼쪽 열 맨 아래에 둔다: 오른쪽 열은 행동 버튼까지 스크롤 없이 한 화면에 보이게 (T-4)
    const main = [...parts.main, el('p', 'bha-faint', PROVISIONAL_NOTE)];
    // 가로 LCD (T-3): 머리 = 단계 표시, 왼쪽·오른쪽 열이 각자 그 안에서 스크롤 (행동 버튼이 있는 오른쪽은 대부분 한 화면)
    const head = el('header', 'bha-absorb__head');
    head.append(steps(stepNo), el('h1', 'bha-h1', parts.title));
    lcdPage(root, { cls: 'bha-absorbpage', cols: 'minmax(0, 0.9fr) minmax(0, 1.1fr)' }, head, main, side);
  }
  render();
}
