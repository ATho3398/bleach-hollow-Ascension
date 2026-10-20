// 테스트 모드 화면 쪽 (GDD 38장, C.88): 켜기·끄기, 화면 위 "테스트" 띠, 설정 [정보]의 버전 줄(7번 누르면 켜짐), 속도 배율.
// 엔진 쪽(세이브 분리·전체 해금·값 넣기)은 src/engine/testMode.ts, 테스트 패널 화면은 testModePanel.ts.
import { countTap, loadTestConfig, resolveTestMode, saveTestConfig, setTestFlag, TEST_SPEEDS, TEST_TAPS, type TestConfig, type TestSpeed } from '../engine/testMode';
import { versionLabel } from '../version';
import { button, el } from './bha/dom';
import { showToast } from './bha/nest';

let active = false;
let cfg: TestConfig = { speed: 1 };

const local = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

/** 앱 시작 때 한 번: 주소(?test=1/0)·기기 표시로 켜졌는지 정하고, 켜졌으면 띠를 단다 */
export function initTestMode(): boolean {
  active = resolveTestMode(location.search, local());
  if (active) {
    cfg = loadTestConfig(local());
    mountBand();
  }
  return active;
}

export const isTestMode = (): boolean => active;

/** 전투·원정 속도 배율 (테스트 모드가 아니면 늘 1) */
export const testSpeedMul = (): number => (active ? cfg.speed : 1);
export const testSpeed = (): TestSpeed => cfg.speed;
export function setTestSpeed(v: number): void {
  cfg = { ...cfg, speed: (TEST_SPEEDS as readonly number[]).includes(v) ? (v as TestSpeed) : 1 };
  saveTestConfig(local(), cfg);
}

/** 화면 위 가장자리 작은 띠 (늘 보임, 누를 수 없음) */
function mountBand(): void {
  if (document.querySelector('.bha-testband')) return;
  const band = el('div', 'bha-testband', '테스트');
  band.setAttribute('role', 'status');
  band.setAttribute('aria-label', '테스트 모드 — 따로 된 테스트 세이브를 쓰는 중');
  document.body.append(band);
}

/** 주소에서 test 값을 빼고 다시 연다 (켜고 끄는 것은 처음부터 다시 — 저장소 바꿔 끼우기를 깔끔하게) */
function reloadWithout(): void {
  const url = new URL(location.href);
  url.searchParams.delete('test');
  history.replaceState(null, '', url.toString());
  location.reload();
}

export function enableTestMode(): void {
  setTestFlag(local(), true);
  reloadWithout();
}

export function disableTestMode(): void {
  setTestFlag(local(), false);
  reloadWithout();
}

/** 설정 > [정보] 줄: 버전 줄(7번 연속 누르면 테스트 모드), 테스트 모드면 [테스트 모드 끄기] */
export function testInfoNodes(): Node[] {
  let taps = { count: 0, at: 0 };
  const ver = button({ label: versionLabel(), variant: 'ghost', size: 'small' });
  ver.classList.add('bha-testver');
  ver.onclick = () => {
    if (active) return;
    taps = countTap(taps, Date.now());
    const left = TEST_TAPS - taps.count;
    if (left <= 0) return enableTestMode();
    if (left <= 3) showToast({ eyebrow: '테스트 모드', title: `${left}번 더 누르면 켜진다`, meta: '따로 된 테스트 세이브를 쓴다 — 진짜 세이브는 그대로.' }, 0, 1200);
  };
  const nodes: Node[] = [ver];
  if (active) nodes.push(button({ label: '테스트 모드 끄기', icon: 'i-quit', variant: 'danger', size: 'small', onClick: disableTestMode }));
  return nodes;
}
