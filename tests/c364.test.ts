// C.364 (GDD 222장 1·2·3·5): 튜토리얼 카드 + 공용 창 겹침 · 처음 로그인 창 · 대기 보상 문구·0바퀴 · 수련장 잠김 안내 (222장 9 탭은 223장에서 되돌림, C.366)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { firstGateNote, CLOUD_GATE_NOTE_KEY } from '../src/cloudSave';
import { getFaction } from '../src/data/factions';
import { idleYield } from '../src/engine/idle';
import { claimIdle, idleClaimable, idlePendingYield, newSaveData } from '../src/game';
import { idleShortfall } from '../src/ui/idleView';
import { trainingLockedText } from '../src/ui/trainingView';

const read = (p: string) => readFileSync(p, 'utf8');

describe('222장 1 공용 창은 튜토리얼을 비켜 간다 + 대기 보상 창은 카드 뒤', () => {
  it('공용 창 부품(확인·고르기·클라우드·가방·타일 뽑기·원정 일시정지)이 열릴 때 coverTutorials, 닫을 때 푼다', () => {
    for (const p of ['src/ui/confirmDialog.ts', 'src/ui/pickDialog.ts', 'src/ui/cloudView.ts', 'src/ui/bha/healBag.ts', 'src/ui/guideView.ts', 'src/ui/expeditionView.ts']) {
      const src = read(p);
      expect(src, p).toMatch(/coverTutorials\((layer|ov)\)/);
      expect(src, p).toMatch(/uncover(Tut)?\(\)/);
    }
  });
  it('대기 보상 복귀 창은 afterTutorials 로 카드가 끝난 뒤, 방을 떠났으면 띄우지 않는다', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain("afterTutorials(() => showIdleReturn(idle, s, faction, claim), () => save === s && nav.top?.id === 'room')");
    expect(app).not.toContain('window.setTimeout(() => showIdleReturn(');
    const host = read('src/ui/bha/overlayHost.ts');
    expect(host).toContain("document.querySelector('.bha-tut') !== null");
    expect(host).toContain('if (quiet >= 2)');
  });
});

describe('222장 2 처음 로그인 창', () => {
  it('[로그인 없이 하기] 버튼 = declined, 게스트 실패 = guest-failed — 둘 다 기억(뒤로만 다시 묻기)', () => {
    const cv = read('src/ui/cloudView.ts');
    expect(cv).toContain("offline: '로그인 없이 하기'");
    expect(cv).toContain("onClick: () => finish('declined')");
    expect(cv).toContain("finish('guest-failed', err)");
    const app = read('src/ui/app.ts');
    expect(app).toContain("if (how !== 'skipped') markLoginGateDone(store);");
    expect(app).toContain('firstGateNote(store)');
  });
  it("'로그인 없이 시작한다' 알림은 처음 한 번만", () => {
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(firstGateNote(st)).toBe(true);
    expect(m.has(CLOUD_GATE_NOTE_KEY)).toBe(true);
    expect(firstGateNote(st)).toBe(false);
  });
  it('게스트 꺼짐 문구는 쉬운 말', () => {
    expect(read('src/cloudSave.ts')).toContain("'auth/admin-restricted-operation': '게스트 로그인이 아직 꺼져 있다.'");
  });
});

describe('222장 3 대기 보상', () => {
  it('0바퀴면 골드·걸음 모두 0', () => {
    const y = idleYield(0.2); // 0.2시간 × 10% × 40바퀴 = 0.8바퀴
    expect(y.laps).toBe(0);
    expect(y.gold + y.steps + y.ev + y.food + y.tiles + y.gear + y.gearChance).toBe(0);
    expect(idleYield(1).laps).toBeGreaterThan(0);
    expect(idleYield(1).gold).toBeGreaterThan(0);
  });
  it('0바퀴면 [받기]가 받지 않고 쌓인 시간을 그대로 둔다', () => {
    const s = newSaveData('hollow', 1);
    s.idlePending = { from: 0, hours: 0.2, activeHours: 0.2 };
    expect(idleClaimable(s)).toBe(true);
    expect(idlePendingYield(s)!.laps).toBe(0);
    expect(claimIdle(s)).toBeNull();
    expect(s.idlePending).not.toBeNull();
  });
  it('덜 돈 까닭 = 실제로 걸린 상태만, 없거나 아주 작으면 줄 없음', () => {
    const full = { collapsed: false, dead: false, hunger: 0, weakened: false };
    expect(idleShortfall({ hours: 1, activeHours: 0.9 }, full)).toBeNull(); // 배부른데 '배고프거나' 라던 것
    expect(idleShortfall({ hours: 1, activeHours: 0.98 }, { ...full, hunger: 100 })).toBeNull(); // 5% 미만 차이
    expect(idleShortfall({ hours: 1, activeHours: 0.5 }, { ...full, hunger: 100 })).toBe('덜 돌았다 — 배가 고파 멈췄다');
    expect(idleShortfall({ hours: 1, activeHours: 0.5 }, { ...full, weakened: true })).toBe('덜 돌았다 — 쇠약이라 절반만 돌았다');
    expect(idleShortfall({ hours: 1, activeHours: 0 }, { ...full, collapsed: true })).toBe('빈사라 자동 모험을 하지 못했다');
    expect(idleShortfall({ hours: 1, activeHours: 1 }, { ...full, hunger: 100 })).toBeNull();
  });
  it("[받기] 뒤 '받았다' 두 번째 창 없음 — 공용 알림 한 줄", () => {
    const iv = read('src/ui/idleView.ts');
    const fn = iv.slice(iv.indexOf('function showClaimed'), iv.indexOf('/** 복귀 창'));
    expect(fn).toContain('showToast(');
    expect(fn).not.toContain('confirmDialog(');
  });
});

describe('222장 5 수련장 잠김 안내', () => {
  it("튜토리얼 끝 문구 = 지금 열리는 훈련 인형 + 수련 여는 단계 ('수련장에서 단련' 삭제)", () => {
    const g = read('src/data/help/guides.json');
    expect(g).not.toContain('수련장에서 단련');
    expect(g).toContain('{room.props.altar}의 훈련 인형으로 손을 풀며');
    expect(g).toContain('{training.title}은(는) {tier4}이(가) 되면 열린다.');
  });
  it('월드맵 수련장: 4단계 전이면 자물쇠(들어갈 수는 있다) + 누르면 여는 조건 알림', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain('partLocks: s.evolution.tierIndex < BALANCE.provisional.liberation.minTierIndex && !s.nest.dead ? { training: trainingLockedText(faction) } : undefined,');
    const wm = read('src/ui/worldMapView.ts');
    expect(wm).toContain('if (part !== undefined) hd.onPartLocked?.(p);');
    expect(trainingLockedText(getFaction('hollow'))).toBe('바스트로데가 되면 본능 수련이 열린다.');
  });
});
