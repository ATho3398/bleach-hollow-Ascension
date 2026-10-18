// 화면 흐름: 종족 선택 → 둥지 → 원정(12칸 길) → 전투 → 원정 결과 → 둥지. DOM/CSS 만 쓴다.
// 화면 텍스트는 FactionConfig·데이터 스킨에서 읽고, 종족 id 로 분기하지 않는다.
import { ENEMIES } from '../data/enemies';
import { FACTIONS, getFaction } from '../data/factions';
import type { EnemyDef } from '../data/schema';
import { tileName } from '../data/tiles';
import { buildBattleRecord, createCombat, storedStartGaugeOf, type CombatState } from '../engine/combat';
import { buildCombatParams } from '../engine/absorb';
import { applyEvolutionToParams } from '../engine/evolution';
import { createExpedition, drainEvents, finishBattle, serializeExpedition, startBattle, type ExpeditionState } from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import {
  loadSave, newSaveData, nextRunId, performEvolution, readActiveExpedition, recordBattle, recordExpedition, sanitizeDeck, writeSave, type SaveData,
} from '../game';
import { versionLabel } from '../version';
import { absorbView } from './absorbView';
import { battleView } from './battleView';
import { mountScreen } from './dom';
import { applyTheme } from './bha/theme';
import { startView } from './startView';
import { breakthroughView } from './breakthroughView';
import { practiceListView, practiceResultView } from './practiceView';
import { resultView } from './resultView';
import { expeditionView, getSpeed, setSpeed } from './expeditionView';
import { dexView } from './dexView';
import { showTitleToasts, titleDexView } from './titleDexView';
import { evolutionView } from './evolutionPanel';
import { nestView } from './nestView';
import { settingsView } from './settingsView';
import { helpOverlay, type HelpScreenId } from './helpView';
import { markTutorialSeen, shouldAutoShowTutorial } from '../engine/tutorial';

