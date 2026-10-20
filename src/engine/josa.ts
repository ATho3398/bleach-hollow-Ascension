// 조사 자동 고르기 (C.93 QA, 화면 문구 공용): 종족 설정 이름을 끼워 넣는 문구의 "이(가)·을(를)·은(는)·과(와)·(으)로" 를 앞 글자 받침으로 고른다.
// 한글이 아닌 글자(영문 등) 뒤에서는 두 가지를 다 적은 표기를 그대로 둔다. 숫자는 읽는 소리(1 = 일, 2 = 이 …)의 받침으로 본다.

/** 0~9 를 읽은 소리의 받침 번호 (0 = 받침 없음, 8 = ㄹ): 영·일·이·삼·사·오·육·칠·팔·구 */
const DIGIT_JONG = [21, 8, 0, 16, 0, 0, 1, 8, 8, 0] as const;

/** 글자 하나의 받침 번호. 한글·숫자가 아니면 null */
function jongOf(ch: string): number | null {
  if (ch >= '0' && ch <= '9') return DIGIT_JONG[Number(ch)]!;
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return code % 28;
}

const PAIRS: Record<string, [string, string]> = {
  '이(가)': ['이', '가'],
  '을(를)': ['을', '를'],
  '은(는)': ['은', '는'],
  '과(와)': ['과', '와'],
};

// 앞 글자 + (닫는 따옴표·괄호) + 조사 표기
const PARTICLE = /([가-힣0-9])([’'"」』\]]*)(이\(가\)|을\(를\)|은\(는\)|과\(와\)|\(으\)로)/g;

/** 문장 안의 두 가지 표기 조사를 앞 글자에 맞게 하나로 고른다 */
export function fixParticles(text: string): string {
  if (!text.includes('(')) return text;
  return text.replace(PARTICLE, (all, ch: string, close: string, p: string) => {
    const jong = jongOf(ch);
    if (jong === null) return all;
    if (p === '(으)로') return `${ch}${close}${jong === 0 || jong === 8 ? '로' : '으로'}`;
    const [withJong, without] = PAIRS[p]!;
    return `${ch}${close}${jong === 0 ? without : withJong}`;
  });
}
