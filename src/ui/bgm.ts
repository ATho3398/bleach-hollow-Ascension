// 배경 음악 재생 (GDD 24-4): 화면이 트랙 키만 알려 주면(setBgm) 파일이 있을 때만 틀고, 없으면 조용히 무음.
// 같은 트랙이면 끊지 않고 이어 재생, 다른 트랙이면 짧게 페이드 아웃 → 페이드 인. 브라우저 자동재생 제한 때문에 첫 터치(키 입력) 뒤에 소리가 난다.
// 설정(켬/끔·음량)은 효과음(fxSettings)과 별도 키 bha-bgm-settings 에 이 기기만 저장한다 — 세이브 구조와 무관.
import { BGM_FILES, PLAYLIST, findBgmFile, type BgmTrack, type PlaylistTrack } from '../data/audio/bgm';
import { showToast } from './bha/nest';
import type { SettingsStorage } from './fxSettings';
import { activeSlotSettings, clampVolume, type SlotSettings } from './settingsScope';

export const BGM_SETTINGS_KEY = 'bha-bgm-settings';
/** 페이드 길이(ms) */
export const BGM_FADE_MS = 600;
const STEP_MS = 50;

export interface BgmSettings {
  on: boolean;
  /** 0~1 */
  volume: number;
  /** 플레이리스트 지금 곡 id (GDD 97장, 없으면 첫 곡부터) */
  track: string | null;
  /** 현재 곡만 반복 */
  repeat: boolean;
  /** 자동 넘김에서 건너뛸 곡 id */
  excluded: string[];
}

/** 기본: 켬, 음량 50% (첫 터치 뒤 재생) */
export function defaultBgmSettings(): BgmSettings {
  return { on: true, volume: 0.5, track: null, repeat: false, excluded: [] };
}

export function parseBgmSettings(text: string | null | undefined): BgmSettings {
  const base = defaultBgmSettings();
  if (!text) return base;
  try {
    const r = JSON.parse(text) as Record<string, unknown>;
    if (typeof r?.on === 'boolean') base.on = r.on;
    if (typeof r?.volume === 'number' && Number.isFinite(r.volume)) base.volume = Math.max(0, Math.min(1, r.volume));
    if (typeof r?.track === 'string') base.track = r.track;
    if (typeof r?.repeat === 'boolean') base.repeat = r.repeat;
    if (Array.isArray(r?.excluded)) base.excluded = [...new Set(r.excluded.filter((x): x is string => typeof x === 'string'))];
  } catch {
    /* 깨진 값은 기본값 */
  }
  return base;
}

export function loadBgmSettings(storage?: SettingsStorage | null): BgmSettings {
  try {
    return parseBgmSettings(storage?.getItem(BGM_SETTINGS_KEY));
  } catch {
    return defaultBgmSettings();
  }
}

/** 설정 화면 막대 값 0~100 (GDD 103장 3, C.178): 끔이면 0 */
export function bgmBarOf(s: Pick<BgmSettings, 'on' | 'volume'>): number {
  return s.on ? Math.round(s.volume * 100) : 0;
}

/** 막대 값을 켬/음량으로 (0 = 끔 — 음량은 그대로 둬서 다시 올릴 때 예전 값 근처에서 시작하지 않아도 된다) */
export function withBgmBar(s: BgmSettings, bar: number): BgmSettings {
  const v = clampVolume(bar) ?? 0;
  return v === 0 ? { ...s, on: false } : { ...s, on: true, volume: v / 100 };
}

/** 공통 값 위에 슬롯 설정(배경음 막대)을 덮은 실제 값 */
export function withSlotBgm(common: BgmSettings, slot: Readonly<SlotSettings> = activeSlotSettings()): BgmSettings {
  return slot.bgmVolume === undefined ? common : withBgmBar(common, slot.bgmVolume);
}

