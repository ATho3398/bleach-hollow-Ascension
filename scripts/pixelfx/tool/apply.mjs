// 이펙트 배치 도구 확정 값 → 게임 (사용자 2026-11-04 "ㅇㅋ 넣어"): node scripts/pixelfx/tool/apply.mjs <fx/fixed 문서 JSON 파일>
// 1) 종족 설정 src/data/factions/<종족>.json 의 families[].pixelFx = { stages: [1·2·3블록] } (이펙트가 하나도 없고 몸동작도 게임 기본인 계열은 지운다 = 옛 연출 그대로)
// 2) 쓰는 이펙트만 시트로: 속성 색이면 속성 8색(palettes.mjs), 원래 색이면 한 장 → public/fx/<시트 이름>.png+.json (npm run fx -- add)
// 3) 안 쓰는 옛 시트는 지운다 (hit-spark 는 C.249 시험용으로 남긴다). 먼저 npm run fx:fetch.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EDGES, PALETTES, sheetName } from './palettes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const src = process.argv[2];
if (!src) throw new Error('node scripts/pixelfx/tool/apply.mjs <fx/fixed JSON>');
const doc = JSON.parse(readFileSync(src, 'utf8'));
const fixed = JSON.parse(doc.json ?? doc.data?.json ?? JSON.stringify(doc));
const families = fixed.families ?? {};

// 레이어에서 게임이 쓰는 칸만 (도구 전용 칸·옛 칸은 뺀다)
const LAYER_KEYS = ['fx', 'color', 'anchor', 'on', 'delay', 'dx', 'dy', 'scale', 'angle', 'rate', 'altFlip', 'move', 'travel', 'arc', 'tx', 'ty', 'ex', 'ey', 'face', 'sync', 'z', 'perHit'];
const LAYER_DEFAULTS = { move: 'stay', travel: 300, arc: 0, tx: 0, ty: 0, ex: 0, ey: 0, face: true, sync: 'hit', z: 3, rate: 1, delay: 0 };
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
function stageOf(s) {
  const chain = Array.isArray(s.chain) ? s.chain : s.body ? [{ id: s.body, rate: 1 }] : [];
  const layers = (s.layers ?? []).map((L) => {
    const out = pick({ ...LAYER_DEFAULTS, ...L }, LAYER_KEYS);
    out.on = (out.on ?? []).filter((i) => i < s.hits);
    if (out.perHit) {
      for (const k of Object.keys(out.perHit)) if (!Object.keys(out.perHit[k]).length || Number(k) >= s.hits) delete out.perHit[k];
      if (!Object.keys(out.perHit).length) delete out.perHit;
    }
    return out;
  });
  return { hits: s.hits, gaps: (s.gaps ?? []).slice(0, Math.max(0, s.hits - 1)), speed: s.speed ?? 1, layers, chain: chain.map((c) => ({ id: c.id, rate: c.rate ?? 1 })), bodyAt: s.bodyAt ?? 0, bodyFromHit: s.bodyFromHit ?? true };
}
const used = (stages) => stages.some((s) => s.layers.length || s.chain.length);

// 1) 종족 설정
const sheets = new Map(); // 시트 이름 → { id, palette?, edge? }
for (const fid of ['shinigami', 'hollow']) {
  const p = join(ROOT, 'src/data/factions', `${fid}.json`);
  const text = readFileSync(p, 'utf8');
  const fac = JSON.parse(text);
  for (const fam of fac.families) {
    const raw = families[`${fid}/${fam.id}`];
    const stages = Array.isArray(raw) && raw.length === 3 ? raw.map(stageOf) : null;
    if (!stages || !used(stages)) {
      delete fam.pixelFx;
      continue;
    }
    fam.pixelFx = { stages };
    for (const s of stages)
      for (const L of s.layers) {
        if (L.color === 'element') for (const el of Object.keys(PALETTES)) sheets.set(sheetName(L.fx, el), { id: L.fx, palette: PALETTES[el], edge: EDGES[el]?.[L.fx] });
        else sheets.set(sheetName(L.fx, null), { id: L.fx });
      }
  }
  writeFileSync(p, `${JSON.stringify(fac, null, 2)}\n`);
  console.log(`${fid}: ${fac.families.filter((f) => f.pixelFx).map((f) => f.name).join(', ') || '없음'}`);
}

// 2) 시트 (이미 같은 옵션으로 있으면 건너뛴다)
const ixPath = join(ROOT, 'public/fx/index.json');
const ix = JSON.parse(readFileSync(ixPath, 'utf8'));
const same = (name, s) => {
  const e = ix.effects.find((x) => x.name === name);
  if (!e || e.id !== s.id) return false;
  return JSON.stringify(e.options ?? {}) === JSON.stringify({ ...(s.palette ? { palette: s.palette } : {}), ...(s.edge ? { edge: s.edge } : {}) });
};
let made = 0;
for (const [name, s] of sheets) {
  if (same(name, s)) continue;
  const args = ['scripts/pixelfx/fx.mjs', 'add', s.id, '--name', name];
  if (s.palette) args.push('--palette', s.palette.join(','));
  if (s.edge) args.push('--opts', JSON.stringify({ edge: s.edge }));
  execFileSync('node', args, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
  made++;
}
// 3) 안 쓰는 시트 지우기
const keep = new Set([...sheets.keys(), 'hit-spark']);
const now = JSON.parse(readFileSync(ixPath, 'utf8'));
for (const e of now.effects) if (!keep.has(e.name)) execFileSync('node', ['scripts/pixelfx/fx.mjs', 'remove', e.name], { cwd: ROOT, stdio: 'inherit' });
console.log(`시트 ${sheets.size}장 (새로 ${made})`);
