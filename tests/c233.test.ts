// C.233 (GDD 155장): 월드맵 = LCD 화면 전체(위 여백 없음) · 회복 안내 6/7 멈춤 수리 + 1~7 끝까지
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BALANCE } from '../src/config/balance';
import { FACTIONS, getFaction } from '../src/data/factions';
import { RECOVER_SCENES } from '../src/data/help';
import { createExpedition, playExpedition } from '../src/engine/expedition';
import { DEFAULT_WORLDMAP, worldMapOf, WORLD_PLACES } from '../src/engine/faction';
import { guidePending } from '../src/engine/tutorial';
import { newSaveData, nextRunId, recordExpedition, tickIdle } from '../src/game';
import { homeHp, spaEnter, spaLeave } from '../src/home';
import { useInventoryItem } from '../src/inventory';
import { CURE_ITEM_ID, grantRecoverFood, recoverFeedDone, recoverGrantBag, recoverStep } from '../src/recoverTutorial';

const read = (p: string) => readFileSync(p, 'utf8');
const TR = BALANCE.provisional.tutorialRecover;

describe('155장 1 월드맵 = 화면 전체', () => {
  const css = read('src/ui/bha/worldmap.css');
  it('바깥 여백·장면 테두리 없음, 위 한 줄은 지도 위에 겹침, 하늘 띠 없음', () => {
    expect(css).toContain('.bha-lcd .bha-app.bha-room.bha-worldmap { padding: 0; gap: 0; position: relative; }');
    expect(css).toContain('.bha-worldmap__scene { border: 0; border-radius: 0; }');
    expect(css).toMatch(/\.bha-worldmap__hud \{\n\s+position: absolute;/);
    expect(css).toContain('.bha-room--worldmap .bha-room__wall { display: none; }');
    expect(css).toMatch(/\.bha-room--worldmap \.bha-room__floor \{\n\s+height: 100%;/);
  });
  it('땅 = 장면 16% 아래 전부, 장소는 그 안에 위아래로 펼침 (맨 위 장소도 위 한 줄 아래)', () => {
    const top = DEFAULT_WORLDMAP.floor.poly[0]![1];
    expect(top).toBeLessThanOrEqual(0.2);
    for (const f of FACTIONS) {
      const L = worldMapOf(f).layout;
      const ys = WORLD_PLACES.map((p) => L[p].y);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(top * 100 + 15);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(40);
    }
  });
});

describe('155장 2 회복 안내 6/7 멈춤', () => {
  it('원인: 튜토리얼 온천이 빨라 나가는 도중 가득 차 방으로 끊기면 나가기 done 이 안 불렸다 → 끊겨도 done, 나가는 중엔 저절로 나오기 안 부름', () => {
    const v = read('src/ui/spaView.ts');
    expect(v).toContain('if (!actor.isConnected) return cut ? cut() : endMove();');
    expect(v).toContain('walkPath(from, 0, finish, finish);');
    expect(v).toContain('if (finished) return;');
    expect(v).toContain('    if (exiting) return;\n    if (p.spaEnded || !n.spa) {');
  });
  it('회복 안내 카드 = 7장 (빈사 → 가방 → 구급상자 → 온천 → 쉬기 → 먹이 → 끝)', () => {
    expect(RECOVER_SCENES.map((s) => s.id)).toEqual(['dying', 'to-bag', 'cure', 'to-spa', 'spa-rest', 'feed', 'done']);
  });
  for (const fid of ['hollow', 'shinigami']) {
    it(`${fid}: 1~7 끝까지 — 온천에서 저절로 가득 차 나온 뒤 [다음](나가기 다시 부름)이어도 먹이 단계로 이어진다`, () => {
      const save = newSaveData(fid, 1000);
      const exp = createExpedition({
        factionId: fid, seed: 5, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition, deck: [], risk: save.nest.risk, stability: save.nest.stability,
        build: save.build, evolution: save.evolution, tutorial: true,
      });
      playExpedition(exp, { returnAfterLap: 1, absorb: 'absorb' });
      recordExpedition(save, exp, 2000);
      expect(recoverStep(save)).toBe('dying'); // 1 빈사
      recoverGrantBag(save); // 2 가방
      expect(useInventoryItem(save, getFaction(fid), CURE_ITEM_ID).ok).toBe(true); // 3 구급상자
      expect(recoverStep(save)).toBe('spa');
      expect(spaEnter(save, 2500)).toBeNull(); // 4 온천
      expect(save.nest.spa?.fast).toBe(true);
      tickIdle(save, 2500 + 60_000); // 5 쉬는 동안 가득 차 저절로 나옴 (10초면 가득)
      expect(save.nest.spa).toBeNull();
      expect(homeHp(save).fraction).toBeGreaterThanOrEqual(TR.spaTo - 1e-6);
      expect(spaLeave(save, 2500 + 61_000, true)).toBeNull(); // 쉬기 [다음] 의 나가기를 또 불러도 아무 일 없음
      expect(recoverStep(save)).toBe('feed'); // 6 먹이
      grantRecoverFood(save);
      recoverFeedDone(save);
      expect(recoverStep(save)).toBeNull(); // 7 끝 → '다음 할 일'
      expect(guidePending(save.help, 'first-run-room')).toBe(true);
    });
  }
});

describe('155장 2 회복 안내 7/7 빈 카드', () => {
  it('회복 안내 카드의 자리표시자는 모두 채워진다 (주석에 묻힌 idleHpPct 처럼 빠지면 카드가 빈 채 멈춘다)', async () => {
    const { helpVars } = await import('../src/data/help');
    const app = read('src/ui/app.ts');
    const a = app.indexOf('function runRecover(');
    const block = app.slice(app.indexOf('const vars = {', a), app.indexOf('    };', app.indexOf('const vars = {', a)));
    const code = block.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n'); // 주석 안 키는 없는 것
    const keys = new Set([...code.matchAll(/(\w+):/g)].map((m) => m[1]!));
    for (const f of FACTIONS) {
      const hv = helpVars(f);
      for (const sc of RECOVER_SCENES) {
        const texts = [sc.title, sc.body, sc.done, ...(sc.stages ?? []).map((s) => s.body)].filter((x): x is string => !!x);
        for (const t of texts) for (const m of t.matchAll(/\{(\w+)\}/g)) expect(keys.has(m[1]!) || m[1]! in hv, `${sc.id} {${m[1]}}`).toBe(true);
      }
    }
    expect(keys.has('idleHpPct')).toBe(true);
  });
});

describe('155장 1 보충 — 장터도 화면 전체 (C.234)', () => {
  it('장터: 바깥 여백·테두리 없음, 머리 줄 겹침, 차양 아래 빈 벽 띠 줄임(벽 30%), 바닥 30% 아래 전부, 뒷줄 상점 위로', async () => {
    const { DEFAULT_MARKET } = await import('../src/engine/faction');
    const css = read('src/ui/bha/market.css');
    expect(css).toContain('.bha-lcd .bha-app.bha-room.bha-market { padding: 0; gap: 0; position: relative; }');
    expect(css).toContain('.bha-market__scene { border: 0; border-radius: 0; }');
    expect(css).toMatch(/\.bha-market__hud \{\n\s+position: absolute;/);
    expect(css).toMatch(/\.bha-room--market \.bha-room__wall \{\n\s+height: 30%;/);
    expect(DEFAULT_MARKET.floor.poly[0]![1]).toBe(0.3);
    for (const k of ['shop', 'gearShop', 'skinShop', 'traitShop', 'smith'] as const) expect(DEFAULT_MARKET.layout[k].y).toBeLessThan(60);
  });
});
