// 공격 계열 섞임 점검 (GDD 18-8 ③, C.41): 원정 1회 동안 흡수 제안·획득에서 공격 계열이 몇 종류 나오는지 센다.
//   npm run family:mix            결과 출력
//   npm run family:mix -- --check  평균 2계열 미만이면 실패 (CI balance:check 와는 별개로 쓰는 점검)
// 정책(사람이 자연스럽게 고르는 쪽): 공격 특성이 후보에 있으면 아직 없는 계열을 먼저, 없으면 공격 아닌 skill > 패시브 > 파츠. 빈 슬롯이 없으면 놓아준다.
import { BALANCE_VERSION } from '../src/config/balance';
import { getTrait } from '../src/data/traits';
import { chooseAbsorb, chooseContinue, chooseRelease, chooseReturn, createExpedition, advance, finishBattle, finishRest, placeAll, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { playCombatBot } from '../src/engine/combat';
import { referenceTileStock, sanitizeDeck } from '../src/game';

const check = process.argv.includes('--check');
const M = 300;

function attackFamily(id: string): string | null {
  const t = getTrait(id);
  return t.kind === 'skill' && t.role === 'attack' ? (t.family ?? null) : null;
}

function run(factionId: string, seed: number, laps: number): { offered: Set<string>; owned: Set<string>; firstOffer: Set<string>; absorbs: number } {
  const exp: ExpeditionState = createExpedition({ factionId, seed, hunger: 20, condition: 80, deck: sanitizeDeck(referenceTileStock(), factionId) });
  const offered = new Set<string>();
  const firstOffer = new Set<string>();
  let absorbs = 0;
  for (let g = 0; exp.phase !== 'ended' && g < 10000; g++) {
    if (exp.phase === 'moving') {
      placeAll(exp);
      advance(exp);
    } else if (exp.phase === 'battle') {
      const b = startBattle(exp);
      playCombatBot(b);
      finishBattle(exp, b);
    } else if (exp.phase === 'absorb') {
      const offer = exp.absorbOffer!;
      const fams = offer.candidates.map(attackFamily).filter((f): f is string => f !== null);
      for (const f of fams) offered.add(f);
      if (absorbs === 0) for (const f of fams) firstOffer.add(f);
      const have = new Set(exp.build.slots.filter((x): x is string => !!x).map(attackFamily).filter((f): f is string => f !== null));
      const score = (id: string) => {
        const t = getTrait(id);
        const f = attackFamily(id);
        if (f) return have.has(f) ? 4 : 6;
        return t.kind === 'skill' ? 3 : t.kind === 'passive' ? 2 : 1;
      };
      const best = [...offer.candidates].sort((a, b) => score(b) - score(a))[0] ?? null;
      if (best && exp.build.slots.includes(null)) {
        chooseAbsorb(exp, best, null);
        absorbs++;
      } else chooseRelease(exp);
    } else if (exp.phase === 'rest') finishRest(exp);
    else if (exp.phase === 'nest-choice') {
      placeAll(exp);
      if (exp.lap >= laps) chooseReturn(exp);
      else chooseContinue(exp);
    }
  }
  const owned = new Set(exp.acquiredTraits.map((a) => attackFamily(a.traitId)).filter((f): f is string => f !== null));
  return { offered, owned, firstOffer, absorbs };
}

console.log(`공격 계열 섞임 점검 (밸런스 ${BALANCE_VERSION}, 원정 ${M}회씩)`);
const failures: string[] = [];
for (const factionId of ['hollow', 'shinigami']) {
  for (const laps of [1, 2, 4]) {
    let offered = 0;
    let owned = 0;
    let none = 0;
    let absorbs = 0;
    let first = 0;
    const famCount: Record<string, number> = {};
    for (let seed = 1; seed <= M; seed++) {
      const r = run(factionId, seed, laps);
      offered += r.offered.size;
      owned += r.owned.size;
      absorbs += r.absorbs;
      first += r.firstOffer.size;
      if (r.owned.size === 0) none++;
      for (const f of r.owned) famCount[f] = (famCount[f] ?? 0) + 1;
    }
    console.log(`  [${factionId}] ${laps}바퀴 귀환: 흡수 ${(absorbs / M).toFixed(2)}회 · 제안된 공격 계열 평균 ${(offered / M).toFixed(2)} · 얻은 공격 계열 평균 ${(owned / M).toFixed(2)} (공격 특성 0개 ${((none / M) * 100).toFixed(0)}%) · 첫 흡수 후보의 공격 계열 ${(first / M).toFixed(2)} · 계열별 얻은 비율 ${Object.entries(famCount).sort().map(([f, n]) => `${f.replace('family-', '')} ${((n / M) * 100).toFixed(0)}%`).join('/')}`);
    if (laps === 4 && owned / M < 2) failures.push(`[${factionId}] 4바퀴 원정에서 얻은 공격 계열 평균 ${(owned / M).toFixed(2)} < 2`);
  }
}
if (check && failures.length > 0) {
  console.error(`\n실패 ${failures.length}건:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
