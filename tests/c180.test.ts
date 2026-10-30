// C.180 묶음 수정 (GDD 109장 1·3·4·5·8·9번): 장비 칸 선택 유지 · 교감 = 상태 수치 한 줄 · 장비 → 가방 첫 탭 · 튜토리얼 알림 가운데 · 가로 키보드·가로 시작
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACTIONS, getFaction } from '../src/data/factions';
import { statusChips } from '../src/ui/bha/roomLogic';
import { roomOf } from '../src/engine/faction';
import { wantsLandscapeLock } from '../src/ui/bha/orientation';
import { bagGroupOf } from '../src/ui/lcdScreens';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('1 장비 칸: 누른 칸이 골라진 채로 다시 그린다', () => {
  it('빈 칸·상세 창 뒤 다시 그릴 때 그 칸·카드에 초점을 돌려준다 (기기 선택이 첫 칸 무기로 돌아가던 문제)', () => {
    const v = read('src/ui/equipView.ts');
    expect(v).toMatch(/redraw\(`slot:\$\{s\}`\)/);
    expect(v).toMatch(/redraw\('slot:battle'\)/);
    expect(v).toMatch(/openGear\(faction, save, it\.uid, changedAt\(`slot:\$\{s\}`\)\)/);
    expect(v).toMatch(/at\?\.focus\(\{ preventScroll: true \}\)/);
    // 기기는 새 화면에서 초점 있는 항목을 고른다
    expect(read('src/ui/bha/device.ts')).toMatch(/next\.findIndex\(\(i\) => i\.el === document\.activeElement\)/);
  });
});

