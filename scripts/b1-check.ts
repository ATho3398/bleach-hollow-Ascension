// B-1 밸런스 점검 보조 (C.69, GDD 13장 B-1): npm run balance 가 다루지 않는 세 가지를 잰다.
//  ① 스토리 1장(두 종족 4화)을 사람형 봇이 순서대로 깨는 데 드는 시도 수·클리어율 (권장 단계대로 자유 원정을 섞은 경우 / 스토리만 내리 하는 경우)
//  ② 골드 경제: 종족별 4바퀴 섞음 봇 원정 1판 순수입(상인 지출·패배 상실 포함) → 상점 품목마다 몇 판이면 사는지 표
//  ③ 진화 속도: 단계별 걸음 기준을 원정 1회 평균 걸음으로 나눈 "원정 수" (2-3 목표 8~12 와 20-5 레벨 디자인 1.5/2.5/3/4.5 비교)
// 실행: npx vite-node scripts/b1-check.ts [--quick]
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { playCombatHuman } from '../src/engine/combat';
import { createExpedition, playExpedition, type ExpeditionState } from '../src/engine/expedition';
import { chapterContent } from '../src/data/story';
import { newSaveData, nextRunId, recordExpedition, sanitizeDeck, type SaveData } from '../src/game';

/** 봇의 보상 타일 목록 (C.140: 게임은 덱이 없어졌다 — GDD 85장 11번. 점검 기준을 바꾸지 않으려고 봇만 옛 '덱' 규칙(8장, 뽑은 타일 추가)을 들고 다닌다) */
const botDecks = new WeakMap<object, string[]>();
const botDeck = (tiles: SaveData['tiles'], fid: string): string[] => sanitizeDeck({ collection: tiles.collection, deck: botDecks.get(tiles) ?? [] }, fid);

const quick = process.argv.includes('--quick');
const SEEDS = quick ? 20 : 60;
const FACTIONS = ['hollow', 'shinigami'] as const;
const human = (b: Parameters<typeof playCombatHuman>[0]) => void playCombatHuman(b);
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

console.log(`B-1 점검 (밸런스 버전 ${BALANCE_VERSION}, 봇 ${SEEDS}명/종족)`);

function restNest(save: SaveData): void {
  save.nest.hunger = BALANCE.provisional.nest.startHunger;
  save.nest.condition = BALANCE.provisional.nest.startCondition;
  save.nest.weakened = false;
}

function freeRun(save: SaveData, seed: number): ExpeditionState {
  restNest(save);
  const e = playExpedition(
    createExpedition({
      factionId: save.factionId, seed, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition,
      deck: botDeck(save.tiles, save.factionId), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution,
      tileVariants: true, gold: save.shared.tradeCoins,
    }),
    { returnAfterLap: 4, absorb: 'absorb', playBattle: human },
  );
  recordExpedition(save, e, 0);
  return e;
}

function storyRun(save: SaveData, seed: number, episodeId: string): ExpeditionState {
  restNest(save);
  const e = playExpedition(
    createExpedition({
      factionId: save.factionId, seed, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition,
      deck: botDeck(save.tiles, save.factionId), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution,
      tileVariants: true, gold: save.shared.tradeCoins, story: { chapterId: 'ch1', episodeId },
    }),
    { returnAfterLap: 99, absorb: 'absorb', place: false, playBattle: human },
  );
  recordExpedition(save, e, 0);
  return e;
}

