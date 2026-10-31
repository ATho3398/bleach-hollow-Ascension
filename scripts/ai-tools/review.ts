// ② 자동 UI·문구 검수 (GDD 167장 4). `npm run ai-review -- [옵션]`
//   --shots <폴더>(이미 찍은 ui-audit 캡처 다시 쓰기, 없으면 UI_AUDIT_SHOTS 로 새로 찍음) · --budget 8(달러) · --dry-run · --no-text(문구 검수 빼기)
//   --only-ui / --only-text · --out <엑셀 경로>
// 흐름: 화면 캡처+글자 → Batch 검수(ui-review.md 7관점) + 게임 문구 Batch 검수(text-style.md) → 확인 Batch(진짜 문제인지·지난 검수와 같은지) → 제외 규칙 → 엑셀.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { apiKeyFromEnv, DEFAULT_BUDGET, kstStamp, mmddKst, parseArgs, REVIEW, ROOT } from './lib/config';
import { appendUsageLog, Budget, costOf, fmtTally, type Tally } from './lib/cost';
import { filterFindings, SEVERITIES, VIEWPOINTS, type Finding, type PriorItem } from './lib/findings';
import { baseParams, imageBlock, parseJson, realClient, type BatchItem, type LlmClient } from './lib/llm';
import { readDoc, textStyleCore, writeXlsx } from './lib/common';

// ───────── 재료 모으기 ─────────

export interface Shot {
  file: string;
  faction: string;
  screen: string;
  group: string;
  text: string;
}

/** ui-audit 캡처 폴더 → 화면 목록(테스트_* 제외). 파일 이름 = <faction>-<화면>.png, 같은 이름 .txt = 화면 글자 */
export function listShots(dir: string): Shot[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .flatMap((f) => {
      const m = /^(hollow|shinigami)-(.+)\.png$/.exec(f);
      if (!m) return [];
      const screen = m[2]!.replace(/_/g, ' ').trim();
      if (/^테스트/.test(screen)) return [];
      const txt = path.join(dir, f.replace(/\.png$/, '.txt'));
      return [{ file: path.join(dir, f), faction: m[1]!, screen, group: screen.split(' ')[0]!, text: fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8').slice(0, 1500) : '' }];
    });
}

/** 같은 묶음(화면 이름 첫 낱말)끼리 붙여 요청 하나에 n장까지 */
export function packShots(shots: Shot[], n: number): Shot[][] {
  const groups = new Map<string, Shot[]>();
  for (const s of shots) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
  const packs: Shot[][] = [];
  let cur: Shot[] = [];
  for (const g of groups.values()) {
    if (cur.length && cur.length + g.length > n) {
      packs.push(cur);
      cur = [];
    }
    for (const s of g) {
      if (cur.length >= n) {
        packs.push(cur);
        cur = [];
      }
      cur.push(s);
    }
  }
  if (cur.length) packs.push(cur);
  return packs;
}

export interface TextLine {
  source: string;
  text: string;
}

/** 게임 문구: src/data/**.json 의 한글 문자열(story = 캐릭터 대사라 뺌) + 화면 ts 의 한글 문자열(주석·테스트 패널 제외). 같은 문구는 한 번 */
export function collectGameText(root = ROOT): TextLine[] {
  const out: TextLine[] = [];
  const seen = new Set<string>();
  const push = (source: string, text: string) => {
    const t = text.trim();
    if (!/[가-힣]/.test(t) || t.length < 2 || seen.has(t)) return;
    seen.add(t);
    out.push({ source, text: t });
  };
  const walk = (d: string, fn: (p: string) => void) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p, fn);
      else fn(p);
    }
  };
  walk(path.join(root, 'src/data'), (p) => {
    if (!p.endsWith('.json') || p.includes(`${path.sep}story${path.sep}`)) return;
    const rel = path.relative(root, p);
    const visit = (o: unknown, key: string) => {
      if (typeof o === 'string') push(`${rel}:${key}`, o);
      else if (Array.isArray(o)) o.forEach((v, i) => visit(v, `${key}[${i}]`));
      else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) visit(v, key ? `${key}.${k}` : k);
    };
    visit(JSON.parse(fs.readFileSync(p, 'utf8')), '');
  });
  walk(path.join(root, 'src/ui'), (p) => {
    if (!p.endsWith('.ts') || /test/i.test(path.basename(p))) return;
    const rel = path.relative(root, p);
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/\/\*.*?\*\//g, '');
      for (const m of code.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) push(`${rel}:${i + 1}`, m[1] ?? m[2] ?? m[3] ?? '');
    });
  });
  return out;
}

