// 화면 흐름: 종족 선택 → 둥지 → 원정(12칸 길) → 전투 → 원정 결과 → 둥지. DOM/CSS 만 쓴다.
// 화면 텍스트는 FactionConfig·데이터 스킨에서 읽고, 종족 id 로 분기하지 않는다.
import { ENEMIES } from '../data/enemies';
import { FACTIONS, getFaction } from '../data/factions';
import type { EnemyDef } from '../data/schema';
import { tileName } from '../data/tiles';
import { buildBattleRecord, createCombat, storedStartGaugeOf, type CombatState } from '../engine/combat';
import { buildCombatParams } from '../engine/absorb';
import { absorbsRemaining, applyEvolutionToParams } from '../engine/evolution';
import { TITLES, titleName } from '../data/titles';
import type { GrowthInput } from './bha/growthLogic';
import { createExpedition, drainEvents, finishBattle, serializeExpedition, startBattle, summarize, type ExpeditionState } from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import {
  loadSave, newSaveData, nextRunId, performEvolution, readActiveExpedition, recordBattle, recordExpedition, sanitizeDeck, writeSave, type SaveData,
} from '../game';
import { absorbView } from './absorbView';
import { battleView } from './battleView';
import { applyTheme } from './bha/theme';
import { speciesView, startView } from './startView';
import { slotPickView, type SlotPickMode } from './slotView';
import { confirmDialog } from './confirmDialog';
import { setTitleRequest, signalHold } from './bha/hold';
import { IDLE, rotateStep, type RotateEvent, type RotateState } from './bha/rotateResume';
import { getOverlayHost, registerLayer } from './bha/overlayHost';
import { button, el } from './bha/dom';
import { allSlotSummaries, lastPlayedSlot, slotKey, stashSlot, touchSlot } from '../saveSlots';
import { breakthroughView } from './breakthroughView';
import { practiceListView, practiceResultView } from './practiceView';
import { resultView } from './resultView';
import { expeditionView, getSpeed, setSpeed } from './expeditionView';
import { planView } from './planView';
import { dexView } from './dexView';
import { showTitleToasts, titleDexView } from './titleDexView';
import { evolutionView } from './evolutionPanel';
import { roomView } from './roomView';
import { altarView, careView, chestView } from './lcdScreens';
import { createDevice } from './bha/device';
import { ScreenStack } from './bha/select';
import { roomOf } from '../engine/faction';
import { settingsView } from './settingsView';
import { backupView } from './backupView';
import { helpOverlay, type HelpScreenId } from './helpView';
import { markTutorialSeen, shouldAutoShowTutorial } from '../engine/tutorial';

/** 칭호 id → 종족별 표기 이름 */
function titleLabel(id: string, factionId: string): string {
  const t = TITLES.find((x) => x.id === id);
  return t ? titleName(t, factionId) : id;
}

