// 도움말 (GDD 14-2, C.19): 화면별 요약 + 용어 사전. 화면 위에 덮는 오버레이라 전투 화면 위에서도 전투 상태를 건드리지 않고 열 수 있다.
// 텍스트는 src/data/help 템플릿을 종족 설정으로 치환해 읽는다.
import { GLOSSARY, helpVars, renderHelpText, SCREEN_HELPS } from '../data/help';
import type { FactionConfig } from '../engine/faction';
import { el } from './dom';

export type HelpScreenId = 'nest' | 'expedition' | 'battle' | 'evolution';

export interface HelpOptions {
  /** 열 때 펼쳐 둘 화면 요약 */
  screen?: HelpScreenId;
  onClose: () => void;
  /** 있으면 [튜토리얼 다시 보기] 를 보인다. 도움말은 이미 닫힌 뒤 불린다 */
  onReplayTutorial?: () => void;
}

/** 화면 위에 도움말을 연다. 돌려주는 함수로 닫는다 */
export function helpOverlay(faction: FactionConfig, opts: HelpOptions): () => void {
  const vars = helpVars(faction);
  const t = (s: string) => renderHelpText(s, vars);
  const layer = el('div', 'help-layer');
  layer.setAttribute('role', 'dialog');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    layer.remove();
    opts.onClose();
  };

  const section = (title: string, items: readonly { id: string; title: string; body: string }[], openId?: string) => {
    const box = el('div', 'help-section');
    box.append(el('h2', '', title));
    for (const it of items) {
      const d = el('details', 'help-item');
      d.dataset.id = it.id;
      d.open = it.id === openId;
      d.append(el('summary', '', t(it.title)), el('p', '', t(it.body)));
      box.append(d);
    }
    return box;
  };

  const closeBtn = el('button', 'primary', '닫기');
  closeBtn.onclick = close;
  const head = el('div', 'help-head');
  head.append(el('h1', '', '도움말'), closeBtn);
  const body = el('div', 'help-body');
  if (opts.onReplayTutorial) {
    const replay = el('button', '', '튜토리얼 다시 보기');
    replay.onclick = () => {
      close();
      opts.onReplayTutorial!();
    };
    body.append(replay);
  }
  body.append(section('화면별 요약', SCREEN_HELPS, opts.screen), section('용어 사전', GLOSSARY));
  layer.append(head, body);
  document.body.append(layer);
  closeBtn.focus();
  layer.querySelector('details[open]')?.scrollIntoView({ block: 'start' });
  return close;
}
