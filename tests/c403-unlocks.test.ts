// C.403 (GDD 241-0 사용자 수정 v5.570·241-C 1~3): 해금 흐름 — 진화마다 하나씩 열린다 · 해금 안내 카드 · 수련장(방)·번호 쟁탈전(월드맵) 자리 바꿈
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS, getFaction } from '../src/data/factions';
import { GUIDES, guideVars, helpVars } from '../src/data/help';
import { roomOf, ROOM_PROPS, worldMapOf, WORLD_PLACES } from '../src/engine/faction';
import { fillAllUnlocked } from '../src/engine/testMode';
import { guidePending, GUIDE_IDS } from '../src/engine/tutorial';
import { applyUnlocks, FEATURE_IDS, featureName, featureUnlocked, ruleMet, sanitizeUnlocks, UNLOCK_GUIDES, unlockHintText, unlockRule, type FeatureId } from '../src/engine/unlocks';
import { gateHint, gateOpen } from '../src/unlockGate';
import { battleItemUnlocked, checkUnlocks, gearUnlocked, migrateSave, newSaveData, performEvolution, petsUnlocked, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, tilesUnlocked, unlockProgressOf } from '../src/game';
import { useLegacyMigrations } from './helpers/legacyGate';

// C.446: 게임은 형식 87 미만을 열지 않는다(MIN_LOADABLE_SAVE_FORMAT 87) — 이 파일의 옛 형식 마이그레이션 시험 동안만 문턱을 내린다
useLegacyMigrations();

const read = (p: string) => readFileSync(p, 'utf8');
const evolve = (s: ReturnType<typeof newSaveData>, at = 10) => {
  s.evolution.steps = 999999;
  const r = performEvolution(s, at);
  expect(r.ok).toBe(true);
};

