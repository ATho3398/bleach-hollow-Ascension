// C.194 발 높이 점검(scripts/foot-check/run.cjs)용 세이브: 종족·단계(tierIndex)·성별·진화체 id → 테스트 칸에 넣을 JSON
import { newSaveData, SAVE_KEY } from '../../src/game';
const [fac, tier, gender] = process.argv.slice(2);
const s: any = newSaveData(fac!, Date.now());
s.evolution.tierIndex = Number(tier);
s.gender = gender; if (process.argv[5]) s.evolution.formId = process.argv[5];
s.help.guides = {};
console.log(JSON.stringify({ key: SAVE_KEY, save: s }));
