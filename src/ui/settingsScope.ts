// 설정 범위 (GDD 103장 5, C.178): 공통 설정(기기 전체 — 항목마다 localStorage 키) + 슬롯 설정(그 슬롯 세이브의 settings).
// 슬롯 설정은 항목별로 공통보다 우선한다 — 슬롯 설정에 없는 항목은 공통 값. 슬롯에 둘 수 있는 항목은 SLOT_SETTING_KEYS 뿐(기기 화면·설치 같은 것은 공통만).
// 이 파일은 순수 로직 + 지금 열린 슬롯의 값 보관만. 화면은 settingsView.ts, 세이브 필드는 game.ts SaveData.settings.

export interface SlotSettings {
  damageNumbers?: boolean;
  vibration?: boolean;
  shake?: boolean;
  /** 효과음 0~100 (0 = 끔) */
  sfxVolume?: number;
  /** 배경음 0~100 (0 = 끔) */
  bgmVolume?: number;
  keyHints?: boolean;
}

export const SLOT_BOOL_KEYS = ['damageNumbers', 'vibration', 'shake', 'keyHints'] as const satisfies readonly (keyof SlotSettings)[];
export const SLOT_VOLUME_KEYS = ['sfxVolume', 'bgmVolume'] as const satisfies readonly (keyof SlotSettings)[];
export const SLOT_SETTING_KEYS: readonly (keyof SlotSettings)[] = [...SLOT_BOOL_KEYS, ...SLOT_VOLUME_KEYS];

/** 0~100 정수로 (깨진 값은 null) */
export function clampVolume(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** 세이브의 슬롯 설정을 읽는다: 모르는 키·깨진 값은 버리고, 남는 게 없으면 null(= 공통을 따름) */
export function parseSlotSettings(raw: unknown): SlotSettings | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: SlotSettings = {};
  for (const k of SLOT_BOOL_KEYS) if (typeof r[k] === 'boolean') out[k] = r[k];
  for (const k of SLOT_VOLUME_KEYS) {
    const v = clampVolume(r[k]);
    if (v !== null) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ── 지금 열린 슬롯의 설정 (시작 화면·빈 슬롯이면 비어 있음) ──
let active: SlotSettings = {};

export function setActiveSlotSettings(s: SlotSettings | null | undefined): void {
  active = { ...(parseSlotSettings(s) ?? {}) };
}

export function activeSlotSettings(): Readonly<SlotSettings> {
  return active;
}

/** 게임 안에서 연 설정이 슬롯 설정을 읽고 쓰는 곳 (app 이 슬롯을 열 때 건다, 시작 화면에선 null → 설정은 공통만) */
export interface SlotSettingsHost {
  /** 화면 머리 표시용 (예 '슬롯 1') */
  label: string;
  read(): SlotSettings | null;
  /** null = 슬롯 설정 지우기. 세이브에 쓰고 저장까지 한다 */
  write(s: SlotSettings | null): void;
}

let host: SlotSettingsHost | null = null;

export function setSlotSettingsHost(h: SlotSettingsHost | null): void {
  host = h;
  setActiveSlotSettings(h?.read() ?? null);
}

export function slotSettingsHost(): SlotSettingsHost | null {
  return host;
}
