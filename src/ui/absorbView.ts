// 흡수 화면 (GDD 4장, 4-1): 전투 승리 후 흡수 / 놓아줌 → 특성 후보 선택 → 슬롯 장착(가득 차면 교체/포기).
// 문구는 FactionConfig(absorbActionName, chainName, riskGaugeName, stabilityName …)에서 읽는다.
import { BALANCE } from '../config/balance';
import { getEnemy } from '../data/enemies';
import { lineageName } from '../data/lineages';
import { pickFaction } from '../data/schema';
import { getTrait, traitDescription, traitName } from '../data/traits';
import { absorbRisk, completedLineages, isFull, lineageCounts, type AbsorbOffer } from '../engine/absorb';
import { chooseAbsorb, chooseRelease, type ExpeditionState } from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import { PROVISIONAL_NOTE } from './buildPanel';
import { button, chip, el, icon, info, meter, notice, panel, tag } from './bha/dom';
import { splitApp } from './bha/split';
import { val } from './bha/expedition';
import { lineageClass, lineageIconId, lineageKey, lineageMark } from './bha/lineage';

const AX = BALANCE.provisional.absorb;
const RX = BALANCE.provisional.risk;

/** 흡수 조건 안내 (GDD 3-5, 임시 수치): 마무리 일격이 약점 계통 스킬 / 체인3 N회 이상 */
export function absorbConditionText(faction: FactionConfig, weaknessLineageId: string): string {
  const lin = lineageName(weaknessLineageId, faction.id);
  return `${faction.absorbActionName} 조건: 마무리 일격이 약점 계통(${lin}) ${faction.skillBlockName}이거나, 그 전투에서 약점 계통(${lin}) ${faction.skillBlockName}의 ${faction.chainName}3 을 ${AX.weakChain3ForAbsorb}회 이상. 장착한 ${faction.skillBlockName} 특성이 없으면 조건 없이 가능 (첫 ${faction.absorbActionName}, 임시)`;
}

export function reasonText(faction: FactionConfig, offer: AbsorbOffer): string {
  const out: string[] = [];
  if (offer.reasons.includes('weakness-finisher')) out.push(`약점 계통(${lineageName(offer.finisherLineageId!, faction.id)})으로 마무리`);
  if (offer.reasons.includes('weakness-chain3')) out.push(`약점 계통 ${faction.chainName}3 ${offer.weakChain3Count}회 (필요 ${AX.weakChain3ForAbsorb})`);
  if (offer.reasons.includes('first-absorb')) out.push(`첫 ${faction.absorbActionName} 보장 (장착한 ${faction.skillBlockName} 특성 없음)`);
  return out.join(' · ');
}

/** 한 단계의 두 열 내용: 왼쪽(설명·선택 상대 정보) / 오른쪽(고를 것·조작) — 가로 LCD (T-2) */
interface StepParts {
  main: HTMLElement[];
  side: HTMLElement[];
}

const STEP_LABELS = ['선택', '특성 고르기', '교체'] as const;

