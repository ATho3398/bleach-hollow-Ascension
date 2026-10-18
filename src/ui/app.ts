// 화면 흐름: 종족 선택 → 둥지 → 원정(12칸 길) → 전투 → 원정 결과 → 둥지. DOM/CSS 만 쓴다.
// 화면 텍스트는 FactionConfig·데이터 스킨에서 읽고, 종족 id 로 분기하지 않는다.
import { ENEMIES, enemyPatternKind } from '../data/enemies';
import type { EnemyPatternKind } from '../data/schema';

import { FACTIONS, getFaction } from '../data/factions';
import { pickFaction, type EnemyDef } from '../data/schema';
import { tileName } from '../data/tiles';
import { buildBattleRecord, createCombat, elapsedSeconds, storedStartGaugeOf, type CombatState } from '../engine/combat';
import { absorbReasons, buildCombatParams } from '../engine/absorb';
import { applyEvolutionToParams } from '../engine/evolution';
import { createExpedition, drainEvents, finishBattle, serializeExpedition, startBattle, summarize, type ExpeditionState } from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import {
  loadSave, newSaveData, nextRunId, performEvolution, readActiveExpedition, recordBattle, recordExpedition, sanitizeDeck, writeSave, type SaveData,
} from '../game';
import { versionLabel } from '../version';
import { traitName } from '../data/traits';
import { lineageName } from '../data/lineages';
import { absorbView } from './absorbView';
import { battleView } from './battleView';
import { el, mountScreen } from './dom';
import { applyTheme } from './bha/theme';
import { startView } from './startView';
import { battleLabels, endReasonText } from './labels';
import { absorbConditionText } from './absorbView';
import { expeditionView, getSpeed, setSpeed } from './expeditionView';
import { dexView } from './dexView';
import { showTitleToasts, titleDexView } from './titleDexView';
import { evolutionView } from './evolutionPanel';
import { nestView } from './nestView';
import { settingsView } from './settingsView';
import { helpOverlay, type HelpScreenId } from './helpView';
import { markTutorialSeen, shouldAutoShowTutorial } from '../engine/tutorial';

