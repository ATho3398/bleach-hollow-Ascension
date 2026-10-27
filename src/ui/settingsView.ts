// 설정 화면 (GDD 14-3, C.18 / U-1 새 디자인, R-2): 전투 효과 켬/끔. 블록 클릭 판정 시간·드래그 임계치 설정은 순서 바꾸기 삭제(17-2)와 함께 없앴다.
// localStorage 별도 키에 저장하고 세이브 구조는 건드리지 않는다.
import { button, el, icon } from './bha/dom';
import { endScreen, screenSignal } from './bha/screenScope';
import { getOverlayHost, registerLayer } from './bha/overlayHost';
import { BG_CREDIT } from '../data/art/backgrounds';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { testInfoNodes } from './testMode';
import { LEGACY_POINTER_SETTINGS_KEY } from './pointer';
import { applyCalmMode, loadFxSettings, prefersReducedMotion, resetFxSettings, saveFxSettings, type FxSettings } from './fxSettings';
import { emitFeedback, hookAudioUnlock } from './fx';
import { KEY_HINTS_EVENT, loadKeyHints, saveKeyHints } from './keyHints';
import { bgm, BGM_SETTINGS_KEY, BGM_VOLUMES, loadBgmSettings, saveBgmSettings } from './bgm';
import { loadTamagoPrefs, saveTamagoPrefs, TAMAGO_EVENT } from './bha/tamagoLogic';
import { setTiltPref } from './bha/tamago';
import { openInstall } from './installView';
import { detectPlatform, installMode, installPrompt, isStandalone, loadInstallPrefs } from '../pwaInstall';
import { FULLSCREEN_EVENT, fullscreenSupported, isFullscreen, loadFullscreenStart, saveFullscreenStart, toggleFullscreen } from './fullscreen';
import { currentViewState, loadViewScale, saveViewScale, shrunkNote, VIEW_SCALE_EVENT, VIEW_SCALES, type ViewScalePref } from './viewScale';
import { versionLabel } from '../version';

/** 켬/끔 줄 (C.170, GDD 100장 #76): 왼쪽 이름 + 오른쪽 작은 스위치(켬 = 초록, 끔 = 회색). 선택 표시는 줄 테두리(.bha-sel)만 — 켬 색과 섞이지 않는다 */
function switchRow(label: string): { b: HTMLButtonElement; paint: (on: boolean) => void } {
  const b = el('button', 'bha-switch');
  b.type = 'button';
  b.setAttribute('role', 'switch');
  const track = el('span', 'bha-switch__track');
  track.append(el('i', 'bha-switch__knob'));
  b.append(el('span', 'bha-switch__label', label), track);
  return {
    b,
    paint: (on) => {
      b.classList.toggle('is-checked', on);
      b.setAttribute('aria-checked', String(on));
    },
  };
}

/** 레이어로 열린 설정의 닫기 X (도움말과 같은 모양) */
const closeX = (onClose: () => void): HTMLButtonElement => button({ label: '닫기', icon: 'i-close', iconOnly: true, variant: 'ghost', onClick: onClose });

/** 설명 한 줄 (#77): 넘치면 말줄임, 전체 글은 툴팁 */
const hintLine = (text: string): HTMLElement => {
  const p = el('p', 'bha-faint bha-settings__hint', text);
  p.title = text;
  return p;
};

/** 설정을 화면 위 레이어로 연다 (C.170, GDD 100장 #41: 전투 일시정지의 [설정] — 전투 화면을 지우지 않는다). 뒤로·Esc·X 로 닫는다. 돌려주는 함수로 닫는다 */
export function settingsOverlay(onClose: () => void): () => void {
  const layer = el('div', 'bha-layer bha-settings-layer');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', '설정');
  let closed = false;
  let unregister = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    unregister();
    endScreen(layer); // 이 레이어 설정 화면이 건 window 리스너를 푼다
    layer.remove();
    onClose();
  };
  settingsView(layer, undefined, false, undefined, close);
  getOverlayHost().append(layer);
  unregister = registerLayer(layer, close);
  return close;
}

