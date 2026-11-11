// C.404 (GDD 241-B 튜토리얼·전투 연출): 해방 안내 각본 · 막기 방어막 · 치명상 빈사 자세 · 온천은 다 앉은 뒤부터 · 튜토 먹이 '첫 끼니'·보상 · 첫 포식 빈 줄 · 진화 그림
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BALANCE } from '../src/config/balance';
import { RECOVER_SCENES, SCRIPT_SCENES } from '../src/data/help';
import { getFaction } from '../src/data/factions';
import { FOOD_IDS } from '../src/engine/faction';
import { NORMAL_FOODS } from '../src/engine/foodPref';
import { enterSpa, newNest, previewHomeHp } from '../src/engine/nest';
import { newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS } from '../src/game';
import { grantRecoverReward, recoverFeed } from '../src/recoverTutorial';
import { foodTypeOf } from '../src/engine/foodPref';

const read = (p: string) => readFileSync(p, 'utf8');
const HH = BALANCE.provisional.nest.homeHp;
const TR = BALANCE.provisional.tutorialRecover;

describe('241-B 1: 각본 전투 해방 안내 카드', () => {
  it('해방 카드 2장(lib-now 해방 버튼 · lib-explain 블록 바) — 이름은 {libName}(종족 설정), 사용자 문구', () => {
    const now = SCRIPT_SCENES['lib-now']!;
    const ex = SCRIPT_SCENES['lib-explain']!;
    expect(now.targets).toEqual(['battle.liberation']);
    expect(ex.targets).toEqual(['battle.tray']);
    expect(now.body).toContain('{libName}');
    // GDD 243장 9 보충(C.411): 영력 해방은 블록만 빨라진다 — 공격 속도는 진화 뒤 해방({libFullName})부터
    expect(ex.body).toContain('{libName}하면 블록이 빨리 나온다.');
    expect(ex.body).not.toContain('공격 속도도 빨라진다');
    expect(ex.body).toContain('{libFullName}이(가) 되면 공격 속도와 진화체만의 효과도 붙는다');
    expect(read('src/ui/battleView.ts')).toContain("libName: labels.liberation.name, libFullName: faction.liberation.name");
  });
});

describe('241-B 2·3·6·7: 화면 (CSS·DOM 연결)', () => {
  it('막기 방어막: 막는 동안 .is-guarding → 캐릭터 둘레 막(--bha-guard 토큰만)', () => {
    const css = read('src/ui/bha/battle-scene.css');
    expect(css).toContain('.bha-root.bha-battle.is-guarding .bha-unit--me .bha-guardshield { display: block;');
    const block = css.slice(css.indexOf('.bha-guardshield {'), css.indexOf('@keyframes bha-guardshield-in'));
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b/i); // 새 색 없음
    expect(read('src/ui/battleView.ts')).toContain("app.classList.toggle('is-guarding', s.guard.ticks > 0)");
  });
  it('치명상 장면: 빈사 자세 동작이 있으면 반복하고 비틀거림 CSS 를 끈다', () => {
    expect(read('src/ui/guideView.ts')).toContain("anim.setLoop('dying')");
    expect(read('src/ui/bha/guide.css')).toContain('.bha-wound__hero.is-rig-dying { animation: none; }');
  });
  it('첫 포식: 리스크 줄이 없는 갈래의 빈 줄 자리를 없앤다', () => {
    expect(read('src/ui/bha/guide.css')).toContain('.bha-tutabsorb .bha-absorb__risk--none { display: none; }');
  });
  it('진화 연출·결과: 새 진화체 그림(heroArtOf — 종이인형·스프라이트 그대로)을 넘긴다', () => {
    const app = read('src/ui/app.ts');
    expect(app.match(/art: heroArtOf\(roomOf\(faction\), faction\.id, artTierIndexOf\(s\), artSkinOf\(s\)\) \}; \/\/ 새 진화체 그림/g)).toHaveLength(2);
    const ev = read('src/ui/evolutionPanel.ts');
    expect(ev).toContain("figOf('bha-evolve__fig--reveal')");
    expect(ev).toContain("figOf('bha-evolve__fig--result')");
  });
});

