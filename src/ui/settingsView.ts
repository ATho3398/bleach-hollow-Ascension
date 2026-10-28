// 설정 화면 (GDD 14-3·103장, C.178): 탭 4개 화면 / 소리 / 전투 / 기타. 바꾼 값은 임시이고 [저장]을 눌러야 반영된다(소리 크기는 움직이는 동안 미리 듣기).
// [저장] 없이 뒤로(◀·Esc·폰 뒤로가기·닫기)면 "바꾼 설정을 저장할까요?" [저장][저장 안 함][취소].
// 공통 설정(기기 전체, 항목마다 localStorage 키) + 게임 안에서는 [공통]/[이 슬롯] 토글 — 슬롯 설정(세이브 settings)은 항목별로 공통보다 우선(settingsScope.ts).
import { button, el, enableRangeDrag, icon } from './bha/dom';
import { endScreen, screenSignal } from './bha/screenScope';
import { getOverlayHost, registerLayer } from './bha/overlayHost';
import { registerCancelHook } from './bha/shortcuts';
import { categoryTabs } from './bha/itemUi';
import { BG_CREDIT } from '../data/art/backgrounds';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { testInfoNodes } from './testMode';
import { LEGACY_POINTER_SETTINGS_KEY } from './pointer';
import { applyCalmMode, defaultFxSettings, loadCommonFxSettings, prefersReducedMotion, saveFxSettings, type SettingsStorage } from './fxSettings';
import { emitFeedback, hookAudioUnlock } from './fx';
import { KEY_HINTS_EVENT, loadCommonKeyHints, saveKeyHints } from './keyHints';
import { bgm, bgmBarOf, defaultBgmSettings, loadBgmSettings, saveBgmSettings, withBgmBar, withSlotBgm } from './bgm';
import { loadTamagoPrefs, saveTamagoPrefs, TAMAGO_EVENT } from './bha/tamagoLogic';
import { setTiltPref } from './bha/tamago';
import { openInstall } from './installView';
import { detectPlatform, installMode, installPrompt, isStandalone, loadInstallPrefs } from '../pwaInstall';
import { FULLSCREEN_EVENT, fullscreenSupported, isFullscreen, loadFullscreenStart, saveFullscreenStart, toggleFullscreen } from './fullscreen';
import { currentViewState, loadViewScale, saveViewScale, shrunkNote, VIEW_SCALE_EVENT, VIEW_SCALES, type ViewScalePref } from './viewScale';
import { confirmDialog } from './confirmDialog';
import { parseSlotSettings, setActiveSlotSettings, slotSettingsHost, SLOT_SETTING_KEYS, type SlotSettings } from './settingsScope';
import { versionLabel } from '../version';
import { DEFAULT_GENDER, GENDER_LABEL, GENDERS, type Gender } from '../engine/gender';