export function startApp(host: HTMLElement): void {
  // 세이브 슬롯 (Q-3): 시작 화면에서 슬롯을 고르기 전에는 세이브가 없다. slot = 지금 플레이 중인 슬롯(1~3), 0 = 시작 화면
  let save: SaveData | null = null;
  let slot = 0;
  /** 지금 진행 중인 원정 (처음 화면으로 돌아갈 때 중간 저장하려고 들고 있는다) */
  let activeExp: ExpeditionState | null = null;
  let confirmingTitle = false;

  // 기기 틀(GDD 16장): 모든 화면은 LCD 창(dev.view) 안에 그린다. 취소 버튼 = 화면 스택 한 단계 뒤로, 더 갈 곳이 없으면 처음 화면 복귀 확인 (Q-3)
  const nav = new ScreenStack();
  const dev = createDevice(host, {
    onCancel: () => {
      if (nav.back()) return true;
      if (nav.top?.id === 'title') return false;
      askReturnToTitle();
      return true;
    },
    canCancel: () => nav.top !== undefined && nav.top.id !== 'title',
    onRotate: (rotated) => rotateEvent(rotated ? 'portrait' : 'landscape'),
  });
  const root = dev.view;
  /** 화면 하나를 스택에 쌓고 그린다 (그릴 때마다 창 스크롤을 맨 위로) */
  const open = (id: string, render: () => void, locked = false) => nav.push({ id, locked, render: () => { render(); root.scrollTop = 0; } });

  const persist = () => {
    if (!save || slot === 0) return;
    writeSave(localStorage, save, slotKey(slot));
    touchSlot(localStorage, slot);
  };
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
  function openHelp(screen: HelpScreenId | undefined, canReplay: boolean, onClose: () => void = () => {}): void {
    const faction = helpFaction();
    // canReplay 가 false 면(원정 화면: 시간이 흐르는 화면 위에서 체험 전투로 갈아타지 않는다) 다시 보기는 숨긴다
    helpOverlay(faction, { screen, onClose, onReplayTutorial: canReplay ? () => tutorialDemo(faction) : undefined });
  }

  /** 튜토리얼 다시 보기: 연습 상대 하나와의 체험 전투를 튜토리얼과 함께 연다. 결과는 기록하지 않는다 */
  function tutorialDemo(faction: FactionConfig): void {
    open('tutorial-demo', () => runTutorialDemo(faction), true);
  }

  function runTutorialDemo(faction: FactionConfig): void {
    const enemy = ENEMIES.find((e) => e.class === 'normal' && !e.testOnly) ?? ENEMIES[0]!;
    const params = save ? buildCombatParams(save.build, faction.id) : undefined;
    if (save && params) {
      applyEvolutionToParams(params, save.evolution);
      params.storedStartGauge = storedStartGaugeOf(save.nest.stability);
    }
    const s = createCombat(Math.floor(Math.random() * 2 ** 32), { enemy, params });
    battleView(root, faction, s, {
      tierIndex: save?.evolution.tierIndex,
      notice: '튜토리얼 체험 전투 (기록되지 않음)',
      tutorial: { onDone: () => { if (save) { markTutorialSeen(save.help); persist(); } } },
      onQuit: () => nav.pop(),
      onEnd: () => nav.pop(),
    });
  }

  // ── 시작 화면·슬롯 (Q-3) ──
  const settingsOpener = (withBackup: boolean) => () =>
    open('settings', () => settingsView(root, () => openHelp(undefined, true), false, withBackup ? () => open('backup', () => backupView(root, save, persist, { slot, onApplied: reloadSlot })) : undefined, () => tutorialDemo(helpFaction())));

  /** 가져오기·되돌리기가 끝난 뒤: 그 슬롯을 저장소에서 다시 읽어 방으로 */
  function reloadSlot(): void {
    enterSlot(slot);
  }

  /** 시작 화면으로: 스택을 비우고 처음 화면 하나만 남긴다 */
  function titleScreen(note = ''): void {
    save = null;
    slot = 0;
    activeExp = null;
    rotate = IDLE;
    renderRotateCard();
    armBackTrap();
    nav.reset({ id: 'title', render: () => { renderTitle(note); root.scrollTop = 0; } });
  }

  function renderTitle(note = ''): void {
    const sums = allSlotSummaries(localStorage);
    const last = lastPlayedSlot(sums);
    // 시작 화면의 테마: 가장 최근 슬롯의 종족, 없으면 등록된 첫 종족 (종족 id 로 분기하지 않는다)
    const lastSum = sums.find((x) => x.slot === last);
    applyTheme(lastSum && lastSum.state === 'ok' ? getFaction(lastSum.factionId) : FACTIONS[0]!);
    startView(root, sums, {
      onNew: () => open('slot-new', () => renderSlotPick('new')),
      onContinue: () => open('slot-continue', () => renderSlotPick('continue')),
      onImport: () => open('slot-import', () => renderSlotPick('import')),
    }, note);
  }

  function renderSlotPick(mode: SlotPickMode): void {
    const sums = allSlotSummaries(localStorage);
    slotPickView(root, mode, sums, FACTIONS, (sum) => {
      if (mode === 'continue') {
        if (sum.state === 'ok') enterSlot(sum.slot);
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
    });
  }

  /** 종족 고르기: newSlot 이 있으면 그 슬롯에 새 세이브를 만든다, 없으면(방에서 종족 바꾸기) 지금 세이브의 종족을 바꾼다 */
  function renderSpecies(newSlot?: number): void {
    applyTheme(helpFaction());
    speciesView(root, FACTIONS, {
      onPick: (f) => {
        if (newSlot !== undefined) {
          stashSlot(localStorage, newSlot);
          slot = newSlot;
          save = newSaveData(f.id);
        } else if (save) save.factionId = f.id;
        persist();
        nestScreen();
      },
      onSettings: settingsOpener(false),
      onHelp: () => openHelp(undefined, true),
    });
  }

  /** 방에서 종족 바꾸기 */
  function factionScreen(): void {
    open('faction', () => renderSpecies());
  }

  /** 슬롯을 열어 방으로. 읽을 수 없으면 시작 화면에 알린다 */
  function enterSlot(n: number): void {
    const loaded = loadSave(localStorage, slotKey(n));
    if (!loaded) return titleScreen(`슬롯 ${n}의 세이브를 읽을 수 없다.`);
    save = loaded;
    slot = n;
    activeExp = null;
    resumeNote = '';
    persist(); // 마지막 플레이 시각 기록(+ 로드 때 해금된 칭호 저장)
    armBackTrap();
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

  // ── 처음 화면으로 돌아가기 (Q-3): 뒤로가기 → 방에서 확인 → 저장 → 시작 화면 ──
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
  setTitleRequest(askReturnToTitle);
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
    showTitleToasts(s, faction, persist);
    const active = readActiveExpedition(s);
    if (!active.ok && active.reason !== 'none') {
      persist(); // 손상·구버전 영역을 비운 것을 저장
      resumeNote = active.reason === 'version' ? '저장된 원정이 이전 버전이라 이어할 수 없어 지웠다.' : '저장된 원정이 손상되어 이어할 수 없어 지웠다.';
    }
    const props = roomOf(faction).props;
    roomView(dev, faction, s, {
      resume: active.ok
        ? { info: `${active.exp.lap}바퀴 · ${active.exp.pos}번 칸`, onResume: () => open('expedition', () => resumeExpedition(active.exp, active.speed), true) }
        : null,
      resumeNote,
      persist,
      onDepart: () => departScreen(faction),
      onAltar: () => open('altar', () => renderAltar(faction, s)),
      onBook: () => open('dex', () => dexView(root, faction, s)),
      onChest: () => open('chest', () => chestView(dev, faction, s, props.chest, persist)),
      onWindow: () => open('titles', () => titleDexView(root, faction, s)),
      onCare: () => open('care', () => careView(dev, faction, s, props.care, persist)),
      onPractice: () => open('practice', () => practiceScreen(faction)),
      onChangeFaction: factionScreen,
      onSettings: settingsOpener(true),
      onHelp: () => openHelp('nest', true),
    });
  }

  function renderAltar(faction: FactionConfig, s: SaveData): void {
    altarView(dev, faction, s, roomOf(faction).props.altar, {
      onEvolve: () => {
        const from = s.evolution.tierIndex;
        const r = performEvolution(s);
        if (!r.ok) return renderAltar(faction, s);
        persist();
        open('evolve-cutscene', () => evolutionView(root, faction, from, s.evolution.tierIndex, r.form, () => nav.pop(), s.build.slots.length), true);
        showTitleToasts(s, faction, persist);
      },
      onDex: () => open('dex', () => dexView(root, faction, s)),
      onHelp: () => openHelp('evolution', true),
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
    // 카드 배치 단계(GDD 17-1): 타일을 길에 놓고 [출발]을 누르면 원정이 시작된다. 그 전에는 저장하지 않으므로 취소하면 이어하던 원정이 그대로 남는다
    open('expedition-plan', () => planView(root, faction, exp, {
      onStart: () => {
        activeExp = exp;
        saveProgress(exp); // 이어하던 원정이 있었다면 여기서 덮어쓴다 = 패배 처리 없이 버려진다
        // 원정 흐름(지도·전투·흡수·결과)은 한 덩어리라 취소로 빠져나가지 않는다(locked). 끝나면 홈으로
        nav.replace({ id: 'expedition', locked: true, render: () => { showExpedition(faction, exp, '출발!'); root.scrollTop = 0; } });
      },
      onHelp: () => openHelp('expedition', false),
    }));
  }

  /** 저장된 원정으로 돌아간다: 저장된 시점의 화면(전투 직전·흡수·둥지 칸 귀환 선택·이동 중)으로 복원 */
  function resumeExpedition(exp: ExpeditionState, speed: number): void {
    const faction = getFaction(exp.factionId);
    activeExp = exp;
    setSpeed(speed);
    if (exp.phase === 'battle') runBattle(faction, exp);
    else if (exp.phase === 'absorb') afterBattle(faction, exp);
    else if (drainEvents(exp).length > 0) breakthroughScreen(faction, exp, () => showExpedition(faction, exp, '원정을 이어간다'));
    else showExpedition(faction, exp, '원정을 이어간다');
  }

  function runBattle(faction: FactionConfig, exp: ExpeditionState): void {
    activeExp = exp;
    const p = exp.pending!;
    const s = startBattle(exp);
    const where = `${exp.lap}바퀴 · ${p.cell}번 칸${p.tileId ? ` · ${tileName(p.tileId, faction.id)}` : ''}${p.combo ? ' · 조합!' : ''}`;
    battleView(root, faction, s, {
      tierIndex: save?.evolution.tierIndex,
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
    activeExp = exp;
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
    activeExp = exp;
    expeditionView(root, faction, exp, {
      tierIndex: save?.evolution.tierIndex,
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

  function endExpedition(faction: FactionConfig, exp: ExpeditionState): void {
    activeExp = null;
    let growth: GrowthInput | undefined;
    if (save) {
      const had = new Set(save.titles.map((t) => t.titleId));
      recordExpedition(save, exp);
      persist();
      growth = {
        newTraits: summarize(exp).keptTraits.length,
        remaining: absorbsRemaining(save.evolution),
        newTitles: save.titles.filter((t) => !had.has(t.titleId)).map((t) => titleLabel(t.titleId, faction.id)),
      };
    }
    resultView(root, faction, exp, save?.nest.stability ?? exp.stability, nestScreen, growth);
    if (save) showTitleToasts(save, faction, persist);
  }

  // ── 전투 연습 (C.6: 새 전투 화면, 둥지 빌드 그대로) ──
  function practiceScreen(faction: FactionConfig): void {
    practiceListView(root, faction, save?.runLog.battles.length ?? 0, { onPick: (enemy) => practiceBattle(faction, enemy) });
  }

  /** 연습 전투: 결과 화면에서 [다시]로 올 때는 같은 자리를 바꿔 끼운다 */
  function practiceBattle(faction: FactionConfig, enemy: EnemyDef, again = false): void {
    const e = { id: 'practice-battle', locked: true, render: () => { runPractice(faction, enemy); root.scrollTop = 0; } };
    if (again) nav.replace(e);
    else nav.push(e);
  }

  function runPractice(faction: FactionConfig, enemy: EnemyDef): void {
    const params = save ? buildCombatParams(save.build, faction.id) : undefined;
    if (save && params) {
      applyEvolutionToParams(params, save.evolution);
      params.storedStartGauge = storedStartGaugeOf(save.nest.stability);
    }
    const s = createCombat(Math.floor(Math.random() * 2 ** 32), { enemy, params });
    battleView(root, faction, s, {
      tierIndex: save?.evolution.tierIndex,
      tutorial: tutorialFor(),
      onQuit: () => nav.pop(),
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
    practiceResultView(root, faction, enemy, s, { onAgain: () => practiceBattle(faction, enemy, true), onMenu: () => nav.pop() });
  }

  titleScreen();
}
