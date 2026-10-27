import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { newSaveData, sanitizeShared } from '../src/game';

// C.183 UI 검수 2차 중 찾음: 전투 소모품(회복약·각성제)이 보관함 정리 id 목록에 없어 불러올 때마다 지워졌다
describe('C.183 전투 소모품 불러오기', () => {
  it('보관한 전투 소모품 개수가 불러온 뒤에도 남는다', () => {
    const save = newSaveData('hollow', 1);
    save.shared.items['battle-potion'] = 3;
    save.shared.items['battle-haste'] = 1;
    save.shared.battleItem = 'battle-potion';
    const back = sanitizeShared(JSON.parse(JSON.stringify(save.shared)));
    expect(back.items['battle-potion']).toBe(3);
    expect(back.items['battle-haste']).toBe(1);
    expect(back.battleItem).toBe('battle-potion');
  });
});

describe('C.183 전투 상태 칩 자리 · 세로 회전 좌표', () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  it('상태 칩(공허·체인3)은 범례 줄이 아니라 필드 안 고정 자리 — 생기고 없어져도 버튼 줄과 무관', () => {
    const b = read('src/ui/battleView.ts');
    expect(b).toContain('legendRow.append(libChip, legend);');
    expect(b).toContain('arena.append(units, fieldTags, meStatus, topRow');
    expect(read('src/ui/bha/v2/bha.css')).toMatch(/\.bha-v2status\{position:absolute;left:50%;bottom:/);
  });
  it('ⓘ 설명 창·제목 펼침 목록·탑 층 스크롤은 기기 안 좌표(elementLocalRect)로 잰다', () => {
    for (const p of ['src/ui/bha/infoTip.ts', 'src/ui/bha/viewtitle.ts', 'src/ui/towerView.ts']) {
      const s = read(p);
      expect(s).toContain('elementLocalRect(');
      expect(s).not.toMatch(/(host|b|list|row|box)(\(\))?\.getBoundingClientRect\(\)/);
    }
  });
});
