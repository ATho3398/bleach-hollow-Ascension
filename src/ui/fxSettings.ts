// 전투 효과 설정 (Q-2, C.30): 피해 숫자·진동·효과음·화면 흔들림. localStorage 별도 키에 저장하고 세이브 구조는 건드리지 않는다.
// 순수 로직만 둔다(파싱·기본값·저장). 효과를 실제로 내는 쪽은 fx.ts.
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
  /** Web Audio 합성 효과음 */
  sound: boolean;
  /** 강공격 피격·필살기 때 화면 흔들림 */
  shake: boolean;
}

export const FX_SETTINGS_KEY = 'bha-fx-settings';

export const FX_KEYS = ['damageNumbers', 'vibration', 'sound', 'shake'] as const satisfies readonly (keyof FxSettings)[];

/** 기본값: 효과음만 끔. 모션 줄이기(prefers-reduced-motion) 이면 흔들림도 끈다 */
export function defaultFxSettings(reducedMotion = false): FxSettings {
  return { damageNumbers: true, vibration: true, sound: false, shake: !reducedMotion };
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
  } catch {
    /* 깨진 저장값은 기본값 */
  }
  return base;
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function loadFxSettings(storage?: SettingsStorage | null, reducedMotion = prefersReducedMotion()): FxSettings {
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
