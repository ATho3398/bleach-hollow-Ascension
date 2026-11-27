// C.565 (GDD 6-16 v6.246, 코딩361): 보스전 = 블리치 캐릭터 6명 — 그랜드 피셔 · 뱌쿠야 · 우르키오라 · 아이젠 · 긴죠 · 유하바하.
// 옛 스토리 보스 3종·탑의 주인 다시 싸우기는 보스전 목록에서 뺀다(스토리·탑에는 그대로). 앞 보스를 이기면 다음이 열림, ★ = 권장 이하
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { BOSSES } from '../src/data/bosses';
import { BOSS_RUSH, bossRushDisplayName } from '../src/data/bossRush';
import { ENEMY_PATTERN_KINDS } from '../src/data/schema';
import { FACTIONS } from '../src/data/factions';
import { specialDungeonLabels } from '../src/engine/faction';
import { ENEMY_CARDS } from '../src/engine/enemyDex';
import { difficultyEnemyScale } from '../src/engine/difficulty';
import { bossRushEnemy, bossRushEntries, bossRushOpen, bossRushStars, createSpecialCombat } from '../src/engine/specialDungeon';
import { bossesBeaten, enterSpecial, newSaveData, settleSpecialRun } from '../src/game';
import type { CombatState } from '../src/engine/combat';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SX = BALANCE.provisional.specialDungeon;
const NOW = Date.UTC(2026, 10, 30, 3);
const fake = (won: boolean): CombatState => ({ status: won ? 'won' : 'lost', lossReason: won ? null : 'hp', tick: 100, enemy: { def: { id: 'e1' } }, player: { hp: 50, maxHp: 100 }, params: { playerStartHpFraction: 1 } } as unknown as CombatState);

describe('C.565 보스 6명 데이터', () => {
  it('순서·이름(두 종족 같은 이름)·권장 ★ 1·2·3·4·4·4, 유하바하 ×1.3', () => {
    expect(BOSS_RUSH.map((b) => b.name['*'])).toEqual(['그랜드 피셔', '뱌쿠야', '우르키오라', '아이젠', '긴죠', '유하바하']);
    expect(BOSS_RUSH.map((b) => b.star)).toEqual([1, 2, 3, 4, 4, 4]);
    expect(BOSS_RUSH.map((b) => b.scale)).toEqual([1, 1, 1, 1, 1, 1.3]);
    for (const b of BOSS_RUSH) for (const f of FACTIONS) expect(bossRushDisplayName(b.id, f.id)).toBe(b.name['*']);
  });

  it('적 데이터 규칙: hpInAttacks·attackInAttacks(권장 단계 기준), 패턴 = 기존 pattern.kind, 보스(elite) 클래스', () => {
    for (const b of BOSS_RUSH) {
      expect(b.enemy.hpInAttacks).toBeGreaterThan(0);
      expect(b.enemy.attackInAttacks).toBeGreaterThan(0);
      expect(b.enemy.class).toBe('elite');
      expect(ENEMY_PATTERN_KINDS).toContain(b.enemy.pattern!.kind);
    }
    // 세기 = ★ 배율 × scale
    const yh = bossRushEntries().find((e) => e.id === 'br-yhwach')!;
    const k = difficultyEnemyScale(4, 'normal');
    expect(bossRushEnemy(yh, 4).hpInAttacks).toBeCloseTo(yh.def.enemy.hpInAttacks * k.hp * SX.boss.enemyScale * 1.3, 6);
  });

  it('스토리 보스 테이블과 섞이지 않는다 (스토리·탑 보스 그대로), 적 도감 보스 칸에 들어간다', () => {
    expect(BOSSES.map((b) => b.id)).toEqual(['sand-maw', 'canyon-king', 'forest-lord']);
    expect(bossRushEntries().map((e) => e.id)).not.toContain('sand-maw');
    expect(bossRushEntries().map((e) => e.id)).not.toContain('tower-owner');
    const bossCards = ENEMY_CARDS.filter((c) => c.kind === 'boss').map((c) => c.id);
    for (const b of BOSS_RUSH) expect(bossCards).toContain(b.id);
  });
});

