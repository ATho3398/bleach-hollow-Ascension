// 화면 흐름: 종족 선택 → 둥지 → 원정(12칸 길) → 전투 → 원정 결과 → 둥지. DOM/CSS 만 쓴다.
// 화면 텍스트는 FactionConfig·데이터 스킨에서 읽고, 종족 id 로 분기하지 않는다.
import { ENEMIES } from '../data/enemies';
import { FACTIONS, getFaction } from '../data/factions';
import { DEFAULT_GENDER, setActiveGender, type Gender } from '../engine/gender';
import type { EnemyDef } from '../data/schema';
import { mutationName, synergyName, tileName } from '../data/tiles';
import { buildBattleRecord, createCombat, liberationStartGaugeOf, newCombatScript, type CombatParams, type CombatState } from '../engine/combat';
import { buildCombatParams } from '../engine/absorb';
import { homeHp, setHomeHpOf, SPA_BLOCK_TEXT, spaEnter, spaLeave } from '../home';
import { GUIDES, guideVars, HOME_INTRO, RECOVER_SCENES, type TutorialScene } from '../data/help';
import { fixParticles } from '../engine/josa';
import { grantCureReward, grantRecoverFood, recoverFeedDone, recoverGrantBag, recoverStep } from '../recoverTutorial';
import { tutorialOverlay, type TutorialAct } from './tutorialOverlay';
import { spaExitFx, spaView } from './spaView';
import { applyEvolutionToParams, baseStatsOf, formDisplayName, isFailLine, playerElementsOf, recordEvolutionPractice } from '../engine/evolution';
import { applyDifficultyToParams, enemyAtDifficulty, recommendedDifficulty } from '../engine/difficulty';
import { TITLES, titleName } from '../data/titles';
import type { GrowthInput } from './bha/growthLogic';
import { abortExpedition, markExpeditionBack, markExpeditionLeft, type AbandonReason, applyCareToParams, bossSetupOf, canAbortBattle, createExpedition, rerollAbsorb, drainEvents, finishBattle, hpFractionOf, inFrenzy, serializeExpedition, startBattle, storyEpisodeOf, summarize, takeStoryCue, ticketDropOf, type ExpeditionState } from '../engine/expedition';
import { getEpisode, type StoryLine } from '../data/story';
import { chapterLabel, storyView, type DepartTab } from './storyView';
import { towerResultView, towerView } from './towerView';
import { bossRushName, specialDungeonView, specialHead, specialResultView, weeklyName } from './specialDungeonView';
import { bossRushEnemy, createSpecialCombat, hpFractionAfter, weeklyEnemies, type BossRushEntry, type SpecialTab } from '../engine/specialDungeon';
import type { HogyokuTrackId } from '../engine/transcend';
import { createTowerCombat, towerFloor, towerOpen, type TowerFloor } from '../engine/tower';
import { difficultyText, specialDungeonLabels, towerFloorText, towerLabels } from '../engine/faction';
import { absenceLossLines, careBlockText, lossOnlyReturnShown } from './bha/roomLogic';
import { fullnessOfNest, previewHomeHp, type AbsenceReport } from '../engine/nest';
import { NORMAL_FOODS } from '../engine/foodPref';
import { playDialogue } from './dialogueView';
import type { FactionConfig, WorldPlace } from '../engine/faction';
import {
  absenceOf, battleCareOf, markBattleEntry, restartBattleOnResume, careBlock, departCareOf, departHpOf, performRevive, applyStartLook, artSkinOf, firstRunPending, tilesUnlocked, petsUnlocked, gearUnlocked, battleItemUnlocked, claimDexRewards, claimTutorialGoals, liberationAccess, loadSave, newSaveData, nextRunId, rankChallenge, readActiveExpedition, recordBattle, recordExpedition, recordRankBattle, resumeTarget, resumeWindowMs, accrueIdle, claimIdle, idleClaimable, idlePendingYield, tickIdle, type IdleAccrual,
  performRebirth, recordTraining, recordTowerBattle, enterSpecial, recordSpecialBattle, settleSpecialRun, specialState, towerTicketDrop, settleLiberationRisk, ascensionAccess, recordAscension, artTierIndexOf, type SaveData,
  canSwitchFaction, allTracks, trackIdOf, trackNameOf, trackRulesOf, developAll, developHogyoku, hogyokuPercent, performFusion, statBonusOf, switchTrack, defaultDifficulty, streakFor, bossesBeaten, setIdentity, needsIdentity,
} from '../game';
import { identityScreen, type IdentityMode } from './identityView';
import { registerCancelHook } from './bha/shortcuts';
import { developAllPreview, fusionConfirmView, fusionFinalText, fusionPickView, fusionView, gainedText, hogyokuView, resetHogyokuSel, transcendentDexView } from './hogyokuView';
import { rebirthConfirmView, rebirthFinalText, rebirthView } from './rebirthView';
import { beginTraining, trainingGate, trainingLevel, type TrainingGameId } from '../engine/training';
import { trainingPlayView, trainingResultView, trainingLockedText, trainingTitle, trainingView, type TrainingScreenId } from './trainingView';
import type { RankHolderDef } from '../data/ranks';
import { ascensionResultView, rankLabel, rankLockedText, rankResultView, rankView } from './rankView';
import { rankUnlocked } from '../engine/rank';
import { getBoss } from '../data/bosses';
import { armEnterFx } from './bha/cosmeticFx';
import { photoView } from './photoView';
import { absorbView } from './absorbView';
import { battleView, type BattleViewOptions } from './battleView';
import { arenaSceneBg, groundSceneBg, specialSceneBg, towerSceneBg } from './bha/sceneBg';
import { applyTheme } from './bha/theme';
import { speciesView, startView } from './startView';
import { enterFullscreenOnStart, watchFullscreen } from './fullscreen';
import { slotPickView, type SlotPickMode } from './slotView';
import { confirmDialog } from './confirmDialog';
import { signalHold } from './bha/hold';
import { IDLE, rotateStep, type RotateEvent, type RotateState } from './bha/rotateResume';
import { afterTutorials, blockInput, coverTutorials, getOverlayHost, registerLayer } from './bha/overlayHost';
import { button, el, mountApp } from './bha/dom';
import { BUILD_ID, setUpdateHost } from '../pwa';
import { CloudSync, deviceLabel, firstGateNote, markLoginGateDone, needsLoginGate, type ActiveDevice, type CloudConflict } from '../cloudSave';
import { GATE_TEXT, loginGateDialog, otherDeviceDialog, showCloudConflict, type CloudUi } from './cloudView';
import { isStandalone } from '../pwaInstall';
import { allSlotSummaries, collectSlotChunks, deleteSlot, lastPlayedSlot, slotKey, stashSlot, touchSlot, writeSlotSave } from '../saveSlots';
import { monoNow } from './bha/expClock';
import { forgetConfirmedChunks, isChunkStorageKey } from '../saveCodec';
import { backupFileName, exportRawSlot, needsMigration, recoverFromBackup } from '../saveBackup';
import { bgm, setBgm } from './bgm';
import { installAppAway, onAppAway } from './bha/appAway';
import { setSfxSuspended } from './fx';
import type { BgmTrack } from '../data/audio/bgm';
import { BALANCE } from '../config/balance';
import { idleCounts } from '../engine/idle';
import { breakthroughView } from './breakthroughView';
import { practiceListView, practiceResultView } from './practiceView';
import { abortSummaryLine, resultView } from './resultView';
import { evChipRow, evGains } from './bha/evChips';
import { expeditionView, setSpeed } from './expeditionView';
import { lowDepartHp, planView } from './planView';
import { bookView } from './bookView';
import { showTitleToasts } from './titleDexView';
import { formName } from '../data/evolution';
import { evolutionView, gainExtra } from './evolutionPanel';
import { roomView } from './roomView';
import { careView, chestView, openChestAtConsumables, openChestAtGear } from './lcdScreens';
import { createDevice } from './bha/device';
import { ScreenStack } from './bha/select';
import { marketOf, roomOf, worldMapOf } from '../engine/faction';
import { marketView } from './marketView';
import { worldMapCancelWalk, worldMapView } from './worldMapView';
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
import { showGuide, tutorialAbsorbView, tutorialWoundView } from './guideView';
import { heroArtOf } from './bha/battle';
import { evolvedArtOf } from './evolvedArt';
import { showDexToasts, showTutorialToasts, tutorialGoalsView } from './tutorialGoalsView';
import { showToast } from './bha/nest';
import { gearToastWanted } from '../config/notify';
import { isGearGrade } from '../data/gear';
import { FEATURE_IDS, featureName, featureUnlocked, UNLOCK_GUIDES, unlockHintText } from '../engine/unlocks';
import { applyGearToParams, gearCarry } from '../engine/gear';
import { carriedPet, petAttackOf } from '../engine/pet';
import { departSortie } from '../sortie';
import { battleItemEffectOf, consumableName, departFillBattleSlot, fillBattleSlot, lapItemLine, gearDropText, gearNoticeOf, HEAL_ITEM_IDS, lapItemLock, LAP_ITEM_USED, ownedBattleItems, petNoticeOf, setLapItem, spendBattleItem, spendLapItem, useSlotItemOnWalk } from '../inventory';
import { healBag } from './bha/healBag';
import { toward } from './bha/nestLogic';
import { shopPicker, shopView } from './shopView';
import { idleBadge, refreshIdleBadge, showAbsenceReturn, showIdlePanel, showIdleReturn } from './idleView';
import { deleteTilePreset, ownedTileList, placementLimitOf, renameTilePreset, saveTilePreset, tilePresetsFor } from '../tilePresets';
import { applyCosmetics } from './bha/cosmetics';
import { initTamago } from './bha/tamago';
import { accruePlay } from './bha/tamagoLogic';
import type { WearState } from '../game';
import { battleItemBrief, battleItemText, useRerollTicket } from '../shop';
import { pickDialog } from './pickDialog';
import { applyTestExpeditionForce, clearTestSlot, newTestSave, testBattleEnemy, testStorage, type FullStorage, type TestBattleChoice } from '../engine/testMode';
import { initTestMode, keyringTestTap, testSpeed } from './testMode';
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

  // 기기 틀(GDD 16장): 모든 화면은 LCD 창(dev.view) 안에 그린다. 뒤로 = 열린 창·레이어 닫기(device) → 화면 스택 한 단계 뒤로 → 더 갈 곳이 없는 홈(방)이면 처음 화면 확인(GDD 124장 1, C.198).
  // 잠긴 화면(전투·원정)이나 다른 화면에서는 처음 화면으로 가지 않는다 (104장 7 버그 — 홈 표시(home)가 있는 화면 하나뿐일 때만)
  const nav = new ScreenStack({ save: () => dev.focusMark(), restore: (m) => dev.restoreFocus(m) }); // 뒤로 돌아오면 들어갔던 칸으로 초점 (GDD 176장 8)
  const dev = createDevice(host, {
    onCancel: () => {
      const r = nav.cancel();
      if (r === 'home') askReturnToTitle();
      if (r !== 'none') return true;
      lockedBack();
      return true;
    },
    // C.202 (GDD 128장 4): 뒤로는 어느 화면에서도 무언가 한다 — 버튼을 끄지 않는다
    canCancel: () => true,
    onRotate: (rotated) => rotateEvent(rotated ? 'portrait' : 'landscape'),
  });
  const root = dev.view;
  /**
   * 잠긴 화면·맨 처음 화면의 뒤로 (GDD 128장 4, C.202): 화면 스스로 처리기(onScreenBack — 걷기 일시정지·흡수 넘어가기 확인 등)가 없으면
   * 화면이 '뒤로 = 이 버튼'으로 표시한 버튼([data-back], 결과 [확인]·연출 [계속] 등)을 누르고, 그것도 없으면 안내 한 줄. 뒤로가 아무 반응 없는 화면은 없다
   */
  function lockedBack(): void {
    const b = [...root.querySelectorAll<HTMLElement>('[data-back]')].find((e) => e.getClientRects().length > 0 && !(e as HTMLButtonElement).disabled);
    if (b) return b.click();
    showToast(nav.top?.id === 'title' ? { eyebrow: '뒤로', title: '처음 화면이다' } : { eyebrow: '뒤로', title: '지금은 ✓ 로 진행한다' });
  }
  // 다마고치 모드 (GDD 27장): 기기 둘레 몸체·키링·뒷면. 꾸밈을 걸 때마다 지금 캐릭터를 알려 준다
  const tama = initTamago(dev, { persist: () => persist(), onKeyringTap: () => keyringTestTap() });
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
  // 앱 이탈 (GDD 119장 2): 노래·효과음 멈춤 → 돌아오면 노래 다시(설정에서 끈 소리는 그대로). 전투·원정은 각 화면이 듣는다
  onAppAway((away) => {
    setSfxSuspended(away);
    try { bgm().setSuspended(away); } catch { /* 소리는 부가 */ }
  });
  // 원정 중 앱 이탈 (GDD 192장 1, C.311): 떠난 시각을 중간 저장에 적어 둔다(이어 하기 시한의 기준). 시한(30분)을 넘겨 돌아오면 이어 하지 않고 다시 열어
  // readActiveExpedition 이 모험 실패로 정산하게 한다(전투 일시정지·걷기 시계가 멈춰 있던 상태를 억지로 걷지 않는다). 시한 안에 돌아오면 떠난 시각을 지운다
  let awayAt = 0;
  onAppAway((away) => {
    if (!save || slot === 0 || !activeExp || activeExp.phase === 'ended') { awayAt = 0; return; }
    const snap = save.activeExpedition;
    if (away) {
      awayAt = Date.now();
      if (snap) { markExpeditionLeft(snap, awayAt); persist(); }
      return;
    }
    const expired = awayAt > 0 && Date.now() - awayAt > resumeWindowMs();
    awayAt = 0;
    if (expired) { window.location.reload(); return; }
    if (snap?.leftAtMs !== undefined) { markExpeditionBack(snap); persist(); }
  });
  installAppAway();
  /** 화면 하나를 스택에 쌓고 그린다 (그릴 때마다 창 스크롤을 맨 위로). 배경 음악(GDD 24-4): 둥지 메뉴 화면은 nest, 잠긴 흐름(전투·원정·연출)은 그 화면이 정한다(null) */
  const open = (id: string, render: () => void, locked = false, track: BgmTrack | null = locked ? null : 'nest') =>
    nav.push({ id, locked, render: () => { if (track) setBgm(track); render(); root.scrollTop = 0; } });

  // 클라우드 세이브 (GDD 196장, C.323): 로그인은 선택. Firebase 층(cloudFirebase.ts + SDK)은 로그인 버튼을 누르거나 이미 로그인된 기기에서만 동적 import.
  // 테스트 모드(가짜 저장소)에서는 아예 없다. 저장할 때마다 schedule(묶어서 올림), 연결되면 onOnline, 앱이 숨겨지면 flush
  const cloudFake = import.meta.env.DEV && new URLSearchParams(location.search).has('cloudfake');
  const cloud: CloudSync | null = testOn ? null : new CloudSync({
    storage: store,
    // 점검용 가짜(`?cloudfake`, dev 서버만 — 배포 빌드에서는 이 분기가 빠진다): 실제 Google 로그인 없이 설정 줄·고르기 창을 찍는다 (scripts/c323-proof.cjs)
    loadBackend: () => (cloudFake
      ? import('../cloudFake').then((m) => m.loadFakeBackend())
      : import('../cloudFirebase').then((m) => m.loadFirebaseBackend())),
    build: BUILD_ID,
    current: () => ({ slot, save }),
    onConflict: (c) => queueCloudConflict(c),
    onApplied: (n) => {
      if (slot !== 0 && n === slot) reloadSlot(); // 플레이 중인 슬롯이 바뀌었다 → 다시 연다
      else if (slot === 0 && nav.top?.id === 'title') nav.top.render(); // 처음 화면의 슬롯 줄 갱신
    },
    notify: (title, meta) => showToast({ eyebrow: '클라우드', title, meta }, 0, 4600),
    deviceName: deviceLabel(navigator.userAgent, isStandalone()),
    onBlocked: (by) => onCloudBlocked(by),
    onUnblocked: () => onCloudUnblocked(),
    online: () => navigator.onLine !== false,
  });
  const cloudUi: CloudUi | undefined = cloud ? {
    state: () => cloud.state(),
    signIn: (o) => cloud.signIn(o),
    signInGuest: (o) => cloud.signInGuest(o),
    signOut: () => void cloud.signOut(),
    email: (kind, email, password) => cloud.emailAction(kind, email, password),
    link: (kind, email, password) => cloud.linkAccount(kind, email, password),
    reclaim: () => cloud.reclaim(),
    warm: () => cloud.warm(),
    retry: () => cloud.retryNow(),
    notify: (title, meta) => showToast({ eyebrow: '클라우드', title, meta }, 0, 4600),
    onChange: (cb) => cloud.onChange(cb),
  } : undefined;
  /** 기기·클라우드 세이브가 다를 때 고르는 창 (GDD 196장 4): 잠긴 흐름(전투·원정·연출)·안내 중·처음 로그인 창·막기 창이면 방·처음 화면으로 돌아올 때 띄운다 */
  let pendingCloudConflict: CloudConflict | null = null;
  function queueCloudConflict(c: CloudConflict): void {
    pendingCloudConflict = c;
    showCloudConflictIfIdle();
  }
  function showCloudConflictIfIdle(): void {
    const c = pendingCloudConflict;
    if (!c || !nav.top || nav.top.locked || guideOpen || recoverOpen || closeGate || closeBlocked) return;
    if (nav.top.id !== 'title' && nav.top.id !== 'room' && nav.top.id !== 'settings') return;
    pendingCloudConflict = null;
    showCloudConflict(c);
  }
  // 한 기기만 (GDD 199장 4, C.325): 잠긴 화면(전투·원정·연출)에서 막히면 원정 떠남 시각을 적고 저장한 뒤 표시를 남기고 다시 켠다 — 켜지면 처음 화면 + 막기 창(차지하지 않음).
  // 안 잠긴 화면이면 저장하고 처음 화면으로 돌아가 막기 창. 표시는 sessionStorage(같은 탭의 다시 켜기까지만 — 앱을 껐다 켜는 것은 '켜짐'이라 다시 차지한다)
  const CLOUD_BLOCKED_SESSION_KEY = 'bha-cloud-blocked';
  function readBlockedFlag(): ActiveDevice | null {
    try {
      const raw = JSON.parse(sessionStorage.getItem(CLOUD_BLOCKED_SESSION_KEY) ?? 'null') as ActiveDevice | null;
      return raw && typeof raw.device === 'string' && typeof raw.at === 'number' ? raw : null;
    } catch {
      return null;
    }
  }
  function writeBlockedFlag(by: ActiveDevice | null): void {
    try {
      if (by) sessionStorage.setItem(CLOUD_BLOCKED_SESSION_KEY, JSON.stringify(by));
      else sessionStorage.removeItem(CLOUD_BLOCKED_SESSION_KEY);
    } catch {
      /* 저장소가 막혀 있으면 이번 실행만 */
    }
  }
  let closeBlocked: (() => void) | null = null;
  let closeGate: (() => void) | null = null;
  function onCloudBlocked(by: ActiveDevice): void {
    if (!cloudUi) return;
    pendingCloudConflict = null;
    writeBlockedFlag(by);
    if (closeBlocked) return; // 이미 막기 창이 떠 있다(저쪽이 다시 차지했다) — 그대로
    if (nav.top?.locked) {
      // 전투·원정·연출: 앱 이탈과 같은 처리(GDD 192장 1) — 떠난 시각을 적고 저장한 뒤 다시 켠다(이어 하기 시한 안이면 그 지점부터)
      if (save && slot !== 0) {
        if (activeExp && activeExp.phase !== 'ended' && save.activeExpedition) markExpeditionLeft(save.activeExpedition, Date.now());
        persist();
      }
      window.location.reload();
      return;
    }
    if (save && slot !== 0) persist();
    closeGate?.();
    titleScreen();
    closeBlocked = otherDeviceDialog(cloudUi, by);
  }
  function onCloudUnblocked(): void {
    writeBlockedFlag(null);
    const was = closeBlocked;
    closeBlocked = null;
    was?.();
    if (!was || !cloud) return;
    if (cloud.state().user) showToast({ eyebrow: '클라우드', title: '이 기기에서 이어 한다' }, 0, 3200);
    else showLoginGate(); // 막기 창에서 로그아웃했다 → 다시 고른다
    showCloudConflictIfIdle();
  }
  /** 처음 로그인 창 (GDD 199장 2): 처음 화면 위에. 로그인하면 기억해 다음부터 안 띄운다. 뒤로(로그인 없이)는 기억하지 않는다 — 다음에 다시 묻는다 */
  function showLoginGate(): void {
    if (!cloudUi || !cloud || closeGate || closeBlocked) return;
    closeGate = loginGateDialog(cloudUi, (how, why) => {
      closeGate = null;
      // GDD 222장 2: 로그인·[로그인 없이 하기]·게스트 실패는 기억해 다시 안 띄운다(뒤로만 다음에 다시 묻는다). 게스트 실패는 쉬운 말로 알리고 로그인 없이 계속
      if (how !== 'skipped') markLoginGateDone(store);
      if (how === 'guest-failed') showToast({ eyebrow: '클라우드', title: `${(why ?? '게스트로 시작하지 못했다.').replace(/\.$/, '')} — 로그인 없이 하기로 계속한다`, meta: GATE_TEXT.guestFailed }, 0, 4600);
      else if (how !== 'signed-in' && firstGateNote(store)) showToast({ eyebrow: '클라우드', title: '로그인 없이 시작한다', meta: GATE_TEXT.skipped }, 0, 3200); // 처음 한 번만
      showCloudConflictIfIdle();
    });
  }
  if (cloud) {
    cloud.start({ blocked: readBlockedFlag() });
    window.addEventListener('online', () => cloud.onOnline());
    window.addEventListener('pagehide', () => void cloud.flush());
    document.addEventListener('visibilitychange', () => { if (document.hidden) void cloud.flush(); else cloud.onVisible(); });
    window.addEventListener('pageshow', () => { if (!document.hidden) cloud.onVisible(); });
  }

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
        ? { eyebrow: '저장 공간', title: '공간이 부족해 백업을 지웠다', meta: '진행은 저장됐다. 설정 > 백업에서 내보내기를 해 두면 안전하다.' }
        : { eyebrow: '저장 공간', title: '저장 공간이 가득 차 저장하지 못했다', meta: '설정 > 백업에서 내보내기를 하고 쓰지 않는 슬롯을 비우면 된다.' }, 0, 5200);
    }
    touchSlot(store, slot);
    cloud?.schedule(); // 로그인 중이면 클라우드에도 (묶어서, GDD 196장 3)
  };
  const storageWarned = new Set<string>();
  // 새 버전 (GDD 184장 3, C.283): 처음 화면(게임 시작 전 — 슬롯·종족 고르기)이면 자동 다시 시작. 다시 시작 직전 저장은
  // 잠긴 흐름(전투·원정·연출) 밖에서만 — 그 안은 마지막 중간 저장에서 이어한다(저장 꼬임 방지)
  setUpdateHost({
    isPreGame: () => nav.top?.id === 'title' || nav.top?.id === 'species',
    saveNow: () => { if (nav.top && !nav.top.locked) persist(); },
  });
  /** 이어 하지 못한 모험 안내 한 줄 (GDD 192장 1, C.311 — text-style: 한 줄·'~다'): 시한 초과·새 버전이면 실패로 정산했다, 첫 모험 튜토리얼은 처음부터, 손상은 기록만 */
  const abandonNote = (r: { reason: AbandonReason; settled: boolean }): string => {
    if (r.reason === 'corrupt') return r.settled ? '저장된 모험이 손상돼 실패로 끝났다.' : '저장된 모험이 손상돼 이어 가지 못했다.';
    const why = r.reason === 'stale' ? `${BALANCE.provisional.expedition.resumeWindowMinutes}분 넘게 비워` : '새 버전이 나와';
    return r.settled ? `${why} 모험이 실패로 끝났다.` : `${why} 첫 모험을 처음부터 다시 한다.`;
  };
  /** 이어 하지 못한 모험 알림 창 (GDD 193장 4, 코딩216 개선점 4: 옛 '지웠다' 글은 방 구석 한 줄뿐이라 눈에 안 띄었다) — 방 위에 [확인] 하나짜리 창(귀환 카드 C.170 과 같은 틀).
   *  본문 = 안내 한 줄 + 정산했으면 전투·흡수·골드·타일 요약. 방 구석 한 줄(resumeNote)은 창을 닫은 뒤에도 남는다 */
  const showAbandonCard = (r: { reason: AbandonReason; settled: boolean; exp: ExpeditionState | null }, faction: FactionConfig): void => {
    const title = r.settled ? '모험 실패' : r.reason === 'corrupt' ? '모험 손상' : '첫 모험 다시';
    const tail = r.settled && r.exp ? ` ${abortSummaryLine(r.exp, faction)}${summarize(r.exp).lost.length > 0 ? ` · 잃은 타일 ${summarize(r.exp).lost.length}장` : ''}` : '';
    confirmDialog({ title, body: `${abandonNote(r)}${tail}`, yes: '확인', single: true, onYes: () => {} });
  };
  /** 이어 하지 못한 모험 안내 한 줄. 다음 원정을 시작하면 지운다 */
  let resumeNote = '';
  /** 꺼 둔 동안 배고파졌으면 방에 처음 들어갈 때 한 번 말한다 (GDD 24-1) */
  let hungryGreet = false;
  /** 다시 열 때 꺼 둔 동안 (GDD 102-7): 방이 그려진 뒤 알림 띠 한 번 */
  let absence: AbsenceReport | null = null;
  /** 대기 모드 결과 (GDD 85장 6번): 다시 열 때 정산한 요약 — 방을 그린 뒤 한 번 보여 주고 비운다 */
  let idleReport: IdleAccrual | null = null;
  /** 떠돌이 상인 도착을 알린 방문 시각 (GDD 85장 5번): 같은 방문은 한 번만 알린다 */
  let wandererAnnounced = -1;
  /** 방에 띄운 떠돌이 상인 도착 알림 — 장터에 들어가면 걷는다 (GDD 127장 3: 장터 안에서는 안 뜨게) */
  let wandererToast: HTMLElement | null = null;
  /** 방 안내(GDD 64·67장)를 잠시 미룬다: 귀환 결과 다음에 진화 연출이 뜰 차례면 연출이 끝나고 방으로 돌아올 때 띄운다 */
  let holdRoomGuides = false;
  /** 안내 오버레이가 떠 있다 (방을 다시 그려도 겹쳐 띄우지 않는다) */
  let guideOpen = false;

  /** 튜토리얼 회복 안내가 진행 중이다 (GDD 123장 5 수정 v5.280, C.199) */
  let recoverOpen = false;
  /** 회복 안내 먹이 카드: 먹인 순간 각본 값(배부름·체력 가득)을 넣는다 (방 onFed, GDD 132장 3) */
  let recoverFedHook: (() => void) | null = null;

  /**
   * 튜토리얼 원정 뒤 회복 안내 (GDD 123장 5 수정 v5.280, C.199 · 129-2 2, C.206 · 144장 4, C.223): 카드 4장(GDD 193장 8, C.304 — 옛 7장)을 순서대로. 건너뛰기 없음.
   * 카드는 눌러야 할 버튼을 가리키기만 하고, 사용자가 원래 조작으로 해야 [다음]이 켜진다(행동을 대신 해 주는 버튼 없음).
   * 빈사 설명·가방 열기(구급상자 지급) → 구급상자 [사용] → 방 → (월드맵 물건 → 월드맵 →) 온천 들어가기(80%, 튜토리얼 온천 10초 — GDD 145장 1) → 방 → 먹이 주기 → '다음 할 일'.
   * 껐다 켜면 세이브 값에서 이어 간다(recoverStep). 띄웠으면 true
   */
  function runRecover(faction: FactionConfig): boolean {
    if (!save || recoverOpen || guideOpen) return false;
    const s = save;
    const start = recoverStep(s);
    if (!start) return false;
    if (grantCureReward(s)) persist(); // 빈사를 고친 뒤 껐다 켰으면 여기서 치료제 보상 (GDD 245장 9)
    recoverOpen = true;
    const props = roomOf(faction).props;
    const wm = worldMapOf(faction); // 온천 = 월드맵 장소 (GDD 153장 1)
    const HH = BALANCE.provisional.nest.homeHp;
    const TR = BALANCE.provisional.tutorialRecover;
    const pct = (x: number) => String(Math.round(x * 100));
    const vars = {
      chestName: props.chest, spaName: wm.places.spa, worldMapName: wm.name, dyingPct: pct(BALANCE.provisional.nest.care.dying.hpFraction), spaToPct: pct(TR.spaTo),
      spaHpPct: pct(HH.tutorialSpa.hpPerSecond), spaFullness: String(HH.tutorialSpa.fullnessPerSecond), spaCond: String(HH.tutorialSpa.conditionPerSecond), spaNormalSec: String(Math.round(1 / HH.spa.hpPerSecond)), // 튜토리얼 온천 10초 · 평소 약 20초 (GDD 164장 1)
      idleHpPct: pct(HH.idlePerMinute), // 옛 7/7 '회복 끝' 문구용(193장 8 에서 카드 삭제) — 주석 안에 묻혀 빠져 있어 카드가 빈 채 멈췄다 (GDD 155장 2)
      foodName: faction.foodNames[BALANCE.provisional.tutorialRecover.food], foodId: TR.food, nestName: faction.nestName, // '방' = 종족 이름 (GDD 176장 9)
      fullnessNow: '', // 배부름 카드 지금 값 — 카드를 띄울 때 채운다 (GDD 241-B 5)
    };
    const toRoom = () => {
      if (nav.top?.id !== 'room') nestScreen();
      else nav.top.render();
    };
    const onRoomRender = () => { if (nav.top?.id === 'room') nav.top.render(); }; // 지급한 먹이 개수가 독에 보이게
    const EPS = 1e-6;
    // 카드마다 (GDD 129-2 2): 카드는 눌러야 할 버튼만 가리킨다 — act = 원래 게임 조작으로 할 것(하기 전에는 [다음] 잠김), show = 카드가 뜰 때 지급, next = [다음] 뒤 할 일
    // 실제 조작: 가방 열기 → 구급상자 카드 눌러 [사용] → 월드맵 → 온천 → 먹이 주기. [다음]만으로 넘어가는 것은 설명 카드뿐
    const spaWay = '.bha-prop--outside, .bha-worldmap [data-place="spa"]'; // 방 → 월드맵 → 온천 (GDD 153장 1, 157장 4 단계 안내)
    // 썼으면 물건 창을 닫는다 (C.214): 시작 구급상자 3개(C.211)라 쓰고도 남아 창이 그대로 떠 있었고, 기기 초점이 창 안(닫기·흐린 [사용])에 갇혀 카드 [다음]으로 못 갔다
    const closeItemWhen = (done: boolean): boolean => {
      if (done) document.querySelector<HTMLButtonElement>('.bha-itemdialog .bha-itemmodal__close')?.click();
      return done;
    };
    let fedAt = s.nest.lastFedAt;
    let soaked = false;
    let inSpa = false;
    const steps: Record<string, { act?: TutorialAct; show?: () => void; next?: (go: () => void) => void; skip?: () => boolean }> = {
      // 빈사 설명 + 가방 열기를 한 카드로 (GDD 193장 8, C.304 — 옛 '빈사'·'치료' 2장)
      dying: {
        show: () => { recoverGrantBag(s); persist(); openChestAtConsumables(); }, // 가방을 열면 소모품 칸부터
        // 가방이 열리면 [다음] 없이 바로 다음 카드(가방 안 구급상자 옆 안내)로 — 가방 화면에 '열어 보자' 카드가 남아 목록을 덮지 않게 (GDD 182장 1)
        act: { selector: '.bha-prop--chest', autoFinish: true, done: () => nav.top?.id === 'chest' },
      },
      // 구급상자 다음은 방에서 온천 카드 (GDD 144장 4 — 방에서 포션 마시는 단계 삭제)
      cure: { skip: () => !s.nest.collapsed, act: { selector: '[data-item="med-cure"]', done: () => {
        // 빈사가 풀린 순간 옛 시작 가방 물건 전부(치료제·회복 물건·싸구려 간식) 보상 (GDD 245장 9 · v6.005 — 새 게임 시작 지급 대신)
        if (!s.nest.collapsed && grantCureReward(s)) {
          persist();
          showToast({ eyebrow: '튜토리얼 보상', title: '가방에 회복 물건이 들어왔다', meta: [...Object.entries(TR.cureReward).map(([id, n]) => `${consumableName(id)} ${n}`), ...Object.entries(TR.cureFood).map(([id, n]) => `${faction.foodNames[id as keyof typeof faction.foodNames]} ${n}`)].join(' · '), center: true }, 0, 3600); // 옛 시작 가방 물건 전부 (GDD v6.005)
        }
        return closeItemWhen(!s.nest.collapsed);
      } }, next: (go) => { toRoom(); go(); } },
      'to-spa': {
        // 온천에 들어가면(원래 조작, 방 → 월드맵 → 온천 단계 안내 — GDD 157장 4) 실제 시간으로 찬다 (GDD 139장 2 — 10초에 가득이라 시간을 흘리는 연출 없이 막대가 실시간으로 차오름).
        // 체력이 spaTo 에 닿으면 [다음]. 배부름이 먼저 바닥나 나왔으면 각본 값 spaTo 까지 채운다
        // GDD v6.005: 튜토리얼 온천은 가득 차는 순간 바로 나간다(머묾 0) — 카드 [다음] 없이 '체력이 가득 찼다!' 알림과 함께 걸어 나가 방으로
        act: { selector: `${spaWay}, .bha-spa__actor`, autoFinish: true, done: () => {
          if (soaked) return true;
          if (!s.nest.spa) {
            if (!inSpa) return false;
            if (homeHp(s).fraction < TR.spaTo - EPS) setHomeHpOf(s, TR.spaTo);
            persist();
            return (soaked = true);
          }
          if (nav.top?.id !== 'spa') return false;
          inSpa = true;
          return (soaked = previewHomeHp(s.nest, Date.now()).fraction >= TR.spaTo - EPS);
        } },
        // C.274 (GDD 180장 2 보충): 가득 차도 튜토리얼 온천은 저절로 나가지 않으므로, '온천' 카드 [다음] 에서 걸어 나가 방으로 (옛 '쉬기' 카드는 193장 8 에서 삭제)
        next: (go) => {
          showToast({ eyebrow: wm.places.spa, title: '체력이 가득 찼다!', center: true }, 0, 2000);
          const leave = () => { spaLeave(s); persist(); nestScreen(); go(); };
          if (!spaExitFx(leave)) leave();
        },
      },
      // 배부름 카드 (GDD 241-B 5): 지금 배부름 수치를 먼저 보여 준다 — 설명 카드([다음]), 펼친 먹이 줄 없이 방에서
      fullness: { show: () => toRoom() },
      feed: {
        // 먹인 순간(방 onFed) 각본 값을 넣어, 방 막대가 약 1초에 걸쳐 그 값까지 차는 걸 보여 준다 (GDD 132장 3)
        show: () => { grantRecoverFood(s); fedAt = s.nest.lastFedAt; recoverFedHook = () => recoverFeedDone(s); persist(); onRoomRender(); },
        // 먹는 연출(막대 차오름)이 끝나면 [다음] 없이 바로 다음 안내('다음 할 일')로 — 먹은 뒤 '먹어 보자' 카드에 [다음]을 한 번 더 누르게 하지 않는다 (GDD 162장 2).
        // 옛 결과 카드 '회복 끝'은 193장 8(C.304)에서 삭제 — '방에서 쉬어도 체력이 찬다'는 도움말 방 화면 요약으로
        act: { selector: `.bha-homedock__carebtn--feed, .bha-homedock__food[data-food="${TR.food}"]`, autoFinish: true, done: () => {
          if (s.nest.lastFedAt === fedAt) return false;
          if (recoverFedHook) recoverFeedDone(s); // 훅을 못 탔으면(다른 길로 먹임) 여기서
          recoverFedHook = null;
          persist();
          return true;
        } },
        // 끝나면: 펼친 먹이 줄이 남아 있으면 닫는다 — 옛 '회복 끝' 카드가 하던 일 (GDD 162장 2)
        next: (go) => {
          document.querySelector<HTMLButtonElement>('.bha-homedock__carebtn--feed[aria-expanded="true"]')?.click();
          // 보상 (GDD 241-B 5): 일반 먹이 6종 각 rewardEach 개 — 지급은 recoverFeedDone, 여기선 알림만
          showToast({ eyebrow: '튜토리얼 보상', title: `일반 ${faction.foodGroupName} 6종 각 ${TR.rewardEach}개`, meta: NORMAL_FOODS.map((f) => faction.foodNames[f]).join(' · '), center: true }, 0, 3200);
          onRoomRender();
          go();
        },
      },
    };
    /** 투명한 막(recover-wait)으로 ms 동안 터치·기기 버튼을 받지 않다가 then */
    const holdInput = (ms: number, then: () => void): void => {
      const hold = el('div', 'bha-tut is-script is-nodim');
      hold.dataset.tutorial = 'recover-wait';
      getOverlayHost().append(hold);
      const offHold = registerLayer(hold, () => {});
      window.setTimeout(() => {
        offHold();
        hold.remove();
        then();
      }, ms);
    };
    const ids = RECOVER_SCENES.map((x) => x.id);
    // 이어 가기: 빈사 = 처음, 온천 = 방에서 온천 카드, 먹이 = 방에서 배부름 카드(GDD 241-B 5 — 먹이 카드 앞)
    const first = start === 'dying' ? 0 : start === 'spa' ? ids.indexOf('to-spa') : ids.indexOf('fullness');
    const show = (i: number): void => {
      const scene = RECOVER_SCENES[i];
      if (!scene) {
        recoverOpen = false;
        persist();
        runGuide('first-run-room', faction);
        return;
      }
      const st = steps[scene.id] ?? {};
      if (st.skip?.()) return show(i + 1);
      st.show?.();
      tutorialOverlay(faction, {
        scenes: [scene], name: 'recover', pauseLabel: null, finishLabel: '다음', vars: { ...vars, fullnessNow: String(Math.round(fullnessOfNest(s.nest))) }, // 배부름 카드는 지금 값 (GDD 241-B 5)
        script: { step: `회복 안내 ${i + 1} / ${RECOVER_SCENES.length}`, act: st.act },
        onFinish: (status) => {
          if (status !== 'completed') {
            recoverOpen = false;
            return;
          }
          // 화면이 바뀐 뒤 대상 위치를 잰다. 그 틈에도 투명한 막으로 누름을 막는다 — 틈에 다른 버튼(상점 등)을 누르면 다음 카드가 대상 없는 화면에 떠 갇혔다 (C.214)
          const go = () => holdInput(450, () => show(i + 1));
          if (st.next) st.next(go);
          else go();
        },
      });
    };
    {
      // 방은 이미 그려졌다. 앞선 알림(튜토리얼 달성 등)이 맨 위에서 다 사라진 뒤 첫 카드 (GDD 129장 3 — 알림이 카드를 가리지 않게, 최대 약 10초)
      // 기다리는 동안은 투명한 막이 방을 덮어 누름(터치·기기 ✓)을 받지 않는다 — 다른 화면으로 가 버리지 않게
      const hold = el('div', 'bha-tut is-script is-nodim');
      hold.dataset.tutorial = 'recover-wait';
      getOverlayHost().append(hold);
      const offHold = registerLayer(hold, () => {});
      let quiet = 0;
      let tries = 0;
      const wait = (): void => {
        quiet = document.querySelector('.bha-toast') ? 0 : quiet + 1;
        if (quiet < 2 && ++tries <= 40) return void window.setTimeout(wait, 250);
        offHold();
        hold.remove();
        show(first);
      };
      wait();
    }
    return true;
  }

  /** 처음 켰을 때 홈 안내가 떠 있다 (GDD 131장, C.207) */
  let homeIntroOpen = false;
  /** 첫 모험 강제 중 (GDD 131장 2): 방은 월드맵 물건(모험 문)만, 월드맵은 모험만 */
  let forceAdventure = false;
  const FORCE_HINT = { eyebrow: '튜토리얼', title: '먼저 모험을 떠나자', meta: '' };

  /** 홈 안내 카드 (GDD 131장 1): 첫 카드 + 방에 실제로 있는 물건·독 버튼(대상이 화면에 없으면 뺀다). 이름은 종족 설정에서 */
  function homeIntroScenes(faction: FactionConfig): { scenes: TutorialScene[]; vars: Record<string, string> } {
    const props = roomOf(faction).props;
    const mk = marketOf(faction);
    const wm = worldMapOf(faction);
    const care = (['feed', 'sleep', 'pet'] as const).map((a) => faction.nestActionsShort?.[a] ?? faction.nestActions[a]).join('·');
    const vars = {
      outsideName: props.outside, adventureName: wm.places.adventure, towerName: wm.places.tower, altarName: props.altar, bookName: props.book, chestName: props.chest, marketName: mk.name, worldName: wm.name, careNames: care,
    };
    const shown = (sc: TutorialScene) => sc.targets.some((t) => document.querySelector(t.slice(1)) !== null);
    const scenes: TutorialScene[] = [{ id: 'intro', ...HOME_INTRO.intro }, ...HOME_INTRO.items.filter(shown)]; // 3장 (GDD 193장 8): 방·상태·체력 → 돌보기 → 첫 모험
    return { scenes, vars };
  }

  /**
   * 처음 켰을 때 홈 안내 → 첫 모험 강제 (GDD 131장, C.207): 새 세이브(첫 원정 전)의 첫 방. 회색 덮개·건너뛰기 없음.
   * 카드마다 [다음] → 마지막 카드 = 월드맵 물건만 켜고 나머지 방 버튼 흐린 잠김, 월드맵은 모험만. 실제 버튼을 눌러 떠나면 끝(본 것으로 저장).
   * 뒤로 = 짧은 안내. 띄웠으면 true
   */
  function runHomeIntro(faction: FactionConfig): boolean {
    if (!save || homeIntroOpen || guideOpen || birthOpen || recoverOpen) return false;
    const s = save;
    if (!guidePending(s.help, 'home-intro') || !firstRunPending(s)) return false;
    homeIntroOpen = true;
    const { scenes, vars } = homeIntroScenes(faction);
    const total = scenes.length + 1;
    const show = (i: number): void => {
      const scene = scenes[i];
      if (scene) {
        tutorialOverlay(faction, {
          scenes: [scene], name: 'home-intro', pauseLabel: null, finishLabel: '다음', vars,
          script: { step: `홈 안내 ${i + 1} / ${total}`, onPrev: i > 0 ? () => show(i - 1) : undefined }, // [이전] (GDD 229장 1)
          onFinish: (st) => (st === 'completed' ? show(i + 1) : void (homeIntroOpen = false)),
        });
        return;
      }
      // 마지막: 첫 모험 강제 — 방을 잠금 모습으로 다시 그리고, 실제 버튼(월드맵 물건 → 모험)을 눌러 떠나야 끝난다
      forceAdventure = true;
      if (nav.top?.id === 'room') nav.top.render();
      const go = '.bha-prop--outside, .bha-worldmap [data-place="adventure"]';
      // 월드맵 물건 → 모험, 누를 때마다 카드·강조가 따라간다 (GDD 132장 1)
      const last = { ...HOME_INTRO.last, targets: go.split(', ').map((x) => `@${x}`) };
      window.setTimeout(() => tutorialOverlay(faction, {
        scenes: [last], name: 'home-intro', pauseLabel: null, finishLabel: '다음', vars,
        script: { step: `홈 안내 ${total} / ${total}`, act: { selector: go, autoFinish: true, done: () => nav.top !== undefined && nav.top.id !== 'room' && nav.top.id !== 'worldmap' } },
        onFinish: () => {
          forceAdventure = false;
          homeIntroOpen = false;
          markGuideDone(s.help, 'home-intro');
          persist();
        },
      }), 300); // 잠금 모습으로 다시 그린 뒤 대상 위치를 잰다
    };
    show(0);
    return true;
  }

  /** 해금 안내 카드 순서 = 해금 표 순서 (GDD 241-0) */
  const UNLOCK_GUIDE_ORDER: TextGuideId[] = ['hogyoku-appear', 'hogyoku-resonance', ...FEATURE_IDS.map((id) => UNLOCK_GUIDES[id])]; // 붕옥 등장 컷이 먼저 (GDD 243장 1)

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

  /** 해금 안내 카드 (GDD 241-0, C.394): 방에 돌아왔을 때 띄울 차례인 것을 표 순서대로 하나씩 이어서 — 장비 → 타일 → 출정품 → 본능 수련 → 번호 쟁탈전 → 펫 */
  function runUnlockGuides(faction: FactionConfig): boolean {
    for (const id of UNLOCK_GUIDE_ORDER) {
      if (id === 'unlock-gear') {
        if (runGearGuide(faction)) return true;
        continue;
      }
      if (runGuide(id, faction, { finishLabel: '알겠어요', onDone: () => window.setTimeout(() => { if (nav.top?.id === 'room') runUnlockGuides(faction); }, 250) })) return true;
    }
    return false;
  }

  /**
   * 장비 해금 안내 = 따라 하기 (GDD 243장 3): ① 가방을 눌러 장비 탭 열기 ② 받은 낡은 무기·방어구·신발을 하나씩 [착용](무기·방어구·신발 칸이 차면 [다음]) ③ 강화 설명.
   * 실제 조작 카드(TutorialAct) — 그동안 눌러도 되는 것은 가방·장비 카드·상세 창뿐. 낄 장비가 없는 종류는 기다리지 않는다(보관함이 가득이라 못 받은 옛 세이브)
   */
  function runGearGuide(faction: FactionConfig): boolean {
    if (!save || guideOpen || !guidePending(save.help, 'unlock-gear')) return false;
    const s = save;
    guideOpen = true;
    const scenes = GUIDES['unlock-gear'];
    const worn = (): boolean => (['weapon', 'armor', 'shoes'] as const).every((k) => s.shared.gear.equipped[k] !== null || !s.shared.gear.items.some((it) => it.kind === k));
    const acts: Record<string, TutorialAct | undefined> = {
      open: { selector: '.bha-prop--chest', autoFinish: true, done: () => document.querySelector('.bha-equip-page') !== null },
      wear: { selector: '.bha-equip-page .bha-eqright .bha-itemcard, .bha-equip-page .bha-eqslot[data-slot], .bha-itemdialog, .bha-prop--chest', done: worn }, // 가방을 닫아 버려도 다시 열 수 있게 가방도
    };
    const finish = (): void => {
      guideOpen = false;
      markGuideDone(s.help, 'unlock-gear');
      persist();
      window.setTimeout(() => { if (nav.top?.id === 'room') runUnlockGuides(faction); }, 250);
    };
    const show = (i: number): void => {
      const scene = scenes[i];
      if (!scene) return finish();
      // 이미 한 단계는 건너뛴다 (가방이 이미 열려 있음 · 이미 다 낌)
      if (scene.id === 'open' && document.querySelector('.bha-equip-page')) return show(i + 1);
      if (scene.id === 'wear' && worn() && i > 0) return show(i + 1);
      if (scene.id === 'open') openChestAtGear();
      tutorialOverlay(faction, {
        scenes: [scene], name: 'unlock-gear', pauseLabel: null, finishLabel: i === scenes.length - 1 ? '알겠어요' : '다음', vars: guideVars(faction),
        script: { step: `장비 안내 ${i + 1} / ${scenes.length}`, act: acts[scene.id] },
        onFinish: (status) => {
          if (status !== 'completed') return finish();
          window.setTimeout(() => show(i + 1), 300);
        },
      });
    };
    show(0);
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
        // 연출 끝 → 홈 안내가 뜰 때까지 입력을 막는다 (GDD 176장 5: 틈에 ✓ 가 월드맵을 열던 문제). 안내 레이어는 runHomeIntro 안에서 바로 등록된다
        const release = blockInput();
        window.setTimeout(() => {
          try {
            if (nav.top?.id === 'room') runHomeIntro(faction); // 탄생 연출 뒤 홈 안내 (GDD 131장)
          } finally {
            release();
          }
        }, 300);
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
        if (i < ids.length) showGuide(faction, ids[i]!, { finishLabel: i === ids.length - 1 ? '닫기' : '다음 안내', replay: true, onDone: () => next(i + 1) });
      };
      next(0);
    };
    const out = [{ label: '첫 모험 안내', run: chain(['first-run', 'first-absorb', 'first-run-room']) }];
    // 홈 안내 다시 보기 (GDD 131장 3): 방에서 연 도움말일 때만(대상이 방 버튼) — 설명 카드만, 강제 없음
    if (nav.top?.id === 'room') out.unshift({ label: '홈 안내', run: () => {
      const { scenes, vars } = homeIntroScenes(faction);
      tutorialOverlay(faction, { scenes, name: 'home-intro', pauseLabel: null, finishLabel: '닫기', vars, replay: true, onFinish: () => undefined });
    } });
    if (faction.birthFx) out.push({ label: '탄생 연출', run: () => void playBirth(faction) });
    if (save && tilesUnlocked(save)) out.push({ label: '타일 안내', run: chain(['tile-intro', 'tile-plan', 'tile-draw']) });
    // 해금 안내 다시 보기 (GDD 241-0): 열린 것만
    if (save) for (const id of FEATURE_IDS) {
      const g = UNLOCK_GUIDES[id];
      if (g !== 'tile-intro' && featureUnlocked(save, id)) out.push({ label: `${featureName(faction, id)} 안내`, run: chain([g]) });
    }
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
      params.liberationStartGauge = liberationStartGaugeOf();
    }
    // 다시 보기도 첫 원정 첫 전투와 같은 각본 전투 (GDD 123장 5, C.199 — 옛 '직접 해 보기' 대체)
    const s = createCombat(Math.floor(Math.random() * 2 ** 32), { enemy, params, script: newCombatScript() });
    setBgm('battle');
    battleView(root, faction, s, {
      tierIndex: save ? artTierIndexOf(save) : undefined,
      formId: save?.evolution.formId,
      skinId: save ? artSkinOf(save) : undefined,
      notice: '튜토리얼 체험 전투 (기록되지 않음)',
      tutorial: { onDone: () => { if (save) { markTutorialSeen(save.help); persist(); } } },
      onQuit: () => nav.pop(),
      onEnd: () => nav.pop(),
    });
  }

  // ── 시작 화면·슬롯 (Q-3) ──
  // C.178 (GDD 103장): 시작 화면·종족 고르기에서 연 설정은 공통만, 게임 안(방)에서 연 설정은 [공통]/[이 슬롯]. 저장 안 하고 뒤로면 설정 화면이 먼저 묻고 onBack
  /** [이름·성별 바꾸기]에서 돌아올 때 설정을 기타 탭으로 다시 연다 (C.326) — 한 번 쓰고 비운다 */
  let settingsReturnTab: 'etc' | null = null;
  const settingsOpener = (inGame: boolean) => () => {
    settingsReturnTab = null;
    open('settings', () => void settingsView(root, {
      tab: settingsReturnTab ?? undefined,
      onHelp: () => openHelp(undefined, true),
      onBackup: inGame && !testOn ? () => open('backup', () => backupView(root, save, persist, { slot, onApplied: reloadSlot })) : undefined,
      onIdentity: inGame && save ? editIdentity : undefined, // 설정 > 기타 [이름·성별 바꾸기] (GDD 199장 7)
      onBack: () => nav.pop(),
      commonOnly: !inGame,
      cloud: cloudUi, // 로그인·클라우드 세이브 줄 (GDD 196장) — 처음 화면 설정에서도 (새 기기에서 가져오기)
    }));
  };

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
      identity: { read: () => ({ name: save?.name ?? null, gender: save?.gender ?? DEFAULT_GENDER }) },
    } : null);
    setActiveGender(save?.gender);
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
    showCloudConflictIfIdle();
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
    if (!r) return void showToast({ eyebrow: '내보내기', title: fixParticles(`슬롯 ${n}을(를) 내보낼 수 없다`), meta: '세이브가 비었거나 읽을 수 없다.' }, 0, 4200);
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
          title: `슬롯 ${sum.slot} 덮어쓰기`,
          body: '이 슬롯의 기록이 새 세이브로 바뀐다. 덮어쓰기 전의 세이브는 슬롯 백업에 한 번 보관된다.',
          yes: '덮어쓰기', no: '아니요', danger: true,
          onYes: begin,
        });
      } else {
        open('backup-import', () => backupView(root, null, () => {}, { slot: sum.slot, importOnly: true, onApplied: () => enterSlot(sum.slot) }));
      }
    }, {
      onImport: () => open('slot-import', () => renderSlotPick('import')),
      selected,
      onDelete: (sum) => confirmDialog({
        // GDD 241-A 4: '정말 삭제하시겠습니까?' + 입력칸 — '삭제' 를 쳐야 [확인]이 켜진다 (빨강 강조 없음, 시작 초점 = [취소] — 244장 1: 입력칸은 눌러야 자판)
        title: '정말 삭제하시겠습니까?',
        body: fixParticles(`슬롯 ${sum.slot}을(를) 지운다. 지우기 전 세이브 하나는 백업으로 남는다.`), // GDD 159장 15: '되돌릴 수 없다'와 '백업' 말이 어긋났다
        typeToConfirm: { word: '삭제', hint: '삭제하려면 삭제 를 입력하세요' },
        yes: '확인', no: '취소',
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
      // 종족 → 이름 → 성별 → 시작 (GDD 199장 6, C.326): 세이브는 성별까지 고른 뒤에 만든다 (도중에 뒤로 가면 슬롯은 그대로)
      onPick: (f) => open('identity', identityFlow(f, 'new', { name: '', gender: null }, (name, gender) => {
        stashSlot(store, newSlot);
        slot = newSlot;
        save = testOn ? newTestSave(f.id) : newSaveData(f.id);
        setIdentity(save, name, gender, 'new');
        if (!testOn) {
          applyStartLook(save, f, Math.random());
          queueGuide(save.help, 'birth'); // 새 세이브의 첫 방에서 탄생 연출 한 번 (GDD 74장)
        }
        persist();
        bindSlotSettings();
        nestScreen();
      }, () => nav.pop())),
      onSettings: settingsOpener(false),
      onHelp: () => openHelp(undefined, true),
      confirm: (f, onYes, onNo) => confirmDialog({
        title: fixParticles(`${f.name}(으)로 시작하시겠습니까?`), // GDD 241-A 2: 설명 없이 묻기만 · 네/아니요
        yes: '네', no: '아니요',
        onYes, onNo,
      }),
    });
  }

  /**
   * 이름·성별 한 화면 (GDD 199장 6~8, C.326 → 241-A 3 한 화면). 뒤로 = onCancel (없으면 뒤로 없음 — 옛 세이브). 돌려주는 함수 = 그 칸의 render
   */
  function identityFlow(f: FactionConfig, mode: IdentityMode, init: { name: string; gender: Gender | null }, onDone: (name: string, gender: Gender) => void, onCancel?: () => void): () => void {
    return () => identityScreen(root, f, { mode, initialName: init.name, initialGender: init.gender, onDone, onBack: onCancel });
  }

  /** 설정 > 기타 [이름·성별 바꾸기] (GDD 199장 7): 같은 두 화면, 끝나면 설정으로 */
  function editIdentity(): void {
    const s = save;
    if (!s) return;
    settingsReturnTab = 'etc';
    open('identity', identityFlow(getFaction(s.factionId), 'edit', { name: s.name ?? '', gender: s.gender }, (name, gender) => {
      setIdentity(s, name, gender, 'settings');
      setActiveGender(s.gender);
      persist();
      nav.pop(); // '이름·성별을 바꿨다' 알림은 뺐다 (GDD 233장 5) — 이름표에 바로 보인다
    }, () => nav.pop()));
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
    if (recovered) window.setTimeout(() => showToast({ eyebrow: '세이브 복구', title: fixParticles(`슬롯 ${n}을(를) 백업에서 열었다`), meta: '세이브가 손상되어 마지막 백업으로 이어한다.' }, 0, 5200), 600);
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
    // 이어 하지 못한 원정(시한 초과·새 버전·손상)은 readActiveExpedition 이 실패로 정산하고 비웠다 → 방에서 안내 한 줄 (GDD 192장 1, C.311)
    if (active && active.reason !== 'none') resumeNote = abandonNote(active);
    persist();
    const toRoom = () => {
      nestScreen();
      if (active && active.reason !== 'none') showAbandonCard(active, getFaction(loaded.factionId));
    };
    // 옛 세이브(이름 없음): 방에 들어가기 전에 한 번 이름·성별 창 (GDD 199장 8) — 뒤로 없음. 원정을 이어 하는 중이면 다음에 방으로 들어올 때
    if (needsIdentity(loaded)) {
      nav.reset({ id: 'identity', locked: true, render: identityFlow(getFaction(loaded.factionId), 'old', { name: '', gender: loaded.gender }, (name, gender) => {
        setIdentity(loaded, name, gender, 'old');
        setActiveGender(loaded.gender);
        persist();
        toRoom();
      }) });
      return;
    }
    toRoom();
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
      const offLayer = registerLayer(layer, () => rotateEvent('cancel'));
      const uncover = coverTutorials(layer); // 튜토리얼 카드·강조 틀은 이 멈춤 창 동안 숨는다 (GDD 194장 3)
      rotateCard = { layer, off: () => { offLayer(); uncover(); }, text, actions };
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

  // ── 처음 화면으로 돌아가기 (Q-3): 더보기 [처음 화면]·홈에서 뒤로(GDD 124장 1) → 확인 → 저장 → 시작 화면 ──
  function askReturnToTitle(): void {
    if (confirmingTitle || nav.top?.id === 'title') return;
    confirmingTitle = true;
    signalHold('hold'); // 전투·원정은 확인창이 떠 있는 동안 멈춘다
    const inExpedition = activeExp !== null && activeExp.phase !== 'ended';
    let uncover = (): void => undefined;
    confirmDialog({
      title: '처음 화면으로',
      body: inExpedition ? '모험은 지금 상태로 저장된다. 이어하기로 돌아오면 이어서 할 수 있다(싸우던 전투는 처음부터 다시 시작한다).' : '지금 상태를 저장하고 처음 화면으로 돌아간다. 이어하기로 다시 열 수 있다.',
      yes: '네', no: '아니요', focusNo: true, // 기본 선택 = 아니요 (GDD 124장 1)
      onYes: () => {
        confirmingTitle = false;
        uncover();
        signalHold('leave');
        if (activeExp && activeExp.phase !== 'ended' && activeExp.phase !== 'battle') saveProgress(activeExp); // 전투 직전 상태는 이미 저장돼 있다
        else persist();
        titleScreen();
      },
      onNo: () => {
        confirmingTitle = false;
        uncover();
        signalHold('release');
      },
    });
    // 튜토리얼 카드·강조 틀은 이 확인 창 동안 숨고 입력 막기도 쉰다 — 창 버튼이 눌리게 (GDD 194장 3)
    uncover = coverTutorials([...getOverlayHost().querySelectorAll('.bha-confirm')].pop() ?? null);
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
    nav.reset({ id: 'room', home: true, render: () => { renderRoom(); root.scrollTop = 0; } });
    // 온천에 있던 채로 껐다 켰으면 온천 화면으로 (GDD 123장 4: 앱을 꺼도 온천 유지)
    if (save.nest.spa && !save.nest.dead) openSpa(getFaction(save.factionId), save, false);
    showCloudConflictIfIdle();
  }

  /** 온천 (GDD 123장 4): enter = 방 물건을 눌러 들어감(못 들어가면 이유 알림), false = 이미 온천에 있는 세이브를 다시 염. 뒤로 = 나와서 방 */
  /** 온천 나가기 연출이 끝나 실제로 뒤로 가는 중 (interceptBack 이 다시 맡지 않게) */
  let spaLeaving = false;
  function openSpa(faction: FactionConfig, s: SaveData, enter = true): void {
    const name = worldMapOf(faction).places.spa;
    if (enter) {
      if (careBlocked(s)) return;
      const why = s.nest.spa ? null : spaEnter(s, Date.now(), true); // 걸어 들어가 다 앉은 뒤부터 찬다 (GDD 241-B 4)
      if (why) return void showToast({ eyebrow: name, title: SPA_BLOCK_TEXT[why], meta: '' }, 0, 2600);
      persist();
    }
    // 월드맵에서 들어왔으면 [돌아가기] = 월드맵 (GDD 153장 1 — 시장 안 칸은 C.227 에서 삭제). 껐다 켜서 방에서 바로 열린 온천은 옛 이름 그대로
    const backLabel = nav.top?.id === 'worldmap' ? '월드맵으로 돌아가기' : undefined;
    nav.push({
      id: 'spa',
      render: () => {
        setBgm('nest');
        spaView(root, faction, s, {
          backLabel,
          onBack: () => nav.back(),
          onAutoLeave: (e) => {
            tickIdle(s); // 실제로 흘려 온천에서 나오고 런 로그에 남긴다 — 이 뒤로는 회복·배부름 감소 없음 (GDD 180장 2: 알림 2초 동안 멈춤)
            persist();
            // 저절로 나오면 방으로 (GDD 127장 2: 장터에서 들어갔어도 방 — C.198 그대로)
            // GDD 241-E 1: 월드맵에서 들어왔으면(backLabel = '월드맵으로 돌아가기') 나가는 곳도 월드맵 — 방으로 보내지 않는다
            const toRoom = () => {
              if (nav.top?.id !== 'spa') return;
              if (!backLabel) return nestScreen();
              spaLeaving = true; // 이미 나온 뒤라 나가기 연출은 건너뛴다
              nav.back();
              spaLeaving = false;
            };
            // 튜토리얼 회복 안내 중 (GDD 180장 2 보충, C.274): 알림·자동 방 이동 없이 온천에 그대로 — 안내 카드('체력이 가득 찼다!')와 [다음] 흐름이 방 이동을 정한다
            if (recoverOpen && nav.top?.id === 'spa') return;
            // 옛 '가득 뒤 2초 머묾 알림'(C.273)은 GDD v6.005 에서 삭제 — 평소 온천은 가득 차도 저절로 나오지 않고, 저절로 나올 때는 바로 방으로
            toRoom(); // 온천 끝 결과 알림은 뺐다 (GDD 233장 4) — 방 체력·배부름 막대로 보인다
          },
        });
        root.scrollTop = 0;
      },
      // 나가기 연출 (GDD 132장 4): 뒤로·[돌아가기] = 계단을 거꾸로 올라와 걸어 나간 뒤 실제로 뒤로
      interceptBack: () => {
        if (spaLeaving) return false;
        return spaExitFx(() => {
          spaLeaving = true;
          if (nav.top?.id === 'spa') nav.back();
          spaLeaving = false;
        });
      },
      beforeBack: () => {
        tickIdle(s); // 나오기 전까지 흐른 몫을 먼저 반영
        spaLeave(s);
        persist();
      },
    });
  }

  /** 장터 (GDD 127장 2, C.201): 상점·온천·떠돌이 상인이 있는 따로 된 공간. 뒤로 = 방 */
  function openMarket(faction: FactionConfig, s: SaveData): void {
    const visit = s.shared.wanderer.visit;
    if (visit) wandererAnnounced = visit.at; // 장터에서 이미 봤다 — 방 알림을 다시 띄우지 않는다
    if (wandererToast?.isConnected) wandererToast.classList.replace('is-in', 'is-out'); // 방에서 뜬 알림이 장터까지 남지 않게 (사라지는 연출 뒤 지워진다)
    wandererToast = null;
    open('market', () => marketView(dev, faction, s, {
      // 장비 상점 = 장비가 열린 뒤 (GDD 241-0: 2단계) — 그 전에는 자물쇠 + 여는 때 알림
      lockReasons: gearUnlocked(s) ? undefined : { gearShop: unlockHintText(faction, 'gear') },
      onLocked: (spot) => showToast({ eyebrow: marketOf(faction).props[spot], title: unlockHintText(faction, 'gear'), meta: '' }, 0, 2000),
      onShop: (kind) => open('shop', () => shopView(dev, faction, s, { persist, kind, onWear: () => dress(s.wear) })),
      onWanderer: () => open('wanderer', () => shopView(dev, faction, s, { persist, mode: 'wanderer' })),
      // 대장장이 (GDD 153장 2, provisional): 기능은 나중 — 노란 알림 한 줄만
      onSmith: () => showToast({ eyebrow: marketOf(faction).props.smith, title: fixParticles(`${marketOf(faction).props.smith}은(는) 아직 문을 열지 않았다`) }, 0, 2600),
      // 시장의 월드맵 물건·뒤로 = 월드맵(스택 아래) (GDD 130장 3·158장 3)
      onBack: () => nav.back(),
    }));
  }

  /** 월드맵에서 캐릭터가 서 있는 곳 = 마지막으로 있던 장소 (GDD 132장 2) */
  let worldAt: WorldPlace = 'home';
  /** 월드맵 (GDD 130장 2, C.204): 방 [월드맵] → 홈·시장·수련장·모험·탑·온천. 고르면 걸어가서 페이드 전환 (137장 3). 홈 = 방, 시장 = 시장 화면(뒤로 = 월드맵), 모험 = 출발 준비 화면(뒤로 = 월드맵). 뒤로 = 방 */
  function openWorldMap(faction: FactionConfig, s: SaveData): void {
    worldAt = 'home'; // 방에서 나왔다 (GDD 132장 2)
    // 걷는 중 뒤로 = 취소하고 제자리 (GDD 137장 3)
    nav.push({ id: 'worldmap', interceptBack: worldMapCancelWalk, render: () => { setBgm('nest'); renderWorldMap(faction, s); root.scrollTop = 0; } });
  }
  function renderWorldMap(faction: FactionConfig, s: SaveData): void {
    worldMapView(dev, faction, s, {
      // 캐릭터·처음 초점 = 지금 있던 곳 (시장·모험 준비에서 뒤로 돌아오면 그 장소 위). 첫 모험 강제 중 초점은 모험
      at: worldAt,
      focus: forceAdventure ? 'adventure' : worldAt,
      onHome: () => nestScreen(),
      onMarket: () => { worldAt = 'market'; openMarket(faction, s); },
      // 번호 쟁탈전·진급 시험 (GDD 241-C 3·241-E 3, C.394): 옛 수련장 자리. 뒤로 = 월드맵. 사망이면 막힘. 4단계 전이면 잠김(lockReasons)
      onRank: () => { if (careBlocked(s) || !trackRulesOf(s).rank) return; worldAt = 'rank'; open('rank', () => rankScreen(faction)); },
      onAdventure: () => { worldAt = 'adventure'; departFromHome(faction, s); },
      // 탑 (GDD 139장 1): 모험 화면 탭에서 월드맵 장소로. 사망이면 막힘 안내
      onTower: () => { if (careBlocked(s)) return; worldAt = 'tower'; towerScreen(faction); },
      // 온천 (GDD 153장 1): 시장 안 칸 → 월드맵 장소. 뒤로 = 월드맵, 저절로 나오면 방(그대로)
      onSpa: () => { openSpa(faction, s); if (nav.top?.id === 'spa') worldAt = 'spa'; }, // 못 들어갔으면(막힘 알림) 제자리
      // 첫 모험 강제 (GDD 131장 2): 홈·시장·수련장·탑·온천 잠김. 탑 해금 전(36장)이면 탑은 이유 한 줄과 함께 잠김
      locked: forceAdventure ? ['home', 'market', 'rank', 'tower', 'spa'] : undefined,
      lockReasons: {
        ...(towerOpen(s.runLog, faction.id, s.tower.best) ? {} : { tower: towerLabels(faction).locked }),
        ...(rankUnlocked(s.evolution.tierIndex) ? {} : { rank: rankLockedText(faction) }), // 번호 쟁탈전 = 4단계부터 (GDD 241-0)
        ...(trackRulesOf(s).rank ? {} : { rank: trackLockedText(s) }), // 등급전 없는 트랙 (초월자, GDD 12-4 v6.028) — 자물쇠 + 이유
      },
      onLocked: (p) => showToast(forceAdventure ? FORCE_HINT
        : p === 'tower' ? { eyebrow: specialDungeonLabels(faction).name, title: towerLabels(faction).locked, meta: '' }
        : p === 'rank' ? { eyebrow: faction.rankBattleName, title: trackRulesOf(s).rank ? rankLockedText(faction) : trackLockedText(s), meta: '' } : FORCE_HINT, 0, 1800),
    });
  }

  /** 모험 떠나기: 사망이면 막힘, 빈사면 확인 창, 새 세이브의 첫 원정은 고정 길 튜토리얼 (옛 방 문 = 월드맵 모험이 같이 쓴다) */
  function departFromHome(faction: FactionConfig, s: SaveData): void {
    if (careBlocked(s)) return;
    askDying(s, () => (firstRunPending(s) ? startTutorialRun(faction) : departScreen(faction)));
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
      persist(); // 실패 정산·비운 것을 저장 (GDD 192장 1, C.311)
      resumeNote = abandonNote(active);
      showAbandonCard(active, faction);
    }
    const props = roomOf(faction).props;
    setBgm('nest');
    // 새 세이브의 첫 방: 탄생 연출 (GDD 74장). 방이 그려진 직후에 덮는다
    if (guidePending(s.help, 'birth')) window.setTimeout(() => { if (nav.top?.id === 'room') runBirth(faction); }, 30);
    // 첫 원정 뒤 "다음 할 일", 첫 진화 뒤 "타일 3장" 안내 (GDD 67장 4번·64장 3번): 방을 그린 다음, 진화 연출이 남아 있으면 그 뒤에
    if (!holdRoomGuides) window.setTimeout(() => {
      if (nav.top?.id !== 'room' || holdRoomGuides || recoverOpen) return;
      if (runRecover(faction)) return; // 튜토리얼 원정 뒤 회복 안내가 먼저 (GDD 123장 5 수정)
      if (runHomeIntro(faction)) return; // 처음 켰을 때 홈 안내 → 첫 모험 강제 (GDD 131장). 탄생 연출 중이면 연출이 끝난 뒤
      if (homeIntroOpen) return;
      if (!runGuide('first-run-room', faction)) runUnlockGuides(faction);
    }, 400);
    const greet = hungryGreet;
    hungryGreet = false;
    // 비운 동안 줄어든 것 (GDD 237장): 옛 복귀 알림 띠(102-7·233장 1)는 지우고, 같은 내용을 대기 보상 창(또는 같은 모양 창) 안에 — 복귀 때 한 번
    const away = absence;
    absence = null;
    const loss = away && away.hours * 60 >= BALANCE.provisional.idle.minMinutes ? absenceLossLines(away, faction) : [];
    // 투트랙 개방·붕옥 탭 개방 알림 (GDD 22-3): 한 번만. 저장 때 뜨는 튜토리얼·도감 토스트와 겹치지 않게 조금 뒤에
    const notes: { eyebrow: string; title: string; meta: string }[] = [];
    // 붕옥 등장 컷(안내 카드 hogyoku-appear)이 두 번째 트랙까지 알리므로 그때는 알림을 띄우지 않는다 (GDD 243장 1)
    const appearCut = guidePending(s.help, 'hogyoku-appear');
    if (s.trackNotice && appearCut) s.trackNotice = null;
    if (s.trackNotice) {
      const notice = s.trackNotice;
      const t = allTracks(s).find((x) => trackIdOf(x) === notice);
      if (t?.transcendentId) {
        // 합체 직후 초월자 방 (GDD 12-4 v6.028): 지금 트랙 = 새 초월자
        const kind = trackRulesOf(t).label;
        notes.push({ eyebrow: `새 ${kind}`, title: `${trackNameOf(t)}의 방`, meta: `두 캐릭터가 키운 것을 그대로 이어받았다. 진화·${faction.rankBattleName}·스토리·${faction.rebirth.name} 없이 빌드를 깎는다. 시간이 지나도 수치가 닳지 않는다. 캐릭터는 ··· 더보기에서 바꾼다.` });
      } else if (t) {
        const opened = getFaction(t.factionId);
        notes.push({ eyebrow: '새 트랙', title: `${opened.name} 트랙이 열렸다`, meta: `같은 슬롯에서 새 ${opened.name} 캐릭터를 1단계부터 키운다. 이름표 옆 [${toward(opened.name)}] 버튼으로 바꾼다.` });
      }
      s.trackNotice = null;
    }
    if (s.hogyoku.tabNotice) {
      if (!appearCut) notes.push({ eyebrow: '붕옥', title: '붕옥이 나타났다', meta: '방의 붕옥을 누르면 붕옥 화면이 열린다.' });
      s.hogyoku.tabNotice = false;
    }
    // 떠돌이 상인 (GDD 85장 5번·127장 3): 이번 방문을 처음 보는 방이면 한 번 알린다 — 방에서만(장터 안에서는 안 뜬다). 먼저 장터에 들어갔으면 본 것으로 친다
    const visit = s.shared.wanderer.visit;
    if (visit && visit.at !== wandererAnnounced) {
      const mk = marketOf(faction);
      window.setTimeout(() => {
        if (nav.top?.id !== 'room' || wandererAnnounced === visit.at) return;
        wandererAnnounced = visit.at;
        const path = `${roomOf(faction).props.outside} → ${mk.name}`; // 월드맵 → 시장 (GDD 130장 2·158장 2)
        wandererToast = showToast({ eyebrow: mk.props.wanderer, title: fixParticles(`${mk.props.wanderer}이(가) ${mk.name}에 왔다`), meta: `${path} → [${mk.props.wanderer}]. 다음 모험에서 돌아오면 떠난다.` }, notes.length, 5200);
      }, 2600);
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
    const openChest = () => open('chest', () => chestView(dev, faction, s, props.chest, persist, () => dress(s.wear), () => tilePlaceScreen(faction)));
    const openEquip = () => {
      openChestAtGear();
      openChest();
    };
    // 복귀 창은 이번에 minMinutes 이상 꺼 두었고 받을 만큼 쌓였을 때만 — 켜 둔 동안 쌓인 것은 아이콘으로 (95장 B1)
    // GDD 222장 1: 튜토리얼 안내 카드가 떠 있으면 카드가 끝난 뒤에 띄운다(겹쳐서 입력이 막히지 않게). 그사이 방을 떠났으면 띄우지 않는다 — 보상은 아이콘에 남는다.
    // 222장 3: 한 바퀴도 못 돌았으면(받을 것 0) 복귀 창을 띄우지 않는다
    if (idle && idleCounts(idle.awayHours) && idleClaimable(s) && (idlePendingYield(s)?.laps ?? 0) > 0) {
      afterTutorials(() => showIdleReturn(idle, s, faction, claim, loss), () => save === s && nav.top?.id === 'room');
    } else if (away && loss.length > 0 && lossOnlyReturnShown(away.hours)) {
      // 대기 보상 창이 안 뜨는 복귀 (237장 3): 같은 창 모양으로 줄어든 것만 + [확인]. 줄어든 것도 없으면 아무것도 안 띄움.
      // GDD 243장 8: 보상 없이 줄어든 것만이면 lossOnlyMinMinutes(1시간) 이상 비웠을 때만 — 10분마다 '배부름 −1' 창이 뜨지 않게
      afterTutorials(() => showAbsenceReturn(away.hours, loss), () => save === s && nav.top?.id === 'room');
    }
    roomView(dev, faction, s, {
      greet: greet ? 'hungry' : null,
      resume: active.ok
        ? { info: `${active.exp.lap}바퀴 · ${active.exp.pos}번 칸`, onResume: () => open('expedition', () => resumeExpedition(active.exp), true) }
        : null,
      resumeNote,
      idle: { badge: idleBadge(s), onOpen: () => showIdlePanel(s, faction, claim) },
      persist,
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
      onBook: () => open('dex', () => bookView(root, faction, s, 'dex', persist)),
      onChest: openChest,
      // 수련장 물건 (GDD 241-C 2·3, C.394): 책장 아래(옛 진급 시험 자리). 잠금 표시 없이 기본 = 훈련 인형, 본능 수련은 머리 제목 목록에서(4단계 전이면 자물쇠)
      onTraining: () => { if (careBlocked(s)) return; askDying(s, () => open('practice', () => practiceScreen(faction))); },
      onStatus: () => open('care', () => careView(dev, faction, s, '상태', persist, { onDex: () => open('dex', () => bookView(root, faction, s, 'dex', persist)), onHelp: () => openHelp('evolution', true), onRebirth: () => open('rebirth', () => renderRebirth(faction, s)), onGear: openEquip })),
      onSwitchTrack: canSwitchFaction(s) ? (fid) => {
        if (!switchTrack(s, fid)) return;
        persist();
        nestScreen(); // 트랙 전환 알림은 뺐다 (GDD 233장 5) — 방이 그 트랙으로 바뀐다
      } : null,
      onHogyoku: s.hogyoku.tabOpen ? () => { resetHogyokuSel(); open('hogyoku', () => renderHogyoku(s)); } : null,
      onSettings: settingsOpener(true),
      onHelp: () => openHelp('nest', true),
      // 상점 (GDD 25-9·150장 2): 4곳 고르는 작은 창 → 그 상점
      onShop: () => shopPicker(faction, (kind) => open('shop', () => shopView(dev, faction, s, { persist, kind, onWear: () => dress(s.wear) }))),
      onOutside: () => openWorldMap(faction, s), // 월드맵 물건 (GDD 130장 1·137장 3·158장 2)
      forceOutside: forceAdventure, // 첫 모험 강제 (GDD 131장 2)
      onFed: () => {
        const f = recoverFedHook;
        recoverFedHook = null;
        f?.();
      },
      onPhoto: () => open('photo', () => photoView(dev, faction, s)),
      onTamago: () => tama.toggle(), // 다시 누르면 끈다 (GDD 176장 10)
      // 백업 화면은 진짜 저장소를 직접 다루므로 테스트 모드에서는 숨긴다 (38-2)
      onBackup: testOn ? null : () => open('backup', () => backupView(root, save, persist, { slot, onApplied: reloadSlot })),
      onTest: testOn ? () => open('test', () => renderTest(faction, s)) : null,
      onTitle: askReturnToTitle,
    });
  }

  // ── 붕옥 (GDD 22-3 → 244장, C.414): 붕옥 개발 → 합체 미리보기(확인 1) → 최종 확인(확인 2) → 자동 백업 'fusion' → 합체 → 연출 → 새 1단계 방 ──
  function renderHogyoku(s: SaveData): void {
    hogyokuView(dev, s, {
      onDevelop: (track) => {
        // 붕옥 강화 1강 (GDD 12-3 v6.014): 고른 트랙 재료만 바치고 그 트랙 +1강 — 화면이 새 강으로 다시 그려진다
        if (developHogyoku(s, track)) persist();
        nav.top?.render();
      },
      onDevelopAll: () => {
        // 일괄 강화 (GDD 12-3 v6.014): 확인 1번(미리 계산한 결과) → 낮은 트랙부터 번갈아 갈 수 있는 데까지 → 결과 요약 알림
        const pre = developAllPreview(s);
        confirmDialog({ title: '일괄 강화', body: `가진 재료로 갈 수 있는 데까지 강화한다 (낮은 강화부터 번갈아): ${gainedText(pre)}. 재료는 되돌릴 수 없다.`, yes: '일괄 강화', no: '그만둔다', onYes: () => {
          const r = developAll(s);
          if (r.records.length) persist();
          nav.top?.render();
          showToast({ eyebrow: '붕옥 일괄 강화', title: gainedText(r.gained), meta: `붕옥 개발 ${hogyokuPercent(s.hogyoku)}%` });
        } });
      },
      // 오른쪽 위 탭 2개 (C.425): 붕옥이 안 보이는 별도 창 — 뒤로 = 붕옥 창
      onFusion: () => open('hogyoku-fusion', () => fusionPickView(dev, s, { onPreview: () => open('fusion-confirm', () => renderFusionConfirm(s)) })),
      onDex: () => open('hogyoku-dex', () => transcendentDexView(dev, s)),
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
      onAscend: () => !careBlocked(s) && open('ascension-battle', () => runAscensionBattle(faction), true),
    });
  }

  /** 수련장 두 화면(수련 · 훈련 인형)은 머리 제목 토글로 서로 바꿔 끼운다 — 뒤로는 늘 연 곳(월드맵, GDD 158장 1·165장 1)으로 (GDD 99장 2, C.163). 진급 시험은 방 물건 (174장 1) */
  function switchTraining(faction: FactionConfig, s: SaveData, id: TrainingScreenId): void {
    // 본능 수련은 4단계부터 (GDD 241-C 2): 그 전에 고르면 화면은 그대로 두고 여는 때를 알린다
    if (id === 'train' && trainLocked(s)) return void showToast({ eyebrow: roomOf(faction).props.altar, title: trainingLockedText(faction), meta: '' }, 0, 2200);
    const render = id === 'practice' ? () => practiceScreen(faction) : () => renderTraining(faction, s);
    nav.replace({ id: id === 'train' ? 'training' : id, locked: false, render: () => { setBgm('nest'); render(); root.scrollTop = 0; } });
  }
  const trainingHead = (faction: FactionConfig, id: TrainingScreenId): HTMLElement | undefined =>
    save ? trainingTitle(faction, roomOf(faction).props.altar, id, (to) => switchTraining(faction, save!, to), trainLocked(save)) : undefined;
  /** 본능 수련이 이번 생에 아직 잠겼나 (4단계 전, GDD 241-0) */
  const trainLocked = (s: SaveData): boolean => s.evolution.tierIndex < BALANCE.provisional.liberation.minTierIndex;

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

  /** 빈사로 모험 나가기 전 확인 창 (GDD 102장 수정 v5.228 5번): 기본 선택 = 아니요. 빈사가 아니면 바로 go */
  function askDying(s: SaveData, go: () => void): void {
    if (!s.nest.collapsed || s.nest.dead) return go();
    const k = BALANCE.provisional.nest.care.dying;
    confirmDialog({
      title: '빈사 상태로 나간다',
      body: `빈사 — 체력 ${Math.round(k.hpFraction * 100)}% · 공격·블록 속도와 보상 절반, 지면 사망한다.`,
      yes: '나간다', no: '아니요', danger: true, onYes: go,
    });
  }

  /** 출발 체력이 문턱 아래면 확인 창 (GDD 193장 2, 자유 모험 [출발]과 같은 창 — planView). 빈사는 askDying 이 먼저 물었다 */
  function askLowHp(s: SaveData, go: () => void): void {
    const hp = departHpOf(s);
    if (s.nest.collapsed || !lowDepartHp(hp)) return go();
    confirmDialog({
      title: '체력이 낮다',
      body: `체력이 ${Math.round(hp * 100)}%다. 지면 이번에 얻은 것을 잃는다. 그래도 나간다.`,
      yes: '출발', no: '그만', danger: true, onYes: go,
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
      hpFraction: departHpOf(save), // 홈 체력 그대로 출발 (GDD 123장 2)
      deck: ownedTileList(save.tiles, faction.id),
      risk: save.nest.risk,
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
      pet: petsUnlocked(save) ? carriedPet(save.shared.pets) : null, // 펫 = 첫 환생 뒤 (GDD 241-0)
      petDrops: petsUnlocked(save),
      gear: gearCarry(save.shared.gear),
      gearDrops: gearUnlocked(save), // 장비 = 2단계부터 (GDD 241-0)
    });
    // 테스트 패널 [불러오기] 원정 예약 (GDD 112장 2): 이벤트 타일은 첫 빈 칸, 변이는 1바퀴에
    if (testOn) {
      const f = applyTestExpeditionForce(exp);
      const what = [f.eventTile ? tileName(f.eventTile, faction.id) : null, f.mutation ? mutationName(f.mutation, faction.id) : null].filter(Boolean).join(' · ');
      if (what) showToast({ eyebrow: '테스트', title: '불러온 것을 놓았다', meta: what }, 0, 2400);
    }
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
          // 타일 안내가 뜰 차례면 [타일 배치] 탭으로 연다 (GDD 213장): 안내가 가리키는 가진 타일·길·프리셋 판이 그 탭에만 있다
          startMode: tilesUnlocked(save!) && guidePending(save!.help, 'tile-plan') ? 'place' : 'prep',
          // 덱 없음 (GDD 85장 11번): 가진 타일 전부에서 최대 n칸 + 배치 프리셋
          placeLimit: placementLimitOf(save!),
          // 출발 체력 (GDD 193장 2): [출발] 띠 '체력 n%', 문턱 아래면 확인 창
          hpFraction: departHpOf(save!),
          hpNoWarn: save!.nest.collapsed, // 빈사는 askDying 이 이미 물었다
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
            if (battleItemUnlocked(save!)) departFillBattleSlot(save!); // 출발 때 빈 소모품 칸이면 자동으로 (GDD 212장 4) — 칸이 열린 뒤에만 (241-0)
            const sortieUsed = departSortie(save!, exp); // 출정품: 칸마다 1개 소모 → 이 원정 효과 (GDD 241-D 5)
            if (sortieUsed.length) showToast({ eyebrow: '출정품', title: sortieUsed.map((id) => consumableName(id)).join(' · '), meta: '이번 모험 동안 효과' }, 0, 2400);
            activeExp = exp;
            saveProgress(exp); // 이어하던 원정이 있었다면 여기서 덮어쓴다 = 패배 처리 없이 버려진다
            // 원정 흐름(지도·전투·흡수·결과)은 한 덩어리라 취소로 빠져나가지 않는다(locked). 끝나면 홈으로
            nav.replace({ id: 'expedition', locked: true, render: () => { armEnterFx(); showExpedition(faction, exp, '출발!'); root.scrollTop = 0; } });
          },
          onHelp: () => openHelp('expedition', false),
          // [스토리] 탭 (GDD 25-7): 같은 자리에서 스토리 장·화 목록으로 바꾼다. 탑은 월드맵 장소 (139장 1). 스토리 없는 트랙(초월자, 트랙 종류 story: false — GDD 12-4 v6.028)은 탭 없음
          ...(trackRulesOf(save!).story ? { onTab: () => storyScreen(faction) } : {}),
        });
        root.scrollTop = 0;
        // 진화 후 첫 출발: 덱 고르기 → 첫 배치 → 조합 안내 (GDD 64장 3번 ①~③)
        if (tilesUnlocked(save!)) runGuide('tile-plan', faction, { finishLabel: '배치하기' });
      },
    };
    if (replace) nav.replace(entry);
    else nav.push(entry);
  }

  /** 가방 타일 [타일 배치하러 가기] (GDD 241-D 7): 모험 출발 때와 같은 배치판·프리셋 저장 — 출발 없이 [닫기]. 이 창의 원정 상태는 저장하지 않는다 */
  function tilePlaceScreen(faction: FactionConfig): void {
    if (!save) return;
    const s = save;
    const exp = createExpedition({ factionId: faction.id, seed: 1, hunger: s.nest.hunger, condition: s.nest.condition, deck: ownedTileList(s.tiles, faction.id), risk: s.nest.risk, build: s.build, evolution: s.evolution, groundId: lastGround(s) });
    nav.push({
      id: 'tile-place', locked: false,
      render: () => {
        planView(root, faction, exp, s.evolution.tierIndex, {
          placeOnly: { onClose: () => nav.pop() },
          onStart: () => nav.pop(),
          onHelp: () => openHelp('expedition', false),
          placeLimit: placementLimitOf(s),
          presets: {
            list: () => tilePresetsFor(s.tiles, faction.id),
            save: (cells, name, index) => { const r = saveTilePreset(s, name, cells, index); if (r.ok) persist(); return r; },
            rename: (index, name) => { const ok = renameTilePreset(s, index, name); if (ok) persist(); return ok; },
            remove: (index) => { const ok = deleteTilePreset(s, index); if (ok) persist(); return ok; },
          },
        });
        root.scrollTop = 0;
      },
    });
  }

  /** 스토리 장·화 목록 (GDD 25-4·25-7): 원정 출발 화면의 [스토리] 탭. [자유 원정] 탭이면 배치 단계로 돌아간다 */
  function storyScreen(faction: FactionConfig): void {
    if (!save || !trackRulesOf(save).story) return;
    nav.replace({
      id: 'story', locked: false,
      render: () => {
        setBgm('expedition');
        storyView(root, faction, save!, {
          onTab: (id) => departTab(faction, id),
          // 스토리도 자유 모험 [출발]과 같은 출발 체력 확인 창 (GDD 193장 2)
          onPick: (chapterId, episodeId) => askLowHp(save!, () => startStory(faction, chapterId, episodeId)),
          onHelp: () => openHelp('expedition', false),
        });
        root.scrollTop = 0;
      },
    });
  }

  /** 출발 화면 머리 탭 전환 (자유 원정 = 배치 단계 / 스토리) */
  function departTab(faction: FactionConfig, id: DepartTab): void {
    if (id === 'free') departScreen(faction, true);
    else storyScreen(faction);
  }

  // ── 특수던전 (GDD 6-16 v6.017, C.427 — 옛 도전의 탑 36장 → 139장 1): 월드맵 장소. 위 탭 [탑][주간던전][보스전], 처음 = 탑. 뒤로 = 월드맵.
  //    탑 = 한 층 = 전투 한 판(체력 가득, 흡수 없음, 리스크·허기·컨디션 그대로). 주간던전·보스전도 같은 전투 엔진·같은 규칙(리스크·배부름 변화 없음) ──
  let specialTab: SpecialTab = 'tower';
  function towerScreen(faction: FactionConfig): void {
    if (!save) return;
    specialTab = 'tower'; // 월드맵에서 들어오면 처음 = 탑
    const render = (): void => {
      setBgm('expedition');
      const hd = { onTab: (t: SpecialTab) => { specialTab = t; render(); }, onHelp: () => openHelp('expedition', false) };
      if (specialTab === 'tower') {
        towerView(root, faction, save!, { onChallenge: (f) => towerBattle(faction, f), onHelp: hd.onHelp }, specialHead(faction, 'tower', hd));
      } else {
        specialState(save!); // 주가 바뀌었으면 횟수 비움
        specialDungeonView(root, faction, save!, specialTab, {
          ...hd,
          onWeekly: (track, star) => startSpecialRun(faction, { mode: 'weekly', target: track, star }),
          onBoss: (e, star) => startSpecialRun(faction, { mode: 'boss', target: e.id, star, entry: e }),
        });
      }
      root.scrollTop = 0;
    };
    nav.push({ id: 'tower', locked: false, render });
  }

  /** 특수던전 주간던전·보스전 한 입장: 횟수 차감(실패·나가기도 차감) → 전투 n판(체력 이어감) → 정산 → 결과 */
  function startSpecialRun(faction: FactionConfig, run: { mode: 'weekly' | 'boss'; target: string; star: number; entry?: BossRushEntry }): void {
    if (!save || careBlocked(save)) return;
    const s0 = save;
    if (!enterSpecial(s0, run.mode, run.target)) {
      showToast({ eyebrow: specialDungeonLabels(faction).name, title: '이번 주 횟수를 다 썼다', meta: '월요일 05:00 에 초기화' }, 0, 1800);
      return;
    }
    persist();
    const enemies = run.mode === 'weekly' ? weeklyEnemies(run.target as HogyokuTrackId, run.star, s0.shared.special.weekStart) : [bossRushEnemy(run.entry!, run.star)];
    const bossId = run.mode === 'boss' ? run.entry!.bossId : undefined;
    const name = run.mode === 'weekly' ? weeklyName(faction, run.target as HogyokuTrackId) : bossRushName(faction, run.entry!);
    const done: CombatState[] = [];
    let settled = false;
    const settle = (quit: boolean) => {
      if (settled) return null;
      settled = true;
      const res = settleSpecialRun(s0, { mode: run.mode, target: run.target, bossId, star: run.star, battles: done, total: enemies.length, quit });
      persist();
      return res;
    };
    const fight = (i: number, hp: number, first: boolean): void => {
      const e = {
        id: 'special-battle', locked: true,
        render: () => {
          const params = sideBattleParams(s0, !!bossId || enemies[i]!.class === 'elite');
          const enemy = run.mode === 'boss' && run.entry?.owner ? { ...enemies[i]!, name: { '*': towerLabels(faction).finalBossName } } : enemies[i]!;
          const s = createSpecialCombat(enemy, run.star, params, Math.floor(Math.random() * 2 ** 32), hp, bossId);
          setBgm(bossId ? 'boss' : enemy.class === 'elite' ? 'elite' : 'battle');
          const bgKey = run.mode === 'weekly' ? specialDungeonLabels(faction).weekly[run.target]?.art : specialDungeonLabels(faction).bossArt[run.target];
          battleView(root, faction, s, {
            ...battleItemOpts(s0, s),
            tierIndex: artTierIndexOf(s0),
            formId: s0.evolution.formId,
            skinId: artSkinOf(s0),
            banner: `${specialDungeonLabels(faction).name} · ${name} · ${difficultyText(faction, run.star)}${enemies.length > 1 ? ` · ${i + 1}/${enemies.length}판` : ''}`,
            ...(bossId ? { boss: { eyebrow: '보스' }, enter: true } : {}),
            bg: specialSceneBg(bgKey ?? faction.arenaBg),
            onQuit: () => { settle(true); nav.pop(); },
            onEnd: (st) => {
              recordSpecialBattle(s0, st);
              done.push(st);
              if (st.status === 'won' && i < enemies.length - 1) {
                persist();
                fight(i + 1, hpFractionAfter(st), false);
                return;
              }
              const res = settle(false)!;
              nav.replace({
                id: 'special-result', locked: true,
                render: () => {
                  specialResultView(root, faction, s0, { mode: run.mode, target: run.target, name, star: run.star, total: enemies.length, battles: done }, res, {
                    onBack: () => nav.pop(),
                  });
                  root.scrollTop = 0;
                },
              });
              showTitleToasts(s0, faction, persist);
            },
          });
          root.scrollTop = 0;
        },
      };
      if (first) nav.push(e);
      else nav.replace(e);
    };
    fight(0, 1, true);
  }

  /** 원정 밖 전투(탑·특수던전) 공통 전투 파라미터: 빌드·진화·해방 시작 게이지·장비(strong = 강적·보스 피해)·펫·빈사 */
  function sideBattleParams(s0: SaveData, strong: boolean): Partial<CombatParams> {
    const params = buildCombatParams(s0.build, s0.factionId);
    applyEvolutionToParams(params, s0.evolution, s0.factionId, statBonusOf(s0).total, s0.training.completed);
    params.liberationStartGauge = liberationStartGaugeOf();
    applyGearToParams(params, gearCarry(s0.shared.gear), strong);
    params.petAttack = petAttackOf(carriedPet(s0.shared.pets)); // 펫도 같이 공격 (GDD 241-D 4)
    applyCareToParams(params, battleCareOf(s0)); // 빈사: 체력 10%·속도 절반 (GDD 102장 수정)
    return params;
  }

  /** 전투 [소모품] (GDD 108장 3번·105장 수정 3): 장비 화면 소모품 칸에 든 것을 이 전투에 싣고, 쓰면 보관 개수 −1 후 저장. 칸이 비었거나 0개면 버튼 비활성 */
  function armBattleItem(sv: SaveData, st: CombatState): BattleViewOptions['battleItem'] {
    const it = battleItemUnlocked(sv) ? battleItemEffectOf(sv) : null; // 전투 소모품 칸 = 3단계부터 (GDD 241-0)
    st.params.battleItem = it;
    if (!it) return undefined;
    return { count: sv.shared.items[it.id] ?? 0, onUse: () => { spendBattleItem(sv, it.id); persist(); } };
  }

  /** 전투 화면 소모품 옵션 (GDD 108장 3번 · 193장 6): 실은 소모품 + 칸이 비었을 때 [소모품]으로 고르기(고르면 칸에 넣고 저장, 이 전투에 싣는다) */
  function battleItemOpts(sv: SaveData, st: CombatState): Pick<BattleViewOptions, 'battleItem' | 'pickBattleItem'> {
    return {
      battleItem: armBattleItem(sv, st),
      pickBattleItem: {
        options: () => (battleItemUnlocked(sv) ? ownedBattleItems(sv) : []).map((id) => ({ id, label: `${consumableName(id)} ×${sv.shared.items[id] ?? 0} · ${battleItemBrief(id)}` })),
        pick: (id) => {
          if (!battleItemUnlocked(sv) || !fillBattleSlot(sv, id)) return undefined;
          persist();
          return armBattleItem(sv, st);
        },
      },
    };
  }

  /** 모험(원정) 전투 소모품 (GDD 212장 1·2): 소모품 칸에 끼운 것만, 걷기·전투 어디서든 바퀴당 1번. 이번 바퀴에 이미 썼으면 싣지 않고 버튼 흐림('씀'),
   *  쓰면 1개 줄이고 바퀴 사용을 남긴 뒤 저장. 빈 칸 고르기 창은 없음(193장 6 의 전투 중 고르기 — 212장 4 가 우선, 바꾸기는 바퀴 끝 창) */
  function expBattleItemOpts(sv: SaveData, exp: ExpeditionState, st: CombatState): Pick<BattleViewOptions, 'battleItem' | 'lapItem'> {
    const spent = lapItemLock(sv, exp) === LAP_ITEM_USED;
    const it = spent || !battleItemUnlocked(sv) ? null : battleItemEffectOf(sv);
    st.params.battleItem = it;
    const lapItem = { spentId: spent ? sv.shared.battleItem : null };
    if (!it) return { battleItem: undefined, lapItem };
    // 222장 6: 쓰면 세이브만 저장 — 원정 중간 저장은 전투 직전 그대로(다시 켜면 battleEntry 로 되돌림), 바퀴 사용 기록은 전투가 끝날 때 저장
    return { battleItem: { count: sv.shared.items[it.id] ?? 0, onUse: () => { spendLapItem(sv, exp, it.id); persist(); } }, lapItem };
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
    const params = sideBattleParams(s0, f.kind === 'elite' || !!f.bossId); // 장비 (GDD 91장): 강적·보스 층이면 강적 피해도
    // 꼭대기 보스 이름은 종족 설정 (적 정의의 이름을 그 문구로 바꿔 끼운다)
    const floor = f.final ? { ...f, enemy: { ...f.enemy, name: { '*': towerLabels(faction).finalBossName } } } : f;
    const s = createTowerCombat(floor, params, Math.floor(Math.random() * 2 ** 32));
    setBgm(f.bossId ? 'boss' : f.kind === 'elite' ? 'elite' : 'battle');
    battleView(root, faction, s, {
      ...battleItemOpts(s0, s),
      tierIndex: artTierIndexOf(s0),
      formId: s0.evolution.formId,
      skinId: artSkinOf(s0),
      banner: `${towerLabels(faction).name} · ${towerFloorText(faction, f.floor)} · ${difficultyText(faction, f.star)}`,
      ...(f.bossId ? { boss: { eyebrow: '보스' }, enter: true } : {}),
      ...(towerTicketDrop(f, s.seed) ? { winRewards: ['수련권 +1'] } : {}), // 강적·보스 층 수련권 (GDD 216장 1) — recordTowerBattle 과 같은 굴림
      bg: towerSceneBg(faction, f),
      onQuit: () => nav.pop(),
      onEnd: (done) => {
        const ev0 = { ...s0.evolution.ev }; // 결과 노력치 칩 (GDD 217장 3) — 탑은 지금 노력치를 주지 않아 보통 칩 없음
        const res = recordTowerBattle(s0, f, done);
        const evRow = { start: ev0, end: { ...s0.evolution.ev } };
        persist();
        nav.replace({
          id: 'tower-result', locked: true,
          render: () => {
            towerResultView(root, faction, f, done, res, {
              onNext: res.won && res.next !== null ? () => towerBattle(faction, towerFloor(res.next!), true) : null,
              onAgain: () => towerBattle(faction, f, true),
              onBack: () => nav.pop(),
            }, evRow);
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
      hpFraction: departHpOf(save), // 홈 체력 그대로 출발 (GDD 123장 2)
      deck: [],
      risk: save.nest.risk,
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
        showExpedition(faction, exp, '첫 모험 출발!');
        root.scrollTop = 0;
        if (opened) return;
        opened = true;
        // 걷기·조우 안내 동안 원정 시간이 멈춘다
        signalHold('hold');
        showGuide(faction, 'first-run', { finishLabel: '걷기 시작', pauseLabel: '안내 중 — 모험 멈춤', onDone: () => {
          signalHold('release');
          // 회복 물건 안내 노란 알림은 뺐다 (GDD 161장 1번: 소모품은 알리지 않는다). 쓰는 법은 모험 안내·도움말에 있다
        } });
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
      hpFraction: departHpOf(save), // 홈 체력 그대로 출발 (GDD 123장 2)
      deck: ownedTileList(save.tiles, faction.id),
      risk: save.nest.risk,
      build: save.build,
      evolution: save.evolution,
      liberationTrained: liberationAccess(save).trained,
      tileVariants: true,
      gold: save.shared.tradeCoins,
      statBonus: statBonusOf(save).total,
      story: { chapterId, episodeId },
      tilesLocked: !tilesUnlocked(save),
      pet: petsUnlocked(save) ? carriedPet(save.shared.pets) : null, // 펫 = 첫 환생 뒤 (GDD 241-0)
      petDrops: petsUnlocked(save),
      gear: gearCarry(save.shared.gear),
      gearDrops: gearUnlocked(save), // 장비 = 2단계부터 (GDD 241-0)
    });
    resumeNote = '';
    activeExp = exp;
    if (battleItemUnlocked(save)) departFillBattleSlot(save); // 출발 때 빈 소모품 칸이면 자동으로 (GDD 212장 4) — 칸이 열린 뒤에만 (241-0)
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
    if (exp.phase === 'battle') {
      // 전투 재시작 (GDD 222장 6): 전투 중간 상태는 저장하지 않는다 — 들어가기 직전 상태(체력·블록 바·소모품)로 그 전투를 처음부터. 런 로그 battleRestarts
      if (save && restartBattleOnResume(save, exp)) {
        persist();
        showToast({ eyebrow: '전투 재시작', title: '싸우던 전투를 처음부터 다시 한다', meta: '들어가기 직전 상태(체력·소모품)로 되돌렸다' }, 0, 3200);
      }
      runBattle(faction, exp);
    } else if (exp.phase === 'absorb') afterBattle(faction, exp);
    else if (drainEvents(exp).length > 0) breakthroughScreen(faction, exp, () => showExpedition(faction, exp, '모험을 이어간다'));
    else showExpedition(faction, exp, '모험을 이어간다');
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
    if (save && markBattleEntry(save, exp)) saveProgress(exp); // 222장 6: 전투 직전 소모품을 중간 저장에 (다시 켜면 이 값으로 되돌림)
    const s = startBattle(exp);
    const where = `${exp.lap}바퀴 · ${p.cell}번 칸${p.tileId ? ` · ${tileName(p.tileId, faction.id)}` : ''}${p.combo ? ' · 조합!' : ''}${p.synergy ? ` · ${synergyName(p.synergy, faction.id)}${p.second ? ' 2연전' : ''}` : ''}${p.trap ? ' · 함정' : ''}${exp.mutation ? ` · ${mutationName(exp.mutation, faction.id)}` : ''}`;
    // 보스전 (GDD 25-3): 음악 boss, 등장 이름 띠
    setBgm(p.boss ? 'boss' : p.enemy.class === 'elite' ? 'elite' : 'battle');
    battleView(root, faction, s, {
      ...(save ? expBattleItemOpts(save, exp, s) : {}),
      tierIndex: save ? artTierIndexOf(save) : undefined,
      formId: save?.evolution.formId,
      skinId: save ? artSkinOf(save) : undefined,
      banner: p.boss && exp.story ? storyCaption(exp, faction) : where,
      ...(p.boss ? { boss: { eyebrow: exp.story ? '보스' : '보스 · 자유 모험' } } : {}),
      // 배경 (GDD 34-1): 보스전은 무대(없으면 사냥터), 그 밖은 사냥터
      bg: (p.boss ? arenaSceneBg(faction) : null) ?? groundSceneBg(faction, exp.groundId),
      frenzy: inFrenzy(exp) ? faction.frenzyName : undefined,
      risk: exp.risk,
      tutorial: tutorialFor(),
      // 수련권 드롭 (GDD 216장 1): 이 전투를 이기면 나올지 시드로 미리 안다 → 승리 창 보상 칸
      ...(ticketDropOf(exp) ? { winRewards: ['수련권 +1'] } : {}),
      // 원정 전투 일시정지 [귀환] (GDD 100장 v5.220, C.172): 패배로 치지 않고 걷기 중간 귀환과 같은 처리(짧은 결과 카드 · 방)
      ...(canAbortBattle(exp) ? { onReturn: () => {
        abortExpedition(exp);
        endExpedition(faction, exp);
      } } : {}),
      onEnd: (done) => {
        const finds = exp.gearFinds?.length ?? 0;
        finishBattle(exp, done);
        // 장비 드롭 알림 (GDD 91장 2번): 이 전투에서 나온 장비 — 보관함에는 귀환 때 들어간다. 161장: 알림 최소 등급(NOTIFY) 이상만
        for (const f of (exp.gearFinds?.slice(finds) ?? []).filter((f) => gearToastWanted(f.roll.grade))) showToast({ eyebrow: f.from === 'boss' ? '보스 드롭' : f.from === 'elite' ? '강적 드롭' : '장비 드롭', title: `장비 발견: ${gearDropText(f.roll, faction)}`, meta: `★${f.roll.star} · 귀환하면 가방 장비 탭으로` }, 0, 3600);
        saveProgress(exp); // 전투가 끝날 때마다 저장 (흡수 대기 중이면 그 상태째)
        afterBattle(faction, exp);
      },
    });
  }

  /** 승리 후 흡수 가능하면 흡수 화면 → 폭주(호로화) 연출 → 원정으로 돌아간다 */
  function afterBattle(faction: FactionConfig, exp: ExpeditionState): void {
    activeExp = exp;
    const proceed = () => {
      saveProgress(exp);
      const next = () => {
        // 튜토리얼 원정 흡수 직후 (GDD 134장 2, C.211): 치명상 장면(비틀거림·체력 막대 붉게 깜빡 + 각본 카드) 뒤 귀환 → 방에서 빈사 설명부터 회복 안내
        if (exp.phase === 'ended' && exp.tutorial) {
          const art = heroArtOf(roomOf(faction), faction.id, save ? artTierIndexOf(save) : 0, save ? artSkinOf(save) : undefined);
          return tutorialWoundView(root, faction, art, hpFractionOf(exp), BALANCE.provisional.nest.care.dying.hpFraction, () => endExpedition(faction, exp));
        }
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
      tierIndex: save ? artTierIndexOf(save) : undefined,
      skinId: save ? artSkinOf(save) : undefined,
      onBattle: () => runBattle(faction, exp),
      onSave: () => saveProgress(exp),
      // 바퀴 끝 창 소모품 칸 (GDD 212장 3): 가진 전투 소모품으로 바꿔 끼우기 · 빼기 — 바꾸면 바로 저장
      ...(save && battleItemUnlocked(save) ? { lapItem: { // 전투 소모품 칸이 열린 뒤에만 (GDD 241-0)
        line: () => (save ? lapItemLine(save, { lap: exp.lap + 1, lapItems: exp.lapItems }, '다음 바퀴') : ''), // 바퀴 끝 창 = 다음 바퀴 기준
        short: () => { const id = save?.shared.battleItem; return id ? `${consumableName(id)} ×${save?.shared.items[id] ?? 0}` : '소모품 비었음'; },
        filled: () => !!save?.shared.battleItem,
        canChange: () => !!save && (!!save.shared.battleItem || ownedBattleItems(save).length > 0),
        change: (after: () => void) => {
          const sv = save;
          if (!sv) return;
          const cur = sv.shared.battleItem;
          const opts = ownedBattleItems(sv).filter((id) => id !== cur).map((id) => ({ key: id, label: `${consumableName(id)} ×${sv.shared.items[id] ?? 0} · ${battleItemBrief(id)}`, onPick: () => { if (setLapItem(sv, exp, id)) { saveProgress(exp); after(); } } }));
          if (cur) opts.push({ key: 'none', label: `빼기 (${consumableName(cur)})`, onPick: () => { if (setLapItem(sv, exp, null)) { saveProgress(exp); after(); } } });
          pickDialog({ title: '다음 바퀴 소모품', body: '소모품 칸에 끼운 1개만 모험 중에 쓴다(걷기·전투 어디서든 바퀴당 1번).', options: opts, cls: opts.length > 3 ? 'bha-shoppick--two' : undefined });
        },
      } } : {}),
      onEnded: () => endExpedition(faction, exp),
      onBreakthrough: (resume) => breakthroughScreen(faction, exp, resume),
      openHelp: (onClose) => openHelp('expedition', false, onClose),
      // 걷기 중 가방 (GDD 144장 3 + 212장 1·2): 회복 물건은 다 보이지만 쓰는 것은 소모품 칸에 끼운 1개만, 바퀴당 1번(전투에서 썼어도) — 쓰면 원정 체력이 차고 바로 저장
      openBag: (onClose) => {
        const sv = save;
        if (!sv) return onClose();
        // 전투 소모품 칸이 열리기 전 (GDD 241-0: 3단계): 여는 때만 알린다
        if (!battleItemUnlocked(sv)) {
          showToast({ eyebrow: featureName(faction, 'battleItem'), title: unlockHintText(faction, 'battleItem'), meta: '' }, 0, 2200);
          return onClose();
        }
        healBag({
          items: () => {
            const slotId = sv.shared.battleItem;
            const ids = slotId && !HEAL_ITEM_IDS.includes(slotId) ? [slotId, ...HEAL_ITEM_IDS] : HEAL_ITEM_IDS;
            const lock = lapItemLock(sv, exp);
            return ids.map((id) => ({
              id, name: consumableName(id), count: sv.shared.items[id] ?? 0, detail: battleItemText(id),
              slotted: id === slotId,
              lock: id !== slotId ? '소모품 칸에 끼운 것만 쓴다 — 바퀴 끝 창에서 바꾼다' : lock ?? (HEAL_ITEM_IDS.includes(id) ? null : '전투 중에만 쓴다'),
            }));
          },
          status: () => lapItemLine(sv, exp),
          hp: () => hpFractionOf(exp),
          use: (id) => {
            const r = useSlotItemOnWalk(sv, exp, id);
            if (r.ok) saveProgress(exp);
            return r;
          },
          onClose,
        });
      },
    }, msg);
  }

  /** 폭주(호로화) 연출 (텍스트 수준). 정식 결과(폭주·진화 정체·가면 분기)는 미정이라 임시 페널티만 있다 */
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
    /** 진화 연출이 끝난 뒤 띄울 알림 (GDD 193장 18: 칭호·펫·장비 알림이 연출 위에 겹쳤다) */
    let afterEvolve: (() => void) | null = null;
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
      // 161장: 새 장비는 알림 최소 등급(NOTIFY) 이상만, '가득 차서 판매'는 경고라 남긴다
      const gearNotes = save.runLog.gear.slice(gearLog0).filter((r) => r.kind !== 'get' || (isGearGrade(r.grade) && gearToastWanted(r.grade))).map((r) => gearNoticeOf(r, faction)).filter((n): n is NonNullable<typeof n> => n !== null);
      petNotes.push(...(gearNotes.length > 4 ? [{ eyebrow: '장비', title: `장비 ${gearNotes.length}개를 가지고 돌아왔다`, meta: '가방 장비 탭에서 착용' }] : gearNotes));
      growth = {
        newTraits: summarize(exp).keptTraits.length,
        evolvedTo: evo?.ok ? shownName(formDisplayName(save.evolution, faction.id)) : null,
        newTitles: save.titles.filter((t) => !had.has(t.titleId)).map((t) => titleLabel(t.titleId, faction.id)),
      };
      if (evo?.ok) {
        const s = save;
        const extra = { elements: playerElementsOf(s.evolution), ability: s.evolution.ability, ev: { ...s.evolution.ev }, failLine: isFailLine(s.evolution), stats: baseStatsOf(s.evolution, faction.id), ...gainExtra(s.evolution, evo.abilityGain, evo.abilitySlotsAdded), art: evolvedArtOf(roomOf(faction), s) }; // 새 진화체 그림 (GDD 241-B 7·246장 1: 바뀐 뒤 모습)
        afterResult = () => open('evolve-cutscene', () => evolutionView(root, faction, fromTier, s.evolution.tierIndex, evo.form, () => {
          holdRoomGuides = false; // 연출이 끝나 방으로 돌아오면 첫 진화 타일 안내 (GDD 64장)
          nav.pop();
          const later = afterEvolve;
          afterEvolve = null;
          later?.();
        }, s.build.slots.length, extra), true);
      }
    }
    const showResult = () => {
      setBgm('expedition'); // 결과 화면은 원정 음악 (스토리 끝 대사의 story 음악에서 돌아온다)
      resultView(root, faction, exp, () => {
        if (afterResult) holdRoomGuides = true;
        nestScreen();
        const next = afterResult;
        afterResult = null;
        next?.();
      }, growth);
      notices();
    };
    /** 칭호·펫·장비 알림: 진화가 걸렸으면 연출이 끝난 뒤 (GDD 193장 18), 아니면 바로 */
    const notices = () => {
      const show = () => {
        if (save) showTitleToasts(save, faction, persist);
        showPetNotes();
      };
      if (afterResult) afterEvolve = show;
      else show();
    };
    // 원정 도중 [귀환하기] (GDD 81장): 결과 화면 대신 방 위에 짧은 결과 카드 1장 [확인] (C.170, GDD 100장 #32). 진화가 걸렸으면 그 연출은 그대로
    if (exp.endReason === 'abort') {
      if (afterResult) holdRoomGuides = true;
      nestScreen();
      // 오른 노력치 칩 (GDD 217장 3) — 결과 화면 대신인 짧은 카드에도 같은 칩
      const evRow = evChipRow(faction.id, evGains(exp.evStart, exp.evolution.ev, exp.evBlocked));
      if (!afterResult) confirmDialog({ title: '귀환했다', body: abortSummaryLine(exp, faction), ...(evRow ? { content: evRow } : {}), yes: '확인', single: true, onYes: () => {} });
      notices();
      afterResult?.();
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
  function renderTest(faction: FactionConfig, s: SaveData, tab?: TestTab): void {
    testPanelView(root, faction, s, {
      persist,
      onBattle: (c) => testBattle(faction, c),
      onNewFaction: (fid) => confirmDialog({
        title: `새 테스트 칸 — ${getFaction(fid).name}`,
        body: '지금 테스트 칸은 지워지고 전체 해금 상태로 새로 시작한다. 진짜 세이브는 그대로 남는다.',
        yes: '새로 만들기', no: '아니요',
        onYes: () => {
          save = newTestSave(fid);
          persist();
          nestScreen();
        },
      }),
      onReset: () => confirmDialog({
        title: '테스트 칸 초기화',
        body: '테스트 칸(슬롯·백업 포함)을 모두 지우고 처음 화면으로 간다. 진짜 세이브는 그대로 남는다.',
        yes: '초기화', no: '아니요', danger: true,
        onYes: () => {
          clearTestSlot(localStorage);
          titleScreen('테스트 칸을 비웠다. [새로 시작]으로 전체 해금 테스트 칸을 만든다.');
        },
      }),
      onBodyChanged: () => {
        dress(s.wear);
        nav.top?.render();
      },
      // 시간 앞당기기 (GDD 102-7·109장 7): 패널이 셈한 결과로 방 복귀 알림
      onTimeAdvanced: (rep) => {
        absence = rep;
        hungryGreet = absence.flow.hunger >= BALANCE.provisional.nest.idleHungerNotice;
        persist();
        nestScreen();
      },
      // 다음 진화 (GDD 109장 7): 원정 귀환 때와 같은 진화 연출 → 끝나면 테스트 패널로
      onEvolved: (fromTier, r) => {
        dress(s.wear);
        const extra = { elements: playerElementsOf(s.evolution), ability: s.evolution.ability, ev: { ...s.evolution.ev }, failLine: isFailLine(s.evolution), stats: baseStatsOf(s.evolution, faction.id), ...gainExtra(s.evolution, r.abilityGain, r.abilitySlotsAdded), art: evolvedArtOf(roomOf(faction), s) }; // 새 진화체 그림 (GDD 241-B 7·246장 1: 바뀐 뒤 모습)
        open('evolve-cutscene', () => evolutionView(root, faction, fromTier, s.evolution.tierIndex, r.form, () => {
          nav.pop();
        }, s.build.slots.length, extra), true);
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
      params.liberationStartGauge = liberationStartGaugeOf();
      // 장비 (GDD 91장): 연습도 낀 장비 그대로 (훈련 인형 DPS 측정)
      applyGearToParams(params, gearCarry(save.shared.gear), enemy.class === 'elite' || bossId !== null);
      params.petAttack = petAttackOf(carriedPet(save.shared.pets)); // 펫도 같이 공격 (GDD 241-D 4)
      applyCareToParams(params, battleCareOf(save)); // 빈사 (GDD 102장 수정) — 연습은 져도 잃는 것이 없어 사망은 없다
    }
    const s = createCombat(Math.floor(Math.random() * 2 ** 32), { enemy: fixedStar === undefined ? enemyAtDifficulty(enemy, star) : enemy, params, ...(bossId ? { boss: bossSetupOf(bossId) } : {}) });
    setBgm(enemy.class === 'elite' ? 'elite' : 'battle');
    battleView(root, faction, s, {
      ...(save ? battleItemOpts(save, s) : {}),
      tierIndex: save ? artTierIndexOf(save) : undefined,
      formId: save?.evolution.formId,
      skinId: save ? artSkinOf(save) : undefined,
      notice,
      tutorial: tutorialFor(),
      onQuit: () => nav.pop(),
      onEnd: (done) => {
        if (save) {
          recordBattle(save, buildBattleRecord(done, { factionId: faction.id, tierIndex: save.evolution.tierIndex }));
          if (fixedStar === undefined) recordEvolutionPractice(save.evolution); // 각성형 조건 (GDD 126장 협의 답, C.220): 이번 생 훈련 인형 전투 수
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
  // 들어오는 곳 = 방 책장 아래 물건 (GDD 174장 2, C.257): 머리 제목 = 종족 설정 rankBattleName, 뒤로 = 방
  /** 이 트랙에서 막힌 메뉴의 이유 한 줄 (트랙 종류 설정 lockedReason — 초월자, GDD 12-4 v6.028) */
  function trackLockedText(s: SaveData): string {
    const r = trackRulesOf(s);
    return r.lockedReason ?? `${r.label}은(는) 할 수 없다`;
  }

  function rankScreen(faction: FactionConfig): void {
    if (!save) return;
    rankView(root, faction, save, { onChallenge: (holder) => !careBlocked(save!) && open('rank-battle', () => runRankBattle(faction, holder), true) });
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
    params.liberationStartGauge = liberationStartGaugeOf();
    // 장비 (GDD 91장): 등급전 상대는 강적으로 본다
    applyGearToParams(params, gearCarry(s0.shared.gear), true);
    params.petAttack = petAttackOf(carriedPet(s0.shared.pets)); // 펫도 같이 공격 (GDD 241-D 4)
    applyCareToParams(params, battleCareOf(s0)); // 빈사 (GDD 102장 수정): 지면 사망
    const s = createCombat(Math.floor(Math.random() * 2 ** 32), { enemy: enemyAtDifficulty(holder, holder.difficulty), params });
    battleView(root, faction, s, {
      ...battleItemOpts(s0, s),
      tierIndex: artTierIndexOf(s0),
      formId: s0.evolution.formId,
      skinId: artSkinOf(s0),
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

  // ── 아란칼화 / 참백도 구상화 (GDD 126장 3, C.220): 지금은 보스전 임시 — 둥지 빌드 그대로, 이기면 레스렉시온/만해 해금 ──
  function runAscensionBattle(faction: FactionConfig): void {
    if (!save) return;
    const s0 = save;
    if (!ascensionAccess(s0).ok) return void nav.pop();
    persist();
    stashSlot(store, slot, 'ascension');
    setBgm('elite');
    const AX = BALANCE.provisional.ascension;
    const boss = getBoss(AX.bossId);
    const params = buildCombatParams(s0.build, faction.id);
    applyEvolutionToParams(params, s0.evolution, faction.id, statBonusOf(s0).total, s0.training.completed);
    applyDifficultyToParams(params, AX.difficulty);
    params.liberationStartGauge = liberationStartGaugeOf();
    applyGearToParams(params, gearCarry(s0.shared.gear), true);
    params.petAttack = petAttackOf(carriedPet(s0.shared.pets)); // 펫도 같이 공격 (GDD 241-D 4)
    applyCareToParams(params, battleCareOf(s0));
    const s = createCombat(Math.floor(Math.random() * 2 ** 32), { enemy: { ...enemyAtDifficulty(boss.enemy, AX.difficulty), name: { '*': faction.ascension.foe } }, params, boss: bossSetupOf(boss.id) });
    battleView(root, faction, s, {
      ...battleItemOpts(s0, s),
      tierIndex: artTierIndexOf(s0),
      formId: s0.evolution.formId,
      skinId: artSkinOf(s0),
      banner: `${faction.ascension.name} · ${faction.ascension.foe}`,
      enter: true,
      bg: arenaSceneBg(faction),
      onEnd: (done) => {
        const res = recordAscension(s0, done);
        settleLiberationRisk(s0, done);
        persist();
        const lines = res.won ? [...faction.ascension.completeText] : [`${faction.ascension.foe}에게 졌다. 잃은 것은 없다 — 다시 도전할 수 있다.`];
        nav.replace({ id: 'ascension-result', locked: true, render: () => { ascensionResultView(root, faction, res.won, lines, { onBack: () => nav.pop() }, s0.evolution.formId, res.won ? evolvedArtOf(roomOf(faction), s0) : undefined /* 깬 뒤 모습 — 아란칼화 = 아란칼 모델 (GDD 246장 1) */); root.scrollTop = 0; } });
        showTitleToasts(s0, faction, persist);
      },
    });
  }

  titleScreen();
  // 켠 직후 (GDD 199장 2·4, C.325): 막힌 채 다시 켰으면 막기 창, 로그인 안 된 채(한 번도 고르지 않음·온라인)면 처음 로그인 창
  if (cloudUi) {
    const blocked = readBlockedFlag();
    if (blocked) closeBlocked = otherDeviceDialog(cloudUi, blocked);
    // dev 서버(점검 스크립트 84개가 저장소를 비우고 처음 화면 버튼을 누른다)에서는 가짜 클라우드(`?cloudfake`)일 때만 — 배포 빌드에서는 늘
    else if (needsLoginGate(store, navigator.onLine !== false) && (!import.meta.env.DEV || cloudFake)) showLoginGate();
  }
}
