import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

// 버전 표시: 빌드 시점의 git 짧은 커밋 해시와 빌드 날짜(UTC). git 이 없으면 dev
function gitCommit(): string {
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

// 그림 파일 조회 (GDD 17-6): public/art/ 안의 png·webp 이름을 빌드 시 모아 앱에 넣는다(런타임에 없는 파일을 요청하지 않는다)
function artFiles(): string[] {
  try {
    return existsSync('public/art') ? readdirSync('public/art').filter((f) => /\.(png|webp)$/i.test(f)).sort() : [];
  } catch {
    return [];
  }
}

// 상대 경로로 빌드해 GitHub Pages(/bleach-hollow-ascension/) 등 어느 경로에 올려도 동작하게 한다
export default defineConfig({
  base: './',
  define: {
    __BUILD_COMMIT__: JSON.stringify(gitCommit()),
    __ART_FILES__: JSON.stringify(artFiles()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  test: { testTimeout: 60_000 },
} as Parameters<typeof defineConfig>[0]);
