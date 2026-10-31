// ① AI 첫 플레이어 테스트 (GDD 167장 3). `npm run ai-playtest -- [옵션]`
//   --faction hollow|shinigami|both (기본 both) · --steps 250 · --budget 10(한 판 달러) · --dry-run(호출 없이 예상치) · --probe(API 없이 첫 화면 상태만 출력)
//   --url <이미 떠 있는 주소> · --out <엑셀 경로>
// 새 세이브로 실제 첫 플레이(테스트 패널 안 씀). 입력은 기기 버튼(▲▼◀▶✓·뒤로)과 '기다리기'만.
import fs from 'node:fs';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { apiKeyFromEnv, DEFAULT_BUDGET, kstStamp, mmddKst, parseArgs, PLAYTEST, ROOT } from './lib/config';
import { appendUsageLog, Budget, BudgetExceeded, costOf, emptyTally, fmtTally, type Tally } from './lib/cost';
import { filterFindings, PLAYTEST_VIEWPOINTS, SEVERITIES, type Finding } from './lib/findings';
import { baseParams, imageBlock, parseJson, realClient, type LlmClient } from './lib/llm';
import { loadPlaywright, readDoc, startVite, textStyleCore, writeXlsx } from './lib/common';

export const ACTIONS = ['up', 'down', 'left', 'right', 'confirm', 'back', 'wait'] as const;
export type Action = (typeof ACTIONS)[number];
export const ACTION_LABEL: Record<Action, string> = { up: '▲', down: '▼', left: '◀', right: '▶', confirm: '✓', back: '뒤로', wait: '기다리기' };
const ACTION_KEY: Record<Exclude<Action, 'wait'>, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', confirm: 'Enter', back: 'Escape' };

/** 목표 단계 (순서대로) */
export const MILESTONES = ['title', 'faction', 'tutorial', 'first_expedition', 'first_battle', 'absorb', 'return', 'hot_spring'] as const;
export type Milestone = (typeof MILESTONES)[number];
export const MILESTONE_KO: Record<Milestone, string> = {
  title: '시작 화면',
  faction: '종족 고르기',
  tutorial: '튜토리얼',
  first_expedition: '첫 모험',
  first_battle: '첫 전투',
  absorb: '흡수',
  return: '귀환',
  hot_spring: '온천 회복',
};

export interface StepDecision {
  screen: string;
  thought: string;
  action: Action;
  wait_sec: number;
  reached: Milestone;
  issues: { severity: (typeof SEVERITIES)[number]; viewpoint: string; problem: string; fix: string }[];
  give_up: boolean;
}

export const STEP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['screen', 'thought', 'action', 'wait_sec', 'reached', 'issues', 'give_up'],
  properties: {
    screen: { type: 'string', description: '지금 화면 이름(짧게, 예: 방, 원정 출발, 전투, 흡수 고르기)' },
    thought: { type: 'string', description: '이 버튼을 누르는 이유 한두 문장' },
    action: { type: 'string', enum: [...ACTIONS] },
    wait_sec: { type: 'integer', description: 'action 이 wait 일 때 기다릴 초(1~12). 아니면 0' },
    reached: { type: 'string', enum: [...MILESTONES], description: '지금까지 도달한 가장 먼 목표 단계' },
    issues: {
      type: 'array',
      description: '이번 화면에서 처음 느낀 문제만(이미 기록한 것은 다시 쓰지 않음). 없으면 빈 배열',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'viewpoint', 'problem', 'fix'],
        properties: {
          severity: { type: 'string', enum: [...SEVERITIES] },
          viewpoint: { type: 'string', enum: [...PLAYTEST_VIEWPOINTS] },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
    give_up: { type: 'boolean', description: '도저히 다음으로 못 나가겠으면 true' },
  },
} as const;

