// 그림 파일 목록 출력 (GDD 17-6): 지금 필요한 파일 이름과 public/art/ 에 들어 있는지. `npm run art:list`
import { existsSync, readdirSync, statSync } from 'node:fs';
import { ART_MANIFEST } from '../src/data/art/manifest';
import { animWishlist, artWishlist } from '../src/data/art/list';
import { SKINS } from '../src/data/skins';
import { ENEMIES } from '../src/data/enemies';
import { FACTIONS } from '../src/data/factions';

// 한 단계 아래 폴더(프레임 애니)는 `폴더/파일` 이름으로 함께 모은다 (vite.config.ts 의 수집과 같은 규칙)
const files: string[] = [];
if (existsSync('public/art')) {
  for (const f of readdirSync('public/art')) {
    if (statSync(`public/art/${f}`).isDirectory()) for (const g of readdirSync(`public/art/${f}`)) files.push(`${f}/${g}`);
    else files.push(f);
  }
}
const rows = artWishlist(FACTIONS, ENEMIES, ART_MANIFEST, files);
let group = '';
for (const r of rows) {
  if (r.group !== group) {
    group = r.group;
    console.log(`\n[${group}]`);
  }
  console.log(`${r.present ? '있음' : '없음'}  ${r.file.padEnd(34)} ${r.note}`);
}

// 프레임 애니 (GDD 26장): 동작별 프레임 수. 없는 동작은 지금 방식(정지 그림 + 기존 이동·몸통박치기·흔들림)으로 나온다
const anims = animWishlist(FACTIONS, ENEMIES, SKINS, files);
console.log('\n[프레임 애니] 폴더 public/art/<그림 키>/<동작>-<번호>.png (동작: idle move attack skill hit win lose eat sleep release)');
if (!anims.some((r) => r.line)) console.log('(애니 폴더가 아직 없다)');
group = '';
for (const r of anims) {
  if (r.group !== group) {
    group = r.group;
    console.log(`  - ${group}`);
  }
  console.log(`    ${r.dir}: ${r.line ?? '애니 없음 (한 장짜리만)'}   ${r.note}`);
}
const have = rows.filter((r) => r.present).length;
console.log(`\n${have}/${rows.length}개 들어 있음 (public/art/ , png 또는 webp)`);