export function packText(lines: TextLine[], maxChars: number): TextLine[][] {
  const packs: TextLine[][] = [];
  let cur: TextLine[] = [];
  let n = 0;
  for (const l of lines) {
    const len = l.source.length + l.text.length + 4;
    if (cur.length && n + len > maxChars) {
      packs.push(cur);
      cur = [];
      n = 0;
    }
    cur.push(l);
    n += len;
  }
  if (cur.length) packs.push(cur);
  return packs;
}

export function loadPrior(): PriorItem[] {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/ai-tools/data/prior-review-1031.json'), 'utf8')) as PriorItem[];
}

// ───────── 지시문·스키마 ─────────

const EXCLUDE_NOTE = `지적하지 않는 것(이미 정함):
- 테스트 모드 패널·'테스트' 배지·테스트로 띄운 토스트.
- 그림이 아직 없는 자리(빈 아이콘·실루엣·임시 배경) 자체. 배치 문제는 지적한다.
- 기기 크기·비율.
- '임시' 표시(이름이 안 정해진 것에 붙인 표시 — 사용자가 그대로 두기로 함).
- 지난 검수에서 이미 올린 같은 화면·같은 문제(확인 단계에서 목록을 준다).`;

export function uiSystem(): string {
  return `너는 '블리치 할로우 어센션'(한국어 모바일 웹 게임, 구형 휴대 게임기·도트게임 모양 화면 844×390) UI 검수자다. "처음 하는 플레이어" 눈으로 화면 캡처와 화면 글자를 본다.
화면은 ▲▼✓◀ 기기 버튼으로 조작한다. 캡처는 자동 검수 스크립트가 찍은 것이다(테스트 모드 세이브라 상단 '테스트' 배지가 보일 수 있다 — 무시).

${readDoc('docs/ui-review.md')}

## 문구 규칙 요지 (docs/text-style.md 1~5)
${textStyleCore()}

${EXCLUDE_NOTE}

## 답
- 캡처마다 실제로 보이는 문제만. 추측·일반론 금지. 확실하지 않으면 쓰지 않는다.
- problem = 플레이어 눈으로 한 문장(무엇이·어디서). fix = 추천 수정 한 문장, '~다' 체.
- shot 에는 문제가 보이는 캡처 번호(예 3)를 쓴다. 두 종족 캡처에 같은 문제가 있으면 한 번만 쓰고 both=true.
- viewpoint 는 7관점 이름 중 하나. severity: 상 = 첫 플레이에서 바로 걸림, 중 = 어색함, 하 = 다듬기.
JSON 하나로만 답한다.`;
}

export const UI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['shot', 'screen', 'both', 'severity', 'viewpoint', 'problem', 'fix'],
        properties: {
          shot: { type: 'integer' },
          screen: { type: 'string' },
          both: { type: 'boolean' },
          severity: { type: 'string', enum: [...SEVERITIES] },
          viewpoint: { type: 'string', enum: [...VIEWPOINTS] },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
  },
} as const;

export function textSystem(): string {
  return `너는 '블리치 할로우 어센션'(한국어 게임) 문구 검수자다. 아래 규칙(docs/text-style.md)에 어긋나는 게임 문구를 찾는다.

${textStyleCore()}

추가 기준(docs/ui-review.md 5 문구 말투): 어색한 말·번역투·같은 말 반복·조사 오류(을(를) 그대로 노출 — 단 '이(가)'·'(으)로' 표기는 fixParticles 가 고치므로 소스에 있는 것은 정상).
대상 아님: 캐릭터 대사·외침·전투 기록·분위기 글(flavor)·버튼 이름·짧은 라벨·id·영문 키·코드 조각(클래스 이름, 선택자, 템플릿 \${…} 자체).
템플릿 문자열의 \${…} 자리는 실행 때 값이 들어가므로 그 자체는 문제 아님.
'임시' 표시는 지적하지 않는다. 확실한 위반만 쓴다. 같은 종류 위반이 여러 줄이면 대표 줄 하나에 '같은 꼴 n줄'을 problem 에 적는다.
problem = 무엇이 규칙과 다른지 한 문장. fix = 고친 문구(또는 고치는 법) 한 문장. severity: 상 = 플레이어가 뜻을 오해, 중 = 말투·서식 어긋남, 하 = 다듬기.
JSON 하나로만 답한다.`;
}

