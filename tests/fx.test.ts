// 전투 효과 설정·신호 (Q-2, C.30)
import { describe, expect, it } from 'vitest';
import { CUE_PRIORITY, cueOf, strongestCue, TONES, VIBRATION, MASTER_VOLUME } from '../src/ui/fx';
import { defaultFxSettings, FX_SETTINGS_KEY, loadFxSettings, parseFxSettings, resetFxSettings, saveFxSettings } from '../src/ui/fxSettings';
import type { CombatEvent } from '../src/engine/combat';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe('전투 효과 설정', () => {
  it('기본: 피해 숫자·진동·흔들림 켬, 효과음 끔', () => {
    expect(defaultFxSettings()).toEqual({ damageNumbers: true, vibration: true, sound: false, shake: true });
    expect(parseFxSettings(null)).toEqual(defaultFxSettings());
  });
  it('모션 줄이기면 흔들림 기본 꺼짐, 저장값이 있으면 그것을 따른다', () => {
    expect(defaultFxSettings(true).shake).toBe(false);
    expect(parseFxSettings('{"shake":true}', true).shake).toBe(true);
  });
  it('깨진 JSON·잘못된 타입·모르는 키는 기본값', () => {
    expect(parseFxSettings('{oops')).toEqual(defaultFxSettings());
    expect(parseFxSettings('[1]')).toEqual(defaultFxSettings());
    expect(parseFxSettings('{"sound":"yes","vibration":false,"x":1}')).toEqual({ ...defaultFxSettings(), vibration: false });
  });
  it('별도 키에 저장·불러오기·복원, 저장소가 없어도 죽지 않는다', () => {
    const st = mem();
    saveFxSettings(st, { ...defaultFxSettings(), sound: true });
    expect(st.m.has(FX_SETTINGS_KEY)).toBe(true);
    expect(FX_SETTINGS_KEY).not.toBe('bha-input-settings');
    expect(loadFxSettings(st, false).sound).toBe(true);
    expect(resetFxSettings(st, false)).toEqual(defaultFxSettings());
    expect(loadFxSettings(st, false).sound).toBe(false);
    expect(loadFxSettings(null, false)).toEqual(defaultFxSettings());
    expect(() => saveFxSettings(null, defaultFxSettings())).not.toThrow();
  });
});

describe('효과 신호', () => {
  const block = (chain: number, extra: Partial<Extract<CombatEvent, { kind: 'block' }>> = {}): CombatEvent => ({
    kind: 'block', block: 'skill', traitId: null, role: 'attack', chain, damage: 5, weak: false, heal: 0, guardSeconds: 0, bonus: null, ...extra,
  });
  it('블록·체인·막기·피격·필살기·승패가 신호로 바뀐다', () => {
    expect(cueOf(block(1), 3)).toBe('block');
    expect(cueOf(block(2), 3)).toBe('chain2');
    expect(cueOf(block(3), 3)).toBe('chain3');
    expect(cueOf(block(1, { block: 'special' }), 3)).toBe('special');
    expect(cueOf({ kind: 'stored-use', damage: 1, guardSeconds: 1, charges: 0 }, 3)).toBe('special');
    expect(cueOf({ kind: 'heavy-hit', damage: 9, guarded: true, reflected: 0 }, 3)).toBe('guard');
    expect(cueOf({ kind: 'heavy-hit', damage: 9, guarded: false, reflected: 0 }, 3)).toBe('heavyhit');
    expect(cueOf({ kind: 'enemy-attack', damage: 2, guarded: false }, 3)).toBe('hurt');
    expect(cueOf({ kind: 'heavy-cast', seconds: 3 }, 3)).toBe('cast');
    expect(cueOf({ kind: 'end', status: 'won' }, 3)).toBe('win');
    expect(cueOf({ kind: 'end', status: 'lost' }, 3)).toBe('lose');
    expect(cueOf({ kind: 'shuffle' }, 3)).toBeNull();
  });
  it('한 프레임에는 가장 센 신호 하나', () => {
    expect(strongestCue(['block', 'chain3', 'hurt'])).toBe('chain3');
    expect(strongestCue([])).toBeNull();
  });
  it('모든 신호에 진동 패턴과 효과음이 있고, 블록 사용 진동은 아주 짧다', () => {
    for (const c of CUE_PRIORITY) {
      expect(VIBRATION[c].length).toBeGreaterThan(0);
      expect(TONES[c].length).toBeGreaterThan(0);
    }
    expect(VIBRATION.block[0]).toBeLessThanOrEqual(10);
    expect(MASTER_VOLUME).toBeLessThanOrEqual(0.2);
  });
});
