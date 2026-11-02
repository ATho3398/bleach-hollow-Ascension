// Claude API 얇은 층 (GDD 167장). 테스트는 이 인터페이스의 가짜 구현만 쓴다(실제 호출 금지).
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { MODEL } from './config';

export type Params = Anthropic.MessageCreateParamsNonStreaming;

export interface BatchItem {
  custom_id: string;
  params: Params;
}

export interface BatchOutcome {
  custom_id: string;
  message: Anthropic.Message | null;
  error: string | null;
}

export interface LlmClient {
  create(params: Params): Promise<Anthropic.Message>;
  /** Batch 를 만들고 끝날 때까지 기다려 결과를 돌려준다. onPoll 로 진행 상황 */
  runBatch(items: BatchItem[], opts: { pollSec: number; onPoll?: (s: string) => void; idFile?: string }): Promise<BatchOutcome[]>;
}

/** 실제 클라이언트 — apiKey 는 BHA_CLAUDE_API_KEY 에서 받아 직접 넘긴다 */
export function realClient(apiKey: string): LlmClient {
  const client = new Anthropic({ apiKey, maxRetries: 4 });
  return {
    create: (params) => client.messages.create(params),
    async runBatch(items, opts) {
      // 이미 낸 Batch 가 있으면(중단 뒤 다시 실행) 그것을 이어서 기다린다
      let id: string | null = opts.idFile && fs.existsSync(opts.idFile) ? fs.readFileSync(opts.idFile, 'utf8').trim() : null;
      if (!id) {
        const b = await client.messages.batches.create({ requests: items });
        id = b.id;
        if (opts.idFile) fs.writeFileSync(opts.idFile, id);
      }
      for (;;) {
        const b = await client.messages.batches.retrieve(id);
        const c = b.request_counts;
        opts.onPoll?.(`${b.processing_status} 처리중 ${c.processing} · 성공 ${c.succeeded} · 오류 ${c.errored}`);
        if (b.processing_status === 'ended') break;
        await new Promise((r) => setTimeout(r, opts.pollSec * 1000));
      }
      const out: BatchOutcome[] = [];
      for await (const r of await client.messages.batches.results(id)) {
        if (r.result.type === 'succeeded') out.push({ custom_id: r.custom_id, message: r.result.message, error: null });
        else out.push({ custom_id: r.custom_id, message: null, error: r.result.type === 'errored' ? `errored: ${r.result.error.error.type}` : r.result.type });
      }
      if (opts.idFile) fs.rmSync(opts.idFile, { force: true });
      return out;
    },
  };
}

/**
 * 멈춰야 하는 API 오류를 한 줄로 (GDD 167장 8): 크레딧 부족·키 거절은 다시 시도해도 안 되므로 그때까지 결과만 저장하고 끝낸다.
 * 크레딧 부족은 전용 예외 클래스가 없어 400/403 의 오류 문구로 가린다. 그 밖의 오류는 null(평소대로 처리).
 */
export function fatalApiError(e: unknown): { kind: 'credit' | 'auth'; line: string } | null {
  if (e instanceof Anthropic.AuthenticationError) return { kind: 'auth', line: 'API 키가 거절됐다(401) — 환경 변수 BHA_CLAUDE_API_KEY 를 확인한다' };
  if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.PermissionDeniedError || (e instanceof Anthropic.APIError && e.status === 402)) {
    if (/credit|balance|billing|payment|quota/i.test(e.message)) return { kind: 'credit', line: '크레딧이 없다 — API 크레딧이 떨어져 멈췄다(그때까지 결과는 저장)' };
  }
  return null;
}

/** 응답의 text 블록을 이어 붙인다 (thinking 블록은 건너뜀) */
export function textOf(m: Anthropic.Message): string {
  return m.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

/** 응답 JSON 파싱 — 구조화 출력이라 보통 바로 되지만, 앞뒤 군더더기가 있으면 첫 { … 마지막 } 만 */
export function parseJson<T>(m: Anthropic.Message): T | null {
  if (m.stop_reason === 'refusal') return null;
  const t = textOf(m).trim();
  try {
    return JSON.parse(t) as T;
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1)) as T;
      } catch {
        /* 아래 */
      }
    }
    return null;
  }
}

/** 공통 요청 틀: 고정 지시문(system)은 1개 블록 + cache_control, 구조화 출력(JSON 스키마), 생각 깊이는 effort 로만(Opus 5.5 는 thinking 끄기 불가) */
export function baseParams(o: { system: string; content: Anthropic.ContentBlockParam[]; schema: Record<string, unknown>; effort: 'low' | 'medium' | 'high'; maxTokens: number }): Params {
  return {
    model: MODEL,
    max_tokens: o.maxTokens,
    system: [{ type: 'text', text: o.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: o.content }],
    output_config: { effort: o.effort, format: { type: 'json_schema', schema: o.schema } },
  } as Params;
}

export function imageBlock(png: Buffer): Anthropic.ImageBlockParam {
  return { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } };
}
