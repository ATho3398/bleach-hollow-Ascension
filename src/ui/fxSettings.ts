// 전투 효과 설정 (Q-2, C.30): 피해 숫자·진동·효과음·화면 흔들림. localStorage 별도 키에 저장하고 세이브 구조는 건드리지 않는다.
// 순수 로직만 둔다(파싱·기본값·저장). 효과를 실제로 내는 쪽은 fx.ts.
// C.178 (GDD 103장 3): 효과음은 켬/끔 대신 음량 막대 sfxVolume 0~100(0 = 끔). sound 는 sfxVolume > 0 을 따라가는 읽기용 값.
// loadFxSettings 는 지금 열린 슬롯의 슬롯 설정을 항목별로 덮은 '실제 값', loadCommonFxSettings 는 공통 값(설정 화면용).
import { activeSlotSettings, clampVolume } from './settingsScope';
/** 설정을 읽고 쓰는 저장소 (localStorage 모양). 막혀 있으면 null/예외라 호출하는 쪽이 대비한다 */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface FxSettings {
  /** 적·나에게 들어간 피해 숫자 팝업 */
  damageNumbers: boolean;
  /** navigator.vibrate */
  vibration: boolean;
  /** Web Audio 합성 효과음 (sfxVolume > 0) */
  sound: boolean;
  /** 효과음 음량 0~100 (0 = 끔, C.178) */
  sfxVolume: number;
  /** 강공격 피격·필살기 때 화면 흔들림 */
  shake: boolean;
}

export const FX_SETTINGS_KEY = 'bha-fx-settings';

export const FX_KEYS = ['damageNumbers', 'vibration', 'sound', 'shake'] as const satisfies readonly (keyof FxSettings)[];

/** 옛 켬/끔 효과음(sound: true)을 막대로 옮길 때의 값 = 예전 소리 크기 */
export const SFX_LEGACY_VOLUME = 50;

/** 기본값: 효과음만 끔(0). 모션 줄이기(prefers-reduced-motion) 이면 흔들림도 끈다 */
export function defaultFxSettings(reducedMotion = false): FxSettings {
  return { damageNumbers: true, vibration: true, sound: false, sfxVolume: 0, shake: !reducedMotion };
}

/** 깨진 값·모르는 키는 기본값으로 */
export function parseFxSettings(text: string | null | undefined, reducedMotion = false): FxSettings {
  const base = defaultFxSettings(reducedMotion);
  if (!text) return base;
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) return base;
    const r = raw as Record<string, unknown>;
    for (const k of FX_KEYS) if (typeof r[k] === 'boolean') base[k] = r[k];
    const v = clampVolume(r.sfxVolume);
    // 옛 값(sound 만) → 막대로. 둘이 어긋나면(sound 만 바꾼 쪽) sound 를 따른다
    base.sfxVolume = v === null || base.sound !== v > 0 ? (base.sound ? (v || SFX_LEGACY_VOLUME) : 0) : v;
  } catch {
    /* 깨진 저장값은 기본값 */
  }
  base.sound = base.sfxVolume > 0;
  return base;
}

/** 공통 값 위에 슬롯 설정을 항목별로 덮는다 */
export function withSlotFx(common: FxSettings, slot = activeSlotSettings()): FxSettings {
  const out = { ...common };
  if (slot.damageNumbers !== undefined) out.damageNumbers = slot.damageNumbers;
  if (slot.vibration !== undefined) out.vibration = slot.vibration;
  if (slot.shake !== undefined) out.shake = slot.shake;
  if (slot.sfxVolume !== undefined) out.sfxVolume = slot.sfxVolume;
  out.sound = out.sfxVolume > 0;
  return out;
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 실제로 쓰는 값 (지금 슬롯 설정이 우선) */
export function loadFxSettings(storage?: SettingsStorage | null, reducedMotion = prefersReducedMotion()): FxSettings {
  return withSlotFx(loadCommonFxSettings(storage, reducedMotion));
}

/** 공통 값 (기기 전체) */
export function loadCommonFxSettings(storage?: SettingsStorage | null, reducedMotion = prefersReducedMotion()): FxSettings {
  try {
    return parseFxSettings(storage?.getItem(FX_SETTINGS_KEY), reducedMotion);
  } catch {
    return defaultFxSettings(reducedMotion);
  }
}

export function saveFxSettings(storage: SettingsStorage | null | undefined, s: FxSettings): FxSettings {
  const clean = parseFxSettings(JSON.stringify(s));
  try {
    storage?.setItem(FX_SETTINGS_KEY, JSON.stringify(clean));
  } catch {
    /* 저장소를 못 쓰면 이번 실행에서만 적용 */
  }
  return clean;
}

export function resetFxSettings(storage?: SettingsStorage | null, reducedMotion = prefersReducedMotion()): FxSettings {
  try {
    storage?.removeItem?.(FX_SETTINGS_KEY);
  } catch {
    /* 무시 */
  }
  return defaultFxSettings(reducedMotion);
}

/** 움직임 줄이기 표시 (GDD 18-11): 기기의 동작 줄이기 또는 설정의 화면 흔들림 끔이면 html[data-calm] 을 켠다. 캐릭터 둥실·날갯짓 같은 반복 움직임이 멈추고 높이만 남는다 */
export function applyCalmMode(storage?: SettingsStorage | null): void {
  try {
    if (typeof document === 'undefined') return;
    let store = storage;
    if (store === undefined) {
      try { store = localStorage; } catch { store = null; }
    }
    const calm = prefersReducedMotion() || !loadFxSettings(store).shake;
    document.documentElement.toggleAttribute('data-calm', calm);
  } catch {
    /* 표시 전용 */
  }
}
