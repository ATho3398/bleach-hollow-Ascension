// 그림 파일 목록 출력 (GDD 17-6): 지금 필요한 파일 이름과 public/art/ 에 들어 있는지. `npm run art:list`
import { existsSync, readdirSync } from 'node:fs';
import { ART_MANIFEST } from '../src/data/art/manifest';
import { artWishlist } from '../src/data/art/list';
import { ENEMIES } from '../src/data/enemies';
import { FACTIONS } from '../src/data/factions';

const files = existsSync('public/art') ? readdirSync('public/art') : [];
const rows = artWishlist(FACTIONS, ENEMIES, ART_MANIFEST, files);
let group = '';
for (const r of rows) {
  if (r.group !== group) {
    group = r.group;
    console.log(`\n[${group}]`);
  }
  console.log(`${r.present ? '있음' : '없음'}  ${r.file.padEnd(34)} ${r.note}`);
}
const have = rows.filter((r) => r.present).length;
console.log(`\n${have}/${rows.length}개 들어 있음 (public/art/ , png 또는 webp)`);
