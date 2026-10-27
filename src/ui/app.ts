// 화면 흐름: 종족 선택 → 둥지 → 원정(12칸 길) → 전투 → 원정 결과 → 둥지. DOM/CSS 만 쓴다.
// 화면 텍스트는 FactionConfig·데이터 스킨에서 읽고, 종족 id 로 분기하지 않는다.
import { ENEMIES } from '../data/enemies';
import { FACTIONS, getFaction } from '../data/factions';
import type { EnemyDef } from '../data/schema';
import { mutationName, synergyName, tileName } from '../data/tiles';
import { buildBattleRecord, createCombat, liberationStartGaugeOf, type CombatState } from '../engine/combat';
import { buildCombatParams } from '../engine/absorb';
import { applyEvolutionToParams, baseStatsOf, formDisplayName, isFailLine, playerElementsOf } from '../engine/evolution';
import { applyDifficultyToParams, enemyAtDifficulty, recommendedDifficulty } from '../engine/difficulty';
import { TITLES, titleName } from '../data/titles';
import type { GrowthInput } from './bha/growthLogic';
import { abortExpedition, applyCareToParams, bossSetupOf, canAbortBattle, createExpedition, rerollAbsorb, drainEvents, finishBattle, inFrenzy, serializeExpedition, startBattle, storyEpisodeOf, summarize, takeStoryCue, type ExpeditionState } from '../engine/expedition';
import { getEpisode, type StoryLine } from '../data/story';
import { chapterLabel, storyView, type DepartTab } from './storyView';
import { towerResultView, towerView } from './towerView';
import { createTowerCombat, towerFloor, type TowerFloor } from '../engine/tower';
import { difficultyText, towerFloorText, towerLabels } from '../engine/faction';
import { absenceText, careBlockText } from './bha/roomLogic';
import type { AbsenceReport } from '../engine/nest';
import { playDialogue } from './dialogueView';
import type { FactionConfig } from '../engine/faction';
import {
  absenceOf, battleCareOf, careBlock, departCareOf, fastForward, performRevive, applyStartLook, artSkinOf, firstRunPending, tilesUnlocked, claimDexRewards, claimTutorialGoals, liberationAccess, loadSave, newSaveData, nextRunId, rankChallenge, readActiveExpedition, recordBattle, recordExpedition, recordRankBattle, resumeTarget, accrueIdle, claimIdle, idleClaimable, tickIdle, type IdleAccrual,
  performRebirth, recordTraining, recordTowerBattle, settleLiberationRisk, type SaveData,
  canSwitchFaction, feedHogyoku, liberateHogyoku, performFusion, statBonusOf, switchTrack, defaultDifficulty, streakFor, bossesBeaten,
} from '../game';
import { fusionConfirmView, fusionFinalText, fusionView, hogyokuView } from './hogyokuView';
import { rebirthConfirmView, rebirthFinalText, rebirthView } from './rebirthView';
import { beginTraining, trainingGate, trainingLevel, type TrainingGameId } from '../engine/training';
import { trainingPlayView, trainingResultView, trainingTitle, trainingView, type TrainingScreenId } from './trainingView';
import type { RankHolderDef } from '../data/ranks';
import { rankLabel, rankResultView, rankView } from './rankView';
import { armEnterFx } from './bha/cosmeticFx';
import { photoView } from './photoView';
import { absorbView } from './absorbView';
import { battleView } from './battleView';
import { arenaSceneBg, groundSceneBg, towerSceneBg } from './bha/sceneBg';
import { applyTheme } from './bha/theme';
import { speciesView, startView } from './startView';
import { enterFullscreenOnStart, watchFullscreen } from './fullscreen';
import { slotPickView, type SlotPickMode } from './slotView';
import { confirmDialog } from './confirmDialog';
import { signalHold } from './bha/hold';
import { IDLE, rotateStep, type RotateEvent, type RotateState } from './bha/rotateResume';
import { getOverlayHost, registerLayer } from './bha/overlayHost';
import { button, el, mountApp } from './bha/dom';
import { allSlotSummaries, collectSlotChunks, deleteSlot, lastPlayedSlot, slotKey, stashSlot, touchSlot, writeSlotSave } from '../saveSlots';
import { monoNow } from './bha/expClock';
import { forgetConfirmedChunks, isChunkStorageKey } from '../saveCodec';
import { backupFileName, exportRawSlot, needsMigration, recoverFromBackup } from '../saveBackup';
import { setBgm } from './bgm';
import type { BgmTrack } from '../data/audio/bgm';
import { BALANCE } from '../config/balance';
import { idleCounts } from '../engine/idle';
import { breakthroughView } from './breakthroughView';
import { practiceListView, practiceResultView } from './practiceView';
import { abortSummaryLine, resultView } from './resultView';
import { expeditionView, setSpeed } from './expeditionView';
import { planView } from './planView';
import { bookView } from './bookView';
import { showTitleToasts } from './titleDexView';
import { formName } from '../data/evolution';
import { evolutionView } from './evolutionPanel';
import { roomView } from './roomView';
import { careView, chestView, openChestAtGear } from './lcdScreens';
import { createDevice } from './bha/device';
import { ScreenStack } from './bha/select';
import { roomOf } from '../engine/faction';
import { openGrounds } from '../data/grounds';
import { applySettingsNow, settingsView } from './settingsView';
import { parseSlotSettings, setSlotSettingsHost } from './settingsScope';
import { backupView } from './backupView';
import { helpOverlay, type HelpScreenId } from './helpView';
import { guidePending, markGuideDone, markTutorialSeen, queueGuide, shouldAutoShowTutorial, type GuideId, type TextGuideId } from '../engine/tutorial';
import { playBirth } from './birthFx';
import { pickFaction } from '../data/schema';
import { playWarning } from './warningView';
import { warningKind } from './warningLogic';
import { showGuide, tutorialAbsorbView } from './guideView';
import { showDexToasts, showTutorialToasts, tutorialGoalsView } from './tutorialGoalsView';
import { showToast } from './bha/nest';
import { carriedPet } from '../engine/pet';
import { applyGearToParams, gearCarry } from '../engine/gear';
import { gearDropText, gearNoticeOf, petNoticeOf } from '../inventory';
import { toward } from './bha/nestLogic';
import { shopView } from './shopView';
import { idleBadge, refreshIdleBadge, showIdlePanel, showIdleReturn } from './idleView';
import { deleteTilePreset, ownedTileList, placementLimitOf, renameTilePreset, saveTilePreset, tilePresetsFor } from '../tilePresets';
import { applyCosmetics } from './bha/cosmetics';
import { initTamago } from './bha/tamago';
import { accruePlay } from './bha/tamagoLogic';
import type { WearState } from '../game';
import { useRerollTicket } from '../shop';
import { clearTestSlot, newTestSave, testBattleEnemy, testStorage, type FullStorage, type TestBattleChoice } from '../engine/testMode';
import { initTestMode, testSpeed } from './testMode';
import { testPanelView, type TestTab } from './testModePanel';
import { shownName } from './displayName';

/** 칭호 id → 종족별 표기 이름 */
function titleLabel(id: string, factionId: string): string {
  const t = TITLES.find((x) => x.id === id);
  return t ? titleName(t, factionId) : id;
}

