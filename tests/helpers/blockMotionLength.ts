// 블록 몸동작 실제 길이 재기 (C.476, GDD 7절 v6.106 '같은 진화 단계 = 블록 모션 길이 통일'):
// 진짜 종이인형 재생기(createRigPlayer)에 화면 run()·blockMotion() 과 같은 순서로 동작을 틀고 1ms 씩 흘려, 블록 하나의 몸동작이 끝날 때까지의 시간을 잰다.
// normalized = true 면 화면처럼 재생 배율(pace = 실제 길이 ÷ 기준 길이, 하한 1배 — C.519 bodyPace)·길이 맞춤(lengthMs, 늘이지 않음)을 걸고, false 면 옛 재생(실제 동작 길이 그대로).
// C.519 부터 기준보다 짧은 몸은 1배로 끝나고(잰 길이 < 기준 길이) 남는 시간은 재생기의 쉬는 동작(idle) — 블록 총 길이는 엔진 줄 길이(기준 길이)
import { BALANCE } from '../../src/config/balance';
import { getFaction } from '../../src/data/factions';
import { isFemaleRigLook } from '../../src/data/art/manifest';
import { resolveMotions, rigPackOfLook } from '../../src/data/art/rig/pose';
import { blockMotionTarget, type CombatEvent } from '../../src/engine/combat';
import { createRigPlayer, type RigPlayer } from '../../src/ui/bha/rigAnim';
import { animActionOf, attackCueOf, blockBodyMs, bodyPace, paced, type AttackCue, type FamilyFxSpec } from '../../src/ui/attackFx';
import { ATTACK_FX } from '../../src/ui/attackFxConfig';
import { familyStagesFor, hasPixelStage, pixelPlan, type PixelBodySlot } from '../../src/ui/pixelAttack';
import type { AnimAction } from '../../src/data/art/anim';

export interface BodyRig {
  player: RigPlayer;
  slot: PixelBodySlot;
  familyFx: (familyId: string, stage: number) => FamilyFxSpec | null;
  familyIds: string[];
}

/** 외형 하나의 재생기·칸·계열 연출 (battleView 와 같은 규칙). rng 고정 = 변형 고르기를 정해 둔다 */
export function bodyRig(look: string, factionId: string, rng: () => number = () => 0): BodyRig {
  const pack = rigPackOfLook(look)!;
  const body = pack.rig.looks[look]!.body;
  const motions = resolveMotions(pack.rig, pack.motions, pack.sets, body);
  const player = createRigPlayer(pack.rig, motions, () => {}, rng);
  const bodyKey = `${pack.id}/${body}`;
  const fac = getFaction(factionId);
  const familyFx = (id: string, stage: number): FamilyFxSpec | null => {
    const f = fac.families.find((x) => x.id === id);
    if (!f) return null;
    const t = f.tiers[stage - 1];
    return { fx: t?.fx ?? f.fx, look: t?.fxLook ?? null, motion: f.motion ?? null, rigMotion: t?.rigMotion ?? null, pixel: familyStagesFor(f.pixelFx, bodyKey)?.[stage - 1] ?? null };
  };
  return { player, slot: isFemaleRigLook(look) ? 'female' : 'male', familyFx, familyIds: fac.families.map((f) => f.id) };
}

/** 계열 공격 블록 사건 (family null = 계열 없는 블록 — 초월자 전용 블록 자리) */
export function blockEvent(family: string | null, chain: number): CombatEvent {
  return { kind: 'block', block: 'skill', traitId: 'x', family, element: null, matchup: 'neutral', role: 'attack', chain, damage: 1, weak: false, heal: 0, guardSeconds: 0, bonus: null };
}

/** 재생기로 동작 하나를 끝까지 틀고 걸린 시간(ms, 화면 1배) */
function playOut(p: RigPlayer, act: AnimAction, o: Parameters<RigPlayer['play']>[1], rate: number): number {
  let done = false;
  p.setRate(rate);
  const r = p.play(act, { ...o, onEnd: () => { done = true; } });
  if (!r) return 0;
  let t = 0;
  while (!done && t < 20000) {
    p.advance(1);
    t++;
  }
  p.setRate(1);
  return t;
}

const peekStep = (p: RigPlayer, id: string) => p.peek('skill', { rigMotion: id });

/**
 * 블록 하나의 몸동작 실제 길이(ms): 화면 run() 과 같은 갈래 — 도트 연결 동작(기다림 body.at + 동작마다) / 스킬·공격 동작 하나 / 몸통박치기·발사(동작 그림 없음).
 * normalized 면 cue.pace 를 화면 react() 처럼 정하고 같은 배율·길이 맞춤으로 튼다
 */
export function measureBlockMs(b: BodyRig, family: string | null, chain: number, normalized: boolean): { ms: number; kind: 'chain' | 'clip' | 'lunge'; pace: number; play: number } {
  const cue = attackCueOf(blockEvent(family, chain), 3, b.familyFx) as AttackCue;
  const target = normalized ? blockMotionTarget(BALANCE.provisional.combat.motion, chain) : null;
  const nat = blockBodyMs(cue, b.player, b.slot);
  const pace = target && nat && nat.totalMs > 0 ? nat.totalMs / (target * 1000) : 1;
  const play = bodyPace(pace); // 화면 run() 과 같은 실제 재생 배율(하한 1배, C.519)
  const fit = pace !== 1 || !!target;
  const pplan = cue.pixel && hasPixelStage(cue.pixel.stage, b.slot) ? pixelPlan(cue.pixel.stage, b.slot, play) : null;
  if (pplan?.body) {
    const body = pplan.body;
    let t = Math.max(0, body.at);
    body.chain.forEach((st, i) => {
      const stepRate = (st.rate > 0 ? st.rate : 1) * body.speed;
      const len = fit ? peekStep(b.player, st.id)?.durationMs : undefined;
      const fromHit = i === 0 && body.bodyFromHit;
      t += playOut(b.player, 'skill', { rigMotion: st.id, fromHit, ...(len ? { lengthMs: len } : {}) }, stepRate);
    });
    return { ms: t, kind: 'chain', pace, play };
  }
  const act = animActionOf(cue, (a) => b.player.has(a));
  if (act) {
    const pk = b.player.peek(act, { motion: cue.motion, rigMotion: cue.rigMotion });
    const len = fit && pk ? pk.durationMs / play : undefined;
    return { ms: playOut(b.player, act, { motion: cue.motion, rigMotion: cue.rigMotion, ...(len ? { lengthMs: len } : {}) }, 1), kind: 'clip', pace, play };
  }
  const lv = paced(ATTACK_FX[cue.tier], play);
  return { ms: Math.round(lv.backMs + lv.lungeMs + lv.holdMs + lv.returnMs), kind: 'lunge', pace, play };
}
