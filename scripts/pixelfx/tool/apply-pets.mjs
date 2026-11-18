// 이펙트 배치 도구 '펫' 탭 확정 값 → 게임 (C.485): node scripts/pixelfx/tool/apply-pets.mjs <fixed.json>
// fixed.json = 아티팩트 db `fx/pets-fixed` 문서의 json 필드(문자열 또는 풀어 쓴 것) — { stamp: "p1", places: { "<그림 키>": { dx, dy } } }.
// 0,0 은 빼고 `src/data/pets/place.json` 의 places 를 통째로 바꾼다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
let j = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (typeof j.json === 'string') j = JSON.parse(j.json);
if (typeof j === 'string') j = JSON.parse(j);
if (j.stamp !== 'p1' || typeof j.places !== 'object') throw new Error('펫 자리 값이 아니다 (stamp p1 · places)');
const file = join(ROOT, 'src/data/pets/place.json');
const cur = JSON.parse(readFileSync(file, 'utf8'));
const places = {};
for (const [k, v] of Object.entries(j.places)) {
  const dx = Math.round(v.dx), dy = Math.round(v.dy);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error(`${k}: dx·dy 숫자`);
  if (dx || dy) places[k] = { dx, dy };
}
writeFileSync(file, JSON.stringify({ note: cur.note, places }, null, 2) + '\n');
console.log(`place.json — ${Object.keys(places).length}개`, places);
