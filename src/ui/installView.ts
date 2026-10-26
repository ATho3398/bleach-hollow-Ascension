// 앱 설치 큰 안내창 (GDD 68장, C.121): 화면 가득 — "홈 화면에 설치하면 인터넷 없이도 플레이할 수 있어요" + [설치] / [나중에].
// 기기(회전된 LCD) 밖 문서 맨 위에 띄워 세로 폰에서도 바로 서서 읽힌다.
import {
  clearInstallPrompt, detectPlatform, INSTALL_WAIT_MS, installMode, installPrompt, isStandalone, loadInstallPrefs, onInstallPrompt, safeStorage, saveInstallPrefs, shouldAutoShow,
  type InstallMode, type Platform,
} from '../pwaInstall';
import { button, el, icon } from './bha/dom';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const SVG = 'http://www.w3.org/2000/svg';

type Glyph = 'menu' | 'dots' | 'share' | 'plus' | 'home';

/** 안내 그림 (선 그림 하나): currentColor 만 쓴다 */
function glyph(kind: Glyph): SVGElement {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'bha-install__glyph');
  s.setAttribute('aria-hidden', 'true');
  const add = (tag: string, attrs: Record<string, string>) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    s.append(n);
  };
  const line = { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  if (kind === 'menu') for (const y of [6, 12, 18]) add('line', { x1: '4', y1: String(y), x2: '20', y2: String(y), ...line });
  if (kind === 'dots') for (const y of [5, 12, 19]) add('circle', { cx: '12', cy: String(y), r: '1.8', fill: 'currentColor' });
  if (kind === 'share') {
    add('path', { d: 'M12 15V4M8 8l4-4 4 4M6 11H5v9h14v-9h-1', ...line });
  }
  if (kind === 'plus') {
    add('rect', { x: '4', y: '4', width: '16', height: '16', rx: '3', ...line });
    add('path', { d: 'M12 8v8M8 12h8', ...line });
  }
  if (kind === 'home') add('path', { d: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z', ...line });
  return s;
}

interface Step {
  glyph: Glyph;
  text: string;
}

/** 그림 안내 단계 (삼성 인터넷 / 안드로이드 크롬 / 아이폰 사파리) */
export function guideSteps(platform: Platform): Step[] {
  if (platform === 'ios') {
    return [
      { glyph: 'share', text: '화면 아래의 공유 버튼을 누른다' },
      { glyph: 'plus', text: '"홈 화면에 추가"를 고른다' },
      { glyph: 'home', text: '홈 화면의 아이콘으로 연다' },
    ];
  }
  if (platform === 'samsung') {
    return [
      { glyph: 'menu', text: '아래의 메뉴(≡)를 누른다' },
      { glyph: 'plus', text: '"현재 페이지 추가" → "홈 화면"을 고른다' },
      { glyph: 'home', text: '홈 화면의 아이콘으로 연다' },
    ];
  }
  return [
    { glyph: 'dots', text: '위의 메뉴(⋮)를 누른다' },
    { glyph: 'plus', text: '"앱 설치" 또는 "홈 화면에 추가"를 고른다' },
    { glyph: 'home', text: '홈 화면의 아이콘으로 연다' },
  ];
}

let open: HTMLElement | null = null;

/** 안내창을 연다. auto = 저절로 열린 것([나중에] 를 세는 것) */
export function openInstall(opts: { auto: boolean; ua?: string } = { auto: false }): void {
  if (open?.isConnected) return;
  const storage = safeStorage();
  const platform = detectPlatform(opts.ua ?? navigator.userAgent);
  const layer = el('div', 'bha-install');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', '앱 설치 안내');
  open = layer;

  const card = el('div', 'bha-install__card');
  const mark = el('img', 'bha-install__icon') as HTMLImageElement;
  mark.src = `${BASE}icons/icon-192.png`;
  mark.alt = '';
  const title = el('h2', 'bha-install__title', '홈 화면에 설치하세요');
  const lead = el('p', 'bha-install__lead', '홈 화면에 설치하면 인터넷 없이도 플레이할 수 있어요');
  const body = el('div', 'bha-install__body');
  const actions = el('div', 'bha-install__actions');
  card.append(mark, title, lead, body, actions);
  layer.append(card);

  const close = () => {
    layer.remove();
    open = null;
  };
  const later = () => {
    if (opts.auto) {
      const p = loadInstallPrefs(storage);
      saveInstallPrefs(storage, { ...p, later: p.later + 1 });
    }
    close();
  };
  const install = async () => {
    const d = installPrompt();
    if (!d) return;
    installBtn.disabled = true;
    try {
      await d.prompt();
      const choice = await d.userChoice;
      clearInstallPrompt(); // 한 번 쓰면 다시 못 쓴다
      if (choice.outcome === 'accepted') {
        saveInstallPrefs(storage, { ...loadInstallPrefs(storage), installed: true });
        close();
      } else later();
    } catch {
      clearInstallPrompt();
      render(platform === 'ios' ? 'guide-ios' : 'guide-android');
    }
  };

  const installBtn = button({ label: '설치', icon: 'i-play', variant: 'primary', block: true, onClick: () => void install() });
  installBtn.classList.add('bha-install__go');
  const laterBtn = button({ label: '나중에', variant: 'ghost', block: true, onClick: later });

  function render(mode: InstallMode): void {
    body.replaceChildren();
    actions.replaceChildren();
    if (mode === 'prompt' || mode === 'wait') {
      installBtn.disabled = mode === 'wait';
      installBtn.replaceChildren(icon('i-play'), mode === 'wait' ? '설치 준비 중…' : '설치');
      body.append(el('p', 'bha-install__note', mode === 'wait' ? '브라우저가 설치 창을 준비하는 중이에요.' : '누르면 브라우저의 설치 창이 떠요. 거기서 "설치"를 한 번 더 눌러 주세요.'));
      actions.append(installBtn, laterBtn);
      return;
    }
    const steps = el('ol', 'bha-install__steps');
    for (const s of guideSteps(platform)) {
      const li = el('li', 'bha-install__step');
      li.append(glyph(s.glyph), el('span', '', s.text));
      steps.append(li);
    }
    body.append(steps);
    actions.append(button({ label: '알겠어요', variant: 'primary', block: true, onClick: later }));
  }

  document.body.append(layer);
  const mode = installMode(platform, installPrompt() !== null);
  render(mode);
  if (mode === 'wait') {
    // 이벤트가 늦게 오면 창은 먼저 띄워 두고 [설치] 를 켠다. 끝내 안 오면(삼성 인터넷 등) 그림 안내로
    onInstallPrompt(() => {
      if (layer.isConnected) render('prompt');
    });
    window.setTimeout(() => {
      if (layer.isConnected && installPrompt() === null) render(platform === 'ios' ? 'guide-ios' : 'guide-android');
    }, INSTALL_WAIT_MS);
  }
  installBtn.focus({ preventScroll: true });
}

/** 열 때 한 번: 조건이 맞으면 안내창을 띄운다. 설치 이벤트가 나중에 오는 기기(데스크톱 등)는 올 때 띄운다 */
export function maybeShowInstall(): void {
  const storage = safeStorage();
  const standalone = isStandalone();
  const platform = detectPlatform(navigator.userAgent);
  const try_ = (): boolean => {
    if (!shouldAutoShow(loadInstallPrefs(storage), standalone, installMode(platform, installPrompt() !== null))) return false;
    openInstall({ auto: true });
    return true;
  };
  window.setTimeout(() => {
    if (!try_()) onInstallPrompt(() => void try_());
  }, 800);
}
