import './ui/bha/design-system/tokens.css';
import './ui/bha/design-system/themes'; // theme-*.css 자동 수집 (C.139)
import './ui/bha/design-system/base.css';
import './ui/bha/components/components.css';
import './ui/bha/components/bha-v2.css'; // 디자인 v2 공용 컴포넌트 (C.282, GDD 183장 1 ①)
import './ui/bha/components/v2-shared.css'; // v2 공용 보충 — 화면 세션 덮어쓰기를 공용으로 (C.296)
import './ui/bha/icons/icons.css'; // 디자인 v2 도트 마스크 아이콘 .bha-i-* (C.282)
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
import './ui/bha/pixel-fx.css'; // pixelfx 시트 재생 (C.249)
import './ui/bha/layout-tool.css'; // UI 배치 도구 · 미리보기 표시 (GDD 175장)
import './ui/bha/battle-c281.css'; // 전투 = C.281 모양: 옛 공용 토큰·부품을 전투 루트 안에만 (C.302, GDD 190장 2 — scripts/c302-gen-battle-c281.py 생성)
import './ui/bha/v2/bha.css'; // LCD 인게임 UI v2 (C.151): .bha-root 안에서만 적용
import { startApp } from './ui/app';
import { acquirePlayLock } from './tabLock';
import { tabBlockedView } from './ui/tabBlockedView';
import { applyCalmMode } from './ui/fxSettings';
import { mountSprite } from './ui/bha/sprite';
import { registerServiceWorker } from './pwa';
import { scheduleSwWarm } from './swWarm';
import { captureInstallPrompt } from './pwaInstall';
import { maybeShowInstall } from './ui/installView';
import { mountUpdateBanner } from './ui/updateBanner';
import { installLandscapeKeyboard } from './ui/bha/orientation';
import { applyDraft, draftHasEdits, loadDraft } from './ui/bha/layoutDraft';
import { FACTIONS } from './data/factions';

captureInstallPrompt(); // 브라우저의 작은 설치 띠를 막고 요청을 잡아 둔다 (GDD 68장) — 이벤트가 앱 시작보다 먼저 올 수 있어 맨 앞에서
mountSprite();
installLandscapeKeyboard(); // 글자 입력칸 = 가로 키보드 시도 (GDD 109장 8번)
applyCalmMode();
const app = document.querySelector<HTMLDivElement>('#app');
// UI 배치 도구 미리보기 (GDD 175장 4): 도구에서 [미리보기 켜기]면 같은 브라우저로 연 게임에 편집본을 먼저 적용한다(종족 설정·실행 중 그림만, 세이브 무관)
if (!new URLSearchParams(location.search).has('layout')) {
  const draft = loadDraft();
  if (draft.preview && draftHasEdits(draft)) {
    applyDraft(draft, FACTIONS);
    const badge = document.createElement('div');
    badge.className = 'bha-ltool-badge';
    badge.textContent = '배치 미리보기';
    document.body.append(badge);
  }
}
// C.139: 한 번에 한 창만 플레이 — 다른 창이 쥐고 있으면 세이브를 열지 않고 안내만
// 개발 전용: v2 컴포넌트 갤러리 (`?v2gallery=<종족 theme 값>`). 배포 빌드에서는 이 분기가 통째로 빠진다
if (app && import.meta.env.DEV && new URLSearchParams(location.search).has('v2gallery')) {
  void import('./ui/bha/v2/gallery').then((m) => m.mountGallery(app, new URLSearchParams(location.search).get('v2gallery') ?? ''));
} else if (app && import.meta.env.DEV && new URLSearchParams(location.search).has('fxlab')) {
  // 개발 전용: pixelfx 이펙트 실험실 (`?fxlab`, C.249) — `npm run fx` 로 가져온 시트를 게임 그림 위에 재생해 본다
  void import('./ui/bha/fxLab').then((m) => m.mountFxLab(app));
} else if (app && new URLSearchParams(location.search).has('layout')) {
  // 개발 전용: UI 배치 도구 (`?layout`, GDD 175장) — 배포 빌드에도 들어간다(사용자는 폰 크롬으로 쓴다). 게임 메뉴엔 없음. 세이브는 건드리지 않는다
  void import('./ui/bha/layoutTool').then((m) => m.mountLayoutTool(app));
} else if (app) void acquirePlayLock().then((ok) => (ok ? startApp(app) : tabBlockedView(app, () => location.reload())));
registerServiceWorker();
scheduleSwWarm(); // 이펙트 그림은 켜고 한가할 때 천천히 (GDD 186장 1)
if (!new URLSearchParams(location.search).has('layout')) {
  mountUpdateBanner();
  maybeShowInstall();
}
