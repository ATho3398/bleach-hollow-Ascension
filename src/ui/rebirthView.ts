// 환생 화면 (GDD 22-1·22-7): 확인 1(초기화·남김 목록 + 계승할 특성 1개 고르기) → 확인 2(최종, app 의 confirmDialog) → 연출(짧은 페이드 + 종족 설정 문구).
// 문구는 종족 설정(rebirth·tierNames·slotName·rankBattleName·riskGaugeName)에서 읽는다 (종족 분기 없음). 수치는 BALANCE.provisional.rebirth.
import { BALANCE } from '../config/balance';
import { getTrait, traitName } from '../data/traits';
import { formName, tryGetForm } from '../data/evolution';
import { JADE_NAME, SOUL_CRYSTAL_NAME, TRADE_CURRENCY_NAME } from '../data/economy';
import { statName } from '../data/elements';
import { STAT_IDS, type Stats } from '../data/schema';
import type { FactionConfig } from '../engine/faction';
import { playerElementsOf } from '../engine/evolution';
import { inheritableTraits, nextCarry, rebirthStars, startingCarry } from '../engine/rebirth';
import type { SaveData } from '../game';
import type { RebirthRecord } from '../engine/runLog';
import { button, h, mountApp, notice, panel, provisionalTag } from './bha/dom';
import { elementDot } from './bha/element';
import type { Device } from './bha/device';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { toward } from './bha/nestLogic';

/** 이름 옆 환생 표시 칩 (0회면 null) */
export function rebirthMark(count: number): HTMLElement | null {
  const stars = rebirthStars(count);
  if (!stars) return null;
  const chip = h('span', 'bha-chip bha-chip--rare', stars);
  chip.dataset.rebirths = String(count);
  chip.title = `환생 ${count}회`;
  chip.setAttribute('aria-label', `환생 ${count}회`);
  return chip;
}

/** 계승 노력치 한 줄 (0 인 능력치는 뺀다). 모두 0 이면 '없음' */
export function carryLine(factionId: string, carry: Stats): string {
  const parts = STAT_IDS.filter((s) => carry[s] > 0).map((s) => `${statName(s, factionId)} +${carry[s]}`);
  return parts.length ? parts.join(' · ') : '없음';
}

/** 초기화되는 것 / 남는 것 (GDD 22-7) */
export function rebirthLists(faction: FactionConfig): { resets: string[]; keeps: string[] } {
  const rate = Math.round(BALANCE.provisional.rebirth.evCarryRate * 100);
  return {
    resets: [
      `단계·진화체 → 1단계 ${faction.tierNames[0]}`,
      `장착한 ${faction.slotName} 특성 (고른 1개는 가지고 간다)`,
      '진화 걸음',
      `${faction.rankBattleName} 번호·전적`,
      `노력치 (${rate}%는 다음 생에 쌓인다)`,
      `${faction.riskGaugeName} 0 · 허기·컨디션 처음 값`,
      '사냥터는 단계에 맞춰 다시 1곳부터',
    ],
    keeps: [
      '진화체 도감·칭호',
      `등급 이력 (${faction.liberation.name} 자격)`,
      '수련 완료·수련치·수련권',
      `먹이·${TRADE_CURRENCY_NAME}·${JADE_NAME}·${SOUL_CRYSTAL_NAME}·타일 덱`,
      '입은 스킨',
    ],
  };
}

function listPanel(title: string, items: string[], aria: string): HTMLElement {
  const p = panel({ title });
  p.setAttribute('aria-label', aria);
  const ul = h('ul', 'bha-stack bha-stack--tight');
  for (const t of items) ul.append(h('li', 'bha-small', t));
  p.append(ul);
  return p;
}

/**
 * 확인 1: 왼쪽 = 초기화 / 남는 것, 오른쪽 = 계승할 특성 1개 고르기 + 다음 생 계승 노력치 + 보상 + [다음 — 최종 확인].
 * 특성은 지금 장착한 것 중 하나(또는 가져가지 않음). 기본 선택 = 첫 번째 장착 특성.
 */