export function saveBgmSettings(storage: SettingsStorage | null | undefined, s: BgmSettings): BgmSettings {
  const clean = parseBgmSettings(JSON.stringify(s));
  try {
    storage?.setItem(BGM_SETTINGS_KEY, JSON.stringify(clean));
  } catch {
    /* 저장소를 못 쓰면 이번 실행에서만 */
  }
  return clean;
}

/** 재생기가 쓰는 오디오 요소 모양 (HTMLAudioElement 의 일부) — 테스트는 가짜를 넣는다 */
export interface AudioLike {
  src: string;
  loop: boolean;
  volume: number;
  play(): Promise<void> | void;
  pause(): void;
  /** 곡이 끝났을 때 (loop 가 꺼진 곡만 울린다) — 플레이리스트가 다음 곡으로 넘길 때 쓴다 */
  onended?: (() => void) | null;
  /** 읽기·재생 오류 (망 끊김·서비스 워커 응답 문제 등) — 지금 곡을 다시 잇거나 다음 곡으로 넘긴다 (C.196) */
  onerror?: (() => void) | null;
  /** 지금 재생 위치(초) — 오류 뒤 같은 곳부터 다시 잇는다 */
  currentTime?: number;
  /** 버린 요소의 파일 연결을 끊어 메모리·재생기 자리를 돌려준다 (HTMLMediaElement) */
  removeAttribute?(name: string): void;
  load?(): void;
}

interface Voice {
  /** 화면 트랙 키 또는 플레이리스트 곡 id */
  track: string;
  audio: AudioLike;
  /** 지금 음량 비율 0~1 (설정 음량에 곱한다)과 목표 */
  level: number;
  target: number;
  /** 이 곡에서 연달아 난 오류 수 (다시 잇기 한도) */
  errors: number;
}

/** 한 곡에서 오류가 나면 같은 자리부터 다시 잇는 최대 횟수 — 넘으면 다음 곡 (C.196) */
export const BGM_RETRY_MAX = 2;

export interface BgmPlayerOptions {
  files?: readonly string[];
  /** 파일 경로 앞에 붙일 기준 (기본 './' — 빌드가 상대 경로) */
  base?: string;
  makeAudio?: (src: string) => AudioLike;
  settings?: BgmSettings;
  /** 페이드 타이머를 직접 돌릴지 (테스트는 false 로 두고 step 을 부른다) */
  autoTick?: boolean;
  /** 플레이리스트 (기본 없음 = 화면별 트랙 방식. 앱은 PLAYLIST 를 넣는다, GDD 97장) */
  playlist?: readonly PlaylistTrack[];
  /** 설정이 바뀔 때(곡 자동 넘김 포함) 저장하라고 알린다 */
  persist?: (s: BgmSettings) => void;
  /** 소리 낼 곡이 바뀔 때 (알림 띠용) */
  onTrack?: (t: PlaylistTrack) => void;
}

export interface BgmPlayer {
  /** 이 화면의 트랙 (null = 음악 없음). 같은 트랙이면 그대로 이어 재생 */
  play(track: BgmTrack | null): void;
  /** 원하는 트랙 (파일이 없어 무음이어도 기억한다) */
  readonly wanted: BgmTrack | null;
  /** 실제로 소리를 내는 트랙 (파일이 있고 켜져 있을 때) */
  readonly current: string | null;
  setSettings(s: BgmSettings): void;
  readonly settings: BgmSettings;
  /** 첫 터치 뒤 재생을 허용한다 (자동재생 제한) */
  unlock(): void;
  readonly unlocked: boolean;
  /** 페이드 진행 (ms) */
  step(ms: number): void;
  /** 플레이리스트 (비어 있으면 화면별 트랙 방식) */
  readonly playlist: readonly PlaylistTrack[];
  /** 지금 곡 (플레이리스트 방식, 재생할 곡이 없으면 null) */
  readonly currentTrack: PlaylistTrack | null;
  /** 이 곡으로 바로 바꿈 (제외 곡도 재생) */
  playTrack(id: string): void;
  /** 다음 곡 (제외 곡은 건너뜀) */
  next(): void;
  /** 제외 켬/끔. 지금 곡을 제외하면 다음 곡으로 넘어간다 */
  toggleExcluded(id: string): void;
  /** 현재 곡만 반복 켬/끔 */
  toggleRepeat(): void;
  /** 지금 소리를 내는 요소 수 (페이드 중이면 2) */
  readonly voices: number;
  /** 앱 이탈 동안 멈춤 (GDD 119장 2): 켜면 모든 요소를 멈추고, 끄면 울려야 할 요소만 다시 튼다(설정은 안 건드림) */
  setSuspended(on: boolean): void;
  readonly suspended: boolean;
}

