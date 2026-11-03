// 이펙트 배치 도구 페이지 만들기 (GDD 180장): node scripts/pixelfx/tool/build.mjs [출력 폴더, 기본 .fx-pages]
// → <출력>/fx-tool.html 하나(그림·시트·코드 모두 안에). Artifact 로 같은 주소에 다시 올린다(README.md).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const HERE = join(ROOT, 'scripts/pixelfx/tool');
const OUT = join(ROOT, process.argv[2] ?? '.fx-pages');
mkdirSync(OUT, { recursive: true });

const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const dataUri = (p, type) => `data:${type};base64,${readFileSync(join(ROOT, p)).toString('base64')}`;

// 속성 (이름·버튼 색). 색은 시트 팔레트의 밝은 칸 — 도구 버튼 표시용
const SWATCH = { normal: '#e2e6ee', water: '#36a2e0', fire: '#f2701f', earth: '#b88a52', thunder: '#ffd23c', blood: '#d42a30', poison: '#6cb82a', kyo: '#9a48ec' };
const elements = json('src/data/elements/elements.json').map((e) => ({ id: e.id, name: e.name['*'], color: SWATCH[e.id] ?? '#aaa' }));

// 종족 설정 families[].pixelFx 가 있는 계열 = 도구 항목. 내 공격은 왼쪽을 향한다(C.216, 나 = 오른쪽)
const entries = [];
for (const f of readdirSync(join(ROOT, 'src/data/factions')).filter((n) => n.endsWith('.json')).sort()) {
  const fac = json(`src/data/factions/${f}`);
  for (const fam of fac.families ?? []) if (fam.pixelFx) entries.push({ key: `${fac.id}/${fam.id}`, label: `${fac.name} ${fam.name}`, dir: -1, place: fam.pixelFx });
}
if (!entries.length) throw new Error('pixelFx 가 있는 계열이 없다');

const sheets = {};
for (const e of entries) for (const el of elements) {
  const name = `${e.place.sheet}-${el.id}`;
  const s = json(`public/fx/${name}.json`);
  sheets[name] = { ...s, url: dataUri(`public/fx/${s.image}`, 'image/png') };
}

// 배경 = 실제 전투 1배 캡처(scripts/c268-proof.cjs C268_BG=1), 맞는 몸 가운데(페이지 px)
const data = {
  bg: dataUri('scripts/pixelfx/tool/battle-bg.png', 'image/png'),
  stage: { w: 844, h: 390 },
  view: { x: 100, y: 16, w: 644, h: 238 }, // 전투 이펙트 층(.bha-afx-layer) 칸
  target: { x: 257, y: 153 },
  elements,
  entries,
  sheets,
  stamp: createHash('sha1').update(JSON.stringify(entries)).digest('hex').slice(0, 12),
  built: `게임 값 ${execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim()} 기준`,
};

execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [join(HERE, 'fx-tool.ts'), '--bundle', '--format=iife', `--outfile=${join(OUT, 'fx-tool.js')}`, '--log-level=warning']);
const html = readFileSync(join(HERE, 'fx-tool.template.html'), 'utf8')
  .replace('/*DATA*/', () => `var FX_DATA=${JSON.stringify(data)};`)
  .replace('/*JS*/', () => readFileSync(join(OUT, 'fx-tool.js'), 'utf8'));
writeFileSync(join(OUT, 'fx-tool.html'), html);
console.log(`fx-tool.html ${(html.length / 1024).toFixed(0)}KB · 항목 ${entries.length} · 시트 ${Object.keys(sheets).length} · stamp ${data.stamp}`);
