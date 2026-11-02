// 첫 원정 첫 전투 각본 (GDD 123장 5, C.199). DOM 에 의존하지 않는 순수 함수라 단위 테스트한다.
// 순서 (GDD 157장 2): ① 자동 공격 N대 ② 강공격 예고 게이지가 차면 멈춤 → 막기를 눌러야 진행 → 막아 냄 → 멈춤·'막기 성공' ③ N대 더
// ④ 곧바로 못 막는 강공격 → 죽기 직전 체력 → 멈춤 → 블록 1개 → 눌러 쓰게 함 → 멈춤·'좋아!' ⑤ 같은 블록 3개 → 멈춤 → 체인으로 처치.
// ⑦ 의 체인 (GDD 146장): 쓰는 순간에는 피해를 맡겨 두고(chain-hit) 동작·스킬 연출이 적에게 닿을 때 화면이 scriptLand 로 넣는다 → 피해 숫자·체력 감소 → 쓰러짐.
// 화면이 부르지 않으면(헤드리스·연출 끔) chainHitMaxSeconds 뒤에 넣는다.
// 난수를 쓰지 않는다: 블록 생성·적 일반 공격·치명타는 엔진이 각본 전투에서 끈다(combat.ts script). 종족 분기 없음 — 문구는 src/data/help/tutorial.json.
import { BALANCE } from '../../config/balance';
import { applyInput, BASIC_SKILL_ID, blockDamage, maxChain, scriptHeavyCast, scriptLandHit, scriptSpawnBlock, spawnTableOf, step, type CombatInput, type CombatScript, type CombatState } from './combat';

const TS = BALANCE.provisional.tutorialScript;

export const SCRIPT_STAGES = [
  'auto', 'heavy-charge', 'guard-now', 'guard-hold', 'guard-land', 'guard-ok', 'auto2', 'heavy2', 'hurt-hold', 'hurt', 'skill-hold', 'nice', 'after-skill', 'chain-spawn', 'stack-hold', 'chain-use', 'chain-hit', 'done',
] as const;
export type ScriptStage = (typeof SCRIPT_STAGES)[number];

/** 멈춰서 기다리는 단계와 무엇을 기다리는가: ack = 설명 카드 [다음](✓), guard = 막기, use = 블록 사용 */
export type ScriptWait = 'ack' | 'guard' | 'use';
const WAIT: Partial<Record<ScriptStage, ScriptWait>> = {
  'guard-now': 'guard', 'guard-ok': 'ack', hurt: 'use', nice: 'ack', 'chain-use': 'use',
};

export function newCombatScript(): CombatScript {
  return { stage: 'auto', hits: 0, ticks: 0, spawned: 0, allow: [], leaveHpFraction: TS.leaveHpFraction, heavyHits: 0, lethal: false };
}

const stageOf = (s: CombatState): ScriptStage | null => (s.script ? (s.script.stage as ScriptStage) : null);

/** 지금 멈춰 기다리는가: 단계 id 와 기다리는 것. 각본이 없거나 흐르는 단계면 null (그때는 scriptStep 이 틱을 돌린다) */
export function scriptPrompt(s: CombatState): { stage: ScriptStage; wait: ScriptWait } | null {
  const st = stageOf(s);
  if (!st || s.status !== 'playing') return null;
  const wait = WAIT[st];
  return wait ? { stage: st, wait } : null;
}

function enter(s: CombatState, stage: ScriptStage): void {
  const sc = s.script!;
  sc.stage = stage;
  sc.hits = 0;
  sc.ticks = 0;
  sc.heavyHits = 0;
  const w = WAIT[stage];
  sc.allow = w === 'guard' ? ['guard'] : w === 'use' ? ['use'] : [];
  if (stage === 'done') s.script = undefined; // 끝: 혹시 처치하지 못했으면 보통 전투로 이어진다
}

/** 각본 블록: 출현표의 기본 공격 블록(없으면 첫 공격 블록). 계열이 없으면 종족 계열 표의 첫 계열 (난수 없이) */
export function scriptBlockOf(s: CombatState): { traitId: string; family: string | null } {
  const entries = spawnTableOf(s.params).entries.filter((e) => e.kind === 'skill' && e.source?.role === 'attack');
  const e = entries.find((x) => x.source!.id === BASIC_SKILL_ID) ?? entries[0];
  const family = e?.family ?? Object.keys(s.params.families)[0] ?? null;
  return { traitId: e?.source?.id ?? BASIC_SKILL_ID, family };
}

/** 설명 카드의 [다음](✓). 기다리는 것이 ack 일 때만 다음 단계로 */
export function scriptAck(s: CombatState): boolean {
  const p = scriptPrompt(s);
  if (!p || p.wait !== 'ack') return false;
  if (p.stage === 'guard-ok') enter(s, 'auto2');
  else if (p.stage === 'nice') enter(s, 'after-skill');
  return true;
}

/**
 * 각본 전투의 한 틱: 기다리는 단계면 틱을 돌리지 않고 기다리는 입력(막기·블록)만 받는다, 흐르는 단계면 엔진 step 후 단계를 넘긴다.
 * 각본이 없으면 step 과 같다. 각 입력이 받아들여졌는지 돌려준다
 */
