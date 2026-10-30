// C.208 (GDD 132장): 튜토리얼 카드가 다음 누를 곳을 따라감 · 월드맵 시작 위치 · 행동 진행 연출 · 온천 계단 입수
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { HOME_INTRO, RECOVER_SCENES, helpVars, renderHelpText } from '../src/data/help';
import { FACTIONS } from '../src/data/factions';
import { lastShownStage } from '../src/ui/tutorialOverlay';
import { actionBusy, beginAction, tween, ACTION_FILL_MS, SPA_TUTORIAL_FILL_MS } from '../src/ui/bha/actionFx';
import { SPA_PATH } from '../src/ui/spaView';
import { standFoot } from '../src/ui/worldMapView';
import { ScreenStack } from '../src/ui/bha/select';

const read = (p: string) => readFileSync(p, 'utf8');

describe('132장 1 카드가 누를 때마다 다음 대상으로', () => {
  it('보이는 마지막 단계 = 지금 누를 것, 아무것도 안 보이면 첫 단계(창을 닫거나 뒤로 가면 되돌아감)', () => {
    expect(lastShownStage([true, false])).toBe(0);
    expect(lastShownStage([true, true])).toBe(1);
    expect(lastShownStage([false, false, true, false])).toBe(2);
    expect(lastShownStage([false, false])).toBe(0);
  });
  it('여러 번 누르는 회복 안내 카드 = 단계가 있다 (치료제·포션: 카드 → [사용], 온천: 밖으로 → 시장 → 온천 → 쉬는 중, 먹이: [먹이] → 고르기)', () => {
    const by = Object.fromEntries(RECOVER_SCENES.map((s) => [s.id, s]));
    expect(by.cure!.stages!.map((s) => s.targets[0])).toEqual(['@[data-item="med-cure"]', '@.bha-itemdialog[data-item-dialog="med-cure"] [data-act="use"]']);
    expect(by.potion!.stages![1]!.targets[0]).toBe('@.bha-itemdialog[data-item-dialog="w-hp-potion"] [data-act="use"]');
    expect(by['to-spa']!.stages!.map((s) => s.targets.at(-1))).toEqual(['@.bha-prop--outside', '@.bha-worldmap [data-place="market"]', '@.bha-market [data-spot="spa"]', '@.bha-spa__actor']);
    expect(by.feed!.stages![1]!.avoid).toEqual(['@.bha-homedock__tray--food']); // 열린 도시락 목록을 가리지 않는다
    expect(HOME_INTRO.last.stages!.map((s) => s.targets[0])).toEqual(['@.bha-prop--outside', '@.bha-worldmap [data-place="adventure"]']);
  });
  it('단계 문구는 두 종족 모두 채워지고, 한 카드 2줄 이내', () => {
    const extra = {
      chestName: '가방', spaName: '온천', marketName: '시장', dyingPct: '10', potionPct: '50', spaToPct: '80', spaHpPct: '10', spaFullness: '10', idleHpPct: '1',
      spaPath: '밖으로 → 시장 → 온천', foodName: '도시락', foodId: 'basic', spaFirst: '밖으로', outsideName: '밖으로', doorName: '모험', worldName: '지도', goPath: '',
      altarName: '', bookName: '', careNames: '',
    };
    for (const f of FACTIONS) {
      const v = { ...helpVars(f), ...extra };
      for (const sc of [...RECOVER_SCENES, HOME_INTRO.last]) {
        for (const text of [sc.body, sc.done, ...(sc.stages ?? []).map((s) => s.body)]) {
          if (!text) continue;
          expect(() => renderHelpText(text, v)).not.toThrow();
          expect(text.split('\n').length).toBeLessThanOrEqual(2);
        }
      }
    }
  });
  it('tutorialOverlay: 강조·문구·자리·기기 초점(data-dev-only) = 지금 단계, 카드는 대상·열린 창을 피한다', () => {
    const o = read('src/ui/tutorialOverlay.ts');
    expect(o).toContain('const rect = targetRect(stageOf(scene)?.targets ?? scene.targets, host);');
    expect(o).toContain("const OPEN_WINDOWS = ['@.bha-itemdialog .bha-itemmodal', '@.bha-actfx', '@.bha-homedock__tray--food', '@.bha-homedock__tray--more'];");
    expect(o).toContain('layer.dataset.stage = String(i);');
    expect(read('src/ui/bha/itemUi.ts')).toContain('if (s.id) layer.dataset.itemDialog = s.id;');
  });
});

