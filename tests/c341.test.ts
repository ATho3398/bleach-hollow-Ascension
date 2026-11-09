// C.341 (GDD 206장): 가짜 도트 그림 삭제 · 덩치 몸 적 전부 종이인형 · 호로 덩치 외형(거구·망령·속박자) 종이인형
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { charArt, enemyArt } from '../src/data/art/manifest';
import { HUMANOID } from '../src/data/art/rig/pose';
import { getFaction } from '../src/data/factions';
import enemies from '../src/data/enemies/enemies.json';

const IDS = (enemies as { id: string }[]).map((e) => e.id).filter((id) => !id.startsWith('test-'));
const BRUTE_KINDS = ['sturdy', 'heavy-chain', 'heavy-seal', 'stance'];

describe('206장 1: 가짜 도트 그림 삭제', () => {
  it('char-hollow·char-hollow-2·skin-* 그림이 없다(진짜 도트는 남김)', () => {
    for (const f of ['char-hollow.png', 'char-hollow-2.png', 'char-hollow-2', 'skin-grandfisher']) expect(existsSync(`public/art/${f}`), f).toBe(false);
    expect(readdirSync('public/art').filter((f) => f.startsWith('skin-'))).toEqual([]);
    for (const f of ['char-shinigami.png', 'char-hollow-5.png', 'char-hollow/move-1.png', 'logo-hollow.png']) expect(existsSync(`public/art/${f}`), f).toBe(true);
    expect(readdirSync('public/art').filter((f) => f.startsWith('enemy-')).length).toBe(48);
  });
  it('그림 없는 외형(사마귀)은 자리표시, 같은 이름 파일을 넣으면 코드 수정 없이 붙는다', () => {
    const fb = getFaction('hollow').room?.characterArt ?? '';
    const files = readdirSync('public/art');
    expect(charArt('hollow', 0, fb, '/', undefined, files, 'mantis').src).toBeNull();
    expect(charArt('hollow', 0, fb, '/', undefined, [...files, 'skin-mantis.png'], 'mantis').src).toBe('/art/skin-mantis.png');
    expect(charArt('hollow', 1, fb, '/', undefined, files).src).toBeNull(); // 메노스(2단계) 그림 지움
  });
});

describe('206장 2: 덩치 몸 적 전부 종이인형', () => {
  it('sturdy·heavy-chain·heavy-seal·stance 32종 = basic 과 같은 색 덩치 외형, 배율 1.78', () => {
    let n = 0;
    for (const id of IDS.filter((id) => BRUTE_KINDS.some((k) => id.endsWith(`-${k}`)))) {
      const a = enemyArt(id, '/')!;
      const basic = enemyArt(id.replace(/-(sturdy|heavy-chain|heavy-seal|stance)$/, '-basic'), '/')!;
      expect(a.rig?.look, id).toBe(basic.rig!.look);
      expect(HUMANOID.looks[a.rig!.look]!.body).toBe('hb');
      expect(a.scale).toBe(1.78);
      expect(existsSync(`public${a.src}`)).toBe(true);
      n++;
    }
    expect(n).toBe(32);
  });
  it('swift 는 한 장 그림 그대로', () => {
    for (const id of IDS.filter((id) => id.endsWith('-swift'))) expect(enemyArt(id, '/')?.rig, id).toBeUndefined();
  });
});

describe('206장 3: 호로 덩치 외형 = 덩치 종이인형', () => {
  it('거구 brute-brown · 망령 brute-gray · 속박자 brute-red (방·걷기·전투가 같은 charArt)', () => {
    const fb = getFaction('hollow').room?.characterArt ?? '';
    for (const [skin, look] of [['brute', 'brute-brown'], ['ghoul', 'brute-gray'], ['shackled', 'brute-red']] as const) {
      for (const tier of [0, 1]) {
        const a = charArt('hollow', tier, fb, '/', undefined, undefined, skin, undefined, 'male');
        expect(a.rig?.look, skin).toBe(look);
        expect(a.src).toBe(`/art/rig/humanoid/still/${look}.png`);
        expect(existsSync(`public${a.src}`)).toBe(true);
      }
      expect(charArt('hollow', 0, '', '/', undefined, undefined, skin, undefined, 'female').rig?.look).toBe(look); // 여성 덩치 외형 없음 → 그대로
    }
  });
});
