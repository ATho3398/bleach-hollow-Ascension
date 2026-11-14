// C.365 (GDD 222장 4·6·7·8·10, 코딩258): 전투 재시작(들어가기 직전 상태로 되돌림 + 런 로그) · 바퀴 끝 흡수 이름 · 소모품 깜빡임 · 결과 요약 두 칸 · 띄어쓰기
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { playCombatBot } from '../src/engine/combat';
import {
  advance, botPickTrait, chooseAbsorb, chooseContinue, chooseReturn, createExpedition, finishBattle, finishRest, placeAll, restoreExpedition, serializeExpedition, startBattle, type ExpeditionState,
} from '../src/engine/expedition';
import { markBattleEntry, migrateSave, newSaveData, readActiveExpedition, restartBattleOnResume, restoreBattleEntry, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS } from '../src/game';
import { spendLapItem } from '../src/inventory';
import { lapGainLine } from '../src/ui/bha/lapEnd';
import { absorbWord, tileHint, variantModsText } from '../src/ui/labels';
import { getTile } from '../src/data/tiles';
import { getFaction } from '../src/data/factions';
import { useLegacyMigrations } from './helpers/legacyGate';

// C.446: 게임은 형식 87 미만을 열지 않는다(MIN_LOADABLE_SAVE_FORMAT 87) — 이 파일의 옛 형식 마이그레이션 시험 동안만 문턱을 내린다
useLegacyMigrations();

const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const T0 = 1_700_000_000_000;
const read = (p: string) => readFileSync(p, 'utf8');

function drive(exp: ExpeditionState, stop: (e: ExpeditionState) => boolean): ExpeditionState {
  for (let g = 0; exp.phase !== 'ended' && g < 5000; g++) {
    if (stop(exp)) return exp;
    if (exp.phase === 'moving') { placeAll(exp); advance(exp); }
    else if (exp.phase === 'battle') { const b = startBattle(exp); playCombatBot(b); finishBattle(exp, b); }
    else if (exp.phase === 'absorb') { const p = botPickTrait(exp); chooseAbsorb(exp, p.traitId, p.replaceSlot); }
    else if (exp.phase === 'rest') finishRest(exp);
    else if (exp.phase === 'nest-choice') { placeAll(exp); if (exp.lap >= 3) chooseReturn(exp); else chooseContinue(exp); }
  }
  return exp;
}
const atBattle = () => drive(createExpedition({ factionId: 'hollow', seed: 11, hunger: 10, condition: 100, deck: DECK }), (e) => e.lap >= 2 && e.phase === 'battle');

