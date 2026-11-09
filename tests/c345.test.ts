// C.345 (GDD 206장 1 후속): 지운 가짜 도트 자리에 깨진 그림(404)이 안 나온다 — 그림 목록이 실제 파일과 같으면 charArt 가 돌려주는 그림은 모두 있는 파일,
// 지운 키(호로 1·2단계·사마귀·그랜드피셔·아쥬커스 외형)는 그림 없음 = 자리표시. 방 캐릭터 그림은 못 읽으면 자리표시로.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { charArt, enemyArt } from '../src/data/art/manifest';
import { FACTIONS } from '../src/data/factions';
import { SKINS } from '../src/data/skins';
import enemies from '../src/data/enemies/enemies.json';

/** vite.config.ts artFiles() 와 같은 방식으로 지금 public/art 목록 */
function artFiles(): string[] {
  const out: string[] = [];
  for (const f of readdirSync('public/art')) {
    if (/\.(png|webp)$/i.test(f)) out.push(f);
    else if (statSync(`public/art/${f}`).isDirectory()) for (const g of readdirSync(`public/art/${f}`)) if (/\.(png|webp)$/i.test(g)) out.push(`${f}/${g}`);
  }
  return out.sort();
}
const FILES = artFiles();
const onDisk = (u: string) => existsSync(`public${u}`);

describe('C.345 지운 그림 자리 = 자리표시 (깨진 그림 0)', () => {
  it('모든 종족 × 단계 × 스킨 × 성별: 돌려준 정지 그림·프레임은 전부 실제 파일', () => {
    const bad: string[] = [];
    for (const f of FACTIONS) for (let t = 0; t < 6; t++) for (const s of [null, ...SKINS.map((x) => x.id)]) for (const g of ['male', 'female'] as const) for (const fb of [f.room?.characterArt ?? '', '']) {
      const a = charArt(f.id, t, fb, '/', undefined, FILES, s, undefined, g);
      if (a.src && !onDisk(a.src)) bad.push(`${f.id} ${t + 1}단계 ${s} ${g}: ${a.src}`);
      for (const an of Object.values(a.anims ?? {})) for (const fr of an?.frames ?? []) if (!onDisk(fr)) bad.push(`${f.id} ${t + 1}단계 ${s} 프레임 ${fr}`);
    }
    for (const e of enemies as { id: string }[]) {
      const a = enemyArt(e.id, '/', undefined, FILES);
      if (a?.src && !onDisk(a.src)) bad.push(`적 ${e.id}: ${a.src}`);
    }
    expect(bad).toEqual([]);
  });
  it('지운 키: 호로 1·2단계 기본·사마귀·그랜드피셔·아쥬커스 외형 = 그림 없음(자리표시), 걷기 프레임만 남은 1단계도 프레임을 안 쓴다', () => {
    const fb = FACTIONS.find((f) => f.id === 'hollow')!.room?.characterArt ?? '';
    for (const t of [0, 1]) {
      const a = charArt('hollow', t, fb, '/', undefined, FILES, null, undefined, 'male');
      expect(a.src, `${t + 1}단계`).toBeNull();
      expect(a.anims, `${t + 1}단계`).toBeUndefined();
      for (const s of ['mantis', 'grandfisher', 'carapace', 'stag', 'rhino', 'wyrm', 'panther', 'scorpion', 'raptor']) expect(charArt('hollow', t, fb, '/', undefined, FILES, s, undefined, 'male').src, s).toBeNull();
    }
  });
  it('방 캐릭터 그림은 못 읽으면 자리표시', () => {
    const room = readFileSync('src/ui/bha/room.ts', 'utf8');
    expect(room).toMatch(/addEventListener\('error', \(\) => showPlaceholder\(/);
  });
});
