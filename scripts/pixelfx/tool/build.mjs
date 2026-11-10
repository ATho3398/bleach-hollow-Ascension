// 이펙트 배치 도구 페이지 만들기 (GDD 180장): node scripts/pixelfx/tool/build.mjs [출력 폴더, 기본 .fx-pages]
// → <출력>/fx-tool.html 하나(배경·pixelfx 244개 코드·도구 코드 모두 안에). Artifact 로 같은 주소에 다시 올린다(README.md).
// 먼저 npm run fx:fetch (vendor/pixelfx).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const HERE = join(ROOT, 'scripts/pixelfx/tool');
const OUT = join(ROOT, process.argv[2] ?? '.fx-pages');
mkdirSync(OUT, { recursive: true });
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const dataUri = (p, type) => `data:${type};base64,${readFileSync(join(ROOT, p)).toString('base64')}`;

import { PALETTES, EDGES } from './palettes.mjs';
const elements = json('src/data/elements/elements.json').map((e) => ({ id: e.id, name: e.name['*'], palette: PALETTES[e.id], color: PALETTES[e.id][4], ...(EDGES[e.id] ? { edge: EDGES[e.id] } : {}) }));

// 공격 계열 (사용자 2026-11-04 "사신 참, 권, 귀, 호로 교, 조, 탄"): 종족 json 의 계열 이름으로 찾는다. 내 공격은 왼쪽을 향한다(C.216)
const ORDER = [['shinigami', '참'], ['shinigami', '권'], ['shinigami', '귀'], ['hollow', '교'], ['hollow', '조'], ['hollow', '탄']];
// 연타 처음 값 = 지금 게임(src/ui/attackFxConfig.ts FAMILY_STAGE_FX): 1블록 1번 · 2블록 3번 110ms · 3블록 3번 90ms
const TIMING = [[1, 0], [3, 110], [3, 90]];
const entries = [];
const defaults = {};
for (const [fid, abbr] of ORDER) {
  const fac = json(`src/data/factions/${fid}.json`);
  const fam = fac.families.find((f) => f.abbr === abbr);
  if (!fam) throw new Error(`${fid} 에 ${abbr} 계열 없음`);
  const key = `${fid}/${fam.id}`;
  // motion = 계열 몸동작(종이인형이 고르는 동작 묶음, 게임 attackFx 와 같다)
  entries.push({ key, label: `${fac.name} ${fam.name}`, faction: fid, bg: dataUri(`scripts/pixelfx/tool/battle-bg-${fid}.png`, 'image/png'), dir: -1, ...(fam.motion ? { motion: fam.motion } : {}) });
  const all = (n) => Array.from({ length: n }, (_, i) => i);
  // 처음 값 = 게임 값(종족 설정 families[].pixelFx, C.281 부터). 없는 계열은 빈 값(지금 게임 연타 시각)
  defaults[key] = fam.pixelFx?.stages
    ? fam.pixelFx.stages.map((st) => ({ ...st, bodies: { male: st.bodies.male ?? { chain: [], bodyAt: 0, bodyFromHit: true }, female: st.bodies.female ?? { chain: [], bodyAt: 0, bodyFromHit: true }, frames: st.bodies.frames ?? { chain: [], bodyAt: 0, bodyFromHit: true } } }))
    : TIMING.map(([hits, gapMs]) => ({ hits, gaps: all(hits - 1).map(() => gapMs), speed: 1, layers: [] }));
}

// 강적 강공격 빨간 세로 (GDD 227장, 사용자 2026-11-10 "강적 강공격 들은 빨간 세로" + "위치 파악해서 반영"): 몸마다 한 블록(입 자리가 다름).
// 치는 쪽 = 그 몸의 강적(게임 적 그림). 자리는 도구 기준(오른쪽에서 왼쪽으로) — 게임이 적 쪽으로 좌우를 뒤집는다
{
  const eh = json('src/data/enemies/eliteHeavyFx.json');
  const BODY = { 'humanoid/hb': ['덩치', 'elite-brute'], 'humanoid/hd': ['외눈 길리안', 'elite-gillian'], 'serpent/ref': ['뱀', 'elite-serpent'] };
  const fill = (b) => b ?? { chain: [], bodyAt: 0, bodyFromHit: true };
  for (const [bk, st] of Object.entries(eh.byBody)) {
    const [name, char] = BODY[bk] ?? [bk, 'elite-brute'];
    const key = `elite-heavy/${bk}`;
    entries.push({ key, label: `강적 강공격 · ${name}`, faction: 'hollow', bg: dataUri('scripts/pixelfx/tool/battle-bg-hollow.png', 'image/png'), dir: -1, stages: 1, char, el: eh.element });
    defaults[key] = [{ ...st, bodies: { male: fill(st.bodies.male), female: fill(st.bodies.female), frames: fill(st.bodies.frames) } }];
  }
}

