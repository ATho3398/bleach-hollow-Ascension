// AI 검수 도구 (GDD 167장 6) — 가짜 클라이언트만 쓴다. 실제 API 호출·키 없이 돈다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { apiKeyFromEnv, mmddKst, parseArgs, MODEL } from '../scripts/ai-tools/lib/config';
import { appendUsageLog, Budget, BudgetExceeded, costOf, creditGuard, cumulativeFrom } from '../scripts/ai-tools/lib/cost';
import { excludedReason, filterFindings, priorDuplicate, similarity, xlsxRows, type Finding, type PriorItem } from '../scripts/ai-tools/lib/findings';
import { baseParams, fatalApiError, parseJson, type LlmClient } from '../scripts/ai-tools/lib/llm';
import { isStuck, userContent, estimatePlaytest, STEP_SCHEMA } from '../scripts/ai-tools/playtest';
import { applyVerdicts, collectGameText, estimateBatch, packShots, packText, textFindingsOf, textRequest, uiFindingsOf, uiRequest, verifyRequest, type Shot } from '../scripts/ai-tools/review';

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function fakeMessage(text: string, usage: Partial<Anthropic.Usage> = {}): Anthropic.Message {
  return {
    id: 'msg_fake',
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...usage },
  } as unknown as Anthropic.Message;
}

const f = (o: Partial<Finding>): Finding => ({ severity: '중', group: 'g', screen: '장터', faction: 'hollow', viewpoint: '배치', problem: '버튼이 화면 오른쪽 끝에 몰려 있다', fix: '가운데로 옮긴다', shot: '', ...o });

describe('설정·키', () => {
  it('키는 BHA_CLAUDE_API_KEY 에서만 읽는다', () => {
    expect(apiKeyFromEnv({ ANTHROPIC_API_KEY: 'x' })).toBeNull();
    expect(apiKeyFromEnv({ BHA_CLAUDE_API_KEY: ' k ' })).toBe('k');
    expect(apiKeyFromEnv({ BHA_CLAUDE_API_KEY: '' })).toBeNull();
  });
  it('옵션 파서·MMDD', () => {
    expect(parseArgs(['--faction', 'hollow', '--dry-run', '--budget=3'])).toEqual({ faction: 'hollow', 'dry-run': true, budget: '3' });
    expect(mmddKst(new Date('2026-10-31T16:00:00Z'))).toBe('1101');
  });
});

