// 이펙트 배치 도구 페이지 만들기 (GDD 180장): node scripts/pixelfx/tool/build.mjs [출력 폴더, 기본 .fx-pages]
// → <출력>/fx-tool.html 하나(배경·pixelfx 244개 코드·도구 코드 모두 안에). Artifact 로 같은 주소에 다시 올린다(README.md).
// 먼저 npm run fx:fetch (vendor/pixelfx).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const HERE = join(ROOT, 'scripts/pixelfx/tool');
const OUT = join(ROOT, process.argv[2] ?? '.fx-pages');
mkdirSync(OUT, { recursive: true });
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const dataUri = (p, type) => `data:${type};base64,${readFileSync(join(ROOT, p)).toString('base64')}`;

// 속성 색 = 이펙트 팔레트(어두움 → 밝음, 사용자 2026-11-04 "흰색, 물, 불, 흙, 번개, 독, 피, 보라색"), 버튼 색 = 밝은 칸
const PALETTES = {
  normal: ['#3a3e48', '#6a707e', '#9aa0ae', '#c4c8d2', '#e2e6ee', '#f4f6fa', '#ffffff'],
  water: ['#0e2e5a', '#14508c', '#1c76bc', '#36a2e0', '#78ccf4', '#c4ecff', '#ffffff'],
  fire: ['#4a1118', '#8c1d1c', '#cc3a1a', '#f2701f', '#ffae35', '#ffe27a', '#fff8d6'],
  earth: ['#2a1e14', '#47321e', '#69492a', '#8e6638', '#b88a52', '#dcb47c', '#f6e6c4'],
  thunder: ['#5e3a0c', '#a8680f', '#e8a218', '#ffd23c', '#fff08a', '#fffbd0', '#ffffff'],
  poison: ['#173a14', '#265e18', '#3f8a1e', '#6cb82a', '#a8e04a', '#e0ff8a', '#f6ffd8'],
  blood: ['#3a0a14', '#6a101c', '#a01824', '#d42a30', '#ff5a50', '#ff9a8a', '#ffe0da'],
  kyo: ['#2b1252', '#481c88', '#6b2cc0', '#9a48ec', '#c684ff', '#ecc8ff', '#ffffff'],
};
const elements = json('src/data/elements/elements.json').map((e) => ({ id: e.id, name: e.name['*'], palette: PALETTES[e.id], color: PALETTES[e.id][4] }));

// 공격 계열 (사용자 2026-11-04 "사신 참, 권, 귀, 호로 교, 조, 탄"): 종족 json 의 계열 이름으로 찾는다. 내 공격은 왼쪽을 향한다(C.216)
const ORDER = [['shinigami', '참'], ['shinigami', '권'], ['shinigami', '귀'], ['hollow', '교'], ['hollow', '조'], ['hollow', '탄']];
// 연타 처음 값 = 지금 게임(src/ui/attackFxConfig.ts FAMILY_STAGE_FX): 1블록 1번 · 2블록 3번 110ms · 3블록 3번 90ms
const TIMING = [[1, 0], [3, 110], [3, 90]];
const slash = { fx: 'melee/sword-slash', color: 'element', anchor: 'target', delay: 0, dx: 0, dy: 0, scale: 1, angle: 0, rate: 1, altFlip: true, move: 'stay', travel: 300, arc: 0, tx: 0, ty: 0, face: true, sync: 'hit' };
const entries = [];
const defaults = {};
for (const [fid, abbr] of ORDER) {
  const fac = json(`src/data/factions/${fid}.json`);
  const fam = fac.families.find((f) => f.abbr === abbr);
  if (!fam) throw new Error(`${fid} 에 ${abbr} 계열 없음`);
  const key = `${fid}/${fam.id}`;
  entries.push({ key, label: `${fac.name} ${fam.name}`, faction: fid, bg: dataUri(`scripts/pixelfx/tool/battle-bg-${fid}.png`, 'image/png'), dir: -1 });
  // 처음 값: 사신 참 = 지금 붙여 둔 sword-slash(GDD 180장 1), 나머지는 비어 있음
  const all = (n) => Array.from({ length: n }, (_, i) => i);
  defaults[key] = TIMING.map(([hits, gapMs]) => ({ hits, gaps: all(hits - 1).map(() => gapMs), speed: 1, layers: fid === 'shinigami' && abbr === '참' ? [{ ...slash, on: all(hits) }] : [] }));
}

const CAT = { arcane: '비전', critters: '생물', explosions: '폭발', fire: '불', holy: '신성', ice: '얼음', impacts: '타격', lightning: '번개', melee: '근접', moves: '연속기', nature: '자연', pickups: '아이템', projectiles: '투사체', scifi: 'SF', shadow: '어둠', spawn: '등장·소멸', status: '상태', transitions: '화면 전환', ui: 'UI', water: '물', weather: '날씨' };

// 배경 = 실제 전투 1배 캡처(scripts/c268-proof.cjs C268_BG=1, 종족마다), 맞는 몸·치는 몸 가운데(페이지 px)
const data = {
  stage: { w: 844, h: 390 },
  view: { x: 100, y: 16, w: 644, h: 238 }, // 전투 이펙트 층(.bha-afx-layer) 칸
  target: { x: 257, y: 153 },
  attacker: { x: 587, y: 153 },
  elements,
  entries,
  defaults,
  catNames: CAT,
  stamp: 'v3', // 저장 모양이 바뀔 때만 올린다 (도구 load 가 v2 를 v3 로 옮긴다)
  built: `게임 ${execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim()}`,
};

execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [join(HERE, 'fx-tool.ts'), '--bundle', '--minify', '--format=iife', `--outfile=${join(OUT, 'fx-tool.js')}`, '--log-level=warning']);
const html = readFileSync(join(HERE, 'fx-tool.template.html'), 'utf8')
  .replace('/*DATA*/', () => `var FX_DATA=${JSON.stringify(data)};`)
  .replace('/*JS*/', () => readFileSync(join(OUT, 'fx-tool.js'), 'utf8'));
writeFileSync(join(OUT, 'fx-tool.html'), html);
console.log(`fx-tool.html ${(html.length / 1024).toFixed(0)}KB · 계열 ${entries.length}`);
