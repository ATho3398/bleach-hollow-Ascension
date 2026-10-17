// 화면 흐름: 종족 선택 → 둥지 → 원정(12칸 길) → 전투 → 원정 결과 → 둥지. DOM/CSS 만 쓴다.
// 화면 텍스트는 FactionConfig·데이터 스킨에서 읽고, 종족 id 로 분기하지 않는다.
import { ENEMIES } from '../data/enemies';
import { FACTIONS, getFaction } from '../data/factions';
import { pickFaction, type EnemyDef } from '../data/schema';
import { tileName } from '../data/tiles';
import { buildBattleRecord, createBattle, type BattleState } from '../engine/battle';
import { createExpedition, finishBattle, startBattle, summarize, type ExpeditionState } from '../engine/expedition';
import { TILE_ROLES, type FactionConfig } from '../engine/faction';
import {
  loadSave, newSaveData, nextRunId, recordBattle, recordExpedition, sanitizeDeck, writeSave, type SaveData,
} from '../game';
import { versionLabel } from '../version';
import { battleView } from './battleView';
import { el, mountScreen } from './dom';
import { battleLabels, endReasonText } from './labels';
import { expeditionView } from './expeditionView';
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
            if (exp.phase === 'ended') endExpedition(faction, exp);
            else showExpedition(faction, exp, '전투 승리!');
          },
        });
      },
      onEnded: () => endExpedition(faction, exp),
    }, msg);
  }

  function endExpedition(faction: FactionConfig, exp: ExpeditionState): void {
    if (save) {
      recordExpedition(save, exp);
      persist();
    }
    const s = summarize(exp);
    const returned = s.outcome === 'returned';
    const list = (ids: string[]) => (ids.length === 0 ? '없음' : ids.map((id) => tileName(id, faction.id)).join(', '));
    const detail = el('div');
    detail.innerHTML = `<table>
      <tr><td>도달 바퀴</td><td>${s.laps}바퀴</td></tr>
      <tr><td>치른 전투</td><td>${exp.battles.length}회 (승 ${exp.battles.filter((b) => b.won).length})</td></tr>
      <tr><td>지킨 타일</td><td>${list(s.kept)}</td></tr>
      <tr><td>잃은 타일</td><td>${list(s.lost)}</td></tr>
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

  // ── 전투 연습 (P1 화면 그대로) ──
  function practiceScreen(faction: FactionConfig): void {
    const labels = battleLabels(faction);
    const list = el('div', 'stack');
    for (const enemy of ENEMIES) {
      const name = pickFaction(enemy.name, faction.id);
      const b = el('button', '', `${name} (${enemy.class === 'elite' ? '강적' : '일반'}) — 약점 ${labels.tile[enemy.weakness]}`);
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
    const s = createBattle({ seed: Math.floor(Math.random() * 2 ** 32), enemy });
    battleView(root, faction, s, {
      onQuit: () => practiceScreen(faction),
      onEnd: (done) => {
        if (save) {
          recordBattle(save, buildBattleRecord(done, { factionId: faction.id }));
          persist();
        }
        practiceResult(faction, enemy, done);
      },
    });
  }

  function practiceResult(faction: FactionConfig, enemy: EnemyDef, s: BattleState): void {
    const labels = battleLabels(faction);
    const won = s.status === 'won';
    const rows = TILE_ROLES.map((r) => `<tr><td>${labels.tile[r]} 매칭</td><td>${s.matchesByRole[r]}회</td></tr>`).join('');
    const detail = el('div');
    detail.innerHTML = `<table>
      <tr><td>턴 수</td><td>${s.turns}턴</td></tr>${rows}
      <tr><td>${labels.riskGauge} 상승(기록)</td><td>+${s.riskGained}</td></tr>
      <tr><td>${labels.absorbGauge}(기록)</td><td>${s.absorbGained.toFixed(1)}</td></tr>
      <tr><td>쓴 기술</td><td>${s.skillsUsed.length}회</td></tr></table>`;
    const again = el('button', 'primary', '같은 상대와 다시');
    again.onclick = () => practiceBattle(faction, enemy);
    const menu = el('button', '', '연습 메뉴로');
    menu.onclick = () => practiceScreen(faction);
    mount(
      el('div', `result-title ${won ? 'win' : 'lose'}`, won ? '승리' : labels.defeatState),
      el('p', 'dim', won ? `${pickFaction(enemy.name, faction.id)}을(를) 쓰러뜨렸다. (흡수 판정은 P3)` : s.lossReason === 'timeout' ? '턴 한도를 넘겼다.' : '체력이 다했다.'),
      detail,
      el('small', 'dim', `시드 ${s.seed} · 기록이 런 로그에 저장됨`),
      again,
      menu,
    );
  }

  if (save) nestScreen();
  else factionScreen();
}