describe('241-0 해금 표 (사용자 수정 v5.570, 수치 = BALANCE.provisional.unlocks)', () => {
  it('2단계 타일 · 3단계 장비·전투 소모품 · 4단계 본능 수련·번호 쟁탈전 · 해방 클리어 장신구 · 첫 환생 펫·출정품', () => {
    expect([...FEATURE_IDS]).toEqual(['tiles', 'gear', 'battleItem', 'instinct', 'rankBattle', 'accessory', 'pet', 'sortie']);
    expect(BALANCE.provisional.unlocks).toEqual({ tiles: { tierIndex: 1 }, gear: { tierIndex: 2 }, battleItem: { tierIndex: 2 }, instinct: { tierIndex: 3 }, rankBattle: { tierIndex: 3 }, accessory: { ascended: true }, pet: { rebirths: 1 }, sortie: { rebirths: 1 } });
    // 이번 생에 할 수 있나를 보는 옛 수치와 같은 단계
    expect(unlockRule('instinct')).toEqual({ tierIndex: BALANCE.provisional.liberation.minTierIndex });
    expect(unlockRule('rankBattle')).toEqual({ tierIndex: BALANCE.rank.unlockTierIndex });
  });
  it('순수 판정: 조건을 채운 것만 표 순서로 열고, 다시 부르면 더 안 연다', () => {
    const st = {};
    const P = (maxTierIndex: number, ascended = false, rebirths = 0) => ({ maxTierIndex, ascended, rebirths });
    expect(applyUnlocks(st, P(0), 5)).toEqual([]);
    expect(applyUnlocks(st, P(2), 7)).toEqual(['tiles', 'gear', 'battleItem']);
    expect(applyUnlocks(st, P(2), 9)).toEqual([]);
    expect(applyUnlocks(st, P(3, true), 11)).toEqual(['instinct', 'rankBattle', 'accessory']);
    expect(applyUnlocks(st, P(3, true, 1), 13)).toEqual(['pet', 'sortie']);
    expect(st).toEqual({ tiles: 7, gear: 7, battleItem: 7, instinct: 11, rankBattle: 11, accessory: 11, pet: 13, sortie: 13 });
    expect(ruleMet({ rebirths: 1 }, P(3, true, 0))).toBe(false);
    expect(ruleMet({ ascended: true }, P(3, false, 2))).toBe(false);
    expect(sanitizeUnlocks({ gear: 3, tiles: -1, nope: 4, pet: 'x' })).toEqual({ gear: 3 });
    expect(sanitizeUnlocks(null)).toEqual({});
  });
  it('새 게임은 전부 잠김 → 진화할 때마다 하나씩, 안내 카드가 띄울 차례로, 런 로그에 남는다', () => {
    const s = newSaveData('hollow', 1);
    const open = () => FEATURE_IDS.filter((id) => featureUnlocked(s, id));
    expect(open()).toEqual([]);
    expect(gearUnlocked(s) || battleItemUnlocked(s) || petsUnlocked(s)).toBe(false);
    evolve(s); // 2단계 = 타일 (시작 타일 3장 + 타일 안내)
    expect(open()).toEqual(['tiles']);
    expect(tilesUnlocked(s)).toBe(true);
    expect(Object.keys(s.tiles.collection)).toHaveLength(BALANCE.provisional.expedition.starterTiles.length);
    expect(guidePending(s.help, 'tile-intro')).toBe(true);
    evolve(s, 20); // 3단계 = 장비 · 전투 소모품
    expect(open()).toEqual(['tiles', 'gear', 'battleItem']);
    expect(guidePending(s.help, 'unlock-gear')).toBe(true);
    expect(guidePending(s.help, 'unlock-battle-item')).toBe(true);
    evolve(s, 30); // 4단계 = 본능 수련 · 번호 쟁탈전
    expect(open()).toEqual(['tiles', 'gear', 'battleItem', 'instinct', 'rankBattle']);
    expect(guidePending(s.help, 'unlock-instinct')).toBe(true);
    expect(guidePending(s.help, 'unlock-rank')).toBe(true);
    // 해방 클리어 = 장신구 3칸
    s.evolution.ascended = true;
    expect(checkUnlocks(s, 35)).toEqual(['accessory']);
    expect(guidePending(s.help, 'unlock-accessory')).toBe(true);
    expect(petsUnlocked(s)).toBe(false);
    expect(s.runLog.unlocks!.map((u) => [u.featureId, u.tierIndex])).toEqual([['tiles', 1], ['gear', 2], ['battleItem', 2], ['instinct', 3], ['rankBattle', 3], ['accessory', 3]]);
    // 첫 환생 = 펫(선물 1마리) + 출정품
    s.rebirth.count = 1;
    expect(checkUnlocks(s, 40)).toEqual(['pet', 'sortie']);
    expect(petsUnlocked(s)).toBe(true);
    expect(guidePending(s.help, 'unlock-pet')).toBe(true);
    expect(guidePending(s.help, 'unlock-sortie')).toBe(true);
    expect(Object.keys(s.shared.pets.owned)).toHaveLength(1);
    // 한 번 열리면 영구: 환생해 1단계로 돌아가 해방 표시가 지워져도 그대로
    s.evolution.tierIndex = 0;
    delete s.evolution.ascended;
    expect(unlockProgressOf(s).maxTierIndex).toBe(3);
    expect(checkUnlocks(s, 50)).toEqual([]);
    expect(FEATURE_IDS.every((id) => featureUnlocked(s, id))).toBe(true);
  });
  it('해방 클리어 기록(런 로그 ascensions)만 남은 슬롯도 해방 클리어로 본다', () => {
    const s = newSaveData('shinigami', 1);
    expect(unlockProgressOf(s).ascended).toBe(false);
    s.runLog.ascensions = [{ at: 1, factionId: 'shinigami', bossId: 'x', difficulty: 4, won: true, seed: 1, durationSeconds: 1, tierIndex: 3, formId: null }];
    expect(unlockProgressOf(s).ascended).toBe(true);
  });
  it('저장·불러오기로 남는다 · 테스트 모드 전체 해금은 전부 연다', () => {
    const s = newSaveData('shinigami', 1);
    evolve(s);
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.shared.unlocks).toEqual(s.shared.unlocks);
    expect(FEATURE_IDS.every((id) => featureUnlocked(fillAllUnlocked(newSaveData('hollow', 1), 9), id))).toBe(true);
  });
});

