// C.197 (GDD 122장): 기기 버튼 조작 원칙 — 전투 중 ▲▼ 상시 표시, 전투 커서(못 쓰는 대상 건너뜀·✓ = 누름), 뒤로 = 일시정지
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nearestUsable, stepUsable } from '../src/ui/bha/select';

const read = (p: string) => readFileSync(p, 'utf8');

describe('전투 커서 이동 (stepUsable)', () => {
  // 순서 예: [그만두기, 로그, 일시정지, 도움말, 막기(흐림), 소모품(흐림), 장비, 칸1, 칸2, 칸3(빈 칸)]
  const usable = [true, true, true, true, false, false, true, true, true, false];
  it('▼ 는 다음 쓸 수 있는 대상으로, 흐린 버튼은 건너뛴다', () => {
    expect(stepUsable(3, 1, usable)).toBe(6); // 도움말 → (막기·소모품 건너뜀) → 장비
    expect(stepUsable(6, 1, usable)).toBe(7); // 장비 → 첫 블록 칸
  });
  it('끝에서 처음으로 돈다 (빈 칸 건너뜀)', () => {
    expect(stepUsable(8, 1, usable)).toBe(0);
    expect(stepUsable(0, -1, usable)).toBe(8);
  });
  it('▲ 도 건너뛴다', () => {
    expect(stepUsable(6, -1, usable)).toBe(3);
  });
  it('쓸 수 있는 대상이 없으면 -1, 하나뿐이면 그 자리', () => {
    expect(stepUsable(0, 1, [false, false])).toBe(-1);
    expect(stepUsable(1, 1, [false, true, false])).toBe(1);
    expect(stepUsable(0, 1, [])).toBe(-1);
  });
  it('아직 고른 게 없으면 ▼ = 첫 쓸 수 있는 대상', () => {
    expect(stepUsable(-1, 1, [false, true, true])).toBe(1);
  });
});

describe('블록이 사라졌을 때 커서 (nearestUsable)', () => {
  it('같은 자리가 쓸 수 있으면 그대로', () => {
    expect(nearestUsable(2, [true, true, true])).toBe(2);
  });
  it('없으면 가장 가까운 대상 — 같은 거리면 앞(왼쪽)', () => {
    expect(nearestUsable(3, [true, true, true, false])).toBe(2); // 마지막 블록을 써서 칸이 비었다 → 바로 왼쪽 블록
    expect(nearestUsable(1, [true, false, true])).toBe(0);
    expect(nearestUsable(0, [false, false, true])).toBe(2);
  });
  it('하나도 없으면 -1', () => {
    expect(nearestUsable(0, [false, false])).toBe(-1);
  });
});

describe('전투 화면 연결 (GDD 122장 2~4)', () => {
  const dev = read('src/ui/bha/device.ts');
  const bv = read('src/ui/battleView.ts');
  it('▲▼ 를 전투 중에 숨기지 않고, 전투도 항목을 센다', () => {
    expect(dev).not.toContain('touchOnly');
    expect(dev).not.toContain('up.style.visibility');
    expect(dev).toContain('else if (battle) next = scanItems(battleEl!, lcd);');
  });
  it('✓ = 커서 대상 누르기: 블록 칸은 bha-press, 그 밖은 click (일시정지 고정 아님)', () => {
    expect(dev).toContain("cur.el.dispatchEvent(new CustomEvent('bha-press'))");
    expect(dev).not.toContain('data-dev-confirm');
    expect(bv).not.toContain('devConfirm');
    expect(bv).toContain("c.addEventListener('bha-press'");
    expect(bv).toContain('const input = releaseUse(blk.uid, i, s.tray);');
  });
  it('순서 = 머리 버튼 → 막기·소모품·장비·해방 → 블록 칸, 시작 = 첫 블록 칸', () => {
    expect(bv).toContain("for (const b of [guardBtn.root, itemBtn.root, gearBtn.root, libBtn]) b.dataset.devOrder = '1';");
    expect(bv).toContain("c.dataset.devOrder = '2';");
    expect(bv).toContain("if (i === 0) c.dataset.devStart = '';");
  });
  it('빈 칸·잠긴 블록은 건너뛴다 (data-dev-off)', () => {
    expect(bv).toContain("cell.toggleAttribute('data-dev-off', true);");
    expect(bv).toContain("cell.toggleAttribute('data-dev-off', locked);");
  });
  it('해방 버튼은 기기 ✓(포인터가 아닌 누름)로도 해방', () => {
    expect(bv).toContain('if (e.detail === 0 && app.isConnected && !stopped && canLiberate(s) && !halted()) queue.push({ type: \'liberate\' });');
  });
  it('전투 중 뒤로 버튼은 흐리지 않다 (누르면 일시정지)', () => {
    expect(dev).toContain("back.classList.toggle('is-off', layers.length === 0 && !opts.canCancel() && !battle);");
  });
  it('뒤로 = 일시정지 그대로', () => {
    expect(bv).toContain('if (top || paused || overlayOpen || s.status !== \'playing\') return false;\n    setPaused(true);');
  });
  it('튜토리얼 직접 해 보기 중에도 블록을 커서로 고른다', () => {
    expect(read('src/ui/tutorialOverlay.ts')).toContain("layer.toggleAttribute('data-dev-pass', on);");
    expect(dev).toContain("if (pass) next = [...scanItems(battleEl!, lcd), ...scanItems(layer!.el, lcd)];");
  });
  it('ui-audit: 기기 버튼 상시 표시·자리 고정 검사', () => {
    const a = read('scripts/ui-audit/audit.cjs');
    expect(a).toContain("kind: '기기 버튼 숨김'");
    expect(a).toContain("kind: '기기 버튼 자리 바뀜'");
    expect(read('scripts/ui-audit/screens.cjs')).toContain('await h.check(`${n}/커서`);');
  });
});
