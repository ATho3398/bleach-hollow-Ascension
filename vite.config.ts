import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// 버전 표시: 빌드 시점의 git 짧은 커밋 해시와 빌드 날짜(UTC). git 이 없으면 dev
function gitCommit(): string {
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

// 상대 경로로 빌드해 GitHub Pages(/bleach-hollow-ascension/) 등 어느 경로에 올려도 동작하게 한다
export default defineConfig({
  base: './',
  define: {
    __BUILD_COMMIT__: JSON.stringify(gitCommit()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  test: { testTimeout: 60_000 },
} as Parameters<typeof defineConfig>[0]);
