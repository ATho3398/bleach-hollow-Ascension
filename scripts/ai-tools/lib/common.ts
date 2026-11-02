// 도구 공통: vite 띄우기, playwright 불러오기, 엑셀 쓰기, 지시문 재료 읽기 (GDD 167장)
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config';
import { xlsxRows, type Finding } from './findings';

/** 설치된 Playwright (전역) — 타입이 없어 느슨하게 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadPlaywright(): any {
  return createRequire(import.meta.url)('playwright');
}

export async function startVite(port: number, url?: string): Promise<{ url: string; stop: () => void }> {
  if (url) return { url, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
  const kill = () => {
    try {
      process.kill(-p.pid!);
    } catch {
      p.kill();
    }
  };
  const u = `http://localhost:${port}/`;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(u);
      if (r.ok) return { url: u, stop: kill };
    } catch {
      /* 아직 */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  kill();
  throw new Error('vite 서버가 뜨지 않았다');
}

export function readDoc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** docs/text-style.md 1~5절 (6절 바꾼 문구 표는 길어서 뺀다) */
export function textStyleCore(): string {
  const md = readDoc('docs/text-style.md');
  const cut = md.indexOf('\n## 6.');
  return cut > 0 ? md.slice(0, cut) : md;
}

/** 결과 → JSON → python 엑셀 */
export function writeXlsx(out: string, kind: 'playtest' | 'review', list: Finding[], meta: { title: string; sub: string; summary: string[] }): void {
  const { header, rows, shots } = xlsxRows(list, kind);
  const json = out.replace(/\.xlsx$/, '.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(json, JSON.stringify({ sheet: kind === 'playtest' ? 'AI 플레이테스트' : 'AI 검수', header, rows, shots, ...meta }, null, 1));
  const r = spawnSync('python3', [path.join(ROOT, 'scripts/ai-tools/make-xlsx.py'), json, out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`엑셀 만들기 실패: ${r.stderr}`);
  process.stdout.write(r.stdout);
  fs.rmSync(json, { force: true });
}
