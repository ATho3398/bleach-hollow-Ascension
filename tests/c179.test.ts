// C.179 장비 화면 따로 · 소모품 칸 (GDD 108장): 자동 착용·일괄 판매·정렬·비교 ▲▼·소모품 칸 세이브·방/상태/보관함 연결
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { grantGear, gearScore, autoEquipPlan, rollGear, type GearRoll } from '../src/engine/gear';
import { migrateSave, newSaveData, MIN_LOADABLE_SAVE_FORMAT, SAVE_FORMAT_VERSION, type SaveData } from '../src/game';
import { autoEquipGear, BATTLE_ITEM_IDS, bulkSellGear, bulkSellTargets, equipGearItem, setBattleItem } from '../src/inventory';
import { compareLines, equipStats, sortGear, targetSlotOf } from '../src/ui/equipView';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const H = getFaction('hollow');
const roll = (o: Partial<GearRoll> & Pick<GearRoll, 'kind' | 'grade'>): GearRoll => ({ star: 1, stats: {}, special: null, ...o });
function give(s: SaveData, o: Partial<GearRoll> & Pick<GearRoll, 'kind' | 'grade'>, at = 1) {
  return grantGear(s.shared.gear, roll(o), at)!;
}

describe('자동 착용 (108장 4번): 빈 칸과 더 센 것만', () => {
  it('빈 칸은 가장 센 것, 찬 칸은 더 셀 때만 바꾼다 · 장신구 두 칸에 같은 장비를 안 쓴다', () => {
    const s = newSaveData('hollow', 0);
    const weak = give(s, { kind: 'weapon', grade: 'normal', stats: { atk: 5 } });
    const strong = give(s, { kind: 'weapon', grade: 'rare', stats: { atk: 9 } });
    const a1 = give(s, { kind: 'accessory', grade: 'normal', stats: { spr: 3 } });
    const a2 = give(s, { kind: 'accessory', grade: 'normal', stats: { spr: 4 } });
    expect(gearScore(strong)).toBeGreaterThan(gearScore(weak));
    equipGearItem(s, weak.uid, 'weapon');
    const plan = autoEquipPlan(s.shared.gear);
    expect(plan).toEqual([['weapon', strong.uid], ['acc1', a2.uid], ['acc2', a1.uid]]);
    expect(autoEquipGear(s)).toBe(3);
    expect(s.shared.gear.equipped).toMatchObject({ weapon: strong.uid, acc1: a2.uid, acc2: a1.uid });
    expect(autoEquipPlan(s.shared.gear)).toEqual([]); // 다시 누르면 바꿀 것 없음
    expect(s.runLog.gear.filter((r) => r.kind === 'equip')).toHaveLength(4);
  });
  it('원정 중에는 0', () => {
    const s = newSaveData('hollow', 0);
    give(s, { kind: 'shoes', grade: 'normal', stats: { spd: 2 } });
    s.activeExpedition = {} as SaveData['activeExpedition'];
    expect(autoEquipGear(s)).toBe(0);
  });
  it('점수: 종류가 달라도 같은 눈금(노말 ★1 줄 몇 배), 강화·특수 효과가 더한다', () => {
    const r = rollGear({ kind: 'armor', grade: 'epic', star: 3 }, () => 0.3);
    const base = gearScore({ ...r, plus: 0 });
    expect(gearScore({ ...r, plus: 3 })).toBeGreaterThan(base);
    expect(gearScore({ ...r, plus: 0, special: null })).toBeCloseTo(base - 1);
  });
});

describe('일괄 판매 (108장 4번): 노말 · 안 낀 것', () => {
  it('노말이고 안 낀 것만 팔고 골드를 더한다', () => {
    const s = newSaveData('hollow', 0);
    const n1 = give(s, { kind: 'weapon', grade: 'normal', stats: { atk: 1 } });
    const n2 = give(s, { kind: 'armor', grade: 'normal', stats: { hp: 1 } });
    give(s, { kind: 'shoes', grade: 'rare', stats: { spd: 1 } });
    equipGearItem(s, n1.uid, 'weapon');
    expect(bulkSellTargets(s).map((i) => i.uid)).toEqual([n2.uid]);
    const gold0 = s.shared.tradeCoins;
    const r = bulkSellGear(s);
    expect(r.count).toBe(1);
    expect(s.shared.tradeCoins - gold0).toBe(r.gold);
    expect(s.shared.gear.items.map((i) => i.uid)).not.toContain(n2.uid);
    expect(bulkSellTargets(s)).toEqual([]);
  });
});