export const TEXT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['line', 'severity', 'problem', 'fix'],
        properties: {
          line: { type: 'integer', description: '문구 줄 번호' },
          severity: { type: 'string', enum: [...SEVERITIES] },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
  },
} as const;

export function verifySystem(prior: PriorItem[]): string {
  return `너는 게임 UI·문구 검수의 확인 담당이다. 다른 검수자가 올린 지적을 하나씩 다시 보고, 캡처·원문에서 정말 보이는 진짜 문제인지 판정한다(10-31 UI 검수와 같은 방식).
- keep=false: 캡처·원문에 그런 것이 안 보임, 잘못 읽음, 너무 주관적·일반론, 테스트 화면 관련, 그림 없음 자체, 기기 크기·비율, '임시' 표시, 문구 규칙의 '대상 아님'(캐릭터 대사·버튼 이름·짧은 라벨·코드 조각).
- duplicate_of: 아래 '지난 검수' 목록과 같은 화면·같은 문제면 그 번호(같지 않으면 0). 사용자가 x(안 고침)로 표시한 것도 같은 문제면 번호를 쓴다.
- reason: 한 줄.
${EXCLUDE_NOTE}

## 지난 검수 (2026-10-31, 1~111번 — 마크 o=고침, x=안 고침, 빈칸=미정)
${prior.map((p) => `${p.no}. [${p.screen}] (${p.viewpoint}) ${p.problem}${p.mark ? ` {${p.mark}}` : ''}`).join('\n')}

JSON 하나로만 답한다.`;
}

export const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'keep', 'duplicate_of', 'reason'],
        properties: { id: { type: 'integer' }, keep: { type: 'boolean' }, duplicate_of: { type: 'integer' }, reason: { type: 'string' } },
      },
    },
  },
} as const;

// ───────── 요청 만들기 ─────────

export function uiRequest(id: string, pack: Shot[], system: string): BatchItem {
  const content: Anthropic.ContentBlockParam[] = [];
  pack.forEach((s, i) => {
    content.push({ type: 'text', text: `캡처 ${i + 1}: ${s.faction === 'hollow' ? '호로' : '사신'} · ${s.screen}\n화면 글자:\n${s.text || '(없음)'}` });
    content.push(imageBlock(fs.readFileSync(s.file)));
  });
  content.push({ type: 'text', text: '위 캡처들을 검수해 findings 로 답한다.' });
  return { custom_id: id, params: baseParams({ system, content, schema: UI_SCHEMA as unknown as Record<string, unknown>, effort: REVIEW.effort, maxTokens: REVIEW.maxTokens }) };
}

export function textRequest(id: string, pack: TextLine[], system: string): BatchItem {
  const body = pack.map((l, i) => `${i + 1}\t${l.source}\t${l.text.replace(/\n/g, '⏎')}`).join('\n');
  return { custom_id: id, params: baseParams({ system, content: [{ type: 'text', text: `문구 목록(줄 번호 · 위치 · 문구):\n${body}` }], schema: TEXT_SCHEMA as unknown as Record<string, unknown>, effort: REVIEW.effort, maxTokens: REVIEW.maxTokens }) };
}

/** 확인 요청: 묶음 하나의 지적들 + (UI 면 그 캡처들 / 문구면 원문) */
export function verifyRequest(id: string, items: Finding[], system: string): BatchItem {
  const content: Anthropic.ContentBlockParam[] = [];
  const shots = [...new Set(items.map((f) => f.shot).filter(Boolean))];
  shots.forEach((s, i) => {
    content.push({ type: 'text', text: `캡처 ${String.fromCharCode(65 + i)}: ${path.basename(s)}` });
    content.push(imageBlock(fs.readFileSync(s)));
  });
  const list = items
    .map((f, i) => `${i + 1}. [${f.screen}] (${f.viewpoint}, ${f.severity})${f.shot ? ` 캡처 ${String.fromCharCode(65 + shots.indexOf(f.shot))}` : ''}${f.source ? ` 원문 위치 ${f.source}` : ''}\n   문제: ${f.problem}\n   추천: ${f.fix}`)
    .join('\n');
  content.push({ type: 'text', text: `확인할 지적:\n${list}\n\n지적마다 verdicts 를 답한다(id = 번호).` });
  return { custom_id: id, params: baseParams({ system, content, schema: VERIFY_SCHEMA as unknown as Record<string, unknown>, effort: REVIEW.effort, maxTokens: 6000 }) };
}

