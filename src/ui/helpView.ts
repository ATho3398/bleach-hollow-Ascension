// 도움말 (GDD 14-2, C.19 / U-1 새 디자인): 화면별 요약 + 용어 사전. 화면 위에 덮는 오버레이라 전투 화면 위에서도 전투 상태를 건드리지 않고 열 수 있다.
// 텍스트는 src/data/help 템플릿을 종족 설정으로 치환해 읽는다.
import { GLOSSARY, helpVars, renderHelpText, SCREEN_HELPS } from '../data/help';
import type { FactionConfig } from '../engine/faction';
import { button, el, icon, notice } from './bha/dom';
import { getOverlayHost, registerLayer } from './bha/overlayHost';

export type HelpScreenId = 'nest' | 'expedition' | 'battle' | 'evolution';

export interface HelpOptions {
  /** 열 때 펼쳐 둘 화면 요약. 'battle' 이면 전투 위에서 열린 것이라 "전투가 멈춰 있다"를 보인다 */
  screen?: HelpScreenId;
  onClose: () => void;
  /** 있으면 [튜토리얼 다시 보기] 를 보인다. 도움말은 이미 닫힌 뒤 불린다 */
  onReplayTutorial?: () => void;
}

/** 아코디언 아이콘 (id → 스프라이트 아이콘). 모르는 id 는 info */
const SCREEN_ICON: Record<string, string> = { nest: 'i-nest', expedition: 'i-loop', battle: 'i-practice', evolution: 'i-evolve' };
const TERM_ICON: Record<string, string> = {
  lineage: 'i-lin-a', chain: 'i-chain-3', sp: 'i-sp', 'special-block': 'i-special', 'stored-skill': 'i-stored', 'void-block': 'i-void', weakness: 'i-weak',
  stability: 'i-stab', 'risk-gauge': 'i-risk', 'evolution-condition': 'i-evolve', 'form-dex': 'i-dex', 'title-dex': 'i-title', 'resume-expedition': 'i-return',
};

/** 화면 위에 도움말을 연다. 돌려주는 함수로 닫는다 */
export function helpOverlay(faction: FactionConfig, opts: HelpOptions): () => void {
  const vars = helpVars(faction);
  const t = (s: string) => renderHelpText(s, vars);
  const fromBattle = opts.screen === 'battle';
  const stage = el('div', 'bha-stage bha-layer');
  const app = el('main', 'bha-app');
  stage.setAttribute('role', 'dialog');
  stage.setAttribute('aria-modal', 'true');
  stage.setAttribute('aria-label', '도움말');
  stage.append(app);
  let closed = false;
  let unregister = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    unregister();
    stage.remove();
    opts.onClose();
  };

  const section = (title: string, items: readonly { id: string; title: string; body: string }[], icons: Record<string, string>, openId?: string) => {
    const box = el('section', 'bha-help__sec');
    box.append(el('h2', 'bha-help__cap', title));
    for (const it of items) {
      const d = el('details', 'bha-acc');
      d.dataset.id = it.id;
      d.open = it.id === openId;
      const sum = el('summary', 'bha-acc__summary');
      sum.append(icon(icons[it.id] ?? 'i-info'), el('span', '', t(it.title)), icon('i-chevron-down', undefined, 'bha-acc__chev'));
      d.append(sum, el('div', 'bha-acc__body', t(it.body)));
      box.append(d);
    }
    return box;
  };

  const closeBtn = button({ label: fromBattle ? '닫고 전투로' : '닫기', variant: 'primary', onClick: close });
  const head = el('header', 'bha-help__head');
  head.append(el('h1', 'bha-topbar__title', '도움말'), closeBtn);
  app.append(head);
  if (fromBattle) app.append(notice('warn', '닫으면 전투로 돌아가 이어서 진행된다.', { title: '전투가 멈춰 있다', icon: 'i-pause' }));
  if (opts.onReplayTutorial) {
    app.append(button({
      label: '튜토리얼 다시 보기', icon: 'i-play', block: true,
      onClick: () => {
        close();
        opts.onReplayTutorial!();
      },
    }));
  }
  app.append(
    section('화면별 요약', SCREEN_HELPS, SCREEN_ICON, opts.screen),
    section(`용어 사전 (${GLOSSARY.length})`, GLOSSARY, TERM_ICON),
  );
  getOverlayHost().append(stage);
  unregister = registerLayer(stage, close);
  closeBtn.focus();
  app.querySelector('details[open]')?.scrollIntoView({ block: 'start' });
  return close;
}
