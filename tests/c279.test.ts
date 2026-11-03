// GDD 182장 1·2·4 (코딩193): 튜토리얼 가방 창 · 튜토리얼 입력 막기 보정(가르치는 행동은 허용) · 월드맵 장소 그림 윤곽.
// 실제 브라우저(두 종족, 진짜 마우스로 안내대로 끝까지)는 scripts/c279-proof.cjs
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { pressPasses, PRESS_FOLLOW_MS, type PressTrack } from '../src/ui/tutorialOverlay';
import tutorial from '../src/data/help/tutorial.json';

const read = (p: string) => readFileSync(p, 'utf8');
const fresh = (): PressTrack => ({ open: false, until: 0 });

describe('182-2 허용 대상에서 시작한 누름은 끝까지 지나간다', () => {
  it('블록 바처럼 누르는 순간 포인터를 붙잡아 놓기 대상이 바뀌어도(pointerup = 바 전체) 블록이 쓰인다', () => {
    const p = fresh();
    expect(pressPasses(p, 'pointerdown', 0, true)).toBe(true);
    expect(pressPasses(p, 'mousedown', 1, true)).toBe(true);
    expect(pressPasses(p, 'pointermove', 50, false)).toBe(true);
    expect(pressPasses(p, 'pointerup', 120, false)).toBe(true); // 캡처된 놓기
    expect(pressPasses(p, 'mouseup', 121, false)).toBe(true);
    expect(pressPasses(p, 'click', 122, false)).toBe(true);
  });
  it('놓은 뒤 마감이 지나면 다른 곳 누름은 다시 막힌다', () => {
    const p = fresh();
    pressPasses(p, 'pointerdown', 0, true);
    pressPasses(p, 'pointerup', 100, false);
    expect(pressPasses(p, 'click', 100 + PRESS_FOLLOW_MS + 1, false)).toBe(false);
    expect(pressPasses(p, 'pointerup', 2000, false)).toBe(false);
  });
  it('허용 안 된 곳에서 시작한 누름은 처음부터 끝까지 막힌다', () => {
    const p = fresh();
    expect(pressPasses(p, 'pointerdown', 0, false)).toBe(false);
    expect(pressPasses(p, 'mousedown', 1, false)).toBe(false);
    expect(pressPasses(p, 'pointerup', 50, false)).toBe(false);
    expect(pressPasses(p, 'click', 51, false)).toBe(false);
  });
  it('허용 누름 다음의 새 누름은 새로 잰다 (허용 누름이 다른 버튼을 열어 주지 않는다)', () => {
    const p = fresh();
    pressPasses(p, 'pointerdown', 0, true);
    pressPasses(p, 'pointerup', 50, true);
    expect(pressPasses(p, 'pointerdown', 100, false)).toBe(false);
    expect(pressPasses(p, 'click', 150, false)).toBe(false);
  });
  it('가드가 누름 추적을 거쳐 판정한다', () => {
    expect(read('src/ui/tutorialOverlay.ts')).toContain('if (pressPasses(press, e.type, performance.now(), tutorialAllows(g, e.target))) return;');
  });
});

describe('182-2 단계마다 가르치는 행동 = 허용 대상 (두 종족 공통 — 종족 분기 없음)', () => {
  const bv = read('src/ui/battleView.ts');
  it('각본 전투: 막기 안내 = [막기], 블록 안내(블록 1개·체인) = 블록 바 블록 (기기 ▲▼✓ 도 같은 선택자)', () => {
    expect(bv).toContain(`waitFor: pr.wait === 'guard' ? '[data-sc="guard"]' : pr.wait === 'use' ? '[data-sc^="block."]' : undefined`);
    expect(bv).toContain("tray.cells.forEach((c, i) => (c.dataset.sc = `block.${i + 1}`));");
    // 블록 바는 누름을 붙잡는다 → 위 누름 추적이 있어야 놓기가 지나간다
    expect(bv).toContain('tray.root.setPointerCapture(e.pointerId);');
  });
  it('각본 전투 카드: 블록·막기를 기다리는 단계의 구멍 대상이 그 행동 대상이다', () => {
    const sc = (tutorial as unknown as { script: { id: string; targets: string[] }[] }).script;
    expect(sc.find((x) => x.id === 'guard-now')!.targets).toEqual(['battle.guard']);
    expect(sc.find((x) => x.id === 'hurt')!.targets).toEqual(['battle.tray']);
    expect(sc.find((x) => x.id === 'chain-use')!.targets).toEqual(['battle.tray']);
  });
});

describe('182-1 화면 이동을 시키는 안내는 그 화면에 닿으면 넘어간다', () => {
  const app = read('src/ui/app.ts');
  it("'가방을 열어 보자' = 가방이 열리면 [다음] 없이 다음 카드(가방 안 구급상자 옆)", () => {
    expect(app).toContain("act: { selector: '.bha-prop--chest', autoFinish: true, done: () => nav.top?.id === 'chest' },");
  });
  it('첫 모험(월드맵 → 모험)·먹이 주기도 저절로 넘어간다', () => {
    expect(app).toMatch(/act: \{ selector: go, autoFinish: true/);
    expect(app).toMatch(/\.bha-homedock__food\[data-food="\$\{TR\.food\}"\]`, autoFinish: true/);
  });
});

describe('182-4 월드맵 장소 그림 윤곽', () => {
  const tokens = read('src/ui/bha/design-system/tokens.css');
  const wm = read('src/ui/bha/worldmap.css');
  it('그림 모양대로 어두운 외곽선(4방향) + 아래 그림자 — 토큰', () => {
    const val = (name: string) => tokens.slice(tokens.indexOf(`${name}:`) + name.length + 1, tokens.indexOf(';', tokens.indexOf(`${name}:`)));
    const ring = val('--bha-art-ring');
    expect(ring.match(/drop-shadow\(/g)!.length).toBe(4);
    for (const d of ['1px 0 0', '-1px 0 0', '0 1px 0', '0 -1px 0']) expect(ring).toContain(`drop-shadow(${d} var(--bha-art-edge))`);
    const def = val('--bha-art-outline');
    expect(def).toContain('var(--bha-art-ring) var(--bha-art-ring)'); // 2px
    expect(def).toContain('var(--bha-art-drop)');
    expect(def).not.toMatch(/box-shadow|blur\(/);
  });
  it('그림(img)에 걸어 초점 강조(그림 칸의 밝은 윤곽)와 겹치지 않는다', () => {
    expect(wm).toContain('.bha-worldmap .bha-prop__shape.has-art > .bha-prop__img { filter: var(--bha-art-outline); }');
    expect(read('src/ui/bha/room.css')).toContain('.bha-art:focus-visible .bha-art-img, .bha-art.bha-sel .bha-art-img {');
  });
});