/** 대략 토큰 예상(글자 수·캡처 수) — Batch 는 중간에 못 멈추므로 내기 전에 상한을 본다 */
export function estimateItem(it: BatchItem): { input_tokens: number; output_tokens: number; cache_read_input_tokens: number } {
  let chars = 0;
  let images = 0;
  for (const c of it.params.messages[0]!.content as Anthropic.ContentBlockParam[]) {
    if (c.type === 'text') chars += c.text.length;
    else if (c.type === 'image') images++;
  }
  const sys = (it.params.system as Anthropic.TextBlockParam[])[0]!.text.length;
  return { input_tokens: Math.round(chars * 0.9) + images * 480, cache_read_input_tokens: Math.round(sys * 0.9), output_tokens: 2500 };
}

export function estimateBatch(items: BatchItem[]): number {
  return items.reduce((s, it) => s + costOf({ ...estimateItem(it), cache_creation_input_tokens: 0 }, { batch: true }), 0) * 1.3;
}

/** Batch 결과 → 지적 목록 (UI) */
export function uiFindingsOf(pack: Shot[], parsed: { findings: { shot: number; screen: string; both: boolean; severity: Finding['severity']; viewpoint: string; problem: string; fix: string }[] } | null, group: string): Finding[] {
  if (!parsed) return [];
  return parsed.findings.flatMap((f) => {
    const s = pack[f.shot - 1] ?? pack[0];
    if (!s) return [];
    return [{ severity: f.severity, group, screen: f.screen || s.screen, faction: f.both ? '둘 다' : s.faction, viewpoint: f.viewpoint, problem: f.problem, fix: f.fix, shot: s.file }];
  });
}

export function textFindingsOf(pack: TextLine[], parsed: { findings: { line: number; severity: Finding['severity']; problem: string; fix: string }[] } | null): Finding[] {
  if (!parsed) return [];
  return parsed.findings.flatMap((f) => {
    const l = pack[f.line - 1];
    if (!l) return [];
    return [{ severity: f.severity, group: '문구', screen: `문구: ${l.source.split(':')[0]}`, faction: '둘 다', viewpoint: '말투', problem: `'${l.text.slice(0, 80)}' — ${f.problem}`, fix: f.fix, shot: '', source: l.source }];
  });
}

/** 확인 결과 적용: keep 이고 지난 검수와 안 겹치는 것만 */
export function applyVerdicts(items: Finding[], parsed: { verdicts: { id: number; keep: boolean; duplicate_of: number; reason: string }[] } | null): { kept: Finding[]; dropped: { finding: Finding; reason: string }[] } {
  if (!parsed) return { kept: items, dropped: [] };
  const kept: Finding[] = [];
  const dropped: { finding: Finding; reason: string }[] = [];
  items.forEach((f, i) => {
    const v = parsed.verdicts.find((x) => x.id === i + 1);
    if (!v || (v.keep && !v.duplicate_of)) kept.push(f);
    else dropped.push({ finding: f, reason: v.duplicate_of ? `지난 검수 ${v.duplicate_of}번과 같음` : `확인에서 뺌: ${v.reason}` });
  });
  return { kept, dropped };
}

// ───────── 실행 ─────────

