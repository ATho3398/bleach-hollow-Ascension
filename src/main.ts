import './ui/bha/design-system/tokens.css';
import './ui/bha/design-system/themes'; // theme-*.css 자동 수집 (C.139)
import './ui/bha/design-system/base.css';
import './ui/bha/components/components.css';
import './ui/bha/screens/screens.css';
import './ui/bha/app.css';
import './ui/bha/expedition.css';
import './ui/bha/story.css';
import './ui/bha/device.css';
import './ui/bha/room.css';
import './ui/bha/spa.css';
import './ui/bha/market.css';
import './ui/bha/worldmap.css';
import './ui/bha/lcd.css';
import './ui/bha/screens-lcd.css';
import './ui/bha/battle-scene.css';
import './ui/bha/training.css';
import './ui/bha/walk-scene.css';
import './ui/bha/encounter.css'; // 조우·휴식 칸 앞쪽 (C.202)
import './ui/bha/absorb-status.css'; // 흡수 [내 상태] 창 (C.202)
import './ui/bha/shop.css';
import './ui/bha/cosmetics.css';
import './ui/bha/tamago.css';
import './ui/bha/testMode.css';
import './ui/bha/install.css';
import './ui/bha/birth.css';
import './ui/bha/warning.css';
import './ui/bha/guide.css';
import './ui/bha/v2/bha.css'; // LCD 인게임 UI v2 (C.151): .bha-root 안에서만 적용
import { startApp } from './ui/app';
import { acquirePlayLock } from './tabLock';
import { tabBlockedView } from './ui/tabBlockedView';
import { applyCalmMode } from './ui/fxSettings';
import { mountSprite } from './ui/bha/sprite';
import { registerServiceWorker } from './pwa';
import { captureInstallPrompt } from './pwaInstall';
import { maybeShowInstall } from './ui/installView';
import { mountUpdateBanner } from './ui/updateBanner';
import { installLandscapeKeyboard } from './ui/bha/orientation';

captureInstallPrompt(); // 브라우저의 작은 설치 띠를 막고 요청을 잡아 둔다 (GDD 68장) — 이벤트가 앱 시작보다 먼저 올 수 있어 맨 앞에서
mountSprite();
installLandscapeKeyboard(); // 글자 입력칸 = 가로 키보드 시도 (GDD 109장 8번)
applyCalmMode();
const app = document.querySelector<HTMLDivElement>('#app');
// C.139: 한 번에 한 창만 플레이 — 다른 창이 쥐고 있으면 세이브를 열지 않고 안내만
// 개발 전용: v2 컴포넌트 갤러리 (`?v2gallery=<종족 theme 값>`). 배포 빌드에서는 이 분기가 통째로 빠진다
if (app && import.meta.env.DEV && new URLSearchParams(location.search).has('v2gallery')) {
  void import('./ui/bha/v2/gallery').then((m) => m.mountGallery(app, new URLSearchParams(location.search).get('v2gallery') ?? ''));
} else if (app) void acquirePlayLock().then((ok) => (ok ? startApp(app) : tabBlockedView(app, () => location.reload())));
registerServiceWorker();
mountUpdateBanner();
maybeShowInstall();
