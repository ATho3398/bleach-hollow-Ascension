// C.411 (GDD 243장 5~9): 첫 포식 화면 · 먹이(가득이면 그대로·목록 유지) · 돌봄 요청 · 줄어든 것만 복귀 창 문턱 · 문구 통일
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { RANK_HOLDERS as HOLDERS } from '../src/data/ranks';
import { pickFaction } from '../src/data/schema';
import { skinLabel, skinsFor } from '../src/data/skins';
import { newNest, tickCareRequest, touchDisliked, touchNest } from '../src/engine/nest';
import { feedNest, isFullyFed, newSaveData } from '../src/game';
import { FULLY_FED, useInventoryItem } from '../src/inventory';
import { lossOnlyReturnShown, statusChips } from '../src/ui/bha/roomLogic';

const read = (p: string) => readFileSync(p, 'utf8');
const NX = BALANCE.provisional.nest;
const TC = NX.bond.touch;
const MIN = 60_000;

describe('243장 5 첫 포식 화면', () => {
  it("'어느 갈래를 골라도 같다' 문구 삭제 · 갈래 버튼마다 '모두 같은 효과' · 오른쪽 = 쓰러뜨린 적 카드", () => {
    const g = read('src/ui/guideView.ts');
    expect(g).not.toContain('어느 갈래를 골라도 모든 능력치가 똑같이 오른다');
    expect(g).toContain('foeCardEl(faction, offer, foe)');
    const a = read('src/ui/absorbView.ts');
    expect(a).toContain("export const TUTORIAL_SAME_EFFECT = '모두 같은 효과';");
    expect(a).toMatch(/if \(exp\.tutorial\) \{\s+sm\.classList\.add\('bha-absorb__risk--same'\)/);
    expect(read('src/ui/bha/guide.css')).toContain('.bha-tutabsorb .bha-absorb__risk--same');
  });
});

describe('243장 6 먹이', () => {
  const fed = (hunger: number) => {
    const s = newSaveData('hollow', 0);
    s.nest.hunger = hunger;
    s.shared.food.basic = 5;
    return s;
  };
  it('배부름 가득(화면 100)이면 full — 먹이·수치 그대로, 런 로그 vitals full', () => {
    const s = fed(0.3);
    expect(isFullyFed(s.nest)).toBe(true);
    expect(feedNest(s, 'basic', 1000)).toBe('full');
    expect(s.shared.food.basic).toBe(5);
    expect(s.nest.hunger).toBe(0.3);
    expect(s.runLog.vitals.at(-1)).toMatchObject({ kind: 'full', food: 'basic' });
    expect(useInventoryItem(s, getFaction('hollow'), 'food-basic')).toEqual({ ok: false, reason: FULLY_FED });
  });
  it('배부름 90대는 그대로 먹고 하나 쓴다 (의도)', () => {
    const s = fed(5);
    expect(isFullyFed(s.nest)).toBe(false);
    expect(feedNest(s, 'basic', 1000)).toBe('ate');
    expect(s.shared.food.basic).toBe(4);
  });
  it('뱉어도 먹이는 줄지 않는다', () => {
    const s = fed(60);
    s.shared.food.snack = 3;
    s.shared.food.scrap = 3;
    for (const f of ['basic', 'snack', 'scrap'] as const) expect(feedNest(s, f, 1000)).toBe('ate');
    const left = s.shared.food.basic;
    expect(feedNest(s, 'basic', 1000)).toBe('spat');
    expect(s.shared.food.basic).toBe(left);
  });
  it('먹인 뒤 목록 유지(독) · 가득이면 말풍선 full (두 종족 설정)', () => {
    const dock = read('src/ui/bha/dock.ts');
    expect(dock).not.toContain("setPanel(CLOSED, careBtns.get('feed')!); // 먹인 뒤 초점");
    expect(dock).toContain('fillTray();\n          o.onItemsChange(trayBtns.find((x) => x.dataset.food === id)');
    expect(read('src/ui/roomView.ts')).toContain("say(pickLine(room.talk, 'full'))");
    for (const id of ['hollow', 'shinigami']) expect(getFaction(id).room?.talk?.full?.length).toBeGreaterThan(0);
  });
});

describe('243장 7 돌봄 요청', () => {
  it('컨디션이 높으면 재우기 요청 없음(무작위 재우기 삭제)', () => {
    expect('sleepWeight' in NX.careRequest).toBe(false);
    for (const r of [0, 0.1, 0.5, 0.99]) {
      const n = newNest(0);
      n.condition = 100;
      tickCareRequest(n, n.nextCareAt, () => r);
      expect(n.careRequest?.action).toBe('pet');
    }
  });
  it('터치 싫어함(likeCount 넘김) 뒤 resetHours 동안 쓰다듬기 요청 없음 · 살아 있던 쓰다듬기 요청은 거둔다', () => {
    const n = newNest(0);
    n.careRequest = { action: 'pet', until: 10 * MIN };
    for (let i = 0; i <= TC.likeCount; i++) touchNest(n, MIN);
    expect(touchDisliked(n, MIN)).toBe(true);
    expect(n.careRequest).toBeNull();
    n.nextCareAt = 2 * MIN;
    expect(tickCareRequest(n, 2 * MIN, () => 0).created).toBe(false);
    expect(n.careRequest).toBeNull();
    const after = MIN + TC.resetHours * 3_600_000;
    expect(touchDisliked(n, after)).toBe(false);
    n.nextCareAt = after;
    expect(tickCareRequest(n, after, () => 0).created).toBe(true);
    expect(n.careRequest?.action).toBe('pet');
  });
  it('피곤이면 싫어하는 중에도 재우기는 청한다', () => {
    const n = newNest(0);
    n.tired = true;
    for (let i = 0; i <= TC.likeCount; i++) touchNest(n, MIN);
    tickCareRequest(n, Math.max(n.nextCareAt, MIN), () => 0);
    expect(n.careRequest?.action).toBe('sleep');
  });
  it('상태 설명 창 첫 줄 = 플레이어 말투', () => {
    expect(read('src/ui/bha/statusInfo.ts')).toContain("lead: '지금 상태가 모험에 주는 영향이다");
  });
});

describe('243장 8 줄어든 것만 복귀 창', () => {
  it('1시간(lossOnlyMinMinutes) 이상 비웠을 때만', () => {
    expect(BALANCE.provisional.idle.lossOnlyMinMinutes).toBe(60);
    expect(lossOnlyReturnShown(10 / 60)).toBe(false);
    expect(lossOnlyReturnShown(59 / 60)).toBe(false);
    expect(lossOnlyReturnShown(1)).toBe(true);
    expect(read('src/ui/app.ts')).toContain('loss.length > 0 && lossOnlyReturnShown(away.hours)');
  });
});

describe('243장 9 문구 통일', () => {
  it('확인 창 기본 [아니요][네], 화면에 아니오·예 없음', () => {
    const c = read('src/ui/confirmDialog.ts');
    expect(c).toContain("label: o.no ?? '아니요'");
    expect(c).toContain("label: o.yes ?? '네'");
    for (const f of ['src/ui/app.ts', 'src/ui/shopView.ts', 'src/ui/equipView.ts', 'src/ui/roomView.ts', 'src/ui/cloudView.ts']) expect(read(f)).not.toContain('아니오');
  });
  it("처음 화면 한 이름 · 단축키 도움말 = 실제 순서", () => {
    expect(read('src/ui/app.ts')).toContain('지금 상태를 저장하고 처음 화면으로 돌아간다');
    expect(read('src/ui/shortcutMap.ts')).toContain('처음 화면: 이어하기 / 불러오기 / 새로 시작');
  });
  it("공격 이름 = 일반 공격 (평타·기본 공격 표기 없음)", () => {
    expect(read('src/ui/lcdScreens.ts')).toContain("statRow('일반 공격 치명'");
    for (const f of ['src/data/help/statText.ts', 'src/data/help/glossary.json', 'src/data/evolution/abilities.json', 'src/data/traits/traits.json', 'src/ui/traitDiff.ts']) {
      const t = read(f).split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
      expect(t, f).not.toMatch(/'[^']*(평타|기본 공격)[^']*'|"[^"]*(평타|기본 공격)[^"]*"/);
    }
  });
  it("사신 회복 안내·쇠약 안내는 종족 돌보기 이름(식사)", () => {
    expect(read('src/data/help/tutorial.json')).toContain('{nestActionsShort.feed}(으)로 채워 주자');
    const n = newNest(0);
    const sh = getFaction('shinigami');
    const weak = statusChips({ ...n, weakened: true, lastMealAt: 1 }, sh, undefined);
    const chip = weak.find((c) => c.kind === 'weak')!;
    expect(chip.hint).toContain('식사를 주고');
    expect(chip.short).toBe('식사 주기');
  });
  it("가칭 이름 정리: 스킨 '(가칭)' 없음 · 번호 보유자 정식 이름(종족별)", () => {
    for (const s of skinsFor('hollow').filter((k) => !k.tierLook)) expect(skinLabel(s)).not.toContain('가칭'); // 단계 외형은 스킨 목록에 안 나온다
    for (const h of HOLDERS) {
      for (const f of ['hollow', 'shinigami']) expect(pickFaction(h.name, f)).not.toMatch(/보유자 [A-J]/);
    }
    expect(pickFaction(HOLDERS[0]!.name, 'other')).toBeTruthy(); // 세 번째 종족도 '*' 이름
  });
  it('이름 글자 수 분모 고정 · 상태 읽기 글 정수', () => {
    expect(read('src/ui/identityView.ts')).toContain('count.textContent = `${c.width}/${NAME_RULE.widthMax}`;');
    expect(read('src/ui/bha/statusBox.ts')).toContain('`${c.label} ${Math.round(c.value)}`');
  });
});
