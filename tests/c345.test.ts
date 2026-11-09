// C.345 (GDD 206장 1 후속): 지운 가짜 도트 자리에 깨진 그림(404)이 안 나온다 — 그림 목록이 실제 파일과 같으면 charArt 가 돌려주는 그림은 모두 있는 파일,
// 지운 키(호로 1·2단계·사마귀·그랜드피셔·아쥬커스 외형)는 기본 덩치 종이인형(C.345 보충). 방 캐릭터 그림은 못 읽으면 자리표시로.
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
  it('지운 키: 호로 1~4단계 기본·사마귀·그랜드피셔·아쥬커스 외형 = 기본 덩치 종이인형(brute-base, 사용자 "호로 기본 이미지를 덩치로해야지"), 목록·사진(기본 키 없음)도 같게', () => {
    const fb = FACTIONS.find((f) => f.id === 'hollow')!.room?.characterArt ?? '';
    for (const t of [0, 1, 2, 3]) for (const key of [fb, '']) {
      const a = charArt('hollow', t, key, '/', undefined, FILES, null, undefined, 'male');
      const tierLook = t === 1 ? 'gillian-base' : 'brute-base'; // C.360 (GDD 219장 1): 2단계 = 종이인형 길리안
      expect(a.rig?.look, `${t + 1}단계`).toBe(tierLook);
      expect(a.anims, `${t + 1}단계`).toBeUndefined(); // 걷기 프레임만 남은 char-hollow/ 는 안 쓴다
      for (const s of ['mantis', 'grandfisher', 'carapace', 'stag', 'rhino', 'panther', 'scorpion', 'raptor']) expect(charArt('hollow', t, key, '/', undefined, FILES, s, undefined, 'male').rig?.look, s).toBe(tierLook);
      expect(charArt('hollow', t, key, '/', undefined, FILES, 'wyrm', undefined, 'male').rig?.look).toBe('serpent-base'); // 뱀형 = 종이인형 뱀 (GDD 219장 2)
    }
    expect(charArt('hollow', 4, fb, '/', undefined, FILES, null, undefined, 'male').rig?.look).toBe('arrancar-base'); // 5단계 아란칼은 그대로
    expect(charArt('hollow', 0, fb, '/', undefined, FILES, 'ghoul', undefined, 'male').rig?.look).toBe('brute-gray'); // 덩치 스킨 색이 먼저
    expect(charArt('hollow', 2, fb, '/', undefined, [...FILES, 'char-hollow-3.png'], null, undefined, 'male').src).toBe('/art/char-hollow-3.png'); // 단계별 그림 파일이 생기면 그쪽이 먼저(단계별 종이인형이 없는 단계)
    expect(charArt('shinigami', 2, '', '/', undefined, FILES, null, undefined, 'male').rig).toBeUndefined(); // 사신 목록·사진은 한 장 그림 그대로
  });
  it('적 덩치 배율 = 내 덩치 배율 (사용자 "적 사이즈 나랑 맞춰" — 전투 실측 키·도트 비 1.000, docs/captures/c345/size-proof.json)', () => {
    const me = charArt('hollow', 0, FACTIONS.find((f) => f.id === 'hollow')!.room?.characterArt ?? '', '/', undefined, FILES, null, undefined, 'male');
    const brutes = (enemies as { id: string }[]).map((e) => enemyArt(e.id, '/', undefined, FILES)).filter((a) => a?.rig && a.rig.look.startsWith('brute-'));
    expect(brutes.length).toBe(40 - 2); // 뱀형 강적 2 (C.360, GDD 219장 2)
    for (const a of brutes) {
      expect(a!.scale).toBe(me.fieldScale ?? me.scale);
      expect(a!.fieldScale).toBeUndefined();
    }
    for (const s of ['brute', 'ghoul', 'shackled']) expect(charArt('hollow', 0, '', '/', undefined, FILES, s, undefined, 'male').scale).toBe(me.scale);
  });
  it('방 캐릭터 그림은 못 읽으면 자리표시', () => {
    const room = readFileSync('src/ui/bha/room.ts', 'utf8');
    expect(room).toMatch(/addEventListener\('error', \(\) => showPlaceholder\(/);
  });
});