describe('세이브 형식 75 (74 → 75 마이그레이션): 옛 세이브는 이미 열린 것을 닫지 않는다', () => {
  const old74 = (mut: (s: ReturnType<typeof newSaveData>) => void) => {
    const s = newSaveData('hollow', 1);
    mut(s);
    const raw = JSON.parse(JSON.stringify(s));
    raw.meta.format = 74;
    delete raw.shared.unlocks;
    return migrateSave(raw)!;
  };
  it('형식 74, 단계 표에 73 이 있다', () => {
    expect(SAVE_FORMAT_VERSION).toBe(87); // C.406 쇠약 시계·터치·숨은 모습 // C.403 기능 해금
    expect(SAVE_MIGRATIONS[73]).toBeTypeOf('function');
  });
  it('1단계 옛 세이브: 쓰던 장비·전투 소모품 칸·장신구 칸은 열린 채(안내 없음), 타일·펫은 안 받았으면 표대로 잠김', () => {
    const m = old74(() => undefined);
    expect(m.meta.format).toBe(87);
    expect(m.shared.unlocks).toEqual({ gear: 0, battleItem: 0, accessory: 0 });
    for (const g of ['unlock-gear', 'unlock-battle-item', 'unlock-accessory'] as const) expect(guidePending(m.help, g)).toBe(false);
  });
  it('2단계 옛 세이브(첫 진화 때 타일·펫을 받았다): 타일·펫 그대로 열림, 시작 타일을 다시 주지 않는다', () => {
    const m = old74((s) => {
      s.evolution.tierIndex = 1;
      s.tiles.unlocked = true;
      s.tiles.collection = { 'prey-nest-a': 1 };
      s.shared.pets.gifted = true;
      s.shared.pets.owned = { 'pet-gold': { laps: 0, gotAt: 1 } };
      s.help.guides['tile-intro'] = 'done';
    });
    expect(m.shared.unlocks).toEqual({ gear: 0, battleItem: 0, accessory: 0, pet: 0, tiles: 0 });
    expect(m.tiles.collection).toEqual({ 'prey-nest-a': 1 });
    expect(guidePending(m.help, 'tile-intro')).toBe(false);
  });
  it('4단계·환생 옛 세이브: 본능 수련·번호 쟁탈전은 안내 없이 열린 것, 새 기능 출정품만 안내 카드', () => {
    const m = old74((s) => {
      s.evolution.tierIndex = 3;
      s.rebirth.count = 1;
      s.tiles.unlocked = true;
      s.shared.pets.gifted = true;
    });
    expect(Object.keys(m.shared.unlocks).sort()).toEqual([...FEATURE_IDS].sort());
    expect(m.shared.unlocks.instinct).toBe(0);
    expect(guidePending(m.help, 'unlock-instinct')).toBe(false);
    expect(guidePending(m.help, 'unlock-rank')).toBe(false);
    expect(guidePending(m.help, 'unlock-pet')).toBe(false);
    expect(guidePending(m.help, 'unlock-sortie')).toBe(true);
  });
});