describe('정렬·비교·미리 보기 (108장 2·4번)', () => {
  it('정렬 3가지, 낀 것은 늘 앞', () => {
    const s = newSaveData('hollow', 0);
    const a = give(s, { kind: 'shoes', grade: 'normal', stats: { spd: 1 } }, 1);
    const b = give(s, { kind: 'weapon', grade: 'legendary', stats: { atk: 1 } }, 2);
    const c = give(s, { kind: 'armor', grade: 'rare', stats: { hp: 1 } }, 3);
    c.plus = 4;
    const worn = (u: string) => u === a.uid;
    expect(sortGear(s.shared.gear.items, 'grade', worn).map((i) => i.uid)).toEqual([a.uid, b.uid, c.uid]);
    expect(sortGear(s.shared.gear.items, 'kind', () => false).map((i) => i.kind)).toEqual(['weapon', 'armor', 'shoes']);
    expect(sortGear(s.shared.gear.items, 'plus', () => false)[0]!.uid).toBe(c.uid);
  });
  it('비교 ▲▼ 줄 · 끼울 칸 · 능력치 줄 미리 보기', () => {
    const s = newSaveData('hollow', 0);
    const cur = give(s, { kind: 'weapon', grade: 'normal', stats: { atk: 5, crit: 0.01 } });
    const nxt = give(s, { kind: 'weapon', grade: 'rare', stats: { atk: 8 } });
    equipGearItem(s, cur.uid, 'weapon');
    const lines = compareLines(nxt, cur, H);
    expect(lines.some((l) => l.includes('▲3'))).toBe(true);
    expect(lines.some((l) => l.startsWith('치명 ▼1%'))).toBe(true);
    expect(targetSlotOf(s, nxt)).toBe('weapon');
    expect(targetSlotOf(s, cur)).toBeNull();
    const now = equipStats(s);
    const after = equipStats(s, { slot: 'weapon', uid: nxt.uid });
    expect(after.atk - now.atk).toBe(3);
    expect(now.crit).toBeCloseTo(0.01);
    expect(after.crit).toBe(0);
  });
});

describe('소모품 칸 세이브 (108장 3·6번)', () => {
  it('형식·문턱 48, 새 세이브 battleItem = null, 전투용이 아닌 품목은 못 넣고 깨진 값은 버린다', () => {
    expect([SAVE_FORMAT_VERSION, MIN_LOADABLE_SAVE_FORMAT]).toEqual([59, 54]); // C.225 · C.220 · C.223 · C.213 · C.198: 문턱 54 고정(123장 6) // C.195 // C.188 // C.184 // C.181
    const s = newSaveData('hollow', 0);
    expect(s.shared.battleItem).toBeNull();
    expect(setBattleItem(s, 'calm')).toBe(false); // 정화제 = 둥지용
    const raw = JSON.parse(JSON.stringify(s));
    raw.shared.battleItem = 'calm';
    expect(migrateSave(raw)!.shared.battleItem).toBeNull();
    raw.shared.battleItem = 123;
    expect(migrateSave(raw)!.shared.battleItem).toBeNull();
  });
  it('전투용 품목이면 넣고 빼기, 원정 중에는 못 바꾼다', () => {
    const ids = BATTLE_ITEM_IDS as string[];
    const added = ids.length === 0;
    if (added) ids.push('test-battle');
    try {
      const s = newSaveData('hollow', 0);
      const id = ids[0]!;
      expect(setBattleItem(s, id)).toBe(true);
      expect(s.shared.battleItem).toBe(id);
      expect(setBattleItem(s, id)).toBe(false); // 같은 것
      s.activeExpedition = {} as SaveData['activeExpedition'];
      expect(setBattleItem(s, null)).toBe(false);
      s.activeExpedition = null;
      expect(setBattleItem(s, null)).toBe(true);
    } finally {
      if (added) ids.pop();
    }
  });
});

describe('화면 연결 (108장 1·5·6번)', () => {
  it('장비 → 가방 첫 탭 (109장 4번, C.180): 방 [장비] 버튼 없음 · 상태 화면 바로가기 = 가방 장비 탭', () => {
    const app = read('src/ui/app.ts');
    expect(app).not.toMatch(/open\('equip'/);
    expect(app).toMatch(/openChestAtGear\(\);\s*openChest\(\)/);
    expect(app).toMatch(/onGear: openEquip/);
    const room = read('src/ui/roomView.ts');
    expect(room).not.toMatch(/bha-room__gearbtn|onGear/);
    const lcd = read('src/ui/lcdScreens.ts');
    expect(lcd).not.toMatch(/function gearPanel/);
    expect(lcd).toMatch(/gearShortcut\(faction, save, hd\.onGear\)/);
    expect(lcd).toMatch(/\{ id: 'gear', label: equipTitle\(faction\)/);
    expect(lcd).toMatch(/equipTab\(dev, faction, save/);
  });
  it('조작: 좌우 키·끌어다 놓기·확인 창 기본값(자동 착용 = 예, 일괄 판매 = 아니오 = danger)', () => {
    const v = read('src/ui/equipView.ts');
    expect(v).toMatch(/ArrowLeft/);
    expect(v).toMatch(/enableDrag/);
    expect(v).toMatch(/title: '일괄 판매'[^\n]*danger: true/);
    expect(v).not.toMatch(/title: '자동 착용'[^\n]*danger/);
    expect(v).not.toMatch(/faction\.id === '|factionId === '/); // 종족 분기 금지
  });
  it('종족 설정 문구 gearScreen (화면·소모품 칸 이름)', () => {
    for (const id of ['hollow', 'shinigami']) {
      const f = getFaction(id);
      expect(f.gearScreen?.title).toBeTruthy();
      expect(f.gearScreen?.battleSlot).toBeTruthy();
    }
  });
});
