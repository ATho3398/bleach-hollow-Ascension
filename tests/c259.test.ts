// C.259 (GDD 176장 코딩188 · 177장): 기기 버튼 조작·초점 + 방 위 빈사 띠 삭제
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ScreenStack } from '../src/ui/bha/select';
import { registerCancelHook, runCancelHooks } from '../src/ui/bha/shortcuts';

const read = (p: string) => readFileSync(p, 'utf8');

describe('176장 8 뒤로 돌아오면 들어갔던 칸 (화면 스택 기억)', () => {
  it('push 때 아래 화면의 초점을 기억하고, back·pop 으로 돌아오면 그리기 전에 돌려준다', () => {
    let cur = 'a-first';
    const log: string[] = [];
    const nav = new ScreenStack({ save: () => cur, restore: (m) => log.push(`restore:${String(m)}`) });
    nav.push({ id: 'home', render: () => log.push('render:home'), home: true });
    cur = 'book';
    nav.push({ id: 'book', render: () => log.push('render:book') });
    cur = 'book-row-3';
    expect(nav.back()).toBe(true);
    expect(log.slice(-2)).toEqual(['restore:book', 'render:home']);
    cur = 'chest';
    nav.push({ id: 'chest', render: () => log.push('render:chest') });
    nav.replace({ id: 'chest2', render: () => log.push('render:chest2') }); // 바꿔 넣어도 아래 화면 기억은 그대로
    expect(nav.pop()).toBe(true);
    expect(log.slice(-2)).toEqual(['restore:chest', 'render:home']);
  });
  it('기억 없이 만든 스택은 예전과 같다', () => {
    const nav = new ScreenStack();
    let n = 0;
    nav.push({ id: 'home', render: () => n++ });
    nav.push({ id: 'x', render: () => n++ });
    expect(nav.back()).toBe(true);
    expect(n).toBe(3);
  });
  it('기기: 창(레이어)이 닫히면 연 칸으로, 화면 스택은 app 에서 기기 기억을 쓴다', () => {
    const dev = read('src/ui/bha/device.ts');
    expect(dev).toContain('ret: markOf(items.map((i) => i.el), index)');
    expect(dev).toContain('if (entry.ret && i === layers.length) pending =');
    expect(read('src/ui/app.ts')).toContain('new ScreenStack({ save: () => dev.focusMark(), restore: (m) => dev.restoreFocus(m) })');
  });
});

describe('176장 10 다마고치: 뒤로 = 끄기(다른 고리가 아무것도 안 닫았을 때만)', () => {
  it('last 고리는 앞 고리가 쓴 뒤로에서는 안 불린다', () => {
    const calls: string[] = [];
    let trayOpen = true;
    const a = registerCancelHook(() => { if (!trayOpen) return false; trayOpen = false; calls.push('tray'); return true; }, { button: true });
    const b = registerCancelHook(() => { calls.push('tama'); return true; }, { button: true, last: true });
    expect(runCancelHooks(null, true)).toBe(true);
    expect(calls).toEqual(['tray']);
    expect(runCancelHooks(null, true)).toBe(true);
    expect(calls).toEqual(['tray', 'tama']);
    a();
    b();
  });
  it('조작 줄을 기기 항목에 붙이고, 메뉴 [다마고치] 는 토글', () => {
    const t = read('src/ui/bha/tamago.ts');
    expect(t).toContain('dev.setExtraItems([flipBtn, designBtn, zoomBtn])');
    expect(t).toContain('dev.setExtraItems(null)');
    expect(t).toMatch(/registerCancelHook\(\(top\) => \{\s*if \(!on \|\| top\) return false;\s*toggle\(false\);/);
    expect(read('src/ui/app.ts')).toContain('onTamago: () => tama.toggle(),');
  });
});

describe('176장 1·2·4·5·7·14', () => {
  it('1 펼침 목록·고르기 목록·ⓘ: 기기 버튼은 바깥 누름이 아니다', () => {
    for (const f of ['viewtitle', 'pickList']) expect(read(`src/ui/bha/${f}.ts`)).toContain('isDeviceButtonPress(e.target)');
    expect(read('src/ui/bha/infoTip.ts')).toContain('isDeviceButtonPress(t)');
    expect(read('src/ui/bha/overlayHost.ts')).toContain("DEVICE_BUTTON_SELECTOR = '.bha-dev__btn, .bha-tama__hit'");
  });
  it('2·4 visibility: hidden 은 고르지 않고, 바퀴 끝 창 첫 초점 = [귀환]', () => {
    expect(read('src/ui/bha/device.ts')).toContain("getComputedStyle(e).visibility === 'hidden'");
    const ex = read('src/ui/expeditionView.ts');
    expect(ex).toContain("ret.dataset.devStart = 'nest-choice';");
    expect(ex).toContain("setAttribute('data-dev-start', 'event')");
  });
  it('4 돌보기 → 누른 버튼에 초점 (독이 초점 자리를 알린다)', () => {
    const d = read('src/ui/bha/dock.ts');
    expect(d).toContain('setPanel(CLOSED, b); // 누른 돌보기 버튼에 초점 그대로');
    expect(read('src/ui/roomView.ts')).toContain('onItemsChange: (focus) => registerItems(focus),');
  });
  it('5 탄생 연출 끝 → 홈 안내까지 입력 막기', () => {
    expect(read('src/ui/bha/overlayHost.ts')).toContain('export function blockInput(maxMs = 4000)');
  });
  it('7 스크롤 칸 마지막 초점 칸 아래 글은 ▼ = 스크롤', () => {
    expect(read('src/ui/bha/device.ts')).toContain('if (box && leaves && scrollLeft(box, dir) > SCROLL_SLACK)');
  });
  it('14 카드 고르면 첫 빈 칸, 놓으면 다음 카드', () => {
    const r = read('src/ui/bha/road.ts');
    expect(r).toContain("if (selected) gotoEl(cells.find((c) => c.classList.contains('is-can')) ?? null);");
    expect(r).toContain("gotoEl(chips.find((c) => c.dataset.tile === placed) ?? chips[0] ?? null);");
  });
});

describe('176장 빈사 칩 · 177장 방 위 띠 삭제', () => {
  const room = read('src/ui/roomView.ts');
  it('방 위 빈사·사망 안내 띠 없음, 사망 [부활] 은 장면 안', () => {
    expect(room).not.toContain("hud.append(box, shopBtn, chestBtn)");
    expect(room).not.toContain("notice('danger'");
    expect(room).toContain("reviveBtn.classList.add('bha-room__revive')");
    expect(room).toContain('if (reviveBtn) body.append(reviveBtn);');
  });
  it('빈사 남은 시간·푸는 법 = 칩 ⓘ', () => {
    expect(room).toContain('statusInfoButton(() => statusChips(n, faction), faction, n)'); // C.318: 공용 부품 statusBox
    expect(read('src/ui/bha/statusBox.ts')).toContain('lines: [`남은 시간 ${dyingClock(dyingLeftMs(nest, Date.now()) ?? 0)}`, CARE_STATUS_HINTS.collapsed]');
  });
  it('빈사·쓰러짐 자세에서 머리 위 자리가 없으면 칩을 옆 위로', () => {
    expect(room).toContain("chipRow.classList.add('is-side'"); // C.284 (GDD 183장 화면 A, v2 S01~S05): 칩 줄 한 묶음
    expect(read('src/ui/bha/room.css')).toContain('.bha-room__chips.is-side {');
  });
});
