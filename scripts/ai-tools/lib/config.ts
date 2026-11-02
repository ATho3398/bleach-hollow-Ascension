// AI 검수 도구 설정 (GDD 167장, 개발 전용 — 게임 빌드·CI 에 안 들어감).
// 키는 환경 변수 BHA_CLAUDE_API_KEY 에서만 읽는다(ANTHROPIC_API_KEY 는 쓰지 않음 — Claude Code 구독 과금과 섞이지 않게).
// 나중에 GitHub Actions + ID 페더레이션으로 옮기면 apiKeyFromEnv 만 바꾸면 된다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const MODEL = 'claude-opus-5-5';

/**
 * 단가 (provisional — 2026-10 기준 Opus 5.5 공개 단가, 100만 토큰당 달러). 바뀌면 여기 한 곳만 고친다.
 * 캐시 쓰기(5분) = 입력 × 1.25, 캐시 읽기 = 0.20, Batch = 전부 반값.
 */
export const PRICE_PER_MTOK = {
  input: 4,
  output: 20,
  cacheWrite5m: 5,
  cacheWrite1h: 8,
  cacheRead: 0.2,
  batchDiscount: 0.5,
} as const;

/** 실행마다 금액 상한 기본값(달러) — 옵션 --budget 으로 바꾼다 */
export const DEFAULT_BUDGET = { playtest: 10, review: 8 } as const;

/** ai-playtest 기본값 */
export const PLAYTEST = {
  maxSteps: 250,
  /** 같은 화면(글자·초점 같음)이 이만큼 이어지면 '막힘' */
  stuckSteps: 14,
  /** 기다리기 기본·최대 초 */
  waitDefaultSec: 3,
  waitMaxSec: 12,
  /** 프롬프트에 넣을 최근 걸음 수 */
  historySteps: 14,
  viewport: { width: 844, height: 390 },
  effort: 'low' as const,
  maxTokens: 4000,
} as const;

/** ai-review 기본값 */
export const REVIEW = {
  /** 화면 묶음 요청 하나에 넣는 캡처 수 상한 */
  shotsPerRequest: 8,
  /** 문구 검수 요청 하나에 넣는 글자 수 상한 */
  textCharsPerRequest: 14000,
  effort: 'medium' as const,
  maxTokens: 12000,
  pollSec: 30,
} as const;

export function apiKeyFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const k = env.BHA_CLAUDE_API_KEY;
  return k && k.trim() ? k.trim() : null;
}

/** KST 기준 MMDD */
export function mmddKst(d = new Date()): string {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return `${String(k.getUTCMonth() + 1).padStart(2, '0')}${String(k.getUTCDate()).padStart(2, '0')}`;
}

export function kstStamp(d = new Date()): string {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return k.toISOString().slice(0, 16).replace('T', ' ');
}

/** 간단 옵션 파서: --key value / --flag */
export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[a.slice(2)] = next;
        i++;
      } else out[a.slice(2)] = true;
    }
  }
  return out;
}