async function runStage(client: LlmClient, budget: Budget, items: BatchItem[], label: string, idFile: string) {
  const est = estimateBatch(items);
  console.log(`[${label}] 요청 ${items.length}개 · 예상 $${est.toFixed(2)} (지금까지 $${budget.tally.usd.toFixed(3)} / 상한 $${budget.cap})`);
  if (budget.tally.usd + est > budget.cap) throw new Error(`금액 상한: ${label} 예상 $${est.toFixed(2)} 를 더하면 상한을 넘는다`);
  const res = await client.runBatch(items, { pollSec: REVIEW.pollSec, idFile, onPoll: (s) => console.log(`  ${kstStamp()} ${label}: ${s}`) });
  for (const r of res) if (r.message) budget.add(r.message.usage, { batch: true });
  const errs = res.filter((r) => r.error);
  if (errs.length) console.log(`  오류 ${errs.length}: ${errs.map((e) => `${e.custom_id}=${e.error}`).join(', ')}`);
  return new Map(res.map((r) => [r.custom_id, r.message]));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cap = Number(args.budget ?? DEFAULT_BUDGET.review);
  const mmdd = mmddKst();
  const doUi = !args['only-text'];
  const doText = !args['only-ui'] && !args['no-text'];
  const workDir = path.join(ROOT, 'scripts/ai-tools/out');
  fs.mkdirSync(workDir, { recursive: true });
  let shotDir = typeof args.shots === 'string' ? path.resolve(args.shots) : path.join(workDir, `shots-${mmdd}`);
  const key = apiKeyFromEnv();
  const dry = !!args['dry-run'] || !key;
  if (doUi && !(typeof args.shots === 'string' && fs.existsSync(shotDir))) {
    if (dry && !fs.existsSync(shotDir)) shotDir = '';
    else if (!fs.existsSync(shotDir) || !fs.readdirSync(shotDir).some((f) => f.endsWith('.png'))) {
      console.log(`ui-audit 로 전 화면 캡처 → ${shotDir} (몇 분 걸린다)`);
      spawnSync('node', ['scripts/ui-audit/audit.cjs'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, UI_AUDIT_SHOTS: shotDir } });
    }
  }
  const shots = doUi && shotDir ? listShots(shotDir) : [];
  const uiPacks = packShots(shots, REVIEW.shotsPerRequest);
  const textPacks = doText ? packText(collectGameText(), REVIEW.textCharsPerRequest) : [];
  const uiSys = uiSystem();
  const txSys = textSystem();
  const uiItems = uiPacks.map((p, i) => uiRequest(`ui-${i}`, p, uiSys));
  const txItems = textPacks.map((p, i) => textRequest(`tx-${i}`, p, txSys));
  if (dry) {
    if (!key) console.log('BHA_CLAUDE_API_KEY 없음 → --dry-run 으로만 돈다');
    const e1 = estimateBatch([...uiItems, ...txItems]);
    console.log(`[dry-run] 캡처 ${shots.length}장 → UI 요청 ${uiItems.length}개 · 문구 ${textPacks.reduce((s, p) => s + p.length, 0)}줄 → 문구 요청 ${txItems.length}개`);
    console.log(`  검수 예상 $${e1.toFixed(2)} + 확인 예상 약 $${(e1 * 0.6).toFixed(2)} (Batch 반값 반영, 상한 $${cap})${shots.length ? '' : ' — 캡처가 없어 UI 는 0으로 셈'}`);
    return;
  }
  const client = realClient(key!);
  const budget = new Budget(cap);
  const prior = loadPrior();
  let candidates: { group: string; items: Finding[] }[] = [];
  const notes: string[] = [];
  let finalKept: Finding[] = [];
  const allDropped: { finding: Finding; reason: string }[] = [];
  try {
    const res = await runStage(client, budget, [...uiItems, ...txItems], '검수', path.join(workDir, 'batch-review.id'));
    uiPacks.forEach((p, i) => {
      const m = res.get(`ui-${i}`);
      const items = uiFindingsOf(p, m ? parseJson(m) : null, p[0]!.group);
      if (items.length) candidates.push({ group: `ui-${i}`, items });
    });
    textPacks.forEach((p, i) => {
      const m = res.get(`tx-${i}`);
      const items = textFindingsOf(p, m ? parseJson(m) : null);
      if (items.length) candidates.push({ group: `tx-${i}`, items });
    });
    fs.writeFileSync(path.join(workDir, `review-candidates-${mmdd}.json`), JSON.stringify(candidates, null, 1));
    const nCand = candidates.reduce((s, c) => s + c.items.length, 0);
    console.log(`검수 지적 ${nCand}건 → 확인 단계`);
    // 지난 검수와 글자로 확실히 같은 것은 확인 전에 뺀다(돈 아끼기)
    candidates = candidates.map((c) => {
      const pre = filterFindings(c.items, prior);
      allDropped.push(...pre.dropped);
      return { group: c.group, items: c.items.filter((f) => !pre.dropped.some((d) => d.finding === f)) };
    }).filter((c) => c.items.length);
    const vSys = verifySystem(prior);
    const vItems = candidates.map((c) => verifyRequest(`v-${c.group}`, c.items, vSys));
    try {
      const vres = await runStage(client, budget, vItems, '확인', path.join(workDir, 'batch-verify.id'));
      for (const c of candidates) {
        const m = vres.get(`v-${c.group}`);
        const r = applyVerdicts(c.items, m ? parseJson(m) : null);
        finalKept.push(...r.kept);
        allDropped.push(...r.dropped);
      }
    } catch (e) {
      notes.push(`확인 단계 못 함(${(e as Error).message}) — 아래 지적은 확인 전 결과`);
      finalKept = candidates.flatMap((c) => c.items);
    }
  } catch (e) {
    notes.push(`중단: ${(e as Error).message}`);
    console.log(`중단: ${(e as Error).message}`);
    if (!finalKept.length) finalKept = candidates.flatMap((c) => c.items);
  }
  const { kept, dropped } = filterFindings(finalKept, prior);
  allDropped.push(...dropped);
  // 남은 지적의 캡처는 docs/drafts/ai-shots/<MMDD>/review-*.png 로 복사(엑셀 썸네일·보고용)
  const shotOut = path.join(ROOT, 'docs/drafts/ai-shots', mmdd);
  fs.mkdirSync(shotOut, { recursive: true });
  for (const f of kept) {
    if (!f.shot) continue;
    const dst = path.join(shotOut, `review-${path.basename(f.shot)}`);
    if (!fs.existsSync(dst)) fs.copyFileSync(f.shot, dst);
    f.shot = dst;
  }
  const t: Tally = budget.tally;
  const out = typeof args.out === 'string' ? args.out : path.join(ROOT, `docs/drafts/블리치_AI검수_${mmdd}_review.xlsx`);
  const why = new Map<string, number>();
  for (const d of allDropped) {
    const k = d.reason.startsWith('지난 검수') ? '지난 검수와 같음' : d.reason.startsWith('확인에서') ? '확인에서 뺌' : d.reason;
    why.set(k, (why.get(k) ?? 0) + 1);
  }
  writeXlsx(out, 'review', kept, {
    title: `AI UI·문구 검수 (${mmdd}, GDD 167장 ②)`,
    sub: `npm run ai-review · claude-opus-5-5 Batch · 캡처 ${shots.length}장(${uiItems.length}요청) · 문구 ${txItems.length}요청 · 쓴 금액 $${t.usd.toFixed(3)}`,
    summary: [
      `남은 지적 ${kept.length}건 (상 ${kept.filter((f) => f.severity === '상').length} · 중 ${kept.filter((f) => f.severity === '중').length} · 하 ${kept.filter((f) => f.severity === '하').length})`,
      `뺀 것 ${allDropped.length}건: ${[...why].map(([k, v]) => `${k} ${v}`).join(' · ')}`,
      ...notes,
      fmtTally(t),
      '고칠까(O/X) 칸에 표시하면 마스터가 새 장 + 코딩 세션으로 넘긴다. 도구는 게임 코드를 고치지 않는다.',
    ],
  });
  fs.writeFileSync(path.join(workDir, `review-dropped-${mmdd}.json`), JSON.stringify(allDropped.map((d) => ({ reason: d.reason, screen: d.finding.screen, problem: d.finding.problem })), null, 1));
  const cum = appendUsageLog(path.join(ROOT, 'docs/drafts/ai-usage.md'), { date: kstStamp(), tool: 'ai-review', target: '두 종족', count: `${t.requests}요청`, tally: t, memo: `지적 ${kept.length}건 · 뺀 것 ${allDropped.length}건${notes.length ? ' · ' + notes[0] : ''}` });
  console.log(`끝: 지적 ${kept.length}건 · ${fmtTally(t)} · 누적 $${cum.toFixed(3)} · 엑셀 ${out}`);
}

if (!process.env.VITEST) main().catch((e) => {
  console.error(String(e?.message ?? e).replace(/sk-ant-[\w-]+/g, '[키 숨김]'));
  process.exit(1);
});


