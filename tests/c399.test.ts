// C.399 (GDD 241-A): 처음 화면·새로 시작·설정 8건
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { V2_ICON } from '../src/ui/bha/iconMap';
import { idleYield } from '../src/engine/idle';
import { accrueIdle, idleClaimable, newSaveData } from '../src/game';
import { BALANCE } from '../src/config/balance';

const read = (p: string) => readFileSync(p, 'utf8');

describe('241-A 처음 화면·새로 시작·설정', () => {
  it('1 처음 화면 버튼 = 이어하기 · 불러오기 · 새로 시작 순', () => {
    const s = read('src/ui/startView.ts');
    expect(s.indexOf("label: '불러오기'")).toBeLessThan(s.indexOf("label: '새로 시작', icon: 'i-play', onClick: h.onNew"));
    expect(s.indexOf("label: '이어하기'")).toBeLessThan(s.indexOf("label: '불러오기'"));
  });
  it('2 종족 칸 = 아이콘·이름만, 확인 = "○○(으)로 시작하시겠습니까?" 네/아니요만', () => {
    expect(read('src/ui/startView.ts')).not.toContain("'bha-species__tagline'");
    const app = read('src/ui/app.ts');
    expect(app).toContain("title: fixParticles(`${f.name}(으)로 시작하시겠습니까?`)");
    expect(app).toContain("yes: '네', no: '아니요',");
    expect(app).not.toContain('f.pickNote');
  });
  it('3 이름 아래 성별 버튼 한 화면 · 외형 안내 문구 없음', () => {
    const v = read('src/ui/identityView.ts');
    expect(v).toContain('body.append(row, msg, list,');
    expect(v).not.toContain('export function genderScreen');
    expect(read('src/ui/app.ts')).not.toContain('genderLookNote');
  });
  it('4 슬롯 [삭제] = 기본 모양, 확인 창에 "삭제" 를 쳐야 [확인]', () => {
    expect(read('src/ui/slotView.ts')).toMatch(/label: '삭제', icon: 'i-close', disabled:/);
    const app = read('src/ui/app.ts');
    expect(app).toContain("title: '정말 삭제하시겠습니까?'");
    expect(app).toContain("typeToConfirm: { word: '삭제', hint: '삭제하려면 삭제 를 입력하세요' }");
    expect(read('src/ui/confirmDialog.ts')).toContain("const matched = (): boolean => !typed || typed.value.trim() === o.typeToConfirm?.word;");
  });
  it('5 대기 보상 = 초시계, 설정 = 옛 톱니 (v2 매핑·선물상자 롤백)', () => {
    expect(V2_ICON['i-timer']).toBeUndefined();
    expect(V2_ICON['i-settings']).toBeUndefined();
    expect(read('src/ui/bha/dock.ts')).not.toContain("v2Icon('gift')");
    expect(read('src/ui/bha/sprite.svg')).toContain('<symbol id="i-timer"');
  });
  it('6 설정 본문은 바깥 열 하나만 스크롤, 띠는 스크롤 칸 밖', () => {
    const css = read('src/ui/bha/screens-lcd.css');
    expect(css).not.toMatch(/\.bha-settings__grid \{[^}]*overflow-y: auto/);
    expect(read('src/ui/settingsView.ts')).toContain('(scroller.parentElement ?? scroller).append(more);');
  });
  it('7 한 바퀴도 못 돌면 받을 수 있다 아님, 빈 시간이 상한을 막지 않음', () => {
    const s = newSaveData('hollow', 1);
    s.idlePending = { from: 0, hours: 0.2, activeHours: 0.2 }; // 0.8바퀴
    expect(idleClaimable(s)).toBe(false);
    s.idlePending = { from: 0, hours: 0.25, activeHours: 0.25 }; // 1바퀴
    expect(idleClaimable(s)).toBe(true);
    // 1분씩 15번 더한 시간도 1바퀴 (부동소수 오차)
    let h = 0;
    for (let i = 0; i < 15; i++) h += 1 / 60;
    expect(idleYield(h).laps).toBe(1);
    // 빈사로 24시간 쌓인 빈 시간 → 다음엔 새 시간이 들어간다
    const IX = BALANCE.provisional.idle;
    const t = newSaveData('hollow', 1);
    t.runLog.runs.push({} as never);
    t.idlePending = { from: 0, hours: IX.maxHours, activeHours: 0 };
    t.lastSeenAt = 0;
    t.nest.hunger = 0;
    t.nest.weakened = false;
    t.nest.collapsed = false;
    accrueIdle(t, 2 * 3_600_000, true);
    expect(t.idlePending!.hours).toBe(IX.maxHours);
    expect(t.idlePending!.activeHours).toBeCloseTo(2);
    expect(idleClaimable(t)).toBe(true);
  });
  it('8 알림 띠 들어오기 = 매끄러운 감속 (steps(3) 아님)', () => {
    const css = read('src/ui/bha/components/components.css');
    expect(css).toContain('.bha-toast.is-in { animation: bha-toast-in var(--bha-dur-4) var(--bha-ease-out) both; }');
  });
});