export function absorbView(root: HTMLElement, faction: FactionConfig, exp: ExpeditionState, onDone: (absorbed: boolean) => void): void {
  const offer = exp.absorbOffer;
  if (!offer) return onDone(false);
  const enemy = getEnemy(offer.enemyId);
  const act = faction.absorbActionName;
  const foeName = pickFaction(enemy.name, faction.id);
  let step: 'choose' | 'pick' | 'replace' = 'choose';
  let picked: string | null = null;
  let error = '';

  const finish = (r: { ok: true } | { ok: false; reason: string }, absorbed: boolean) => {
    if (!r.ok) {
      error = r.reason;
      render();
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
    const lk = lineageKey(offer!.lineageId);
    if (lk) foe.style.setProperty('--aura', `var(--bha-lin-${lk})`);
    const body = el('span', 'bha-foe__body');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', offer!.elite ? '#foe-b' : '#foe-a');
    svg.append(use);
    body.append(svg);
    foe.append(el('span', 'bha-foe__aura'), body);
    const tags = el('div', 'bha-foecard__tags');
    tags.append(tag(offer!.elite ? '강적' : '일반', offer!.elite ? 'elite' : 'normal'), lineageMark(offer!.lineageId, faction.id));
    const text = el('div');
    text.append(el('h2', 'bha-foecard__name', foeName), tags);
    card.append(foe, text);
    return card;
  };

  /** 슬롯 현황: 칸마다 특성 이름·종류·계통, 계통 보너스 진행/완성, 외형 파츠 문구 */
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
      const s = el('div', `bha-slot bha-slot--filled ${lineageClass(t.lineageId)}`);
      const meta = el('span', 'bha-slot__meta');
      meta.append(tag(faction.traitKindNames[t.kind], 'kind'), lineageMark(t.lineageId, faction.id));
      s.append(el('span', 'bha-slot__num', `${i + 1}번`), el('span', 'bha-slot__name', traitName(id, faction.id)), meta);
      grid.append(s);
    });
    box.append(grid);
    const counts = lineageCounts(b);
    const done = completedLineages(b);
    const progress = Object.entries(counts).map(([l, n]) => `${lineageName(l, faction.id)} ${n}/${AX.lineageBonusCount}`);
    if (done.length > 0) {
      box.append(notice('good', `${faction.lineageBonusName}: ${done.map((l) => lineageName(l, faction.id)).join(', ')} 블록 위력(피해·막기·회복) +${Math.round(AX.lineageSkillBonus * 100)}% (임시)`));
    } else if (progress.length > 0) {
      box.append(el('p', 'bha-faint', `${faction.lineageBonusName} 진행: ${progress.join(' · ')} (같은 계통 ${AX.lineageBonusCount}개)`));
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

  function chooseStep(): StepParts {
    const risk = absorbRisk(offer!.strength);
    const willBreak = exp.risk + risk >= RX.limit;
    const nodes: HTMLElement[] = [el('h1', 'bha-h1', `${act} 가능`), el('p', 'bha-dim', `${foeName}을(를) 쓰러뜨렸다.`), foeCard()];
    if (offer!.rare) nodes.push(notice('rare', '이 개체의 희귀 특성이 후보에 확정으로 나온다.', { title: '희귀 개체!' }));
    const lin = el('span');
    lin.append(lineageMark(offer!.lineageId, faction.id));
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
          { label: '계통', value: lin },
          { label: `${act} 조건`, mod: 'stack', value: reasonText(faction, offer!) },
          { label: `${act}하면`, mod: 'stack', value: withNum('허기 리셋 · ', `${faction.riskGaugeName} `, risky(`+${Math.round(risk)}`, false), ' · 타일 +1') },
          { label: '놓아주면', mod: 'stack', value: withNum(`${faction.riskGaugeName} `, risky(`−${RX.releaseRelief}`, true), ` · ${faction.stabilityName} `, risky(`+${RX.releaseStability}`, true)) },
        ]),
      ),
      el('p', 'bha-faint', absorbConditionText(faction, enemy.weaknessLineageId)),
    );
    const side: HTMLElement[] = [
      meter({
        kind: 'risk', label: `지금 ${faction.riskGaugeName}`, icon: 'i-risk', value: Math.round(exp.risk), max: RX.limit, zone: 0.6, danger: exp.risk >= 60 || willBreak,
        note: willBreak ? `${act}하면 한계 돌파! (${Math.round(exp.risk)} + ${Math.round(risk)} = ${Math.round(exp.risk + risk)})` : undefined,
      }),
      slotSummary(),
    ];
    if (error) side.push(notice('danger', error, { title: `${act}을(를) 처리하지 못했다` }));
    const sub = (b: HTMLButtonElement, text: string) => {
      b.append(el('small', '', text));
      return b;
    };
    const a = sub(button({ label: act, icon: 'i-absorb', variant: willBreak ? 'danger' : 'primary', size: 'lg', onClick: () => { step = 'pick'; render(); } }), willBreak ? '한계 돌파한다' : '특성 후보 보기');
    const r = sub(button({ label: '놓아준다', icon: 'i-release', size: 'lg', onClick: () => finish(chooseRelease(exp), false) }), '안정 쪽으로');
    const actions = el('div', 'bha-absorb__actions');
    actions.append(a, r);
    side.push(actions);
    return { main: nodes, side };
  }

  function pickStep(): StepParts {
    const nodes: HTMLElement[] = [el('h1', 'bha-h1', '특성 후보 (1개 고르기)'), el('p', 'bha-dim', `${foeName}에게서 얻을 특성을 고른다. 고르면 빈 슬롯에 들어간다.`)];
    const side: HTMLElement[] = [];
    if (offer!.candidates.length === 0) {
      const none = el('div', 'bha-panel bha-panel--inset bha-center bha-absorb__none');
      none.append(icon('i-unknown', 'lg'), el('b', '', '나올 수 있는 특성이 없다'), el('p', 'bha-dim', '이 계통에서 새로 얻을 특성이 없다. 효과만 얻는다.'));
      side.push(none, button({ label: `특성 없이 ${act}`, variant: 'primary', size: 'lg', block: true, onClick: () => finish(chooseAbsorb(exp, null), true) }));
    } else {
      const list = el('div', 'bha-stack');
      for (const id of offer!.candidates) {
        const t = getTrait(id);
        const n = (lineageCounts(exp.build)[t.lineageId] ?? 0) + 1;
        const shown = Math.min(n, AX.lineageBonusCount);
        const c = el('button', ['bha-cand', lineageClass(t.lineageId)].filter(Boolean).join(' '));
        c.type = 'button';
        const mark = el('span', 'bha-cand__mark');
        mark.append(icon(lineageIconId(t.lineageId)));
        const top = el('span', 'bha-cand__top');
        top.append(el('span', 'bha-cand__name', traitName(id, faction.id)), ...traitTags(id));
        const pips = el('span', 'bha-pips');
        for (let i = 0; i < AX.lineageBonusCount; i++) pips.append(el('i', i < shown - 1 ? 'is-on' : i === shown - 1 ? 'is-next' : ''));
        const foot = el('span', 'bha-cand__foot');
        foot.append(pips, `장착하면 ${lineageName(t.lineageId, faction.id)} ${shown}/${AX.lineageBonusCount}${n >= AX.lineageBonusCount && !isFull(exp.build) ? ` → ${faction.lineageBonusName}!` : ''}`);
        const body = el('span', 'bha-cand__body');
        body.append(top, el('span', 'bha-cand__desc', traitDescription(id, faction.id)), foot);
        c.append(mark, body);
        c.onclick = () => {
          if (isFull(exp.build)) {
            picked = id;
            step = 'replace';
            render();
          } else finish(chooseAbsorb(exp, id), true);
        };
        list.append(c);
      }
      side.push(list);
    }
    nodes.push(backBtn('choose'));
    return { main: nodes, side };
  }

  function replaceStep(): StepParts {
    const nodes: HTMLElement[] = [
      el('h1', 'bha-h1', `${faction.slotName}: 가득 참`),
      notice('warn', `${traitName(picked!, faction.id)}을(를) 어느 슬롯과 바꿀까? 교체된 특성은 보유 목록에 남아 둥지에서 다시 장착할 수 있다. 포기하면 특성 없이 ${act} 효과만 얻는다.`, { title: '어느 슬롯과 바꿀까?', icon: 'i-swap' }),
    ];
    const list = el('div', 'bha-stack');
    exp.build.slots.forEach((id, i) => {
      const t = getTrait(id!);
      const b = el('button', `bha-slot bha-slot--filled ${lineageClass(t.lineageId)}`);
      b.type = 'button';
      const meta = el('span', 'bha-slot__meta');
      meta.append(tag(faction.traitKindNames[t.kind], 'kind'), lineageMark(t.lineageId, faction.id));
      b.append(el('span', 'bha-slot__num', `${i + 1}번 교체`), el('span', 'bha-slot__name', traitName(id!, faction.id)), meta);
      b.onclick = () => finish(chooseAbsorb(exp, picked, i), true);
      list.append(b);
    });
    const giveUp = button({ variant: 'danger', size: 'lg', onClick: () => finish(chooseAbsorb(exp, null), true) });
    const lab = el('span', 'bha-btn__label');
    lab.append('포기', el('span', 'bha-btn__sub', `특성 없이 ${act}`));
    giveUp.append(lab);
    const grid = el('div', 'bha-grid2');
    grid.append(backBtn('pick', false), giveUp);
    nodes.push(grid);
    return { main: nodes, side: [list] };
  }

  function render(): void {
    const stepNo = step === 'choose' ? 1 : step === 'pick' ? 2 : 3;
    const parts = step === 'choose' ? chooseStep() : step === 'pick' ? pickStep() : replaceStep();
    const side = [...parts.side];
    if (error && step !== 'choose') side.push(notice('danger', error, { title: `${act}을(를) 처리하지 못했다` }));
    side.push(el('p', 'bha-faint', PROVISIONAL_NOTE));
    splitApp(root, { cls: 'bha-absorbpage' }, steps(stepNo), parts.main, side);
  }
  render();
}