describe('222장 6: 원정 전투 도중 다시 켜면 그 전투를 들어가기 직전 상태로', () => {
  const setup = () => {
    const save = newSaveData('hollow', T0 - 60_000);
    save.shared.items = { 'heal-salve': 2 };
    save.shared.battleItem = 'heal-salve';
    const exp = atBattle();
    expect(exp.phase).toBe('battle');
    expect(markBattleEntry(save, exp)).toBe(true);
    expect(markBattleEntry(save, exp)).toBe(false); // 같은 전투는 한 번만
    save.activeExpedition = serializeExpedition(exp, 1, T0)!; // 전투 직전 저장
    save.lastScreen = 'expedition';
    return { save, exp };
  };

  it('전투 중 소모품을 쓰고 꺼져도: 다시 켜면 보관 개수·바퀴 사용·체력·적 모두 전투 직전 값', () => {
    const { save, exp } = setup();
    const hpBefore = exp.hpFraction;
    const enemyBefore = startBattle(exp).enemy.maxHp;
    spendLapItem(save, exp, 'heal-salve'); // 전투 중 사용 → 세이브엔 개수만 줄어든 채 persist 됨
    expect(save.shared.items['heal-salve']).toBe(1);
    const r = readActiveExpedition(save, T0 + 60_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(restartBattleOnResume(save, r.exp, T0 + 61_000)).toBe(true);
    expect(save.shared.items['heal-salve']).toBe(2);
    expect(r.exp.lapItems ?? []).toEqual([]); // 중간 저장은 전투 직전 — 이번 바퀴 아직 안 씀
    expect(r.exp.hpFraction).toBe(hpBefore);
    const again = startBattle(r.exp);
    expect(again.enemy.hp).toBe(again.enemy.maxHp);
    expect(again.enemy.maxHp).toBe(enemyBefore);
    expect(save.runLog.battleRestarts).toHaveLength(1);
    expect(save.runLog.battleRestarts[0]).toMatchObject({ runId: r.exp.runId, lap: r.exp.lap, cell: r.exp.pending!.cell, factionId: 'hollow', itemRestored: 'heal-salve' });
  });

  it('되돌리기는 여러 번 불러도 같다 · 소모품을 안 썼으면 itemRestored 없음', () => {
    const { save, exp } = setup();
    expect(restoreBattleEntry(save, exp)).toBeNull();
    expect(restoreBattleEntry(save, exp)).toBeNull();
    expect(save.shared.items['heal-salve']).toBe(2);
    restartBattleOnResume(save, exp, T0);
    expect(save.runLog.battleRestarts[0]!.itemRestored).toBeUndefined();
  });

  it('마지막 1개를 쓴 뒤 다시 켜도 1개로 돌아온다', () => {
    const { save, exp } = setup();
    save.shared.items = { 'heal-salve': 1 };
    delete exp.battleEntry;
    markBattleEntry(save, exp);
    spendLapItem(save, exp, 'heal-salve');
    expect(save.shared.items['heal-salve']).toBeUndefined();
    expect(restoreBattleEntry(save, exp)).toBe('heal-salve');
    expect(save.shared.items['heal-salve']).toBe(1);
  });

  it('시한을 넘겨 실패 정산해도 소모품은 전투 직전 값', () => {
    const { save, exp } = setup();
    spendLapItem(save, exp, 'heal-salve');
    const r = readActiveExpedition(save, T0 + 3 * 3_600_000);
    expect(r.ok).toBe(false);
    expect(save.shared.items['heal-salve']).toBe(2);
  });

  it('전투가 끝나면 battleEntry 를 지운다 · 중간 저장 왕복', () => {
    const { save, exp } = setup();
    const back = restoreExpedition(save.activeExpedition);
    expect(back.ok && back.exp.battleEntry?.seed).toBe(exp.pending!.seed);
    const b = startBattle(exp);
    playCombatBot(b);
    finishBattle(exp, b);
    expect(exp.battleEntry).toBeUndefined();
    expect(restartBattleOnResume(save, exp)).toBe(exp.phase === 'battle');
  });

  it('앱: 전투 시작 때 적고, 전투 중 소모품은 중간 저장을 덮지 않고, 이어 하기에서 재시작 처리', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain('if (save && markBattleEntry(save, exp)) saveProgress(exp);');
    expect(app).toContain('onUse: () => { spendLapItem(sv, exp, it.id); persist(); }');
    expect(app).toContain('restartBattleOnResume(save, exp)');
  });

  it('세이브 형식 69 · 68 → 69 마이그레이션 = 빈 battleRestarts', () => {
    expect(SAVE_FORMAT_VERSION).toBe(88); // C.406 쇠약 시계·터치·숨은 모습
    const s = newSaveData('hollow', T0) as unknown as Record<string, unknown>;
    delete (s.runLog as Record<string, unknown>).battleRestarts;
    s.formatVersion = 68;
    SAVE_MIGRATIONS[68]!(s as never);
    expect((s.runLog as Record<string, unknown>).battleRestarts).toEqual([]);
    const m = migrateSave(JSON.parse(JSON.stringify({ ...s, formatVersion: 68 })));
    expect(m?.runLog.battleRestarts ?? []).toEqual([]);
  });
});

describe('222장 7: 흡수 이름 = 종족 설정 absorbActionName', () => {
  it('바퀴 끝 한 줄', () => {
    const exp = { lap: 1, victoriesThisLap: 2, acquiredTraits: [{ lap: 1 }], foodLoot: [], goldLoot: [], acquired: [], gearFinds: [], petFinds: [] } as never;
    expect(lapGainLine(exp, '먹이', '골드', getFaction('hollow').absorbActionName)).toBe('이번 바퀴: 승리 2 · 포식 1');
    expect(lapGainLine(exp, '먹이', '골드', getFaction('shinigami').absorbActionName)).toBe('이번 바퀴: 승리 2 · 정화 흡수 1');
  });
  it('타일 설명·변이 문구', () => {
    expect(absorbWord('hollow')).toBe('포식');
    expect(absorbWord('')).toBe('흡수');
    expect(variantModsText({ absorbBonus: 1 } as never, 'hollow')).toContain('포식 후보 +1');
    const hunter = ['hunter-den', 'predator-nest'].map((id) => { try { return getTile(id); } catch { return null; } }).find(Boolean);
    if (hunter) expect(tileHint(hunter, 'shinigami')).not.toMatch(/[^화] 흡수 후보|^흡수 후보/);
  });
});

describe('222장 8·10·4 (화면 연결)', () => {
  it('8: 체력 30% 이하 + 쓸 수 있는 소모품 → 소모품 칸 is-urge (동작 줄이기 대응 CSS)', () => {
    const v = read('src/ui/battleView.ts');
    expect(v).toContain('export const ITEM_URGE_HP = 0.3;');
    expect(v).toContain("itemBtn.root.classList.toggle('is-urge', urge)");
    const css = read('src/ui/bha/room.css');
    expect(css).toContain('.bha-v2role--item.is-urge > .bha-icon');
    expect(css).toMatch(/prefers-reduced-motion[^}]*\{\s*\.bha-v2role--item\.is-urge/);
  });
  it("10: 흡수 설명 '이름 값' 사이 띄어쓰기", () => {
    expect(read('src/ui/absorbView.ts')).toContain("l.text.slice(0, at)), ' ', el('b', 'bha-absorb__v'");
  });
});
