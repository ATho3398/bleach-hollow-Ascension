// C.180 묶음 수정 (GDD 109장 1·3·4·5·8·9번): 장비 칸 선택 유지 · 교감 = 상태 수치 한 줄 · 장비 → 가방 첫 탭 · 튜토리얼 알림 가운데 · 가로 키보드·가로 시작
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { roomOf } from '../src/engine/faction';
import { wantsLandscapeLock } from '../src/ui/bha/orientation';

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
  it('방: 머리 위 상태 칩 목록 안에 교감', () => {
    expect(read('src/ui/bha/roomLogic.ts')).toMatch(/kind: 'bond', label: '교감'/);
  });
});

describe('4 장비 → 가방', () => {
  it('두 종족 모두 보관함 이름 = 가방', () => {
    for (const f of FACTIONS) expect(roomOf(f).props.chest).toBe('가방');
  });
  it('가방 탭 = 장비 · 슬롯 · 타일 · 물건 · 펫 (장비 첫 탭), 물건 분류에 장비 없음', () => {
    const lcd = read('src/ui/lcdScreens.ts');
    expect(lcd).toMatch(/\{ id: 'gear', label: equipTitle\(faction\)[^\n]*\{ id: 'slots'[^\n]*\{ id: 'tiles'[^\n]*\{ id: 'items'[^\n]*\{ id: 'pet'/);
    expect(lcd).toMatch(/tab: 'gear', traits/);
    expect(lcd).toMatch(/c !== 'tile' && c !== 'equipment'/);
  });
  it('방 [가방] 버튼은 종족 설정 이름, 화면 문구에 보관함 없음', () => {
    expect(read('src/ui/roomView.ts')).toMatch(/label: room\.props\.chest/);
    for (const p of ['src/shop.ts', 'src/inventory.ts', 'src/data/help/guides.json', 'src/data/help/screens.json']) {
      const code = read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      expect(code.match(/['"`][^'"`\n]*보관함[^'"`\n]*['"`]/g)).toBeNull();
    }
  });
});

describe('5 튜토리얼 달성 알림 = 화면 가운데', () => {
  it('튜토리얼 토스트는 center, CSS 는 가운데·누르면 닫힘·전투·대사 창 위', () => {
    expect(read('src/ui/tutorialGoalsView.ts')).toMatch(/tutorialGoalText\(g\.goal, faction\)[^\n]*faction, true\)/);
    expect(read('src/ui/bha/nest.ts')).toMatch(/if \(o\.center\) toast\.addEventListener\('click', remove\)/);
    const css = read('src/ui/bha/lcd.css');
    expect(css).toMatch(/\.bha-lcd \.bha-toast--center \{ top: 50%; bottom: auto; z-index: var\(--bha-z-tutorial\)/);
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
