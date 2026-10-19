// 진화체 트리 생성 (GDD 20-5, 임시): 지금 속성·BALANCE 템플릿으로 src/data/evolution/forms.json 을 새로 쓴다.
// 손으로 고친 forms.json 을 덮어쓰므로, 고친 뒤에는 돌리지 않는다. `npm run gen:forms`
import { writeFileSync } from 'node:fs';
import { generateFormTable } from '../src/data/evolution/build';

const forms = generateFormTable();
writeFileSync('src/data/evolution/forms.json', `${JSON.stringify(forms, null, 2)}\n`);
const counts = [2, 3, 4, 5].map((t) => `${t}단계 ${forms.filter((f) => f.tier === t && !f.hidden).length}종(+히든 ${forms.filter((f) => f.tier === t && f.hidden).length})`);
console.log(`forms.json: ${counts.join(' · ')}`);
