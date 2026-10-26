// "다른 창에서 실행 중" 안내 (C.139, GDD 88장 1): 플레이 잠금을 못 쥔 창. 세이브를 읽지도 쓰지도 않는다.
import { FACTIONS } from '../data/factions';
import { button, mountApp, notice, panel } from './bha/dom';
import { applyTheme } from './bha/theme';

export function tabBlockedView(host: HTMLElement, retry: () => void): void {
  applyTheme(FACTIONS[0]!);
  mountApp(
    host,
    {},
    panel(
      { title: '다른 창에서 실행 중' },
      notice('warn', '이 게임이 다른 창(탭)에서 이미 열려 있다. 세이브가 깨지지 않도록 한 번에 한 창에서만 플레이할 수 있다.'),
      notice('info', '다른 창을 닫은 뒤 [다시 확인]을 누른다.'),
      button({ label: '다시 확인', variant: 'primary', block: true, onClick: retry }),
    ),
  );
}