export function settingsView(root: HTMLElement, onHelp?: () => void, restored = false, onBackup?: () => void, onClose?: () => void): void {
  const storage = (() => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  })();
  // 전투 효과 (Q-2): 켬/끔 스위치 줄 4개. 버튼이라 위/아래/확정으로도 조작된다
  let fx: FxSettings = loadFxSettings(storage);
  const FX_ROWS: { key: keyof FxSettings; label: string; hint: string }[] = [
    { key: 'damageNumbers', label: '피해 숫자', hint: '적과 내가 받은 피해가 짧게 떠오른다.' },
    { key: 'vibration', label: '진동', hint: '블록·체인·막기·피격에 짧게 울린다. 지원하지 않는 기기(아이폰 등)는 저절로 안 울린다.' },
    { key: 'sound', label: '효과음', hint: '파일 없이 만든 짧은 소리. 화면을 한 번 만진 뒤부터 난다.' },
    { key: 'shake', label: '화면 흔들림', hint: '강공격에 맞을 때와 저장 필살기 때만 짧게.' },
  ];
  const fxPanel = el('section', 'bha-panel');
  fxPanel.append(el('h2', 'bha-panel__title', '전투 효과'));
  if (prefersReducedMotion()) fxPanel.append(hintLine('기기의 "동작 줄이기" 설정을 따라 화면 흔들림이 기본으로 꺼져 있다.'));
  for (const row of FX_ROWS) {
    const sw = switchRow(row.label);
    const b = sw.b;
    const paint = () => sw.paint(fx[row.key]);
    paint();
    b.onclick = () => {
      fx = saveFxSettings(storage, { ...fx, [row.key]: !fx[row.key] });
      if (row.key === 'shake') applyCalmMode(storage);
      if (row.key === 'sound' && fx.sound) {
        hookAudioUnlock();
        emitFeedback('guard', { vibration: false, sound: true });
      }
      if (row.key === 'vibration' && fx.vibration) emitFeedback('chain2', { vibration: true, sound: false });
      paint();
    };
    fxPanel.append(b, hintLine(row.hint));
  }

  // 배경 음악 (GDD 24-4·97장): 켬/끔·음량 + 플레이리스트(곡 목록·▶ 재생·제외·현재 곡만 반복·다음 곡). 이 기기에만 저장(키 bha-bgm-settings)
  const musicPanel = el('section', 'bha-panel');
  musicPanel.append(el('h2', 'bha-panel__title', '음악'));
  const musicSw = switchRow('배경 음악');
  const musicBtn = musicSw.b;
  const volBtns = BGM_VOLUMES.map((v) => {
    const b = button({ label: `${Math.round(v * 100)}%`, size: 'small' });
    b.onclick = () => setMusic({ ...bgm().settings, volume: v });
    return b;
  });
  const nowLine = el('p', 'bha-faint');
  const repeatSw = switchRow('현재 곡만 반복');
  const repeatBtn = repeatSw.b;
  const nextBtn = button({ label: '다음 곡', size: 'small' });
  const listBox = el('div', 'bha-bgmlist');
  const rows = bgm().playlist.map((t) => {
    const row = el('div', 'bha-bgmlist__row');
    const playBtn = button({ label: '▶', size: 'small' });
    const exBtn = button({ label: '', size: 'small', variant: 'ghost' });
    exBtn.title = '목록에 포함';
    playBtn.setAttribute('aria-label', `${t.name} 재생`);
    playBtn.onclick = () => { bgm().playTrack(t.id); paintMusic(); };
    exBtn.onclick = () => { bgm().toggleExcluded(t.id); paintMusic(); };
    const name = el('span', 'bha-bgmlist__name', t.name);
    const mark = el('span', 'bha-bgmlist__mark');
    name.append(mark);
    row.append(name, playBtn, exBtn);
    listBox.append(row);
    return { t, row, mark, playBtn, exBtn };
  });
  const paintMusic = () => {
    const p = bgm();
    const m = p.settings;
    musicSw.paint(m.on);
    volBtns.forEach((b, i) => {
      const on = Math.abs(BGM_VOLUMES[i]! - m.volume) < 0.01;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const cur = p.currentTrack;
    nowLine.textContent = p.playlist.length === 0 ? '' : cur ? `지금 곡: ${cur.name}` : '재생할 곡 없음';
    repeatSw.paint(m.repeat);
    for (const r of rows) {
      const ex = m.excluded.includes(r.t.id);
      const now = cur?.id === r.t.id;
      r.row.classList.toggle('is-on', now);
      r.row.classList.toggle('is-off', ex);
      r.mark.textContent = now ? ' · 재생 중' : '';
      r.playBtn.classList.toggle('is-on', now);
      r.playBtn.setAttribute('aria-pressed', String(now));
      // '목록에 포함 ✓' 토글 (#78): 포함이면 체크, 빼면 체크 없이 줄이 흐려진다
      r.exBtn.replaceChildren(...(ex ? [] : [icon('i-check')]), ex ? '빠짐' : '포함');
      r.exBtn.setAttribute('aria-pressed', String(!ex));
      r.exBtn.setAttribute('aria-label', `${r.t.name} 목록에 포함${ex ? ' 안 함' : ''}`);
    }
  };
  const setMusic = (m: ReturnType<typeof loadBgmSettings>) => {
    bgm().setSettings(saveBgmSettings(storage, m));
    paintMusic();
  };
  musicBtn.onclick = () => setMusic({ ...bgm().settings, on: !bgm().settings.on });
  repeatBtn.onclick = () => { bgm().toggleRepeat(); paintMusic(); };
  nextBtn.onclick = () => { bgm().next(); paintMusic(); };
  const volRow = el('div', 'bha-plan__grounds');
  volRow.append(el('span', 'bha-faint', '음량'), ...volBtns);
  const hasList = rows.length > 0;
  musicPanel.append(musicBtn, volRow);
  if (hasList) {
    const ctl = el('div', 'bha-bgmlist__ctl');
    ctl.append(repeatBtn, nextBtn);
    musicPanel.append(nowLine, ctl, listBox);
  }
  musicPanel.append(hintLine(hasList ? '한 곡이 끝나면 다음 곡으로, 목록에서 뺀 곡은 건너뛴다(▶ 로 직접 고르면 재생). 화면을 한 번 만진 뒤부터 난다.' : '효과음과 따로 켜고 끈다. 화면을 한 번 만진 뒤부터 난다. 음악 파일이 없는 장면은 조용하다.'));
  paintMusic();
  if (hasList && typeof setInterval === 'function') {
    // 곡이 저절로 넘어가면 이름·표시를 따라간다 (화면이 닫히면 멈춘다)
    const poll = setInterval(() => { if (musicPanel.isConnected) paintMusic(); else clearInterval(poll); }, 1000);
  }

  // 화면 크기 (GDD 17-5): PC 에서만 적용. 선택은 이 기기에만 저장(키 bha-view-scale)
  const sizePanel = el('section', 'bha-panel');
  sizePanel.append(el('h2', 'bha-panel__title', '화면 크기'));
  const sizeNote = el('p', 'bha-faint');
  const sizeBtns = new Map<ViewScalePref, HTMLButtonElement>();
  const paintSize = () => {
    const st = currentViewState();
    const pref = loadViewScale(storage);
    for (const [v, b] of sizeBtns) {
      b.classList.toggle('is-on', v === pref);
      b.setAttribute('aria-pressed', String(v === pref));
    }
    sizeNote.textContent = !st.pc
      ? '컴퓨터(마우스·넓은 창)에서만 바뀐다. 폰·태블릿은 화면에 맞춰 보인다.'
      : shrunkNote({ ...st.view }, pref) ?? `기기 틀을 ${st.view.scale}배(${Math.round(844 * st.view.scale)}×${Math.round(390 * st.view.scale)})로 표시 중. 키보드 + / − 로도 바꾼다.`;
  };
  for (const v of VIEW_SCALES) {
    const b = button({
      label: `${v}배`,
      onClick: () => {
        saveViewScale(storage, v);
        window.dispatchEvent(new CustomEvent(VIEW_SCALE_EVENT));
        paintSize();
      },
    });
    sizeBtns.set(v, b);
    sizePanel.append(b);
  }
  sizePanel.append(sizeNote);
  paintSize();

  // 단축키 표시 (GDD 18-5): 버튼 구석의 키 글자 배지. 컴퓨터에서만 보이고, 켜고 끄는 값은 이 기기에만 저장
  // 앱 설치 (GDD 68장): 큰 안내창을 다시 연다. 이미 앱으로 열렸거나 설치했으면 알려 준다
  const installPanel = el('section', 'bha-panel');
  installPanel.append(el('h2', 'bha-panel__title', '앱 설치'));
  const standalone = isStandalone();
  const installedNote = standalone || loadInstallPrefs(storage).installed;
  if (installedNote) installPanel.append(el('p', 'bha-faint', standalone ? '지금 홈 화면 앱으로 실행 중이다. 인터넷 없이도 열린다.' : '이미 설치했다. 홈 화면의 아이콘으로 열면 인터넷 없이도 플레이할 수 있다.'));
  if (!standalone) {
    const canInstall = installMode(detectPlatform(navigator.userAgent), installPrompt() !== null) !== 'none';
    const b = button({ label: '앱 설치', icon: 'i-play', onClick: () => openInstall({ auto: false }) });
    b.disabled = !canInstall;
    installPanel.append(b, el('p', 'bha-faint', canInstall ? '홈 화면에 설치하면 인터넷 없이도 플레이할 수 있다.' : '이 브라우저에서는 설치 창을 열 수 없다. 주소창의 설치 아이콘이나 브라우저 메뉴를 확인한다.'));
  }

  const keyPanel = el('section', 'bha-panel');
  keyPanel.append(el('h2', 'bha-panel__title', '단축키'));
  const keySw = switchRow('단축키 표시');
  const keyBtn = keySw.b;
  const keyNote = hintLine('');
  const paintKeys = () => {
    const on = loadKeyHints(storage);
    keySw.paint(on);
    keyNote.textContent = keyNote.title = currentViewState().pc
      ? '버튼 구석에 키 글자를 보인다. 꺼도 단축키는 그대로 쓸 수 있다. 전체 표는 도움말의 [단축키].'
      : '컴퓨터(마우스·넓은 창)에서만 보인다. 폰·태블릿에서는 나타나지 않는다.';
  };
  keyBtn.onclick = () => {
    saveKeyHints(storage, !loadKeyHints(storage));
    window.dispatchEvent(new CustomEvent(KEY_HINTS_EVENT));
    paintKeys();
  };
  keyPanel.append(keyBtn, keyNote);
  paintKeys();

  // 다마고치 모드 (GDD 27장): 켜면 기기 전체가 보이게 물러난다(화면을 누르면 다시 확대). 기울기로 흔들기 = 키링이 폰 기울기를 따라 흔들림(기본 꺼짐)
  const tamaPanel = el('section', 'bha-panel');
  tamaPanel.dataset.panel = 'tamago';
  tamaPanel.append(el('h2', 'bha-panel__title', '다마고치 모드'));
  const tamaSw = switchRow('다마고치 모드');
  const tamaBtn = tamaSw.b;
  tamaBtn.dataset.set = 'tamago';
  const tiltSw = switchRow('기울기로 흔들기');
  const tiltBtn = tiltSw.b;
  tiltBtn.dataset.set = 'tilt';
  const paintTama = () => {
    const p = loadTamagoPrefs(storage);
    tamaSw.paint(p.on);
    tiltSw.paint(p.tilt);
  };
  tamaBtn.onclick = () => {
    const p = loadTamagoPrefs(storage);
    saveTamagoPrefs(storage, { ...p, on: !p.on });
    window.dispatchEvent(new CustomEvent(TAMAGO_EVENT));
    paintTama();
  };
  tiltBtn.onclick = () => {
    void setTiltPref(!loadTamagoPrefs(storage).tilt).then(paintTama);
  };
  tamaPanel.append(
    tamaBtn, hintLine('기기 전체(몸체·고리·키링)가 보이게 물러난다. 기기 버튼도 눌린다. 화면을 누르면 다시 확대. 컴퓨터는 B 키.'),
    tiltBtn, hintLine('키링이 폰 기울기를 따라 흔들린다(다마고치 모드에서만). 아이폰은 켤 때 움직임 허용을 묻는다.'),
  );
  paintTama();

  // 전체 화면 (GDD 46장): 지원하지 않는 브라우저(아이폰 사파리 등)에서는 패널 자체를 만들지 않는다. 표시는 실제 상태(fullscreenchange)를 따라간다
  const fsPanel = el('section', 'bha-panel');
  fsPanel.dataset.panel = 'fullscreen';
  fsPanel.append(el('h2', 'bha-panel__title', '전체 화면'));
  const fsSw = switchRow('전체 화면');
  const fsBtn = fsSw.b;
  fsBtn.dataset.set = 'fullscreen';
  const fsStartSw = switchRow('시작할 때 전체 화면');
  const fsStartBtn = fsStartSw.b;
  fsStartBtn.dataset.set = 'fullscreen-start';
  const paintFs = () => {
    fsSw.paint(isFullscreen());
    fsStartSw.paint(loadFullscreenStart(storage));
  };
  fsBtn.onclick = () => {
    void toggleFullscreen().then(paintFs);
  };
  fsStartBtn.onclick = () => {
    saveFullscreenStart(storage, !loadFullscreenStart(storage));
    paintFs();
  };
  fsPanel.append(fsBtn, hintLine('주소창·상태 표시줄을 숨겨 화면을 넓게 쓴다.'), fsStartBtn, hintLine('켜 두면 시작 화면에서 첫 버튼을 누를 때 함께 전체 화면이 된다.'));
  paintFs();
  const fsPanels: HTMLElement[] = fullscreenSupported() ? [fsPanel] : [];

  const panelOf = (...n: Node[]) => {
    const p = el('section', 'bha-panel');
    p.append(...n);
    return p;
  };

  const reset = button({
    label: '기본값 복원', icon: 'i-loop',
    onClick: () => {
      try {
        storage?.removeItem(LEGACY_POINTER_SETTINGS_KEY);
      } catch {
        /* 저장소를 못 쓰면 지울 것도 없다 */
      }
      resetFxSettings(storage);
      try {
        storage?.removeItem(BGM_SETTINGS_KEY);
      } catch {
        /* 무시 */
      }
      bgm().setSettings(loadBgmSettings(storage));
      applyCalmMode(storage);
      settingsView(root, onHelp, true, onBackup, onClose);
    },
  });
  // 아래 고정 버튼 줄은 없앴다 (#77: 왼쪽 열 내용을 가렸다) — 기본값 복원·도움말·세이브 백업은 오른쪽 열 맨 아래 '기타' 칸
  const etc: Node[] = [reset];
  if (onHelp) etc.push(button({ label: '도움말', icon: 'i-help', onClick: onHelp }));
  if (onBackup) etc.push(button({ label: '세이브 백업', icon: 'i-check', onClick: onBackup }));
  const etcRow = el('div', 'bha-settings__etc');
  etcRow.append(...etc);
  // 정보 (#2·#10): 자세한 버전 줄은 시작 화면 대신 여기. 임시 수치가 있다는 한 줄 (개발용 문구 대신)
  const info = panelOf(el('h2', 'bha-panel__title', '정보'), el('p', 'bha-faint', versionLabel()), el('p', 'bha-faint', '임시 수치 있음 — 밸런스·이름은 바뀔 수 있다.'), el('p', 'bha-faint bha-settings__credit', BG_CREDIT), ...testInfoNodes());
  // 열 균형 (#77): 왼쪽 = 전투 효과·음악, 오른쪽 = 화면·기기·조작·정보
  lcdPage(root, { cls: 'bha-settings-page' }, lcdHead({ title: '설정', sub: restored ? '기본값으로 되돌렸다.' : '이 기기에만 저장(게임 세이브 제외)', aside: onClose ? [closeX(onClose)] : undefined }), [fxPanel, musicPanel], [...fsPanels, tamaPanel, sizePanel, installPanel, keyPanel, panelOf(el('h2', 'bha-panel__title', '조작'), hintLine('블록은 누르면 바로 쓴다. 블록 순서는 바꿀 수 없고, 나온 순서대로 쓴다.')), info, panelOf(el('h2', 'bha-panel__title', '기타'), etcRow)]);
  // 화면 크기(키보드 단축키)·다마고치 모드·전체 화면이 밖에서 바뀌어도 문구가 따라간다. C.139 (GDD 88장 6): 이 화면이 끝나면(다음 화면이 그려지면) 한 번에 풀린다.
  // 전체 화면 미지원이면 패널도 구독도 없다
  const signal = screenSignal(root);
  const listen = (type: string, paint: () => void) => window.addEventListener(type, paint, { signal });
  listen(VIEW_SCALE_EVENT, paintSize);
  listen(TAMAGO_EVENT, paintTama);
  if (fsPanels.length > 0) listen(FULLSCREEN_EVENT, paintFs);
}