describe('241-C 1 해금 안내 카드', () => {
  it('기능마다 안내가 있다 (타일 = 옛 tile-intro: 설명 · 종류 · 합성법 · 배치법)', () => {
    for (const id of FEATURE_IDS) {
      const g = UNLOCK_GUIDES[id];
      expect((GUIDE_IDS as readonly string[]).includes(g), g).toBe(true);
      expect(GUIDES[g].length, g).toBeGreaterThanOrEqual(2);
    }
    expect(GUIDES['tile-intro'].map((x) => x.id)).toEqual(['tiles', 'kinds', 'synth', 'place']);
  });
  it('자리표시자가 두 종족 모두 다 채워진다 (종족 이름은 설정에서)', () => {
    for (const f of FACTIONS) {
      const vars = { ...helpVars(f), ...guideVars(f) };
      for (const id of FEATURE_IDS) for (const sc of GUIDES[UNLOCK_GUIDES[id]]) {
        for (const m of `${sc.title}\n${sc.body}`.matchAll(/\{([^}]+)\}/g)) expect(vars[m[1]!], `${f.id} ${id} {${m[1]}}`).toBeTruthy();
      }
    }
    expect(GUIDES['tile-intro'][0]!.body).toContain('{tier2}');
    expect(GUIDES['unlock-gear'][0]!.body).toContain('{tier3}');
    expect(guideVars(getFaction('hollow')).tier2).toBe('길리안');
    expect(guideVars(getFaction('shinigami')).tier2).toBe('영술원 학생');
  });
  it('잠김 한 줄 = 종족 단계·해방 이름 (분기 없음)', () => {
    const H = getFaction('hollow');
    const S = getFaction('shinigami');
    expect(unlockHintText(H, 'tiles')).toBe('길리안이 되면 지형 타일이 열린다');
    expect(unlockHintText(H, 'gear')).toBe('아쥬커스가 되면 장비가 열린다');
    expect(unlockHintText(H, 'battleItem')).toBe('아쥬커스가 되면 전투 소모품이 열린다');
    expect(unlockHintText(H, 'instinct')).toBe('바스트로데가 되면 본능 수련이 열린다');
    expect(unlockHintText(H, 'rankBattle')).toBe('바스트로데가 되면 번호 쟁탈전이 열린다');
    expect(unlockHintText(H, 'accessory')).toBe('아란칼화 클리어 후 장신구 칸이 열린다');
    expect(unlockHintText(H, 'pet')).toBe('첫 환생 후 펫이 열린다');
    expect(unlockHintText(H, 'sortie')).toBe('첫 환생 후 출정품이 열린다');
    expect(unlockHintText(S, 'gear')).toBe('평대원이 되면 장비가 열린다');
    expect(unlockHintText(S, 'instinct')).toBe('수석 대원이 되면 참백도 수련이 열린다');
    expect(unlockHintText(S, 'rankBattle')).toBe('수석 대원이 되면 진급 시험이 열린다');
    expect(unlockHintText(S, 'accessory')).toBe(`${S.ascension.name} 클리어 후 장신구 칸이 열린다`);
    for (const id of FEATURE_IDS as readonly FeatureId[]) expect(featureName(H, id)).toBeTruthy();
    expect(read('src/engine/unlocks.ts')).not.toMatch(/'hollow'|'shinigami'/);
    // 화면 게이트(세션 D 의 unlockGate)는 엔진에 맡긴다
    const s = newSaveData('hollow', 0);
    expect(gateOpen(s, 'accessory')).toBe(false);
    s.shared.unlocks.accessory = 5;
    expect(gateOpen(s, 'accessory')).toBe(true);
    expect(gateHint(H, 'gear')).toBe(unlockHintText(H, 'gear'));
  });
  it('방에 돌아오면 표 순서로 하나씩 이어서 뜬다 · 도움말에서 다시 본다', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain("const UNLOCK_GUIDE_ORDER: TextGuideId[] = ['hogyoku-appear', 'hogyoku-resonance', ...FEATURE_IDS.map((id) => UNLOCK_GUIDES[id])];"); // GDD 243장 1: 붕옥 등장 컷이 먼저
    expect(app).toContain("if (!runGuide('first-run-room', faction)) runUnlockGuides(faction);");
    expect(app).toContain('out.push({ label: `${featureName(faction, id)} 안내`, run: chain([g]) });');
  });
  it('해금 전에는 펫 동행·펫 드롭·장비 드롭·전투 소모품 버튼이 없고, 시장 장비 상점은 잠김', () => {
    expect(read('src/ui/app.ts')).toContain('const it = battleItemUnlocked(sv) ? battleItemEffectOf(sv) : null;');
    const app = read('src/ui/app.ts');
    expect(app.split('petDrops: petsUnlocked(save),').length - 1).toBe(2);
    expect(app.split('gearDrops: gearUnlocked(save),').length - 1).toBe(2);
    expect(app).toContain("lockReasons: gearUnlocked(s) ? undefined : { gearShop: unlockHintText(faction, 'gear') },");
  });
});

