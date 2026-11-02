// 첫 원정·타일 안내 (C.120, GDD 64·67장): 한 번만 뜨는 안내 오버레이 · 튜토리얼 흡수 화면 · 타일 뽑기 카드 뒤집기.
// 안내는 첫 전투 튜토리얼과 같은 틀(tutorialOverlay)에 장면만 바꿔 쓴다. 문구는 src/data/help/guides.json + 종족 설정.
import { BALANCE } from '../config/balance';
import { findEnemyDef } from '../data/bosses';
import { statName } from '../data/elements';
import { GUIDES, guideVars } from '../data/help';
import { pickFaction, STAT_IDS } from '../data/schema';
import { getTile, tileName } from '../data/tiles';
import { tutorialAbsorb, type ExpeditionState } from '../engine/expedition';
import type { ArtUrls } from '../data/art/manifest';
import type { FactionConfig } from '../engine/faction';
import type { TextGuideId } from '../engine/tutorial';
import { button, el, icon, meter, setMeter } from './bha/dom';
import { heroEl } from './bha/battle';
import { tween } from './bha/actionFx';
import { tileCss, tileIconId } from './bha/expedition';
import { lcdPage } from './bha/lcdpage';
import { getOverlayHost, registerLayer } from './bha/overlayHost';
import { tileHint } from './labels';
import { tutorialOverlay, type TutorialHandle } from './tutorialOverlay';
import { shownName } from './displayName';
import { absorbModePicker } from './absorbView';


export interface GuideOptions {
  /** 마지막 장면 버튼 (없으면 "알겠어요") */
  finishLabel?: string;
  /** 위쪽 띠 (없으면 띠 없음) */
  pauseLabel?: string;
  /** 끝까지 보거나 건너뛰면 */
  onDone?: () => void;
  /** 도움말에서 직접 연 다시 보기 = 회색 덮개 그대로. 없으면 저절로 뜨는 안내 = 덮개 없음 (GDD 129-1) */
  replay?: boolean;
}

/** 안내 하나를 띄운다 (LCD 위 오버레이) */
export function showGuide(faction: FactionConfig, id: TextGuideId | 'first-absorb', o: GuideOptions = {}): TutorialHandle {
  return tutorialOverlay(faction, {
    scenes: GUIDES[id], vars: guideVars(faction), name: id, pauseLabel: o.pauseLabel ?? null, finishLabel: o.finishLabel ?? '알겠어요', replay: o.replay,
    onFinish: () => o.onDone?.(),
  });
}

/** 튜토리얼 흡수 화면 (GDD 67장 2·3번 → 163장 4): 진짜 흡수 화면과 같은 갈래 버튼 4개 + 설명 칸(고르기 → 설명 → 같은 버튼 다시·✓ = 실행).
 *  어느 갈래든 시스템상 흡수가 아닌 '모든 능력치 +n'(엔진 tutorialAbsorb, 설명 칸 값도 엔진 미리보기 그대로) → [계속] */
export function tutorialAbsorbView(root: HTMLElement, faction: FactionConfig, exp: ExpeditionState, onDone: () => void): void {
  const offer = exp.absorbOffer;
  if (!offer) return onDone();
  const act = faction.absorbActionName;
  const foe = shownName(pickFaction(findEnemyDef(offer.enemyId).name, faction.id));
  const head = (title: string) => {
    const h = el('header', 'bha-absorb__head');
    h.append(el('h1', 'bha-h1', title));
    return h;
  };
  const picker = absorbModePicker(faction, exp, () => {
    if (!tutorialAbsorb(exp).ok) return onDone();
    result();
  });
  // 갈래 줄 + 설명 칸을 한 덩어리로: 첫 흡수 안내 2장(guides first-absorb practice)이 이 덩어리를 강조하고 카드는 그 밖에 놓인다
  const pick = el('div', 'bha-stack bha-absorb__pick');
  pick.append(picker.actions, picker.desc);
  lcdPage(root, { cls: 'bha-absorbpage bha-tutabsorb', cols: 'minmax(0, 1.1fr) minmax(0, 0.9fr)' }, head(`첫 ${act}`), [
    el('p', 'bha-dim bha-absorb__lead', `${foe}을(를) 쓰러뜨렸다.`),
    pick,
  ], [
    el('p', 'bha-small', `이번 첫 ${act}은(는) 연습이다. 어느 갈래를 골라도 모든 능력치가 똑같이 오르고 ${faction.riskGaugeName}은(는) 그대로다.`),
  ]);
  picker.first.focus({ preventScroll: true });
  showGuide(faction, 'first-absorb', { finishLabel: '알겠어요', pauseLabel: '안내 중' });

  function result(): void {
    const ev = exp.tutorialReward?.ev ?? {};
    const grid = el('div', 'bha-tutabsorb__gain');
    grid.dataset.gain = '';
    for (const s of STAT_IDS) {
      const c = el('div', 'bha-tutabsorb__stat');
      c.append(el('span', '', statName(s, faction.id)), el('b', 'bha-num', `+${ev[s] ?? 0}`));
      grid.append(c);
    }
    const next = button({ label: '계속', icon: 'i-chevron-right', variant: 'primary', block: true, onClick: onDone });
    lcdPage(root, { cls: 'bha-absorbpage bha-tutabsorb', cols: 'minmax(0, 1fr) minmax(0, 1fr)' }, head('모든 능력치가 올랐다'), [
      el('p', 'bha-dim bha-absorb__lead', `첫 ${act} — 모든 능력치 노력치 +${BALANCE.provisional.tutorialRun.statEv}`),
      grid,
    ], [
      el('p', 'bha-small', `다음부터는 진짜 ${act}이다: 고른 갈래대로 특성·속성·노력치가 쌓이고 ${faction.riskGaugeName}이(가) 오른다.`),
      next,
    ]);
    next.focus();
  }
}

