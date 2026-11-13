// C.397 (GDD 241-D 1~4·6·8): 장비 이름 통일·장신구 3칸·펫 장비 탭·펫 공격·가방 재화·'장착한 장비'
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useImmediateHits } from './helpers/hitDelay';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { createCombat, drainCombatEvents, step, ticksOf, type CombatParams } from '../src/engine/combat';
import { affinityMult, petAttackOf } from '../src/engine/pet';
import { GEAR_KIND_FACTIONS, GEAR_KINDS, GEAR_SLOTS, gearKindAllowed } from '../src/data/gear';
import { FACTIONS, getFaction } from '../src/data/factions';
import { checkUnlocks, migrateSave, newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS } from '../src/game';
import { gateHint, gateOpen } from '../src/unlockGate';

useImmediateHits();
const read = (p: string) => readFileSync(p, 'utf8');
const PA = BALANCE.provisional.pets.attack;

const quiet = (params: Partial<CombatParams> = {}) => {
  const s = createCombat(1, { enemy: getEnemy('test-a'), params: { timeLimitSeconds: 1e9, voidChance: 0, ...params } });
  s.spawnTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.player.hp = s.player.maxHp = 1e9;
  s.enemy.hp = s.enemy.maxHp = 1e9;
  s.enemy.attackTimer = 1e9;
  return s;
};

describe('241-D 4 펫 공격', () => {
  it('데리고 간 펫이 attack.seconds 마다 기본 공격 × fraction × 친밀도 배율로 때린다 (펫 없으면 없음)', () => {
    expect(petAttackOf(null)).toBeNull();
    const pa = petAttackOf({ id: 'pet-gold', level: 3 })!;
    expect(pa).toEqual({ petId: 'pet-gold', seconds: PA.seconds, fraction: PA.fraction * affinityMult(3) });
    const s = quiet({ petAttack: pa });
    const n = ticksOf(s.params, PA.seconds);
    const hits: number[] = [];
    for (let i = 0; i < n * 3; i++) {
      step(s);
      for (const e of drainCombatEvents(s)) if (e.kind === 'pet-attack') hits.push(e.damage);
    }
    expect(hits).toHaveLength(3);
    expect(hits[0]).toBeGreaterThan(0);
    expect(s.enemy.maxHp - s.enemy.hp).toBeCloseTo(hits.reduce((a, b) => a + b, 0));
    const none = quiet();
    for (let i = 0; i < n * 3; i++) step(none);
    expect(none.enemy.hp).toBe(none.enemy.maxHp);
  });
  it('원정 전투 params 에 실린다 · 전투 화면 펫 표시 · 마무리 일격 이름', () => {
    expect(read('src/engine/expedition/expedition.ts')).toContain('params.petAttack = petAttackOf(exp.pet);');
    expect(read('src/ui/battleView.ts')).toContain("case 'pet-attack':");
    expect(read('src/ui/practiceView.ts')).toContain("pet: '펫 공격'");
  });
});

describe('241-D 1·2 장비 통일 · 장신구 3칸', () => {
  it('두 종족 칸 이름 = 무기·방어구·신발·장신구 (종족 설정 값), 종족 제한 칸은 구조만(비어 있음)', () => {
    for (const f of FACTIONS) expect(GEAR_SLOTS.map((s) => f.gearSlotNames[s])).toEqual(['무기', '방어구', '신발', '장신구', '장신구', '장신구']);
    for (const k of GEAR_KINDS) {
      expect(GEAR_KIND_FACTIONS[k]).toEqual([]);
      expect(gearKindAllowed(k, 'hollow') && gearKindAllowed(k, 'shinigami')).toBe(true);
    }
  });
  it('세이브 형식 73: 72 → 73 = 옛 장비·낀 칸 그대로 + 3번째 장신구 칸 null', () => {
    expect(SAVE_FORMAT_VERSION).toBe(86); // C.406 쇠약 시계·터치·숨은 모습
    const s = newSaveData('hollow', 0);
    s.shared.gear.items.push({ uid: 'g1', kind: 'accessory', grade: 'rare', star: 1, stats: { spr: 3 }, special: null, plus: 1, gotAt: 1 });
    s.shared.gear.equipped.acc2 = 'g1';
    const raw = JSON.parse(JSON.stringify(s));
    raw.meta.format = 72;
    delete raw.shared.gear.equipped.acc3;
    SAVE_MIGRATIONS[72]!(raw);
    expect(raw.shared.gear.equipped.acc3).toBeNull();
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBe(86);
    expect(m.shared.gear.items.map((i) => i.uid)).toEqual(['g1']);
    expect(m.shared.gear.equipped).toMatchObject({ acc2: 'g1', acc3: null });
  });
});