export function systemPrompt(): string {
  return `너는 '블리치 할로우 어센션'을 오늘 처음 켠 플레이어다. 한국어 모바일 웹 게임이고, 구형 휴대 게임기(다마고치·도트게임) 모양 화면이다.
기획자도 개발자도 아니다. 설명서도 없다. 화면에 보이는 것만 보고 판단한다.

## 조작 (실제 기기 버튼과 같다)
- ▲ / ▼ (up / down): 고를 칸(초점)을 위·아래로 옮긴다. 초점은 테두리·밝기로 표시된다.
- ◀ / ▶ (left / right): 탭·값을 좌우로 바꾸는 화면에서만 쓴다.
- ✓ (confirm): 지금 초점이 있는 칸을 누른다.
- 뒤로 (back): 창을 닫거나 이전 화면으로 간다.
- 기다리기 (wait, wait_sec 초): 자동 전투·연출·이동이 진행 중일 때 아무것도 안 누르고 본다.
화면을 직접 터치할 수는 없다. 한 걸음에 버튼 하나만 누른다.

## 이번 판 목표 (이 순서로 진행해 본다)
1 시작 화면에서 새로 시작 → 2 종족 고르기(지시받은 종족) → 3 튜토리얼 따라가기 → 4 첫 모험(원정) 나가기 → 5 첫 전투(자동 전투, 기다리며 본다) → 6 흡수(이긴 뒤 무언가 고르기) → 7 귀환(둥지로) → 8 온천에서 회복.
reached 에는 지금까지 실제로 해낸 가장 먼 단계를 쓴다(title, faction, tutorial, first_expedition, first_battle, absorb, return, hot_spring). 온천에서 회복까지 했으면 hot_spring.
튜토리얼 안내가 시키는 것은 따른다. 모르는 화면이면 ▼ 로 칸을 훑어 이름을 읽고 고른다. 같은 곳을 맴돌면 다른 칸·뒤로를 시도한다.

## 문제 기록 (issues)
처음 하는 사람으로서 헷갈림·막힘·이상함을 느낀 순간에만 기록한다. 같은 문제는 한 번만(이미 기록한 목록을 보고 겹치면 쓰지 않는다).
- problem: 플레이어 눈으로 한 문장. 무엇이·어디서 이상한지. 예: "흡수 화면에서 어떤 걸 골라야 좋은지 아무 설명이 없어 아무거나 눌렀다."
- fix: 추천 수정 한 문장, '~다' 체. 예: "후보 카드마다 한 줄 효과를 보여 준다."
- severity: 상 = 첫 플레이에서 바로 걸림(진행 못 함·잘못 누름·뜻을 모름), 중 = 어색함, 하 = 다듬기.
- viewpoint: 아래 관점 중 하나, 또는 '진행 막힘'(어디로 가야 할지 모름·버튼으로 못 감).
지적하지 않는 것: 그림이 아직 없는 자리(빈 아이콘·실루엣), '임시' 표시, 기기 크기·비율, 테스트 모드 관련.
캐릭터 대사·분위기 글은 말투 규칙 대상이 아니다.

## 관점 (docs/ui-review.md)
${readDoc('docs/ui-review.md').split('## 관점')[1]?.split('## 결과 형식')[0] ?? ''}

## 문구 말투 요지 (docs/text-style.md)
${textStyleCore().split('## 2. 말투')[1]?.split('## 3.')[0] ?? ''}

## 답
JSON 하나로만 답한다(스키마대로). thought 는 짧게.`;
}

export interface PageState {
  text: string;
  focus: string;
  layers: string[];
  options: string[];
  toasts: string[];
}

/** 페이지 안: 플레이어가 지금 보는 글자·초점·열린 창·고를 수 있는 칸 */
export function stateInPage(): PageState {
  const lcd = document.querySelector('.bha-lcd') as HTMLElement | null;
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  if (!lcd) return { text: clean(document.body.innerText).slice(0, 1500), focus: '', layers: [], options: [], toasts: [] };
  const sel = lcd.querySelector('.bha-sel') as HTMLElement | null;
  const layersEl = [...lcd.querySelectorAll('[data-dev-layer]')] as HTMLElement[];
  const scope = (layersEl[layersEl.length - 1] as HTMLElement | undefined) || (sel?.closest('.bha-overlay') as HTMLElement | null) || lcd;
  const SEL = 'button, a[href], input, select, summary, [role="tab"], [data-dev-press]';
  const vis = (e: Element) => !e.closest('[hidden], [inert], .bha-dev__side, [data-dev-skip]') && !(e as HTMLButtonElement).disabled && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const label = (e: Element) => clean(e.getAttribute('aria-label') || (e as HTMLElement).innerText || e.textContent).slice(0, 40);
  const options = [...scope.querySelectorAll(SEL)].filter(vis).slice(0, 30).map((e) => (sel && (e === sel || e.contains(sel) || sel.contains(e)) ? '▶ ' : '  ') + label(e));
  return {
    text: (lcd.innerText ?? '').replace(/\n{2,}/g, '\n').trim().slice(0, 1800),
    focus: sel ? label(sel) : '',
    layers: layersEl.map((l) => clean(l.querySelector('h1,h2,h3,[class*="title"]')?.textContent || l.className).slice(0, 40)),
    options,
    toasts: [...document.querySelectorAll('.bha-toast')].map((t) => clean(t.textContent).slice(0, 60)),
  };
}

