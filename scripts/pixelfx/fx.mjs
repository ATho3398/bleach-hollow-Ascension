#!/usr/bin/env node
// pixelfx → 게임 가져오기 (C.249). 렌더 → 스프라이트 시트(PNG+JSON) → public/fx/ 에 넣고 public/fx/index.json 에 적는다.
// 게임은 그림 시트만 쓴다(src/ui/bha/pixelFx.ts 가 DOM/CSS 로 재생) — pixelfx 코드는 게임 번들에 안 들어간다.
//
//   npm run fx                                   메뉴 (찾기 → 고르기 → 색 → 이름 → 가져오기)
//   npm run fx -- add impacts/hit-flash [--name hit] [--palette ice | --palette '#102,#46f,#fff'] [--seed 3] [--opts '{"size":2}']
//   npm run fx -- list                           가져온 이펙트
//   npm run fx -- remove <이름>
//   npm run fx -- rebuild                        index.json 에 적힌 것을 고정 버전으로 전부 다시 렌더 (pin.json 을 올린 뒤)
//   npm run fx -- find <낱말...>                 pixelfx 안에서 찾기
//   npm run fx -- palettes                       색 이름 목록
// 확인: `npm run dev` → http://localhost:5173/?fxlab (개발 전용 이펙트 실험실)
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { ensurePixelfx, PIN, VENDOR } from './fetch.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC_FX = join(ROOT, 'public/fx');
const INDEX = join(PUBLIC_FX, 'index.json');
const TMP = join(ROOT, 'scripts/pixelfx/out');
/** 직접 만든 이펙트 (커밋함) — 렌더 전에 vendor/pixelfx/src/fx 에 겹쳐 넣는다 */
const CUSTOM = join(ROOT, 'scripts/pixelfx/custom');
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

function readIndex() {
  if (!existsSync(INDEX)) return { pixelfx: { version: PIN.version, commit: PIN.commit }, effects: [] };
  return JSON.parse(readFileSync(INDEX, 'utf8'));
}
function writeIndex(ix) {
  ix.pixelfx = { version: PIN.version, commit: PIN.commit };
  ix.effects.sort((a, b) => a.name.localeCompare(b.name));
  mkdirSync(PUBLIC_FX, { recursive: true });
  writeFileSync(INDEX, JSON.stringify(ix, null, 1) + '\n');
}

async function palettes() {
  const { PAL } = await import(pathToFileURL(join(VENDOR, 'src/core/color.js')).href);
  return PAL;
}

/** '--palette ice' 또는 '#102,#46f,#fff' → 색 배열. 없으면 undefined */
async function resolvePalette(p) {
  if (!p) return undefined;
  if (p.includes('#')) return p.split(/[,\s]+/).filter(Boolean);
  const PAL = await palettes();
  if (!PAL[p]) throw new Error(`색 이름 없음: ${p} (npm run fx -- palettes)`);
  return [...PAL[p]];
}

function find(words) {
  const out = execFileSync('node', ['tools/list.mjs', ...words], { cwd: VENDOR }).toString();
  return out
    .split('\n')
    .filter((l) => /^[a-z-]+\/[a-z0-9-]+\s/.test(l))
    .map((l) => ({ id: l.split(/\s+/)[0], line: l.trim() }));
}

/** pixelfx 시트 JSON(Aseprite 형식) → 게임이 읽는 작은 JSON */
export function compactSheet(sheet, entry) {
  const m = sheet.meta.pixelfx;
  return {
    name: entry.name,
    id: entry.id,
    pixelfx: PIN.commit.slice(0, 7),
    image: `${entry.name}.png`,
    frame: m.frameSize,
    columns: m.columns,
    frames: m.frames,
    durations: sheet.frames.map((f) => f.duration),
    loop: !!m.loop,
    pivot: m.pivot,
  };
}

/** 한 개 렌더해서 public/fx 로 */
async function importOne(entry) {
  if (!NAME_RE.test(entry.name)) throw new Error(`이름은 영문 소문자·숫자·- 만: ${entry.name}`);
  const opts = { ...(entry.options ?? {}) };
  const args = ['tools/render.mjs', entry.id, '--sheet', '--out', TMP];
  if (Object.keys(opts).length) args.push('--opts', JSON.stringify(opts));
  if (entry.seed != null) args.push('--seed', String(entry.seed));
  rmSync(join(TMP, entry.id), { recursive: true, force: true });
  execFileSync('node', args, { cwd: VENDOR, stdio: ['ignore', 'pipe', 'inherit'] });
  const base = entry.id.split('/')[1];
  const dir = join(TMP, entry.id);
  if (!existsSync(join(dir, `${base}.json`))) throw new Error(`pixelfx 에 없는 이펙트: ${entry.id} (npm run fx -- find <낱말>)`);
  const sheet = JSON.parse(readFileSync(join(dir, `${base}.json`), 'utf8'));
  mkdirSync(PUBLIC_FX, { recursive: true });
  copyFileSync(join(dir, `${base}.png`), join(PUBLIC_FX, `${entry.name}.png`));
  writeFileSync(join(PUBLIC_FX, `${entry.name}.json`), JSON.stringify(compactSheet(sheet, entry)) + '\n');
  // MIT 고지: 렌더한 그림과 함께 배포되는 사본 (Patch Pixel 글꼴은 쓰지 않음)
  writeFileSync(
    join(PUBLIC_FX, 'LICENSE-pixelfx.txt'),
    `Pixel effects in this folder were rendered with pixelfx ${PIN.version} (${PIN.repo}, commit ${PIN.commit}).\n\n` +
      readFileSync(join(VENDOR, 'LICENSE'), 'utf8') +
      '\n' +
      readFileSync(join(VENDOR, 'NOTICE.md'), 'utf8'),
  );
  const ix = readIndex();
  ix.effects = ix.effects.filter((e) => e.name !== entry.name);
  ix.effects.push({ name: entry.name, id: entry.id, ...(Object.keys(opts).length ? { options: opts } : {}), ...(entry.seed != null ? { seed: entry.seed } : {}) });
  writeIndex(ix);
  const c = compactSheet(sheet, entry);
  const ms = c.durations.reduce((a, b) => a + b, 0);
  console.log(`가져옴: ${entry.id} → public/fx/${entry.name}.png (+.json)  ${c.frame[0]}×${c.frame[1]} · ${c.frames}장 · ${ms}ms · ${c.loop ? '반복' : '한 번'}`);
}

