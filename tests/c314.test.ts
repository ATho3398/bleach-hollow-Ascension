// GDD 194장 (C.314, 코딩224): 튜토리얼 중 나갔다 들어오면 일시정지 창과 튜토리얼 카드가 겹쳐 [계속]이 막히던 것.
// 덮는 창(일시정지·설정·새 버전 알림·화면 돌림 멈춤·처음 화면 확인)이 열려 있으면 카드·강조 틀을 숨기고 입력 막기를 쉬며, 닫히면 같은 단계 카드를 다시 띄운다.
// 실제 브라우저(두 종족, 카드마다 자리 비움 → 복귀)는 scripts/c279-proof.cjs, 캡처·새 버전 창은 scripts/c314-proof.cjs
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { coverTutorials, onTutorialCover, resetTutorialCoverForTest, tutorialsCovered } from '../src/ui/bha/overlayHost';

const read = (p: string) => readFileSync(p, 'utf8');
const fakeEl = () => ({ isConnected: true }) as unknown as Element & { isConnected: boolean };

afterEach(() => resetTutorialCoverForTest());

describe('194-1 덮기 장치', () => {
  it('창이 열리면 덮임 알림, 모든 창이 닫혀야 풀림 알림 (겹친 창: 일시정지 위 설정)', () => {
    const seen: boolean[] = [];
    onTutorialCover((on) => seen.push(on));
    const pause = coverTutorials(fakeEl());
    const settings = coverTutorials(fakeEl());
    expect(tutorialsCovered()).toBe(true);
    settings();
    expect(tutorialsCovered()).toBe(true); // 일시정지가 아직 열려 있다
    pause();
    expect(tutorialsCovered()).toBe(false);
    expect(seen).toEqual([true, false]);
  });
  it('닫기 함수를 두 번 불러도 한 번만 푼다', () => {
    const a = coverTutorials();
    const b = coverTutorials();
    a();
    a();
    expect(tutorialsCovered()).toBe(true);
    b();
    expect(tutorialsCovered()).toBe(false);
  });
  it('닫기를 못 부르고 창이 문서에서 빠지면(화면 이동) 덮개도 없는 것으로 친다 — 튜토리얼이 영영 숨지 않게', () => {
    const ov = fakeEl();
    coverTutorials(ov);
    expect(tutorialsCovered()).toBe(true);
    ov.isConnected = false;
    expect(tutorialsCovered()).toBe(false);
  });
});

describe('194-1·2 튜토리얼 오버레이가 덮임을 따른다 (모든 튜토리얼이 같은 tutorialOverlay — 홈·첫 흡수·회복·걷기·각본 전투)', () => {
  const src = read('src/ui/tutorialOverlay.ts');
  it('덮이면 레이어 전체 숨김 · 입력 막기 표시(data-tut-guard)·기기 등록 해제, 풀리면 다시 등록하고 같은 단계로 다시 그린다', () => {
    expect(src).toContain("layer.style.display = on ? 'none' : '';");
    expect(src).toContain('delete layer.dataset.tutGuard;');
    expect(src).toMatch(/layer\.dataset\.tutGuard = '';\n\s+enroll\(\);\n\s+render\(\);/);
    expect(src).toContain('const offCover = onTutorialCover(applyCover);');
  });
  it('덮인 동안 입력 막기는 쉬고(창 버튼이 눌림), 단계·완료 판정과 그리기도 멈춘다', () => {
    expect(src).toContain('if (tutorialsCovered()) return; // 일시정지·설정 같은 창이');
    expect(src).toContain('if (covered) return; // 덮는 창이 닫히면 applyCover 가 다시 그린다');
    expect(src).toContain('if (covered) return; // 일시정지 등 덮는 창 아래');
  });
  it('튜토리얼이 끝나면 구독을 푼다', () => {
    expect(src).toMatch(/offCover\(\);\n\s+unregister\(\);/);
  });
});

describe('194-3 덮는 창 전수', () => {
  it('전투 일시정지 (앱 이탈 C.193 자동 일시정지도 같은 setPaused) — [계속]이면 덮개가 풀린다', () => {
    const bv = read('src/ui/battleView.ts');
    expect(bv).toContain('const uncover = coverTutorials(ov);');
    expect(bv).toMatch(/off\(\);\n\s+uncover\(\);/);
  });
  it('설정 창·새 버전 알림·화면 돌림 멈춤·처음 화면 확인', () => {
    expect(read('src/ui/settingsView.ts')).toContain('uncover = coverTutorials(layer);');
    expect(read('src/ui/updateBanner.ts')).toContain('uncover = coverTutorials(layer);');
    const app = read('src/ui/app.ts');
    expect(app).toContain('const uncover = coverTutorials(layer); // 튜토리얼 카드·강조 틀은 이 멈춤 창 동안 숨는다');
    expect(app).toContain("uncover = coverTutorials([...getOverlayHost().querySelectorAll('.bha-confirm')].pop() ?? null);");
  });
  it('종족 분기 없음', () => {
    for (const f of ['src/ui/tutorialOverlay.ts', 'src/ui/bha/overlayHost.ts']) expect(read(f)).not.toMatch(/faction\s*===|'hollow'|'shinigami'/);
  });
});

describe('194-5 튜토리얼 중 새 버전 창', () => {
  it('새 버전 창도 덮개 — 열려 있으면 안내 입력 막기가 쉬어 [다시 시작]·[나중에]가 눌린다', () => {
    const ub = read('src/ui/updateBanner.ts');
    expect(ub).toContain('uncover = coverTutorials(layer);');
    expect(ub).toMatch(/untrap\(\);\n\s+uncover\(\);/);
  });
  it('큰 [다시 시작]은 창 좌우 여백 안 (block 의 width 100% + 공용 창 자식 여백이 겹쳐 창 밖으로 나가던 것)', () => {
    expect(read('src/ui/bha/app.css')).toContain('.bha-update__card > .bha-btn--block { width: auto; align-self: stretch; }');
  });
  it('점검 스크립트가 서비스 워커 없이 창을 띄우는 길', () => {
    expect(read('src/pwa.ts')).toContain('export const markUpdateReadyForTest = (): void => markReady();');
    expect(read('scripts/c314-proof.cjs')).toContain("(await import('/src/pwa.ts')).markUpdateReadyForTest()");
  });
});

describe('194-4 c279 자동 점검에 자리 비움 → 복귀 장면', () => {
  it('카드마다 visibilitychange·blur 로 나갔다 들어와 [계속]을 진짜 마우스로 누르고 같은 카드가 다시 뜨는지 본다', () => {
    const p = read('scripts/c279-proof.cjs');
    expect(p).toContain("document.dispatchEvent(new Event('visibilitychange'));");
    expect(p).toContain("window.dispatchEvent(new Event(on ? 'blur' : 'focus'));");
    expect(p).toContain('const a = await awayScene(page, key2');
    expect(p).toContain('if (!a.ok) res.stuck.push({ key: key2, away: a });');
  });
});
