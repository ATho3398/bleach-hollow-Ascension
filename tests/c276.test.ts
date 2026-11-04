// C.276 (GDD 180장 1): 튜토리얼 안내가 떠 있는 동안 지시한 버튼(구멍 대상)만 눌린다 — 화면 터치·기기 버튼 둘 다. 실제 브라우저 검증은 scripts/c276-proof.cjs
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const tut = read('src/ui/tutorialOverlay.ts');
const dev = read('src/ui/bha/device.ts');
const app = read('src/ui/app.ts');
const css = read('src/ui/bha/screens-lcd.css');

describe('180-1 화면 터치: 안내 창·지금 대상만', () => {
  it('진짜 누름(isTrusted)을 문서 맨 앞(capture)에서 거른다 — 기기 버튼·안내 창·지금 대상(data-dev-only)만 지나간다', () => {
    expect(tut).toContain("const GUARDED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick', 'contextmenu'] as const;");
    expect(tut).toContain('if (!g || !e.isTrusted) return;');
    expect(tut).toContain('if (pressPasses(press, e.type, performance.now(), tutorialAllows(g, e.target))) return;'); // C.279: 허용된 곳에서 시작한 누름은 끝까지 (GDD 182장 2)
    expect(tut).toContain('e.stopImmediatePropagation();');
    expect(tut).toContain('if (t.closest(DEVICE_BUTTON_SELECTOR)) return true;');
    expect(tut).toContain('if (g.card.contains(t)) return true;');
    // 실제 조작·직접 해 보기·각본 대기 중일 때만 뒤 화면 대상이 열린다 (설명 카드는 창 버튼만)
    expect(tut).toContain('if (!practiceOn) return null;');
    expect(tut).toContain('return selectorOf(sc.stages[currentStage(sc.stages, host)]!.targets);');
    expect(tut).toContain('for (const dead of guards.filter((x) => !x.layer.isConnected)) dead.release();');
    expect(tut).toContain("if (e.type === 'pointerdown') g.nudge();");
  });
  it('안내를 치우면 가드도 풀린다 (튜토리얼 밖 동작 그대로)', () => {
    expect(tut).toMatch(/unregister\(\);\s*unguard\(\);\s*layer\.remove\(\);/);
    expect(tut).toContain('if (guards.length === 0) for (const type of GUARDED_EVENTS) window.removeEventListener(type, onGuardedEvent, { capture: true });');
  });
  it('직접 해 보기 장면도 구멍 대상만 (data-dev-only)', () => {
    expect(tut).toContain('else if (scene.practice && (stage?.targets ?? scene.targets).length > 0) layer.dataset.devOnly = selectorOf(stage?.targets ?? scene.targets);');
  });
  it('말풍선 누름 = [다음]', () => {
    expect(tut).toMatch(/card\.addEventListener\('click'[\s\S]*?nextBtn\.click\(\);/);
  });
});

describe('180-1 기기 버튼: ▲▼ 대상만 · ◀ 아무 일 없음 · 깜빡임', () => {
  it('▲▼ 초점: 위에 다른 창이 떠도 안내 창 버튼과 지금 대상만', () => {
    expect(dev).toContain("const tutLayer = () => [...layers].reverse().find((l) => l.el.isConnected && l.el.hasAttribute('data-tut-guard'));");
    expect(dev).toContain('next = next.filter((i) => tut.el.contains(i.el) || (!!allow && !!i.el.closest(allow)));');
  });
  it('◀·Esc 는 안내가 받는다(위의 물건 창도 닫지 않음), 단축키도 다른 버튼을 누르지 않는다', () => {
    expect(dev).toContain('const layer = tutLayer() ?? layers[layers.length - 1];');
    expect(dev).toContain('if (!tutLayer() && runCancelHooks(layers[layers.length - 1]?.el ?? null)) return;');
    expect(dev).toContain('!isNavAction(action) && !tutLayer()');
    expect(tut).toContain('const unregister = registerLayer(layer, () => nudge());');
  });
  it('뒤로 눌렀을 때 새 알림·문구 없음 (홈 안내·회복 안내의 토스트 삭제)', () => {
    expect(tut).not.toContain('onBack?:');
    expect(app).not.toContain("title: '[다음]을 눌러 진행한다'");
    expect(app).not.toContain("'강조된 버튼을 눌러 진행한다'");
  });
  it('깜빡임 = 대상 자신의 밝기만 (네모 상자 빛 없음, 178장 3)', () => {
    const rule = css.slice(css.indexOf('@keyframes bha-tut-nudge'), css.indexOf('@keyframes bha-tut-nudge') + 140);
    expect(rule).toContain('brightness(');
    expect(rule).not.toMatch(/box-shadow|outline/);
  });
  it('C.259 입력 막기(blockInput)·초점 기억은 그대로', () => {
    expect(read('src/ui/bha/overlayHost.ts')).toContain('export function blockInput(maxMs = 4000)');
    expect(dev).toContain('if (entry.ret && i === layers.length) pending = { mark: entry.ret, until: performance.now() + RESTORE_MS };');
  });
});
