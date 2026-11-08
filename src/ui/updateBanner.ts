// 새 버전 알림 (C.130 → C.163, GDD 60장·99장 6): 서비스 워커가 새 배포를 받아 두면 어느 화면에서든 LCD 가운데 창 + 큰 가로 [다시 시작].
// 뒤를 막(scrim)으로 덮어 뒤 버튼이 눌리지 않고, 아래 독·토스트와 겹치지 않는다(예전: 화면 아래 띠가 독·브라우저 안내와 겹쳤다). [나중에]는 작게.
// 누르면 새로고침해 새 버전으로 연다(원정 중이면 마지막 중간 저장에서 이어하기). C.283: 버전 파일로 바로 알고, 다 받기를 기다리지 않고 새 index·JS 를 네트워크에서(pwa.ts restartToLatest).
// 나중에 = 이번 화면에 있는 동안은 다시 안 띄우되(더 새 빌드가 나오면 띄움), 앱을 백그라운드에 뒀다 다시 꺼내면 다시 띄운다 (C.315, GDD 195장 — 예전엔 그 탭이 사는 동안 영영 안 띄웠다)
import { button, el } from './bha/dom';
import { trapModalFocus } from './bha/modalFocus';
import { coverTutorials, getOverlayHost, registerLayer } from './bha/overlayHost';
import { dismissUpdate, onUpdateReady, restartToLatest } from '../pwa';

export function mountUpdateBanner(reload: () => void = () => restartToLatest()): void {
  onUpdateReady(() => {
    if (document.querySelector('.bha-update')) return;
    const layer = el('div', 'bha-overlay bha-overlay--in-app bha-update');
    layer.setAttribute('role', 'alertdialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', '업데이트');
    const modal = el('div', 'bha-modal bha-update__card');
    let unregister: () => void = () => {};
    let untrap: () => void = () => {};
    let uncover: () => void = () => {};
    const later = () => {
      unregister();
      untrap();
      uncover();
      layer.remove();
      dismissUpdate(); // 확인은 계속 — 다시 꺼내면·더 새 빌드면 다시 띄운다 (C.315)
    };
    const go = button({ label: '다시 시작', icon: 'i-loop', variant: 'primary', size: 'lg', block: true, onClick: reload });
    const skip = button({ label: '나중에', variant: 'ghost', size: 'small', onClick: later });
    modal.append(el('h2', 'bha-modal__title', '새 버전이 나왔다'), el('p', 'bha-modal__body', '다시 시작하면 바로 적용된다.'), go, skip);
    layer.append(modal);
    getOverlayHost().append(layer);
    uncover = coverTutorials(layer); // 튜토리얼 카드가 이 창을 가리거나 버튼을 막지 않게 (GDD 194장 1·3)
    untrap = trapModalFocus(layer);
    unregister = registerLayer(layer, later);
  });
}
