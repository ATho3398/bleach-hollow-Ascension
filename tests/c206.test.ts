// C.206 (GDD 129-2): ① 각본 전투 행동(블록·막기) = 카드 닫힘 → 약 0.5초 → 모션·피해 ② 회복 안내 = 행동 대신 버튼 없음, 원래 조작으로 하고 [다음] 잠김
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { createExpedition, playExpedition } from '../src/engine/expedition';
import { guidePending } from '../src/engine/tutorial';
import { newSaveData, nextRunId, recordExpedition } from '../src/game';
import { homeHp, HP_POTION_ID, spaEnter } from '../src/home';
import { useInventoryItem } from '../src/inventory';
import { CURE_ITEM_ID, grantRecoverFood, recoverFeedDone, recoverGrantBag, recoverSpaSoak, recoverStep } from '../src/recoverTutorial';

const TR = BALANCE.provisional.tutorialRecover;
const read = (p: string) => readFileSync(p, 'utf8');

describe('129-2 1 각본 행동 = 카드 닫힘 → 0.5초 → 모션 (battleView)', () => {
  const v = read('src/ui/battleView.ts');
  it('맞는 입력(막기·블록)이 오면 카드를 먼저 닫고 0.5초 뒤 엔진에 넣는다, 그동안 카드를 다시 띄우지 않는다', () => {
    expect(v).toContain('const SCRIPT_ACT_DELAY_MS = 500;');
    expect(v).toContain('scriptPending = { input, at: now + SCRIPT_ACT_DELAY_MS, stage: pr.stage };');
    expect(v).toContain('if (!scripted || !scriptReady || scriptPending) return;');
    expect(v).toMatch(/scriptCardStage = `act:\$\{pr\.stage\}`;[\s\S]*?scriptCard\?\.dismiss\(\);/);
  });
});

describe('129-2 2 회복 안내 = 원래 조작', () => {
  const afterTutorial = (factionId: string) => {
    const save = newSaveData(factionId, 1000);
    const exp = createExpedition({
      factionId, seed: 5, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition, deck: [], risk: save.nest.risk, stability: save.nest.stability,
      build: save.build, evolution: save.evolution, tutorial: true,
    });
    playExpedition(exp, { returnAfterLap: 1, absorb: 'absorb' });
    recordExpedition(save, exp, 2000);
    return save;
  };
  for (const f of ['hollow', 'shinigami']) {
    it(`${f}: 가방에서 구급상자를 원래대로 쓰면 빈사 풀림, 튜토리얼 온천(10초) 들어가면 80%, 먹이 준 뒤 가득 · '다음 할 일'`, () => {
      const s = afterTutorial(f);
      const fc = getFaction(f);
      expect(recoverStep(s)).toBe('dying');
      recoverGrantBag(s);
      expect(useInventoryItem(s, fc, CURE_ITEM_ID).ok).toBe(true);
      expect(s.nest.collapsed).toBe(false);
      expect(recoverStep(s)).toBe('spa'); // 방 포션 단계 삭제 (C.223, GDD 144장 4)
      expect(spaEnter(s, 2500)).toBeNull(); // 세이브 시각과 이어지게 (C.214: 들어가기 전에 시계를 흘림)
      expect(s.nest.spa?.fast).toBe(true); // 튜토리얼 온천 = 10초 빠르기 (GDD 145장 1)
      expect(recoverSpaSoak(s, 2600)).toBe(true);
      expect(s.nest.spa).not.toBeNull(); // 들어간 채로 (쉬기 설명 뒤 방으로)
      expect(homeHp(s).fraction).toBeGreaterThanOrEqual(TR.spaTo - 1e-6);
      const before = s.shared.food[TR.food];
      grantRecoverFood(s);
      expect(s.shared.food[TR.food]).toBe(before + 1);
      recoverFeedDone(s);
      expect(s.nest.hunger).toBe(0);
      expect(homeHp(s).fraction).toBe(1);
      expect(recoverStep(s)).toBeNull();
      expect(guidePending(s.help, 'first-run-room')).toBe(true);
    });
  }
  it('튜토리얼이 끝난 뒤의 온천은 평소 빠르기(5분), 치료제(옛 체력 포션)는 방에서 안 쓴다 (C.223, GDD 144·145장)', () => {
    const s = newSaveData('hollow', 1000);
    s.help.guides.recover = 'done';
    s.nest.hpFraction = 0.2;
    s.shared.items[HP_POTION_ID] = 1;
    expect(useInventoryItem(s, getFaction('hollow'), HP_POTION_ID).ok).toBe(false);
    expect(homeHp(s).fraction).toBe(0.2);
    expect(spaEnter(s, 1000)).toBeNull();
    expect(s.nest.spa?.fast).toBeUndefined();
  });
  it('app: 행동을 대신 해 주는 카드 버튼 없음 — 모든 카드 버튼 = [다음], 행동 카드는 act(대상·완료)', () => {
    const app = read('src/ui/app.ts');
    for (const old of ["label: '구급상자 쓰기'", "label: '체력 포션 마시기'", "label: '먹이 주기'", "label: '쉬기'", '열기`, act:']) expect(app).not.toContain(old);
    expect(app).toContain("finishLabel: '다음', vars,");
    expect(app).toContain("act: { selector: '.bha-prop--chest', done: () => nav.top?.id === 'chest' }");
    expect(app).toContain(`act: { selector: '[data-item="med-cure"]', done: () => closeItemWhen(!s.nest.collapsed) }`); // C.214: 쓰면 물건 창 닫음
  });
  it('tutorialOverlay: 행동 카드는 하기 전 [다음] 잠김 · 뒤 화면 통과(data-dev-pass·data-dev-only) · 하면 [다음] 켜짐', () => {
    const o = read('src/ui/tutorialOverlay.ts');
    expect(o).toContain('if (acting) next.disabled = true;');
    expect(o).toContain('else if (acting) layer.dataset.devOnly = stage ? selectorOf(stage.targets) : sc!.act!.selector;');
    expect(o).toContain('actDone = true;');
  });
  it('기기 버튼: 전투 밖에서도 튜토리얼 카드를 연 채 뒤 화면 대상을 고른다 (device)', () => {
    const d = read('src/ui/bha/device.ts');
    expect(d).toContain("const passAny = !!layer && layer.el.hasAttribute('data-dev-pass');");
    expect(d).toContain('else if (passAny) {');
  });
});