describe('금액 계산·상한', () => {
  it('입력 4·출력 20·캐시읽기 0.2·Batch 반값', () => {
    expect(costOf({ input_tokens: 1_000_000 })).toBeCloseTo(4);
    expect(costOf({ output_tokens: 1_000_000 })).toBeCloseTo(20);
    expect(costOf({ cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.2);
    expect(costOf({ cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(5);
    expect(costOf({ input_tokens: 1_000_000, output_tokens: 1_000_000 }, { batch: true })).toBeCloseTo(12);
  });
  it('가짜 클라이언트로 걸음을 돌리면 상한에서 멈춘다', async () => {
    const client: LlmClient = { create: async () => fakeMessage('{}', { input_tokens: 10_000, output_tokens: 1000 }), runBatch: async () => [] };
    const budget = new Budget(0.5); // 한 번에 0.06 달러
    let calls = 0;
    await expect(
      (async () => {
        for (;;) {
          budget.assertRoom(0.06);
          budget.add((await client.create(baseParams({ system: 's', content: [{ type: 'text', text: 'u' }], schema: {}, effort: 'low', maxTokens: 10 }))).usage);
          calls++;
        }
      })(),
    ).rejects.toBeInstanceOf(BudgetExceeded);
    expect(calls).toBe(8); // 8 × 0.06 = 0.48, 9번째는 0.54 라 안 낸다
    expect(budget.tally.usd).toBeLessThanOrEqual(0.5);
  });
  it('사용 기록 누적', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aiu-')), 'ai-usage.md');
    const t = { requests: 3, input: 10, output: 5, cacheWrite: 0, cacheRead: 0, usd: 1.25 };
    expect(appendUsageLog(file, { date: 'd', tool: 'ai-playtest', target: '호로', count: '3걸음', tally: t, memo: 'a|b' })).toBeCloseTo(1.25);
    expect(appendUsageLog(file, { date: 'd', tool: 'ai-review', target: '두 종족', count: '3요청', tally: t, memo: '' })).toBeCloseTo(2.5);
    expect(cumulativeFrom(fs.readFileSync(file, 'utf8'))).toBeCloseTo(2.5);
  });
});

describe('요청 만들기', () => {
  it('고정 지시문은 캐시, 모델·effort·JSON 스키마, thinking·tool_choice 안 보냄', () => {
    const p = baseParams({ system: 'sys', content: [{ type: 'text', text: 'u' }], schema: STEP_SCHEMA as unknown as Record<string, unknown>, effort: 'low', maxTokens: 100 });
    expect(p.model).toBe('claude-opus-5-5');
    expect((p.system as Anthropic.TextBlockParam[])[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(p.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
    expect('thinking' in p).toBe(false);
    expect('tool_choice' in p).toBe(false);
  });
  it('플레이테스트 한 걸음: 캡처 + 화면 글자', () => {
    const c = userContent({ step: 3, maxSteps: 250, factionKo: '호로', reached: 'faction', history: [{ step: 2, action: 'confirm', screen: '시작', thought: '새로 시작' }], issuesSoFar: [], state: { text: '새로 시작', focus: '새로 시작', layers: [], options: ['▶ 새로 시작'], toasts: [] }, png: PNG_1x1 });
    expect(c[0]!.type).toBe('image');
    expect((c[1] as Anthropic.TextBlockParam).text).toContain('2 [시작] ✓');
  });
  it('막힘 판정', () => {
    expect(isStuck(['a', 'a', 'a'], 3)).toBe(true);
    expect(isStuck(['a', 'b', 'a'], 3)).toBe(false);
    expect(isStuck(['a', 'a'], 3)).toBe(false);
  });
  it('dry-run 예상치는 상한 안', () => {
    expect(estimatePlaytest(250, 3000).usd).toBeLessThan(10);
  });
  it('검수 요청: 캡처 묶기·UI/문구/확인 요청', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-'));
    const shots: Shot[] = ['장터 a', '장터 b', '방', '온천'].map((s, i) => {
      const file = path.join(dir, `hollow-${i}.png`);
      fs.writeFileSync(file, PNG_1x1);
      return { file, faction: 'hollow', screen: s, group: s.split(' ')[0]!, text: s };
    });
    const packs = packShots(shots, 3);
    expect(packs.map((p) => p.length)).toEqual([3, 1]);
    const ui = uiRequest('ui-0', packs[0]!, 'sys');
    expect((ui.params.messages[0]!.content as Anthropic.ContentBlockParam[]).filter((c) => c.type === 'image')).toHaveLength(3);
    const found = uiFindingsOf(packs[0]!, { findings: [{ shot: 2, screen: '', both: true, severity: '상', viewpoint: '배치', problem: 'p', fix: 'x' }] }, '장터');
    expect(found[0]).toMatchObject({ screen: '장터 b', faction: '둘 다', shot: shots[1]!.file });
    const v = verifyRequest('v-0', found, 'vsys');
    expect((v.params.messages[0]!.content as Anthropic.ContentBlockParam[]).filter((c) => c.type === 'image')).toHaveLength(1);
    expect(estimateBatch([ui, v])).toBeGreaterThan(0);
  });
  it('게임 문구 모으기·나누기·문구 지적', () => {
    const lines = collectGameText();
    expect(lines.length).toBeGreaterThan(200);
    expect(lines.some((l) => l.source.includes('/story/'))).toBe(false);
    const packs = packText(lines, 5000);
    expect(packs.flat().length).toBe(lines.length);
    const req = textRequest('tx-0', packs[0]!, 'sys');
    expect((req.params.messages[0]!.content as Anthropic.TextBlockParam[])[0]!.text).toContain('1\t');
    const tf = textFindingsOf(packs[0]!, { findings: [{ line: 1, severity: '중', problem: '말투', fix: '고침' }] });
    expect(tf[0]!.source).toBe(packs[0]![0]!.source);
  });
});

describe('이미 정한 것 빼기', () => {
  const prior: PriorItem[] = [{ no: 3, screen: '우라하라', faction: '둘 다', viewpoint: '개발자 말·숫자', problem: "'○ 임시 품목' 점선 표시가 상품 목록 위에 그대로 보인다", mark: 'o' }, { no: 50, screen: '월드맵', faction: '둘 다', viewpoint: '배치', problem: '월드맵 아래쪽에 큰 빈칸이 남아 화면을 다 쓰지 않는다', mark: '' }];
  it('제외 규칙: 테스트·임시 표시·그림 없음·기기 크기', () => {
    expect(excludedReason(f({ screen: '테스트 패널' }))).toBe('테스트 화면');
    expect(excludedReason(f({ problem: "'임시' 표시가 붙어 있다" }))).toContain('임시');
    expect(excludedReason(f({ problem: '아이콘이 없어 빈 칸으로 보인다' }))).toContain('그림 없음');
    expect(excludedReason(f({ problem: '기기 크기가 작다' }))).toContain('기기');
    expect(excludedReason(f({}))).toBeNull();
  });
  it('지난 검수와 같은 화면·같은 문제', () => {
    expect(priorDuplicate(f({ screen: '월드맵', problem: '월드맵 아래에 큰 빈칸이 남아 화면을 다 쓰지 않는다' }), prior)?.no).toBe(50);
    expect(priorDuplicate(f({ screen: '방', problem: '월드맵 아래에 큰 빈칸이 남아 화면을 다 쓰지 않는다' }), prior)).toBeNull();
    expect(similarity('가나다라', '가나다라')).toBe(1);
  });
  it('두 종족 같은 문제는 한 줄(둘 다), 심각도 순', () => {
    const r = filterFindings([f({ severity: '하' }), f({ faction: 'shinigami', severity: '하' }), f({ severity: '상', screen: '방', problem: '초점이 안 보인다' }), f({ screen: '월드맵', problem: '월드맵 아래쪽 큰 빈칸이 남아 화면을 다 안 쓴다' })], prior);
    expect(r.kept.map((x) => [x.severity, x.faction])).toEqual([['상', 'hollow'], ['하', '둘 다']]);
    expect(r.dropped[0]!.reason).toContain('50번');
  });
  it('확인 단계 결과 적용', () => {
    const items = [f({}), f({ problem: 'b' }), f({ problem: 'c' })];
    const r = applyVerdicts(items, { verdicts: [{ id: 1, keep: true, duplicate_of: 0, reason: '' }, { id: 2, keep: false, duplicate_of: 0, reason: '안 보임' }, { id: 3, keep: true, duplicate_of: 12, reason: '' }] });
    expect(r.kept).toHaveLength(1);
    expect(r.dropped.map((d) => d.reason)).toEqual(['확인에서 뺌: 안 보임', '지난 검수 12번과 같음']);
  });
  it('구조화 출력 파싱(앞뒤 군더더기)·거절', () => {
    expect(parseJson<{ a: number }>(fakeMessage('{"a":1}'))).toEqual({ a: 1 });
    expect(parseJson<{ a: number }>(fakeMessage('답: {"a":2} 끝'))).toEqual({ a: 2 });
    expect(parseJson(fakeMessage('없음'))).toBeNull();
    expect(parseJson({ ...fakeMessage('{"a":1}'), stop_reason: 'refusal' } as Anthropic.Message)).toBeNull();
  });
});

describe('엑셀 행', () => {
  it('열은 지난 UI 검수와 같고, 플레이테스트는 걸음 열 추가', () => {
    const r = xlsxRows([f({ shot: '/x/hollow-장터.png' })], 'review');
    expect(r.header).toEqual(['번호', '심각도', '묶음', '화면', '종족', '관점', '문제', '추천 수정', '마스터 메모', '고칠까(O/X)', '캡처']);
    expect(r.rows[0]).toEqual([1, '중', 'g', '장터', '호로', '배치', '버튼이 화면 오른쪽 끝에 몰려 있다', '가운데로 옮긴다', '', '', 'hollow-장터.png']);
    const p = xlsxRows([f({ step: '12 · 직전 ✓' })], 'playtest');
    expect(p.header[4]).toBe('걸음');
    expect(p.rows[0]![4]).toBe('12 · 직전 ✓');
  });
});

describe('크레딧 소진·누적 기준 (GDD 167장 8)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = (C: any, status: number, msg: string): Error => new C(status, { type: 'error', error: { type: 'invalid_request_error', message: msg } }, msg, new Headers());
  it('크레딧 부족·키 거절은 한 줄로, 다른 오류는 null', () => {
    expect(fatalApiError(err(Anthropic.BadRequestError, 400, 'Your credit balance is too low to access the Anthropic API.'))?.kind).toBe('credit');
    expect(fatalApiError(err(Anthropic.BadRequestError, 400, 'Your credit balance is too low'))?.line).toContain('크레딧이 없다');
    expect(fatalApiError(err(Anthropic.AuthenticationError, 401, 'invalid x-api-key'))?.kind).toBe('auth');
    expect(fatalApiError(err(Anthropic.BadRequestError, 400, 'messages: field required'))).toBeNull();
    expect(fatalApiError(new Error('x'))).toBeNull();
  });
  it('누적 150 경고 · 190 정지(옵션으로 넘김)', () => {
    expect(creditGuard(10)).toEqual({ stop: false, line: null });
    expect(creditGuard(151).line).toContain('경고');
    expect(creditGuard(190).stop).toBe(true);
    expect(creditGuard(195, true).stop).toBe(false);
  });
  it('가짜 클라이언트가 크레딧 부족을 내면 상한·결과 저장 흐름으로 끝난다', async () => {
    const client: LlmClient = { create: async () => { throw err(Anthropic.BadRequestError, 400, 'Your credit balance is too low'); }, runBatch: async () => [] };
    const e = await client.create(baseParams({ system: 's', content: [{ type: 'text', text: 'u' }], schema: {}, effort: 'low', maxTokens: 10 })).catch((x) => x);
    expect(fatalApiError(e)?.kind).toBe('credit');
  });
});
