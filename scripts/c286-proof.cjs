// C.286 proof — 리디자인 v2 화면 G (GDD 183장, 코딩205) 캡처: 처음 화면·슬롯·종족 고르기·확인/고르기 창·도움말·다마고치·사진·대기 보상·환생·백업·설치·탭 막힘
// + 튜토리얼 카드·노란 알림(테스트 모드 아님). 두 종족. 캡처 1배 844×390.
// 실행: node scripts/c286-proof.cjs [출력 폴더 = docs/captures/c286] (G_URL=<주소>, G_FACTIONS=0,1)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, newGame } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'docs/captures/c286');
const FACTIONS = (process.env.G_FACTIONS ?? '0,1').split(',').map(Number);
if (process.env.G_URL) process.env.C276_URL = process.env.G_URL;

/** LCD 안 가로로 잘린 글자 */
const overflowInPage = () => [...document.querySelectorAll('.bha-lcd button, .bha-lcd .bha-chip, .bha-lcd .bha-num, .bha-overlay button, .bha-tut button, .bha-toast')]
  .filter((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(e);
    return e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis';
  })
  .map((e) => `${e.className.split(' ')[0]} '${(e.textContent || '').trim().slice(0, 16)}' ${e.scrollWidth}>${e.clientWidth}`);

/** 12px 미만 글자 · 36px 미만 버튼 */
const sizeIssues = () => {
  const out = [];
  for (const e of document.querySelectorAll('.bha-dev *')) {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden') continue;
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own && parseFloat(cs.fontSize) < 12) out.push(`font ${parseFloat(cs.fontSize)} '${e.textContent.trim().slice(0, 12)}'`);
    if (e.tagName === 'BUTTON' && !e.closest('.bha-dev__btns') && (r.height < 35.5 || r.width < 35.5)) out.push(`btn ${Math.round(r.width)}x${Math.round(r.height)} '${(e.getAttribute('aria-label') || e.textContent).trim().slice(0, 12)}'`);
  }
  return [...new Set(out)].slice(0, 12);
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], overflow: {}, size: {}, errors: [] };
  try {
    for (const fi of FACTIONS) {
      const fname = fi === 0 ? 'hollow' : 'shinigami';
      const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.setDefaultTimeout(6000);
      page.on('pageerror', (e) => proof.errors.push(`${fname}: ${e.message}`));
      const wait = (ms) => page.waitForTimeout(ms);
      const shot = async (name) => {
        await wait(450);
        const file = `${fname}-${name}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        proof.shots.push(file);
        proof.overflow[file] = await page.evaluate(overflowInPage);
        proof.size[file] = await page.evaluate(sizeIssues);
        console.log(file, proof.overflow[file].length, proof.size[file].length);
      };
      const T = `${srv.url}?test=1`;
      const toRoom = async () => {
        await page.goto(T);
        await wait(1200);
        await page.getByRole('button', { name: '이어하기' }).first().click();
        await wait(2200);
      };
      const more = async (label) => {
        await page.getByRole('button', { name: '더보기' }).first().click();
        await wait(300);
        await page.locator('.bha-homedock__tray').getByRole('button', { name: label }).first().click();
        await wait(1000);
      };
      const step = async (label, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${fname} ${label}: ${String(e.message).split('\n')[0]}`); try { await toRoom(); } catch { /* */ } } };

      // ── 처음 화면 → 슬롯 → 종족 → 확인 창 (테스트 모드)
      await page.goto(T);
      await page.evaluate(() => localStorage.clear());
      await page.goto(T);
      await wait(1300);
      await step('처음 화면(빈)', () => shot('01-start-empty'));
      await step('슬롯 새로', async () => {
        await page.getByRole('button', { name: '새로 시작' }).click();
        await wait(400);
        await shot('02-slot-new');
        await page.locator('.bha-slot').first().click();
        await page.getByRole('button', { name: '확인' }).click();
        await wait(400);
      });
      await step('종족', async () => {
        await shot('03-species');
        await page.locator('.bha-species__card').nth(fi).click();
        await wait(400);
        await shot('04-confirm');
        await page.getByRole('button', { name: '시작', exact: true }).click();
        await wait(2600);
      });
      await step('도움말', async () => { await more('도움말'); await shot('05-help'); });
      await step('사진', async () => { await toRoom(); await more('사진'); await shot('07-photo'); });
      await step('대기 보상', async () => {
        await toRoom();
        await page.getByRole('button', { name: '대기 보상' }).first().click();
        await wait(600);
        await shot('08-idle');
      });
      await step('환생', async () => {
        await toRoom();
        await page.locator('.bha-room__status').first().click();
        await wait(900);
        await page.locator('.bha-lcd').getByRole('button', { name: /환생/ }).first().click();
        await wait(900);
        await shot('09-rebirth');
      });
      // 아래는 개발 서버의 모듈을 직접 불러 띄운다 (게임과 같은 모듈 인스턴스)
      const fid = fi === 0 ? 'hollow' : 'shinigami';
      await step('고르기 창', async () => {
        await toRoom();
        await page.evaluate(async (f) => {
          const { pickDialog } = await import('/src/ui/pickDialog.ts');
          pickDialog({ title: f === 'hollow' ? '상점 거리' : '상점 거리', body: '들어갈 곳을 고른다.', options: ['잡화점', '대장간', '옷 가게', '특성 상점'].map((l, i) => ({ key: String(i), label: l, onPick: () => {} })) });
        }, fid);
        await shot('10-pick');
      });
      await step('노란 알림', async () => {
        await toRoom();
        await page.evaluate(async () => {
          const { showToast } = await import('/src/ui/bha/nest.ts');
          showToast({ eyebrow: '도감 목표', title: '4개 달성 · 영옥 +11' }, 0, 6000);
          showToast({ eyebrow: '떠돌이 상인', title: '시장에 왔다' }, 1, 6000);
          showToast({ eyebrow: '새 장소', title: '도전의 탑이 열렸다' }, 2, 6000);
        });
        await wait(600);
        await shot('16-toast');
      });
      await step('경고', async () => {
        await toRoom();
        await page.evaluate(async (f) => {
          const { playWarning } = await import('/src/ui/warningView.ts');
          playWarning({ kind: 'boss', name: '그랜드 피셔', elementId: 'blood', factionId: f, onDone: () => {} });
        }, fid);
        await page.waitForTimeout(250);
        await shot('17-warning');
      });
      await step('폭주', async () => {
        await toRoom();
        await page.evaluate(async (f) => {
          const { breakthroughView } = await import('/src/ui/breakthroughView.ts');
          const { getFaction } = await import('/src/data/factions/index.ts');
          const root = document.querySelector('.bha-lcd .bha-app').closest('.bha-stage').parentElement;
          breakthroughView(root, getFaction(f), 100, () => {});
        }, fid);
        await shot('18-breakthrough');
      });
      await step('설치', async () => {
        await toRoom();
        await page.evaluate(async () => {
          const { openInstall } = await import('/src/ui/installView.ts');
          openInstall({ auto: false });
        });
        await shot('11-install');
        await page.keyboard.press('Escape');
      });
      await step('처음 화면(세이브)', async () => {
        await page.goto(T);
        await wait(1300);
        await shot('12-start');
        await page.getByRole('button', { name: '불러오기' }).click();
        await wait(400);
        await shot('13-slot-load');
        await page.getByRole('button', { name: '백업 파일 가져오기' }).click();
        await wait(400);
        await page.locator('.bha-slot').nth(1).click();
        await page.getByRole('button', { name: '확인' }).click();
        await wait(700);
        await shot('14-backup');
      });
      await step('다마고치', async () => { await toRoom(); await more('다마고치'); await wait(800); await shot('06-tamago'); await more('다마고치').catch(() => {}); });
      await step('탭 막힘', async () => {
        const p2 = await ctx.newPage();
        await p2.goto(T);
        await p2.waitForTimeout(1500);
        const file = `${fname}-15-tabblocked.png`;
        await p2.screenshot({ path: path.join(OUT, file) });
        proof.shots.push(file);
        await p2.close();
      });
      await ctx.close();

      // ── 튜토리얼 카드 · 노란 알림 (테스트 모드 아님)
      const ctx2 = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      const p = await ctx2.newPage();
      p.setDefaultTimeout(6000);
      p.on('pageerror', (e) => proof.errors.push(`${fname} tut: ${e.message}`));
      try {
        await newGame(p, srv.url, fi);
        await p.waitForTimeout(3500);
        let n = 0;
        const seen = new Set();
        for (let i = 0; i < 40 && n < 6; i++) {
          const key = await p.evaluate(() => { const t = [...document.querySelectorAll('.bha-tut')].pop(); return t ? (t.querySelector('.bha-tut__title')?.textContent ?? '') : ''; });
          if (key && !seen.has(key)) {
            seen.add(key);
            n++;
            await p.waitForTimeout(500);
            const file = `${fname}-2${n}-tut.png`;
            await p.screenshot({ path: path.join(OUT, file) });
            proof.shots.push(file);
          }
          const toasts = await p.locator('.bha-toast').count();
          if (toasts && !seen.has('toast')) {
            seen.add('toast');
            const file = `${fname}-29-toast.png`;
            await p.screenshot({ path: path.join(OUT, file) });
            proof.shots.push(file);
          }
          const pt = await p.evaluate(() => {
            const tut = [...document.querySelectorAll('.bha-tut[data-tut-guard]')].pop();
            if (!tut) return null;
            const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
            let target = null;
            if (tut.hasAttribute('data-dev-pass')) target = [...document.querySelectorAll(tut.dataset.devOnly)].find((e) => !tut.contains(e) && shown(e)) ?? null;
            if (!target) target = [...tut.querySelectorAll('.bha-tut__actions button')].find((b) => /다음|닫기|시작|알겠어요/.test(b.textContent) && !b.disabled) ?? null;
            if (!target) return null;
            const r = target.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          });
          if (pt) await p.mouse.click(pt.x, pt.y);
          await p.waitForTimeout(900);
        }
      } catch (e) { proof.errors.push(`${fname} tut: ${String(e.message).split('\n')[0]}`); }
      await ctx2.close();
    }
  } catch (e) {
    proof.errors.push(String((e && e.stack) || e));
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof.errors, null, 1));
})();
