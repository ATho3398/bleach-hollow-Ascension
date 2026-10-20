// 설정 화면 (GDD 14-3, C.18 / U-1 새 디자인, R-2): 전투 효과 켬/끔. 블록 클릭 판정 시간·드래그 임계치 설정은 순서 바꾸기 삭제(17-2)와 함께 없앴다.
// localStorage 별도 키에 저장하고 세이브 구조는 건드리지 않는다.
import { button, el } from './bha/dom';
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
import { currentViewState, loadViewScale, saveViewScale, shrunkNote, VIEW_SCALE_EVENT, VIEW_SCALES, type ViewScalePref } from './viewScale';

export function settingsView(root: HTMLElement, onHelp?: () => void, restored = false, onBackup?: () => void, onTutorial?: () => void): void {
  const storage = (() => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  })();
  // 전투 효과 (Q-2): 켬/끔 버튼 4개. 버튼이라 위/아래/확정으로도 조작된다
  let fx: FxSettings = loadFxSettings(storage);
  const FX_ROWS: { key: keyof FxSettings; label: string; hint: string }[] = [
    { key: 'damageNumbers', label: '피해 숫자', hint: '적과 내가 받은 피해가 짧게 떠오른다.' },
    { key: 'vibration', label: '진동', hint: '블록·체인·막기·피격에 짧게 울린다. 지원하지 않는 기기(아이폰 등)는 저절로 안 울린다.' },
    { key: 'sound', label: '효과음', hint: '파일 없이 만든 짧은 소리. 화면을 한 번 만진 뒤부터 난다.' },
    { key: 'shake', label: '화면 흔들림', hint: '강공격에 맞을 때와 저장 필살기 때만 짧게.' },
  ];
  const fxPanel = el('section', 'bha-panel');
  fxPanel.append(el('h2', 'bha-panel__title', '전투 효과'));
  if (prefersReducedMotion()) fxPanel.append(el('p', 'bha-faint', '기기의 "동작 줄이기" 설정을 따라 화면 흔들림이 기본으로 꺼져 있다.'));
  for (const row of FX_ROWS) {
    const b = button({ label: '', on: fx[row.key] });
    const paint = () => {
      b.classList.toggle('is-on', fx[row.key]);
      b.setAttribute('aria-pressed', String(fx[row.key]));
      b.replaceChildren(`${row.label} ${fx[row.key] ? '켬' : '끔'}`);
    };
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
    fxPanel.append(b, el('p', 'bha-faint', row.hint));
  }

  // 배경 음악 (GDD 24-4): 효과음과 별도로 켬/끔·음량. 이 기기에만 저장(키 bha-bgm-settings). 음원 파일이 없는 트랙은 무음
  const musicPanel = el('section', 'bha-panel');
  musicPanel.append(el('h2', 'bha-panel__title', '음악'));
  const musicBtn = button({ label: '' });
  const volBtns = BGM_VOLUMES.map((v) => {
    const b = button({ label: `${Math.round(v * 100)}%`, size: 'small' });
    b.onclick = () => setMusic({ ...loadBgmSettings(storage), volume: v });
    return b;
  });
  const paintMusic = () => {
    const m = loadBgmSettings(storage);
    musicBtn.textContent = `배경 음악 ${m.on ? '켬' : '끔'}`;
    musicBtn.classList.toggle('is-on', m.on);
    musicBtn.setAttribute('aria-pressed', String(m.on));
    volBtns.forEach((b, i) => {
      const on = Math.abs(BGM_VOLUMES[i]! - m.volume) < 0.01;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  const setMusic = (m: ReturnType<typeof loadBgmSettings>) => {
    bgm().setSettings(saveBgmSettings(storage, m));
    paintMusic();
  };
  musicBtn.onclick = () => {
    const m = loadBgmSettings(storage);
    setMusic({ ...m, on: !m.on });
  };
  const volRow = el('div', 'bha-plan__grounds');
  volRow.append(el('span', 'bha-faint', '음량'), ...volBtns);
  musicPanel.append(musicBtn, volRow, el('p', 'bha-faint', '효과음과 따로 켜고 끈다. 화면을 한 번 만진 뒤부터 난다. 음악 파일이 없는 장면은 조용하다.'));
  paintMusic();

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
  // 키보드 단축키로 바뀌어도 문구가 따라가도록 한 번 더 그린다
  const onScaleEvent = () => {
    if (!sizePanel.isConnected) window.removeEventListener(VIEW_SCALE_EVENT, onScaleEvent);
    else paintSize();
  };
  window.addEventListener(VIEW_SCALE_EVENT, onScaleEvent);

  // 단축키 표시 (GDD 18-5): 버튼 구석의 키 글자 배지. 컴퓨터에서만 보이고, 켜고 끄는 값은 이 기기에만 저장
  const keyPanel = el('section', 'bha-panel');
  keyPanel.append(el('h2', 'bha-panel__title', '단축키'));
  const keyBtn = button({ label: '' });
  const keyNote = el('p', 'bha-faint');
  const paintKeys = () => {
    const on = loadKeyHints(storage);
    keyBtn.textContent = `단축키 표시 ${on ? '켬' : '끔'}`;
    keyBtn.classList.toggle('is-on', on);
    keyBtn.setAttribute('aria-pressed', String(on));
    keyNote.textContent = currentViewState().pc
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
  const tamaBtn = button({ label: '' });
  tamaBtn.dataset.set = 'tamago';
  const tiltBtn = button({ label: '' });
  tiltBtn.dataset.set = 'tilt';
  const paintTama = () => {
    const p = loadTamagoPrefs(storage);
    for (const [b, on, label] of [[tamaBtn, p.on, '다마고치 모드'], [tiltBtn, p.tilt, '기울기로 흔들기']] as const) {
      b.textContent = `${label} ${on ? '켬' : '끔'}`;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    }
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
    tamaBtn, el('p', 'bha-faint', '기기 전체(몸체·고리·키링)가 보이게 물러난다. 화면은 그대로 움직이고 기기 버튼도 눌린다. 화면을 누르면 다시 확대. 컴퓨터는 B 키.'),
    tiltBtn, el('p', 'bha-faint', '키링이 폰 기울기를 따라 흔들린다(다마고치 모드에서만). 아이폰은 켤 때 움직임 허용을 묻는다. 꺼도 키링은 탭·끌기로 흔들린다.'),
  );
  paintTama();
  const onTamaEvent = () => {
    if (!tamaPanel.isConnected) window.removeEventListener(TAMAGO_EVENT, onTamaEvent);
    else paintTama();
  };
  window.addEventListener(TAMAGO_EVENT, onTamaEvent);

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
      settingsView(root, onHelp, true, onBackup, onTutorial);
    },
  });
  const foot: Node[] = [reset];
  if (onTutorial) foot.push(button({ label: '튜토리얼 다시 보기', icon: 'i-play', onClick: onTutorial }));
  if (onHelp) foot.push(button({ label: '도움말', icon: 'i-help', onClick: onHelp }));
  if (onBackup) foot.push(button({ label: '세이브 백업', icon: 'i-check', onClick: onBackup }));
  lcdPage(root, { cls: 'bha-settings-page', foot }, lcdHead({ title: '설정', sub: restored ? '기본값으로 되돌렸다.' : '전투 효과·음악·화면 크기 — 이 기기에만 저장(게임 세이브 제외)' }), [fxPanel], [musicPanel, tamaPanel, sizePanel, keyPanel, panelOf(el('h2', 'bha-panel__title', '조작'), el('p', 'bha-faint', '블록은 누르면 바로 쓴다(저장 필살기 버튼도 같다). 블록 순서는 바꿀 수 없고, 나온 순서대로 쓴다.')), panelOf(el('h2', 'bha-panel__title', '정보'), el('p', 'bha-faint bha-settings__credit', BG_CREDIT), ...testInfoNodes())]);
}
