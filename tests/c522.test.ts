// C.522 점검D(2026-11-23) 화면·문구 고침: 상태 설명창 갱신·닫기(TOP 2) · '일반 공격' 용어(TOP 3) · 펼친 줄 이름표(TOP 4)
// · 로그인 창 게스트/로그인 없이 차이(TOP 6) · 세이브 거절 이유(TOP 7) · 각본 7/8 승급 문구(TOP 8) · 튜토리얼 카드 ✓ 진입 보호(확인 필요 ④)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastLoadSaveError, loadSave, migrateSave, newSaveData, saveRejectReason, writeSave } from '../src/game';
import { GATE_TEXT } from '../src/ui/cloudView';
import { STATUS_MARK_DEFS } from '../src/engine/combat/statusMarks';
import { SCRIPT_SCENES } from '../src/data/help';
import { FACTIONS } from '../src/data/factions';

const read = (p: string) => readFileSync(p, 'utf8');
const walk = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p, ext) : ext.test(n) ? [p] : [];
  });
const BANNED = /평타|기본 공격/;

describe('TOP 3 화면 글자에 금지 용어 없음 (GDD 14절 "일반 공격")', () => {
  it('src 의 .ts 문자열(주석 뺌)에 평타·기본 공격이 없다', () => {
    const hits: string[] = [];
    for (const f of walk('src', /\.ts$/)) {
      read(f).split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        const code = line.replace(/\/\/.*$/, '');
        // 따옴표·백틱 안 글자만 본다
        for (const m of code.matchAll(/(['"`])((?:(?!\1).)*)\1/g)) if (BANNED.test(m[2]!)) hits.push(`${f}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });
  it('데이터 JSON 값(_comment 뺌)에 평타·기본 공격이 없다', () => {
    const hits: string[] = [];
    const visit = (v: unknown, at: string): void => {
      if (typeof v === 'string') {
        if (BANNED.test(v)) hits.push(at);
      } else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${at}[${i}]`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!k.startsWith('_comment')) visit(x, `${at}.${k}`);
    };
    for (const f of walk('src/data', /\.json$/)) visit(JSON.parse(read(f)), f);
    expect(hits).toEqual([]);
  });
  it('수련장 적 설정 창·입구·상태 네모 = 일반 공격', () => {
    const arena = read('src/ui/testModeArena.ts');
    expect(arena).toContain("cell('체력 (일반 공격 n회)', hp);");
    expect(arena).toContain("cell('공격력 (일반 공격 n회분)', atk);");
    expect(arena).toContain("'체력 (일반 공격 n회)', '0.1'"); // 글자와 읽기 이름이 같다
    // 옛 값: expect(read('src/ui/practiceView.ts')).toContain('체력·공격력 = 내 일반 공격 n회 분량') — 옛 입구 규칙 줄. C.542: 입구 화면이 수련장 목록으로 바뀌어 그 줄이 없다
    expect(read('src/ui/practiceView.ts')).not.toContain('일반 공격 n회 분량');
    expect(read('src/ui/battleView.ts')).toContain('자세 무너짐! 일반 공격 취소');
    expect(STATUS_MARK_DEFS.basicBuff.name).toBe('일반 공격 강화');
    expect(STATUS_MARK_DEFS.haste.name).toBe('일반 공격 빨라짐');
  });
});

describe('TOP 2 상태 설명창: 열린 채 옛 값·튜토리얼 카드와 겹침', () => {
  const tip = read('src/ui/bha/infoTip.ts');
  it('열린 동안 주기적으로: ⓘ 가 화면에서 빠지면 닫고, 내용이 바뀌면 지금 값으로 다시 쓴다', () => {
    expect(tip).toContain('export const INFO_TIP_SYNC_MS = 250;');
    expect(tip).toContain('syncTimer = window.setInterval(() => syncOpen(), INFO_TIP_SYNC_MS);');
    expect(tip).toMatch(/if \(!b\.isConnected\) \{\s*close\(\);/);
    expect(tip).toContain('if (text === shownText) return;');
    expect(tip).toMatch(/function close\(\): void \{\s*if \(!pop\) return;\s*window\.clearInterval\(syncTimer\);/);
  });
  it('튜토리얼 카드를 그릴 때 열린 설명창을 닫는다', () => {
    expect(tip).toContain('export function closeInfoTips(): void {');
    const tut = read('src/ui/tutorialOverlay.ts');
    expect(tut).toMatch(/if \(covered\) return;[^\n]*\n\s*closeInfoTips\(\);/);
  });
});

describe('TOP 4 펼친 먹이·소모품 줄 뒤 이름표', () => {
  it('줄과 겹치는 방 물건 이름표는 펼친 동안 숨긴다(토큰·새 색 없음)', () => {
    const dock = read('src/ui/bha/dock.ts');
    expect(dock).toContain('requestAnimationFrame(syncTagsUnderTray);');
    expect(dock).toContain("tag.classList.toggle('is-under-tray', under);");
    expect(read('src/ui/bha/room.css')).toContain('.bha-prop__tag.is-under-tray { visibility: hidden; }');
  });
});

describe('TOP 6 첫 로그인 창 게스트 / 로그인 없이 차이 (GDD 16-4)', () => {
  it('본문 아래 한 줄: 게스트 = 클라우드에도, 로그인 없이 = 이 기기에만', () => {
    expect(GATE_TEXT.choices).toContain(`${GATE_TEXT.guest} = 계정 없이 클라우드에도 저장`);
    expect(GATE_TEXT.choices).toContain(`${GATE_TEXT.offline} = 이 기기에만 저장`);
    expect(read('src/ui/cloudView.ts')).toContain("el('p', 'bha-modal__body', GATE_TEXT.choices)");
  });
});

describe('TOP 7 값 검사에서 거절된 세이브 이유', () => {
  afterEach(() => vi.restoreAllMocks());
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  const broken = (edit: (j: Record<string, any>) => void) => {
    const j = JSON.parse(JSON.stringify(newSaveData('hollow', 1)));
    edit(j);
    return j;
  };
  it('슬롯에 모르는 블록 id · 보유에 모르는 id · 능력치 숫자 아님 · 단계 범위 밖 → 그 까닭', () => {
    const slot = broken((j) => { j.build.slots[0] = 'no-such-block'; });
    expect(migrateSave(JSON.parse(JSON.stringify(slot)))).toBeNull();
    expect(saveRejectReason(slot)).toBe('값 검사 실패: 슬롯에 보유하지 않은(모르는) 블록 id(no-such-block)');
    const owned = broken((j) => { j.build.owned.push('zzz-block'); });
    expect(saveRejectReason(owned)).toBe('값 검사 실패: 보유 블록에 모르는 블록 id(zzz-block)');
    const stat = broken((j) => { j.evolution.ev.hp = 'x'; });
    expect(saveRejectReason(stat)).toBe('값 검사 실패: 능력치 hp 값이 숫자가 아니다(x)');
    const tier = broken((j) => { j.evolution.tierIndex = 99; });
    expect(saveRejectReason(tier)).toBe('값 검사 실패: 단계 번호가 범위 밖이다(99)');
  });
  it('정상 세이브는 그대로 열린다 (검사 함수 바꿈 회귀)', () => {
    const s = newSaveData('shinigami', 1);
    expect(migrateSave(JSON.parse(JSON.stringify(s)))?.factionId).toBe('shinigami');
  });
  it('loadSave 시작 화면 안내·console 경고에도 같은 까닭', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const st = mem();
    writeSave(st, newSaveData('hollow', 1), 's');
    const j = JSON.parse(st.getItem('s')!);
    j.build.slots[0] = 'no-such-block';
    st.setItem('s', JSON.stringify(j));
    expect(loadSave(st, 's')).toBeNull();
    expect(lastLoadSaveError()).toBe('값 검사 실패: 슬롯에 보유하지 않은(모르는) 블록 id(no-such-block)');
    expect(String(warn.mock.calls[0]?.[0])).toContain('no-such-block');
  });
});

describe('TOP 8 각본 7/8 해방 설명 = 4단계 뒤 승급(종족 설정 이름)', () => {
  it('{ascName}(아란칼화 / 참백도 구상화)을 마쳐 {libFullName}', () => {
    const body = SCRIPT_SCENES['lib-explain']!.body;
    expect(body).toContain('4단계 뒤 {ascName}까지 마쳐 {libFullName}이(가) 되면');
    expect(body).not.toContain('진화가 끝나');
    expect(read('src/ui/battleView.ts')).toContain('ascName: bf.ascension.name');
    for (const f of FACTIONS) expect(f.ascension.name.length).toBeGreaterThan(0);
  });
  it('주석 표기 혈·독·허무 (TOP 10)', () => {
    expect(read('src/engine/absorb/offer.ts')).toContain('특수 속성(혈·독·허무)');
  });
});

describe('확인 필요 ④ 튜토리얼 카드 [다음] 기기 ✓ 진입 보호', () => {
  it('카드가 뜨면 [다음]에 보호 시각, 기기 ✓ 는 그 전이면 받지 않고 다시 늘린다', () => {
    const tut = read('src/ui/tutorialOverlay.ts');
    expect(tut).toContain('export const TUT_CONFIRM_HOLD_MS = 300;');
    expect(tut).toContain('next.dataset.devHoldUntil = String(performance.now() + TUT_CONFIRM_HOLD_MS);');
    const dev = read('src/ui/bha/device.ts');
    expect(dev).toContain('export const DEV_CONFIRM_HOLD_EXTEND_MS = 300;');
    expect(dev).toMatch(/if \(now < hold\) \{\s*cur\.el\.dataset\.devHoldUntil = String\(now \+ DEV_CONFIRM_HOLD_EXTEND_MS\);\s*return;/);
  });
});

describe('ui-audit 새 게임 = 종족 확인 [네] → 이름·성별 → [시작]', () => {
  it('audit.cjs newGame · 슬롯 지우기가 passIdentity(screens.cjs) 를 거친다 · 확인 창 [아니요] · 수련장 = 방 물건', () => {
    const a = read('scripts/ui-audit/audit.cjs');
    expect(a).toContain('await passIdentity(page);');
    const sc = read('scripts/ui-audit/screens.cjs');
    expect(sc).toContain(".locator('.bha-lcd [data-ident=\"name\"]')");
    expect(sc).toContain('await passIdentity(h.page);');
    expect(sc).toContain("h.btn('아니요', { within: '.bha-lcd [data-dev-layer]', exact: true })");
    expect(sc).toContain("await h.click('.bha-prop--altar', { ms: 2000 });");
    expect(sc).not.toContain("h.click('.bha-worldmap [data-place=\"training\"]'");
  });
});
