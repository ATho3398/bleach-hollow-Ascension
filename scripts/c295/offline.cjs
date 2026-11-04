const { chromium } = require('playwright');
(async () => {
  const ctx = await chromium.launchPersistentContext(__dirname + '/profile', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto('https://atho3398.github.io/bleach-hollow-Ascension/'); await page.waitForTimeout(3000);
  await ctx.setOffline(true);
  const t0 = Date.now();
  await page.goto('https://atho3398.github.io/bleach-hollow-Ascension/?x=1').catch((e) => console.log('goto err', e.message));
  const ok = await page.waitForSelector('.bha-start--title', { timeout: 10000 }).then(() => true).catch(() => false);
  console.log('offline reopen title shown', ok, ((Date.now() - t0) / 1000).toFixed(2) + 's', 'banner?', await page.evaluate(() => !!document.querySelector('.bha-update, .bha-start__update')));
  await page.screenshot({ path: __dirname + '/shots/offline.png' });
  await ctx.close();
})();