export function rebirthConfirmView(dev: Device, faction: FactionConfig, save: SaveData, hd: { onNext: (keepTraitId: string | null) => void }): void {
  const evo = save.evolution;
  const form = evo.formId ? tryGetForm(evo.formId) : undefined;
  const sub = h('span');
  sub.append(`지금 ${form ? formName(form, faction.id, playerElementsOf(evo)) : faction.tierNames[evo.tierIndex]} `);
  const mark = rebirthMark(save.rebirth.count);
  if (mark) sub.append(mark, ' ');
  sub.append(`· 환생 ${save.rebirth.count}회 → ${save.rebirth.count + 1}회`);
  const head = lcdHead({ title: `${faction.rebirth.name} — 확인 1/2`, sub });
  const lists = rebirthLists(faction);

  const traits = inheritableTraits(save.build);
  let pick: string | null = traits[0] ?? null;
  const pickPanel = panel({ title: '가지고 갈 특성 1개' });
  pickPanel.setAttribute('aria-label', '가지고 갈 특성');
  const rows: { id: string | null; btn: HTMLButtonElement }[] = [];
  const mark2 = () => {
    for (const r of rows) {
      const on = r.id === pick;
      r.btn.classList.toggle('is-on', on);
      r.btn.setAttribute('aria-pressed', String(on));
    }
  };
  const list = h('div', 'bha-stack bha-stack--tight');
  const add = (id: string | null, label: string, el?: string) => {
    const btn = button({ label, block: true, onClick: () => { pick = id; mark2(); } });
    if (el) btn.prepend(elementDot(el, faction.id));
    btn.dataset.trait = id ?? '';
    rows.push({ id, btn });
    list.append(btn);
  };
  for (const id of traits) add(id, traitName(id, faction.id), getTrait(id).element);
  add(null, '가지고 가지 않는다');
  mark2();
  pickPanel.append(list);
  if (traits.length === 0) pickPanel.append(h('p', 'bha-faint', `장착한 특성이 없다. ${faction.slotName}에 특성을 장착해 두면 하나를 가지고 갈 수 있다.`));

  const carry = startingCarry(nextCarry(save.rebirth, evo));
  const info = panel({ title: '다음 생', aside: provisionalTag('임시 수치') });
  info.setAttribute('aria-label', '다음 생');
  const RB = BALANCE.provisional.rebirth;
  const reward = [`${SOUL_CRYSTAL_NAME} +${BALANCE.provisional.soulCrystals.perRebirth}`, ...(save.rebirth.count === 0 ? [`${JADE_NAME} +${RB.firstJade} (첫 ${faction.rebirth.name})`] : [])].join(' · ');
  const stars = h('p', 'bha-small');
  stars.append('이름 옆 표시 ', rebirthMark(save.rebirth.count + 1)!);
  info.append(h('p', 'bha-small', `시작 노력치(계승): ${carryLine(faction.id, carry)}`), h('p', 'bha-small', `보상: ${reward}`), stars);

  const blocked = save.activeExpedition != null;
  const next = button({ label: '다음 — 최종 확인', icon: 'i-chevron-right', variant: 'danger', block: true, disabled: blocked, onClick: () => hd.onNext(pick) });
  next.dataset.sc = 'rebirth-next';
  const right: HTMLElement[] = [pickPanel, info];
  if (blocked) right.push(notice('danger', '진행 중인 원정이 있다. 원정을 끝내고 돌아와야 환생할 수 있다.', { icon: 'i-broken' }));
  right.push(next);
  lcdPage(dev.view, { cls: 'bha-rebirth-page' }, head, [listPanel('초기화된다', lists.resets, '초기화되는 것'), listPanel('남는다', lists.keeps, '남는 것')], right);
}

/** 최종 확인(확인 2) 문구 */
export function rebirthFinalText(faction: FactionConfig, keepTraitId: string | null): { title: string; body: string } {
  const keep = keepTraitId ? `「${traitName(keepTraitId, faction.id)}」 하나만 가지고` : '특성 없이';
  return { title: `정말 ${faction.rebirth.name}할까?`, body: `되돌릴 수 없다. ${keep} 1단계 ${faction.tierNames[0]}로 돌아간다. (직전 상태는 자동 백업된다)` };
}

/**
 * 환생 연출: 화면이 하얗게 바랬다가 돌아오며(페이드) 종족 설정 문구 3줄 → 결과(1단계 이름 + ★, 계승 노력치·특성·보상) + [둥지로].
 * 3.4초 뒤 결과, [건너뛰기]로 바로.
 */
export function rebirthView(root: HTMLElement, faction: FactionConfig, record: RebirthRecord, reward: { soulCrystals: number; jade: number }, onDone: () => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const linesSection = h('section');
  const lines = h('div', 'bha-evolve__lines');
  lines.setAttribute('aria-live', 'polite');
  [faction.rebirth.cutin, '새로 태어났다.', `${faction.rebirth.rebornText}.`].forEach((t, i) => {
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
  linesSection.append(h('span'), lines, button({ label: '건너뛰기', variant: 'ghost', onClick: show }));

  const main = h('div', 'bha-evolve__resmain');
  const title = h('h1', 'bha-evolve__title', faction.tierNames[0]!);
  title.append(' ', rebirthMark(record.count)!);
  const home = button({ label: toward(faction.nestName), icon: 'i-nest', variant: 'primary', size: 'lg', block: true, onClick: () => {
    if (timer !== undefined) clearTimeout(timer);
    onDone();
  } });
  main.append(h('span', 'bha-evolve__eyebrow', `${faction.rebirth.name} ${record.count}회`), title, h('p', 'bha-evolve__path', faction.rebirth.rebornText), home);
  const side = h('div', 'bha-evolve__resside');
  const got = panel({ title: '가지고 온 것', aside: provisionalTag('임시 수치') });
  const dl = h('dl', 'bha-info');
  const row = (label: string, value: string) => {
    const r = h('div', 'bha-info__row bha-info__row--stack');
    r.append(h('dt', '', label), h('dd', '', value));
    dl.append(r);
  };
  const prev = record.prevFormId ? tryGetForm(record.prevFormId) : undefined;
  row('이전 생', prev ? formName(prev, faction.id, record.prevElements) : faction.tierNames[record.prevTierIndex]!);
  row('특성', record.keptTraitId ? traitName(record.keptTraitId, faction.id) : '없음');
  row('계승 노력치', carryLine(faction.id, record.carry as Stats));
  row('보상', [`${SOUL_CRYSTAL_NAME} +${reward.soulCrystals}`, ...(reward.jade ? [`${JADE_NAME} +${reward.jade}`] : [])].join(' · '));
  got.append(dl);
  side.append(got);
  result.append(main, side);

  mountApp(root, { cls: 'bha-evolve bha-rebirth' }, h('span', 'bha-evolve__burst'), linesSection, result);
  timer = setTimeout(show, 3400);
}