describe('C.565 열림·★·입장', () => {
  it('그랜드 피셔는 처음부터, 다음 보스는 앞 보스를 이긴 뒤 (연습은 세지 않음)', () => {
    const s = newSaveData('hollow', 1);
    const list = bossRushEntries();
    expect(list.map((e) => bossRushOpen(e, s.shared.special.clears))).toEqual([true, false, false, false, false, false]);
    expect(enterSpecial(s, 'boss', 'br-byakuya', NOW)).toBe(false);
    settleSpecialRun(s, { mode: 'boss', target: 'br-grand-fisher', bossId: 'br-grand-fisher', star: 1, battles: [fake(true)], total: 1, quit: false, practice: true }, NOW);
    expect(bossRushOpen(list[1]!, s.shared.special.clears)).toBe(false);
    expect(enterSpecial(s, 'boss', 'br-grand-fisher', NOW)).toBe(true);
    settleSpecialRun(s, { mode: 'boss', target: 'br-grand-fisher', bossId: 'br-grand-fisher', star: 1, battles: [fake(true)], total: 1, quit: false }, NOW);
    expect(list.map((e) => bossRushOpen(e, s.shared.special.clears))).toEqual([true, true, false, false, false, false]);
    expect(enterSpecial(s, 'boss', 'br-byakuya', NOW)).toBe(true);
  });

  it('★ 고르기 = 1 ~ min(권장 ★, 연 난이도)', () => {
    const [gf, by, , ai] = bossRushEntries();
    expect(bossRushStars(gf!, 4)).toEqual([1]);
    expect(bossRushStars(by!, 4)).toEqual([1, 2]);
    expect(bossRushStars(ai!, 4)).toEqual([1, 2, 3, 4]);
    expect(bossRushStars(ai!, 2)).toEqual([1, 2]);
  });

  it('보상 = 붕옥 재료 세 종 고루 + 골드(옛 보스전 표), 보스 도감 처치 +1 — 자유 원정 보스 후보엔 안 섞임', () => {
    const s = newSaveData('hollow', 1);
    s.shared.soulCrystals = 0; s.shared.hogyokuShards = 0; s.shared.resonanceEssence = 0; s.shared.tradeCoins = 0;
    const r = settleSpecialRun(s, { mode: 'boss', target: 'br-byakuya', bossId: 'br-byakuya', star: 2, battles: [fake(true)], total: 1, quit: false }, NOW);
    const each = SX.boss.materialEach[1]!;
    expect([s.shared.soulCrystals, s.shared.hogyokuShards, s.shared.resonanceEssence]).toEqual([each, each, each]);
    expect(r.gold).toBe(SX.boss.goldPerStar * 2);
    expect(s.bossDex['br-byakuya']?.kills).toBe(1);
    expect(bossesBeaten(s)).toEqual([]);
  });

  it('전투 = 보스전 보스의 페이즈·기믹 (스토리 보스 테이블 없이)', () => {
    for (const e of bossRushEntries()) {
      const c = createSpecialCombat(bossRushEnemy(e, e.def.star), e.def.star, {}, 7, 1, e.id);
      expect(c.boss?.setup.id).toBe(e.id);
      expect(c.boss?.setup.gimmick).toBe(e.def.gimmick);
      expect(c.boss?.setup.phases).toHaveLength(e.def.phases.length);
    }
  });
});

describe('C.565 화면·데이터', () => {
  it('그림 키 = 종족 설정 bossArt(보스 6명), 그림 없음 → 실루엣, 잠김 = 앞 보스 이름', () => {
    for (const f of FACTIONS) for (const b of BOSS_RUSH) expect(specialDungeonLabels(f).bossArt[b.id]).toBeTruthy();
    const v = read('src/ui/specialDungeonView.ts');
    expect(v).toMatch(/foeEl\('foe-b', null\)/);
    expect(v).toMatch(/을\(를\) 이기면 열린다/);
    expect(v).not.toMatch(/towerLabels\(faction\)\.finalBossName/);
    expect(read('src/ui/app.ts')).not.toMatch(/run\.entry\?\.owner/);
  });

  it('밸런스·기획서', () => {
    expect('ownerBoss' in SX.boss).toBe(false);
    expect(read('docs/GDD.md')).toMatch(/보스전\*\* = 블리치 캐릭터 6명[^\n]*구현 C\.565/);
  });
});
