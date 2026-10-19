import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { defineConfig } from 'vite';

// 버전 표시: 빌드 시점의 git 짧은 커밋 해시와 빌드 날짜(UTC). git 이 없으면 dev
function gitCommit(): string {
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

// 그림 파일 조회 (GDD 17-6, 26장): public/art/ 안의 png·webp 이름을 빌드 시 모아 앱에 넣는다(런타임에 없는 파일을 요청하지 않는다).
// 한 단계 아래 폴더(프레임 애니, 예 char-hollow-1/idle-1.png)는 `폴더/파일` 이름으로 함께 모은다
function artFiles(): string[] {
  try {
    if (!existsSync('public/art')) return [];
    const out: string[] = [];
    for (const f of readdirSync('public/art')) {
      if (/\.(png|webp)$/i.test(f)) out.push(f);
      else if (statSync(`public/art/${f}`).isDirectory()) {
        for (const g of readdirSync(`public/art/${f}`)) if (/\.(png|webp)$/i.test(g)) out.push(`${f}/${g}`);
      }
    }
    return out.sort();
  } catch {
    return [];
  }
}

// 프레임 애니 폴더의 선택 파일 anim.json (GDD 26-4): 폴더 이름 → 내용. 깨진 파일은 무시한다
function artAnims(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    if (!existsSync('public/art')) return out;
    for (const f of readdirSync('public/art')) {
      const p = `public/art/${f}/anim.json`;
      if (!existsSync(p)) continue;
      try {
        out[f] = JSON.parse(readFileSync(p, 'utf8'));
      } catch {
        /* 깨진 anim.json 은 기본 속도로 */
      }
    }
  } catch {
    /* 없음 */
  }
  return out;
}

// 배경 음악 파일 조회 (GDD 24-4): public/audio/bgm/ 안의 mp3·ogg 이름을 빌드 시 모은다 (없으면 무음)
function bgmFiles(): string[] {
  try {
    return existsSync('public/audio/bgm') ? readdirSync('public/audio/bgm').filter((f) => /\.(mp3|ogg)$/i.test(f)).sort() : [];
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
    __ART_ANIMS__: JSON.stringify(artAnims()),
    __BGM_FILES__: JSON.stringify(bgmFiles()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  test: { testTimeout: 60_000 },
} as Parameters<typeof defineConfig>[0]);
