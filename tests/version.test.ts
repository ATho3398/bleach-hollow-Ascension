import { describe, expect, it } from 'vitest';
import { PATCH_LABEL, STAGE_LABEL, versionLabel } from '../src/version';
import { newSaveMeta, SAVE_FORMAT_VERSION } from '../src/game';

describe('버전 표시', () => {
  it('단계·패치·커밋이 들어간다', () => {
    const s = versionLabel({ commit: 'abc1234', date: '2026-10-18' });
    expect(s).toContain(STAGE_LABEL);
    expect(s).toContain(PATCH_LABEL);
    expect(s).toContain('2026-10-18 배포 (커밋 abc1234)');
  });

  it('새 세이브는 현재 포맷과 시작 패치를 기록한다', () => {
    const m = newSaveMeta();
    expect(m.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.startPatch).toBe(PATCH_LABEL);
  });
});