describe('132장 2 월드맵 캐릭터·초점 = 있던 곳', () => {
  it('장소에 선다(장소 단추 바로 뒤 — 이름표를 안 가림), 첫 모험 강제 중 초점 = 모험', () => {
    expect(standFoot({ x: 18, y: 84 })).toEqual({ x: 18, y: 81 });
    expect(standFoot({ x: 50, y: 1 }).y).toBeGreaterThanOrEqual(0);
    const app = read('src/ui/app.ts');
    expect(app).toContain("worldAt = 'home'; // 방에서 나왔다");
    expect(app).toContain("onMarket: () => { worldAt = 'market'; openMarket(faction, s); },");
    expect(app).toContain("focus: forceAdventure ? 'adventure' : worldAt,");
    expect(read('src/ui/worldMapView.ts')).toContain('foot: standFoot(wm.layout[at])');
  });
});

describe('132장 3 행동 진행 연출', () => {
  it('연출 시간 = 화면 상수 (아이템·먹이 약 1초, 튜토리얼 온천 약 3초)', () => {
    expect(ACTION_FILL_MS).toBe(1000);
    expect(SPA_TUTORIAL_FILL_MS).toBe(3000);
    expect(read('src/config/balance.ts')).not.toContain('ACTION_FILL');
  });
  it('연출 중 actionBusy, 끝나면 풀림 (화면 연출이 없는 환경은 바로 끝)', () => {
    const end = beginAction();
    expect(actionBusy()).toBe(true);
    end();
    end();
    expect(actionBusy()).toBe(false);
    const seen: number[] = [];
    let ended = false;
    tween(1000, (t) => seen.push(t), () => (ended = true));
    expect(seen.at(-1)).toBe(1);
    expect(ended).toBe(true);
    expect(actionBusy()).toBe(false);
  });
  it('카드는 연출이 끝나야 [다음]이 풀린다 · 아이템 쓰기·먹이·온천이 연출을 부른다', () => {
    expect(read('src/ui/tutorialOverlay.ts')).toContain('if (actDone || !act.done() || actionBusy()) return;');
    expect(read('src/ui/lcdScreens.ts')).toContain('if (r.ok && !r.spat) useFx(faction, save, e, art, hpBefore, fullBefore);');
    expect(read('src/ui/roomView.ts')).toContain('tween(ACTION_FILL_MS, (t) => {');
    expect(read('src/ui/app.ts')).toContain('spaTutorialFill(from, homeHp(s).fraction, SPA_TUTORIAL_FILL_MS);');
  });
});

describe('132장 4 온천 계단식 입수', () => {
  it('평지를 걷다가 돌부터 한 단씩 내려가고(물 잠김도 단마다 깊어짐) 자리에 앉는다', () => {
    expect(SPA_PATH[0]!.wl).toBeNull();
    expect(SPA_PATH[1]!.wl).toBeNull(); // 돌 앞까지 평지
    const steps = SPA_PATH.slice(2);
    expect(steps.length).toBeGreaterThanOrEqual(3); // 2~3단 + 자리
    for (let i = 1; i < SPA_PATH.length; i++) {
      expect(SPA_PATH[i]!.left).toBeLessThan(SPA_PATH[i - 1]!.left);
      expect(SPA_PATH[i]!.bottom).toBeLessThanOrEqual(SPA_PATH[i - 1]!.bottom);
    }
    for (let i = 1; i < steps.length; i++) expect(steps[i]!.wl!).toBeLessThan(steps[i - 1]!.wl!); // 물 높이가 몸 위로 올라온다
    expect(SPA_PATH.at(-1)).toMatchObject({ left: 50, wl: 0.66 });
  });
  it('나갈 때는 거꾸로: 화면 스택이 뒤로를 잠시 맡는다(interceptBack)', () => {
    const nav = new ScreenStack();
    const log: string[] = [];
    let hold = true;
    nav.push({ id: 'room', render: () => log.push('room') });
    nav.push({ id: 'spa', render: () => log.push('spa'), interceptBack: () => hold, beforeBack: () => log.push('leave') });
    expect(nav.back()).toBe(true);
    expect(nav.top!.id).toBe('spa'); // 연출 중 = 아직 안 빠짐
    hold = false;
    expect(nav.back()).toBe(true);
    expect(nav.top!.id).toBe('room');
    expect(log).toEqual(['room', 'spa', 'leave', 'room']);
    expect(read('src/ui/app.ts')).toContain('return spaExitFx(() => {');
  });
});
