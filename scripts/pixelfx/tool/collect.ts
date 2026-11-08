// 도구에 실을 캐릭터 그림 파일 목록 (build.mjs 가 esbuild 로 묶어 node 로 돌린다): 종이인형 부위·정지 그림 + 호로 프레임
import { HUMANOID, lookLayers } from '../../../src/data/art/rig/pose';
import { charArt } from '../../../src/data/art/manifest';
import { CHARACTERS } from './characters';

const out = new Set<string>();
const strip = (u: string) => u.replace(/^\.\//, '');
for (const c of CHARACTERS) {
  if (c.rig) {
    for (const l of lookLayers(HUMANOID, c.rig)) out.add(`art/rig/humanoid/${l.art}.png`);
    out.add(`art/rig/humanoid/still/${c.rig}.png`);
  } else if (c.faction) {
    const a = charArt(c.faction, c.tier ?? 0, c.fallback ?? '', './', undefined, undefined, null, undefined, 'male');
    if (a.src) out.add(strip(a.src));
    for (const clip of Object.values(a.anims ?? {})) for (const f of (clip as { frames: string[] }).frames) out.add(strip(f));
  }
}
console.log(JSON.stringify([...out].sort()));