/** 설정 탭 (GDD 103장 2) */
export const SETTINGS_TABS = [
  { id: 'screen', label: '화면' },
  { id: 'sound', label: '소리' },
  { id: 'battle', label: '전투' },
  { id: 'etc', label: '기타' },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

/** 막대 키보드 ◀▶ 한 번에 움직이는 양 */
export const VOLUME_KEY_STEP = 5;

/** 설정 화면이 다루는 공통 값 전부 (슬롯 설정이 되는 것은 SLOT_SETTING_KEYS) */
export interface CommonValues {
  damageNumbers: boolean;
  vibration: boolean;
  shake: boolean;
  sfxVolume: number;
  bgmVolume: number;
  keyHints: boolean;
  repeat: boolean;
  excluded: string[];
  tamago: boolean;
  tilt: boolean;
  viewScale: ViewScalePref;
  fsStart: boolean;
}
type BoolKey = { [K in keyof CommonValues]: CommonValues[K] extends boolean ? K : never }[keyof CommonValues];
type VolumeKey = 'sfxVolume' | 'bgmVolume';

const storageOrNull = (): SettingsStorage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

export function readCommonValues(storage: SettingsStorage | null): CommonValues {
  const fx = loadCommonFxSettings(storage);
  const m = loadBgmSettings(storage);
  const t = loadTamagoPrefs(storage);
  return {
    damageNumbers: fx.damageNumbers, vibration: fx.vibration, shake: fx.shake, sfxVolume: fx.sfxVolume,
    bgmVolume: bgmBarOf(m), keyHints: loadCommonKeyHints(storage), repeat: m.repeat, excluded: [...m.excluded],
    tamago: t.on, tilt: t.tilt, viewScale: loadViewScale(storage), fsStart: loadFullscreenStart(storage),
  };
}

/** [기본값 복원]이 되돌리는 항목 (전투 효과·소리·음악 목록) */
function defaultsOf(cur: CommonValues): CommonValues {
  const fx = defaultFxSettings(prefersReducedMotion());
  const m = defaultBgmSettings();
  return { ...cur, damageNumbers: fx.damageNumbers, vibration: fx.vibration, shake: fx.shake, sfxVolume: fx.sfxVolume, bgmVolume: bgmBarOf(m), repeat: m.repeat, excluded: [...m.excluded] };
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** 저장된 값(공통 + 지금 슬롯 설정)을 화면·소리에 다시 건다: 배경음 크기, 흔들림(움직임 줄이기), 단축키 배지 */
export function applySettingsNow(storage: SettingsStorage | null = storageOrNull()): void {
  try {
    const p = bgm();
    p.setSettings({ ...withSlotBgm(loadBgmSettings(storage)), track: p.settings.track });
  } catch {
    /* 음악은 부가 기능 */
  }
  applyCalmMode(storage);
  try {
    window.dispatchEvent(new CustomEvent(KEY_HINTS_EVENT));
  } catch {
    /* 표시 전용 */
  }
}

/** 바뀐 공통 값만 각 저장 키에 쓴다 */
function writeCommon(storage: SettingsStorage | null, before: CommonValues, after: CommonValues): void {
  const fx = loadCommonFxSettings(storage);
  saveFxSettings(storage, { ...fx, damageNumbers: after.damageNumbers, vibration: after.vibration, shake: after.shake, sfxVolume: after.sfxVolume, sound: after.sfxVolume > 0 });
  if (before.bgmVolume !== after.bgmVolume) saveBgmSettings(storage, withBgmBar(loadBgmSettings(storage), after.bgmVolume));
  // 반복·목록 제외는 재생기를 거쳐야 지금 곡이 맞게 넘어간다 (재생기가 공통 저장에 쓴다)
  const p = bgm();
  if (p.settings.repeat !== after.repeat) p.toggleRepeat();
  for (const id of new Set([...before.excluded, ...after.excluded])) {
    if (p.settings.excluded.includes(id) !== after.excluded.includes(id)) p.toggleExcluded(id);
  }
  if (before.keyHints !== after.keyHints) saveKeyHints(storage, after.keyHints);
  if (before.tamago !== after.tamago) {
    saveTamagoPrefs(storage, { ...loadTamagoPrefs(storage), on: after.tamago });
    window.dispatchEvent(new CustomEvent(TAMAGO_EVENT));
  }
  if (before.viewScale !== after.viewScale) {
    saveViewScale(storage, after.viewScale);
    window.dispatchEvent(new CustomEvent(VIEW_SCALE_EVENT));
  }
  if (before.fsStart !== after.fsStart) saveFullscreenStart(storage, after.fsStart);
}

/** 켬/끔 줄 (C.170, GDD 100장 #76): 왼쪽 이름 + (슬롯 표시) + 오른쪽 작은 스위치(켬 = 초록, 끔 = 회색). 선택 표시는 줄 테두리(.bha-sel)만 */
function switchRow(label: string): { b: HTMLButtonElement; tag: HTMLElement; paint: (on: boolean) => void } {
  const b = el('button', 'bha-switch');
  b.type = 'button';
  b.setAttribute('role', 'switch');
  const track = el('span', 'bha-switch__track');
  track.append(el('i', 'bha-switch__knob'));
  const tag = scopeTag();
  b.append(el('span', 'bha-switch__label', label), tag, track);
  return {
    b,
    tag,
    paint: (on) => {
      b.classList.toggle('is-checked', on);
      b.setAttribute('aria-checked', String(on));
    },
  };
}

/** 줄마다 '지금 어느 쪽 값인지' 작은 표시 (GDD 103장 5): 슬롯 / 슬롯 우선 / 공통만 */
function scopeTag(): HTMLElement {
  const t = el('span', 'bha-tag bha-tag--kind bha-settings__scope');
  t.hidden = true;
  return t;
}

/** 레이어로 열린 설정의 닫기 X (도움말과 같은 모양) */
const closeX = (onClose: () => void): HTMLButtonElement => button({ label: '닫기', icon: 'i-close', iconOnly: true, variant: 'ghost', onClick: onClose });

/** 설명 한 줄 (#77): 넘치면 말줄임, 전체 글은 툴팁 */
const hintLine = (text: string): HTMLElement => {
  const p = el('p', 'bha-faint bha-settings__hint', text);
  p.title = text;
  return p;
};

const panel = (title: string, ...n: Node[]): HTMLElement => {
  const p = el('section', 'bha-panel');
  p.append(el('h2', 'bha-panel__title', title), ...n);
  return p;
};

export interface SettingsViewOpts {
  onHelp?: () => void;
  onBackup?: () => void;
  /** 레이어로 열렸을 때 닫기 (X·뒤로) */
  onClose?: () => void;
  /** 화면으로 열렸을 때 한 칸 뒤로 (저장 확인 창 뒤에 부른다) */
  onBack?: () => void;
  /** 시작 화면에서 연 설정: 공통만 (슬롯 토글 없음, GDD 103장 1) */
  commonOnly?: boolean;
  /** 처음 열 탭 */
  tab?: SettingsTab;
}

/** 설정을 화면 위 레이어로 연다 (C.170, GDD 100장 #41: 전투 일시정지의 [설정] — 전투 화면을 지우지 않는다). 뒤로·Esc·X 로 닫는다(바꾼 게 있으면 저장 확인). 돌려주는 함수로 바로 닫는다 */
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
  const ctl = settingsView(layer, { onClose: () => ctl.requestClose(close) });
  getOverlayHost().append(layer);
  unregister = registerLayer(layer, () => ctl.requestClose(close));
  return close;
}

export interface SettingsControl {
  /** 바꾼 게 있으면 저장 확인 창을 띄우고, 고른 뒤(취소 제외) then 을 부른다 */
  requestClose(then: () => void): void;
  readonly dirty: boolean;
}

export function settingsView(root: HTMLElement, o: SettingsViewOpts = {}): SettingsControl {
  const storage = storageOrNull();
  const host = o.commonOnly ? null : slotSettingsHost();
  let commonSaved = readCommonValues(storage);
  let common: CommonValues = structuredClone(commonSaved);
  let slotSaved: SlotSettings = host?.read() ?? {};
  let slot: SlotSettings = { ...slotSaved };
  // 성별 (GDD 114장): 슬롯에만 있는 값 — [이 슬롯]에서만 바꾼다. 저장 전까지는 임시
  const genderHost = host?.gender ?? null;
  let genderSaved: Gender = genderHost?.read() ?? DEFAULT_GENDER;
  let gender: Gender = genderSaved;
  let scope: 'common' | 'slot' = 'common';
  let tab: SettingsTab = o.tab ?? 'screen';
  let note = '';
  const slotable = (k: keyof CommonValues): k is keyof SlotSettings => (SLOT_SETTING_KEYS as readonly string[]).includes(k);
  const editable = (k: keyof CommonValues) => scope === 'common' || slotable(k);
  /** 화면에 보이는 값: 슬롯 탭이면 슬롯 값 → 없으면 공통 */
  const val = <K extends keyof CommonValues>(k: K): CommonValues[K] => {
    if (scope === 'slot' && slotable(k)) {
      const v = slot[k as keyof SlotSettings];
      if (v !== undefined) return v as CommonValues[K];
    }
    return common[k];
  };
  const setVal = <K extends keyof CommonValues>(k: K, v: CommonValues[K]) => {
    if (scope === 'slot' && slotable(k)) (slot as Record<string, unknown>)[k] = v;
    else common[k] = v;
  };
  const commonDirty = () => !sameValue(common, commonSaved);
  const slotDirty = () => !sameValue(parseSlotSettings(slot), parseSlotSettings(slotSaved));
  const genderDirty = () => genderHost !== null && gender !== genderSaved;
  const isDirty = () => commonDirty() || (host !== null && slotDirty()) || genderDirty();

  const paints: (() => void)[] = [];
  const tagPaint = (tag: HTMLElement, k: keyof CommonValues) => {
    let text = '';
    if (host) {
      const inSlot = slotable(k) && slot[k as keyof SlotSettings] !== undefined;
      if (scope === 'slot') text = !slotable(k) ? '공통만' : inSlot ? '슬롯' : '';
      else text = inSlot ? '슬롯 우선' : '';
    }
    tag.textContent = text;
    tag.hidden = text === '';
  };

  // ── 줄 만들기 ──
  const boolRow = (k: BoolKey, label: string, after?: (on: boolean) => void): HTMLButtonElement => {
    const sw = switchRow(label);
    sw.b.dataset.set = k;
    sw.b.onclick = () => {
      if (!editable(k)) return;
      setVal(k, !val(k));
      after?.(val(k));
      paintAll();
    };
    paints.push(() => {
      sw.paint(val(k));
      sw.b.disabled = !editable(k);
      tagPaint(sw.tag, k);
    });
    return sw.b;
  };

  /** 소리 막대 (GDD 103장 3): 0~100, 끌기·누르기·키보드 ◀▶ 5씩, 0 = 끔. 움직이는 동안 미리 듣기(배경음 = 그 크기로, 효과음 = 놓을 때 한 번) */
  const volumeRow = (k: VolumeKey, label: string, preview: (v: number) => void): HTMLElement => {
    const box = el('div', 'bha-slider bha-settings__bar');
    box.dataset.set = k;
    const id = `bha-set-${k}`;
    const input = el('input', 'bha-slider__input');
    input.id = id;
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.setAttribute('aria-label', label);
    const out = el('output', 'bha-slider__value');
    out.htmlFor.add(id);
    const tag = scopeTag();
    const head = el('div', 'bha-slider__head');
    const name = el('label', 'bha-slider__label', label);
    name.htmlFor = id;
    const right = el('span', 'bha-settings__barval');
    right.append(tag, out);
    head.append(name, right);
    box.append(head, input);
    const show = (v: number) => {
      input.value = String(v);
      out.textContent = v === 0 ? '끔' : String(v);
      input.style.setProperty('--pct', String(v / 100));
      input.setAttribute('aria-valuetext', v === 0 ? '끔' : `${v}`);
    };
    const set = (v: number, done: boolean) => {
      if (!editable(k)) return;
      const c = Math.max(0, Math.min(100, Math.round(v)));
      setVal(k, c);
      show(c);
      preview(c);
      if (done) previewDone(k, c);
      paintMeta();
    };
    input.oninput = () => set(Number(input.value), false);
    input.onchange = () => set(Number(input.value), true);
    // 끌어서 원하는 값에 놓기 (103장 수정 v5.242): 누르는 동안 따라가고 놓을 때 확정·미리 듣기 1회
    enableRangeDrag(input, (v) => set(v, false), (v) => set(v, true));
    input.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
      if (d === 0 || e.key === 'ArrowUp' || e.key === 'ArrowDown') return; // 위/아래는 기기 선택 이동
      e.preventDefault();
      set(val(k) + d * VOLUME_KEY_STEP, true);
    });
    paints.push(() => {
      show(val(k));
      input.disabled = !editable(k);
      tagPaint(tag, k);
    });
    return box;
  };
  const previewBgm = (v: number) => {
    try {
      const p = bgm();
      p.setSettings(withBgmBar(p.settings, v));
    } catch {
      /* 음악은 부가 */
    }
  };
  const previewDone = (k: VolumeKey, v: number) => {
    if (k !== 'sfxVolume' || v === 0) return;
    hookAudioUnlock();
    emitFeedback('guard', { vibration: false, sound: true, sfxVolume: v });
  };

  /** 고르는 줄: 고른 칸에 ✓. 체크는 안 고른 칸에도 자리를 차지(숨김) — 고를 때마다 버튼 폭·위치가 바뀌지 않게 (GDD 114장, C.182 머리 토글과 같은 규칙) */
  const pickRow = <V,>(options: readonly V[], label: (v: V) => string, get: () => V, set: (v: V) => void, enabled: () => boolean, tagOf: (tag: HTMLElement) => void): HTMLElement => {
    const row = el('div', 'bha-settings__choices');
    const btns = options.map((v) => {
      const b = button({ label: label(v), size: 'small' });
      b.replaceChildren(icon('i-check'), label(v));
      b.onclick = () => {
        if (!enabled()) return;
        set(v);
        paintAll();
      };
      return { v, b };
    });
    const tag = scopeTag();
    row.append(...btns.map((x) => x.b), tag);
    paints.push(() => {
      for (const { v, b } of btns) {
        const on = get() === v;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
        b.disabled = !enabled();
      }
      tagOf(tag);
    });
    return row;
  };
  const choiceRow = <K extends 'viewScale'>(k: K, options: readonly CommonValues[K][], label: (v: CommonValues[K]) => string): HTMLElement =>
    pickRow(options, label, () => val(k), (v) => setVal(k, v), () => editable(k), (tag) => tagPaint(tag, k));

  // ── 화면 탭 ──
  // 성별 (GDD 114장): 남성/여성. [공통]에서는 흐리게 두고 '슬롯만' 표시(자리 고정)
  const charPanels: HTMLElement[] = [];
  if (genderHost) {
    const genderRow = pickRow(GENDERS, (g) => GENDER_LABEL[g], () => gender, (g) => { gender = g; }, () => scope === 'slot', (tag) => {
      tag.textContent = scope === 'slot' ? '슬롯' : '슬롯만';
      tag.hidden = false;
    });
    genderRow.dataset.set = 'gender';
    genderRow.setAttribute('role', 'group');
    genderRow.setAttribute('aria-label', '성별');
    const p = panel('성별', genderRow, hintLine('캐릭터(슬롯)마다 따로 정한다. [이 슬롯]에서 바꾼다.'), hintLine(genderHost.note));
    p.dataset.panel = 'gender';
    charPanels.push(p);
  }
  const tamaPanel = panel('다마고치 모드',
    boolRow('tamago', '다마고치 모드'), hintLine('기기 전체(몸체·고리·키링)가 보이게 물러난다. 기기 버튼도 눌린다. 화면을 누르면 다시 확대된다. 컴퓨터는 B 키로 바꾼다.'),
    boolRow('tilt', '기울기로 흔들기'), hintLine('키링이 폰 기울기를 따라 흔들린다(다마고치 모드에서만). 아이폰은 저장할 때 움직임 허용을 묻는다.'),
  );
  tamaPanel.dataset.panel = 'tamago';
  // 전체 화면 (GDD 46장): 지원하지 않는 브라우저(아이폰 사파리 등)에서는 패널 자체를 만들지 않는다. [전체 화면]은 설정이 아니라 바로 하는 동작
  const fsBtn = button({ label: '전체 화면', icon: 'i-frame', onClick: () => void toggleFullscreen().then(paintFs) });
  fsBtn.dataset.set = 'fullscreen';
  const paintFs = () => {
    fsBtn.classList.toggle('is-on', isFullscreen());
    fsBtn.setAttribute('aria-pressed', String(isFullscreen()));
  };
  const fsPanel = panel('전체 화면', fsBtn, hintLine('주소창·상태 표시줄을 숨겨 화면을 넓게 쓴다(누르면 바로 바뀐다).'), boolRow('fsStart', '시작할 때 전체 화면'), hintLine('켜 두면 시작 화면에서 첫 버튼을 누를 때 함께 전체 화면이 된다.'));
  fsPanel.dataset.panel = 'fullscreen';
  paintFs();
  const fsPanels: HTMLElement[] = fullscreenSupported() ? [fsPanel] : [];
  // 화면 크기 (GDD 17-5): PC 에서만 적용
  const sizeNote = el('p', 'bha-faint');
  const paintSize = () => {
    const st = currentViewState();
    sizeNote.textContent = !st.pc
      ? '컴퓨터(마우스·넓은 창)에서만 바뀐다. 폰·태블릿은 화면에 맞춰 보인다.'
      : shrunkNote({ ...st.view }, common.viewScale) ?? `기기 틀을 ${st.view.scale}배(${Math.round(844 * st.view.scale)}×${Math.round(390 * st.view.scale)})로 표시 중. 키보드 + / − 로도 바꾼다.`;
  };
  const sizePanel = panel('화면 크기', choiceRow('viewScale', VIEW_SCALES, (v) => `${v}배`), sizeNote);
  // 단축키 표시 (GDD 18-5): 버튼 구석의 키 글자 배지. 컴퓨터에서만 보인다
  const keyPanel = panel('단축키', boolRow('keyHints', '단축키 표시'), hintLine(currentViewState().pc
    ? '버튼 구석에 키 글자를 보인다. 꺼도 단축키는 그대로 쓸 수 있다. 전체 표는 도움말의 [단축키]에 있다.'
    : '컴퓨터(마우스·넓은 창)에서만 보인다. 폰·태블릿에서는 나타나지 않는다.'));

  // ── 소리 탭 (GDD 24-4·97장·103장 3) ──
  const soundPanel = panel('소리',
    volumeRow('bgmVolume', '배경음', previewBgm),
    volumeRow('sfxVolume', '효과음', () => {}),
    hintLine('0 이면 끈다. 화면을 한 번 만진 뒤부터 난다. 효과음은 파일 없이 만든 짧은 소리다.'),
  );
  const musicNodes: HTMLElement[] = [];
  const nowLine = el('p', 'bha-faint');
  const listRows = bgm().playlist.map((t) => {
    const row = el('div', 'bha-bgmlist__row');
    const playBtn = button({ label: '▶', size: 'small' });
    const exBtn = button({ label: '', size: 'small', variant: 'ghost' });
    exBtn.title = '목록에 포함';
    exBtn.classList.add('bha-bgmlist__ex');
    playBtn.setAttribute('aria-label', `${t.name} 재생`);
    playBtn.onclick = () => { bgm().playTrack(t.id); paintMusic(); };
    exBtn.onclick = () => {
      if (!editable('excluded')) return;
      common.excluded = common.excluded.includes(t.id) ? common.excluded.filter((x) => x !== t.id) : [...common.excluded, t.id];
      paintAll();
    };
    const name = el('span', 'bha-bgmlist__name', t.name);
    const mark = el('span', 'bha-bgmlist__mark');
    name.append(mark);
    row.append(name, playBtn, exBtn);
    return { t, row, mark, playBtn, exBtn };
  });
  const paintMusic = () => {
    const p = bgm();
    const cur = p.currentTrack;
    nowLine.textContent = p.playlist.length === 0 ? '' : cur ? `지금 곡: ${cur.name}` : '재생할 곡 없음';
    for (const r of listRows) {
      const ex = common.excluded.includes(r.t.id);
      const now = cur?.id === r.t.id;
      r.row.classList.toggle('is-on', now);
      r.row.classList.toggle('is-off', ex);
      r.mark.textContent = now ? ' · 재생 중' : '';
      r.playBtn.classList.toggle('is-on', now);
      r.playBtn.setAttribute('aria-pressed', String(now));
      // '목록에 포함 ✓' 토글 (#78): 빼면 줄이 흐려진다. 체크는 빼도 자리를 그대로 차지(흐린 체크) — 재생 버튼이 움직이지 않게 (GDD 110장 1번)
      r.exBtn.replaceChildren(icon('i-check'), ex ? '빠짐' : '포함');
      r.exBtn.setAttribute('aria-pressed', String(!ex));
      r.exBtn.setAttribute('aria-label', `${r.t.name} 목록에 포함${ex ? ' 안 함' : ''}`);
      r.exBtn.disabled = !editable('excluded');
    }
  };
  paints.push(paintMusic);
  if (listRows.length > 0) {
    const listBox = el('div', 'bha-bgmlist');
    listBox.append(...listRows.map((r) => r.row));
    const ctl = el('div', 'bha-bgmlist__ctl');
    ctl.append(boolRow('repeat', '현재 곡만 반복'), button({ label: '다음 곡', size: 'small', onClick: () => { bgm().next(); paintMusic(); } }));
    musicNodes.push(panel('음악 목록', nowLine, ctl, listBox, hintLine('한 곡이 끝나면 다음 곡으로, 목록에서 뺀 곡은 건너뛴다(▶ 로 직접 고르면 바로 재생).')));
  }

  // ── 전투 탭 (전투 연출 — 소리와 분리, GDD 103장 2) ──
  const fxPanel = panel('전투 효과',
    ...(prefersReducedMotion() ? [hintLine('기기의 "동작 줄이기" 설정을 따라 화면 흔들림이 기본으로 꺼져 있다.')] : []),
    boolRow('damageNumbers', '피해 숫자'), hintLine('적과 내가 받은 피해가 짧게 떠오른다.'),
    boolRow('vibration', '진동', (on) => { if (on) emitFeedback('chain2', { vibration: true, sound: false }); }), hintLine('블록·체인·막기·피격에 짧게 울린다. 지원하지 않는 기기(아이폰 등)는 저절로 안 울린다.'),
    boolRow('shake', '화면 흔들림'), hintLine('강공격에 맞을 때와 저장 필살기 때만 짧게 흔들린다.'),
  );
  const ctlPanel = panel('조작', hintLine('블록은 누르면 바로 쓴다. 블록 순서는 바꿀 수 없고, 나온 순서대로 쓴다.'));

  // ── 기타 탭 ──
  const info = panel('정보', el('p', 'bha-faint', versionLabel()), el('p', 'bha-faint', '임시 수치가 있다. 밸런스·이름은 바뀔 수 있다.'), el('p', 'bha-faint bha-settings__credit', BG_CREDIT), ...testInfoNodes());
  // 앱 설치 (GDD 68장): 큰 안내창을 다시 연다. 이미 앱으로 열렸거나 설치했으면 알려 준다
  const installPanel = panel('앱 설치');
  const standalone = isStandalone();
  if (standalone || loadInstallPrefs(storage).installed) installPanel.append(el('p', 'bha-faint', standalone ? '지금 홈 화면 앱으로 실행 중이다. 인터넷 없이도 열린다.' : '이미 설치했다. 홈 화면의 아이콘으로 열면 인터넷 없이도 플레이할 수 있다.'));
  if (!standalone) {
    const canInstall = installMode(detectPlatform(navigator.userAgent), installPrompt() !== null) !== 'none';
    const b = button({ label: '앱 설치', icon: 'i-play', onClick: () => openInstall({ auto: false }) });
    b.disabled = !canInstall;
    installPanel.append(b, el('p', 'bha-faint', canInstall ? '홈 화면에 설치하면 인터넷 없이도 플레이할 수 있다.' : '이 브라우저에서는 설치 창을 열 수 없다. 주소창의 설치 아이콘이나 브라우저 메뉴를 확인한다.'));
  }
  const reset = button({
    label: '기본값 복원', icon: 'i-loop',
    onClick: () => {
      try {
        storage?.removeItem?.(LEGACY_POINTER_SETTINGS_KEY);
      } catch {
        /* 저장소를 못 쓰면 지울 것도 없다 */
      }
      common = defaultsOf(common);
      previewBgm(common.bgmVolume);
      note = '기본값으로 바꿨다. [저장]하면 반영된다.';
      paintAll();
    },
  });
  paints.push(() => { reset.disabled = scope !== 'common'; });
  const etc: Node[] = [reset];
  if (o.onHelp) etc.push(button({ label: '도움말', icon: 'i-help', onClick: o.onHelp }));
  if (o.onBackup) etc.push(button({ label: '세이브 백업', icon: 'i-check', onClick: o.onBackup }));
  const etcRow = el('div', 'bha-settings__etc');
  etcRow.append(...etc);
  const etcPanel = panel('기타', etcRow, hintLine('기본값 복원 = 전투 효과·소리·음악 목록(공통). 도움말에서 안내를 다시 볼 수 있다.'));
  const slotPanels: HTMLElement[] = [];
  if (host) {
    const clearBtn = button({ label: '이 슬롯 설정 지우기', icon: 'i-close', variant: 'danger', onClick: () => askClearSlot() });
    clearBtn.dataset.set = 'slot-clear';
    const slotNote = el('p', 'bha-faint');
    paints.push(() => {
      const has = parseSlotSettings(slotSaved) !== null || parseSlotSettings(slot) !== null;
      clearBtn.disabled = !has;
      slotNote.textContent = has ? `${host.label}에만 쓰는 설정이 있다. 지우면 다시 공통 설정을 따른다.` : `${host.label}은 공통 설정을 따른다. 머리의 [이 슬롯]에서 바꾸고 저장하면 이 슬롯에서만 우선한다.`;
    });
    slotPanels.push(panel('슬롯 설정', clearBtn, slotNote));
  }

  const TAB_BODY: Record<SettingsTab, HTMLElement[]> = {
    screen: [...charPanels, ...fsPanels, tamaPanel, sizePanel, keyPanel],
    sound: [soundPanel, ...musicNodes],
    battle: [fxPanel, ctlPanel],
    etc: [info, installPanel, etcPanel, ...slotPanels],
  };

  // ── 머리: [공통]/[이 슬롯] 토글 · [저장] · (레이어면) X ──
  const saveBtn = button({ label: '저장', icon: 'i-check', onClick: () => { doSave(); } });
  saveBtn.classList.add('bha-settings__save');
  saveBtn.dataset.set = 'save';
  const aside: HTMLElement[] = [];
  let scopeBtns: { id: 'common' | 'slot'; b: HTMLButtonElement }[] = [];
  if (host) {
    const seg = el('div', 'bha-seg bha-seg--sm bha-settings__scopes');
    seg.setAttribute('role', 'tablist');
    seg.setAttribute('aria-label', '설정 범위');
    scopeBtns = (['common', 'slot'] as const).map((id) => {
      const b = el('button', 'bha-seg__item');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.scope = id;
      b.onclick = () => {
        scope = id;
        note = '';
        paintAll();
      };
      seg.append(b);
      return { id, b };
    });
    aside.push(seg);
  }
  aside.push(saveBtn);
  if (o.onClose) aside.push(closeX(o.onClose));
  const sub = el('span', '');
  const head = lcdHead({ title: '설정', sub, aside });

  const tabsBox = el('div', 'bha-settings__tabs');
  const grid = el('div', 'bha-settings__grid');
  const pickTab = (id: SettingsTab) => {
    tab = id;
    renderTab();
  };
  const renderTab = () => {
    tabsBox.replaceChildren(categoryTabs(SETTINGS_TABS.map((t) => ({ ...t })), tab, (id) => pickTab(id as SettingsTab), '설정 분류'));
    grid.replaceChildren(...TAB_BODY[tab]);
    grid.dataset.tab = tab;
    grid.scrollTop = 0;
  };

  function paintMeta(): void {
    const dirty = isDirty();
    saveBtn.disabled = !dirty;
    saveBtn.classList.toggle('bha-btn--primary', dirty);
    saveBtn.classList.toggle('is-dirty', dirty);
    for (const { id, b } of scopeBtns) {
      const on = id === scope;
      b.setAttribute('aria-selected', String(on));
      // 체크 아이콘은 늘 두고 안 고른 쪽은 숨김 — 고를 때마다 두 버튼 폭·위치가 바뀌던 문제 (C.182 UI 검수)
      b.replaceChildren(icon('i-check'), id === 'common' ? '공통' : '이 슬롯');
    }
    const where = scope === 'slot' && host ? `${host.label} 설정 — 이 슬롯에서만 우선` : host ? '공통 설정 — 슬롯 설정이 없는 항목에 쓴다' : '공통 설정 — 모든 슬롯에 쓴다';
    sub.textContent = note || (dirty ? `${where} · 저장 안 됨` : where);
  }
  function paintAll(): void {
    for (const p of paints) p();
    paintSize();
    paintMeta();
  }

  function doSave(): void {
    if (!isDirty()) return;
    const tiltChanged = commonSaved.tilt !== common.tilt;
    if (commonDirty()) writeCommon(storage, commonSaved, common);
    if (host && slotDirty()) {
      const s = parseSlotSettings(slot);
      host.write(s);
      setActiveSlotSettings(s);
    }
    if (genderHost && genderDirty()) genderHost.write(gender);
    genderSaved = gender;
    commonSaved = structuredClone(common);
    slotSaved = { ...slot };
    applySettingsNow(storage);
    if (tiltChanged) {
      // 기울기는 켤 때 움직임 허용을 묻는다(아이폰). 못 받으면 꺼진 채로
      void setTiltPref(common.tilt).then((ok) => {
        if (common.tilt && !ok) {
          common.tilt = commonSaved.tilt = false;
          paintAll();
        }
      });
    }
    note = '저장했다.';
    paintAll();
  }
  function discard(): void {
    common = structuredClone(commonSaved);
    slot = { ...slotSaved };
    gender = genderSaved;
    applySettingsNow(storage);
    paintAll();
  }
  let asking = false;
  function requestClose(then: () => void): void {
    if (asking) return;
    if (!isDirty()) return then();
    asking = true;
    confirmDialog({
      title: '바꾼 설정 저장',
      body: '저장하지 않으면 설정을 연 때 값으로 돌아간다.',
      yes: '저장', no: '취소',
      alt: { label: '저장 안 함', onClick: () => { asking = false; discard(); then(); } },
      onYes: () => { asking = false; doSave(); then(); },
      onNo: () => { asking = false; },
    });
  }
  function askClearSlot(): void {
    if (!host) return;
    confirmDialog({
      title: `${host.label} 설정 지우기`,
      body: '이 슬롯에만 쓰던 값을 지우고 다시 공통 설정을 따른다.',
      yes: '지우기', no: '아니오', danger: true,
      onYes: () => {
        host.write(null);
        setActiveSlotSettings(null);
        slot = {};
        slotSaved = {};
        applySettingsNow(storage);
        note = '슬롯 설정을 지웠다. 이제 공통 설정을 따른다.';
        paintAll();
      },
    });
  }

  const page = lcdPage(root, { cls: 'bha-settings-page', cols: 'minmax(0, 1fr)' }, head, [tabsBox, grid], []);
  page.app.dataset.screen = 'settings';
  renderTab();
  paintAll();

  // 화면 크기(키보드 단축키)·다마고치 모드·전체 화면이 밖에서 바뀌어도 문구가 따라간다. C.139 (GDD 88장 6): 이 화면이 끝나면(다음 화면이 그려지면) 한 번에 풀린다.
  // 전체 화면 미지원이면 패널도 구독도 없다
  const signal = screenSignal(root);
  const listen = (type: string, paint: () => void) => window.addEventListener(type, paint, { signal });
  /** 밖(단축키 B·+/−)에서 바뀐 값은 아직 고치지 않은 줄이면 따라간다 */
  const syncOutside = () => {
    const now = readCommonValues(storage);
    for (const k of ['tamago', 'tilt', 'viewScale'] as const) {
      if (common[k] === commonSaved[k]) (common as unknown as Record<string, unknown>)[k] = now[k];
      (commonSaved as unknown as Record<string, unknown>)[k] = now[k];
    }
    paintAll();
  };
  listen(VIEW_SCALE_EVENT, syncOutside);
  listen(TAMAGO_EVENT, syncOutside);
  if (fsPanels.length > 0) listen(FULLSCREEN_EVENT, paintFs);
  if (listRows.length > 0 && typeof setInterval === 'function') {
    // 곡이 저절로 넘어가면 이름·표시를 따라간다 (화면이 끝나면 멈춘다)
    const poll = setInterval(() => { if (nowLine.isConnected) paintMusic(); }, 1000);
    signal.addEventListener('abort', () => clearInterval(poll));
  }
  // 탭 좌우 오가기: ◀▶ (막대에 있을 때는 막대가 먼저 받는다). 확인 창이 떠 있으면 무시
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || asking || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (!page.app.isConnected || getOverlayHost().querySelector('.bha-confirm')) return;
    const at = SETTINGS_TABS.findIndex((t) => t.id === tab);
    const next = SETTINGS_TABS[(at + (e.key === 'ArrowRight' ? 1 : -1) + SETTINGS_TABS.length) % SETTINGS_TABS.length]!;
    e.preventDefault();
    pickTab(next.id);
  }, { signal });
  // 화면으로 열렸을 때 뒤로(◀ 버튼·Esc·폰 뒤로가기): 바꾼 게 있으면 저장 확인 창이 먼저 (설정 화면 안에서 가로챈다 — 앱 뒤로 처리는 그대로)
  if (!o.onClose) {
    const unhook = registerCancelHook((top) => {
      if (!page.app.isConnected) return 'gone';
      if (top || asking || !isDirty()) return false;
      requestClose(() => o.onBack?.());
      return true;
    }, { button: true });
    signal.addEventListener('abort', unhook);
  }

  return {
    requestClose,
    get dirty() { return isDirty(); },
  };
}
