#!/usr/bin/env node
// pixelfx 고정 버전 받기 (C.249): scripts/pixelfx/pin.json 의 커밋을 vendor/pixelfx 에 받는다 (vendor/ 는 .gitignore).
// 이미 그 커밋이면 아무것도 안 한다. 버전을 올릴 때는 pin.json 의 commit 만 바꾸고 다시 실행 → `npm run fx -- rebuild`.
// Patch Pixel 글꼴(gallery/fonts)은 MIT 가 아니라 받은 뒤 지운다 — 게임·도구 어디에도 쓰지 않는다.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const PIN = JSON.parse(readFileSync(join(ROOT, 'scripts/pixelfx/pin.json'), 'utf8'));
export const VENDOR = join(ROOT, 'vendor/pixelfx');

const git = (args, cwd = VENDOR) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

function head() {
  try {
    return existsSync(join(VENDOR, '.git')) ? git(['rev-parse', 'HEAD']) : null;
  } catch {
    return null;
  }
}

/** 고정 커밋이 vendor/pixelfx 에 있게 한다. 받았으면 true */
export function ensurePixelfx({ quiet = false } = {}) {
  const log = quiet ? () => {} : (m) => console.log(m);
  if (head() === PIN.commit && existsSync(join(VENDOR, 'tools/render.mjs'))) {
    log(`pixelfx ${PIN.version} (${PIN.commit.slice(0, 7)}) 이미 있음: vendor/pixelfx`);
    return false;
  }
  log(`pixelfx ${PIN.version} (${PIN.commit.slice(0, 7)}) 받는 중 → vendor/pixelfx`);
  rmSync(VENDOR, { recursive: true, force: true });
  mkdirSync(VENDOR, { recursive: true });
  git(['init', '-q']);
  git(['remote', 'add', 'origin', PIN.repo]);
  git(['fetch', '-q', '--depth', '1', 'origin', PIN.commit]);
  git(['-c', 'advice.detachedHead=false', 'checkout', '-q', '--detach', 'FETCH_HEAD']);
  const got = git(['rev-parse', 'HEAD']);
  if (got !== PIN.commit) throw new Error(`pixelfx 커밋이 다름: ${got} (기대 ${PIN.commit})`);
  rmSync(join(VENDOR, 'gallery/fonts'), { recursive: true, force: true }); // Patch Pixel 글꼴 = MIT 밖, 쓰지 않음
  log('완료');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) ensurePixelfx();
