// 첫 원정·타일 안내 (C.120, GDD 64·67장): 한 번만 뜨는 안내 오버레이 · 튜토리얼 흡수 화면 · 타일 뽑기 카드 뒤집기.
// 안내는 첫 전투 튜토리얼과 같은 틀(tutorialOverlay)에 장면만 바꿔 쓴다. 문구는 src/data/help/guides.json + 종족 설정.
import { BALANCE } from '../config/balance';
import { findEnemyDef } from '../data/bosses';
import { statName } from '../data/elements';
import { GUIDES, guideVars } from '../data/help';
import { pickFaction, STAT_IDS } from '../data/schema';
import { getTile, tileName } from '../data/tiles';
import { tutorialAbsorb, type ExpeditionState } from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import type { TextGuideId } from '../engine/tutorial';
import { button, el, icon } from './bha/dom';
import { tileCss, tileIconId } from './bha/expedition';
import { lcdPage } from './bha/lcdpage';
import { getOverlayHost, registerLayer } from './bha/overlayHost';
import { tileHint } from './labels';
import { tutorialOverlay, type TutorialHandle } from './tutorialOverlay';
import { shownName } from './displayName';
import { absorbModeText } from './absorbView';


export interface GuideOptions {
  /** 마지막 장면 버튼 (없으면 "알겠어요") */
  finishLabel?: string;
  /** 위쪽 띠 (없으면 띠 없음) */
  pauseLabel?: string;
  /** 끝까지 보거나 건너뛰면 */
  onDone?: () => void;
}

/** 안내 하나를 띄운다 (LCD 위 오버레이) */
export function showGuide(faction: FactionConfig, id: TextGuideId | 'first-absorb', o: GuideOptions = {}): TutorialHandle {
  return tutorialOverlay(faction, {
    scenes: GUIDES[id], vars: guideVars(faction), name: id, pauseLabel: o.pauseLabel ?? null, finishLabel: o.finishLabel ?? '알겠어요',
    onFinish: () => o.onDone?.(),
  });
}

/** 튜토리얼 흡수 화면 (GDD 67장 2·3번): 흡수 4갈래를 한 줄씩 보여 주고, [흡수하기] → 시스템상 흡수가 아닌 '모든 능력치 +n' → [계속] */
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
  const modes = el('ul', 'bha-tutabsorb__modes');
  const line = (name: string, text: string) => {
    const li = el('li', 'bha-tutabsorb__mode');
    li.append(el('b', '', name), el('span', '', text));
    return li;
  };
  // 갈래 문구는 포식 화면 버튼과 한 곳에서 (GDD 100장 #47)
  const mt = absorbModeText(faction);
  modes.append(...(['both', 'trait', 'stat', 'none'] as const).map((m) => line(mt[m].label, mt[m].sub)));
  const go = button({
    label: `${act}하기`, icon: 'i-absorb', variant: 'primary', size: 'lg', block: true,
    onClick: () => {
      if (!tutorialAbsorb(exp).ok) return onDone();
      result();
    },
  });
  go.dataset.mode = 'tutorial';
  lcdPage(root, { cls: 'bha-absorbpage bha-tutabsorb', cols: 'minmax(0, 1fr) minmax(0, 1fr)' }, head(`첫 ${act}`), [
    el('p', 'bha-dim bha-absorb__lead', `${foe}을(를) 쓰러뜨렸다.`),
    el('p', 'bha-small', `${act}하면 쓰러뜨린 적의 힘(특성·속성·능력치)이 내 것이 된다. 고르는 길은 네 갈래:`),
    modes,
  ], [
    el('p', 'bha-small', `이번 첫 ${act}은(는) 연습이다 — 특성·속성·${faction.riskGaugeName}에 들어가지 않고, 대신 모든 능력치가 똑같이 오른다.`),
    go,
  ]);
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
    const next = button({ label: '계속', icon: 'i-chevron-right', variant: 'primary', size: 'lg', block: true, onClick: onDone });
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
  modal.append(el('h2', 'bha-modal__title', '타일 뽑기'), stage, el('p', 'bha-modal__body', `${tileName(tileId, faction.id)} → 보관함 (보유 ${count}장)`), actions);
  layer.append(modal);
  getOverlayHost().append(layer);
  unregister = registerLayer(layer, close);
  // 한 번 뒤집기: 그린 다음 프레임에 (모션 줄이기 설정이면 CSS 가 전환을 끈다)
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('is-flipped')));
  ok.focus();
  return close;
}
