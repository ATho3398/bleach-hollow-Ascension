// C.518 (사용자 2026-11-22 "-튜토리얼에 가면의 틈에서 어쩌구 이런거 빼 / -2번은 그게 맞지. 전투소모품은 2단겨 ㄱㄱ", GDD v6.158):
// ① 전투 소모품 칸 해금 3단계 → 2단계(종족 config 단계 이름·BALANCE.provisional.unlocks 로만, 안내 카드는 타일 안내 다음)
// ② 튜토리얼 치명상 장면 카드 1장('겨우 쓰러뜨렸다'만) ③ 폭주 블록 리스크 게이지 가산 = 전투 시작 때 값(확인 테스트)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS, getFaction } from '../src/data/factions';
import { GUIDES, guideVars } from '../src/data/help';
import { advance, createExpedition, riskBonus, startBattle } from '../src/engine/expedition';
import { guidePending } from '../src/engine/tutorial';
import { FEATURE_IDS, featureUnlocked, UNLOCK_GUIDES, unlockHintText, unlockRule, unlockTierName } from '../src/engine/unlocks';
import { gateOpen } from '../src/unlockGate';
import { goldGate, goldRows } from '../src/shop';
import { getGoldItem } from '../src/data/shop';
import { battleItemUnlocked, checkUnlocks, gearUnlocked, migrateSave, newSaveData, performEvolution } from '../src/game';

const read = (p: string) => readFileSync(p, 'utf8');
const evolve = (s: ReturnType<typeof newSaveData>, at = 10) => {
  s.evolution.steps = 999999;
  expect(performEvolution(s, at).ok).toBe(true);
};

