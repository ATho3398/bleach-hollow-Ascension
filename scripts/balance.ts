// 밸런스 점검 (npm run balance, CI 는 --check 로 회귀 가드 판정)
// 1단계부터 시스템별 지표를 여기에 더한다. 가드를 어기면 --check 일 때 종료 코드 1.

import { BALANCE, BALANCE_VERSION } from '../src/config/balance';

const check = process.argv.includes('--check');
const failures: string[] = [];

console.log(`밸런스 버전 ${BALANCE_VERSION}`);
console.log(`설정 항목 ${Object.keys(BALANCE).length}개 (뼈대 단계: 지표 없음)`);

if (check) {
  if (failures.length > 0) {
    console.error(`회귀 가드 실패:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('회귀 가드 통과');
}