export interface HistoryLine {
  step: number;
  action: Action;
  screen: string;
  thought: string;
}

export function userContent(o: { step: number; maxSteps: number; factionKo: string; reached: Milestone; history: HistoryLine[]; issuesSoFar: string[]; state: PageState; png: Buffer | null }): Anthropic.ContentBlockParam[] {
  const s = o.state;
  const hist = o.history.map((h) => `${h.step} [${h.screen}] ${ACTION_LABEL[h.action]} — ${h.thought}`).join('\n') || '(없음)';
  const text = `종족: ${o.factionKo} 로 시작한다.
걸음 ${o.step}/${o.maxSteps} · 지금까지 도달: ${MILESTONE_KO[o.reached]}
최근 걸음:
${hist}
이미 기록한 문제:
${o.issuesSoFar.map((x) => `- ${x}`).join('\n') || '(없음)'}

지금 화면 글자:
${s.text || '(없음)'}
지금 초점: ${s.focus || '(없음)'}
열린 창: ${s.layers.join(' / ') || '(없음)'}
알림: ${s.toasts.join(' / ') || '(없음)'}
고를 수 있는 칸(▲▼ 순서, ▶ = 지금 초점):
${s.options.join('\n') || '(없음)'}`;
  return o.png ? [imageBlock(o.png), { type: 'text', text }] : [{ type: 'text', text }];
}

/** 화면이 그대로인가(초점만 바뀐 건 같은 화면) — 막힘 판정용 */
export const screenSig = (s: PageState) => `${s.layers.join('|')}#${s.text.slice(0, 400)}`;

/** 최근 n 걸음 동안 화면 글자가 하나도 안 바뀌었으면 막힘 */
export function isStuck(sigs: string[], n: number): boolean {
  if (sigs.length < n) return false;
  const last = sigs.slice(-n);
  return last.every((x) => x === last[0]);
}

/** 예상치 (--dry-run): 걸음마다 시스템 캐시 읽기 + 사용자 글자·캡처 + 출력 */
export function estimatePlaytest(steps: number, systemChars: number): Tally {
  const sys = Math.round(systemChars * 0.9);
  const per = { input_tokens: 1700 + 600, output_tokens: 700, cache_read_input_tokens: sys, cache_creation_input_tokens: 0 };
  const t = emptyTally();
  t.requests = steps;
  t.input = per.input_tokens * steps;
  t.output = per.output_tokens * steps;
  t.cacheRead = sys * (steps - 1);
  t.cacheWrite = sys;
  t.usd = costOf(per) * steps + costOf({ cache_creation_input_tokens: sys }) - costOf({ cache_read_input_tokens: sys });
  return t;
}

export interface RunResult {
  faction: string;
  steps: number;
  reached: Milestone;
  end: string;
  findings: Finding[];
  pageErrors: string[];
  tally: Tally;
}