// ── ① 스토리 1장 ──
const MAX_TRIES = 8;
type EpStat = { tries: number[]; firstTry: number; fails: number; secs: number[]; bossTimeouts: number; tierAt: number[] };
for (const profile of ['권장 단계대로(3화 전 2단계까지 자유 원정)', '스토리만 내리(1단계 그대로)'] as const) {
  const follow = profile.startsWith('권장');
  console.log(`\n스토리 1장 — ${profile} (사람형 봇, 화마다 최대 ${MAX_TRIES}번 시도)`);
  for (const fid of FACTIONS) {
    const eps = chapterContent(fid, 'ch1')!.episodes;
    const stats: Record<string, EpStat> = {};
    for (const ep of eps) stats[ep.id] = { tries: [], firstTry: 0, fails: 0, secs: [], bossTimeouts: 0, tierAt: [] };
    let chapterDone = 0;
    let freeRuns = 0;
    let goldEnd = 0;
    let jadeEnd = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const save = newSaveData(fid, seed * 7919);
      botDecks.set(save.tiles, botDeck(save.tiles, fid));
      let ok = true;
      for (const ep of eps) {
        // 권장 단계 프로필: 권장 단계에 못 미치면 자유 원정(4바퀴 흡수)으로 키운다
        if (follow) {
          let guard = 0;
          while (save.evolution.tierIndex < ep.recommendedTier - 1 && guard++ < 20) {
            freeRun(save, seed * 10007 + guard);
            freeRuns++;
          }
        }
        const st = stats[ep.id]!;
        st.tierAt.push(save.evolution.tierIndex + 1);
        let cleared = false;
        let t = 0;
        for (; t < MAX_TRIES && !cleared; t++) {
          const e = storyRun(save, seed * 100003 + t * 31 + eps.indexOf(ep), ep.id);
          cleared = e.story?.cleared === true;
          if (cleared) {
            st.secs.push(e.elapsedSeconds);
            if (t === 0) st.firstTry++;
          } else {
            st.fails++;
            if (e.story?.bossResult && e.story.bossResult.lossReason === 'timeout') st.bossTimeouts++;
          }
        }
        if (!cleared) {
          ok = false;
          break;
        }
        st.tries.push(t);
      }
      if (ok) chapterDone++;
      goldEnd += save.shared.tradeCoins;
      jadeEnd += save.shared.jade;
    }
    console.log(`  [${fid}] 1장 완주 ${chapterDone}/${SEEDS} · 사이에 한 자유 원정 평균 ${(freeRuns / SEEDS).toFixed(1)}회 · 끝 골드 평균 ${(goldEnd / SEEDS).toFixed(0)} · 영옥 ${(jadeEnd / SEEDS).toFixed(1)}`);
    for (const ep of eps) {
      const st = stats[ep.id]!;
      const attempts = st.tries.length + st.fails + (SEEDS - st.tries.length) * 0; // 시도 = 성공 + 실패
      const totalTries = st.tries.reduce((a, b) => a + b, 0) + (SEEDS - st.tries.length) * MAX_TRIES;
      console.log(
        `    ${ep.id} ${ep.title.padEnd(8)} 목표 ${JSON.stringify(ep.objective).padEnd(52)} 권장 ${ep.recommendedTier}단계(실제 평균 ${avg(st.tierAt).toFixed(1)}) · 첫 시도 클리어 ${pct(st.firstTry / SEEDS)} · 판당 클리어율 ${pct(st.tries.length / Math.max(1, totalTries))} · 평균 시도 ${avg(st.tries).toFixed(2)}번 · 결국 못 깸 ${SEEDS - st.tries.length} · 클리어 시간 ${avg(st.secs).toFixed(0)}초${ep.boss ? ` · 보스 시간 초과 패배 ${st.bossTimeouts}` : ''}`,
      );
      void attempts;
    }
  }
}

// ── ② 골드 경제 ──
{
  const N = quick ? 100 : 300;
  console.log(`\n골드 경제 (4바퀴 흡수 봇 ${N}판 × 종족, 타일 변수 켬, 사람형 봇 전투, 새 세이브 상태에서 1판씩 — 순수입 = 번 것 − 상인 지출 − 패배로 잃은 것)`);
  const perRun: Record<string, number> = {};
  for (const fid of FACTIONS) {
    let earned = 0;
    let net = 0;
    let spent = 0;
    let defeats = 0;
    let food = 0;
    for (let seed = 1; seed <= N; seed++) {
      const save = newSaveData(fid, seed * 7919);
      botDecks.set(save.tiles, botDeck(save.tiles, fid));
      const before = save.shared.tradeCoins;
      const e = freeRun(save, seed * 977);
      earned += e.goldLoot.filter((g) => g.amount > 0).reduce((a, g) => a + g.amount, 0);
      spent += -e.goldLoot.filter((g) => g.amount < 0).reduce((a, g) => a + g.amount, 0);
      net += save.shared.tradeCoins - before;
      if (e.outcome === 'defeated') defeats++;
      food += e.foodLoot.length;
    }
    perRun[fid] = net / N;
    console.log(`  ${fid.padEnd(9)} 번 골드 ${(earned / N).toFixed(1)} · 상인 지출 ${(spent / N).toFixed(1)} · 순수입 ${(net / N).toFixed(1)}/판 · 패배 ${pct(defeats / N)} · 먹이 전리품 ${(food / N).toFixed(1)}개`);
  }
  const SX = BALANCE.shop;
  const SY = BALANCE.provisional.story;
  const BX = BALANCE.provisional.boss;
  const storyGold = 4 * SY.episodeGold + BX.reward.gold;
  const mean = (perRun.hollow! + perRun.shinigami!) / 2;
  console.log(`  스토리 1장 한 번 완주 골드 ${storyGold} (화 ${SY.episodeGold}×4 + 보스 ${BX.reward.gold}) ≈ 자유 원정 ${(storyGold / mean).toFixed(1)}판 · 영옥 ${4 * SY.firstClearJade + SY.chapterJade + BX.reward.firstJade}`);
  console.log('  상점 골드 품목 (가격 / 원정 몇 판 — 호로 · 사신)');
  for (const [id, price] of Object.entries(SX.goldPrices)) {
    console.log(`    ${id.padEnd(16)} ${String(price).padStart(4)}골드  ${(price / perRun.hollow!).toFixed(1).padStart(5)}판 · ${(price / perRun.shinigami!).toFixed(1).padStart(5)}판`);
  }
  SX.deckSlotPrices.forEach((price, i) => console.log(`    ${`deck-slot+${i + 1}`.padEnd(16)} ${String(price).padStart(4)}골드  ${(price / perRun.hollow!).toFixed(1).padStart(5)}판 · ${(price / perRun.shinigami!).toFixed(1).padStart(5)}판`));
}

