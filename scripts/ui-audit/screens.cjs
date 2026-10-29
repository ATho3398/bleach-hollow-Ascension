// UI 검수 화면 목록 (GDD 110장 2, C.182). 각 항목: name, run(h, name). fresh = 슬롯 없이 시작 화면부터.
// 전투 화면은 C.177 배포 뒤 넣었다(마스터 13장 03:2x 지시). h.explore = 정적 점검 + 탭·ⓘ·목록 고르기 전후 비교(audit.cjs).

/** 방에서 독 [더보기] → 메뉴 항목 */
async function more(h, label) {
  await h.btn('더보기');
  await h.btn(label, { within: '.bha-homedock__tray', ms: 700 });
}

/** 켜고 끄는 칸(스위치·눌림 버튼·체크)을 하나씩 눌러 다른 버튼이 안 움직이는지 보고 다시 눌러 되돌린다 */
async function toggles(h, n, scope = '.bha-lcd', max = 10) {
  const togg = h.page.locator(`${scope} .bha-switch, ${scope} [aria-pressed], ${scope} [role="switch"], ${scope} input[type="checkbox"]`).filter({ visible: true });
  const tn = Math.min(await togg.count(), max);
  for (let j = 0; j < tn; j++) {
    const t = togg.nth(j);
    const lab = ((await t.getAttribute('aria-label').catch(() => '')) || (await t.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (/전체 화면/.test(lab) || /^\d배$/.test(lab)) continue; // 브라우저 전체 화면은 헤드리스에서 막힌다 · 화면 배율(1배·2배)은 바꾸면 전부 커지는 게 맞다
    if (await t.isDisabled()) continue; // '이 슬롯' 범위의 공통 전용 칸 등
    await h.stable(n, `토글 '${lab}' 바꾸기`, () => t.click({ timeout: 3000 }), null, t);
    await h.stable(n, `토글 '${lab}' 되돌리기`, () => t.click({ timeout: 3000 }), null, t);
  }
}

/** 설정 창 4탭 + 탭마다 토글 (소리 탭 음악 목록 넣고 빼기 = 110장 1 의 재발 검사) */
async function settings(h, n) {
  await h.explore(n, { infos: false, onTab: async (lab, sn) => {
    if (!/화면|소리|전투|기타/.test(lab)) return;
    if (await h.has('.bha-settings__scopes')) await h.click('.bha-settings__scopes [data-scope="common"]');
    await toggles(h, sn);
    // 성별 줄 (GDD 114장, C.188): [이 슬롯]에서 여성 → 남성 고르기 — 체크 자리 고정·다른 버튼 안 움직임. 남성으로 되돌려 저장 안 한 값이 없게
    if (/화면/.test(lab) && (await h.has('[data-set="gender"]')) && (await h.has('.bha-settings__scopes'))) {
      const scopeBtn = (id) => h.page.locator(`.bha-settings__scopes [data-scope="${id}"]`);
      const pick = (name) => h.page.locator('[data-set="gender"] button').filter({ hasText: name });
      await h.stable(sn, "범위 '이 슬롯'", () => scopeBtn('slot').click({ timeout: 3000 }), null, scopeBtn('slot'));
      await h.stable(sn, "성별 '여성' 고르기", () => pick('여성').click({ timeout: 3000 }), null, pick('여성'));
      await h.stable(sn, "성별 '남성' 되돌리기", () => pick('남성').click({ timeout: 3000 }), null, pick('남성'));
      await h.stable(sn, "범위 '공통'", () => scopeBtn('common').click({ timeout: 3000 }), null, scopeBtn('common'));
    }
  } });
}

/**
 * 전투 버튼 줄 상태 흔들기 (C.183, 2차): 한 번의 실행 안에서(화면 갱신 없이) 전투가 실제로 오가는 상태를 글자·클래스로 넣어 보고
 * 기준 상태와 버튼 bounding box 를 비교한다 — 상태 칩 생김·막기 게이지 참/빔·소모품 ×n/씀/×0·장비 쿨/없음·해방 준비/해방 중·경직(블록 잠금).
 * 칩이 생긴 상태에서는 칩(ⓘ 포함)이 버튼·체력 줄과 겹치는지도 본다. 엔진 상태는 안 건드림(다음 프레임에 원래 값으로 돌아온다)
 */
async function battleRowStates(h, n) {
  const res = await h.page.evaluate(() => {
    const all = (s) => [...document.querySelectorAll(s)];
    const btns = all('.bha-lcd .bha-battle button').filter((e) => e.getClientRects().length > 0 && !e.closest('.bha-v2status'));
    const name = (e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    const pos = () => btns.map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
    const base = pos();
    const undo = [];
    const text = (e, t) => { if (!e) return; const o = e.textContent; undo.push(() => { e.textContent = o; }); e.textContent = t; };
    const cls = (e, c, on) => { if (!e) return; const o = e.classList.contains(c); undo.push(() => e.classList.toggle(c, o)); e.classList.toggle(c, on); };
    const hid = (e, v) => { if (!e) return; const o = e.hidden; undo.push(() => { e.hidden = o; }); e.hidden = v; };
    const sty = (e, k, v) => { if (!e) return; const o = e.style[k]; undo.push(() => { e.style[k] = o; }); e.style[k] = v; };
    const ready = (e, on) => { cls(e, 'is-ready', on); cls(e, 'is-disabled', !on); };
    const q = (s) => document.querySelector(s);
    const guard = q('.bha-v2role--guard'), item = q('.bha-v2role--item'), gear = q('.bha-v2role--gear'), rel = q('.bha-v2rel'), app = q('.bha-battle');
    const itemMeta = item?.querySelector('.bha-v2role__meta'), gearMeta = gear?.querySelector('.bha-v2role__meta');
    const hasItem = !!itemMeta?.textContent, hasGear = !!gearMeta?.textContent;
    const SCEN = [
      ['상태 칩 생김(공허·체인3 12회)', () => { for (const c of all('.bha-v2status > .bha-chip')) { hid(c, false); text(c.querySelector('b'), '12회'); } }],
      ['막기 게이지 참', () => { ready(guard, true); cls(guard, 'is-full', true); sty(guard?.querySelector('.bha-v2role__bar i'), 'width', '100%'); }],
      ['막기 게이지 빔', () => { ready(guard, false); cls(guard, 'is-full', false); sty(guard?.querySelector('.bha-v2role__bar i'), 'width', '0%'); }],
      ...(hasItem ? [['소모품 ×3', () => { ready(item, true); text(itemMeta, '×3'); }], ['소모품 씀', () => { ready(item, false); text(itemMeta, '씀'); }], ['소모품 ×0', () => { ready(item, false); text(itemMeta, '×0'); }]] : []),
      ...(hasGear ? [['장비 쿨 12', () => { ready(gear, false); text(gearMeta, '12'); }], ['장비 쿨 끝(준비)', () => { ready(gear, true); text(gearMeta, ' '); }]] : []),
      ...(rel && !rel.hidden ? [['해방 준비됨', () => { cls(rel, 'is-disabled', false); cls(rel, 'is-ready', true); text(rel.querySelector('.bha-v2rel__meta'), '준비됨 — 눌러 해방'); }],
        ['해방 중', () => { cls(rel, 'is-disabled', false); cls(rel, 'is-on', true); cls(app, 'is-liberated', true); text(rel.querySelector('.bha-v2rel__meta'), '12.5초'); }]] : []),
      ['경직(블록 잠금·머리 게이지)', () => { for (const b of all('.bha-v2tray .bha-block')) cls(b, 'is-locked', true); for (const g of all('.bha-unit--me .bha-unit__heads > *')) hid(g, false); }],
      ['전부 함께', null],
    ];
    const out = [];
    const overlap = [];
    const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    for (const [label, fn] of SCEN) {
      if (fn) fn(); else for (const [, f] of SCEN) if (f) f();
      const p = pos();
      btns.forEach((e, i) => {
        const [x, y, w, hh] = base[i];
        const [x2, y2, w2, h2] = p[i];
        const self = e.closest('.bha-v2role, .bha-v2rel') && (label.includes('전부') || /막기|소모품|장비|해방/.test(label)) ? e : null;
        // 바뀐 버튼 자신은 폭이 바뀌면 안 되고(오른쪽 고정 줄), 다른 버튼은 자리도 폭도 그대로
        if (Math.abs(x2 - x) > 1.5 || Math.abs(y2 - y) > 1.5 || Math.abs(w2 - w) > 1.5 || Math.abs(h2 - hh) > 1.5) out.push(`${label}: ${name(e)} (${Math.round(x2 - x)}, ${Math.round(y2 - y)}) 폭 ${Math.round(w2 - w)}${self ? ' (자기 칸)' : ''}`);
      });
      if (/칩|전부/.test(label)) {
        const chips = all('.bha-v2status > .bha-chip').filter((c) => !c.hidden);
        const others = [...all('.bha-lcd .bha-battle button').filter((e) => !e.closest('.bha-v2status') && e.getClientRects().length > 0), ...all('.bha-battle .bha-unit__hp, .bha-battle .bha-v2legendrow > *:not([hidden]):not(.bha-v2status)')];
        for (const c of chips) for (const o of others) if (hit(c.getBoundingClientRect(), o.getBoundingClientRect())) overlap.push(`${label}: 칩 '${c.textContent.trim().slice(0, 12)}' ↔ ${o.className.split(' ').find((k) => k.startsWith('bha-')) ?? ''} '${name(o)}'`);
        const lr = q('.bha-v2legendrow');
        if (lr && lr.scrollWidth > lr.clientWidth + 1) overlap.push(`${label}: 범례 줄 넘침 ${lr.scrollWidth - lr.clientWidth}px`);
      }
      while (undo.length) undo.pop()();
    }
    return { out, overlap, hasItem, hasGear };
  });
  for (const m of res.out) h.report({ kind: '상태 바꿈에 버튼 이동', key: m.split(':')[1].trim().replace(/ \(.*$/, ''), detail: m }, n);
  for (const m of res.overlap) h.report({ kind: '겹침', key: m.split(': ')[1], detail: m }, n);
  return res;
}

/** 소모품(회복약 ×3, 칸에 넣음)·발동 장비(폭발석 무기)를 세이브에 넣고 다시 불러온다 (C.183) */
async function armItems(h) {
  await h.page.evaluate(() => {
    const k = 'bha-save-test';
    const j = JSON.parse(localStorage.getItem(k));
    j.shared.items['battle-potion'] = 3;
    j.shared.battleItem = 'battle-potion';
    const g = j.shared.gear;
    const uid = `g${g.nextId++}`;
    g.items.push({ uid, kind: 'weapon', grade: 'legendary', star: 1, stats: { atk: 5 }, special: { id: 'sp-active-burst', value: 6 }, plus: 0, gotAt: Date.now() });
    g.equipped.weapon = uid;
    localStorage.setItem(k, JSON.stringify(j));
  });
  await h.page.reload();
  await h.wait(1500);
  await h.page.getByRole('button', { name: '이어하기' }).click();
  await h.wait(1500);
}

/** 원정 ★1 출발 → 첫 전투 조우 연출 뒤 */
async function toBattle(h) {
  await h.click('.bha-prop--door', { ms: 900 });
  await h.btn('★1', { exact: true });
  await h.btn('출발', { ms: 600 });
  await h.page.locator('.bha-battle').waitFor({ timeout: 60_000 });
  await h.wait(2600);
}

/** 테스트 패널: 속도 ×4 + 능력치 전부 같은 값(0 = 지는 몸, 'max' = 이기는 몸) (C.183) */
async function testBody(h, stat) {
  await more(h, '테스트');
  await h.click('.bha-lcd .bha-viewtitle__btn');
  await h.btn('둥지·시간', { within: '.bha-viewtitle__list', role: 'option' });
  await h.click(h.page.locator('.bha-lcd .bha-seg__item').filter({ hasText: '×4' }));
  await h.click('.bha-lcd .bha-viewtitle__btn');
  await h.btn('능력치', { within: '.bha-viewtitle__list', role: 'option' });
  const inp = h.page.locator('.bha-lcd input[type="number"]');
  for (let i = 0; i < Math.min(await inp.count(), 6); i++) await inp.nth(i).fill(stat === 'max' ? (await inp.nth(i).getAttribute('max')) ?? '999' : String(stat));
  await h.btn('적용');
  await h.closeLayers();
  await h.back();
}

/** 원정을 끝까지: 포식은 '… 안 함', 둥지 칸에서 [귀환], 지면 [결과 보기] → 원정 결과 화면(.bha-resultpage) */
async function runToResult(h) {
  await h.click('.bha-prop--door', { ms: 900 });
  await h.btn('★1', { exact: true });
  await h.btn('출발', { ms: 1200 });
  const vis = (l) => l.filter({ visible: true });
  for (let t = 0; t < 200 && !(await h.has('.bha-resultpage')); t++) {
    const eat = vis(h.page.getByRole('button', { name: /하러 가기$/ }));
    const nest = vis(h.page.getByRole('button', { name: '귀환', exact: true }));
    const res = vis(h.page.getByRole('button', { name: '결과 보기' }));
    const layerGo = vis(h.page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary'));
    if (await layerGo.count()) await layerGo.first().click({ timeout: 3000 }).catch(() => {});
    else if (await res.count()) await res.first().click({ timeout: 3000 }).catch(() => {});
    else if (await nest.count()) await nest.first().click({ timeout: 3000 }).catch(() => {});
    else if (await eat.count()) {
      await eat.first().click({ timeout: 3000 }).catch(() => {});
      await h.wait(800);
      await h.click(h.page.locator('.bha-lcd .bha-absorbpage button.bha-btn--lg').last()).catch(() => {}); // 마지막 = '… 안 함'
    }
    await h.wait(1000);
  }
  if (!(await h.has('.bha-resultpage'))) throw new Error('원정 결과 화면에 못 닿음');
  await h.wait(4500); // 칭호·튜토리얼 알림 띠가 걷히고 나서
}

const SCREENS = [
  {
    name: '시작',
    fresh: true,
    async run(h, n) {
      await h.check(n);
      await h.backReacts(n, { toastOk: true }); // 처음 화면 뒤로 = 안내 (C.202)
      await h.btn('설정', { ms: 600 });
      await settings(h, `${n}/설정`);
      await h.back();
      await h.back();
      await h.btn('새로 시작');
      await h.check(`${n}/슬롯`);
      await h.stable(`${n}/슬롯`, '슬롯 2 고르기', () => h.click('.bha-slot >> nth=1'));
      await h.click('.bha-slot >> nth=0');
      await h.btn('확인');
      await h.check(`${n}/종족`);
      await h.stable(`${n}/종족`, '종족 카드 고르기', () => h.click('.bha-species__card >> nth=1'));
      await h.check(`${n}/종족 확인`);
    },
  },
  {
    name: '방',
    async run(h, n) {
      await h.explore(n, { tabs: false });
      await h.stable(n, '더보기 열기', () => h.btn('더보기'), /homedock__tray/);
      await h.check(`${n}/더보기`, { reachIgnore: /bha-prop|bha-char|bha-room__status|statusinfo/ });
      // GDD 124장 2 (C.198): 토글로 닫히는 메뉴(··· 더보기·먹이 줄)에 따로 붙은 [닫기] 없음
      if (await h.page.locator('.bha-homedock__tray').getByRole('button', { name: '닫기', exact: true }).count()) h.report({ kind: '토글 메뉴 [닫기]', key: '더보기', detail: '··· 다시 누르기·뒤로로 닫히는 메뉴에 [닫기] 버튼이 있다' }, `${n}/더보기`);
      await h.back();
      await h.stable(n, '먹이 줄 열기', () => h.click('.bha-homedock__carebtn--feed'), /homedock__tray/);
      await h.check(`${n}/먹이 줄`, { reachIgnore: /bha-prop|bha-char|bha-room__status|statusinfo/ });
      if (await h.page.locator('.bha-homedock__tray').getByRole('button', { name: '닫기', exact: true }).count()) h.report({ kind: '토글 메뉴 [닫기]', key: '먹이 줄', detail: '먹이 다시 누르기·뒤로로 닫히는 줄에 [닫기] 버튼이 있다' }, `${n}/먹이 줄`);
      await h.back();
      // GDD 124장 1 (C.198): 홈에서 뒤로(열린 메뉴 없음) = 처음 화면 확인 창 → [아니오]로 그대로 방
      await h.back();
      if (!(await h.has('.bha-lcd [data-dev-layer]'))) h.report({ kind: '홈 뒤로', key: '처음 화면 확인', detail: '홈에서 뒤로를 눌러도 처음 화면 확인 창이 안 뜬다' }, n);
      else {
        await h.btn('아니오', { within: '.bha-lcd [data-dev-layer]' });
        if (!(await h.has('.bha-room'))) h.report({ kind: '홈 뒤로', key: '아니오', detail: '[아니오] 뒤 방이 아니다' }, n);
      }
      await h.stable(n, '재우기', () => h.click('.bha-homedock__carebtn--sleep'));
      await h.stable(n, '교감', () => h.click('.bha-homedock__carebtn--pet'));
    },
  },
  {
    name: '설정(방)',
    async run(h, n) {
      await more(h, '설정');
      await settings(h, n);
    },
  },
  {
    name: '상태',
    async run(h, n) {
      await h.click('.bha-room__status', { ms: 700 });
      await h.explore(n, { pick: '.bha-lcd .bha-btn--block' });
    },
  },
  {
    name: '가방',
    async run(h, n) {
      await h.click('.bha-prop--chest', { ms: 700 });
      await h.explore(n, { pick: '.bha-lcd .bha-eqslot' });
      // 탭마다 목록 칸 고르기
      const tabs = h.page.locator('.bha-lcd .bha-itemtab').filter({ hasText: /^(장비|슬롯|타일|물건|펫)/ });
      const cnt = await tabs.count();
      for (let i = 0; i < cnt; i++) {
        const lab = ((await tabs.nth(i).textContent()) || '').trim();
        await h.closeLayers();
        await tabs.nth(i).click({ timeout: 4000 });
        await h.wait();
        const cards = h.page.locator('.bha-lcd .bha-itemcard, .bha-lcd .bha-tilecard, .bha-lcd .bha-slotcard');
        if ((await cards.count()) > 1) {
          await h.stable(`${n}/${lab}`, '칸 고르기', () => cards.nth(1).click({ timeout: 3000 }), null, cards.nth(1));
          await h.check(`${n}/${lab}/고른 뒤`);
        }
      }
    },
  },
  {
    name: '상점',
    async run(h, n) {
      await h.click('.bha-prop--market', { ms: 700 }); // C.201 (GDD 127장 2): 상점은 장터 안
      await h.click('.bha-market [data-spot="shop"]', { ms: 700 });
      await h.explore(n, { pick: '.bha-lcd .bha-itemcard' });
    },
  },
  {
    name: '책장',
    async run(h, n) {
      await h.click('.bha-prop--book', { ms: 700 });
      await h.explore(n, { pick: '.bha-lcd .bha-mdrow', views: true });
    },
  },
  {
    name: '수련장',
    async run(h, n) {
      await h.click('.bha-prop--altar', { ms: 700 });
      await h.explore(n, { pick: '.bha-lcd .bha-train__card', views: true });
    },
  },
  {
    name: '원정 출발',
    async run(h, n) {
      await h.click('.bha-prop--door', { ms: 900 });
      await h.explore(n, { pick: '.bha-lcd .bha-road__cell', views: true, viewOpts: { 스토리: { pick: '.bha-lcd .bha-mdrow, .bha-lcd .bha-story__ep' }, 탑: { pick: '.bha-lcd .bha-tower__floor, .bha-lcd .bha-mdrow' } } });
      await h.stable(n, '난이도 ★1', () => h.btn('★1', { exact: true }));
      await h.stable(n, '지역 바꾸기', () => h.click('.bha-lcd .bha-btn--small >> nth=1'));
      // 타일 놓기: 카드 고르고 칸 누르기
      await h.stable(n, '타일 카드 고르기', () => h.click('.bha-lcd .bha-tilecard >> nth=0'), null, h.page.locator('.bha-lcd .bha-tilecard').first());
      await h.stable(n, '칸에 놓기', () => h.click('.bha-lcd .bha-road__cell >> nth=2'));
      await h.check(`${n}/놓은 뒤`);
      await h.stable(n, '프리셋 열기', () => h.btn('프리셋', { within: '.bha-plan__sidetabs' }));
      await h.check(`${n}/프리셋`);
      await h.stable(n, '손패로 돌아가기', () => h.btn('손패', { within: '.bha-plan__sidetabs' }));
      await h.check(`${n}/손패`);
    },
  },
  {
    name: '원정 걷기',
    async run(h, n) {
      await h.click('.bha-prop--door', { ms: 900 });
      await h.btn('★1', { exact: true });
      await h.btn('출발', { ms: 1500 });
      await h.check(n, { keys: false });
      await h.explore(`${n}/2`, { tabs: false });
      // C.202 (GDD 128장 4): 걷기 뒤로 = 일시정지 → 한 번 더 = 재개
      if ((await h.backReacts(n)) === 'pause') await h.backReacts(`${n}/재개`);
    },
  },
  {
    name: '테스트 패널',
    async run(h, n) {
      await more(h, '테스트');
      await h.explore(n, { maxTabs: 12, views: true });
    },
  },
  {
    // C.190 (GDD 116장 추가 5): 테스트 패널 고르기 칸 = 게임 안 목록. 열기 → ▼·뒤로 닫기 → 다시 열어 고르기, 전후로 다른 버튼이 안 움직이는지·목록이 LCD 안인지
    name: '테스트 고르기 목록',
    async run(h, n) {
      await more(h, '테스트');
      // 시작 직후 도감 보상 토스트가 고르기 칸을 덮으면 Playwright 가 패널을 스크롤해 버튼이 움직인 것처럼 잡힌다 — 사라질 때까지 기다린다
      await h.page.locator('.bha-toast').first().waitFor({ state: 'detached', timeout: 20_000 }).catch(() => {});
      const pick = h.page.locator('.bha-lcd button.bha-pick[aria-label="진화체"]');
      const list = '.bha-lcd .bha-pick__list';
      if (await h.stable(n, '진화체 목록 열기', () => pick.click({ timeout: 3000 }), /bha-pick__list/, pick)) {
        await h.check(`${n}/목록`, { keys: false });
        const inside = await h.page.evaluate((sel) => {
          const l = document.querySelector(sel)?.getBoundingClientRect();
          const lcd = document.querySelector('.bha-lcd')?.getBoundingClientRect();
          return !!l && !!lcd && l.top >= lcd.top - 1 && l.bottom <= lcd.bottom + 1 && l.left >= lcd.left - 1 && l.right <= lcd.right + 1;
        }, list);
        if (!inside) h.report({ kind: '목록이 화면 밖', key: '진화체', detail: '고르기 목록이 LCD 밖으로 나감' }, n);
        await h.key('ArrowDown', 2);
        await h.stable(n, '뒤로 닫기', () => h.back());
        if (await h.has(list)) h.report({ kind: '목록 안 닫힘', key: '진화체', detail: '뒤로로 안 닫힘' }, n);
      }
      await h.stable(n, '진화체 고르기', async () => {
        await pick.click({ timeout: 3000 });
        await h.click(`${list} .bha-viewtitle__item >> nth=2`);
      }, null, pick);
      if (await h.has(list)) h.report({ kind: '목록 안 닫힘', key: '진화체', detail: '고른 뒤 안 닫힘' }, n);
      await h.closeLayers();
    },
  },
  {
    // C.186 (GDD 112장): 불러오기 탭 버튼마다 눌러 다른 버튼이 안 움직이는지 + [테스트 모드 끄기] 확인 창
    name: '테스트 불러오기',
    async run(h, n) {
      await more(h, '테스트');
      await h.click('.bha-lcd .bha-viewtitle__btn');
      await h.btn('불러오기', { within: '.bha-viewtitle__list', role: 'option' });
      await h.explore(n, { tabs: false, views: false, infos: false }); // 정보 표(dl.bha-info)는 눌러도 창이 안 열려 뒤로가 패널을 닫는다
      for (const [name, i] of [['지금 부르기', 0], ['물건 다시 뽑기', 0], ['지금 부르기', 1], ['지금 부르기', 2], ['다음 원정에 부르기', 0], ['보내기', 0], ['걷기', 0], ['비우기', 0], ['예약 취소', 0]]) {
        if (name === '다음 원정에 부르기') { // 고른 게 있어야 [예약 취소]가 켜진다 (C.190: 게임 안 고르기 목록)
          await h.click('.bha-lcd button[aria-label="이벤트 타일"]');
          await h.click('.bha-lcd .bha-pick__list .bha-viewtitle__item >> nth=1');
        }
        const loc = h.page.locator('.bha-lcd').getByRole('button', { name, exact: true }).nth(i);
        if (await h.stable(n, `${name} ${i + 1}`, () => loc.click({ timeout: 3000 }), null, loc)) await h.check(`${n}/${name} ${i + 1}`, { keys: false });
      }
      const quit = h.page.locator('.bha-lcd').getByRole('button', { name: '테스트 모드 끄기', exact: true });
      if (await h.stable(n, '끄기 확인 창', () => quit.click({ timeout: 3000 }), null, quit)) await h.check(`${n}/끄기 확인 창`, { keys: false });
      await h.closeLayers();
    },
  },
  {
    name: '도움말',
    async run(h, n) {
      await more(h, '도움말');
      await h.explore(n, { maxTabs: 8 });
    },
  },
  {
    name: '사진',
    async run(h, n) {
      await more(h, '사진');
      await h.explore(n);
    },
  },
  {
    // C.198 (GDD 123장 4): 온천 — 체력을 낮춘 뒤 방 물건 [온천] → 온천 화면(✓ = 방으로 돌아가기, 뒤로 = 방)
    name: '온천',
    async run(h, n) {
      await more(h, '테스트');
      await h.click('.bha-lcd .bha-viewtitle__btn');
      await h.btn('둥지·시간', { within: '.bha-viewtitle__list', role: 'option' });
      const inputs = h.page.locator('.bha-lcd input[type="number"]');
      await inputs.nth(3).fill('40');
      await h.btn('적용');
      await h.closeLayers();
      await h.back();
      await h.click('.bha-prop--market', { ms: 700 }); // C.201 (GDD 127장 2): 온천은 장터 안
      await h.click('.bha-market [data-spot="spa"]', { ms: 900 });
      await h.explore(n, { tabs: false });
      await h.back();
      if (!(await h.has('.bha-market'))) throw new Error('온천 뒤로 → 장터에 못 닿음');
      await h.back();
      if (!(await h.has('.bha-room'))) throw new Error('장터 뒤로 → 방에 못 닿음');
    },
  },
  {
    // C.201 (GDD 127장 2·3): 장터 — 떠돌이 상인 없음 / 있음(테스트 불러오기로 부름) · 떠돌이 상인 창 · 뒤로 = 방
    name: '장터',
    async run(h, n) {
      await h.click('.bha-prop--market', { ms: 700 });
      await h.explore(`${n}/상인 없음`, { tabs: false });
      await h.back();
      await more(h, '테스트');
      await h.click('.bha-lcd .bha-viewtitle__btn');
      await h.btn('불러오기', { within: '.bha-viewtitle__list', role: 'option' });
      await h.page.locator('.bha-lcd').getByRole('button', { name: '지금 부르기', exact: true }).nth(0).click({ timeout: 3000 });
      await h.closeLayers();
      await h.back();
      if (!(await h.has('.bha-prop--market.has-visitor'))) throw new Error('떠돌이 상인이 왔는데 방 장터 물건에 배지가 없음');
      await h.click('.bha-prop--market', { ms: 700 });
      if (!(await h.has('.bha-market [data-spot="wanderer"]'))) throw new Error('떠돌이 상인이 왔는데 장터에 없음');
      await h.explore(`${n}/상인 있음`, { tabs: false });
      await h.click('.bha-market [data-spot="wanderer"]', { ms: 700 });
      await h.explore(`${n}/떠돌이 상인`, { pick: '.bha-lcd .bha-itemcard' });
      await h.back();
      await h.back();
      if (!(await h.has('.bha-room'))) throw new Error('장터 뒤로 → 방에 못 닿음');
    },
  },
  {
    name: '방 빈사·사망',
    async run(h, n) {
      await more(h, '테스트');
      await h.click('.bha-lcd .bha-viewtitle__btn');
      await h.btn('둥지·시간', { within: '.bha-viewtitle__list', role: 'option' });
      const inputs = h.page.locator('.bha-lcd input[type="number"]');
      for (let i = 0; i < Math.min(await inputs.count(), 3); i++) await inputs.nth(i).fill(i === 0 ? '0' : '0');
      await h.btn('적용');
      await h.closeLayers();
      await h.back();
      await h.explore(`${n}/낮은 값`, { tabs: false });
      await more(h, '테스트');
      await h.btn('+48시간');
      await h.closeLayers();
      if (!(await h.has('.bha-room'))) await h.back(); // 시간 앞당기기는 방으로 간다 — 방에서 뒤로는 처음 화면 확인(GDD 124장 1)
      await h.explore(`${n}/48시간 뒤`, { tabs: false });
      await h.stable(`${n}/48시간 뒤`, '먹이 누르기', () => h.click('.bha-homedock__carebtn--feed'), /homedock__tray/);
    },
  },
  {
    name: '흡수·결과',
    async run(h, n) {
      // 테스트 속도 ×4 로 ★1 원정 → 첫 승리 뒤 포식 화면 → 귀환 → 결과
      await more(h, '테스트');
      await h.click('.bha-lcd .bha-viewtitle__btn');
      await h.btn('둥지·시간', { within: '.bha-viewtitle__list', role: 'option' });
      await h.click(h.page.locator('.bha-lcd .bha-seg__item').filter({ hasText: '×4' }));
      await h.closeLayers();
      await h.back();
      await h.click('.bha-prop--door', { ms: 900 });
      await h.btn('★1', { exact: true });
      await h.btn('출발', { ms: 1200 });
      // 버튼 이름은 종족 설정(absorbActionName)을 따른다 — '포식하러 가기' 등
      await h.page.getByRole('button', { name: /하러 가기$/ }).waitFor({ timeout: 120_000 });
      await h.click(h.page.getByRole('button', { name: /하러 가기$/ }), { ms: 900 });
      await h.explore(`${n}/포식`, { tabs: false });
      // C.202 (GDD 128장 4·7): 뒤로 = '흡수 안 하고 넘어가기' 확인(기본 아니오) → 닫기 · [내 상태] 창 열고 뒤로로 닫기
      if ((await h.backReacts(`${n}/포식`)) === 'layer') {
        await h.check(`${n}/포식 뒤로 확인`, { keys: false });
        await h.closeLayers();
      }
      if (await h.has('.bha-lcd [data-absorb-me]')) {
        await h.click('.bha-lcd [data-absorb-me]', { ms: 500 });
        await h.check(`${n}/내 상태`, { keys: false });
        await h.closeLayers();
      }
      await h.stable(`${n}/포식`, '첫 선택(둘 다)', () => h.click('.bha-lcd .bha-absorbpage button.bha-btn--primary', { ms: 800 }));
      await h.explore(`${n}/포식 2`, { tabs: false, pick: '.bha-lcd .bha-cand' });
      // 2단계 뒤로 = 1단계로 → 다시 2단계
      if ((await h.backReacts(`${n}/포식 2`)) === 'screen') await h.click('.bha-lcd .bha-absorbpage button.bha-btn--primary', { ms: 800 });
      // 끝까지 넘기기: 후보 → (슬롯) → 확인 성격의 버튼. 포식 화면이 닫힐 때까지 몇 번
      for (let i = 0; i < 8 && (await h.has('.bha-absorbpage')); i++) {
        const cand = h.page.locator('.bha-lcd .bha-cand').filter({ visible: true });
        const slot = h.page.locator('.bha-lcd .bha-absorbpage .bha-slot').filter({ visible: true });
        const go = h.page.locator('.bha-lcd .bha-absorbpage button.bha-btn--primary:not([disabled])').filter({ visible: true });
        const layerGo = h.page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary, .bha-lcd [data-dev-layer] button.bha-btn--danger').filter({ visible: true });
        if (await layerGo.count()) {
          await h.check(`${n}/포식 확인 창 ${i}`, { keys: false });
          await layerGo.first().click({ timeout: 3000 }).catch(() => {});
        } else if (await go.count()) await go.first().click({ timeout: 3000 }).catch(() => {});
        else if (await slot.count()) await slot.first().click({ timeout: 3000 }).catch(() => {});
        else if (await cand.count()) await cand.first().click({ timeout: 3000 }).catch(() => {});
        await h.wait(700);
        if (await h.has('.bha-absorbpage')) await h.check(`${n}/포식 ${i + 3}`, { keys: false });
      }
      // 걷기로 돌아오면 귀환. 그 사이 전투·포식이 또 오면 기다리거나 '포식 안 함'
      let checkedWalk = false;
      for (let t = 0; t < 150 && !(await h.has('.bha-resultpage')) && !((await h.has('.bha-lcd .bha-room')) && !(await h.has('.bha-lcd [data-dev-layer]'))); t++) {
        const home = h.page.getByRole('button', { name: '귀환하기' }).filter({ visible: true });
        const eat = h.page.getByRole('button', { name: /하러 가기$/ }).filter({ visible: true });
        const layerGo = h.page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary, .bha-lcd [data-dev-layer] button.bha-btn--danger').filter({ visible: true });
        const nestHome = h.page.getByRole('button', { name: '귀환', exact: true }).filter({ visible: true });
        if (await layerGo.count()) {
          await h.check(`${n}/확인 창 ${(await layerGo.first().textContent())?.trim()}`, { keys: false });
          await layerGo.first().click({ timeout: 3000 }).catch(() => {});
        } else if (await nestHome.count()) {
          await h.check(`${n}/둥지 도착`, { keys: false });
          if ((await h.backReacts(`${n}/둥지 도착`)) === 'layer') await h.closeLayers(); // 바퀴 끝 창 뒤로 = 귀환 확인 (C.202)
          await h.stable(`${n}/둥지 도착`, '드래프트 타일 고르기', () => h.click(h.page.locator('.bha-lcd .bha-draft__card, .bha-lcd [data-draft]').first()).catch(() => {}));
          await nestHome.first().click({ timeout: 3000 }).catch(() => {});
        } else if (await home.count()) {
          if (!checkedWalk) await h.check(`${n}/걷기 다시`, { keys: false });
          checkedWalk = true;
          await home.first().click({ timeout: 3000 }).catch(() => {});
        } else if (await eat.count()) {
          await eat.first().click({ timeout: 3000 }).catch(() => {});
          await h.wait(800);
          await h.click(h.page.locator('.bha-lcd .bha-absorbpage button.bha-btn--lg').last()).catch(() => {}); // 마지막 = '… 안 함'
        }
        await h.wait(1000);
      }
      // 결과: 원정 결과 화면(.bha-resultpage)이 있으면 그것, 아니면 방 위 귀환 결과 창까지 위에서 점검했다
      if (await h.has('.bha-resultpage')) {
        await h.explore(`${n}/결과`, { tabs: true });
        await h.backReacts(`${n}/결과`); // 결과 뒤로 = [둥지로] (C.202)
      }
    },
  },
  {
    name: '전투',
    async run(h, n) {
      await toBattle(h);
      const inBattle = async () => (await h.page.locator('.bha-battle').count()) > 0 && !(await h.has('.bha-battle .bha-overlay'));
      await h.check(n, { keys: false });
      // C.197 (GDD 122장 3): 전투 중에도 ▼ 로 머리 버튼·막기·소모품·장비·해방·블록 칸에 다 닿는다 (못 쓰는 대상은 건너뜀)
      if (await inBattle()) await h.check(`${n}/커서`);
      // 숫자 칸 흔들기: 실제로 바뀌는 글자(남은 초 148 → 9, 소모품 ×3 → 씀, 장비 쿨다운 12 → 3)를 직접 넣어 다른 버튼이 움직이는지.
      // 15초 관찰로는 세 자리 → 한 자리·소모품 사용이 안 오므로 글자만 바꿔 본다 (엔진 상태는 안 건드림 — 다음 프레임에 원래 값으로 돌아온다)
      // 한 번의 실행 안에서(그 사이 화면 갱신 없이) 글자 넣기 → 재기 → 바꾸기 → 재기. 칸이 비어 있는 상태(소모품·장비 없음)는 그 상태 그대로 둔다
      const moved = await h.page.evaluate(() => {
        const t = document.querySelector('.bha-v2time b');
        const it = document.querySelector('.bha-v2role--item:not(.is-disabled) .bha-v2role__meta, .bha-v2role--item .bha-v2role__meta:not(:empty)');
        const g = document.querySelector('.bha-v2role--gear .bha-v2role__meta');
        const btns = [...document.querySelectorAll('.bha-lcd button')];
        const pos = () => btns.map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width]; });
        const set = (a, b, c) => { if (t) t.textContent = a; if (it) it.textContent = b; if (g) g.textContent = c; };
        const orig = [t?.textContent ?? '', it?.textContent ?? '', g?.textContent ?? ''];
        set('148', '×3', '12');
        const p1 = pos();
        set('9', '씀', '3');
        const p2 = pos();
        set(...orig); // 되돌려 두어야 다음 시간 관찰이 이 흔들기를 잡지 않는다
        return btns.map((e, i) => [e.getAttribute('aria-label') || e.textContent.trim(), p2[i][0] - p1[i][0], p2[i][1] - p1[i][1]]).filter(([, dx, dy]) => Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5).map(([k, dx, dy]) => `${String(k).slice(0, 20)} (${Math.round(dx)}, ${Math.round(dy)})`);
      });
      for (const m of moved) h.report({ kind: '상태 바꿈에 버튼 이동', key: m, detail: '숫자 칸 바꿈(남은 초 148→9·장비 쿨다운 12→3)' }, n);
      await battleRowStates(h, n);
      await h.watch(n, 15_000, inBattle, /bha-block\b/); // 블록 바의 블록은 생기고 쓰이며 흘러가는 게 규칙(3-5)
      if (await inBattle()) {
        await h.stable(n, '로그 열기', () => h.btn('로그'));
        await h.check(`${n}/로그`, { keys: false });
        await h.stable(n, '로그 닫기', () => h.btn('로그'));
        await h.stable(n, '일시정지', () => h.btn('일시정지'));
        await h.check(`${n}/일시정지`);
        await h.closeLayers();
        // C.202: 전투 뒤로 = 일시정지(창) → 뒤로로 닫힘
        if (await inBattle()) if ((await h.backReacts(`${n}/뒤로`)) === 'layer') await h.closeLayers();
      }
    },
  },
  {
    // C.183 (2차): 소모품·발동 장비를 실제로 낀 전투 — 버튼이 다 차 있는 상태에서 쓰고(소모품 ×3 → 씀, 장비 쿨다운 시작) 전후 비교
    name: '전투 소모품·장비',
    async run(h, n) {
      await armItems(h);
      await toBattle(h);
      const inBattle = async () => (await h.page.locator('.bha-battle').count()) > 0 && !(await h.has('.bha-battle .bha-overlay'));
      await h.check(n, { keys: false });
      const st = await battleRowStates(h, n);
      if (!st.hasItem) h.report({ kind: '검수 스크립트 실패', key: '소모품', detail: '소모품이 전투에 안 실림' }, n);
      if (!st.hasGear) h.report({ kind: '검수 스크립트 실패', key: '장비', detail: '발동 장비가 전투에 안 실림' }, n);
      // 소모품 쓰기 (전투당 1번) → 씀
      const item = h.page.locator('.bha-lcd .bha-v2role--item.is-ready');
      if (await item.count()) await h.stable(n, '소모품 쓰기', () => item.click({ timeout: 3000 }), /bha-block\b/);
      // 장비: 쿨다운이 끝날 때까지 지켜보다(시간 흐름 점검 겸) 준비되면 쓰기
      await h.watch(n, 12_000, async () => (await inBattle()) && !(await h.has('.bha-lcd .bha-v2role--gear.is-ready')), /bha-block\b/);
      const gear = h.page.locator('.bha-lcd .bha-v2role--gear.is-ready');
      if (await gear.count()) await h.stable(n, '장비 쓰기', () => gear.click({ timeout: 3000 }), /bha-block\b/);
      if (await inBattle()) await battleRowStates(h, `${n}/쓴 뒤`);
      if (process.env.UI_AUDIT_SHOTS && (await inBattle())) await h.check(`${n}/쓴 뒤`, { keys: false });
    },
  },
  {
    // C.183 (2차): 원정 결과 화면 — 완주(둥지 칸 [귀환])·패배(능력치 0, [결과 보기])
    name: '원정 결과 완주',
    async run(h, n) {
      await testBody(h, 'max');
      await runToResult(h);
      await h.explore(n, { tabs: false });
      await h.stable(n, '[둥지로]', () => h.btn(/로$/, { within: '.bha-resultpage .bha-dock', ms: 1200 }));
      await h.check(`${n}/둥지`, { keys: false });
    },
  },
  {
    name: '원정 결과 패배',
    async run(h, n) {
      await testBody(h, 0);
      await runToResult(h);
      await h.explore(n, { tabs: false });
      await h.backReacts(n); // 결과 뒤로 = [둥지로] (C.202)
    },
  },
  {
    // C.183 (2차): 긴 이름 — 배치 프리셋을 다 채우고(5개) 이름을 최대 길이(12자)로 바꾼 뒤 칩 줄·버튼 줄·삭제 확인 창 점검.
    // 칩은 이름 길이만큼 폭이 바뀌는 게 맞다(칩끼리는 비교에서 뺌) — 아래 버튼 줄·안내 줄이 움직이면 에러
    name: '프리셋 긴 이름',
    async run(h, n) {
      await h.click('.bha-prop--door', { ms: 900 });
      await h.btn('★1', { exact: true });
      await h.click('.bha-lcd .bha-tilecard >> nth=0');
      await h.click('.bha-lcd .bha-road__cell >> nth=2');
      await h.btn('프리셋', { within: '.bha-plan__sidetabs' });
      const LONG = ['가나다라마바사아자차카타', 'WWWWWWWWWWWW', '웨코문도외곽최강배치세트', 'ＭＭＭＭＭＭＭＭＭＭＭＭ', '레스렉시온연습용긴이름이'];
      for (let i = 0; i < LONG.length; i++) {
        const empty = h.page.locator('.bha-lcd .bha-presets__chip.is-empty');
        if (await empty.count()) await h.click(empty);
        await h.click('.bha-lcd [data-preset-save]');
        await h.stable(n, `프리셋 ${i + 1} 이름 열기`, () => h.click('.bha-lcd [data-preset-rename]'), /presets__chip/);
        await h.page.locator('.bha-lcd [data-preset-rename-input]').fill(LONG[i]);
        await h.stable(n, `프리셋 ${i + 1} 긴 이름 확인`, () => h.click('.bha-lcd [data-preset-rename-ok]'), /presets__chip/);
      }
      await h.check(`${n}/다섯 개`);
      await h.stable(n, '첫 칩 고르기', () => h.click('.bha-lcd .bha-presets__chip >> nth=0'), /presets__chip/);
      await h.stable(n, '마지막 칩 고르기', () => h.click('.bha-lcd .bha-presets__chip >> nth=4'), /presets__chip/, h.page.locator('.bha-lcd .bha-presets__chip').nth(4));
      await h.btn('삭제', { within: '.bha-presets__acts' });
      await h.check(`${n}/삭제 확인 창`);
      await h.stable(n, '긴 이름 프리셋 삭제', () => h.btn('삭제', { within: '.bha-lcd [data-dev-layer]' }), /presets__chip/);
      await h.check(`${n}/지운 뒤`);
    },
  },
  {
    name: '슬롯 지우기',
    fresh: true,
    async run(h, n) {
      // 슬롯 하나를 만든 뒤 처음 화면 → 불러오기 → 슬롯 고르기·지우기 (목록에서 하나 빠질 때 버튼이 안 움직여야)
      await h.btn('새로 시작');
      await h.click('.bha-slot >> nth=1');
      await h.btn('확인');
      await h.click('.bha-species__card >> nth=0');
      await h.btn('시작', { exact: true, ms: 1400 });
      await h.btn('더보기');
      await h.btn('처음 화면', { within: '.bha-homedock__tray' });
      await h.btn('예').catch(() => h.btn('처음 화면', { within: '.bha-lcd [data-dev-layer]' }));
      await h.wait(800);
      await h.btn('불러오기');
      await h.check(`${n}/불러오기`);
      await h.click('.bha-slot >> nth=1');
      await h.stable(n, '슬롯 지우기', async () => {
        await h.btn('삭제');
        await h.check(`${n}/지우기 확인 창`);
        await h.btn('지우기', { within: '.bha-lcd [data-dev-layer]' });
      });
      await h.check(`${n}/지운 뒤`);
    },
  },
];

module.exports = { SCREENS };
