// C.321 (GDD 197장 3 보충): C.281 빌드 캡처 ↔ 고친 뒤 캡처, 왼쪽 위 판 부분을 나란히 한 장으로.
// 쓰기: node scripts/c321-compare.cjs  (입력 docs/captures/c319/c281-*-walk.png · docs/captures/c321/after-*-walk.png)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OLD = path.join(ROOT, 'docs/captures/c319');
const NEW = path.join(ROOT, 'docs/captures/c321');
const uri = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 260 }, deviceScaleFactor: 1 });
  for (const fac of ['hollow', 'shinigami']) for (const mode of ['pc', 'ph']) {
    const a = uri(path.join(OLD, `c281-${fac}-${mode}-walk.png`));
    const b = uri(path.join(NEW, `after-${fac}-${mode}-walk.png`));
    // 판 자리: 왼쪽 위 (x 100~300, y 15~200)
    const cell = (src, label) => `<figure style="margin:0;display:flex;flex-direction:column;gap:4px"><figcaption style="font:600 13px sans-serif;color:#eee">${label}</figcaption><div style="width:300px;height:210px;overflow:hidden;background:url(${src}) -95px -12px no-repeat"></div></figure>`;
    await page.setContent(`<body style="margin:0;padding:10px;background:#222;display:flex;gap:16px">${cell(a, 'C.281 빌드')}${cell(b, '지금 (C.321)')}</body>`);
    await page.screenshot({ path: path.join(NEW, `compare-${fac}-${mode}.png`) });
  }
  await browser.close();
})();