/** 연습 목록용 패턴 이름 (임시 표시) */
const PATTERN_LABEL: Record<EnemyPatternKind, string> = { basic: '기본형', swift: '속공형', sturdy: '단단형', 'heavy-seal': '강공격·봉인', 'heavy-chain': '연속 강공격', stance: '방어 자세·반격' };

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
    else if (drainEvents(exp).length > 0) breakthroughScreen(faction, () => showExpedition(faction, exp, '원정을 이어간다'));
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
      if (drainEvents(exp).length > 0) breakthroughScreen(faction, next);
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
      onBreakthrough: (resume) => breakthroughScreen(faction, resume),
      openHelp: (onClose) => openHelp('expedition', null, onClose),
    }, msg);
  }

  /** 한계 돌파 연출 (텍스트 수준). 정식 결과(폭주·진화 정체·가면 분기)는 미정이라 임시 페널티만 있다 */
  function breakthroughScreen(faction: FactionConfig, resume: () => void): void {
    const go = el('button', 'primary', '계속');
    go.onclick = resume;
    mount(
      el('div', 'breakthrough', faction.breakthroughText),
      el('p', 'dim', `임시 페널티: 이 원정 동안 공허 블록이 크게 늘고, ${faction.nestName}에 돌아오면 ${faction.stabilityName}이(가) 떨어진다.`),
      go,
    );
  }

  function endExpedition(faction: FactionConfig, exp: ExpeditionState): void {
    if (save) {
      recordExpedition(save, exp);
      persist();
    }
    const s = summarize(exp);
    const returned = s.outcome === 'returned';
    const list = (ids: string[]) => (ids.length === 0 ? '없음' : ids.map((id) => tileName(id, faction.id)).join(', '));
    const traits = (ids: string[]) => (ids.length === 0 ? '없음' : ids.map((id) => traitName(id, faction.id)).join(', '));
    const detail = el('div');
    detail.innerHTML = `<table>
      <tr><td>도달 바퀴</td><td>${s.laps}바퀴</td></tr>
      <tr><td>치른 전투</td><td>${exp.battles.length}회 (승 ${exp.battles.filter((b) => b.won).length})</td></tr>
      <tr><td>지킨 타일</td><td>${list(s.kept)}</td></tr>
      <tr><td>잃은 타일</td><td>${list(s.lost)}</td></tr>
      <tr><td>얻은 특성</td><td>${traits(s.keptTraits)}</td></tr>
      <tr><td>잃은 특성</td><td>${traits(s.lostTraits)}</td></tr>
      <tr><td>${faction.riskGaugeName} (최고 / 끝)</td><td>${Math.round(exp.riskPeak)} / ${Math.round(exp.risk)}${exp.breakthrough ? ' — 한계 돌파' : ''}</td></tr>
      <tr><td>${faction.stabilityName}</td><td>${Math.round(save?.nest.stability ?? exp.stability)}</td></tr>
      <tr><td>남은 허기 / 컨디션</td><td>${Math.round(exp.hunger)} / ${Math.round(exp.condition)}</td></tr></table>`;
    const home = el('button', 'primary', `${faction.nestName}으로`);
    home.onclick = nestScreen;
    mount(
      el('div', `result-title ${returned ? 'win' : 'lose'}`, returned ? '귀환' : faction.defeatStateName),
      el('p', 'dim', endReasonText(exp.endReason!, faction)),
      detail,
      el('small', 'dim', `시드 ${exp.seed} · 기록이 런 로그에 저장됨`),
      home,
    );
    if (save) showTitleToasts(save, faction, persist);
  }

  // ── 전투 연습 (C.6: 새 전투 화면, 둥지 빌드 그대로) ──
  function practiceScreen(faction: FactionConfig): void {
    const labels = battleLabels(faction);
    const list = el('div', 'stack');
    for (const enemy of ENEMIES) {
      const name = pickFaction(enemy.name, faction.id);
      const b = el('button', '', `${name} (${enemy.class === 'elite' ? '강적' : '일반'}·${PATTERN_LABEL[enemyPatternKind(enemy)]}) — 약점 ${lineageName(enemy.weaknessLineageId, faction.id)}`);
      b.onclick = () => practiceBattle(faction, enemy);
      list.append(b);
    }
    const back = el('button', '', `${faction.nestName}으로`);
    back.onclick = nestScreen;
    mount(
      el('h1', '', `${labels.factionName} · 전투 연습`),
      el('p', 'dim', `상대를 고르면 전투를 시작한다. 전투 기록 ${save?.runLog.battles.length ?? 0}판 저장됨.`),
      list,
      back,
    );
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
    const labels = battleLabels(faction);
    const won = s.status === 'won';
    const reasons = absorbReasons(s);
    const fin = s.finisher;
    const finText = !fin ? '-' : fin.kind === 'skill' ? `${fin.traitId && fin.lineageId ? traitName(fin.traitId, faction.id) : labels.basicBlock}${fin.lineageId ? ` (${lineageName(fin.lineageId, faction.id)})` : ''}` : { 'basic-attack': '기본 공격', special: labels.specialBlock, void: labels.voidBlock, reflect: '반사', stored: labels.storedSkill, skill: '' }[fin.kind];
    const detail = el('div');
    detail.innerHTML = `<table>
      <tr><td>전투 시간</td><td>${elapsedSeconds(s).toFixed(1)}초</td></tr>
      <tr><td>블록 사용 (${labels.chain}1 / 2 / 3)</td><td>${s.blocksByChain.join(' / ')}</td></tr>
      <tr><td>${labels.chain}3 발동</td><td>${s.chain3Count}회</td></tr>
      <tr><td>강공격 막기</td><td>${s.guardSuccesses}회</td></tr>
      <tr><td>${labels.storedSkill}</td><td>${s.storedUsed}회 사용 (낭비 ${Math.round(s.storedWasted)})</td></tr>
      <tr><td>${labels.specialBlock}</td><td>${s.specialUsed ? '사용' : '안 씀'}</td></tr>
      <tr><td>${labels.voidBlock} (${labels.riskGauge} 상승)</td><td>${s.voidUsed}회 (+${s.riskGained})</td></tr>
      <tr><td>마무리 일격</td><td>${finText}</td></tr>
      <tr><td>${faction.absorbActionName}</td><td>${reasons.length > 0 ? '가능' : '불가'} (연습에서는 쓰지 않음)</td></tr></table>`;
    const again = el('button', 'primary', '같은 상대와 다시');
    again.onclick = () => practiceBattle(faction, enemy);
    const menu = el('button', '', '연습 메뉴로');
    menu.onclick = () => practiceScreen(faction);
    mount(
      el('div', `result-title ${won ? 'win' : 'lose'}`, won ? '승리' : labels.defeatState),
      el('p', 'dim', won ? `${pickFaction(enemy.name, faction.id)}을(를) 쓰러뜨렸다.` : s.lossReason === 'timeout' ? '시간 제한을 넘겼다.' : '체력이 다했다.'),
      detail,
      el('small', 'dim', absorbConditionText(faction, enemy.weaknessLineageId)),
      el('small', 'dim', `시드 ${s.seed} · 기록이 런 로그에 저장됨`),
      again,
      menu,
    );
  }

  if (save) nestScreen();
  else factionScreen();
}
