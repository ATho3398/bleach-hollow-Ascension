// 새 버전 띠 (C.130, GDD 60장): 서비스 워커가 새 배포를 받아 두면 어느 화면에서든 아래에 한 줄 + [다시 시작].
// 누르면 새로고침해 새 버전으로 연다(원정 중이면 마지막 중간 저장에서 이어하기). 닫으면 이번 실행 동안 다시 안 띄운다
import { button, el, notice } from './bha/dom';
import { onUpdateReady } from '../pwa';

export function mountUpdateBanner(reload: () => void = () => location.reload()): void {
  onUpdateReady(() => {
    if (document.querySelector('.bha-update')) return;
    const bar = el('div', 'bha-update');
    bar.setAttribute('role', 'status');
    const close = button({ label: '나중에', variant: 'ghost', size: 'small', onClick: () => bar.remove() });
    const go = button({ label: '다시 시작', icon: 'i-loop', variant: 'primary', size: 'small', onClick: reload });
    bar.append(notice('info', '새 버전이 나왔습니다 — 다시 시작하면 적용됩니다', { title: '업데이트' }), el('div', 'bha-update__actions'));
    bar.lastElementChild!.append(close, go);
    document.body.append(bar);
  });
}
