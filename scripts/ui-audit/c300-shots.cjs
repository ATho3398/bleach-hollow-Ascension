// C.300 고친 화면 캡처 (GDD 189장, 코딩212). 게임 코드는 안 고친다.
// 쓰기: node scripts/ui-audit/c300-shots.cjs <주소> <저장 폴더> <접두어 before|after> [vp=796x384|844x390]
// 796x384 = 터치 폰(LCD 가 폰처럼 줄어든다), 844x390 = PC 고정 모드. 두 종족. 파일 = <접두어>-<vp>-<종족>-<화면>.png
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const [url, outDir, prefix, vp = '796x384'] = process.argv.slice(2);
const [W, H] = vp.split('x').map(Number);
const touch = vp !== '844x390';
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
  await wait(page, 5000); // 시작 알림 띠가 걷히게
}
async function view(page, label) {
  await page.locator('.bha-lcd .bha-toggle').first().click();
  await wait(page, 300);
  await page.locator('.bha-lcd').getByRole('option', { name: label, exact: label === '진화' }).first().click();
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

const FLOWS = {
  async story(page, shot) {
    await page.locator('.bha-prop--outside').first().click();
    await wait(page, 700);
    await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
    await wait(page, 2000);
    await view(page, '스토리');
    await page.locator('.bha-lcd .bha-story-ep').first().click({ position: { x: 70, y: 12 } });
    await wait(page, 300);
    await shot('스토리목록');
    await page.locator('.bha-lcd [data-go]').first().click();
    await wait(page, 2500);
    await shot('대화창');
  },
  async bag(page, shot) {
    await page.locator('.bha-prop--chest').click();
    await wait(page, 800);
    await shot('가방장비');
    await page.locator('.bha-lcd .bha-itemtab').filter({ hasText: /^스킨/ }).click();
    await wait(page, 600);
    await shot('가방스킨');
    await page.locator('.bha-lcd .bha-itemtab').filter({ hasText: /^기타/ }).click();
    await wait(page, 600);
    await shot('가방기타');
  },
  async settings(page, shot) {
    await page.getByRole('button', { name: '더보기' }).click();
    await wait(page, 300);
    await page.locator('.bha-homedock__tray').getByRole('button', { name: '설정' }).click();
    await wait(page, 800);
    // 알림 띠 자리 보기: showToast 와 같은 모양(.bha-toast)을 LCD(알림 자리 = overlay host)에 하나 넣는다 — 설정 화면에서 칭호 알림이 뜬 것과 같은 상태
    await page.evaluate(() => {
      const t = document.createElement('div');
      t.className = 'bha-toast';
      t.innerHTML = '<span class="bha-toast__icon"></span><span class="bha-toast__text"><span class="bha-toast__eyebrow">칭호</span> <span class="bha-toast__title">새 칭호를 얻었다</span></span>';
      t.style.setProperty('--toast-i', '0');
      document.querySelector('.bha-lcd').append(t);
    });
    await wait(page, 300);
    await shot('설정알림');
    await page.locator('.bha-lcd').getByRole('tab', { name: '기타' }).or(page.locator('.bha-lcd').getByRole('button', { name: '기타', exact: true })).first().click();
    await wait(page, 2600);
    await shot('설정기타');
  },
  async wanderer(page, shot) {
    await testTab(page, '불러오기');
    await page.locator('.bha-lcd').getByRole('button', { name: '지금 부르기', exact: true }).nth(0).click();
    await wait(page, 600);
    await toRoom(page);
    await page.locator('.bha-prop--outside').first().click();
    await wait(page, 700);
    await page.locator('.bha-worldmap [data-place="market"]').click();
    await wait(page, 2000);
    await page.locator('.bha-market [data-spot="wanderer"]').click();
    await wait(page, 900);
    await shot('떠돌이상인');
  },
  async evolve(page, shot) {
    await testTab(page, '진화체');
    await page.locator('.bha-lcd button.bha-pick[aria-label="진화체"]').click();
    await wait(page, 300);
    await page.locator('.bha-lcd .bha-pick__list').getByText('1단계 (진화 전)', { exact: true }).first().click();
    await wait(page, 300);
    await page.getByRole('button', { name: '이 몸으로' }).click();
    await wait(page, 1200);
    await view(page, '진화');
    await page.getByRole('button', { name: '다음 진화' }).click();
    await wait(page, 6000);
    await shot('진화');
  },
  async absorb(page, shot) {
    await testTab(page, '둥지·시간');
    await page.locator('.bha-lcd .bha-seg__item').filter({ hasText: '×4' }).click();
    await wait(page, 300);
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
    await shot('흡수');
    if (process.env.DUMP) console.log(await page.evaluate(() => [...document.querySelectorAll('.bha-absorb__left .bha-slot')].map((e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); const rg = document.createRange(); rg.selectNodeContents(e.lastChild); const tr = rg.getBoundingClientRect(); return `${c.display} ${c.flexDirection} ${c.flexWrap} text@${Math.round(tr.left - r.left)},${Math.round(tr.top - r.top)} w${Math.round(r.width)} ${Math.round(r.top)}+${Math.round(r.height)} "${e.textContent}" ${[...e.childNodes].map((n) => n.nodeType === 3 ? 'T' : n.nodeName).join(',')}`; }).join('\n')));
  },
};

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  for (const [fi, fac] of [[0, 'hollow'], [1, 'shinigami']]) {
    for (const [name, run] of Object.entries(FLOWS).filter(([n]) => !process.env.ONLY || process.env.ONLY.split(',').includes(n))) {
      const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
      const shot = (s) => page.screenshot({ path: path.join(outDir, `${prefix}-${vp}-${fac}-${s}.png`) });
      try {
        await newGame(page, fi);
        await run(page, shot);
      } catch (e) {
        console.log(`실패 ${fac} ${name}: ${String(e.message).split('\n')[0].slice(0, 160)}`);
        await shot(`실패-${name}`).catch(() => {});
      }
      await page.close();
      process.stdout.write(`[${fac} ${name}]`);
    }
  }
  await b.close();
  console.log('');
})();
