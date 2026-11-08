// C.312 캡처 (GDD 193장 5·13, 코딩220): 흡수 특성 고르기 — 슬롯이 비었을 때(후보 카드 차이 한 줄) · 슬롯이 가득일 때(한 화면에서 바꿀 칸·보유·포기).
// 쓰기: node scripts/ui-audit/c312-shots.cjs <주소> <저장 폴더> <접두어 before|after> [ONLY=pick,full]
// 조건 세 벌: PC 고정 844×390 · 폰 796×384 터치 · 폰 796×384 터치 + 글자 1.15. 두 종족. 화면마다 phone-checks.cjs 결과를 <접두어>-checks.json 에 모은다.
// 가득 = 저장(build.owned·slots)에 세 속성 블록을 직접 넣고 다시 연다(c301 patchSave 방식). 적 속성은 원정 난수라 후보 블록은 그때그때 다르다.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { phoneInPage } = require('./phone-checks.cjs');

const [url, outDir, prefix = 'after'] = process.argv.slice(2);
const ONLY = (process.env.ONLY ?? 'pick,full').split(',');
const CONDS = [
  { id: 'pc844', opt: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 }, k: 1 },
  { id: 'ph796', opt: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, k: 1 },
  { id: 'ph796x115', opt: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, k: 1.15 },
];
const wait = (p, ms) => p.waitForTimeout(ms);

async function newGame(page, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await wait(page, 1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(page, 300);
  await page.locator('.bha-slot').first().click();
  await wait(page, 200);
  await page.getByRole('button', { name: '확인' }).click();
  await wait(page, 300);
  await page.locator('.bha-species__card').nth(fi).click();
  await wait(page, 300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await wait(page, 5000);
}
async function view(page, label) {
  await page.locator('.bha-lcd .bha-toggle').first().click();
  await wait(page, 300);
  await page.locator('.bha-lcd').getByRole('option', { name: label, exact: true }).first().click();
  await wait(page, 600);
}
async function testTab(page, label) {
  await page.getByRole('button', { name: '더보기' }).click();
  await wait(page, 300);
  await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click();
  await wait(page, 700);
  await view(page, label);
}
async function toRoom(page) {
  for (let i = 0; i < 6 && !(await page.locator('.bha-prop--outside').count()); i++) {
    await page.keyboard.press('Escape');
    await wait(page, 600);
  }
}
// 게임이 떠 있으면 저장을 다시 덮어쓰므로, 게임 밖 같은 주소(매니페스트 파일)로 나가서 고친 뒤 다시 연다 (c301)
async function patchSave(page, src) {
  await page.goto(`${url}manifest.webmanifest`);
  await page.evaluate((s) => {
    const f = new Function('t', 'shared', s);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.nest && o.help && o.runLog) f(o, o.shared);
        for (const v of Object.values(o)) walk(v);
      };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, src);
}
async function reopen(page) {
  await page.goto(`${url}?test=1`);
  await wait(page, 1300);
  await page.getByRole('button', { name: '이어하기' }).click().catch(() => {});
  await wait(page, 1800);
}
/** 방 → 월드맵 → 모험 ★1 출발 → 첫 전투 승리 → 흡수 화면 1단계 → 첫 갈래 [○○하기] → 2단계 */
async function toPickStep(page) {
  await toRoom(page);
  await page.locator('.bha-prop--outside').first().click();
  await wait(page, 700);
  await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
  await wait(page, 2000);
  await page.getByRole('button', { name: '★1', exact: true }).first().click();
  await page.getByRole('button', { name: '출발', exact: true }).first().click();
  await page.getByRole('button', { name: /하러 가기$/ }).waitFor({ timeout: 120_000 });
  await page.getByRole('button', { name: /하러 가기$/ }).click();
  await wait(page, 1200);
  await page.locator('.bha-lcd .bha-absorb__actions--modes > button').first().click();
  await wait(page, 300);
  await page.locator('.bha-lcd .bha-absorb__go').click();
  await wait(page, 900);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  const report = {};
  for (const c of CONDS) {
    for (const [fi, fac] of [[0, 'hollow'], [1, 'shinigami']]) {
      for (const flow of ONLY) {
        const page = await b.newPage(c.opt);
        if (c.k !== 1) await page.addInitScript((k) => {
          const put = () => {
            const st = document.createElement('style');
            st.textContent = `:root{${[['xs', 12], ['sm', 13], ['md', 14], ['lg', 16], ['xl', 18], ['2xl', 22], ['3xl', 28], ['4xl', 36], ['5xl', 48]].map(([n, v]) => `--bha-fs-${n}:${(v * k).toFixed(2)}px !important;`).join('')}}`;
            document.head.append(st);
          };
          if (document.head) put(); else document.addEventListener('DOMContentLoaded', put);
        }, c.k);
        const shot = async (name) => {
          await wait(page, 250);
          const key = `${c.id}-${fac}-${name}`;
          await page.screenshot({ path: path.join(outDir, `${prefix}-${key}.png`) });
          report[key] = await page.evaluate(phoneInPage).catch((e) => [{ kind: '오류', key: String(e.message).slice(0, 80) }]);
        };
        try {
          await newGame(page, fi);
          await testTab(page, '둥지·시간');
          await page.locator('.bha-lcd .bha-seg__item').filter({ hasText: '×4' }).click();
          await wait(page, 300);
          if (flow === 'full') {
            await patchSave(page, "t.build.owned = ['t-water-a', 't-thunder-b', 't-earth-c']; t.build.slots = ['t-water-a', 't-thunder-b', 't-earth-c']; t.build.equipOrder = ['t-water-a', 't-thunder-b', 't-earth-c'];");
            await reopen(page);
          }
          await toPickStep(page);
          await shot(flow);
          if (flow === 'full') {
            // 수정 전: 후보를 누르면 3단계 교체 화면 → 그것도 찍는다. 수정 후: 같은 화면에서 칸을 고른다(화면이 안 바뀜) → 카드를 고른 뒤 한 장 더
            const cand = page.locator('.bha-lcd .bha-absorb__cands .bha-cand:has([data-cand-step="new"]), .bha-lcd .bha-absorb__candbtns .bha-btn[data-cand-step="new"]').first();
            if (await cand.count()) {
              await cand.click();
              await wait(page, 600);
              if (await page.locator('.bha-absorbv2--replace').count()) await shot('full-step3');
              else await shot('full-picked');
            }
          }
        } catch (e) {
          console.log(`실패 ${c.id} ${fac} ${flow}: ${String(e.message).split('\n')[0].slice(0, 160)}`);
          await page.screenshot({ path: path.join(outDir, `${prefix}-${c.id}-${fac}-실패-${flow}.png`) }).catch(() => {});
        }
        await page.close();
        process.stdout.write(`[${c.id} ${fac} ${flow}]`);
      }
    }
  }
  await b.close();
  fs.writeFileSync(path.join(outDir, `${prefix}-checks.json`), JSON.stringify(report, null, 1));
  const n = Object.values(report).reduce((a, v) => a + v.length, 0);
  console.log(`\n폰 점검 ${Object.keys(report).length}장, 문제 ${n}건`);
})();
