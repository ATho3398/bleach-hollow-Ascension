// 옛 형식 세이브 마이그레이션 시험 (C.120): 게임은 형식 37 부터만 열지만(GDD 61장, MIN_LOADABLE_SAVE_FORMAT),
// 남겨 둔 마이그레이션 코드(형식 1~36)가 그대로 동작하는지는 계속 시험한다 — 이 파일의 시험 동안만 문턱을 1 로 내린다.
import { afterAll, beforeAll } from 'vitest';
import { MIN_LOADABLE_SAVE_FORMAT, saveFormatGate } from '../../src/game';

export function useLegacyMigrations(): void {
  beforeAll(() => {
    saveFormatGate.min = 1;
  });
  afterAll(() => {
    saveFormatGate.min = MIN_LOADABLE_SAVE_FORMAT;
  });
}