/** 치명상 장면에서 체력 막대가 빈사 값까지 떨어지는 시간 (화면 연출값) */
const WOUND_DRAIN_MS = 1200;

/**
 * 튜토리얼 원정 흡수 직후 치명상 장면 (GDD 134장 2, C.211): 캐릭터가 비틀거리고 체력 막대가 빈사 값까지 떨어지며 붉게 깜빡인다.
 * 그 위에 각본 카드 1~2장(종족 설정 tutorialWound, 132장 방식 — 덮개 없음·막대를 가리지 않음·기기 버튼). 마지막 카드 뒤 onDone(원정 끝 → 귀환)
 */
export function tutorialWoundView(root: HTMLElement, faction: FactionConfig, art: ArtUrls, hpFrom: number, hpTo: number, onDone: () => void): void {
  const pct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);
  const hero = heroEl(art);
  hero.root.classList.add('bha-wound__hero');
  const fig = el('div', 'bha-wound__fig');
  fig.append(hero.root);
  const from = pct(hpFrom);
  const to = Math.min(from, pct(hpTo));
  const bar = meter({ kind: 'player', label: '체력', icon: 'i-heal', value: from, max: 100, lg: true, inside: true, danger: true, valueText: `${from}%` });
  bar.classList.add('bha-wound__hp');
  const head = el('header', 'bha-absorb__head');
  head.append(el('h1', 'bha-h1', '치명상'));
  lcdPage(root, { cls: 'bha-absorbpage bha-wound', cols: 'minmax(0, 1fr) minmax(0, 1fr)' }, head, [fig], [bar]);
  const value = bar.querySelector<HTMLElement>('.bha-meter__value');
  tween(WOUND_DRAIN_MS, (t) => {
    const v = Math.round(from + (to - from) * t);
    setMeter(bar, v, 100);
    if (value) value.textContent = `${v}%`;
  }, () => bar.classList.add('is-blink'));
  const cards = faction.tutorialWound;
  const show = (i: number): void => {
    const c = cards[i];
    if (!c) return onDone();
    tutorialOverlay(faction, {
      scenes: [{ id: `wound-${i}`, targets: ['@.bha-wound__hp'], title: c.title, body: c.body, stages: [{ targets: ['@.bha-wound__hp'], avoid: ['@.bha-wound__hero'] }] }], // 막대·캐릭터를 가리지 않게
      name: 'wound', pauseLabel: null, finishLabel: '다음',
      script: { step: `튜토리얼 ${i + 1} / ${cards.length}` },
      onFinish: (status) => {
        if (status === 'completed') show(i + 1);
        else onDone();
      },
    });
  };
  show(0);
}

/** 타일 뽑기 결과 (GDD 64장 2번): 카드 한 장이 뒤집히며 타일 이름과 설명 한 줄. [확인]으로 닫는다 */
export function tileDrawCard(faction: FactionConfig, tileId: string, count: number, onClose: () => void): () => void {
  const t = getTile(tileId);
  const css = tileCss(t.kind);
  const layer = el('div', 'bha-overlay bha-overlay--in-app bha-confirm bha-draw');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', '타일 뽑기');
  layer.dataset.draw = tileId;
  const modal = el('div', 'bha-modal');
  const card = el('div', 'bha-draw__card');
  const back = el('div', 'bha-draw__face bha-draw__face--back');
  back.append(icon('i-rare'));
  const front = el('div', 'bha-draw__face bha-draw__face--front');
  front.style.setProperty('--tile', `var(--bha-tile-${css})`);
  front.append(icon(tileIconId(css)), el('b', 'bha-draw__name', tileName(tileId, faction.id)), el('small', 'bha-draw__hint', tileHint(t)));
  card.append(back, front);
  const stage = el('div', 'bha-draw__stage');
  stage.append(card);
  let closed = false;
  let unregister: () => void = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    unregister();
    layer.remove();
    onClose();
  };
  const ok = button({ label: '확인', variant: 'primary', onClick: close });
  const actions = el('div', 'bha-modal__actions');
  actions.append(ok);
  modal.append(el('h2', 'bha-modal__title', '타일 뽑기'), stage, el('p', 'bha-modal__body', `${tileName(tileId, faction.id)} → 가방 (보유 ${count}장)`), actions);
  layer.append(modal);
  getOverlayHost().append(layer);
  unregister = registerLayer(layer, close);
  // 한 번 뒤집기: 그린 다음 프레임에 (모션 줄이기 설정이면 CSS 가 전환을 끈다)
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('is-flipped')));
  ok.focus();
  return close;
}
