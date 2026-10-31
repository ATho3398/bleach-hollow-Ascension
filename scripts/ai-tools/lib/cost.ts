// 토큰 → 금액, 실행 금액 상한, 사용 기록(docs/drafts/ai-usage.md) (GDD 167장 2)
import fs from 'node:fs';
import { PRICE_PER_MTOK } from './config';

export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface Tally {
  requests: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  usd: number;
}

export const emptyTally = (): Tally => ({ requests: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, usd: 0 });

/** 응답 한 개의 금액(달러). batch = Batches API(반값) */
export function costOf(u: UsageLike, opts: { batch?: boolean } = {}): number {
  const p = PRICE_PER_MTOK;
  const raw =
    ((u.input_tokens ?? 0) * p.input +
      (u.output_tokens ?? 0) * p.output +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite5m +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead) /
    1_000_000;
  return opts.batch ? raw * p.batchDiscount : raw;
}

export class BudgetExceeded extends Error {
  constructor(public spent: number, public cap: number) {
    super(`금액 상한 도달: $${spent.toFixed(3)} / $${cap.toFixed(2)}`);
  }
}

/** 실행 하나의 금액 장부. add 후 상한을 넘으면 over=true, assertRoom 은 다음 요청 예상액까지 넣어 넘으면 BudgetExceeded */
export class Budget {
  tally: Tally = emptyTally();
  constructor(public cap: number) {}
  add(u: UsageLike, opts: { batch?: boolean } = {}): number {
    const c = costOf(u, opts);
    const t = this.tally;
    t.requests++;
    t.input += u.input_tokens ?? 0;
    t.output += u.output_tokens ?? 0;
    t.cacheWrite += u.cache_creation_input_tokens ?? 0;
    t.cacheRead += u.cache_read_input_tokens ?? 0;
    t.usd += c;
    return c;
  }
  get over(): boolean {
    return this.tally.usd >= this.cap;
  }
  /** 다음 요청 예상액(nextUsd)을 더해도 상한 안인가 — 아니면 멈춘다 */
  assertRoom(nextUsd = 0): void {
    if (this.tally.usd + nextUsd > this.cap) throw new BudgetExceeded(this.tally.usd, this.cap);
  }
}

export function fmtTally(t: Tally): string {
  return `요청 ${t.requests} · 입력 ${t.input.toLocaleString()} · 캐시쓰기 ${t.cacheWrite.toLocaleString()} · 캐시읽기 ${t.cacheRead.toLocaleString()} · 출력 ${t.output.toLocaleString()} 토큰 · $${t.usd.toFixed(3)}`;
}

const LOG_HEAD = `# AI 검수 도구 사용 기록 (GDD 167장)

API 크레딧(200달러) 사용 기록. \`npm run ai-playtest\` · \`npm run ai-review\` 가 실행마다 한 줄씩 붙인다. 금액은 도구 안 단가 표(provisional) 기준 추정.

| 날짜(KST) | 도구 | 대상 | 걸음/요청 | 토큰(입력·캐시·출력) | 금액 | 누적 | 메모 |
|---|---|---|---|---|---|---|---|
`;

/** 기록 파일의 누적 금액(마지막 줄 '누적' 칸) */
export function cumulativeFrom(md: string): number {
  let last = 0;
  for (const line of md.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 9) continue;
    const m = /^\$([\d.]+)$/.exec(cells[7] ?? '');
    if (m) last = Number(m[1]);
  }
  return last;
}

export function appendUsageLog(file: string, row: { date: string; tool: string; target: string; count: string; tally: Tally; memo: string }): number {
  const md = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : LOG_HEAD;
  const cum = cumulativeFrom(md) + row.tally.usd;
  const t = row.tally;
  const line = `| ${row.date} | ${row.tool} | ${row.target} | ${row.count} | ${t.input.toLocaleString()}·${(t.cacheWrite + t.cacheRead).toLocaleString()}·${t.output.toLocaleString()} | $${t.usd.toFixed(3)} | $${cum.toFixed(3)} | ${row.memo.replace(/\|/g, '/')} |\n`;
  fs.writeFileSync(file, (md.endsWith('\n') ? md : md + '\n') + line);
  return cum;
}
