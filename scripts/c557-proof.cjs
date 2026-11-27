// C.557 proof (GDD 14-2 v6.233, 사용자 "위아래로 검은줄 말고 기기 디자인을 보여주면 되잖아"): 평소 화면 남는 여백 = 같은 배율의 기기 몸체.
// 01 기본형 태블릿 1024×768 / 02 기본형 폰 20:9 915×412 / 03 기본형 PC 1366×768 / 04 사신대행증 태블릿 / 05 11번대 태블릿 — 같은 방 화면, 1배.
// facts.json = 기기 틀·LCD·몸체(기본형)·그림(디자인) 화면 사각형. 실행: node scripts/c557-proof.cjs [저장 폴더]
const path=require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');
const fs = require('node:fs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c557'));
fs.mkdirSync(OUT, { recursive: true });
const facts = [];
const touch=(w,h)=>({viewport:{width:w,height:h},deviceScaleFactor:1,hasTouch:true,isMobile:true});
const S=[['01-basic-tablet-1024x768',touch(1024,768),null],['02-basic-phone-915x412',touch(915,412),null],['03-basic-pc-1366x768',{viewport:{width:1366,height:768},deviceScaleFactor:1},null],['04-badge-tablet-1024x768',touch(1024,768),'device-badge'],['05-zaraki-tablet-1024x768',touch(1024,768),'device-zaraki']];
(async()=>{
 const srv=await startServer(); const b=await chromium.launch();
 for (const [n,ctx,dev] of S) {
  const page=await (await b.newContext(ctx)).newPage();
  page.on('pageerror',e=>console.log('ERR',e.message));
  await page.goto(srv.url+'?test=1'); await page.evaluate(()=>localStorage.clear());
  await page.evaluate(async(dev)=>{const g=await import('/src/game.ts');const tut=await import('/src/engine/tutorial.ts');const tm=await import('/src/engine/testMode.ts');const slots=await import('/src/saveSlots.ts');const store=tm.testStorage(localStorage);const now=Date.now();const s=g.newSaveData('hollow',now);s.name='시험';s.gender='male';s.help.tutorialSeen=true;for(const id of tut.GUIDE_IDS)s.help.guides[id]='done';tm.fillAllUnlocked(s);if(dev)s.wear.device=dev;slots.writeSlotSave(store,s,1);slots.touchSlot(store,1,now);localStorage.setItem('bha-fullscreen-start','0');},dev);
  await page.goto(srv.url+'?test=1'); await page.waitForTimeout(1500);
  const c=page.getByRole('button',{name:'이어하기'}); if(await c.count()) await c.evaluate(e=>e.click()); await page.waitForTimeout(3500);
  await page.waitForFunction(() => !document.querySelector('.bha-toast'), null, { timeout: 12000 }).catch(() => {});
  const f = await page.evaluate(() => {
    const r = (e) => { if (!e || e.hidden || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((v) => Math.round(v)); };
    const dev = document.querySelector('.bha-dev');
    return { cls: dev.className, device: r(dev), lcd: r(document.querySelector('.bha-lcd')), body: dev.classList.contains('has-tama-art') ? null : r(document.querySelector('.bha-tama__body')), art: r(document.querySelector('.bha-tama__art')) };
  });
  facts.push({ name: `${n}.png`, ...f });
  console.log(n, JSON.stringify(f));
  await page.screenshot({path:path.join(OUT,`${n}.png`)});
  await page.context().close();
 }
 await b.close(); srv.stop();
 fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(facts, null, 2));
})();
