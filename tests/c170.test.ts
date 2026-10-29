// C.170 (사용자 "적 그림이랑 이미지는 빼고, 나머지 진행", GDD 100장): UI/UX 점검 바깥 화면 — 시작·종족·방·독·대기 보상·원정 출발·걷기·일시정지·설정·도움말·알림 띠·확인 창
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FACTIONS } from '../src/data/factions';
import { idleProgress, idleRuleText } from '../src/ui/idleView';
import { BALANCE } from '../src/config/balance';
import { NEST_ACTIONS } from '../src/engine/faction';

const read = (p: string) => readFileSync(p, 'utf8');
const IX = BALANCE.provisional.idle;

describe('C.170 확인 창·시작·종족', () => {
  it('확인 창 기본 선택 = 주 버튼 (위험한 확인은 아니오에서 시작)', () => {
    const c = read('src/ui/confirmDialog.ts');
    expect(c).toContain('if (!o.danger && !yesBtn.disabled) yesBtn.focus({ preventScroll: true });');
  });
  it('세이브가 없으면 이어하기를 숨기고, 첫 화면 버전은 이름만', () => {
    const s = read('src/ui/startView.ts');
    expect(s).toContain("if (last !== null) menu.append(button({ label: '이어하기'");
    expect(s).toContain('`v ${PATCH_LABEL}`');
    expect(read('src/ui/settingsView.ts')).toContain('versionLabel()');
  });
  it('종족마다 한 줄 소개와 독 짧은 이름이 설정 파일에 있다 (종족 분기 없음)', () => {
    for (const f of FACTIONS) {
      expect(f.tagline?.length ?? 0).toBeGreaterThan(0);
      for (const a of NEST_ACTIONS) expect((f.nestActionsShort?.[a] ?? f.nestActions[a]).length).toBeLessThanOrEqual(5);
    }
  });
});

describe('C.170 방·독', () => {
  const room = read('src/ui/roomView.ts');
  it('방 위 이름+트랙 줄 삭제 → 트랙 전환은 더보기 칸 "○○ 트랙", 이름은 상태 칩 위', () => {
    expect(room).not.toContain("sw.dataset.sc = 'track-switch'");
    expect(room).toContain('label: `${getFaction(t.factionId).name} 트랙`');
    expect(room).toContain('statusBtn.prepend(nameTag)');
  });
  it('방 첫 선택 = 모험(돌봄 요청 중이면 그 버튼)', () => {
    expect(room).toContain("const firstPick = n.careRequest ? dock.items().find((b) => b.dataset.care === n.careRequest!.action) : props.get('door');");
  });
  it('더보기 4열, 닫기 칸은 C.198 에 삭제(GDD 124장 2), 튜토리얼 칸은 도움말 [목표]로', () => {
    expect(read('src/ui/bha/room.css')).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(read('src/ui/bha/dock.ts')).not.toContain("x.dataset.dock = 'close';");
    expect(room).not.toContain("label: '튜토리얼'");
    expect(read('src/ui/helpView.ts')).toContain("label: '목표'");
  });
  it('알림 띠: LCD 맨 위 가운데 (C.193 GDD 119장 6 으로 아래 → 위), 3개까지 쌓임', () => {
    expect(read('src/ui/bha/lcd.css')).toContain('.bha-lcd .bha-toast { top: var(--bha-sp-1); bottom: auto; }');
    expect(read('src/ui/bha/nest.ts')).toContain('const TOAST_VISIBLE = 3;');
  });
});

describe('C.170 대기 보상 진행 막대', () => {
  it('받기 전: 쌓인 분 / 최소 분, 받을 수 있으면 최대 시간 기준', () => {
    const few = idleProgress({ idlePending: { hours: 3 / 60, activeHours: 3 / 60 } as never });
    expect(few.minutes).toBe(3);
    expect(few.max).toBe(IX.minMinutes);
    expect(few.text).toContain(`${IX.minMinutes}분부터 받기`);
    const none = idleProgress({ idlePending: null });
    expect(none.minutes).toBe(0);
    expect(idleRuleText()).not.toContain('\n');
  });
});

describe('C.170 원정 출발·걷기·일시정지·설정', () => {
  it('출발 화면: 페이지 스크롤 없음, [출발] 아래 고정 띠, 잠김이면 바둑판 없이 한 줄', () => {
    const css = read('src/ui/bha/expedition.css');
    expect(css).toMatch(/\.bha-lcd \.bha-app\.bha-plan \{[^}]*overflow: hidden auto;/); // C.176: 세로 스크롤 (GDD 104장 9)
    expect(css).toContain('.bha-lcd .bha-plan > .bha-plan__go { grid-column: 1 / -1; grid-row: 10; position: sticky; bottom: 0;');
    const pv = read('src/ui/planView.ts');
    expect(pv).toContain('const planner = h.tilesLocked ? null : roadPlanner(');
    expect(pv).toContain("'타일 고르기 → 빈 칸 누르기 · 놓은 칸 '");
  });
  it('걷기 화면 위 가운데 길 칸 줄은 C.176 에 삭제 (GDD 104장 3)', () => {
    expect(read('src/ui/expeditionView.ts')).not.toContain('bha-exp__strip');
    expect(read('src/ui/bha/expedition.css')).not.toContain('bha-exp__strip');
  });
  it('전투 일시정지: 기기 레이어로 등록(뒤로·Esc = 계속), [설정]은 전투를 지우지 않는 레이어', () => {
    const b = read('src/ui/battleView.ts');
    expect(b).toContain('const off = registerLayer(ov, () => setPaused(false));');
    expect(b).toContain('settingsOverlay(() => (overlayOpen = false));');
    expect(b).not.toContain("row.append(button({ label: '도움말', icon: 'i-help', onClick: openHelp }));");
  });
  it('설정 켬/끔 = 스위치 줄(켬 초록), 곡 줄은 목록에 포함 토글', () => {
    const s = read('src/ui/settingsView.ts');
    expect(s).toContain("b.setAttribute('role', 'switch');");
    expect(s).not.toContain('`제외 ${ex');
    expect(read('src/ui/bha/screens-lcd.css')).toContain('.bha-switch.is-checked .bha-switch__track { background: var(--bha-good);');
  });
});
