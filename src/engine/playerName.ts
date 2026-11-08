// 캐릭터 이름 규칙 (GDD 199장 6, C.326): 한글(완성 글자)·영어 대소문자만. 한글만이면 7자, 영어만이면 12자까지,
// 섞이면 한글 1자 = 2칸 · 영어 1자 = 1칸으로 14칸까지. 공백·숫자·기호·빈 이름 불가. 종족과 무관하다(엔진).

export const NAME_RULE = { hangulMax: 7, latinMax: 12, widthMax: 14 } as const;

export type NameProblem = 'empty' | 'space' | 'digit' | 'jamo' | 'symbol' | 'other' | 'long';

export type NameCheck =
  | { ok: true; name: string; width: number; max: number }
  | { ok: false; problem: NameProblem; message: string; width: number; max: number };

const isHangul = (c: string): boolean => c >= '가' && c <= '힣';
const isLatin = (c: string): boolean => /^[A-Za-z]$/.test(c);
const isJamo = (c: string): boolean => /^[ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]$/.test(c);
const isDigit = (c: string): boolean => /^\p{Nd}$/u.test(c);
const isSpace = (c: string): boolean => /^\s$/u.test(c);
const isSymbol = (c: string): boolean => /^[\p{P}\p{S}]$/u.test(c);

/** 이름 너비(칸): 한글 2칸, 그 밖 1칸 */
export function nameWidth(s: string): number {
  let w = 0;
  for (const c of s.normalize('NFC')) w += isHangul(c) || isJamo(c) ? 2 : 1;
  return w;
}

/** 이 이름이 쓸 수 있는 최대 칸: 한글이 없으면 영어 12칸, 있으면 14칸 */
export function nameMax(s: string): number {
  return [...s.normalize('NFC')].some((c) => isHangul(c) || isJamo(c)) ? NAME_RULE.widthMax : NAME_RULE.latinMax;
}

const MESSAGE: Record<Exclude<NameProblem, 'long'>, string> = {
  empty: '이름이 비어 있다',
  space: '띄어쓰기는 쓸 수 없다',
  digit: '숫자는 쓸 수 없다',
  jamo: '자음·모음만 따로 쓸 수 없다',
  symbol: '기호는 쓸 수 없다',
  other: '한글과 영어만 쓸 수 있다',
};

/** 이름 검사. 통과하면 NFC 로 맞춘 이름을 돌려준다 (자르거나 공백을 지우지 않는다 — 고칠 곳을 안내한다) */
export function checkName(raw: string): NameCheck {
  const s = (raw ?? '').normalize('NFC');
  const chars = [...s];
  const width = nameWidth(s);
  const max = nameMax(s);
  const fail = (problem: NameProblem, message: string): NameCheck => ({ ok: false, problem, message, width, max });
  if (chars.length === 0) return fail('empty', MESSAGE.empty);
  if (chars.some(isSpace)) return fail('space', MESSAGE.space);
  if (chars.some(isDigit)) return fail('digit', MESSAGE.digit);
  if (chars.some(isJamo)) return fail('jamo', MESSAGE.jamo);
  if (chars.some((c) => !isHangul(c) && !isLatin(c))) return fail(chars.some(isSymbol) ? 'symbol' : 'other', chars.some(isSymbol) ? MESSAGE.symbol : MESSAGE.other);
  const hangul = chars.filter(isHangul).length;
  if (hangul === 0 && chars.length > NAME_RULE.latinMax) return fail('long', `영어는 ${NAME_RULE.latinMax}자까지다`);
  if (hangul === chars.length && hangul > NAME_RULE.hangulMax) return fail('long', `한글은 ${NAME_RULE.hangulMax}자까지다`);
  if (width > NAME_RULE.widthMax) return fail('long', `섞어 쓰면 ${NAME_RULE.widthMax}칸까지다 (한글 1자 = 2칸)`);
  return { ok: true, name: s, width, max };
}

/** 세이브에서 읽은 이름: 규칙에 맞으면 그대로, 아니면 null(다음에 이어할 때 이름 창) */
export function parseName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = checkName(raw);
  return c.ok ? c.name : null;
}

/** 규칙 안내 한 줄 (화면 공용) */
export const NAME_RULE_LINE = `한글 ${NAME_RULE.hangulMax}자 · 영어 ${NAME_RULE.latinMax}자까지 · 섞으면 한글 1자 = 영어 2자`;
/** 두 화면·설정 공용 한 줄 (GDD 199장 6) */
export const IDENTITY_LATER_LINE = '이름과 성별은 나중에 설정에서 바꿀 수 있다.';
