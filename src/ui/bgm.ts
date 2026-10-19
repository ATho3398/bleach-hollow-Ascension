// 배경 음악 재생 (GDD 24-4): 화면이 트랙 키만 알려 주면(setBgm) 파일이 있을 때만 틀고, 없으면 조용히 무음.
// 같은 트랙이면 끊지 않고 이어 재생, 다른 트랙이면 짧게 페이드 아웃 → 페이드 인. 브라우저 자동재생 제한 때문에 첫 터치(키 입력) 뒤에 소리가 난다.
// 설정(켬/끔·음량)은 효과음(fxSettings)과 별도 키 bha-bgm-settings 에 이 기기만 저장한다 — 세이브 구조와 무관.
import { BGM_FILES, findBgmFile, type BgmTrack } from '../data/audio/bgm';
import type { SettingsStorage } from './fxSettings';

export const BGM_SETTINGS_KEY = 'bha-bgm-settings';
/** 음량 선택지 (설정 화면 버튼) */
export const BGM_VOLUMES = [0.25, 0.5, 0.75, 1] as const;
/** 페이드 길이(ms) */
export const BGM_FADE_MS = 600;
const STEP_MS = 50;

export interface BgmSettings {
  on: boolean;
  /** 0~1 */
  volume: number;
}

/** 기본: 켬, 음량 50% (첫 터치 뒤 재생) */
export function defaultBgmSettings(): BgmSettings {
  return { on: true, volume: 0.5 };
}

export function parseBgmSettings(text: string | null | undefined): BgmSettings {
  const base = defaultBgmSettings();
  if (!text) return base;
  try {
    const r = JSON.parse(text) as Record<string, unknown>;
    if (typeof r?.on === 'boolean') base.on = r.on;
    if (typeof r?.volume === 'number' && Number.isFinite(r.volume)) base.volume = Math.max(0, Math.min(1, r.volume));
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
}

interface Voice {
  track: BgmTrack;
  audio: AudioLike;
  /** 지금 음량 비율 0~1 (설정 음량에 곱한다)과 목표 */
  level: number;
  target: number;
}

export interface BgmPlayerOptions {
  files?: readonly string[];
  /** 파일 경로 앞에 붙일 기준 (기본 './' — 빌드가 상대 경로) */
  base?: string;
  makeAudio?: (src: string) => AudioLike;
  settings?: BgmSettings;
  /** 페이드 타이머를 직접 돌릴지 (테스트는 false 로 두고 step 을 부른다) */
  autoTick?: boolean;
}

export interface BgmPlayer {
  /** 이 화면의 트랙 (null = 음악 없음). 같은 트랙이면 그대로 이어 재생 */
  play(track: BgmTrack | null): void;
  /** 원하는 트랙 (파일이 없어 무음이어도 기억한다) */
  readonly wanted: BgmTrack | null;
  /** 실제로 소리를 내는 트랙 (파일이 있고 켜져 있을 때) */
  readonly current: BgmTrack | null;
  setSettings(s: BgmSettings): void;
  readonly settings: BgmSettings;
  /** 첫 터치 뒤 재생을 허용한다 (자동재생 제한) */
  unlock(): void;
  readonly unlocked: boolean;
  /** 페이드 진행 (ms) */
  step(ms: number): void;
  /** 지금 소리를 내는 요소 수 (페이드 중이면 2) */
  readonly voices: number;
}

export function createBgmPlayer(opt: BgmPlayerOptions = {}): BgmPlayer {
  const files = opt.files ?? BGM_FILES;
  const base = opt.base ?? './';
  const make = opt.makeAudio ?? ((src: string) => new Audio(src) as AudioLike);
  let settings = opt.settings ?? defaultBgmSettings();
  let unlocked = false;
  let wanted: BgmTrack | null = null;
  let voices: Voice[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  const start = (a: AudioLike) => {
    if (!unlocked) return;
    try {
      const p = a.play();
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => { unlocked = false; }); // 막히면 다음 터치에 다시
    } catch {
      unlocked = false;
    }
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
        try { v.audio.pause(); } catch { /* 무시 */ }
        return false;
      }
      return true;
    });
  }
  const sync = () => {
    const track = settings.on ? wanted : null;
    const file = track ? findBgmFile(track, files) : null;
    // 같은 트랙이 울리고 있거나 막 꺼지는 중이면 끊지 않고 그대로 살린다 (음량만 새로)
    const same = file ? voices.find((v) => v.track === track) : undefined;
    for (const v of voices) v.target = v === same ? 1 : 0;
    if (same) {
      apply(same);
      ensureTimer();
      return;
    }
    if (track && file) {
      let audio: AudioLike;
      try {
        audio = make(`${base}${file}`);
      } catch {
        return; // 오디오를 못 만드는 환경은 무음
      }
      audio.loop = true;
      const v: Voice = { track, audio, level: 0, target: 1 };
      apply(v);
      voices.push(v);
      start(audio);
    }
    ensureTimer();
  };

  return {
    play(track) {
      wanted = track;
      sync();
    },
    get wanted() { return wanted; },
    get current() { return voices.find((v) => v.target > 0)?.track ?? null; },
    setSettings(s) {
      settings = parseBgmSettings(JSON.stringify(s));
      sync();
    },
    get settings() { return settings; },
    unlock() {
      if (unlocked) return;
      unlocked = true;
      for (const v of voices) if (v.target > 0) start(v.audio);
    },
    get unlocked() { return unlocked; },
    step,
    get voices() { return voices.length; },
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
  const p = createBgmPlayer({ settings: loadBgmSettings(storageOrNull()) });
  shared = p;
  if (typeof window !== 'undefined') {
    const open = () => {
      p.unlock();
      if (p.unlocked) for (const t of ['pointerdown', 'touchend', 'keydown', 'click'] as const) window.removeEventListener(t, open, true);
    };
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