describe('241-B 4: 온천은 탕에 다 앉은 뒤부터 찬다', () => {
  it('화면에서 걸어 들어가면(walkIn) spaEnterSeconds 동안 그대로, 그 뒤 평소 빠르기', () => {
    const t0 = 1_000_000;
    const n = newNest(t0);
    Object.assign(n, { hpFraction: 0.2, condition: 20, hunger: 50, lastTickMs: t0 });
    expect(enterSpa(n, t0, false, true)).toBeNull();
    expect(n.spa?.soakAt).toBe(t0 + HH.spaEnterSeconds * 1000);
    const mid = previewHomeHp(n, t0 + HH.spaEnterSeconds * 1000 - 100);
    expect(mid.fraction).toBeCloseTo(0.2, 6);
    expect(mid.fullness).toBeCloseTo(50, 6);
    const after = previewHomeHp(n, t0 + HH.spaEnterSeconds * 1000 + 2000);
    expect(after.fraction).toBeCloseTo(0.2 + HH.spa.hpPerSecond * 2, 6);
  });
  it('walkIn 이 아니면 옛 그대로 바로 찬다 (튜토리얼 바로 쉬기·옛 세이브)', () => {
    const t0 = 2_000_000;
    const n = newNest(t0);
    Object.assign(n, { hpFraction: 0.2, condition: 20, hunger: 50, lastTickMs: t0 });
    enterSpa(n, t0);
    expect(n.spa?.soakAt).toBeUndefined();
    expect(previewHomeHp(n, t0 + 1000).fraction).toBeCloseTo(0.2 + HH.spa.hpPerSecond, 6);
  });
  it('spaEnterSeconds = 화면 걷기 1.2초 + 계단 4단 × 0.3초', () => {
    const v = read('src/ui/spaView.ts');
    expect(v).toContain('const SPA_WALK_MS = 1200;');
    expect(v).toContain('export const SPA_STEP_MS = 300;');
    expect(HH.spaEnterSeconds).toBe(2.4);
  });
  it("튜토리얼 온천 카드: spaTo(80%)에서 '가득 찼다' 대신 그 값", () => {
    const sc = RECOVER_SCENES.find((x) => x.id === 'to-spa')!;
    expect(sc.done).toBe('체력이 {spaToPct}%까지 찼다!');
  });
});

describe('241-B 5: 튜토리얼 먹이 = 전용 첫 끼니 + 보상 일반 먹이 6종', () => {
  it('첫 끼니: 배부름 가득, 공용 이름, 상점·드롭·보물·상인 표에 없음', () => {
    expect(FOOD_IDS).toContain('tutorial');
    expect(TR.food).toBe('tutorial');
    expect(foodTypeOf('tutorial')).toBe('special');
    expect(BALANCE.provisional.nest.foods.tutorial!.hunger).toBe(100);
    for (const f of ['hollow', 'shinigami'] as const) expect(getFaction(f).foodNames.tutorial).toBe('첫 끼니');
    const P = BALANCE.provisional;
    const tables = JSON.stringify([P.expedition, read('src/data/grounds/grounds.json')]);
    expect(tables).not.toMatch(/"tutorial":\s*\d/);
  });
  it('배부름 카드가 먹이 카드 앞, 지금 값({fullnessNow})을 보여 준다', () => {
    const ids = RECOVER_SCENES.map((x) => x.id);
    expect(ids.indexOf('fullness')).toBe(ids.indexOf('feed') - 1);
    expect(RECOVER_SCENES.find((x) => x.id === 'fullness')!.body).toContain('{fullnessNow}');
  });
  it('먹이 안내를 마치면 일반 먹이 6종 각 rewardEach 개 (헤드리스 recoverFeed 도)', () => {
    const s = newSaveData('hollow', 5000);
    for (const f of FOOD_IDS) s.shared.food[f] = 0;
    s.help.guides.recover = 'pending' as never;
    recoverFeed(s, 6000);
    expect(NORMAL_FOODS).toHaveLength(6);
    for (const f of NORMAL_FOODS) expect(s.shared.food[f]).toBe(TR.rewardEach);
    expect(s.shared.food.tutorial).toBe(0);
    expect(s.nest.hunger).toBe(0);
    const again = grantRecoverReward(s);
    expect(again.every(([, n]) => n === TR.rewardEach)).toBe(true);
  });
});

describe('세이브 형식 76 (241-B)', () => {
  it('75 → 76: shared.food.tutorial = 0 이 생긴다', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(76);
    const s = newSaveData('hollow', 1) as unknown as { shared: { food: Record<string, number> } };
    delete s.shared.food.tutorial;
    SAVE_MIGRATIONS[75]!(s as never);
    expect(s.shared.food.tutorial).toBe(0);
  });
});
