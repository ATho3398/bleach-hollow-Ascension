// 화면 흐름: 종족 선택 → 둥지 → 원정(12칸 길) → 전투 → 원정 결과 → 둥지. DOM/CSS 만 쓴다.
// 화면 텍스트는 FactionConfig·데이터 스킨에서 읽고, 종족 id 로 분기하지 않는다.
import { ENEMIES } from '../data/enemies';
import { FACTIONS, getFaction } from '../data/factions';
import { pickFaction, type EnemyDef } from '../data/schema';
import { tileName } from '../data/tiles';
import { buildBattleRecord, createCombat, elapsedSeconds, type CombatState } from '../engine/combat';
import { absorbReasons, buildCombatParams } from '../engine/absorb';
import { applyEvolutionToParams } from '../engine/evolution';
import { createExpedition, drainEvents, finishBattle, startBattle, summarize, type ExpeditionState } from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import {
  loadSave, newSaveData, nextRunId, performEvolution, recordBattle, recordExpedition, sanitizeDeck, writeSave, type SaveData,
} from '../game';
import { versionLabel } from '../version';
import { traitName } from '../data/traits';
import { lineageName } from '../data/lineages';
import { absorbView } from './absorbView';
import { battleView } from './battleView';
import { el, mountScreen } from './dom';
import { battleLabels, endReasonText } from './labels';
import { absorbConditionText } from './absorbView';
import { expeditionView } from './expeditionView';
import { dexView } from './dexView';
import { evolutionView } from './evolutionPanel';
import { nestView } from './nestView';

export function startApp(root: HTMLElement): void {
  let save: SaveData | null = loadSave(localStorage);

  const mount = (...nodes: HTMLElement[]) => mountScreen(root, ...nodes);
  const persist = () => save && writeSave(localStorage, save);

  function factionScreen(): void {
    const buttons = FACTIONS.map((f) => {
      const b = el('button', 'primary', f.name);
      b.onclick = () => {
        if (save) save.factionId = f.id;
        else save = newSaveData(f.id);
        persist();
        nestScreen();
      };
      return b;
    });
    const stack = el('div', 'stack');
    stack.append(...buttons);
    mount(
      el('h1', '', '블리치 할로우 어센션'),
      el('p', 'dim', '어느 쪽으로 시작할까? (두 종족 모두 처음부터 개방)'),
      stack,
      el('small', 'dim', versionLabel()),
    );
  }

  function nestScreen(): void {
    if (!save) return factionScreen();
    const faction = getFaction(save.factionId);
    const s = save;
    nestView(root, faction, s, {
      persist,
      onDepart: () => departScreen(faction),
      onPractice: () => practiceScreen(faction),
      onEvolve: () => {
        const from = s.evolution.tierIndex;
        const r = performEvolution(s);
        if (!r.ok) return nestScreen();
        persist();
        evolutionView(root, faction, from, s.evolution.tierIndex, r.form, nestScreen);
      },
      onDex: () => dexView(root, faction, s, nestScreen),
      onChangeFaction: factionScreen,
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
    showExpedition(faction, exp, `${faction.huntingGroundName}으로 출발!`);
  }

  function showExpedition(faction: FactionConfig, exp: ExpeditionState, msg = ''): void {
    expeditionView(root, faction, exp, {
      onBattle: (p) => {
        const s = startBattle(exp);
        const where = `${exp.lap}바퀴 · ${p.cell}번 칸${p.tileId ? ` · ${tileName(p.tileId, faction.id)}` : ''}${p.combo ? ' · 조합!' : ''}`;
        battleView(root, faction, s, {
          banner: where,
          onEnd: (done) => {
            finishBattle(exp, done);
            // 승리 후 흡수 가능하면 흡수 화면 → 한계 돌파 연출 → 원정으로 돌아간다
            const proceed = () => {
              const next = () => (exp.phase === 'ended' ? endExpedition(faction, exp) : showExpedition(faction, exp, '전투 승리!'));
              if (drainEvents(exp).length > 0) breakthroughScreen(faction, next);
              else next();
            };
            if (exp.phase === 'absorb') absorbView(root, faction, exp, proceed);
            else proceed();
          },
        });
      },
      onEnded: () => endExpedition(faction, exp),
      onBreakthrough: (resume) => breakthroughScreen(faction, resume),
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
  }

  // ── 전투 연습 (C.6: 새 전투 화면, 둥지 빌드 그대로) ──
  function practiceScreen(faction: FactionConfig): void {
    const labels = battleLabels(faction);
    const list = el('div', 'stack');
    for (const enemy of ENEMIES) {
      const name = pickFaction(enemy.name, faction.id);
      const b = el('button', '', `${name} (${enemy.class === 'elite' ? '강적' : '일반'}) — 약점 ${lineageName(enemy.weaknessLineageId, faction.id)}`);
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
    if (save && params) applyEvolutionToParams(params, save.evolution);
    const s = createCombat(Math.floor(Math.random() * 2 ** 32), { enemy, params });
    battleView(root, faction, s, {
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
    const finText = !fin ? '-' : fin.kind === 'skill' ? `${fin.traitId && fin.lineageId ? traitName(fin.traitId, faction.id) : labels.basicBlock}${fin.lineageId ? ` (${lineageName(fin.lineageId, faction.id)})` : ''}` : { 'basic-attack': '기본 공격', special: labels.specialBlock, void: labels.voidBlock, reflect: '반사', skill: '' }[fin.kind];
    const detail = el('div');
    detail.innerHTML = `<table>
      <tr><td>전투 시간</td><td>${elapsedSeconds(s).toFixed(1)}초</td></tr>
      <tr><td>블록 사용 (${labels.chain}1 / 2 / 3)</td><td>${s.blocksByChain.join(' / ')}</td></tr>
      <tr><td>${labels.chain}3 발동</td><td>${s.chain3Count}회</td></tr>
      <tr><td>강공격 막기</td><td>${s.guardSuccesses}회</td></tr>
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