describe('3 교감: 상태 수치 목록 안 한 줄', () => {
  it('상태 화면: statusBlock 에 교감 막대, 따로 떨어진 교감 줄 없음', () => {
    const lcd = read('src/ui/lcdScreens.ts');
    expect(lcd).toMatch(/bond: \{\s*value: n\.bond, max: BALANCE\.provisional\.nest\.bond\.max/);
    expect(lcd).not.toMatch(/bha-nest__bond/);
    expect(read('src/ui/bha/nest.ts')).toMatch(/meter\(\{ kind: 'bond', label: '교감'/);
    expect(read('src/ui/bha/components/components.css')).toMatch(/\.bha-meter--bond/);
  });
  it('방 (109장 수정 v5.243): 배부름·컨디션·영압 안정도·광기 4줄, 교감 없음', () => {
    const chips = statusChips({ hunger: 30, condition: 70, risk: 5, weakened: false, stability: 64, bond: 50 } as Parameters<typeof statusChips>[0], getFaction('shinigami'));
    expect(chips.map((c) => c.kind)).toEqual(['hunger', 'cond', 'stab', 'risk']);
    expect(chips[2]).toMatchObject({ label: getFaction('shinigami').stabilityName, value: 64 });
  });
});

describe('4 장비 → 가방', () => {
  it('두 종족 모두 보관함 이름 = 가방', () => {
    for (const f of FACTIONS) expect(roomOf(f).props.chest).toBe('가방');
  });
  it('가방 탭 = 장비 · 슬롯 · 타일 · 물건 · 펫 (장비 첫 탭), 물건 분류에 장비 없음', () => {
    const lcd = read('src/ui/lcdScreens.ts');
    expect(lcd).toMatch(/\{ id: 'gear', label: equipTitle\(faction\)[^\n]*\{ id: 'slots'[^\n]*\{ id: 'tiles'[^\n]*\{ id: 'items'[^\n]*\{ id: 'skin'[^\n]*\{ id: 'pet'/);
    expect(lcd).toMatch(/tab: 'gear', traits/);
    expect(bagGroupOf({ id: 'g1', category: 'equipment' })).toBeNull(); // C.239: 소모품 탭에 장비 없음
  });
  it('방 [가방] 버튼은 종족 설정 이름, 화면 문구에 보관함 없음', () => {
    expect(read('src/ui/roomView.ts')).toMatch(/label: room\.props\.chest/);
    for (const p of ['src/shop.ts', 'src/inventory.ts', 'src/data/help/guides.json', 'src/data/help/screens.json']) {
      const code = read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      expect(code.match(/['"`][^'"`\n]*보관함[^'"`\n]*['"`]/g)).toBeNull();
    }
  });
});

describe('5 튜토리얼 달성 알림 (C.196: 가운데 → 맨 위, GDD 119장 6)', () => {
  it('튜토리얼 토스트는 center, CSS 는 맨 위(가운데 위치 규칙 없음)·누르면 닫힘·전투·대사 창 위', () => {
    expect(read('src/ui/tutorialGoalsView.ts')).toMatch(/tutorialGoalText\(g\.goal, faction\)[^\n]*faction, true\)/);
    expect(read('src/ui/bha/nest.ts')).toMatch(/if \(o\.center\) toast\.addEventListener\('click', remove\)/);
    const css = read('src/ui/bha/lcd.css');
    expect(css).toMatch(/\.bha-lcd \.bha-toast--center \{ z-index: var\(--bha-z-tutorial\); pointer-events: auto;/);
    expect(css).not.toMatch(/bha-toast--center[^{]*\{[^}]*top: 50%/);
  });
});

describe('8·9 가로 키보드 · 가로 시작', () => {
  it('매니페스트 orientation = landscape', () => {
    expect(JSON.parse(read('public/manifest.webmanifest')).orientation).toBe('landscape');
  });
  it('가로 고정 시도는 손가락 기기 + 세로일 때만', () => {
    expect(wantsLandscapeLock(null, { coarse: true, portrait: true })).toBe(false);
    expect(wantsLandscapeLock({} as EventTarget, { coarse: false, portrait: true })).toBe(false);
    expect(wantsLandscapeLock({} as EventTarget, { coarse: true, portrait: false })).toBe(false);
    const src = read('src/ui/bha/orientation.ts');
    expect(src).toMatch(/requestFullscreen/);
    expect(src).toMatch(/o\.lock\('landscape'\)/);
    expect(read('src/main.ts')).toMatch(/installLandscapeKeyboard\(\)/);
  });
});

describe('103장 수정 v5.242 소리 막대 끌기', () => {
  it('끌기 값: 가로 = x, 돌린 화면(시계 90도) = y, 밖은 끝값, step 맞춤', async () => {
    const { rangeDragValue } = await import('../src/ui/bha/dom');
    const r = { left: 100, top: 50, width: 200, height: 20 };
    expect(rangeDragValue({ x: 150, y: 0 }, r, false, 0, 100)).toBe(25);
    expect(rangeDragValue({ x: 999, y: 0 }, r, false, 0, 100)).toBe(100);
    expect(rangeDragValue({ x: 0, y: 0 }, r, false, 0, 100)).toBe(0);
    const rr = { left: 10, top: 100, width: 20, height: 400 };
    expect(rangeDragValue({ x: 0, y: 400 }, rr, true, 0, 100)).toBe(75);
    expect(rangeDragValue({ x: 0, y: 161 }, rr, true, 0, 100, 5)).toBe(15);
  });
  it('설정 소리 막대·공용 slider 가 끌기를 쓴다, 터치 기본 끌기·스크롤 판정을 막는다', () => {
    expect(read('src/ui/settingsView.ts')).toMatch(/enableRangeDrag\(input, \(v\) => set\(v, false\), \(v\) => set\(v, true\)\)/);
    const dom = read('src/ui/bha/dom.ts');
    expect(dom).toMatch(/enableRangeDrag\(input, drag, drag\)/);
    expect(dom).toMatch(/touchAction = 'none'/);
    expect(dom).toMatch(/setPointerCapture/);
    expect(dom).toMatch(/addEventListener\('touchstart'[^\n]*passive: false/);
  });
});