function remove(name) {
  const ix = readIndex();
  if (!ix.effects.some((e) => e.name === name)) throw new Error(`가져온 이펙트 아님: ${name}`);
  ix.effects = ix.effects.filter((e) => e.name !== name);
  rmSync(join(PUBLIC_FX, `${name}.png`), { force: true });
  rmSync(join(PUBLIC_FX, `${name}.json`), { force: true });
  writeIndex(ix);
  console.log(`지움: ${name}`);
}

function list() {
  const ix = readIndex();
  console.log(`pixelfx ${ix.pixelfx.version} (${ix.pixelfx.commit.slice(0, 7)}) · ${ix.effects.length}개`);
  for (const e of ix.effects) console.log(`  ${e.name.padEnd(22)} ${e.id}${e.options ? '  ' + JSON.stringify(e.options) : ''}${e.seed != null ? '  seed ' + e.seed : ''}`);
}

function parseFlags(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) flags[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else rest.push(a);
  }
  return { flags, rest };
}

async function entryFrom(id, flags) {
  const options = flags.opts ? JSON.parse(flags.opts) : {};
  const pal = await resolvePalette(flags.palette);
  if (pal) options.palette = pal;
  return { id, name: flags.name ?? id.split('/')[1], options, seed: flags.seed != null ? +flags.seed : undefined };
}

async function menu() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q) => (await rl.question(q)).trim();
  try {
    for (;;) {
      console.log(`\n── pixelfx 메뉴 (고정 ${PIN.version} · ${PIN.commit.slice(0, 7)}) ──`);
      console.log('1) 찾아서 가져오기   2) 가져온 목록   3) 지우기   4) 전부 다시 렌더   0) 끝');
      const c = await ask('번호: ');
      if (c === '0' || c === '') return;
      if (c === '2') list();
      else if (c === '3') {
        list();
        const n = await ask('지울 이름: ');
        if (n) remove(n);
      } else if (c === '4') await rebuild();
      else if (c === '1') {
        const w = await ask('찾을 낱말 (영어, 예: slash · hit · shadow · 비우면 전부): ');
        const hits = find(w ? w.split(/\s+/) : []);
        if (!hits.length) {
          console.log('없음');
          continue;
        }
        hits.slice(0, 40).forEach((h, i) => console.log(`${String(i + 1).padStart(3)}) ${h.line.slice(0, 150)}`));
        if (hits.length > 40) console.log(`… ${hits.length - 40}개 더 (낱말을 더 좁히세요)`);
        const pick = hits[+(await ask('고를 번호: ')) - 1];
        if (!pick) continue;
        const PAL = await palettes();
        const pal = await ask(`색 (Enter = 원래 색 · 이름 ${Object.keys(PAL).join(' ')} · 또는 #색,#색,…): `);
        const name = (await ask(`게임 안 이름 (Enter = ${pick.id.split('/')[1]}): `)) || pick.id.split('/')[1];
        await importOne(await entryFrom(pick.id, { palette: pal || undefined, name }));
        console.log('확인: npm run dev → http://localhost:5173/?fxlab');
      }
    }
  } finally {
    rl.close();
  }
}

async function rebuild() {
  const ix = readIndex();
  for (const e of ix.effects) await importOne(e);
  if (!ix.effects.length) console.log('가져온 이펙트 없음');
}

async function main() {
  ensurePixelfx({ quiet: true });
  if (existsSync(CUSTOM)) cpSync(CUSTOM, join(VENDOR, 'src/fx'), { recursive: true });
  const [cmd, ...argv] = process.argv.slice(2);
  const { flags, rest } = parseFlags(argv);
  switch (cmd) {
    case undefined:
    case 'menu':
      return menu();
    case 'add':
      if (!rest[0]) throw new Error('npm run fx -- add <분류/이름>');
      return importOne(await entryFrom(rest[0], flags));
    case 'list':
      return list();
    case 'remove':
      return remove(rest[0]);
    case 'rebuild':
      return rebuild();
    case 'find':
      return find(rest).forEach((h) => console.log(h.line));
    case 'palettes':
      return Object.entries(await palettes()).forEach(([k, v]) => console.log(`${k.padEnd(9)} ${v.join(' ')}`));
    default:
      throw new Error(`모르는 명령: ${cmd}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
