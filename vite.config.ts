import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

// 오프라인 플레이 (GDD 60장): 빌드 산출물 전체를 미리 캐시하는 서비스 워커 dist/sw.js 를 쓴다.
// 캐시 버전은 파일 목록과 내용의 해시라 파일이 하나라도 바뀌면 새 워커로 인식된다. dev 서버에서는 쓰지 않는다
function walkDist(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const f of readdirSync(`${dir}/${base}`.replace(/\/$/, ''))) {
    const rel = base ? `${base}/${f}` : f;
    if (statSync(`${dir}/${rel}`).isDirectory()) out.push(...walkDist(dir, rel));
    else if (rel !== 'sw.js' && !rel.endsWith('.map')) out.push(rel);
  }
  return out.sort();
}
function pwaPlugin() {
  return {
    name: 'bha-pwa',
    apply: 'build' as const,
    enforce: 'post' as const,
    closeBundle() {
      const dir = 'dist';
      if (!existsSync(dir)) return;
      const files = walkDist(dir);
      const hash = createHash('sha1');
      let bytes = 0;
      for (const f of files) {
        const buf = readFileSync(`${dir}/${f}`);
        bytes += buf.length;
        hash.update(f).update(buf);
      }
      const precache = ['./', ...files.filter((f) => f !== 'index.html')];
      const version = hash.digest('hex').slice(0, 12);
      const src = readFileSync('scripts/sw-template.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache, null, 1));
      writeFileSync(`${dir}/sw.js`, src);
      writeFileSync(`${dir}/pwa-info.json`, JSON.stringify({ version, files: precache.length, bytes }) + '\n');
    },
  };
}

// 상대 경로로 빌드해 GitHub Pages(/bleach-hollow-ascension/) 등 어느 경로에 올려도 동작하게 한다
export default defineConfig({
  base: './',
  plugins: [pwaPlugin()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(gitCommit()),
    __ART_FILES__: JSON.stringify(artFiles()),
    __ART_ANIMS__: JSON.stringify(artAnims()),
    __BGM_FILES__: JSON.stringify(bgmFiles()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  test: { testTimeout: 60_000 },
} as Parameters<typeof defineConfig>[0]);