/** 한 종족 한 판 */
export async function playOne(o: { client: LlmClient; url: string; faction: 'hollow' | 'shinigami'; maxSteps: number; budget: Budget; shotDir: string; log: (s: string) => void }): Promise<RunResult> {
  const { chromium } = loadPlaywright();
  const factionKo = o.faction === 'hollow' ? '호로' : '사신';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: PLAYTEST.viewport, deviceScaleFactor: 1 });
  const pageErrors: string[] = [];
  page.on('pageerror', (e: Error) => pageErrors.push(e.message.slice(0, 160)));
  await page.goto(o.url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(o.url);
  await page.waitForTimeout(1500);
  const system = systemPrompt();
  const history: HistoryLine[] = [];
  const sigs: string[] = [];
  const findings: Finding[] = [];
  let reached: Milestone = 'title';
  let end = '걸음 상한';
  let step = 0;
  const startUsd = o.budget.tally.usd;
  try {
    for (step = 1; step <= o.maxSteps; step++) {
      const state = (await page.evaluate(stateInPage)) as PageState;
      sigs.push(screenSig(state));
      if (isStuck(sigs, PLAYTEST.stuckSteps)) {
        end = `막힘(같은 화면 ${PLAYTEST.stuckSteps}걸음)`;
        const png = await page.screenshot();
        const file = path.join(o.shotDir, `playtest-${o.faction}-${String(step).padStart(3, '0')}.png`);
        fs.writeFileSync(file, png);
        findings.push({ severity: '상', group: MILESTONE_KO[reached], screen: history[history.length - 1]?.screen ?? '?', faction: o.faction, viewpoint: '진행 막힘', problem: `같은 화면에서 ${PLAYTEST.stuckSteps}걸음 동안 다음으로 못 나갔다(마지막 생각: ${history[history.length - 1]?.thought ?? ''})`, fix: '이 화면에서 다음에 할 일을 안내하거나 초점이 갈 곳을 분명히 한다.', shot: file, step: `${step} · 막힘` });
        break;
      }
      o.budget.assertRoom(0.06); // 다음 한 걸음 여유
      const png = (await page.screenshot()) as Buffer;
      const params = baseParams({
        system,
        content: userContent({ step, maxSteps: o.maxSteps, factionKo, reached, history: history.slice(-PLAYTEST.historySteps), issuesSoFar: findings.map((f) => `[${f.screen}] ${f.problem}`), state, png }),
        schema: STEP_SCHEMA as unknown as Record<string, unknown>,
        effort: PLAYTEST.effort,
        maxTokens: PLAYTEST.maxTokens,
      });
      const msg = await o.client.create(params);
      o.budget.add(msg.usage);
      const d = parseJson<StepDecision>(msg);
      if (!d || !ACTIONS.includes(d.action)) {
        o.log(`  ${step}: 답 해석 실패(${msg.stop_reason}) — 기다리기`);
        history.push({ step, action: 'wait', screen: '?', thought: '(답 해석 실패)' });
        await page.waitForTimeout(1500);
        continue;
      }
      if (MILESTONES.indexOf(d.reached) > MILESTONES.indexOf(reached)) reached = d.reached;
      const prevKey = history[history.length - 1];
      if (d.issues.length) {
        const file = path.join(o.shotDir, `playtest-${o.faction}-${String(step).padStart(3, '0')}.png`);
        fs.writeFileSync(file, png);
        for (const i of d.issues) findings.push({ severity: i.severity, group: MILESTONE_KO[reached], screen: d.screen, faction: o.faction, viewpoint: i.viewpoint, problem: i.problem, fix: i.fix, shot: file, step: `${step} · 직전 ${prevKey ? ACTION_LABEL[prevKey.action] : '-'}` });
      }
      history.push({ step, action: d.action, screen: d.screen, thought: d.thought.slice(0, 120) });
      o.log(`  ${step} [${d.screen}] ${ACTION_LABEL[d.action]}${d.action === 'wait' ? ` ${d.wait_sec}초` : ''} · ${MILESTONE_KO[reached]} · $${(o.budget.tally.usd - startUsd).toFixed(3)}${d.issues.length ? ` · 문제 ${d.issues.length}` : ''}`);
      if (reached === 'hot_spring') {
        end = '목표 완료(온천 회복)';
        break;
      }
      if (d.give_up) {
        end = '포기(AI 가 못 나간다고 판단)';
        break;
      }
      if (d.action === 'wait') await page.waitForTimeout(Math.min(Math.max(d.wait_sec || PLAYTEST.waitDefaultSec, 1), PLAYTEST.waitMaxSec) * 1000);
      else {
        await page.keyboard.press(ACTION_KEY[d.action]);
        await page.waitForTimeout(700);
      }
    }
  } catch (e) {
    if (e instanceof BudgetExceeded) end = `금액 상한($${e.cap})`;
    else {
      end = `오류: ${String((e as Error).message).slice(0, 120)}`;
      o.log(`  ${end}`);
    }
  } finally {
    await browser.close();
  }
  const tally = { ...o.budget.tally, usd: o.budget.tally.usd - startUsd };
  return { faction: o.faction, steps: Math.min(step, o.maxSteps), reached, end, findings, pageErrors: [...new Set(pageErrors)], tally };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const which = String(args.faction ?? 'both');
  const factions: ('hollow' | 'shinigami')[] = which === 'both' ? ['hollow', 'shinigami'] : [which as 'hollow' | 'shinigami'];
  const maxSteps = Number(args.steps ?? PLAYTEST.maxSteps);
  const cap = Number(args.budget ?? DEFAULT_BUDGET.playtest);
  const mmdd = mmddKst();
  const key = apiKeyFromEnv();
  if (args['dry-run'] || !key) {
    if (!key) console.log('BHA_CLAUDE_API_KEY 없음 → --dry-run 으로만 돈다');
    const est = estimatePlaytest(maxSteps, systemPrompt().length);
    console.log(`[dry-run] 종족 ${factions.length}개 × 걸음 상한 ${maxSteps}`);
    console.log(`  한 판 최대 예상: ${fmtTally(est)} (상한 $${cap})`);
    console.log(`  전체 최대 예상: $${(est.usd * factions.length).toFixed(2)}`);
    return;
  }
  const server = await startVite(5198, typeof args.url === 'string' ? args.url : undefined);
  if (args.probe) {
    const { chromium } = loadPlaywright();
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: PLAYTEST.viewport, deviceScaleFactor: 1 });
    await p.goto(server.url);
    await p.evaluate(() => localStorage.clear());
    await p.goto(server.url);
    await p.waitForTimeout(1500);
    console.log(JSON.stringify(await p.evaluate(stateInPage), null, 1));
    await b.close();
    server.stop();
    return;
  }
  const shotDir = path.join(ROOT, 'docs/drafts/ai-shots', mmdd);
  fs.mkdirSync(shotDir, { recursive: true });
  const client = realClient(key);
  const results: RunResult[] = [];
  const usageFile = path.join(ROOT, 'docs/drafts/ai-usage.md');
  try {
    for (const f of factions) {
      console.log(`== ${f} 시작 (상한 $${cap}, 걸음 ${maxSteps})`);
      const budget = new Budget(cap);
      const r = await playOne({ client, url: server.url, faction: f, maxSteps, budget, shotDir, log: (s) => console.log(s) });
      results.push(r);
      console.log(`== ${f} 끝: ${r.end} · 걸음 ${r.steps} · 도달 ${MILESTONE_KO[r.reached]} · 문제 ${r.findings.length} · ${fmtTally(r.tally)}`);
      const cum = appendUsageLog(usageFile, { date: kstStamp(), tool: 'ai-playtest', target: f === 'hollow' ? '호로' : '사신', count: `${r.steps}걸음`, tally: r.tally, memo: `${r.end} · 도달 ${MILESTONE_KO[r.reached]} · 문제 ${r.findings.length}` });
      console.log(`   누적 $${cum.toFixed(3)}`);
    }
  } finally {
    server.stop();
  }
  const all = results.flatMap((r) => r.findings);
  const { kept, dropped } = filterFindings(all, []);
  const out = typeof args.out === 'string' ? args.out : path.join(ROOT, `docs/drafts/블리치_AI검수_${mmdd}_playtest.xlsx`);
  const total = results.reduce((s, r) => s + r.tally.usd, 0);
  writeXlsx(out, 'playtest', kept, {
    title: `AI 첫 플레이어 테스트 (${mmdd}, GDD 167장 ①)`,
    sub: `npm run ai-playtest · 모델 claude-opus-5-5 · 새 세이브·기기 버튼만 · 걸음 상한 ${maxSteps} · 쓴 금액 $${total.toFixed(3)}`,
    summary: [
      ...results.map((r) => `${r.faction === 'hollow' ? '호로' : '사신'}: ${r.end} · ${r.steps}걸음 · 도달 ${MILESTONE_KO[r.reached]} · 문제 ${r.findings.length}건 · $${r.tally.usd.toFixed(3)}`),
      ...results.flatMap((r) => r.pageErrors.map((e) => `스크립트 오류(${r.faction}): ${e}`)),
      `같은 문제 합침·제외로 뺀 것 ${dropped.length}건${dropped.length ? ': ' + dropped.map((d) => `${d.finding.screen}(${d.reason})`).join(', ') : ''}`,
      '고칠까(O/X) 칸에 표시하면 마스터가 새 장 + 코딩 세션으로 넘긴다. 도구는 게임 코드를 고치지 않는다.',
    ],
  });
  console.log(`총 $${total.toFixed(3)} · 엑셀 ${out}`);
}

if (!process.env.VITEST) main().catch((e) => {
  console.error(String(e?.message ?? e).replace(/sk-ant-[\w-]+/g, '[키 숨김]'));
  process.exit(1);
});