export function createBgmPlayer(opt: BgmPlayerOptions = {}): BgmPlayer {
  const files = opt.files ?? BGM_FILES;
  const base = opt.base ?? './';
  const make = opt.makeAudio ?? ((src: string) => new Audio(src) as AudioLike);
  const playlist = opt.playlist ?? [];
  let settings = opt.settings ?? defaultBgmSettings();
  let unlocked = false;
  let suspended = false;
  let wanted: BgmTrack | null = null;
  let voices: Voice[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  // ── 플레이리스트 (GDD 97장) ──
  const entry = (id: string | null) => playlist.find((t) => t.id === id) ?? null;
  /** from 다음부터 한 바퀴 돌며 제외 아닌 첫 곡 (자기 자신이 마지막 후보). 없으면 null = 전부 제외 */
  const nextAfter = (from: string | null): string | null => {
    if (playlist.length === 0) return null;
    const at = playlist.findIndex((t) => t.id === from);
    for (let k = 1; k <= playlist.length; k++) {
      const t = playlist[(at + k + playlist.length) % playlist.length]!;
      if (!settings.excluded.includes(t.id)) return t.id;
    }
    return null;
  };
  /** 저장된 지금 곡이 목록에 없거나 제외돼 있으면 다음 후보로 (처음 실행은 첫 곡) */
  const normalize = () => {
    if (playlist.length === 0) return;
    const cur = entry(settings.track);
    if (cur && !settings.excluded.includes(cur.id)) return;
    settings = { ...settings, track: nextAfter(cur ? cur.id : playlist[playlist.length - 1]!.id) };
  };
  normalize();
  const change = (patch: Partial<BgmSettings>, announce = false) => {
    const before = settings.track;
    settings = { ...settings, ...patch };
    opt.persist?.(settings);
    sync();
    const t = entry(settings.track);
    if (announce && t && (t.id !== before || patch.track !== undefined)) opt.onTrack?.(t);
  };
  /** 곡이 끝났다 → 다음 곡 (한 곡뿐이면 그 곡을 처음부터 다시) */
  const advance = () => {
    const id = nextAfter(settings.track);
    if (id === settings.track) {
      for (const v of voices) if (v.track === id) v.target = 0, v.level = 0;
      step(0); // 끝난 요소를 버리고 새로 만든다
    }
    change({ track: id }, true);
  };

  const start = (a: AudioLike) => {
    if (!unlocked || suspended) return;
    try {
      const p = a.play();
      // 막히면 다음 터치에 다시. 단 pause() 가 play() 를 끊은 것(AbortError — 페이드로 버린 곡)은 막힌 게 아니다 (C.196)
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch((e: unknown) => { if ((e as { name?: string } | null)?.name !== 'AbortError') unlocked = false; });
    } catch {
      unlocked = false;
    }
  };
  /** 버린 요소: 멈추고 파일 연결을 끊는다 (C.196 — 다 쓴 요소가 쌓여 몇 곡 뒤 재생기가 모자라 지금 곡이 끊기지 않게) */
  const release = (a: AudioLike) => {
    a.onended = null;
    a.onerror = null;
    try { a.pause(); } catch { /* 무시 */ }
    try { a.removeAttribute?.('src'); a.load?.(); } catch { /* 무시 */ }
  };
  /** 지금 곡 요소를 새로 만들어 at 초부터 다시 잇는다 (오류 복구) */
  const respawn = (v: Voice, at: number) => {
    const t = entry(v.track);
    if (!t) return;
    let audio: AudioLike;
    try {
      audio = make(`${base}${t.file}`);
    } catch {
      return;
    }
    release(v.audio);
    audio.loop = settings.repeat;
    if (at > 0) try { audio.currentTime = at; } catch { /* 위치를 못 옮기면 처음부터 */ }
    v.audio = audio;
    hook(v);
    apply(v);
    start(audio);
  };
  /** 플레이리스트 요소에 끝·오류 처리를 단다 */
  const hook = (v: Voice) => {
    const audio = v.audio;
    audio.onended = () => { if (v.audio === audio && v.target > 0 && !audio.loop) { v.errors = 0; advance(); } };
    audio.onerror = () => {
      if (v.audio !== audio || v.target === 0) return;
      v.errors++;
      if (v.errors > BGM_RETRY_MAX) { v.errors = 0; v.target = 0; v.level = 0; step(0); advance(); return; }
      respawn(v, typeof audio.currentTime === 'number' && Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    };
  };
  const apply = (v: Voice) => {
    v.audio.volume = Math.max(0, Math.min(1, v.level * settings.volume));
  };
  const ensureTimer = () => {
    if (opt.autoTick === false || timer !== undefined || typeof setInterval !== 'function') return;
    timer = setInterval(() => {
      step(STEP_MS);
      if (voices.every((v) => v.level === v.target)) {
        clearInterval(timer);
        timer = undefined;
      }
    }, STEP_MS);
  };
  function step(ms: number): void {
    const d = ms / BGM_FADE_MS;
    for (const v of voices) {
      v.level = v.level < v.target ? Math.min(v.target, v.level + d) : Math.max(v.target, v.level - d);
      apply(v);
    }
    // 다 꺼진 요소는 멈추고 버린다
    voices = voices.filter((v) => {
      if (v.target === 0 && v.level === 0) {
        release(v.audio);
        return false;
      }
      return true;
    });
  }
  function sync(): void {
    let key: string | null;
    let file: string | null;
    if (playlist.length > 0) {
      // 플레이리스트가 있으면 화면별 트랙 키는 쓰지 않는다 — 화면이 바뀌어도 곡이 이어진다
      const t = settings.on ? entry(settings.track) : null;
      key = t ? t.id : null;
      file = t ? t.file : null;
    } else {
      key = settings.on ? wanted : null;
      file = key ? findBgmFile(key as BgmTrack, files) : null;
    }
    // 같은 트랙이 울리고 있거나 막 꺼지는 중이면 끊지 않고 그대로 살린다 (음량만 새로)
    const same = file ? voices.find((v) => v.track === key) : undefined;
    for (const v of voices) v.target = v === same ? 1 : 0;
    if (same) {
      if (playlist.length > 0) same.audio.loop = settings.repeat;
      apply(same);
      ensureTimer();
      return;
    }
    if (key && file) {
      let audio: AudioLike;
      try {
        audio = make(`${base}${file}`);
      } catch {
        return; // 오디오를 못 만드는 환경은 무음
      }
      audio.loop = playlist.length > 0 ? settings.repeat : true;
      const v: Voice = { track: key, audio, level: 0, target: 1, errors: 0 };
      if (playlist.length > 0) hook(v);
      apply(v);
      voices.push(v);
      start(audio);
    }
    ensureTimer();
  }

  if (playlist.length > 0) sync(); // 플레이리스트는 화면이 알리지 않아도 바로 곡을 고른다 (소리는 첫 터치 뒤)

  return {
    play(track) {
      wanted = track;
      sync();
    },
    get wanted() { return wanted; },
    get current() { return voices.find((v) => v.target > 0)?.track ?? null; },
    setSettings(s) {
      settings = parseBgmSettings(JSON.stringify(s));
      normalize();
      sync();
    },
    get settings() { return settings; },
    get playlist() { return playlist; },
    get currentTrack() { return entry(settings.track); },
    playTrack(id) {
      if (!entry(id)) return;
      const again = id === settings.track && voices.every((v) => v.track !== id || v.target === 0);
      change({ track: id }, again || id !== settings.track);
    },
    next() {
      const id = nextAfter(settings.track);
      if (id === settings.track) return; // 돌아갈 다른 곡이 없다
      change({ track: id }, true);
    },
    toggleExcluded(id) {
      if (!entry(id)) return;
      const excluded = settings.excluded.includes(id) ? settings.excluded.filter((x) => x !== id) : [...settings.excluded, id];
      const was = settings.track;
      settings = { ...settings, excluded };
      if (id === was && excluded.includes(id)) {
        change({ excluded, track: nextAfter(was) === was ? null : nextAfter(was) }, true); // 듣던 곡을 제외하면 다음 곡으로 (전부 제외면 무음)
      } else {
        // 전부 제외였다가 풀면 그 곡을 재생
        change({ excluded, track: settings.track ?? (excluded.includes(id) ? null : id) }, settings.track === null);
      }
    },
    toggleRepeat() {
      change({ repeat: !settings.repeat });
    },
    unlock() {
      if (unlocked) return;
      unlocked = true;
      for (const v of voices) if (v.target > 0) start(v.audio);
    },
    get unlocked() { return unlocked; },
    step,
    get voices() { return voices.length; },
    setSuspended(on) {
      if (on === suspended) return;
      suspended = on;
      if (on) {
        for (const v of voices) try { v.audio.pause(); } catch { /* 무시 */ }
      } else {
        for (const v of voices) if (v.target > 0) start(v.audio);
      }
    },
    get suspended() { return suspended; },
  };
}

// ── 앱이 쓰는 하나뿐인 재생기 ──
let shared: BgmPlayer | null = null;

function storageOrNull(): SettingsStorage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** 앱 재생기 (처음 부를 때 만들고 첫 터치 훅을 건다) */
export function bgm(): BgmPlayer {
  if (shared) return shared;
  const store = storageOrNull();
  const p = createBgmPlayer({
    settings: withSlotBgm(loadBgmSettings(store)),
    playlist: PLAYLIST,
    // 곡 넘김·반복·제외만 공통 저장에 쓴다 — 켬/음량은 설정 화면 [저장]만 (슬롯 설정·미리 듣기 값이 공통에 새지 않게, C.178)
    persist: (s) => { const c = loadBgmSettings(store); saveBgmSettings(store, { ...c, track: s.track, repeat: s.repeat, excluded: s.excluded }); },
    onTrack: (t) => { try { showToast({ eyebrow: '배경음', title: t.name }); } catch { /* 알림은 부가 */ } },
  });
  shared = p;
  if (typeof window !== 'undefined') {
    // C.196: 훅을 떼지 않는다 — 곡 넘김 때 재생이 한 번 막히면(unlocked = false) 떼어 둔 훅 때문에 다시 켤 길이 없어 그 뒤로 계속 무음이었다
    const open = () => p.unlock();
    for (const t of ['pointerdown', 'touchend', 'keydown', 'click'] as const) window.addEventListener(t, open, true);
  }
  return p;
}

/** 화면이 부르는 한 줄: 이 화면의 트랙 */
export function setBgm(track: BgmTrack | null): void {
  try {
    bgm().play(track);
  } catch {
    /* 음악은 부가 기능 — 어떤 경우에도 화면을 막지 않는다 */
  }
}