export function startApp(root: HTMLElement): void {
  let save: SaveData | null = loadSave(localStorage);

  const mount = (...nodes: HTMLElement[]) => mountScreen(root, ...nodes);
  const persist = () => save && writeSave(localStorage, save);
  /** 이어하기를 숨긴 이유 안내 한 줄 (손상·버전 불일치). 다음 원정을 시작하면 지운다 */
  let resumeNote = '';

  /** 원정 중간 저장 (GDD 14-1). 끝난 원정은 저장하지 않는다 (recordExpedition 이 영역을 비운다) */
  const saveProgress = (exp: ExpeditionState) => {
    if (!save || exp.phase === 'ended') return;
    save.activeExpedition = serializeExpedition(exp, getSpeed());
    persist();
  };

  /** 도움말에 쓸 종족: 세이브가 있으면 그 종족, 없으면(시작 화면) 등록된 첫 종족 */
  const helpFaction = (): FactionConfig => (save ? getFaction(save.factionId) : FACTIONS[0]!);

  /** 첫 전투 직전 튜토리얼 (GDD 14-2): 아직 안 봤을 때만. 끝내거나 건너뛰면 본 것으로 저장한다 */
  const tutorialFor = () =>
    save && shouldAutoShowTutorial(save.help)
      ? { onDone: () => { markTutorialSeen(save!.help); persist(); } }
      : undefined;

  /** 도움말을 연다. 튜토리얼 다시 보기는 체험 전투(기록 없음)에서 튜토리얼을 다시 연다 */
  function openHelp(screen: HelpScreenId | undefined, back: (() => void) | null, onClose: () => void = () => {}): void {
    const faction = helpFaction();
    // back 이 없으면(원정 화면: 시간이 흐르는 화면 위에서 체험 전투로 갈아타지 않는다) 다시 보기는 숨긴다
    helpOverlay(faction, { screen, onClose, onReplayTutorial: back ? () => tutorialDemo(faction, back) : undefined });
  }

  /** 튜토리얼 다시 보기: 연습 상대 하나와의 체험 전투를 튜토리얼과 함께 연다. 결과는 기록하지 않는다 */
  function tutorialDemo(faction: FactionConfig, back: () => void): void {
    const enemy = ENEMIES.find((e) => e.class === 'normal' && !e.testOnly) ?? ENEMIES[0]!;
    const params = save ? buildCombatParams(save.build) : undefined;
    if (save && params) {
      applyEvolutionToParams(params, save.evolution);
      params.storedStartGauge = storedStartGaugeOf(save.nest.stability);
    }
    const s = createCombat(Math.floor(Math.random() * 2 ** 32), { enemy, params });
    battleView(root, faction, s, {
      notice: '튜토리얼 체험 전투 (기록되지 않음)',
      tutorial: { onDone: () => { if (save) { markTutorialSeen(save.help); persist(); } } },
      onQuit: back,
      onEnd: back,
    });
  }

  function factionScreen(): void {
    // 시작 화면의 기본 테마: 세이브가 있으면 그 종족, 없으면 등록된 첫 종족 (종족 id 로 분기하지 않는다)
    applyTheme(helpFaction());
    startView(root, FACTIONS, {
      onPick: (f) => {
        if (save) save.factionId = f.id;
        else save = newSaveData(f.id);
        persist();
        nestScreen();
      },
      onSettings: () => settingsView(root, factionScreen, () => openHelp(undefined, factionScreen)),
      onHelp: () => openHelp(undefined, factionScreen),
    });
  }

  function nestScreen(): void {
    if (!save) return factionScreen();
    const faction = getFaction(save.factionId);
    applyTheme(faction);
    const s = save;
    showTitleToasts(s, faction, persist);
    const active = readActiveExpedition(s);
    if (!active.ok && active.reason !== 'none') {
      persist(); // 손상·구버전 영역을 비운 것을 저장
      resumeNote = active.reason === 'version' ? '저장된 원정이 이전 버전이라 이어할 수 없어 지웠다.' : '저장된 원정이 손상되어 이어할 수 없어 지웠다.';
    }
    nestView(root, faction, s, {
      resume: active.ok
        ? { info: `${active.exp.lap}바퀴 · ${active.exp.pos}번 칸 · 전투 ${active.exp.battles.length}회`, onResume: () => resumeExpedition(active.exp, active.speed) }
        : null,
      resumeNote,
      persist,
      onDepart: () => departScreen(faction),
      onPractice: () => practiceScreen(faction),
      onEvolve: () => {
        const from = s.evolution.tierIndex;
        const r = performEvolution(s);
        if (!r.ok) return nestScreen();
        persist();
        evolutionView(root, faction, from, s.evolution.tierIndex, r.form, nestScreen, s.build.slots.length);
        showTitleToasts(s, faction, persist);
      },
      onDex: () => dexView(root, faction, s, nestScreen),
      onTitles: () => titleDexView(root, faction, s, nestScreen),
      onChangeFaction: factionScreen,
      onSettings: () => settingsView(root, nestScreen, () => openHelp(undefined, nestScreen)),
      onHelp: (screen) => openHelp(screen, nestScreen),
    });
  }

  // ── 원정 ──
  function departScreen(faction: FactionConfig): void {
    if (!save) return;
    const exp = createExpedition({
      factionId: faction.id,
      seed: Math.floor(Math.random() * 2 ** 32),
      runId: nextRunId(save),
      hunger: save.nest.hunger,
      condition: save.nest.condition,
      deck: sanitizeDeck(save.tiles, faction.id),
      risk: save.nest.risk,
      stability: save.nest.stability,
      build: save.build,
      evolution: save.evolution,
    });
    resumeNote = '';
    saveProgress(exp); // 이어하던 원정이 있었다면 여기서 덮어쓴다 = 패배 처리 없이 버려진다
    showExpedition(faction, exp, `${faction.huntingGroundName}으로 출발!`);
  }

  /** 저장된 원정으로 돌아간다: 저장된 시점의 화면(전투 직전·흡수·둥지 칸 귀환 선택·이동 중)으로 복원 */
  function resumeExpedition(exp: ExpeditionState, speed: number): void {
    const faction = getFaction(exp.factionId);
    setSpeed(speed);
    if (exp.phase === 'battle') runBattle(faction, exp);
    else if (exp.phase === 'absorb') afterBattle(faction, exp);
    else if (drainEvents(exp).length > 0) breakthroughScreen(faction, exp, () => showExpedition(faction, exp, '원정을 이어간다'));
    else showExpedition(faction, exp, '원정을 이어간다');
  }

  function runBattle(faction: FactionConfig, exp: ExpeditionState): void {
    const p = exp.pending!;
    const s = startBattle(exp);
    const where = `${exp.lap}바퀴 · ${p.cell}번 칸${p.tileId ? ` · ${tileName(p.tileId, faction.id)}` : ''}${p.combo ? ' · 조합!' : ''}`;
    battleView(root, faction, s, {
      banner: where,
      tutorial: tutorialFor(),
      onEnd: (done) => {
        finishBattle(exp, done);
        saveProgress(exp); // 전투가 끝날 때마다 저장 (흡수 대기 중이면 그 상태째)
        afterBattle(faction, exp);
      },
    });
  }

  /** 승리 후 흡수 가능하면 흡수 화면 → 한계 돌파 연출 → 원정으로 돌아간다 */
  function afterBattle(faction: FactionConfig, exp: ExpeditionState): void {
    const proceed = () => {
      saveProgress(exp);
      const next = () => (exp.phase === 'ended' ? endExpedition(faction, exp) : showExpedition(faction, exp, '전투 승리!'));
      if (drainEvents(exp).length > 0) breakthroughScreen(faction, exp, next);
      else next();
    };
    if (exp.phase === 'absorb') absorbView(root, faction, exp, proceed);
    else proceed();
  }

  function showExpedition(faction: FactionConfig, exp: ExpeditionState, msg = ''): void {
    expeditionView(root, faction, exp, {
      onBattle: () => runBattle(faction, exp),
      onSave: () => saveProgress(exp),
      onEnded: () => endExpedition(faction, exp),
      onBreakthrough: (resume) => breakthroughScreen(faction, exp, resume),
      openHelp: (onClose) => openHelp('expedition', null, onClose),
    }, msg);
  }

  /** 한계 돌파 연출 (텍스트 수준). 정식 결과(폭주·진화 정체·가면 분기)는 미정이라 임시 페널티만 있다 */
  function breakthroughScreen(faction: FactionConfig, exp: ExpeditionState, resume: () => void): void {
    breakthroughView(root, faction, exp.risk, resume);
  }

  function endExpedition(faction: FactionConfig, exp: ExpeditionState): void {
    if (save) {
      recordExpedition(save, exp);
      persist();
    }
    resultView(root, faction, exp, save?.nest.stability ?? exp.stability, nestScreen);
    if (save) showTitleToasts(save, faction, persist);
  }

  // ── 전투 연습 (C.6: 새 전투 화면, 둥지 빌드 그대로) ──
  function practiceScreen(faction: FactionConfig): void {
    practiceListView(root, faction, save?.runLog.battles.length ?? 0, { onPick: (enemy) => practiceBattle(faction, enemy), onHome: nestScreen });
  }

  function practiceBattle(faction: FactionConfig, enemy: EnemyDef): void {
    const params = save ? buildCombatParams(save.build) : undefined;
    if (save && params) {
      applyEvolutionToParams(params, save.evolution);
      params.storedStartGauge = storedStartGaugeOf(save.nest.stability);
    }
    const s = createCombat(Math.floor(Math.random() * 2 ** 32), { enemy, params });
    battleView(root, faction, s, {
      tutorial: tutorialFor(),
      onQuit: () => practiceScreen(faction),
      onEnd: (done) => {
        if (save) {
          recordBattle(save, buildBattleRecord(done, { factionId: faction.id, tierIndex: save.evolution.tierIndex }));
          persist();
        }
        practiceResult(faction, enemy, done);
      },
    });
  }

  function practiceResult(faction: FactionConfig, enemy: EnemyDef, s: CombatState): void {
    practiceResultView(root, faction, enemy, s, { onAgain: () => practiceBattle(faction, enemy), onMenu: () => practiceScreen(faction) });
  }

  if (save) nestScreen();
  else factionScreen();
}
