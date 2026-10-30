// 진화 트리 점검 (GDD 20-5·22-7, npm run balance): ① 모든 진화체(일반 35 + 히든 12, 환생 횟수도 무작위)가 어떤 상태에서 실제로 뽑힐 수 있는가 ② 무작위 상태에서 히든이 나오는 비율 ③ 가중 랜덤 곡선.
// 장착 특성·흡수 속성 분포·돌보기 상태·행동 기록을 무작위로 만들어 judgeEvolution 을 그대로 돌린다. 종족 무관, 데이터만 본다.
import { ELEMENT_IDS } from '../../data/elements';
import { TRAITS } from '../../data/traits';
import type { FormDef } from '../../data/schema';
import { newBuild, gainTrait, type BuildState } from '../absorb/build';
import { createRng, nextFloat, nextInt, type Rng } from '../rng';
import { newEvolution, type EvolutionState } from './evolution';
import { judgeEvolution } from './judge';

export interface TreeReport {
  /** 진화체 id → 뽑힌 횟수 */
  picked: Record<string, number>;
  /** 한 번도 뽑히지 않은 진화체 */
  unreachable: string[];
  /** 단계별 표본 수와 히든 비율 */
  hiddenRate: Record<number, { samples: number; hidden: number }>;
}

/** 무작위 장착: 0~slots 개, 속성 쏠림을 섞는다 */
function randomBuild(rng: Rng, slots: number, focus: string | null): BuildState {
  const b = newBuild();
  while (b.slots.length < slots) b.slots.push(null);
  const n = nextInt(rng, slots + 1);
  for (let i = 0; i < n; i++) {
    const pool = TRAITS.filter((t) => !t.boss && !b.owned.includes(t.id) && (focus === null || nextFloat(rng) < 0.3 || t.element === focus));
    if (pool.length === 0) break;
    gainTrait(b, pool[nextInt(rng, pool.length)]!.id);
  }
  return b;
}

/** 무작위 단계 흡수 분포: 1~3 속성에 몰리거나 고르게 */
function randomAbsorbs(rng: Rng): Record<string, number> {
  const total = 3 + nextInt(rng, 20);
  const focus = 1 + nextInt(rng, 4);
  const picks = [...ELEMENT_IDS].sort(() => nextFloat(rng) - 0.5).slice(0, focus);
  const out: Record<string, number> = {};
  for (let i = 0; i < total; i++) {
    const el = nextFloat(rng) < 0.8 ? picks[nextInt(rng, picks.length)]! : ELEMENT_IDS[nextInt(rng, ELEMENT_IDS.length)]!;
    out[el] = (out[el] ?? 0) + 1;
  }
  return out;
}

/** 진화 직전 상태 하나 (단계 tierIndex 에서 다음 단계로) */
export function randomState(rng: Rng, tierIndex: number, prevForms: readonly string[]): EvolutionState {
  const e = newEvolution(Math.floor(nextFloat(rng) * 2 ** 32));
  e.tierIndex = tierIndex;
  e.formHistory = [...prevForms];
  e.formId = prevForms[prevForms.length - 1] ?? null;
  e.elementAbsorbs = randomAbsorbs(rng);
  e.absorbs = Object.values(e.elementAbsorbs).reduce((a, b) => a + b, 0);
  e.releases = nextInt(rng, e.absorbs + 6);
  e.breakthroughs = nextFloat(rng) < 0.3 ? nextInt(rng, 6) : 0;
  e.elitesDefeated = nextInt(rng, 25);
  return e;
}

export function analyzeTree(table: readonly FormDef[], factionId: string, samples: number, seed: number): TreeReport {
  const rng = createRng(seed);
  const picked: Record<string, number> = {};
  const hiddenRate: TreeReport['hiddenRate'] = {};
  const t4 = table.filter((f) => f.tier === 4);
  for (const tierIndex of [0, 1, 2, 3]) {
    const rec = (hiddenRate[tierIndex + 2] = { samples: 0, hidden: 0 });
    for (let i = 0; i < samples; i++) {
      const prev = tierIndex === 0 ? [] : tierIndex === 1 ? ['t2:base'] : tierIndex === 2 ? ['t2:base', 't3:base'] : ['t2:base', 't3:base', t4[nextInt(rng, t4.length)]!.id];
      const e = randomState(rng, tierIndex, prev);
      const focus = nextFloat(rng) < 0.6 ? ELEMENT_IDS[nextInt(rng, ELEMENT_IDS.length)]! : null;
      const build = randomBuild(rng, 3 + tierIndex, focus);
      const good = nextFloat(rng) < 0.85;
      const ctx = { factionId, build, hunger: good ? nextInt(rng, 60) : 60 + nextInt(rng, 41), condition: good ? 40 + nextInt(rng, 61) : nextInt(rng, 60), rebirths: nextFloat(rng) < 0.15 ? 2 + nextInt(rng, 4) : 0 };
      const { form } = judgeEvolution(e, ctx, table);
      picked[form.id] = (picked[form.id] ?? 0) + 1;
      rec.samples++;
      if (form.hidden) rec.hidden++;
    }
  }
  return { picked, unreachable: table.filter((f) => !picked[f.id]).map((f) => f.id), hiddenRate };
}
