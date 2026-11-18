// C.489 (GDD v6.121 12-4): 아이젠 봇 전투 — 전투당 붕옥·경화수월 평균 개수 (고정 몫 전후 비교). 실행: npx vite-node scripts/c489-aizen-sim.ts
import { BALANCE } from '../src/config/balance';
import { ENEMIES } from '../src/data/enemies';
import { createCombat, drainCombatEvents, KIT_TRAIT_PREFIX, step, ticksOf } from '../src/engine/combat';
import { botInput } from '../src/engine/combat/bot';
import { buildCombatParams } from '../src/engine/absorb/build';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { testGrantTranscendent } from '../src/engine/testMode';
import { newSaveData } from '../src/game';
import type { CombatParams } from '../src/engine/combat';

const K = BALANCE.provisional.transcendentKits.aizen!.blocks as Record<string, { voidSlot?: { base?: number } }>;
const normals = ENEMIES.filter((e) => e.class === 'normal' && !e.id.startsWith('test')).slice(0, 8);

function params(): Partial<CombatParams> {
  const s = newSaveData('hollow', 1000);
  testGrantTranscendent(s, 'aizen', 2000);
  const p: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
  applyEvolutionToParams(p, s.evolution, s.factionId, 0, false);
  return p;
}

function run(label: string, hBase: number, kBase: number, riskStart: number): void {
  K.hogyoku!.voidSlot!.base = hBase;
  K.kyoka!.voidSlot!.base = kBase;
  const N = 400;
  let hg = 0, ky = 0, spawns = 0, secs = 0;
  for (let i = 0; i < N; i++) {
    const enemy = normals[i % normals.length]!;
    const s = createCombat(1000 + i, { enemy, params: { ...params(), riskStart } });
    const every = ticksOf(s.params, 0.5);
    while (s.status === 'playing') {
      step(s, s.tick % every === 0 ? botInput(s) : null);
      for (const e of drainCombatEvents(s)) if (e.kind === 'spawn') {
        spawns++;
        const t = s.tray[e.index]?.traitId;
        if (t === KIT_TRAIT_PREFIX + 'hogyoku') hg++;
        if (t === KIT_TRAIT_PREFIX + 'kyoka') ky++;
      }
    }
    secs += s.tick / ticksOf(s.params, 1);
  }
  console.log(`${label} (감응도 시작 ${riskStart}): 전투 ${N} · 평균 ${(secs / N).toFixed(1)}초 · 블록 ${(spawns / N).toFixed(2)}개 · 붕옥 ${(hg / N).toFixed(2)}개 · 경화수월 ${(ky / N).toFixed(2)}개`);
}

// 감응도 30 이상이면 봇이 바로 융합해 붕옥·경화수월이 안 나온다(융합 중 없음) — 20(최솟값)·50 두 경우
for (const r of [20, 50]) {
  run('전(공식만)', 0, 0, r);
  run('후(+15%/+12%)', 0.15, 0.12, r);
}