describe('241-C 2·3 수련장 = 홈, 번호 쟁탈전 = 월드맵', () => {
  it('월드맵 장소에 rank 가 있고 training 은 없다 · 방 물건은 altar 를 그리고 rank 는 안 그린다', () => {
    expect([...WORLD_PLACES]).toEqual(['home', 'market', 'rank', 'adventure', 'tower', 'spa']);
    expect([...ROOM_PROPS]).toContain('altar');
    for (const f of FACTIONS) {
      expect(worldMapOf(f).places.rank).toBe(f.rankBattleName);
      expect(worldMapOf(f).layout.rank).toBeDefined();
      expect(roomOf(f).props.altar).toBe('수련장');
    }
    expect(JSON.stringify(getFaction('shinigami').worldmap)).not.toContain('"training"');
  });
  it('수련장 = 잠금 표시 없이 훈련 인형부터, 본능 수련은 목록에서 자물쇠', () => {
    const tv = read('src/ui/trainingView.ts');
    expect(tv.indexOf("{ id: 'practice'")).toBeLessThan(tv.indexOf("{ id: 'train'"));
    expect(read('src/ui/bha/viewtitle.ts')).toContain("it.classList.add('is-locked');");
    expect(read('src/ui/roomView.ts')).not.toContain('rankLock');
  });
});

describe('242장 2 홈 화면 붕옥 아이콘 자리', () => {
  it('방 물건 hogyoku: 붕옥이 등장한 뒤(onHogyoku 가 있을 때)만 서고, 누르면 붕옥 탭 — 자리·이름은 종족 설정으로 덮는다', () => {
    expect([...ROOM_PROPS]).toContain('hogyoku');
    for (const f of FACTIONS) {
      expect(roomOf(f).props.hogyoku).toBe('붕옥');
      expect(roomOf(f).layout.hogyoku).toBeDefined();
    }
    const rv = read('src/ui/roomView.ts');
    expect(rv).toContain("if (p === 'hogyoku' && !hd.onHogyoku) continue;");
    expect(rv).toContain('hogyoku: () => hd.onHogyoku?.(),');
  });
});

describe('C.408 떠돌이 상인 펫 품목 = 펫 해금(첫 환생) 뒤에만 (GDD 241-0)', () => {
  it('해금 전: 새로 오는 상인 목록에 없고, 와 있던 상인의 펫 알도 목록에서 빠져 살 수 없다 — 해금 뒤에는 그대로 판다', async () => {
    const { rollWandererStock } = await import('../src/engine/wanderer');
    const { wandererRows, buyWandererItem } = await import('../src/shop');
    const { getWandererItem } = await import('../src/data/shop');
    const isPet = (id: string) => getWandererItem(id)?.kind === 'pet';
    for (let seed = 0; seed < 200; seed++) {
      let x = seed + 1;
      const rand = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
      expect(rollWandererStock(4, rand, isPet).some((st) => isPet(st.itemId))).toBe(false);
    }
    const s = newSaveData('hollow', 1);
    s.shared.tradeCoins = 5000;
    s.shared.wanderer.visit = { at: 1, runId: 1, tier: 4, stock: [{ itemId: 'w-pet-egg', price: 600, sold: false }] };
    const H = getFaction('hollow');
    expect(wandererRows(s, H)).toEqual([]);
    expect(buyWandererItem(s, H, 'w-pet-egg', 9, () => 0).ok).toBe(false);
    s.rebirth.count = 1;
    checkUnlocks(s, 5);
    expect(wandererRows(s, H).map((r) => r.id)).toEqual(['w-pet-egg']);
    expect(read('src/game.ts')).toContain("petsUnlocked(save) ? undefined : (id) => getWandererItem(id)?.kind === 'pet'");
  });
});