export function startApp(host: HTMLElement): void {
  // 테스트 모드 (GDD 38장): 켜져 있으면 세이브 키를 모두 테스트 칸(bha-save-test…)으로 바꿔 끼운 저장소를 쓴다 — 진짜 세이브는 읽지도 쓰지도 않는다
  const testOn = initTestMode();
  const store: FullStorage = testOn ? testStorage(localStorage) : localStorage;
  if (testOn) setSpeed(testSpeed());
  // 세이브 슬롯 (Q-3): 시작 화면에서 슬롯을 고르기 전에는 세이브가 없다. slot = 지금 플레이 중인 슬롯(1~3), 0 = 시작 화면
  let save: SaveData | null = null;
  let slot = 0;
  // 덮어쓴 슬롯·지운 백업만 가리키던 압축 덩어리 정리 (C.72). 저장소가 막힌 환경이면 건너뛴다
  try {
    collectSlotChunks(store);
  } catch {
    /* 저장소 없음 */
  }
  // C.139: 다른 창이 저장소를 바꾸면(잠금 이전 버전 창 등) 확인해 둔 덩어리 해시를 잊는다 — 다음 저장이 덩어리 존재를 다시 본다
  window.addEventListener('storage', (e) => {
    if (isChunkStorageKey(e.key)) forgetConfirmedChunks(store);
  });
  /** 지금 진행 중인 원정 (처음 화면으로 돌아갈 때 중간 저장하려고 들고 있는다) */
  let activeExp: ExpeditionState | null = null;
  let confirmingTitle = false;

  // 기기 틀(GDD 16장): 모든 화면은 LCD 창(dev.view) 안에 그린다. 뒤로 = 열린 창·레이어 닫기(device) → 화면 스택 한 단계 뒤로 → 더 갈 곳이 없으면(방·잠긴 화면) 아무것도 안 함.
  // 시작 화면 복귀 확인은 더보기 [처음 화면]으로만 (GDD 104장 7, C.176 — 예전엔 갈 곳이 없으면 처음 화면 확인을 띄웠다)
  const nav = new ScreenStack();
  const dev = createDevice(host, {
    onCancel: () => nav.back(),
    canCancel: () => nav.canBack,
    onRotate: (rotated) => rotateEvent(rotated ? 'portrait' : 'landscape'),
  });
  const root = dev.view;
  // 다마고치 모드 (GDD 27장): 기기 둘레 몸체·키링·뒷면. 꾸밈을 걸 때마다 지금 캐릭터를 알려 준다
  const tama = initTamago(dev, { persist: () => persist() });
  const dress = (wear: WearState | null) => {
    applyCosmetics(wear);
    tama.setContext(wear && save ? getFaction(save.factionId) : null, wear ? save : null);
  };
  // 놀던 시간 (세이브 machine 기록, 화면에는 안 나옴): 슬롯을 열고 화면이 보이는 동안만 센다. 저장은 평소 저장 때 같이 된다
  let playTick = monoNow(); // C.139: 경과 시간은 단조 시계
  const tickPlay = () => {
    const now = monoNow();
    if (save && slot !== 0 && !document.hidden) save.machine.playMs = accruePlay(save.machine.playMs, playTick, now);
    playTick = now;
  };
  window.setInterval(tickPlay, 15_000);
  // 대기 보상 상시 (GDD 95장 B1): 켜 둔 동안(방·원정·전투) 1분마다 흐른 시간을 받을 보상에 쌓고, 방이면 아이콘 배지를 고친다. 저장은 평소 저장 때 같이 된다
  window.setInterval(() => {
    if (!save || slot === 0) return;
    const alive = !save.nest.dead;
    tickIdle(save);
    refreshIdleBadge(root, save);
    // 빈사 시간이 켜 둔 동안 다 됐다 (GDD 102장 수정): 저장하고 방이면 사망 화면으로
    if (alive && save.nest.dead) {
      persist();
      if (nav.top?.id === 'room') nestScreen();
    }
  }, 60_000);
  watchFullscreen();
  document.addEventListener('visibilitychange', tickPlay);
  /** 화면 하나를 스택에 쌓고 그린다 (그릴 때마다 창 스크롤을 맨 위로). 배경 음악(GDD 24-4): 둥지 메뉴 화면은 nest, 잠긴 흐름(전투·원정·연출)은 그 화면이 정한다(null) */
  const open = (id: string, render: () => void, locked = false, track: BgmTrack | null = locked ? null : 'nest') =>
    nav.push({ id, locked, render: () => { if (track) setBgm(track); render(); root.scrollTop = 0; } });

  const persist = () => {
    if (!save || slot === 0) return;
    // 튜토리얼 보상 (GDD 23-3): 저장할 때마다 새로 이룬 목표를 판정해 바로 지급하고 토스트. 기존 세이브는 처음 저장 때 한꺼번에
    showTutorialToasts(claimTutorialGoals(save), getFaction(save.factionId));
    // 도감 보상 (GDD 24-3): 같은 틀·같은 토스트. 기존 세이브는 처음 저장 때 이미 닿은 이정표를 한꺼번에
    showDexToasts(claimDexRewards(save), getFaction(save.factionId));
    tickIdle(save); // 켜 둔 동안 대기 보상(95장 B1)을 쌓고 마지막 접속(정산) 시각을 지금으로 (GDD 24-1)
    // 마지막 화면 키 (GDD 19-3): 원정 흐름(배치 후 출발 ~ 결과 전) 안이면 원정, 아니면 방
    save.lastScreen = activeExp !== null && activeExp.phase !== 'ended' ? 'expedition' : 'room';
    // 저장 공간 부족 (C.70): 백업을 지워 썼거나 그래도 못 썼으면 한 번씩 알린다 (예전에는 말없이 진행이 사라졌다)
    const w = writeSlotSave(store, save, slot);
    if (w !== 'ok' && !storageWarned.has(w)) {
      storageWarned.add(w);
      showToast(w === 'freed'
        ? { eyebrow: '저장 공간', title: '공간이 부족해 백업을 지웠다', meta: '진행은 저장됐다. 설정 > 백업에서 내보내기를 해 두자.' }
        : { eyebrow: '저장 공간', title: '저장 공간이 가득 차 저장하지 못했다', meta: '설정 > 백업에서 내보내기를 하고 쓰지 않는 슬롯을 비우자.' }, 0, 5200);
    }
    touchSlot(store, slot);
  };
  const storageWarned = new Set<string>();
  /** 이어하기를 숨긴 이유 안내 한 줄 (손상·버전 불일치). 다음 원정을 시작하면 지운다 */
  let resumeNote = '';
  /** 꺼 둔 동안 배고파졌으면 방에 처음 들어갈 때 한 번 말한다 (GDD 24-1) */
  let hungryGreet = false;
  /** 다시 열 때 꺼 둔 동안 (GDD 102-7): 방이 그려진 뒤 알림 띠 한 번 */
  let absence: AbsenceReport | null = null;
  /** 대기 모드 결과 (GDD 85장 6번): 다시 열 때 정산한 요약 — 방을 그린 뒤 한 번 보여 주고 비운다 */
  let idleReport: IdleAccrual | null = null;
  /** 떠돌이 상인 도착을 알린 방문 시각 (GDD 85장 5번): 같은 방문은 한 번만 알린다 */
  let wandererAnnounced = -1;
  /** 방 안내(GDD 64·67장)를 잠시 미룬다: 귀환 결과 다음에 진화 연출이 뜰 차례면 연출이 끝나고 방으로 돌아올 때 띄운다 */
  let holdRoomGuides = false;
  /** 안내 오버레이가 떠 있다 (방을 다시 그려도 겹쳐 띄우지 않는다) */
  let guideOpen = false;

  /** 한 번만 뜨는 안내 (C.120): 띄울 차례면 띄우고 본 것으로 저장. 띄웠으면 true */
  function runGuide(id: TextGuideId, faction: FactionConfig, o: { finishLabel?: string; pauseLabel?: string; onDone?: () => void } = {}): boolean {
    if (!save || guideOpen || !guidePending(save.help, id)) return false;
    guideOpen = true;
    showGuide(faction, id, { ...o, onDone: () => {
      guideOpen = false;
      markGuideDone(save!.help, id);
      persist();
      o.onDone?.();
    } });
    return true;
  }

  /** 첫 시작 탄생 연출이 재생 중이다 (GDD 74장, C.126) */
  let birthOpen = false;
  /** 새 세이브가 방에 처음 들어올 때 한 번: help.guides['birth'] 가 pending 이면 재생하고 본 것으로 저장. 연출이 없는 종족은 바로 본 것으로 */
  function runBirth(faction: FactionConfig): void {
    if (!save || birthOpen || !guidePending(save.help, 'birth')) return;
    const room = () => root.querySelector<HTMLElement>('.bha-room');
    const h = playBirth(faction, {
      onReveal: () => {
        const r = room();
        r?.classList.remove('is-birthing');
        r?.classList.add('is-born');
        window.setTimeout(() => room()?.classList.remove('is-born'), 800);
      },
      onDone: () => {
        birthOpen = false;
        if (!save) return;
        markGuideDone(save.help, 'birth');
        persist();
      },
    });
    if (!h) {
      markGuideDone(save.help, 'birth');
      persist();
      return;
    }
    birthOpen = true;
    room()?.classList.add('is-birthing');
  }

  /** 원정 중간 저장 (GDD 14-1). 끝난 원정은 저장하지 않는다 (recordExpedition 이 영역을 비운다) */
  const saveProgress = (exp: ExpeditionState) => {
    if (!save || exp.phase === 'ended') return;
    save.activeExpedition = serializeExpedition(exp, 1); // 배속은 C.118 에 삭제 — 늘 1 (GDD 62장, 세이브 형식은 그대로)
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
  function openHelp(screen: HelpScreenId | undefined, canReplay: boolean, onClose: () => void = () => {}): void {
    const faction = helpFaction();
    // canReplay 가 false 면(원정 화면: 시간이 흐르는 화면 위에서 체험 전투로 갈아타지 않는다) 다시 보기는 숨긴다
    // 첫 걸음 목표 (GDD 100장 #80): ··· 메뉴의 '튜토리얼' 대신 도움말 머리 [목표] — 세이브가 있고 화면을 바꿔도 되는 곳에서만
    const s = save;
    const onGoals = canReplay && s ? () => open('tutorials', () => tutorialGoalsView(root, getFaction(s.factionId), s, () => tutorialDemo(getFaction(s.factionId)))) : undefined;
    helpOverlay(faction, { screen, onClose, onReplayTutorial: canReplay ? () => tutorialDemo(faction) : undefined, replays: canReplay ? guideReplays(faction) : undefined, onGoals });
  }

  /** 안내 다시 보기 (GDD 64장 3번·67장 4번): 첫 원정 안내(걷기·조우 → 흡수 4갈래 → 다음 할 일), 타일 안내(받은 타일 → 덱·배치·조합 → 뽑기)는 타일이 열린 뒤에만 */
  function guideReplays(faction: FactionConfig): { label: string; run: () => void }[] {
    const chain = (ids: (TextGuideId | 'first-absorb')[]) => () => {
      const next = (i: number): void => {
        if (i < ids.length) showGuide(faction, ids[i]!, { finishLabel: i === ids.length - 1 ? '닫기' : '다음 안내', onDone: () => next(i + 1) });
      };
      next(0);
    };
    const out = [{ label: '첫 원정 안내', run: chain(['first-run', 'first-absorb', 'first-run-room']) }];
    if (faction.birthFx) out.push({ label: '탄생 연출', run: () => void playBirth(faction) });
    if (save && tilesUnlocked(save)) out.push({ label: '타일 안내', run: chain(['tile-intro', 'tile-plan', 'tile-draw']) });
    return out;
  }

  /** 튜토리얼 다시 보기: 연습 상대 하나와의 체험 전투를 튜토리얼과 함께 연다. 결과는 기록하지 않는다 */
  function tutorialDemo(faction: FactionConfig): void {
    open('tutorial-demo', () => runTutorialDemo(faction), true);
  }

  function runTutorialDemo(faction: FactionConfig): void {
    // 체험 전투의 적 = 내 단계의 권장 난이도 ★ (GDD 32-1)
    const star = recommendedDifficulty(save?.evolution.tierIndex ?? 0);
    const enemy = enemyAtDifficulty(ENEMIES.find((e) => e.class === 'normal' && !e.testOnly) ?? ENEMIES[0]!, star);
    const params = save ? buildCombatParams(save.build, faction.id) : undefined;
    if (save && params) {
      applyEvolutionToParams(params, save.evolution, faction.id, statBonusOf(save).total, save.training.completed);
      applyDifficultyToParams(params, star);
      params.liberationStartGauge = liberationStartGaugeOf(save.nest.stability);
    }
    const s = createCombat(Math.floor(Math.random() * 2 ** 32), { enemy, params });
    setBgm('battle');
    battleView(root, faction, s, {
      tierIndex: save?.evolution.tierIndex,
      skinId: save ? artSkinOf(save) : undefined,
      formId: save?.evolution.formId,
      notice: '튜토리얼 체험 전투 (기록되지 않음)',
      tutorial: { onDone: () => { if (save) { markTutorialSeen(save.help); persist(); } } },
      onQuit: () => nav.pop(),
      onEnd: () => nav.pop(),
    });
  }

  // ── 시작 화면·슬롯 (Q-3) ──
  // C.178 (GDD 103장): 시작 화면·종족 고르기에서 연 설정은 공통만, 게임 안(방)에서 연 설정은 [공통]/[이 슬롯]. 저장 안 하고 뒤로면 설정 화면이 먼저 묻고 onBack
  const settingsOpener = (inGame: boolean) => () =>
    open('settings', () => void settingsView(root, {
      onHelp: () => openHelp(undefined, true),
      onBackup: inGame && !testOn ? () => open('backup', () => backupView(root, save, persist, { slot, onApplied: reloadSlot })) : undefined,
      onBack: () => nav.pop(),
      commonOnly: !inGame,
    }));

  /** 슬롯 설정 (GDD 103장 5): 이 슬롯 세이브의 settings 를 설정 화면·실제 값에 건다. 슬롯을 열 때마다, 시작 화면이면 푼다 */
  function bindSlotSettings(): void {
    const n = slot;
    setSlotSettingsHost(save && n !== 0 ? {
      label: `슬롯 ${n}`,
      read: () => parseSlotSettings(save?.settings),
      write: (s) => {
        if (!save) return;
        save.settings = s as Record<string, boolean | number> | null;
        persist();
      },
    } : null);
    applySettingsNow();
  }

  /** 가져오기·되돌리기가 끝난 뒤: 그 슬롯을 저장소에서 다시 읽어 방으로 */
  function reloadSlot(): void {
    enterSlot(slot);
  }

  /** 시작 화면으로: 스택을 비우고 처음 화면 하나만 남긴다 */
  function titleScreen(note = ''): void {
    setBgm('nest');
    save = null;
    dress(null);
    slot = 0;
    bindSlotSettings();
    activeExp = null;
    rotate = IDLE;
    renderRotateCard();
    armBackTrap();
    nav.reset({ id: 'title', render: () => { renderTitle(note); root.scrollTop = 0; } });
  }

  function renderTitle(note = ''): void {
    const sums = allSlotSummaries(store);
    const last = lastPlayedSlot(sums);
    // 시작 화면의 테마: 가장 최근 슬롯의 종족, 없으면 등록된 첫 종족 (종족 id 로 분기하지 않는다)
    const lastSum = sums.find((x) => x.slot === last);
    applyTheme(lastSum && lastSum.state === 'ok' ? getFaction(lastSum.factionId) : FACTIONS[0]!);
    startView(root, sums, {
      onNew: () => {
        enterFullscreenOnStart(store);
        open('slot-new', () => renderSlotPick('new'));
      },
      // 이어하기 (GDD 19-3): 슬롯 선택 없이 가장 최근 슬롯을 마지막으로 보던 화면부터
      onContinue: () => {
        enterFullscreenOnStart(store);
        const n = lastPlayedSlot(allSlotSummaries(store));
        if (n !== null) enterSlot(n);
      },
      onSettings: settingsOpener(false),
      onImport: () => {
        enterFullscreenOnStart(store);
        open('slot-load', () => renderSlotPick('load'));
      },
      // 열 수 없는 형식 슬롯의 옛 세이브 내보내기 (GDD 61장): 원문 그대로 파일로 내려받는다(막히면 알림)
      onExportOld: (n) => exportOldSlot(n),
    }, note);
  }

  function exportOldSlot(n: number): void {
    const r = exportRawSlot(store, n);
    if (!r) return void showToast({ eyebrow: '내보내기', title: `슬롯 ${n}을 내보낼 수 없다`, meta: '세이브가 비었거나 읽을 수 없다.' }, 0, 4200);
    const name = backupFileName({ meta: { format: r.format } as SaveData['meta'] });
    try {
      const url = URL.createObjectURL(new Blob([r.text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast({ eyebrow: '내보내기', title: `슬롯 ${n} 옛 세이브를 저장했다`, meta: name }, 0, 4200);
    } catch {
      showToast({ eyebrow: '내보내기', title: '파일 저장이 막혀 있다', meta: '브라우저 설정을 확인한다.' }, 0, 4200);
    }
  }

  function renderSlotPick(mode: SlotPickMode, selected?: number | null): void {
    const sums = allSlotSummaries(store);
    slotPickView(root, mode, sums, FACTIONS, (sum) => {
      if (mode === 'load') {
        if (sum.state === 'ok' || (sum.state === 'broken' && sum.recoverable)) enterSlot(sum.slot);
      } else if (mode === 'new') {
        const begin = () => open('species', () => renderSpecies(sum.slot));
        if (sum.state === 'empty') begin();
        else confirmDialog({
          title: `슬롯 ${sum.slot}을 덮어쓸까요?`,
          body: '이 슬롯의 기록이 새 세이브로 바뀝니다. 덮어쓰기 전의 세이브는 슬롯 백업에 한 번 보관됩니다.',
          yes: '덮어쓰기', no: '아니오', danger: true,
          onYes: begin,
        });
      } else {
        open('backup-import', () => backupView(root, null, () => {}, { slot: sum.slot, importOnly: true, onApplied: () => enterSlot(sum.slot) }));
      }
    }, {
      onImport: () => open('slot-import', () => renderSlotPick('import')),
      selected,
      onDelete: (sum) => confirmDialog({
        title: `슬롯 ${sum.slot}을 지울까요?`,
        body: `슬롯 ${sum.slot}을 지운다. 되돌릴 수 없다. 지우기 전의 세이브는 슬롯 백업에 한 번 보관된다.`,
        yes: '지우기', no: '아니오', danger: true,
        onYes: () => {
          if (!deleteSlot(store, sum.slot)) showToast({ eyebrow: '슬롯', title: '지우지 못했다', meta: '저장소가 막혀 있다.' }, 0, 4200);
          renderSlotPick(mode, sum.slot);
        },
      }),
    });
  }

  /** 종족 고르기: 새 슬롯에 새 세이브를 만든다. (C.63: 방에서 지금 세이브의 종족을 바로 바꾸던 옛 길은 지웠다 — 다른 종족은 5단계 도달 뒤 트랙 전환으로만, GDD 22-3·28장 7번) */
  function renderSpecies(newSlot: number): void {
    applyTheme(helpFaction());
    speciesView(root, FACTIONS, {
      onPick: (f) => {
        stashSlot(store, newSlot);
        slot = newSlot;
        save = testOn ? newTestSave(f.id) : newSaveData(f.id);
        if (!testOn) {
          applyStartLook(save, f, Math.random());
          queueGuide(save.help, 'birth'); // 새 세이브의 첫 방에서 탄생 연출 한 번 (GDD 74장)
        }
        persist();
        bindSlotSettings();
        nestScreen();
      },
      onSettings: settingsOpener(false),
      onHelp: () => openHelp(undefined, true),
      confirm: (f, onYes, onNo) => confirmDialog({
        title: `${f.name} — 이 종족으로 시작할까요?`,
        yes: '시작', no: '아니오',
        onYes, onNo,
      }),
    });
  }

  /** 슬롯을 열어 마지막으로 보던 화면으로 (GDD 19-3): 원정 중이었으면 원정 그 지점(전투 중이었으면 전투 직전), 아니면 방. 읽을 수 없으면 시작 화면에 알린다 */
  function enterSlot(n: number): void {
    // 세이브 형식 마이그레이션 직전 자동 백업 (GDD 24-5): 옛 형식이면 원문을 슬롯 백업에 보관한 뒤 올린다
    let raw: string | null = null;
    try {
      raw = store.getItem(slotKey(n));
    } catch {
      raw = null;
    }
    let loaded = loadSave(store, slotKey(n));
    // 손상된 세이브 (C.70): 백업이 읽히면 맞바꿔 연다(손상본은 백업 자리에 남는다). 백업도 안 되면 시작 화면에 알린다
    const recovered = !loaded && recoverFromBackup(store, n);
    if (recovered) loaded = loadSave(store, slotKey(n));
    if (!loaded) return titleScreen(`슬롯 ${n}의 세이브를 읽을 수 없다.`);
    if (recovered) window.setTimeout(() => showToast({ eyebrow: '세이브 복구', title: `슬롯 ${n}을 백업에서 열었다`, meta: '세이브가 손상되어 마지막 백업으로 이어한다.' }, 0, 5200), 600);
    else if (needsMigration(raw)) stashSlot(store, n, 'migration');
    save = loaded;
    slot = n;
    bindSlotSettings();
    activeExp = null;
    dress(loaded.wear);
    playTick = Date.now();
    resumeNote = '';
    // 대기 모드 (GDD 85장 6번·92장): 꺼 둔 실제 시간을 받을 보상에 쌓는다(합계 최대 24시간, 지급은 [받기]) — 허기·접속 시각 갱신(applyAbsence)보다 먼저
    idleReport = slot !== 0 ? accrueIdle(loaded) : null;
    // 꺼 둔 동안 허기 (GDD 24-1): 원정 중간 저장이 있으면 오르지 않는다
    absence = absenceOf(loaded);
    hungryGreet = absence.flow.hunger >= BALANCE.provisional.nest.idleHungerNotice;
    armBackTrap();
    const active = resumeTarget(loaded) === 'expedition' ? readActiveExpedition(loaded) : null;
    if (active?.ok) {
      activeExp = active.exp;
      persist(); // 마지막 플레이 시각 기록(+ 로드 때 해금된 칭호 저장)
      // 원정 흐름은 취소로 빠지지 않는다(locked). 끝나면 nestScreen 이 방으로 스택을 다시 깐다
      nav.reset({ id: 'expedition', locked: true, render: () => { resumeExpedition(active.exp); root.scrollTop = 0; } });
      return;
    }
    // 손상·구버전 원정이면 readActiveExpedition 이 비웠다 → 방에서 안내 한 줄 (renderRoom 이 다시 확인)
    persist();
    nestScreen();
  }

  // ── 세로 전환 멈춤·가로 복귀 카운트다운 (Q-3): 전투·원정 중에 세로로 돌리면 멈추고, 가로로 돌아오면 3초 뒤 이어한다 ──
  let rotate: RotateState = IDLE;
  let rotateCard: { layer: HTMLElement; off: () => void; text: HTMLElement; actions: HTMLElement } | null = null;
  let rotateTimer: ReturnType<typeof setInterval> | undefined;

  function rotateEvent(ev: RotateEvent): void {
    if (confirmingTitle) return; // 처음 화면 확인창이 이미 게임을 멈추고 있다
    const inGame = !!root.querySelector('.bha-battle, .bha-exp');
    const r = rotateStep(rotate, ev, inGame);
    rotate = r.state;
    if (r.effect === 'hold') signalHold('hold');
    if (r.effect === 'release') signalHold('release');
    renderRotateCard();
  }

  function renderRotateCard(): void {
    clearInterval(rotateTimer);
    rotateTimer = undefined;
    if (rotate.phase === 'idle') {
      rotateCard?.off();
      rotateCard?.layer.remove();
      rotateCard = null;
      return;
    }
    if (!rotateCard) {
      const layer = el('div', 'bha-overlay bha-overlay--in-app bha-confirm');
      layer.setAttribute('role', 'alertdialog');
      layer.setAttribute('aria-modal', 'true');
      const modal = el('div', 'bha-modal');
      const text = el('p', 'bha-modal__body');
      const actions = el('div', 'bha-modal__actions');
      modal.append(el('h2', 'bha-modal__title', '일시정지'), text, actions);
      layer.append(modal);
      getOverlayHost().append(layer);
      rotateCard = { layer, off: registerLayer(layer, () => rotateEvent('cancel')), text, actions };
    }
    const c = rotateCard;
    const resume = button({ label: rotate.phase === 'counting' ? '지금 계속' : '계속', variant: 'primary', onClick: () => rotateEvent('resume') });
    if (rotate.phase === 'counting') {
      c.text.textContent = `가로로 돌아왔다. ${rotate.left}초 뒤 이어서 한다.`;
      c.actions.replaceChildren(button({ label: '취소', variant: 'ghost', onClick: () => rotateEvent('cancel') }), resume);
      rotateTimer = setInterval(() => rotateEvent('tick'), 1000);
    } else {
      c.text.textContent = rotate.phase === 'portrait' ? '세로로 돌려서 멈췄다. 가로로 돌리면 3초 뒤 이어한다.' : '멈춰 있다. 준비되면 [계속]을 누른다.';
      c.actions.replaceChildren(resume);
    }
  }

  // ── 처음 화면으로 돌아가기 (Q-3): 더보기 [처음 화면] → 확인 → 저장 → 시작 화면 (C.176: 뒤로는 여기로 오지 않는다) ──
  function askReturnToTitle(): void {
    if (confirmingTitle || nav.top?.id === 'title') return;
    confirmingTitle = true;
    signalHold('hold'); // 전투·원정은 확인창이 떠 있는 동안 멈춘다
    const inExpedition = activeExp !== null && activeExp.phase !== 'ended';
    confirmDialog({
      title: '처음 화면으로 돌아갈까요?',
      body: inExpedition ? '원정은 지금 상태로 저장된다. 이어하기로 돌아오면 이어서 할 수 있다 (싸우던 전투는 처음부터 다시 시작한다).' : '지금 상태를 저장하고 시작 화면으로 돌아간다. 이어하기로 다시 열 수 있다.',
      yes: '예', no: '아니오',
      onYes: () => {
        confirmingTitle = false;
        signalHold('leave');
        if (activeExp && activeExp.phase !== 'ended' && activeExp.phase !== 'battle') saveProgress(activeExp); // 전투 직전 상태는 이미 저장돼 있다
        else persist();
        titleScreen();
      },
      onNo: () => {
        confirmingTitle = false;
        signalHold('release');
      },
    });
  }

  /** 브라우저 뒤로가기도 같은 취소로 받는다: 기록 한 칸을 더 쌓아 두고, 되돌아오면 취소 처리 후 다시 쌓는다. 시작 화면에서는 그대로 앱 밖으로 나가게 둔다 */
  function armBackTrap(): void {
    try {
      if (history.state?.bhaTrap !== true) history.pushState({ bhaTrap: true }, '');
    } catch {
      // history 를 못 쓰는 환경은 버튼·Esc 로만 돌아간다
    }
  }
  window.addEventListener('popstate', () => {
    if (nav.top === undefined || nav.top.id === 'title') return;
    dev.cancel();
    armBackTrap();
  });

  /** 홈(방)으로: 스택을 비우고 방 하나만 남긴다 */
  function nestScreen(): void {
    if (!save) return titleScreen();
    activeExp = null;
    nav.reset({ id: 'room', render: () => { renderRoom(); root.scrollTop = 0; } });
  }

  function renderRoom(): void {
    if (!save) return titleScreen();
    const faction = getFaction(save.factionId);
    applyTheme(faction);
    const s = save;
    dress(s.wear); // 꾸밈 착용 (GDD 25-9): 지금 트랙 것
    showTitleToasts(s, faction, persist);
    const active = readActiveExpedition(s);
    if (!active.ok && active.reason !== 'none') {
      persist(); // 손상·구버전 영역을 비운 것을 저장
      resumeNote = active.reason === 'version' ? '저장된 원정이 이전 버전이라 이어할 수 없어 지웠다.' : '저장된 원정이 손상되어 이어할 수 없어 지웠다.';
    }
    const props = roomOf(faction).props;
    setBgm('nest');
    // 새 세이브의 첫 방: 탄생 연출 (GDD 74장). 방이 그려진 직후에 덮는다
    if (guidePending(s.help, 'birth')) window.setTimeout(() => { if (nav.top?.id === 'room') runBirth(faction); }, 30);
    // 첫 원정 뒤 "다음 할 일", 첫 진화 뒤 "타일 3장" 안내 (GDD 67장 4번·64장 3번): 방을 그린 다음, 진화 연출이 남아 있으면 그 뒤에
    if (!holdRoomGuides) window.setTimeout(() => {
      if (nav.top?.id !== 'room' || holdRoomGuides) return;
      if (!runGuide('first-run-room', faction) && s.tiles.unlocked) runGuide('tile-intro', faction);
    }, 400);
    const greet = hungryGreet;
    hungryGreet = false;
    // 복귀 알림 띠 (GDD 102-7): "○시간 동안 비웠다 — 배부름 −n · …" + 이번에 쓰러졌거나 죽었으면 그 줄
    const away = absence;
    absence = null;
    if (away && away.hours * 60 >= BALANCE.provisional.idle.minMinutes) {
      const line = absenceText(away, faction);
      // 알림 띠는 한 줄(머리말 + 제목)이라 비운 시간·줄어든 양을 제목에 (C.170 알림 띠)
      const head = away.died ? '복귀 · 사망' : away.collapsed ? '복귀 · 빈사' : '복귀';
      window.setTimeout(() => showToast({ eyebrow: head, title: line, meta: '' }, 0, 5200), 300);
    }
    // 투트랙 개방·붕옥 탭 개방 알림 (GDD 22-3): 한 번만. 저장 때 뜨는 튜토리얼·도감 토스트와 겹치지 않게 조금 뒤에
    const notes: { eyebrow: string; title: string; meta: string }[] = [];
    if (s.trackNotice) {
      const opened = getFaction(s.trackNotice);
      notes.push({ eyebrow: '새 트랙', title: `${opened.name} 트랙이 열렸다`, meta: `같은 슬롯에서 새 ${opened.name} 캐릭터를 1단계부터 키운다. 이름표 옆 [${toward(opened.name)}] 버튼으로 바꾼다.` });
      s.trackNotice = null;
    }
    if (s.hogyoku.tabNotice) {
      notes.push({ eyebrow: '붕옥', title: '붕옥 탭이 열렸다', meta: '두 캐릭터가 모두 5단계에 닿았다. 더보기 ⋯ → [붕옥]' });
      s.hogyoku.tabNotice = false;
    }
    // 떠돌이 상인 (GDD 85장 5번): 이번 방문을 처음 보는 방이면 한 번 알린다
    const visit = s.shared.wanderer.visit;
    if (visit && visit.at !== wandererAnnounced) {
      wandererAnnounced = visit.at;
      notes.push({ eyebrow: '떠돌이 상인', title: '떠돌이 상인이 둥지에 왔다', meta: '상점 → [떠돌이 상인]. 다음 원정에서 돌아오면 떠난다.' });
    }
    if (notes.length > 0) {
      persist();
      window.setTimeout(() => notes.forEach((n, i) => showToast(n, i, 5200)), 2600);
    }
    // 대기 모드 복귀 창 (GDD 92장 2번): 방이 그려진 뒤 한 번 — [나중에]로 닫으면 보상은 방 '대기 보상' 아이콘에 남는다
    const claim = () => {
      const r = claimIdle(s);
      if (r) {
        persist();
        nav.top?.render();
      }
      return r;
    };
    const idle = idleReport;
    idleReport = null;
    // 가방 (GDD 109장 4번): 장비는 가방 첫 탭. 상태 화면 장비 바로가기는 가방 장비 탭으로 연다
    const openChest = () => open('chest', () => chestView(dev, faction, s, props.chest, persist, () => dress(s.wear)));
    const openEquip = () => {
      openChestAtGear();
      openChest();
    };
    // 복귀 창은 이번에 minMinutes 이상 꺼 두었고 받을 만큼 쌓였을 때만 — 켜 둔 동안 쌓인 것은 아이콘으로 (95장 B1)
    if (idle && idleCounts(idle.awayHours) && idleClaimable(s)) window.setTimeout(() => showIdleReturn(idle, s, faction, claim), 500);
    roomView(dev, faction, s, {
      greet: greet ? 'hungry' : null,
      resume: active.ok
        ? { info: `${active.exp.lap}바퀴 · ${active.exp.pos}번 칸`, onResume: () => open('expedition', () => resumeExpedition(active.exp), true) }
        : null,
      resumeNote,
      idle: { badge: idleBadge(s), onOpen: () => showIdlePanel(s, faction, claim) },
      persist,
      // 새 세이브의 첫 원정은 고정 길 튜토리얼 (GDD 67장)
      onDepart: () => (careBlocked(s) ? undefined : askDying(s, () => (firstRunPending(s) ? startTutorialRun(faction) : departScreen(faction)))),
      // 제단 = 해방 수련 (GDD 22-5). 진화 정보(옛 제단 화면)는 수련 화면 머리의 [진화 정보]. 사망이면 막힘, 빈사면 확인 창 (GDD 102장 수정)
      onAltar: () => (careBlocked(s) ? undefined : askDying(s, () => open('training', () => renderTraining(faction, s)))),
      // 부활 (GDD 102-3): 되돌릴 수 없어 자동 백업 후
      onRevive: () => {
        persist();
        stashSlot(store, slot, 'revive');
        const r = performRevive(s);
        if (!r.ok) return;
        persist();
        nestScreen();
        showToast({ eyebrow: '부활', title: `${faction.tierNames[0]}(으)로 다시 시작한다`, meta: `노력치 −${Math.round(r.evLoss * 100)}% · 진화 초기화` }, 0, 4200);
      },
      onBook: () => open('dex', () => bookView(root, faction, s)),
      onChest: openChest,
      onStatus: () => open('care', () => careView(dev, faction, s, '상태', persist, { onDex: () => open('dex', () => bookView(root, faction, s)), onHelp: () => openHelp('evolution', true), onRebirth: () => open('rebirth', () => renderRebirth(faction, s)), onGear: openEquip })),
      onSwitchTrack: canSwitchFaction(s) ? (fid) => {
        if (!switchTrack(s, fid)) return;
        persist();
        nestScreen();
        showToast({ eyebrow: '트랙 전환', title: `${getFaction(fid).name} 트랙`, meta: '키우기는 트랙마다 따로, 먹이·타일·영혼 결정은 같이 쓴다.' }, 0, 3000);
      } : null,
      onHogyoku: s.hogyoku.tabOpen ? () => open('hogyoku', () => renderHogyoku(s)) : null,
      onSettings: settingsOpener(true),
      onHelp: () => openHelp('nest', true),
      // 상점 (GDD 25-9): 골드 = 소모품·편의, 영옥 = 꾸밈
      onShop: () => open('shop', () => shopView(dev, faction, s, { persist, onWear: () => dress(s.wear) })),
      onPhoto: () => open('photo', () => photoView(dev, faction, s)),
      onTamago: () => tama.toggle(true),
      // 백업 화면은 진짜 저장소를 직접 다루므로 테스트 모드에서는 숨긴다 (38-2)
      onBackup: testOn ? null : () => open('backup', () => backupView(root, save, persist, { slot, onApplied: reloadSlot })),
      onTest: testOn ? () => open('test', () => renderTest(faction, s)) : null,
      onTitle: askReturnToTitle,
    });
  }

  // ── 붕옥 (GDD 22-3, C.59): 게이지·해방 → 합체 미리보기(확인 1) → 최종 확인(확인 2) → 자동 백업 'fusion' → 합체 → 연출 → 새 1단계 방 ──
  function renderHogyoku(s: SaveData): void {
    hogyokuView(dev, s, {
      onFeed: () => {
        if (feedHogyoku(s) > 0) persist();
        nav.top?.render();
      },
      onLiberate: () => {
        if (!liberateHogyoku(s)) return;
        persist();
        showToast({ eyebrow: '붕옥', title: '붕옥 해방', meta: `두 캐릭터 모두 전 능력치 +${Math.round(BALANCE.provisional.hogyoku.liberatedBonus * 100)}%` }, 0, 3600);
        nav.top?.render();
      },
      onPreview: () => open('fusion-confirm', () => renderFusionConfirm(s)),
    });
  }

  function renderFusionConfirm(s: SaveData): void {
    fusionConfirmView(dev, s, {
      onNext: (def) => {
        const t = fusionFinalText(def);
        confirmDialog({ title: t.title, body: t.body, yes: '합체', no: '그만둔다', danger: true, onYes: () => doFusion(s) });
      },
    });
  }

  function doFusion(s: SaveData): void {
    // 되돌릴 수 없는 일 직전 자동 백업 (GDD 24-5): 지금 상태를 저장하고 슬롯 백업에 보관한 뒤 합체한다
    persist();
    stashSlot(store, slot, 'fusion');
    const r = performFusion(s);
    if (!r.ok) return void nav.pop();
    persist();
    const faction = getFaction(s.factionId);
    nav.reset({ id: 'fusion-scene', locked: true, render: () => { setBgm('nest'); fusionView(root, faction, r.record, s, nestScreen); root.scrollTop = 0; } });
  }

  // ── 해방 수련 (GDD 22-4·22-5, C.54) ──
  function renderTraining(faction: FactionConfig, s: SaveData): void {
    trainingView(dev, faction, s, roomOf(faction).props.altar, {
      onPlay: (game) => playTraining(faction, s, game, false),
      onSwitch: (id) => switchTraining(faction, s, id),
    });
  }

  /** 수련장 세 화면(수련 · 훈련 인형 · 번호 쟁탈전)은 머리 제목 토글로 서로 바꿔 끼운다 — 뒤로는 늘 방으로 (GDD 99장 2, C.163) */
  function switchTraining(faction: FactionConfig, s: SaveData, id: TrainingScreenId): void {
    const render = id === 'practice' ? () => practiceScreen(faction) : id === 'rank' ? () => rankScreen(faction) : () => renderTraining(faction, s);
    nav.replace({ id: id === 'train' ? 'training' : id, locked: false, render: () => { setBgm('nest'); render(); root.scrollTop = 0; } });
  }
  const trainingHead = (faction: FactionConfig, id: TrainingScreenId): HTMLElement | undefined =>
    save ? trainingTitle(faction, roomOf(faction).props.altar, id, (to) => switchTraining(faction, save!, to)) : undefined;

  /** 한 판: 수련권을 먼저 쓰고(저장) 미니게임 → 결과. 흐름은 잠겨 있어 취소로 빠지지 않는다. again = 결과 화면의 [한 판 더](자리를 바꿔 끼운다) */
  function playTraining(faction: FactionConfig, s: SaveData, game: TrainingGameId, again: boolean): void {
    if (careBlocked(s)) return;
    if (!trainingGate(s.training, s.evolution.tierIndex, s.nest.condition).ok || !beginTraining(s.training)) return;
    persist();
    const level = trainingLevel(s.training, game);
    const seed = Math.floor(Math.random() * 2 ** 32);
    const e = {
      id: 'training-play', locked: true,
      render: () => {
        setBgm('battle');
        trainingPlayView(root, faction, game, level, seed, {
          onDone: (won) => {
            const out = recordTraining(s, game, won);
            persist();
            showTitleToasts(s, faction, persist);
            nav.replace({
              id: 'training-result', locked: true,
              render: () => {
                setBgm('nest');
                trainingResultView(dev, faction, s, out, {
                  onBack: () => nav.pop(),
                  onAgain: trainingGate(s.training, s.evolution.tierIndex, s.nest.condition).ok ? () => playTraining(faction, s, game, true) : null,
                });
                root.scrollTop = 0;
              },
            });
          },
        });
        root.scrollTop = 0;
      },
    };
    if (again) nav.replace(e);
    else nav.push(e);
  }

  // ── 환생 (GDD 22-1·22-7, C.56): 확인 1(목록·계승 특성) → 확인 2(최종) → 자동 백업 → 환생 → 연출 → 1단계 방 ──
  function renderRebirth(faction: FactionConfig, s: SaveData): void {
    rebirthConfirmView(dev, faction, s, {
      onNext: (keep) => {
        const t = rebirthFinalText(faction, keep);
        confirmDialog({ title: t.title, body: t.body, yes: faction.rebirth.name, no: '그만둔다', danger: true, onYes: () => doRebirth(faction, s, keep) });
      },
    });
  }

  function doRebirth(faction: FactionConfig, s: SaveData, keep: string | null): void {
    // 되돌릴 수 없는 일 직전 자동 백업 (GDD 24-5): 지금 상태를 저장하고 슬롯 백업에 보관한 뒤 환생한다
    persist();
    stashSlot(store, slot, 'rebirth');
    const r = performRebirth(s, keep);
    if (!r.ok) return void nav.pop();
    persist();
    nav.reset({ id: 'rebirth-scene', locked: true, render: () => { setBgm('nest'); rebirthView(root, faction, r.record, r, nestScreen); root.scrollTop = 0; } });
  }

  /** 빈사로 모험 나가기 전 확인 창 (GDD 102장 수정 v5.228 5번): 기본 선택 = 아니오. 빈사가 아니면 바로 go */
  function askDying(s: SaveData, go: () => void): void {
    if (!s.nest.collapsed || s.nest.dead) return go();
    const k = BALANCE.provisional.nest.care.dying;
    confirmDialog({
      title: '빈사 상태로 나간다',
      body: `빈사 — 체력 ${Math.round(k.hpFraction * 100)}% · 공격·블록 속도와 보상 절반, 지면 사망한다.`,
      yes: '나간다', no: '아니오', danger: true, onYes: go,
    });
  }

  /** 사망이면 원정·훈련·탑·쟁탈전을 막고 안내 띠 (GDD 102-3). 막았으면 true */
  function careBlocked(s: SaveData): boolean {
    const b = careBlock(s);
    if (!b) return false;
    showToast(careBlockText(b), 0, 4200);
    return true;
  }

  // ── 원정 ──
  function departScreen(faction: FactionConfig, replace = false): void {
    if (!save || careBlocked(save)) return;
    const exp = createExpedition({
      factionId: faction.id,
      seed: Math.floor(Math.random() * 2 ** 32),
      runId: nextRunId(save),
      hunger: save.nest.hunger,
      condition: save.nest.condition,
      care: departCareOf(save), // 쇠약·피곤 (GDD 102-2)
      deck: ownedTileList(save.tiles, faction.id),
      risk: save.nest.risk,
      stability: save.nest.stability,
      build: save.build,
      evolution: save.evolution,
      groundId: lastGround(save),
      // 원정 난이도 ★ (GDD 32-1): 기본 = 내 단계(권장), 배치 단계에서 연 ★ 안에서 바꾼다
      difficulty: defaultDifficulty(save),
      streak: streakFor(save, defaultDifficulty(save)),
      liberationTrained: liberationAccess(save).trained,
      // 타일 변수 5종 (GDD 25-5): 드래프트·인접 시너지·이벤트 타일·바퀴 변이. 상인은 가진 골드로 산다
      tileVariants: true,
      gold: save.shared.tradeCoins,
      statBonus: statBonusOf(save).total,
      // 보스 자유 원정 등장 (GDD 37장): 스토리에서 이긴 보스. 사냥터는 배치 단계에서 바뀌므로 엔진이 바퀴 시작 때 그 사냥터 장 보스를 찾는다
      bossesBeaten: bossesBeaten(save),
      // 첫 진화 전에는 타일 잠김 (GDD 64장): 드래프트·이벤트 타일 없음
      tilesLocked: !tilesUnlocked(save),
      // 펫 (GDD 90장): 데리고 다니는 펫(친밀도까지) · 바퀴 끝 보상 펫
      pet: carriedPet(save.shared.pets),
      petDrops: true,
      gear: gearCarry(save.shared.gear),
      gearDrops: true,
    });
    resumeNote = '';
    // 카드 배치 단계(GDD 17-1): 타일을 길에 놓고 [출발]을 누르면 원정이 시작된다. 그 전에는 저장하지 않으므로 취소하면 이어하던 원정이 그대로 남는다
    const entry = {
      id: 'expedition-plan', locked: false,
      render: () => {
        setBgm('expedition');
        planView(root, faction, exp, save!.evolution.tierIndex, {
          unlockedDifficulty: save!.difficulty.unlocked,
          streak: save!.difficulty.streak,
          tilesLocked: !tilesUnlocked(save!),
          // 덱 없음 (GDD 85장 11번): 가진 타일 전부에서 최대 n칸 + 배치 프리셋
          placeLimit: placementLimitOf(save!),
          presets: {
            list: () => tilePresetsFor(save!.tiles, faction.id),
            save: (cells, name, index) => {
              const r = saveTilePreset(save!, name, cells, index);
              if (r.ok) persist();
              return r;
            },
            rename: (index, name) => {
              const ok = renameTilePreset(save!, index, name);
              if (ok) persist();
              return ok;
            },
            remove: (index) => {
              const ok = deleteTilePreset(save!, index);
              if (ok) persist();
              return ok;
            },
          },
          onStart: () => {
            save!.difficulty.last = exp.difficulty;
            activeExp = exp;
            saveProgress(exp); // 이어하던 원정이 있었다면 여기서 덮어쓴다 = 패배 처리 없이 버려진다
            // 원정 흐름(지도·전투·흡수·결과)은 한 덩어리라 취소로 빠져나가지 않는다(locked). 끝나면 홈으로
            nav.replace({ id: 'expedition', locked: true, render: () => { armEnterFx(); showExpedition(faction, exp, '출발!'); root.scrollTop = 0; } });
          },
          onHelp: () => openHelp('expedition', false),
          // [스토리]·[탑] 탭 (GDD 25-7·36장): 같은 자리에서 스토리 장·화 목록 / 탑 화면으로 바꾼다
          onTab: (id) => (id === 'story' ? storyScreen(faction) : towerScreen(faction)),
        });
        root.scrollTop = 0;
        // 진화 후 첫 출발: 덱 고르기 → 첫 배치 → 조합 안내 (GDD 64장 3번 ①~③)
        if (tilesUnlocked(save!)) runGuide('tile-plan', faction, { finishLabel: '배치하기' });
      },
    };
    if (replace) nav.replace(entry);
    else nav.push(entry);
  }

  /** 스토리 장·화 목록 (GDD 25-4·25-7): 원정 출발 화면의 [스토리] 탭. [자유 원정] 탭이면 배치 단계로 돌아간다 */
  function storyScreen(faction: FactionConfig): void {
    if (!save) return;
    nav.replace({
      id: 'story', locked: false,
      render: () => {
        setBgm('expedition');
        storyView(root, faction, save!, {
          onTab: (id) => departTab(faction, id),
          onPick: (chapterId, episodeId) => startStory(faction, chapterId, episodeId),
          onHelp: () => openHelp('expedition', false),
        });
        root.scrollTop = 0;
      },
    });
  }

  /** 출발 화면 머리 탭 전환 (자유 원정 = 배치 단계 / 스토리 / 탑) */
  function departTab(faction: FactionConfig, id: DepartTab): void {
    if (id === 'free') departScreen(faction, true);
    else if (id === 'story') storyScreen(faction);
    else towerScreen(faction);
  }

  // ── 도전의 탑 (GDD 36장, C.85): 원정 출발 화면의 [탑] 탭. 한 층 = 전투 한 판(체력 가득, 흡수 없음, 리스크·허기·컨디션 그대로) ──
  function towerScreen(faction: FactionConfig): void {
    if (!save) return;
    nav.replace({
      id: 'tower', locked: false,
      render: () => {
        setBgm('expedition');
        towerView(root, faction, save!, {
          onTab: (id) => departTab(faction, id),
          onChallenge: (f) => towerBattle(faction, f),
          onHelp: () => openHelp('expedition', false),
        });
        root.scrollTop = 0;
      },
    });
  }

  /** 탑 전투 화면 (결과에서 [다음 층]·[다시 도전]으로 올 때는 같은 자리를 바꿔 끼운다) */
  function towerBattle(faction: FactionConfig, f: TowerFloor, again = false): void {
    if (save && careBlocked(save)) return;
    const e = { id: 'tower-battle', locked: true, render: () => { runTower(faction, f); root.scrollTop = 0; } };
    if (again) nav.replace(e);
    else nav.push(e);
  }

  function runTower(faction: FactionConfig, f: TowerFloor): void {
    if (!save) return;
    const s0 = save;
    const params = buildCombatParams(s0.build, faction.id);
    applyEvolutionToParams(params, s0.evolution, faction.id, statBonusOf(s0).total, s0.training.completed);
    params.liberationStartGauge = liberationStartGaugeOf(s0.nest.stability);
    // 장비 (GDD 91장): 강적·보스 층이면 강적 피해도
    applyGearToParams(params, gearCarry(s0.shared.gear), f.kind === 'elite' || !!f.bossId);
    applyCareToParams(params, battleCareOf(s0)); // 빈사: 체력 10%·속도 절반 (GDD 102장 수정)
    // 꼭대기 보스 이름은 종족 설정 (적 정의의 이름을 그 문구로 바꿔 끼운다)
    const floor = f.final ? { ...f, enemy: { ...f.enemy, name: { '*': towerLabels(faction).finalBossName } } } : f;
    const s = createTowerCombat(floor, params, Math.floor(Math.random() * 2 ** 32));
    setBgm(f.bossId ? 'boss' : f.kind === 'elite' ? 'elite' : 'battle');
    battleView(root, faction, s, {
      tierIndex: s0.evolution.tierIndex,
      skinId: artSkinOf(s0),
      formId: s0.evolution.formId,
      banner: `${towerLabels(faction).name} · ${towerFloorText(faction, f.floor)} · ${difficultyText(faction, f.star)}`,
      ...(f.bossId ? { boss: { eyebrow: '보스' }, enter: true } : {}),
      bg: towerSceneBg(faction, f),
      onQuit: () => nav.pop(),
      onEnd: (done) => {
        const res = recordTowerBattle(s0, f, done);
        persist();
        nav.replace({
          id: 'tower-result', locked: true,
          render: () => {
            towerResultView(root, faction, f, done, res, {
              onNext: res.won && res.next !== null ? () => towerBattle(faction, towerFloor(res.next!), true) : null,
              onAgain: () => towerBattle(faction, f, true),
              onBack: () => nav.pop(),
            });
            root.scrollTop = 0;
          },
        });
        showTitleToasts(s0, faction, persist);
      },
    });
  }

  /** 첫 원정 튜토리얼 (GDD 67장): 고정 짧은 길(배치 단계·탭 없음) → 걷기·조우 안내 → 약한 적 1마리 → 튜토리얼 흡수 → 귀환 */
  function startTutorialRun(faction: FactionConfig): void {
    if (!save || careBlocked(save)) return;
    const exp = createExpedition({
      factionId: faction.id,
      seed: Math.floor(Math.random() * 2 ** 32),
      runId: nextRunId(save),
      hunger: save.nest.hunger,
      condition: save.nest.condition,
      care: departCareOf(save), // 쇠약·피곤 (GDD 102-2)
      deck: [],
      risk: save.nest.risk,
      stability: save.nest.stability,
      build: save.build,
      evolution: save.evolution,
      gold: save.shared.tradeCoins,
      statBonus: statBonusOf(save).total,
      tutorial: true,
    });
    resumeNote = '';
    activeExp = exp;
    saveProgress(exp);
    let opened = false;
    nav.replace({
      id: 'expedition', locked: true,
      render: () => {
        armEnterFx();
        showExpedition(faction, exp, '첫 원정 출발!');
        root.scrollTop = 0;
        if (opened) return;
        opened = true;
        // 걷기·조우 안내 동안 원정 시간이 멈춘다
        signalHold('hold');
        showGuide(faction, 'first-run', { finishLabel: '걷기 시작', pauseLabel: '안내 중 — 원정 멈춤', onDone: () => signalHold('release') });
      },
    });
  }

  /** 대화 캡션: "1장 「굶주린 영혼」 · 1화 첫 사냥" */
  const storyCaption = (exp: ExpeditionState, faction: FactionConfig): string => {
    const st = exp.story!;
    const ep = storyEpisodeOf(exp)!;
    return `${chapterLabel(faction.id, st.chapterId)} · ${ep.title}`;
  };

  /** 스토리 화 시작 (GDD 25-4): 고정 길(배치 단계 없음) → 시작 대사 → 원정. 목표·대화 말고는 자유 원정과 같은 흐름 */
  function startStory(faction: FactionConfig, chapterId: string, episodeId: string): void {
    if (!save || careBlocked(save)) return;
    const exp = createExpedition({
      factionId: faction.id,
      seed: Math.floor(Math.random() * 2 ** 32),
      runId: nextRunId(save),
      hunger: save.nest.hunger,
      condition: save.nest.condition,
      care: departCareOf(save), // 쇠약·피곤 (GDD 102-2)
      deck: ownedTileList(save.tiles, faction.id),
      risk: save.nest.risk,
      stability: save.nest.stability,
      build: save.build,
      evolution: save.evolution,
      liberationTrained: liberationAccess(save).trained,
      tileVariants: true,
      gold: save.shared.tradeCoins,
      statBonus: statBonusOf(save).total,
      story: { chapterId, episodeId },
      tilesLocked: !tilesUnlocked(save),
      pet: carriedPet(save.shared.pets),
      petDrops: true,
      gear: gearCarry(save.shared.gear),
      gearDrops: true,
    });
    resumeNote = '';
    activeExp = exp;
    saveProgress(exp);
    const ep = getEpisode(faction.id, chapterId, episodeId);
    let opened = false;
    nav.replace({
      id: 'expedition', locked: true,
      render: () => {
        armEnterFx();
        showExpedition(faction, exp, '출발!');
        root.scrollTop = 0;
        if (opened) return;
        opened = true;
        // 시작 대사: 원정 화면 위에 띄우고, 다 넘긴 뒤 걷기 시작한다 (대화 중에는 원정 시간이 멈춘다)
        storyTalk(faction, exp, ep.dialogue.start, '시작', () => {}, true);
      },
    });
  }

  /** 스토리 대사 한 묶음 (GDD 25-7): 지금 화면 위에 대화창. hold = 아래 원정 화면의 시간을 대화 동안 멈춘다 */
  function storyTalk(faction: FactionConfig, exp: ExpeditionState, lines: readonly StoryLine[], when: string, then: () => void, hold = false): void {
    if (hold) signalHold('hold');
    playDialogue(lines, {
      caption: `${storyCaption(exp, faction)} — ${when}`,
      onDone: () => {
        if (hold) signalHold('release');
        then();
      },
    });
  }

  /** 사냥터 기본 선택 (GDD 24-2): 마지막 원정의 사냥터가 아직 열려 있으면 그것, 아니면 기본 사냥터 */
  function lastGround(s: SaveData): string | undefined {
    const last = s.runLog.runs[s.runLog.runs.length - 1]?.groundId;
    return openGrounds(s.evolution.tierIndex).some((g) => g.id === last) ? last : undefined;
  }

  /** 저장된 원정으로 돌아간다: 저장된 시점의 화면(전투 직전·흡수·둥지 칸 귀환 선택·이동 중)으로 복원 */
  function resumeExpedition(exp: ExpeditionState): void {
    const faction = getFaction(exp.factionId);
    activeExp = exp;
    // 저장된 배속 값은 무시한다 (C.118, GDD 62장: 1배 고정)
    if (exp.phase === 'battle') runBattle(faction, exp);
    else if (exp.phase === 'absorb') afterBattle(faction, exp);
    else if (drainEvents(exp).length > 0) breakthroughScreen(faction, exp, () => showExpedition(faction, exp, '원정을 이어간다'));
    else showExpedition(faction, exp, '원정을 이어간다');
  }

  /** 전투 직전 강적·보스 WARNING 경고가 떠 있다 (GDD 76장, C.128) */
  let warnOpen = false;

  function runBattle(faction: FactionConfig, exp: ExpeditionState): void {
    activeExp = exp;
    const p = exp.pending!;
    // 강적·보스·포식자 둥지 사냥꾼: 전투 시작 전 약 1.5초 경고 (누르면 건너뜀). 엔진·밸런스 변경 없음
    const kind = warningKind(p, Boolean(exp.tutorial));
    if (kind && !warnOpen) {
      warnOpen = true;
      playWarning({ kind, name: shownName(pickFaction(p.enemy.name, faction.id)), elementId: p.enemy.element, factionId: faction.id, onDone: () => { warnOpen = false; beginBattle(faction, exp); } });
      return;
    }
    beginBattle(faction, exp);
  }

  function beginBattle(faction: FactionConfig, exp: ExpeditionState): void {
    activeExp = exp;
    const p = exp.pending!;
    const s = startBattle(exp);
    const where = `${exp.lap}바퀴 · ${p.cell}번 칸${p.tileId ? ` · ${tileName(p.tileId, faction.id)}` : ''}${p.combo ? ' · 조합!' : ''}${p.synergy ? ` · ${synergyName(p.synergy, faction.id)}${p.second ? ' 2연전' : ''}` : ''}${p.trap ? ' · 함정' : ''}${exp.mutation ? ` · ${mutationName(exp.mutation, faction.id)}` : ''}`;
    // 보스전 (GDD 25-3): 음악 boss, 등장 이름 띠
    setBgm(p.boss ? 'boss' : p.enemy.class === 'elite' ? 'elite' : 'battle');
    battleView(root, faction, s, {
      tierIndex: save?.evolution.tierIndex,
      skinId: save ? artSkinOf(save) : undefined,
      formId: save?.evolution.formId,
      banner: p.boss && exp.story ? storyCaption(exp, faction) : where,
      ...(p.boss ? { boss: { eyebrow: exp.story ? '보스' : '보스 · 자유 원정' } } : {}),
      // 배경 (GDD 34-1): 보스전은 무대(없으면 사냥터), 그 밖은 사냥터
      bg: (p.boss ? arenaSceneBg(faction) : null) ?? groundSceneBg(faction, exp.groundId),
      frenzy: inFrenzy(exp) ? faction.frenzyName : undefined,
      risk: exp.risk,
      tutorial: tutorialFor(),
      // 원정 전투 일시정지 [귀환] (GDD 100장 v5.220, C.172): 패배로 치지 않고 걷기 중간 귀환과 같은 처리(짧은 결과 카드 · 방)
      ...(canAbortBattle(exp) ? { onReturn: () => {
        abortExpedition(exp);
        endExpedition(faction, exp);
      } } : {}),
      onEnd: (done) => {
        const finds = exp.gearFinds?.length ?? 0;
        finishBattle(exp, done);
        // 장비 드롭 알림 (GDD 91장 2번): 이 전투에서 나온 장비 — 보관함에는 귀환 때 들어간다
        for (const f of exp.gearFinds?.slice(finds) ?? []) showToast({ eyebrow: f.from === 'boss' ? '보스 드롭' : f.from === 'elite' ? '강적 드롭' : '장비 드롭', title: `장비 발견: ${gearDropText(f.roll, faction)}`, meta: `★${f.roll.star} · 귀환하면 가방 장비 탭으로` }, 0, 3600);
        saveProgress(exp); // 전투가 끝날 때마다 저장 (흡수 대기 중이면 그 상태째)
        afterBattle(faction, exp);
      },
    });
  }

  /** 승리 후 흡수 가능하면 흡수 화면 → 한계 돌파 연출 → 원정으로 돌아간다 */
  function afterBattle(faction: FactionConfig, exp: ExpeditionState): void {
    activeExp = exp;
    const proceed = () => {
      saveProgress(exp);
      const next = () => {
        if (exp.phase === 'ended') return endExpedition(faction, exp);
        // 스토리 중간 대사 (GDD 25-7): 조건(처치 수)을 채운 뒤 원정으로 돌아가기 전에 한 번
        const cue = takeStoryCue(exp);
        showExpedition(faction, exp, '전투 승리!');
        if (cue) {
          saveProgress(exp);
          storyTalk(faction, exp, cue, '중간', () => {}, true);
        }
      };
      if (drainEvents(exp).length > 0) breakthroughScreen(faction, exp, next);
      else next();
    };
    // 첫 원정 튜토리얼의 흡수 화면 (GDD 67장 2·3번): 4갈래 설명 + 시스템상 흡수가 아닌 '모든 능력치 +n'
    if (exp.phase === 'absorb' && exp.tutorial) return tutorialAbsorbView(root, faction, exp, proceed);
    // 다시 뽑기권 (GDD 25-9): 흡수 1번에 1장. 쓰면 바로 저장(원정 중간 저장에 바뀐 후보가 들어간다)
    if (exp.phase === 'absorb') absorbView(root, faction, exp, proceed, {
      tickets: () => save?.shared.rerollTickets ?? 0,
      use: () => {
        if (!save || !useRerollTicket(save)) return false;
        if (!rerollAbsorb(exp).ok) {
          save.shared.rerollTickets++;
          return false;
        }
        saveProgress(exp);
        return true;
      },
    });
    else proceed();
  }

  function showExpedition(faction: FactionConfig, exp: ExpeditionState, msg = ''): void {
    activeExp = exp;
    setBgm('expedition');
    expeditionView(root, faction, exp, {
      tierIndex: save?.evolution.tierIndex,
      skinId: save ? artSkinOf(save) : undefined,
      formId: save?.evolution.formId,
      onBattle: () => runBattle(faction, exp),
      onSave: () => saveProgress(exp),
      onEnded: () => endExpedition(faction, exp),
      onBreakthrough: (resume) => breakthroughScreen(faction, exp, resume),
      openHelp: (onClose) => openHelp('expedition', false, onClose),
    }, msg);
  }

  /** 한계 돌파 연출 (텍스트 수준). 정식 결과(폭주·진화 정체·가면 분기)는 미정이라 임시 페널티만 있다 */
  function breakthroughScreen(faction: FactionConfig, exp: ExpeditionState, resume: () => void): void {
    breakthroughView(root, faction, exp.risk, resume);
  }

  /** 귀환 펫 알림 (GDD 90장): 칭호 알림 뒤에 차례로 */
  let petNotes: { eyebrow: string; title: string; meta?: string }[] = [];
  function showPetNotes(): void {
    const notes = petNotes;
    petNotes = [];
    notes.forEach((n, i) => window.setTimeout(() => showToast(n, i, 4200), 900 + i * 300));
  }

  function endExpedition(faction: FactionConfig, exp: ExpeditionState): void {
    activeExp = null;
    let growth: GrowthInput | undefined;
    let afterResult: (() => void) | null = null;
    if (save) {
      const had = new Set(save.titles.map((t) => t.titleId));
      const fromTier = save.evolution.tierIndex;
      // 걸음 수가 진화 타이밍에 닿았으면 귀환한 그 순간 자동 진화 (GDD 20-5 v4.1). 결과 화면 다음에 진화 연출을 보여 준다
      const petLog0 = save.runLog.pets.length;
      const gearLog0 = save.runLog.gear.length;
      const evo = recordExpedition(save, exp);
      persist();
      // 펫 알림 (GDD 90장): 이번 귀환에서 얻은 펫·친밀도 오름·골드로 바뀐 펫 (첫 진화 선물 포함)
      petNotes = save.runLog.pets.slice(petLog0).map((r) => petNoticeOf(r, faction)).filter((n): n is NonNullable<typeof n> => n !== null);
      // 장비 알림 (GDD 91장): 귀환 때 보관함에 들어간 드롭 장비(넷 넘으면 한 줄로)·가득 차서 판 장비
      const gearNotes = save.runLog.gear.slice(gearLog0).map((r) => gearNoticeOf(r, faction)).filter((n): n is NonNullable<typeof n> => n !== null);
      petNotes.push(...(gearNotes.length > 4 ? [{ eyebrow: '장비', title: `장비 ${gearNotes.length}개를 가지고 돌아왔다`, meta: '가방 장비 탭에서 착용' }] : gearNotes));
      growth = {
        newTraits: summarize(exp).keptTraits.length,
        evolvedTo: evo?.ok ? shownName(formDisplayName(save.evolution, faction.id)) : null,
        newTitles: save.titles.filter((t) => !had.has(t.titleId)).map((t) => titleLabel(t.titleId, faction.id)),
      };
      if (evo?.ok) {
        const s = save;
        const extra = { elements: playerElementsOf(s.evolution), ability: s.evolution.ability, ev: { ...s.evolution.ev }, failLine: isFailLine(s.evolution), stats: baseStatsOf(s.evolution, faction.id) };
        afterResult = () => open('evolve-cutscene', () => evolutionView(root, faction, fromTier, s.evolution.tierIndex, evo.form, () => {
          holdRoomGuides = false; // 연출이 끝나 방으로 돌아오면 첫 진화 타일 안내 (GDD 64장)
          nav.pop();
        }, s.build.slots.length, extra), true);
      }
    }
    const showResult = () => {
      setBgm('expedition'); // 결과 화면은 원정 음악 (스토리 끝 대사의 story 음악에서 돌아온다)
      resultView(root, faction, exp, save?.nest.stability ?? exp.stability, () => {
        if (afterResult) holdRoomGuides = true;
        nestScreen();
        const next = afterResult;
        afterResult = null;
        next?.();
      }, growth);
      if (save) showTitleToasts(save, faction, persist);
      showPetNotes();
    };
    // 원정 도중 [귀환하기] (GDD 81장): 결과 화면 대신 방 위에 짧은 결과 카드 1장 [확인] (C.170, GDD 100장 #32). 진화가 걸렸으면 그 연출은 그대로
    if (exp.endReason === 'abort') {
      if (afterResult) holdRoomGuides = true;
      nestScreen();
      if (!afterResult) confirmDialog({ title: '귀환했다', body: abortSummaryLine(exp, faction), yes: '확인', single: true, onYes: () => {} });
      afterResult?.();
      if (save) showTitleToasts(save, faction, persist);
      showPetNotes();
      return;
    }
    // 스토리 화를 깼으면 끝 대사 다음에 결과 (GDD 25-7)
    const ep = storyEpisodeOf(exp);
    if (ep && exp.story?.cleared) {
      mountApp(root, { fixed: true }); // 전투·흡수 화면을 걷고 빈 화면 위에 끝 대사
      storyTalk(faction, exp, ep.dialogue.end, '끝', showResult);
    }
    else showResult();
  }

  // ── 테스트 패널 (GDD 38-4): 테스트 모드에서만. 값은 테스트 칸에만 저장된다 ──
  function renderTest(faction: FactionConfig, s: SaveData, tab: TestTab = 'form'): void {
    testPanelView(root, faction, s, {
      persist,
      onBattle: (c) => testBattle(faction, c),
      onNewFaction: (fid) => confirmDialog({
        title: `${getFaction(fid).name}(으)로 테스트 칸을 새로 만들까요?`,
        body: '지금 테스트 칸은 지워지고 전체 해금 상태로 새로 시작한다. 진짜 세이브는 그대로.',
        yes: '새로 만들기', no: '아니오',
        onYes: () => {
          save = newTestSave(fid);
          persist();
          nestScreen();
        },
      }),
      onReset: () => confirmDialog({
        title: '테스트 칸을 초기화할까요?',
        body: '테스트 칸(슬롯·백업 포함)을 모두 지우고 처음 화면으로 간다. 진짜 세이브는 그대로.',
        yes: '초기화', no: '아니오', danger: true,
        onYes: () => {
          clearTestSlot(localStorage);
          titleScreen('테스트 칸을 비웠다. [새로 시작]으로 전체 해금 테스트 칸을 만든다.');
        },
      }),
      onBodyChanged: () => {
        dress(s.wear);
        nav.top?.render();
      },
      onFastForward: (hours) => {
        absence = fastForward(s, hours);
        hungryGreet = absence.flow.hunger >= BALANCE.provisional.nest.idleHungerNotice;
        persist();
        nestScreen();
      },
    }, tab);
  }

  /** 바로 전투 (38-4): 고른 적·★·연속(또는 탑 층)으로 한 판. 기록은 테스트 칸 런 로그에만 */
  function testBattle(faction: FactionConfig, c: TestBattleChoice): void {
    const pick = testBattleEnemy(c);
    if (!pick) return;
    open('test-battle', () => runPractice(faction, pick.enemy, pick.star, pick.bossId, c.floor ? `테스트 · 탑 ${c.floor}층 · ★${pick.star}` : `테스트 · ★${pick.star}${c.streak > 0 ? ` · 연속 ${c.streak}` : ''}`), true);
  }

  // ── 전투 연습 (C.6: 새 전투 화면, 둥지 빌드 그대로) ──
  function practiceScreen(faction: FactionConfig): void {
    practiceListView(root, faction, save?.runLog.battles.length ?? 0, { onPick: (enemy) => practiceBattle(faction, enemy), title: trainingHead(faction, 'practice') });
  }

  /** 연습 전투: 결과 화면에서 [다시]로 올 때는 같은 자리를 바꿔 끼운다 */
  function practiceBattle(faction: FactionConfig, enemy: EnemyDef, again = false): void {
    if (save && careBlocked(save)) return;
    const e = { id: 'practice-battle', locked: true, render: () => { runPractice(faction, enemy); root.scrollTop = 0; } };
    if (again) nav.replace(e);
    else nav.push(e);
  }

  /** fixedStar·notice 는 테스트 모드 바로 전투(38-4): 적은 이미 ★·배율을 입혀 넘긴다 */
  function runPractice(faction: FactionConfig, enemy: EnemyDef, fixedStar?: number, bossId: string | null = null, notice?: string): void {
    // 연습 상대 = 내 단계의 권장 난이도 ★ (GDD 32-1): 훈련 인형은 DPS 측정용이라 권장 세기로 고정
    const star = fixedStar ?? recommendedDifficulty(save?.evolution.tierIndex ?? 0);
    const params = save ? buildCombatParams(save.build, faction.id) : undefined;
    if (save && params) {
      applyEvolutionToParams(params, save.evolution, faction.id, statBonusOf(save).total, save.training.completed);
      applyDifficultyToParams(params, star);
      params.liberationStartGauge = liberationStartGaugeOf(save.nest.stability);
      // 장비 (GDD 91장): 연습도 낀 장비 그대로 (훈련 인형 DPS 측정)
      applyGearToParams(params, gearCarry(save.shared.gear), enemy.class === 'elite' || bossId !== null);
      applyCareToParams(params, battleCareOf(save)); // 빈사 (GDD 102장 수정) — 연습은 져도 잃는 것이 없어 사망은 없다
    }
    const s = createCombat(Math.floor(Math.random() * 2 ** 32), { enemy: fixedStar === undefined ? enemyAtDifficulty(enemy, star) : enemy, params, ...(bossId ? { boss: bossSetupOf(bossId) } : {}) });
    setBgm(enemy.class === 'elite' ? 'elite' : 'battle');
    battleView(root, faction, s, {
      tierIndex: save?.evolution.tierIndex,
      skinId: save ? artSkinOf(save) : undefined,
      formId: save?.evolution.formId,
      notice,
      tutorial: tutorialFor(),
      onQuit: () => nav.pop(),
      onEnd: (done) => {
        if (save) {
          recordBattle(save, buildBattleRecord(done, { factionId: faction.id, tierIndex: save.evolution.tierIndex }));
          settleLiberationRisk(save, done);
          persist();
        }
        if (fixedStar === undefined) practiceResult(faction, enemy, done);
        else practiceResultView(root, faction, enemy, done, { onAgain: () => nav.replace({ id: 'test-battle', locked: true, render: () => { runPractice(faction, enemy, fixedStar, bossId, notice); root.scrollTop = 0; } }), onMenu: () => nav.pop() });
      },
    });
  }

  function practiceResult(faction: FactionConfig, enemy: EnemyDef, s: CombatState): void {
    practiceResultView(root, faction, enemy, s, { onAgain: () => practiceBattle(faction, enemy, true), onMenu: () => nav.pop() });
  }

  // ── 등급전 (GDD 21장, C.49): 둥지 빌드 그대로 일반 블록 전투. 결과는 세이브(사다리·등급 이력·런 로그·영혼 결정)에 바로 반영 ──
  function rankScreen(faction: FactionConfig): void {
    if (!save) return;
    rankView(root, faction, save, { onChallenge: (holder) => !careBlocked(save!) && open('rank-battle', () => runRankBattle(faction, holder), true), title: trainingHead(faction, 'rank') });
  }

  function runRankBattle(faction: FactionConfig, holder: RankHolderDef): void {
    if (!save) return;
    const s0 = save;
    const c = rankChallenge(s0);
    if (!c.ok || c.opponentId !== holder.id) return void nav.pop(); // 그사이 상황이 바뀌었으면(다른 탭 등) 목록으로
    // 되돌릴 수 없는 일 직전 자동 백업 (GDD 24-5): 지금 상태를 저장하고 슬롯 백업에 보관한 뒤 싸운다
    persist();
    stashSlot(store, slot, 'rank');
    setBgm('rank');
    const params = buildCombatParams(s0.build, faction.id);
    applyEvolutionToParams(params, s0.evolution, faction.id, statBonusOf(s0).total, s0.training.completed);
    // 보유자마다 정해진 난이도 ★ (GDD 32-1 7번: 아래 번호일수록 낮고 No.1 = ★5)
    applyDifficultyToParams(params, holder.difficulty);
    params.liberationStartGauge = liberationStartGaugeOf(s0.nest.stability);
    // 장비 (GDD 91장): 등급전 상대는 강적으로 본다
    applyGearToParams(params, gearCarry(s0.shared.gear), true);
    applyCareToParams(params, battleCareOf(s0)); // 빈사 (GDD 102장 수정): 지면 사망
    const s = createCombat(Math.floor(Math.random() * 2 ** 32), { enemy: enemyAtDifficulty(holder, holder.difficulty), params });
    battleView(root, faction, s, {
      tierIndex: s0.evolution.tierIndex,
      skinId: artSkinOf(s0),
      formId: s0.evolution.formId,
      banner: `${faction.rankBattleName} · ${rankLabel(faction, c.targetRank)}`,
      enter: true,
      bg: arenaSceneBg(faction),
      onEnd: (done) => {
        const res = recordRankBattle(s0, done);
        settleLiberationRisk(s0, done);
        persist();
        // 결과 화면은 전투 자리를 바꿔 끼운다: 돌아가면 등급표(다시 그려 새 번호를 보인다)
        nav.replace({ id: 'rank-result', locked: true, render: () => { rankResultView(root, faction, holder, done, res, { onBack: () => nav.pop() }); root.scrollTop = 0; } });
        showTitleToasts(s0, faction, persist);
      },
    });
  }

  titleScreen();
}