describe('C.518 ① 전투 소모품 칸 = 2단계 해금', () => {
  it('해금 표: battleItem = 타일과 같은 2단계(tierIndex 1), 장비는 3단계 그대로 · 표 순서 타일 → 전투 소모품 → 장비', () => {
    expect(unlockRule('battleItem')).toEqual({ tierIndex: 1 });
    expect(unlockRule('battleItem')).toEqual(unlockRule('tiles'));
    expect(unlockRule('gear')).toEqual({ tierIndex: 2 });
    expect(FEATURE_IDS.indexOf('battleItem')).toBe(FEATURE_IDS.indexOf('tiles') + 1);
  });

  for (const fid of ['hollow', 'shinigami']) {
    it(`${fid}: 1단계 잠김 → 2단계 진화로 열림(장비는 아직), 안내 카드 대기 · 상점 각성제·장비 칸 게이트 열림`, () => {
      const f = getFaction(fid);
      const s = newSaveData(fid, 1);
      s.shared.battleItem = null;
      expect(battleItemUnlocked(s)).toBe(false);
      expect(gateOpen(s, 'battleItem')).toBe(false);
      s.shared.tradeCoins = 99999;
      const haste = () => goldRows(s, f).find((r) => r.id === 'battle-haste')!;
      expect(goldGate(getGoldItem('battle-haste')!)).toBe('battleItem');
      expect(haste()).toMatchObject({ canBuy: false, lock: unlockHintText(f, 'battleItem') });
      evolve(s);
      expect(s.evolution.tierIndex).toBe(1);
      expect(battleItemUnlocked(s)).toBe(true);
      expect(gateOpen(s, 'battleItem')).toBe(true);
      expect(gearUnlocked(s)).toBe(false);
      expect(haste().canBuy).toBe(true);
      expect(guidePending(s.help, 'tile-intro')).toBe(true);
      expect(guidePending(s.help, UNLOCK_GUIDES.battleItem)).toBe(true);
      expect(guidePending(s.help, UNLOCK_GUIDES.gear)).toBe(false);
      // 잠김 한 줄·안내 카드의 단계 이름 = 종족 config tierNames[해금 표 단계] (종족 분기 없음)
      expect(unlockHintText(f, 'battleItem')).toContain(f.tierNames[1]!);
      expect(unlockTierName(f, 'battleItem')).toBe(f.tierNames[1]);
      expect(guideVars(f).battleItemTier).toBe(f.tierNames[1]);
    });
  }

  it('안내 카드 순서: 2단계 진화 때 타일 안내 다음 = 전투 소모품 2장 · 문구는 {battleItemTier}(단계 숫자 고정 없음)', () => {
    const order = FEATURE_IDS.map((id) => UNLOCK_GUIDES[id]);
    expect(order.indexOf('unlock-battle-item')).toBe(order.indexOf('tile-intro') + 1);
    expect(GUIDES['unlock-battle-item']).toHaveLength(2);
    expect(GUIDES['unlock-battle-item'][0]!.body).toContain('{battleItemTier}');
    expect(GUIDES['unlock-battle-item'][0]!.body).not.toContain('{tier3}');
    expect(read('src/ui/app.ts')).toContain("...FEATURE_IDS.map((id) => UNLOCK_GUIDES[id])");
  });

  it('이미 2단계인 옛 세이브(소모품 칸 잠김): 불러오면 열리고 안내 카드가 한 번 대기, 다시 불러와도 더 안 쌓인다', () => {
    const s = newSaveData('hollow', 1);
    evolve(s);
    delete s.shared.unlocks.battleItem; // C.517 까지의 2단계 세이브 = 소모품 칸 잠김
    s.runLog.unlocks = s.runLog.unlocks!.filter((u) => u.featureId !== 'battleItem');
    s.help = JSON.parse(JSON.stringify(newSaveData('hollow', 1).help));
    expect(battleItemUnlocked(s)).toBe(false);
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(battleItemUnlocked(back)).toBe(true);
    expect(guidePending(back.help, 'unlock-battle-item')).toBe(true);
    expect(back.runLog.unlocks!.filter((u) => u.featureId === 'battleItem')).toHaveLength(1);
    expect(checkUnlocks(back, 99)).toEqual([]);
    const again = migrateSave(JSON.parse(JSON.stringify(back)))!;
    expect(again.runLog.unlocks!.filter((u) => u.featureId === 'battleItem')).toHaveLength(1);
  });

  it('장비가 잠긴 2단계: 가방 장비 탭에 전투 소모품 칸만 보인다(장비 잠김 안내 아래) — 같은 칸 버튼 함수', () => {
    const lcd = read('src/ui/lcdScreens.ts');
    expect(lcd).toMatch(/if \(gateOpen\(save, 'battleItem'\)\) \{\n\s+const slot = panel\(\{ title: battleSlotName\(faction\) \}\);/);
    expect(lcd).toContain('slot.append(battleSlotButton(faction, save,');
    const eq = read('src/ui/equipView.ts');
    expect(eq).toContain('export function battleSlotButton(');
    expect(eq).toContain('const battleBtn = battleSlotButton(faction, save, changedAt);');
  });

  it('1단계 세이브는 그대로 잠김(장비 화면 소모품 칸 자물쇠·가방 소모품 탭 잠김 줄)', () => {
    const s = migrateSave(JSON.parse(JSON.stringify(newSaveData('shinigami', 1))))!;
    expect(featureUnlocked(s, 'battleItem')).toBe(false);
    expect(read('src/ui/equipView.ts')).toContain("const battleOpen = gateOpen(save, 'battleItem');");
    expect(read('src/ui/lcdScreens.ts')).toContain("itemsUi.group === 'battle' ? 'battleItem' as const");
  });
});

describe('C.518 ② 튜토리얼 치명상 장면 카드 1장', () => {
  it('두 종족 tutorialWound = "겨우 쓰러뜨렸다" 1장 — 가면 틈/베인 상처 카드 없음', () => {
    for (const f of FACTIONS) {
      expect(f.tutorialWound).toHaveLength(1);
      expect(f.tutorialWound[0]!.title).toBe('겨우 쓰러뜨렸다');
      const all = JSON.stringify(f.tutorialWound);
      expect(all).not.toContain('가면 틈');
      expect(all).not.toContain('베인 상처');
    }
  });
  it('카드 1장이어도 마지막 카드 뒤 onDone(원정 끝 → 귀환) — 다음 카드가 없으면 onDone', () => {
    const view = read('src/ui/guideView.ts');
    expect(view).toContain('if (!c) return onDone();');
    expect(view).toContain("if (status === 'completed') show(i + 1);");
    expect(view).toContain('step: `튜토리얼 ${i + 1} / ${cards.length}`');
  });
});

describe('C.518 ③ 폭주 블록 리스크 게이지 가산 = 전투 시작 때 값', () => {
  it('전투 중 게이지가 올라도 그 전투의 가산은 그대로, 다음 전투에서 새 값', () => {
    const RX = BALANCE.provisional.risk;
    const e = createExpedition({ factionId: 'hollow', seed: 40, hunger: 10, condition: 50, risk: 0, deck: ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'] });
    e.wildCells = [1];
    advance(e);
    const battle = startBattle(e);
    const at0 = battle.params.voidChanceBonus;
    expect(at0).toBeCloseTo(riskBonus(e), 12);
    e.risk = RX.limit; // 전투 중에 게이지가 가득 찼다고 해도
    expect(battle.params.voidChanceBonus).toBe(at0); // 이 전투 몫은 시작 때 값
    expect(riskBonus(e)).toBeGreaterThan(at0); // 다음 전투부터 반영
    expect(read('src/engine/combat/combat.ts').match(/voidChanceBonus\s*=/g)).toBeNull(); // 전투 엔진은 가산을 다시 쓰지 않는다
  });
});