export function scriptStep(s: CombatState, input?: CombatInput | CombatInput[] | null): boolean[] {
  const list = input ? (Array.isArray(input) ? input : [input]) : [];
  if (!s.script) return step(s, list);
  const sc = s.script;
  const p = scriptPrompt(s);
  if (p) {
    if (p.wait === 'ack') return list.map(() => false);
    return list.map((x) => {
      if (s.script !== sc || stageOf(s) !== p.stage) return false;
      // 기다리는 단계에서는 틱 없이 입력만 받는다 (step 은 입력 뒤 틱을 한 번 돈다)
      // 마무리 체인 (GDD 146장): 피해는 맡겨 두고 연출이 닿을 때 넣는다
      if (p.stage === 'chain-use') sc.holdHit = true;
      const ok = applyInput(s, x);
      sc.holdHit = false;
      if (!ok) return false;
      if (p.wait === 'guard') {
        // 막기가 끝나기 전에 착탄하게 예고를 줄인다
        const c = s.enemy.cast;
        if (c) c.ticks = Math.min(c.ticks, Math.max(1, s.guard.ticks - 1));
        enter(s, 'guard-hold');
      } else if (p.stage === 'hurt') enter(s, 'skill-hold');
      else enter(s, sc.held ? 'chain-hit' : 'done');
      return true;
    });
  }
  const out = step(s, list);
  if (s.status !== 'playing' || s.script !== sc) return out;
  sc.ticks++;
  const st = sc.stage as ScriptStage;
  const tick = (sec: number) => Math.max(1, Math.round(sec / s.params.tickSeconds));
  if (st === 'auto' && sc.hits >= TS.autoHits) {
    scriptHeavyCast(s, TS.castSeconds);
    s.guardGauge = 1;
    s.guardFilled = true;
    enter(s, 'heavy-charge');
  } else if (st === 'heavy-charge' && (!s.enemy.cast || s.enemy.cast.ticks <= 2)) enter(s, 'guard-now'); // 예고 게이지가 가득 차기 직전에 멈춤 (GDD 157장 2)
  else if (st === 'guard-hold' && sc.heavyHits > 0) enter(s, 'guard-land');
  else if (st === 'guard-land' && sc.ticks >= tick(TS.hurtHoldSeconds)) enter(s, 'guard-ok'); // 막아 낸 모습을 보여 준 뒤
  else if (st === 'auto2' || st === 'heavy2') {
    s.guardGauge = 0; // ⑤ 못 막게: 막기 게이지가 차지 않는다
    if (st === 'auto2' && sc.hits >= TS.autoHits2) {
      scriptHeavyCast(s, TS.castSeconds);
      enter(s, 'heavy2');
    } else if (st === 'heavy2' && sc.heavyHits > 0) enter(s, 'hurt-hold');
  } else if (st === 'hurt-hold' && sc.ticks >= tick(TS.hurtHoldSeconds)) {
    // 맞고 체력이 깎이는 모습을 보여 준 뒤 (GDD 129장 3) 블록 1개와 함께 멈춤
    const b = scriptBlockOf(s);
    scriptSpawnBlock(s, b.traitId, b.family);
    enter(s, 'hurt');
  } else if (st === 'skill-hold' && sc.ticks >= tick(TS.hurtHoldSeconds)) enter(s, 'nice'); // 스킬이 나간 모습을 보여 준 뒤
  else if (st === 'stack-hold' && sc.ticks >= tick(TS.stackHoldSeconds)) enter(s, 'chain-use'); // 블록이 쌓인 모습을 보여 준 뒤
  else if (st === 'after-skill' && sc.ticks >= tick(TS.afterSkillSeconds)) enter(s, 'chain-spawn');
  else if (st === 'chain-hit' && sc.ticks >= tick(TS.chainHitMaxSeconds)) scriptLand(s); // 화면이 착탄을 알리지 않았으면 (헤드리스·연출 끔)
  else if (st === 'chain-spawn') {
    const n = Math.min(TS.chainLength, maxChain(s.params));
    if (sc.ticks >= tick(TS.spawnGapSeconds) * (sc.spawned + 1)) {
      const b = scriptBlockOf(s);
      if (scriptSpawnBlock(s, b.traitId, b.family)) sc.spawned++;
      else sc.spawned = n; // 바가 가득(있을 수 없음)이면 그대로 마무리
    }
    if (sc.spawned >= n) {
      // 체인 한 번에 쓰러지게: 적 체력을 그 체인 피해 아래로 (각본 전투만)
      const last = s.tray[s.tray.length - 1];
      if (last) s.enemy.hp = Math.min(s.enemy.hp, Math.max(1, blockDamage(s, last, n) * 0.5));
      sc.spawned = 0; // 쓰러질 수 있게(lethal) 되는 것은 체인이 닿는 순간 (scriptLandHit, GDD 146장)
      enter(s, 'stack-hold');
    }
  }
  return out;
}

/** 마무리 체인이 적에게 닿았다 (GDD 146장): 맡겨 둔 피해를 넣는다. 화면은 연출의 마지막 타격 순간에 부른다. 넣었으면 true */
export function scriptLand(s: CombatState): boolean {
  if (stageOf(s) !== 'chain-hit') return false;
  const ok = scriptLandHit(s);
  if (s.status === 'playing' && s.script) enter(s, 'done');
  return ok;
}

/** 각본 전투를 끝까지 돌린다 (헤드리스 — 봇·시험): 설명은 바로 넘기고, 막기·블록은 기다리는 즉시 쓴다. 결과는 언제나 같다 */
export function playScriptedCombat(s: CombatState, onPrompt?: (stage: ScriptStage) => void): CombatState {
  let guard = 0;
  while (s.status === 'playing' && guard++ < 1e6) {
    const p = scriptPrompt(s);
    if (p) onPrompt?.(p.stage);
    if (p?.wait === 'ack') scriptAck(s);
    else if (p?.wait === 'guard') scriptStep(s, { type: 'guard' });
    else if (p?.wait === 'use') scriptStep(s, { type: 'use', cell: 0 });
    else scriptStep(s);
  }
  return s;
}