const CAT = { custom: '★ 커스텀 (직접 만든 것)', arcane: '비전', critters: '생물', explosions: '폭발', fire: '불', holy: '신성', ice: '얼음', impacts: '타격', lightning: '번개', melee: '근접', moves: '연속기', nature: '자연', pickups: '아이템', projectiles: '투사체', scifi: 'SF', shadow: '어둠', spawn: '등장·소멸', status: '상태', transitions: '화면 전환', ui: 'UI', water: '물', weather: '날씨' };

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

// 직접 만든 이펙트(scripts/pixelfx/custom/custom/…, 예 custom/cero-oscuras 세로 오스큐라스)를 vendor 에 겹쳐 넣고 목록(src/fx/index.js)을 다시 만든다
const VENDOR = join(ROOT, 'vendor/pixelfx');
if (existsSync(join(ROOT, 'scripts/pixelfx/custom'))) cpSync(join(ROOT, 'scripts/pixelfx/custom'), join(VENDOR, 'src/fx'), { recursive: true });
execFileSync('node', ['tools/index.mjs'], { cwd: VENDOR, stdio: 'ignore' });

// 게임 그림 목록 (vite.config.ts artFiles·artAnims 와 같은 규칙) — 게임 코드(charArt)가 그대로 돌게 같은 값으로 넣는다
function artFiles() {
  const out = [];
  for (const f of readdirSync(join(ROOT, 'public/art'))) {
    if (/\.(png|webp)$/i.test(f)) out.push(f);
    else if (statSync(join(ROOT, 'public/art', f)).isDirectory()) for (const g of readdirSync(join(ROOT, 'public/art', f))) if (/\.(png|webp)$/i.test(g)) out.push(`${f}/${g}`);
  }
  return out.sort();
}
function artAnims() {
  const out = {};
  for (const f of readdirSync(join(ROOT, 'public/art'))) {
    const p = join(ROOT, 'public/art', f, 'anim.json');
    if (existsSync(p)) try { out[f] = JSON.parse(readFileSync(p, 'utf8')); } catch { /* 깨진 파일은 무시 */ }
  }
  return out;
}
const define = { __ART_FILES__: JSON.stringify(artFiles()), __ART_ANIMS__: JSON.stringify(artAnims()) };
// 게임 코드가 vite 기능(import.meta.glob)을 써서 vite 로 묶는다 (게임 빌드와 같은 방식)
async function bundle(entry, file, ssr) {
  await build({
    configFile: false,
    root: ROOT,
    publicDir: false, // 게임 public 폴더를 출력 폴더로 복사하지 않는다
    logLevel: 'error',
    define,
    build: { outDir: OUT, emptyOutDir: false, minify: !ssr, ssr: ssr ? entry : undefined, lib: ssr ? undefined : { entry, formats: ['iife'], name: 'FxTool', fileName: () => file }, rollupOptions: ssr ? { output: { entryFileNames: file, format: 'cjs' } } : undefined },
  });
}
// 치는 쪽 캐릭터 그림: 목록을 게임 코드로 뽑아 data URI 로 싣는다 (도구 안에서 상대 주소 → data URI 로 바꿔 끼운다)
await bundle(join(HERE, 'collect.ts'), 'collect.cjs', true);
const artList = JSON.parse(execFileSync('node', [join(OUT, 'collect.cjs')]).toString());
data.art = Object.fromEntries(artList.map((f) => [f, dataUri(`public/${f}`, f.endsWith('.webp') ? 'image/webp' : 'image/png')]));

await bundle(join(HERE, 'fx-tool.ts'), 'fx-tool.js', false);
const html = readFileSync(join(HERE, 'fx-tool.template.html'), 'utf8')
  .replace('/*DATA*/', () => `var FX_DATA=${JSON.stringify(data)};`)
  .replace('/*JS*/', () => readFileSync(join(OUT, 'fx-tool.js'), 'utf8'));
writeFileSync(join(OUT, 'fx-tool.html'), html);
console.log(`fx-tool.html ${(html.length / 1024).toFixed(0)}KB · 계열 ${entries.length} · 캐릭터 그림 ${artList.length}장`);
