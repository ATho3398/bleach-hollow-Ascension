// C.556 proof (펫 위치, 사용자 "펫 위치가 이상해 봐줘"): 방 동행 펫(pet-gold)의 옆 이동(translate)을 6개 화면 크기에서 잰다.
// 전(before) = 화면 px 차이를 그대로 넣던 옛 fitPetToBody, 후(after) = host 안 px 로 바꾼 것. 캡처 = 세로 폰 390×844·태블릿 1024×768 방 화면.
// 실행: node scripts/c556-proof.cjs [저장 폴더] [before|after]
const path=require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c556')); const tag = process.argv[3] || 'after';
const fs = require('node:fs'); fs.mkdirSync(OUT, { recursive: true }); const facts = [];
const touch=(w,h)=>({viewport:{width:w,height:h},deviceScaleFactor:1,hasTouch:true,isMobile:true});
const ALL=[['844x390',touch(844,390)],['915x412',touch(915,412)],['1024x768',touch(1024,768)],['390x844',touch(390,844)],['pc1366',{viewport:{width:1366,height:768},deviceScaleFactor:1}],['pc2x',{viewport:{width:1920,height:1080},deviceScaleFactor:1}]];
/** 캡처는 세로 폰·태블릿만 (전/후 각 1장 = 4장), 수치는 6개 크기 모두 */
const SHOT=new Set(['390x844','1024x768']);
const S=ALL;
(async()=>{
 const srv=await startServer(); const b=await chromium.launch();
 for (const [n,ctx] of S) {
  const page=await (await b.newContext(ctx)).newPage();
  await page.goto(srv.url+'?test=1'); await page.evaluate(()=>localStorage.clear());
  await page.evaluate(async(n)=>{const g=await import('/src/game.ts');const tut=await import('/src/engine/tutorial.ts');const tm=await import('/src/engine/testMode.ts');const pet=await import('/src/engine/pet.ts');const slots=await import('/src/saveSlots.ts');const store=tm.testStorage(localStorage);const s=g.newSaveData('hollow',Date.now());s.name='시험';s.gender='male';s.help.tutorialSeen=true;for(const id of tut.GUIDE_IDS)s.help.guides[id]='done';tm.fillAllUnlocked(s);pet.grantPet(s.shared.pets,'pet-gold',Date.now());s.shared.pets.active='pet-gold';slots.writeSlotSave(store,s,1);slots.touchSlot(store,1,Date.now());localStorage.setItem('bha-fullscreen-start','0');if(n==='pc2x')localStorage.setItem('bha-view-scale','2');},n);
  await page.goto(srv.url+'?test=1'); await page.waitForTimeout(1500);
  const c=page.getByRole('button',{name:'이어하기'}); if(await c.count()) await c.evaluate(e=>e.click()); await page.waitForTimeout(4000);
  const f=await page.evaluate(()=>{const p=document.querySelector('.bha-pet--buddy');if(!p)return null;const host=p.parentElement;const hr=host.getBoundingClientRect();const rot=document.querySelector('.bha-dev').classList.contains('is-rotated');const k=host.offsetWidth/(rot?hr.height:hr.width);const art=[...host.querySelectorAll('canvas.bha-rigcanvas, img')].find(e=>!e.closest('.bha-pet'));const ar=art.getBoundingClientRect();const pr=p.getBoundingClientRect();
   const lo=r=>rot?r.top:r.left, len=r=>rot?r.height:r.width;
   return {host:host.className,translate:p.style.translate,k:+k.toFixed(3),artRightLocal:+(((lo(ar)+len(ar))-lo(hr))*k).toFixed(1),petLeftLocal:+((lo(pr)-lo(hr))*k).toFixed(1),hostW:host.offsetWidth};});
  facts.push({ size: n, ...f, host: undefined });
  console.log(n,JSON.stringify(f));
  if (SHOT.has(n)) await page.screenshot({path:path.join(OUT,`${tag}-room-${n}.png`)});
  await page.context().close();
 }
 await b.close(); srv.stop();
 fs.writeFileSync(path.join(OUT, `facts-${tag}.json`), JSON.stringify(facts, null, 2));
})();