describe('241-D 3·6·8 화면', () => {
  it('펫 = 장비 탭 안 분류·칸 (가방 위 펫 탭 없음), 탭은 좁히지 않고 가로 드래그', () => {
    const eq = read('src/ui/equipView.ts');
    expect(eq).toContain("const kindTabs: EquipTab[] = ['all', ...GEAR_KINDS, 'pet'];");
    expect(eq).toContain("colL.append(...(['weapon', 'armor', 'shoes'] as GearSlot[]).map(slotBtn), petBtn);");
    expect(eq).toContain("colR.append(...(['acc1', 'acc2', 'acc3'] as GearSlot[]).map(slotBtn), battleBtn);");
    expect(eq).toContain('enableDragScroll(tabs, hd.signal);');
    expect(read('src/ui/lcdScreens.ts')).not.toContain("{ id: 'pet', label: '펫'");
  });
  it('241-0 수정 표: 장비 = 3단계 · 장신구 = 해방 클리어 · 펫·출정품 = 첫 환생 (이미 가진 것은 열림) — 종족 이름으로 안내', () => {
    const s = newSaveData('hollow', 0);
    for (const id of ['gear', 'accessory', 'pet', 'sortie'] as const) expect(gateOpen(s, id)).toBe(false);
    // C.403: 판정은 engine/unlocks (진화·해방 클리어·환생 때 checkUnlocks 가 열고 저장 — 한 번 열리면 영구)
    s.evolution.tierIndex = 1;
    checkUnlocks(s, 1);
    expect(gateOpen(s, 'gear')).toBe(false);
    s.evolution.tierIndex = 2;
    checkUnlocks(s, 2);
    expect(gateOpen(s, 'gear')).toBe(true);
    expect(gateOpen(s, 'accessory')).toBe(false);
    s.evolution.ascended = true;
    checkUnlocks(s, 3);
    expect(gateOpen(s, 'accessory')).toBe(true);
    expect(gateOpen(s, 'pet')).toBe(false);
    s.rebirth.count = 1;
    checkUnlocks(s, 4);
    expect(gateOpen(s, 'pet')).toBe(true);
    expect(gateOpen(s, 'sortie')).toBe(true);
    const H = getFaction('hollow');
    expect(gateHint(H, 'gear')).toBe('아쥬커스가 되면 장비가 열린다');
    expect(gateHint(H, 'accessory')).toBe('아란칼화 클리어 후 장신구 칸이 열린다');
    expect(gateHint(H, 'pet')).toBe('첫 환생 후 펫이 열린다');
    expect(gateHint(H, 'sortie')).toBe('첫 환생 후 출정품이 열린다');
  });
  it('가방 머리 재화(골드·영옥) · \'장착한 장비\' 문구', () => {
    const lcd = read('src/ui/lcdScreens.ts');
    expect(lcd).toContain('const head = (): HTMLElement[] => [bagWallet(save), headTabs()];');
    expect(lcd).toContain("'장착한 장비가 없다.'");
    expect(read('src/ui/equipView.ts')).not.toMatch(/[`'"][^`'"\n]*낀 [^`'"\n]*[`'"]/);
  });
});
