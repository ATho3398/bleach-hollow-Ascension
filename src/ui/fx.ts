// 전투 효과 (Q-2, C.30): 사건 → 신호(cue) → 진동·효과음. 엔진·수치와 무관한 화면 효과다.
// 한 프레임에 신호가 여러 개 나와도 가장 센 것 하나만 낸다(진동은 새 패턴이 앞 패턴을 끊고, 효과음이 겹치면 시끄럽다).
import type { CombatEvent } from '../engine/combat';
import type { FxSettings } from './fxSettings';

export type FxCue = 'block' | 'chain2' | 'chain3' | 'guard' | 'hurt' | 'cast' | 'heavyhit' | 'special' | 'win' | 'lose';

/** 센 순서 (뒤로 갈수록 우선) */
export const CUE_PRIORITY: readonly FxCue[] = ['block', 'chain2', 'hurt', 'cast', 'guard', 'chain3', 'heavyhit', 'special', 'lose', 'win'];

/** 사건 하나 → 신호. 효과가 없는 사건은 null. top = 체인 최대 단계 */
export function cueOf(e: CombatEvent, top: number): FxCue | null {
  switch (e.kind) {
    case 'block':
      if (e.block === 'combo') return 'special';
      if (e.chain >= top && top > 2) return 'chain3';
      return e.chain > 1 ? 'chain2' : 'block';
    case 'liberate':
      return 'special';
    case 'combo':
      return 'chain3';
    case 'enemy-attack':
      return e.guarded ? 'guard' : e.damage > 0 ? 'hurt' : null;
    case 'counter':
      return e.guarded ? 'guard' : 'hurt';
    case 'heavy-cast':
      return 'cast';
    case 'heavy-hit':
      return e.guarded ? 'guard' : 'heavyhit';
    case 'end':
      return e.status === 'won' ? 'win' : e.status === 'lost' ? 'lose' : null;
    default:
      return null;
  }
}

/** 신호 목록에서 가장 센 것 */
export function strongestCue(cues: readonly FxCue[]): FxCue | null {
  let best: FxCue | null = null;
  let rank = -1;
  for (const c of cues) {
    const r = CUE_PRIORITY.indexOf(c);
    if (r > rank) {
      rank = r;
      best = c;
    }
  }
  return best;
}

/** 진동 패턴(ms): 진동/쉼 번갈아. 블록 사용은 아주 짧게 */
export const VIBRATION: Record<FxCue, number[]> = {
  block: [8],
  chain2: [12, 30, 12],
  chain3: [14, 24, 14, 24, 26],
  guard: [24],
  hurt: [40],
  cast: [18, 50, 18],
  heavyhit: [70, 40, 70],
  special: [30, 30, 30, 30, 60],
  win: [20, 50, 20, 50, 80],
  lose: [140],
};

export interface Tone {
  /** Hz (시작) */
  f: number;
  /** 끝 Hz (없으면 그대로) */
  to?: number;
  /** 시작 시각(초, 신호 시작 기준) */
  at: number;
  /** 길이(초) */
  dur: number;
  type: OscillatorType;
  /** 0~1 상대 음량 */
  vol: number;
}

/** 합성 효과음: 짧은 톤 몇 개. 전체 음량은 MASTER_VOLUME 으로 낮춘다 */
export const TONES: Record<FxCue, Tone[]> = {
  block: [{ f: 520, to: 420, at: 0, dur: 0.05, type: 'square', vol: 0.5 }],
  chain2: [{ f: 520, at: 0, dur: 0.06, type: 'square', vol: 0.5 }, { f: 780, at: 0.06, dur: 0.08, type: 'square', vol: 0.55 }],
  chain3: [
    { f: 520, at: 0, dur: 0.06, type: 'square', vol: 0.5 }, { f: 780, at: 0.06, dur: 0.06, type: 'square', vol: 0.55 },
    { f: 1040, at: 0.12, dur: 0.12, type: 'square', vol: 0.6 },
  ],
  guard: [{ f: 880, to: 1320, at: 0, dur: 0.09, type: 'triangle', vol: 0.7 }],
  hurt: [{ f: 180, to: 90, at: 0, dur: 0.12, type: 'sawtooth', vol: 0.6 }],
  cast: [{ f: 300, at: 0, dur: 0.08, type: 'square', vol: 0.45 }, { f: 300, at: 0.14, dur: 0.08, type: 'square', vol: 0.45 }],
  heavyhit: [{ f: 140, to: 50, at: 0, dur: 0.25, type: 'sawtooth', vol: 0.8 }],
  special: [
    { f: 392, at: 0, dur: 0.07, type: 'triangle', vol: 0.6 }, { f: 587, at: 0.07, dur: 0.07, type: 'triangle', vol: 0.6 },
    { f: 784, at: 0.14, dur: 0.07, type: 'triangle', vol: 0.65 }, { f: 1175, at: 0.21, dur: 0.18, type: 'triangle', vol: 0.7 },
  ],
  win: [
    { f: 523, at: 0, dur: 0.1, type: 'triangle', vol: 0.6 }, { f: 659, at: 0.1, dur: 0.1, type: 'triangle', vol: 0.6 },
    { f: 784, at: 0.2, dur: 0.1, type: 'triangle', vol: 0.6 }, { f: 1047, at: 0.3, dur: 0.24, type: 'triangle', vol: 0.65 },
  ],
  lose: [{ f: 330, at: 0, dur: 0.14, type: 'triangle', vol: 0.55 }, { f: 262, at: 0.14, dur: 0.14, type: 'triangle', vol: 0.55 }, { f: 196, at: 0.28, dur: 0.3, type: 'triangle', vol: 0.55 }],
};

/** 전체 음량(0~1). 낮게 */
export const MASTER_VOLUME = 0.12;

let ctx: AudioContext | null = null;
let unlocked = false;
let unlockHooked = false;

type AudioCtor = typeof AudioContext;

/** 첫 사용자 터치·키 입력 뒤에만 AudioContext 를 만든다 (브라우저 자동재생 정책). 여러 번 불러도 한 번만 건다 */
export function hookAudioUnlock(): void {
  if (unlockHooked || typeof window === 'undefined') return;
  unlockHooked = true;
  const open = () => {
    unlocked = true;
    for (const t of ['pointerdown', 'touchend', 'keydown', 'click'] as const) window.removeEventListener(t, open, true);
    try {
      const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
      if (Ctor && !ctx) ctx = new Ctor();
      void ctx?.resume();
    } catch {
      ctx = null;
    }
  };
  for (const t of ['pointerdown', 'touchend', 'keydown', 'click'] as const) window.addEventListener(t, open, true);
}

function playTones(cue: FxCue): void {
  if (!unlocked || !ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + 0.005;
    for (const tn of TONES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tn.type;
      const start = t0 + tn.at;
      osc.frequency.setValueAtTime(tn.f, start);
      if (tn.to) osc.frequency.exponentialRampToValueAtTime(tn.to, start + tn.dur);
      const peak = MASTER_VOLUME * tn.vol;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tn.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + tn.dur + 0.02);
    }
  } catch {
    /* 소리가 안 나도 게임은 계속 */
  }
}

function vibrate(cue: FxCue): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(VIBRATION[cue]);
  } catch {
    /* 미지원(iOS 등)·차단: 조용히 무시 */
  }
}

/** 설정에 따라 진동·효과음을 낸다 */
export function emitFeedback(cue: FxCue, s: Pick<FxSettings, 'vibration' | 'sound'>): void {
  if (s.vibration) vibrate(cue);
  if (s.sound) playTones(cue);
}
