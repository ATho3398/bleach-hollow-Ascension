// 항목 선택 시스템의 순수 부분 (GDD 16-1 2번): 하이라이트 이동과 화면 스택. DOM 에 의존하지 않아 단위 테스트한다 (tests/device-select.test.ts).

/** 위(-1)/아래(+1)로 한 칸 이동. 끝에서는 순환한다. 아직 고른 게 없으면(cur < 0) 아래는 첫 항목, 위는 마지막 항목 */
export function stepIndex(cur: number, dir: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (cur < 0 || cur >= count) return dir === 1 ? 0 : count - 1;
  return (cur + dir + count) % count;
}

/** 항목 목록이 바뀐 뒤 하이라이트를 이어 간다: 같은 요소가 남아 있으면 그 자리, 없으면 이전 위치를 목록 안으로 잘라 쓴다 */
export function keepSelection<T>(prev: readonly T[], prevIndex: number, next: readonly T[]): number {
  if (next.length === 0) return -1;
  const was = prev[prevIndex];
  if (was !== undefined) {
    const at = next.indexOf(was);
    if (at >= 0) return at;
  }
  return Math.min(Math.max(prevIndex, 0), next.length - 1);
}

/** 화면 스택: 맨 아래는 항상 홈(방). 취소는 맨 위를 빼고 아래 화면을 다시 연다. locked 인 화면(전투 중 등)은 취소로 못 뺀다 */
export interface ScreenEntry {
  id: string;
  /** 이 화면을 (다시) 그린다 */
  render: () => void;
  /** true 면 취소 버튼이 이 화면을 닫지 못한다 */
  locked?: boolean;
}

export class ScreenStack {
  private entries: ScreenEntry[] = [];

  get size(): number {
    return this.entries.length;
  }

  get top(): ScreenEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /** 새 화면을 쌓고 그린다 */
  push(e: ScreenEntry): void {
    this.entries.push(e);
    e.render();
  }

  /** 맨 위 화면을 다른 화면으로 바꾼다 (같은 흐름 안의 이동: 원정 → 전투 → 결과). 비어 있으면 push */
  replace(e: ScreenEntry): void {
    this.entries.pop();
    this.push(e);
  }

  /** 스택을 비우고 홈 하나만 남긴다 */
  reset(home: ScreenEntry): void {
    this.entries = [];
    this.push(home);
  }

  /** locked 여부와 상관없이 맨 위를 빼고 아래 화면을 다시 연다 (화면이 스스로 끝날 때: 전투 포기·결과 닫기). 홈뿐이면 false */
  pop(): boolean {
    if (this.entries.length <= 1) return false;
    this.entries.pop();
    this.top!.render();
    return true;
  }

  /** 한 단계 뒤로. 홈뿐이거나 맨 위가 locked 면 false */
  back(): boolean {
    const t = this.top;
    if (!t || t.locked || this.entries.length <= 1) return false;
    this.entries.pop();
    this.top!.render();
    return true;
  }
}
