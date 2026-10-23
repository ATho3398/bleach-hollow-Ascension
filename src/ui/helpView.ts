// 도움말 (GDD 14-2, C.19 / U-1 새 디자인): 화면별 요약 + 용어 사전. 화면 위에 덮는 오버레이라 전투 화면 위에서도 전투 상태를 건드리지 않고 열 수 있다.
// 텍스트는 src/data/help 템플릿을 종족 설정으로 치환해 읽는다.
import { GLOSSARY, helpVars, renderHelpText, SCREEN_HELPS } from '../data/help';
import type { FactionConfig } from '../engine/faction';
import { button, el, icon, notice } from './bha/dom';
import { linesBody } from './bha/lines';
import { lcdHead, lcdPageParts, masterDetail, selectLast, type ListRow } from './bha/lcdpage';
import { getOverlayHost, registerLayer } from './bha/overlayHost';
import { SHORTCUT_HELP } from './shortcutMap';
import { currentViewState } from './viewScale';

export type HelpScreenId = 'nest' | 'expedition' | 'battle' | 'evolution';

export interface HelpOptions {
  /** 열 때 펼쳐 둘 화면 요약. 'battle' 이면 전투 위에서 열린 것이라 "전투가 멈춰 있다"를 보인다 */
  screen?: HelpScreenId;
  onClose: () => void;
  /** 있으면 [튜토리얼 다시 보기] 를 보인다. 도움말은 이미 닫힌 뒤 불린다 */
  onReplayTutorial?: () => void;
  /** 한 번만 뜨는 안내 다시 보기 (C.120, GDD 64·67장): 버튼 이름 → 여는 함수. 도움말은 이미 닫힌 뒤 불린다 */
  replays?: { label: string; run: () => void }[];
}

/** 아코디언 아이콘 (id → 스프라이트 아이콘). 모르는 id 는 info */
const SCREEN_ICON: Record<string, string> = { nest: 'i-nest', expedition: 'i-loop', battle: 'i-practice', evolution: 'i-evolve' };
const TERM_ICON: Record<string, string> = {
  lineage: 'i-lin-a', chain: 'i-chain-3', liberation: 'i-special', 'void-block': 'i-void', weakness: 'i-weak',
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

  const rowOf = (it: { id: string; title: string; body: string }, iconId: string, caption?: string): ListRow => ({
    label: t(it.title),
    caption,
    content: [icon(iconId), el('span', 'bha-mdrow__name', t(it.title))],
    detail: () => [el('h2', 'bha-mddetail__title', t(it.title)), linesBody(t(it.body), 'bha-mddetail__body')],
  });
  const rows: ListRow[] = [
    ...SCREEN_HELPS.map((it, k) => rowOf(it, SCREEN_ICON[it.id] ?? 'i-info', k === 0 ? '화면별 요약' : undefined)),
    ...GLOSSARY.map((it, k) => rowOf(it, TERM_ICON[it.id] ?? 'i-info', k === 0 ? `용어 사전 (${GLOSSARY.length})` : undefined)),
  ];
  // PC 단축키 표 (GDD 18-5): 마우스 포인터 모드에서만 보인다
  if (currentViewState().pc) {
    rows.push({
      label: '단축키 (PC)',
      caption: '키보드',
      content: [icon('i-info'), el('span', 'bha-mdrow__name', '단축키 (PC)')],
      detail: () => [
        el('h2', 'bha-mddetail__title', '단축키 (PC)'),
        el('p', 'bha-mddetail__body', '마우스로 그대로 해도 된다. 왼손 영역 키로 같은 일을 한다. 입력칸에 글자를 칠 때는 꺼진다.'),
        ...SHORTCUT_HELP.map((g) => {
          const box = el('div', 'bha-keytable');
          box.append(el('h3', 'bha-keytable__title', g.title));
          for (const r of g.rows) {
            const row = el('div', 'bha-keytable__row');
            row.append(el('kbd', 'bha-keytable__keys', r.keys), el('span', '', r.does));
            box.append(row);
          }
          return box;
        }),
      ],
    });
  }
  const start = Math.max(0, SCREEN_HELPS.findIndex((it) => it.id === opts.screen));
  const md = masterDetail(rows, start, '도움말 항목');

  const closeBtn = button({ label: fromBattle ? '닫고 전투로' : '닫기', variant: 'primary', onClick: close });
  const aside: HTMLElement[] = [];
  if (opts.onReplayTutorial) {
    aside.push(button({
      label: '튜토리얼 다시 보기', icon: 'i-play',
      onClick: () => {
        close();
        opts.onReplayTutorial!();
      },
    }));
  }
  for (const r of opts.replays ?? []) {
    const b = button({ label: r.label, icon: 'i-info', onClick: () => {
      close();
      r.run();
    } });
    b.dataset.replay = r.label;
    aside.push(b);
  }
  aside.push(closeBtn);
  const warn = fromBattle ? notice('warn', '닫으면 전투로 돌아가 이어서 진행된다.', { title: '전투가 멈춰 있다', icon: 'i-pause' }) : null;
  const page = lcdPageParts({ cls: 'bha-help-page', cols: 'minmax(0, 0.85fr) minmax(0, 1.15fr)' }, lcdHead({ title: '도움말', aside: aside.map((b) => selectLast(b)) }), [md.list], [...(warn ? [warn] : []), md.detail]);
  app.className = `bha-app ${page.cls}`;
  app.append(...page.nodes);
  getOverlayHost().append(stage);
  unregister = registerLayer(stage, close);
  closeBtn.focus();
  md.list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  return close;
}
