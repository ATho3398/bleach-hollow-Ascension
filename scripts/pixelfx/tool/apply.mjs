// 이펙트 배치 도구 확정 값 → 게임 (사용자 2026-11-04 "ㅇㅋ 넣어"): node scripts/pixelfx/tool/apply.mjs <fx/fixed 문서 JSON 파일>
/** 종족 json 을 통째로 다시 쓰지 않고(다른 세션과 충돌 줄이기) 계열마다 "pixelFx" 한 줄만 넣거나 바꾸거나 지운다 — "fx" 줄 바로 아래 */
function patchText(text, fac) {
  let out = text.replace(/\n[ \t]*"pixelFx": .*,?(?=\n)/g, '');
  const start = out.indexOf('"families"');
  for (const fam of fac.families) {
    if (!fam.pixelFx) continue;
    const at = out.indexOf(`"id": "${fam.id}"`, start);
    const fxLine = out.indexOf('"fx": ', at);
    const eol = out.indexOf('\n', fxLine);
    const indent = out.slice(out.lastIndexOf('\n', fxLine) + 1, fxLine);
    out = `${out.slice(0, eol)}\n${indent}"pixelFx": ${JSON.stringify(fam.pixelFx)},${out.slice(eol)}`;
  }
  return out;
}

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
const LAYER_KEYS = ['fx', 'color', 'anchor', 'on', 'delay', 'dx', 'dy', 'scale', 'angle', 'rate', 'altFlip', 'move', 'travel', 'arc', 'tx', 'ty', 'ex', 'ey', 'face', 'sync', 'z', 'opacity', 'perHit'];
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
  // 몸동작: 성별마다(male·female·frames). 옛 값(chain 한 벌)은 남·여에 같이 (도구 ensureBodies 와 같은 규칙)
  const body = (b) => ({ chain: (b?.chain ?? []).map((c) => ({ id: c.id, rate: c.rate ?? 1 })), bodyAt: b?.bodyAt ?? 0, bodyFromHit: b?.bodyFromHit ?? true });
  const legacy = { chain, bodyAt: s.bodyAt, bodyFromHit: s.bodyFromHit };
  const src = s.bodies ?? { male: legacy, female: legacy, frames: null };
  const bodies = {};
  for (const k of ['male', 'female', 'frames']) if (src[k]?.chain?.length) bodies[k] = body(src[k]);
  return { hits: s.hits, gaps: (s.gaps ?? []).slice(0, Math.max(0, s.hits - 1)), speed: s.speed ?? 1, layers, bodies };
}
const used = (stages) => stages.some((s) => s.layers.length || Object.keys(s.bodies).length);

// 1) 종족 설정
const sheets = new Map(); // 시트 이름 → { id, palette?, edge? }
for (const fid of ['shinigami', 'hollow']) {
  const p = join(ROOT, 'src/data/factions', `${fid}.json`);
  const text = readFileSync(p, 'utf8');
  const fac = JSON.parse(text);
  for (const fam of fac.families) {
    const raw = families[`${fid}/${fam.id}`];
    const empty = () => Array.from({ length: 3 }, () => ({ hits: 1, gaps: [], speed: 1, layers: [], bodies: {} }));
    const stages = Array.isArray(raw) && raw.length === 3 ? raw.map(stageOf) : null;
    // 몸마다 따로 (GDD 229장): 도구 키 '<종족>/<계열>@<뼈대>/<몸>' → pixelFx.byBody. 사람형 공통(stages)과 같으면 넣지 않는다
    const byBody = {};
    for (const [key, rb] of Object.entries(families)) {
      const at = key.indexOf('@');
      if (at < 0 || key.slice(0, at) !== `${fid}/${fam.id}` || !Array.isArray(rb) || rb.length !== 3) continue;
      const sb = rb.map(stageOf);
      if (JSON.stringify(sb) !== JSON.stringify(stages ?? empty())) byBody[key.slice(at + 1)] = { stages: sb };
    }
    const anyBody = Object.values(byBody).some((b) => used(b.stages));
    if ((!stages || !used(stages)) && !anyBody) {
      delete fam.pixelFx;
      continue;
    }
    fam.pixelFx = { stages: stages ?? empty(), ...(Object.keys(byBody).length ? { byBody } : {}) };
    for (const s of [...fam.pixelFx.stages, ...Object.values(byBody).flatMap((b) => b.stages)])
      for (const L of s.layers) {
        if (L.color === 'element') for (const el of Object.keys(PALETTES)) sheets.set(sheetName(L.fx, el), { id: L.fx, palette: PALETTES[el], edge: EDGES[el]?.[L.fx] });
        else sheets.set(sheetName(L.fx, null), { id: L.fx });
      }
  }
  writeFileSync(p, patchText(text, fac));
  console.log(`${fid}: ${fac.families.filter((f) => f.pixelFx).map((f) => f.name).join(', ') || '없음'}`);
}

// 1-2) 강적 강공격 빨간 세로 (GDD 227장): families['elite-heavy/<뼈대>/<몸>'] = [한 블록] → src/data/enemies/eliteHeavyFx.json byBody (element·note 는 그대로)
{
  const ep = join(ROOT, 'src/data/enemies/eliteHeavyFx.json');
  const eh = JSON.parse(readFileSync(ep, 'utf8'));
  let n = 0;
  for (const [key, raw] of Object.entries(families)) {
    if (!key.startsWith('elite-heavy/') || !Array.isArray(raw) || !raw.length) continue;
    const bk = key.slice('elite-heavy/'.length);
    const st = stageOf(raw[0]);
    eh.byBody[bk] = st;
    n++;
    for (const L of st.layers) {
      if (L.color === 'element') sheets.set(sheetName(L.fx, eh.element), { id: L.fx, palette: PALETTES[eh.element], edge: EDGES[eh.element]?.[L.fx] });
      else sheets.set(sheetName(L.fx, null), { id: L.fx });
    }
  }
  if (n) {
    writeFileSync(ep, `${JSON.stringify(eh, null, 2)}\n`);
    console.log(`강적 강공격: ${Object.keys(eh.byBody).join(', ')}`);
  }
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