// ── ②-b 새 몸(1단계, 특성 없음)의 첫 원정 패배율: 바퀴 수 × 덱 타일을 놓는가(강적 소굴 포함) ──
{
  const N = quick ? 60 : 200;
  console.log(`\n첫 원정 패배율 (새 세이브 1단계, 사람형 봇, 흡수, 타일 변수 켬, ${N}판 × 종족) — 2-1 "대부분 3~4바퀴에서 귀환" 곡선 참고`);
  for (const fid of FACTIONS) {
    const cells: string[] = [];
    for (const place of [true, false]) {
      for (const laps of [2, 3, 4]) {
        let def = 0;
        for (let seed = 1; seed <= N; seed++) {
          const save = newSaveData(fid, seed * 7919);
          botDecks.set(save.tiles, botDeck(save.tiles, fid));
          const e = playExpedition(
            createExpedition({
              factionId: fid, seed: seed * 613 + laps, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition,
              deck: botDeck(save.tiles, fid), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution, tileVariants: true, gold: save.shared.tradeCoins,
            }),
            { returnAfterLap: laps, absorb: 'absorb', place, playBattle: human },
          );
          if (e.outcome === 'defeated') def++;
        }
        cells.push(`${laps}바퀴 ${pct(def / N)}`);
      }
    }
    console.log(`  ${fid.padEnd(9)} 덱 타일 놓음(강적 소굴 포함): ${cells.slice(0, 3).join(' · ')} / 안 놓음(야생 전투만): ${cells.slice(3).join(' · ')}`);
  }
}

// ── ③ 진화 속도 ──
{
  const N = quick ? 40 : 120;
  console.log(`\n진화 속도 (4바퀴 흡수 봇, 사람형 봇 전투, 새 세이브 ${N}판 × 종족): 원정 1회 걸음 → 단계별 기준 ${BALANCE.provisional.evolution.stepsNeeded.join('/')}칸을 원정 수로`);
  for (const fid of FACTIONS) {
    const steps: number[] = [];
    for (let seed = 1; seed <= N; seed++) {
      const save = newSaveData(fid, seed * 7919);
      botDecks.set(save.tiles, botDeck(save.tiles, fid));
      const e = freeRun(save, seed * 4241);
      steps.push(e.evolution.steps);
    }
    const s = avg(steps);
    const runs = BALANCE.provisional.evolution.stepsNeeded.map((n) => (n / s).toFixed(1));
    console.log(`  ${fid.padEnd(9)} 원정 1회 평균 ${s.toFixed(1)}칸 → 단계별 약 ${runs.join(' / ')}원정 (합 ${(BALANCE.provisional.evolution.stepsNeeded.reduce((a, b) => a + b, 0) / s).toFixed(1)}원정) — 20-5 레벨 디자인 1.5/2.5/3/4.5, 2-3 "진화 1단계 ≈ 런 8~12회"`);
  }
}
