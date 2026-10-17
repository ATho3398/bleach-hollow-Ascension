// 진화체 템플릿 생성 (GDD 4-2 v1.0, 임시): 지금 계통·BALANCE 템플릿으로 src/data/evolution/forms.json 을 새로 쓴다.
// 손으로 고친 forms.json 을 덮어쓰므로, 고친 뒤에는 돌리지 않는다. `npm run gen:forms`
import { writeFileSync } from 'node:fs';
import { generateFormTable } from '../src/data/evolution/build';

const forms = generateFormTable();
writeFileSync('src/data/evolution/forms.json', `${JSON.stringify(forms, null, 2)}\n`);
const counts = [2, 3, 4, 5].map((t) => `${t}단계 ${forms.filter((f) => f.tier === t && !f.fallback).length}종`);
console.log(`forms.json: ${counts.join(' · ')} (+ 단계마다 기본형 1개)`);
