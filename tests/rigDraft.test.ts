import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { DRAFT, DRAFT_MOTIONS } from '../scripts/rig/draft';
import { lookLayers, validateRig } from '../src/data/art/rig/pose';

describe('종이인형 작업본 (GDD 96장 36): 고정한 값이 먼저 들어가는 곳 — 게임본과 따로', () => {
  it('작업본 데이터에 문제가 없다', () => {
    expect(validateRig(DRAFT, DRAFT_MOTIONS)).toEqual([]);
  });
  it('작업본이 가리키는 그림이 작업본 그림 폴더에 다 있다', () => {
    for (const look of Object.keys(DRAFT.looks)) {
      for (const l of lookLayers(DRAFT, look)) expect(existsSync(`docs/design/rig-draft/humanoid/${l.art}.png`), `${look} ${l.art}`).toBe(true);
    }
  });
});
