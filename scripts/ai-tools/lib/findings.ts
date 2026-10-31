// 지적 한 건의 모양, 이미 정한 것 빼기(지난 검수 1~111·ui-review.md 제외·'임시' 표시), 엑셀 행 만들기 (GDD 167장 4·5)
export const VIEWPOINTS = ['개발자 말·숫자', '목록·상세', '배치', '일관성', '말투', '조작', '게임다움'] as const;
export const PLAYTEST_VIEWPOINTS = [...VIEWPOINTS, '진행 막힘'] as const;
export const SEVERITIES = ['상', '중', '하'] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface Finding {
  severity: Severity;
  /** 묶음: 화면 묶음 이름 / 플레이테스트 단계 */
  group: string;
  screen: string;
  /** hollow / shinigami / 둘 다 */
  faction: string;
  viewpoint: string;
  problem: string;
  fix: string;
  /** 캡처 파일(절대 경로) — 없으면 '' */
  shot: string;
  /** 플레이테스트만: '23 · ✓' */
  step?: string;
  /** 문구 검수만: 파일·원문 */
  source?: string;
}

export interface PriorItem {
  no: number;
  screen: string;
  faction: string;
  viewpoint: string;
  problem: string;
  mark: string;
}

/** 글자 두 개씩 묶은 집합의 겹침(0~1) — 같은 문제를 다른 말로 쓴 것 찾기용 */
export function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = s.replace(/[\s'"‘’“”.,·()[\]?!~-]+/g, '');
    const g = new Set<string>();
    for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
    return g;
  };
  const A = grams(a);
  const B = grams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
}

const screenKey = (s: string) => s.replace(/[\s>·()_\-/ⓘ]+/g, '').replace(/(호로|사신|hollow|shinigami)/gi, '');

/** 같은 화면으로 볼까 — 한쪽 이름이 다른 쪽을 품거나 글자 겹침이 크면 */
export function sameScreen(a: string, b: string): boolean {
  const x = screenKey(a);
  const y = screenKey(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x) || similarity(x, y) >= 0.6;
}

/** 지난 검수와 같은 화면·같은 문제인 항목 */
export function priorDuplicate(f: Pick<Finding, 'screen' | 'problem'>, prior: PriorItem[], threshold = 0.45): PriorItem | null {
  let best: PriorItem | null = null;
  let bestScore = 0;
  for (const p of prior) {
    if (!sameScreen(f.screen, p.screen)) continue;
    const s = similarity(f.problem, p.problem);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return bestScore >= threshold ? best : null;
}

/** ui-review.md '제외' + 159장 5 '임시' 표시 — 지적하지 않는 것. 이유 문자열 또는 null */
export function excludedReason(f: Pick<Finding, 'screen' | 'problem'>): string | null {
  const all = `${f.screen} ${f.problem}`;
  if (/^테스트|테스트[_ ]?(패널|모드|배지)|'테스트' 배지|새 트랙 .*열렸다/.test(all)) return '테스트 화면';
  if (/임시/.test(f.problem) && /(표시|배지|품목|점선|○|붙)/.test(f.problem)) return "'임시' 표시(159장 5 — 그대로 둠)";
  if (/(그림|아이콘|실루엣|일러스트|배경).{0,12}(없|비어|빈 ?칸|자리만|placeholder|임시)/.test(f.problem)) return '그림 없음(아이콘 없는 목록에 있음)';
  if (/(기기|화면|단말).{0,6}(크기|비율)/.test(f.problem)) return '기기 크기·비율(133장)';
  return null;
}

/** 같은 화면·같은 문제는 한 줄로 — 두 종족이면 종족 = 둘 다 */
export function mergeFactions(list: Finding[]): Finding[] {
  const out: Finding[] = [];
  for (const f of list) {
    const m = out.find((o) => sameScreen(o.screen, f.screen) && similarity(o.problem, f.problem) >= 0.55);
    if (!m) out.push({ ...f });
    else if (m.faction !== f.faction) m.faction = '둘 다'; // 같은 종족 같은 문제는 앞의 것 하나만
  }
  return out;
}

export interface FilterResult {
  kept: Finding[];
  dropped: { finding: Finding; reason: string }[];
}

/** 제외·지난 검수 중복을 빼고 종족을 합친 뒤 심각도 순으로 */
export function filterFindings(list: Finding[], prior: PriorItem[]): FilterResult {
  const dropped: FilterResult['dropped'] = [];
  const kept: Finding[] = [];
  for (const f of list) {
    const ex = excludedReason(f);
    if (ex) {
      dropped.push({ finding: f, reason: ex });
      continue;
    }
    const p = priorDuplicate(f, prior);
    if (p) {
      dropped.push({ finding: f, reason: `지난 검수 ${p.no}번과 같음` });
      continue;
    }
    kept.push(f);
  }
  const order = (s: Severity) => SEVERITIES.indexOf(s);
  return { kept: mergeFactions(kept).sort((a, b) => order(a.severity) - order(b.severity)), dropped };
}

export const FACTION_KO: Record<string, string> = { hollow: '호로', shinigami: '사신', '둘 다': '둘 다' };

/** 엑셀 행 — 열: 번호·심각도·묶음·화면·종족·관점·문제·추천 수정·마스터 메모·고칠까(O/X)·캡처 (+ 플레이테스트 '걸음') */
/** 엑셀 화면·묶음 이름: 게임 용어 '모험' (GDD 168장 1 — AI 가 옛 말 '원정'을 써도 고친다) */
export const screenTerm = (s: string): string => s.replace(/원정/g, '모험');

export function xlsxRows(list: Finding[], kind: 'playtest' | 'review'): { header: string[]; rows: (string | number)[][]; shots: string[] } {
  const header = ['번호', '심각도', '묶음', '화면', '종족', '관점', '문제', '추천 수정', '마스터 메모', '고칠까(O/X)', '캡처'];
  if (kind === 'playtest') header.splice(4, 0, '걸음');
  const rows = list.map((f, i) => {
    const base: (string | number)[] = [i + 1, f.severity, screenTerm(f.group), screenTerm(f.screen), FACTION_KO[f.faction] ?? f.faction, f.viewpoint, f.problem, f.fix, f.source ? `원문 위치: ${f.source}` : '', '', f.shot ? f.shot.split('/').pop()! : ''];
    if (kind === 'playtest') base.splice(4, 0, f.step ?? '');
    return base;
  });
  return { header, rows, shots: list.map((f) => f.shot) };
}
