// 이펙트 배치 도구 '펫' 탭 (C.485, 사용자 2026-11-18 "이펙트 배치도구에다가 펫 추가해서 펫 위치 조정 가능하게"):
// 방 화면 1배 캡처 위에 그림 펫을 얹고, 끌거나 버튼으로 자리를 옮긴다. 값 = 그림 키마다 { dx, dy, scale, flip } (dx·dy = CSS px 오른쪽·아래 +, scale = 표시 배율, flip = 좌우 반전) — 방·원정·전투에 같은 값.
// 저장 = 아티팩트 db `fx/pets-editor`(편집 중)·`fx/pets-fixed`(확정), 문서 필드 json = { stamp: "p2", places: { "<그림 키>": { dx, dy, scale } }, at } (p1 = 크기 칸 없던 옛 값도 읽는다).
// 사용자가 "ㅇㅋ" 하면 Claude 가 `fx/pets-fixed` 를 `src/data/pets/place.json` 에 넣는다 (README.md).
// fx-tool.ts 와는 #modes 줄의 '펫' 칩 하나로만 이어진다(누르면 body.petmode — 다른 편집 칸은 CSS 로 숨김).
export interface PetToolData {
  stamp: string;
  scale: number; // 게임의 그림 펫 표시 배율
  rooms: Record<string, { name: string; bg: string; x: number; y: number; w: number; h: number }>;
  pets: { key: string; label: string; art: string; factions: string[] }[];
  defaults: Record<string, { dx: number; dy: number; scale?: number; flip?: boolean }>;
}
type Place = { dx: number; dy: number; scale: number; flip: boolean };
type DocRef = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void> };
declare const claude: { use(name: 'db'): Promise<{ doc(path: string): DocRef } | null> } | undefined;

export function mountPetTool(P: PetToolData): void {
  const $ = (id: string) => document.getElementById(id)!;
  const h = (tag: string, cls: string, text = ''): HTMLElement => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
  const LS = 'fx-pet-places';
  const def = (k: string): Place => ({ dx: P.defaults[k]?.dx ?? 0, dy: P.defaults[k]?.dy ?? 0, scale: P.defaults[k]?.scale ?? P.scale, flip: !!P.defaults[k]?.flip });
  const places: Record<string, Place> = Object.fromEntries(P.pets.map((p) => [p.key, def(p.key)]));
  let cur = P.pets[0]!.key;
  let room = P.pets[0]!.factions[0] ?? Object.keys(P.rooms)[0]!;
  let db: { doc(path: string): DocRef } | null = null;
  let timer = 0;
  const status = (t: string) => { $('petstatus').textContent = t; };
  const body = () => ({ stamp: P.stamp, places, at: Date.now() });
  const clampS = (v: number) => Math.max(0.5, Math.min(4, Math.round(v * 100) / 100));
  const load = (raw: unknown): boolean => {
    try {
      const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!j || (j.stamp !== P.stamp && j.stamp !== 'p1') || typeof j.places !== 'object') return false; // p1 = 크기 칸이 없던 값
      for (const p of P.pets) { const v = j.places[p.key]; if (v && Number.isFinite(v.dx) && Number.isFinite(v.dy)) places[p.key] = { dx: Math.round(v.dx), dy: Math.round(v.dy), scale: Number.isFinite(v.scale) ? clampS(v.scale) : def(p.key).scale, flip: typeof v.flip === 'boolean' ? v.flip : def(p.key).flip }; }
      return true;
    } catch { return false; }
  };

  // ── 무대: 방 캡처(844×390)에서 캐릭터 둘레만 잘라 크게 ──
  const VIEW = { x: 240, y: 70, w: 420, h: 240 };
  const stage = $('petstage'), world = $('petworld'), bg = $('petbg') as HTMLImageElement, img = $('petimg') as HTMLImageElement, base = $('petbase');
  let k = 1;
  const fit = () => { k = stage.clientWidth / VIEW.w; stage.style.height = `${Math.round(VIEW.h * k)}px`; world.style.transform = `scale(${k}) translate(${-VIEW.x}px, ${-VIEW.y}px)`; };
  const draw = () => {
    const r = P.rooms[room]!, pl = places[cur]!, pet = P.pets.find((p) => p.key === cur)!;
    if (bg.dataset.room !== room) { bg.src = r.bg; bg.dataset.room = room; }
    if (img.dataset.key !== cur) { img.src = pet.art; img.dataset.key = cur; }
    // 게임과 같은 식 (C.487): 상자 = 그림 칸 수 × 배율, 상자 왼쪽 끝 = 몸 그림 오른쪽 끝 + 틈(캡처 때 잰 r.x), 아래 끝 = 기본 자리 — 거기서 dx·dy 만큼 옮긴다
    const nw = img.naturalWidth || 48, nh = img.naturalHeight || 48, B = r.y + r.h;
    for (const [el, dx, dy, sc] of [[img, pl.dx, pl.dy, pl.scale], [base, 0, 0, P.scale]] as [HTMLElement, number, number, number][]) { el.style.left = `${r.x + dx}px`; el.style.top = `${B - nh * sc + dy}px`; el.style.width = `${nw * sc}px`; el.style.height = `${nh * sc}px`; }
    $('petval').textContent = `${pet.label}: 오른쪽 ${pl.dx} · 아래 ${pl.dy} · 크기 ${pl.scale}배${pl.flip ? ' · 좌우 반전' : ''} (그림 ${nw}×${nh}칸)`;
    ($('petscale') as HTMLInputElement).value = String(pl.scale);
    img.style.transform = pl.flip ? 'scaleX(-1)' : '';
    ($('petflip') as HTMLInputElement).checked = pl.flip;
    ($('petdx') as HTMLInputElement).value = String(pl.dx); ($('petdy') as HTMLInputElement).value = String(pl.dy);
    for (const b of $('petlist').querySelectorAll<HTMLElement>('.chip')) { const v = places[b.dataset.key!]!; b.setAttribute('aria-pressed', String(b.dataset.key === cur)); b.classList.toggle('has-ov', !!(v.dx || v.dy || v.scale !== P.scale || v.flip)); }
    for (const b of $('petrooms').querySelectorAll<HTMLElement>('.chip')) b.setAttribute('aria-pressed', String(b.dataset.room === room));
    $('petsummary').textContent = P.pets.map((p) => `${p.label}  ${places[p.key]!.dx}, ${places[p.key]!.dy} · ${places[p.key]!.scale}배${places[p.key]!.flip ? ' · 반전' : ''}`).join('\n');
  };
  const changed = () => {
    draw();
    try { localStorage.setItem(LS, JSON.stringify(body())); } catch { /* 저장소 없음 */ }
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      if (!db) return;
      try { await db.doc('fx/pets-editor').set({ json: JSON.stringify(body()) }); status('편집 값 저장됨 (확정 전)'); } catch { status('서버 저장 실패 — 이 기기에만 남았다'); }
    }, 700);
  };
  const move = (dx: number, dy: number) => { const p = places[cur]!; p.dx = Math.max(-300, Math.min(300, Math.round(p.dx + dx))); p.dy = Math.max(-200, Math.min(200, Math.round(p.dy + dy))); changed(); };

  // 목록
  for (const [id, r] of Object.entries(P.rooms)) { const b = h('button', 'chip', r.name) as HTMLButtonElement; b.type = 'button'; b.dataset.room = id; b.onclick = () => { room = id; draw(); }; $('petrooms').append(b); }
  for (const p of P.pets) {
    const b = h('button', 'chip', p.label) as HTMLButtonElement; b.type = 'button'; b.dataset.key = p.key;
    b.onclick = () => { cur = p.key; if (!p.factions.includes(room)) room = p.factions[0] ?? room; draw(); };
    $('petlist').append(b);
  }
  // 끌기
  let drag: { x: number; y: number; dx: number; dy: number } | null = null;
  stage.addEventListener('pointerdown', (ev) => { drag = { x: ev.clientX, y: ev.clientY, dx: places[cur]!.dx, dy: places[cur]!.dy }; stage.setPointerCapture(ev.pointerId); });
  stage.addEventListener('pointermove', (ev) => { if (!drag) return; const p = places[cur]!; p.dx = Math.round(drag.dx + (ev.clientX - drag.x) / k); p.dy = Math.round(drag.dy + (ev.clientY - drag.y) / k); move(0, 0); });
  const end = () => { drag = null; };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  // 버튼·숫자 칸
  for (const b of $('petnudge').querySelectorAll<HTMLButtonElement>('button')) b.onclick = () => move(Number(b.dataset.dx ?? 0), Number(b.dataset.dy ?? 0));
  for (const [id, key] of [['petdx', 'dx'], ['petdy', 'dy']] as [string, 'dx' | 'dy'][]) ($(id) as HTMLInputElement).onchange = (ev) => { const v = Number((ev.target as HTMLInputElement).value); if (Number.isFinite(v)) { places[cur]![key] = v; move(0, 0); } };
  const size = (v: number) => { if (Number.isFinite(v)) { places[cur]!.scale = clampS(v); changed(); } };
  ($('petscale') as HTMLInputElement).onchange = (ev) => size(Number((ev.target as HTMLInputElement).value));
  ($('petflip') as HTMLInputElement).onchange = (ev) => { places[cur]!.flip = (ev.target as HTMLInputElement).checked; changed(); };
  $('petsmaller').onclick = () => size(places[cur]!.scale - 0.1);
  $('petbigger').onclick = () => size(places[cur]!.scale + 0.1);
  $('petall').onclick = () => { const v = places[cur]!; for (const p of P.pets) places[p.key] = { ...places[p.key]!, dx: v.dx, dy: v.dy }; changed(); status('모든 펫에 같은 자리를 넣었다'); };
  $('petallsize').onclick = () => { const v = places[cur]!; for (const p of P.pets) places[p.key]!.scale = v.scale; changed(); status('모든 펫에 같은 크기를 넣었다'); };
  $('petzero').onclick = () => { places[cur] = { dx: 0, dy: 0, scale: P.scale, flip: false }; changed(); };
  $('petreset').onclick = () => { for (const p of P.pets) places[p.key] = def(p.key); changed(); status('게임 값으로 되돌렸다'); };
  img.addEventListener('load', () => draw());
  $('petcopy').onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify(body())); status('값을 복사했다'); } catch { status('복사 실패'); } };
  $('petfix').onclick = async () => {
    if (!db) return status('서버에 연결되지 않아 확정을 못 남겼다. [값 복사] 를 채팅에 붙여 보내 줘');
    try { const b = JSON.stringify(body()); await db.doc('fx/pets-fixed').set({ json: b }); await db.doc('fx/pets-editor').set({ json: b }); status('확정했다 — 채팅에 "ㅇㅋ" 라고 알려 주면 게임에 넣는다'); } catch { status('확정 저장 실패'); }
  };

  // '펫' 칩: fx-tool 의 캐릭터/몬스터 칩 옆에. 다른 칩을 누르면 펫 탭을 닫는다
  const chip = h('button', 'chip', '펫') as HTMLButtonElement; chip.type = 'button'; chip.setAttribute('role', 'tab');
  const setOn = (on: boolean) => { document.body.classList.toggle('petmode', on); chip.setAttribute('aria-pressed', String(on)); if (on) { for (const b of $('modes').querySelectorAll<HTMLElement>('.chip')) if (b !== chip) b.setAttribute('aria-pressed', 'false'); fit(); draw(); } };
  chip.onclick = (ev) => { ev.stopPropagation(); setOn(true); };
  $('modes').addEventListener('click', (ev) => { if (ev.target !== chip && (ev.target as HTMLElement).closest('.chip')) setOn(false); }, true);
  $('modes').append(chip);
  window.addEventListener('resize', () => { if (document.body.classList.contains('petmode')) { fit(); draw(); } });

  try { const s = localStorage.getItem(LS); if (s) load(s); } catch { /* 저장소 없음 */ }
  draw();
  void (async () => {
    if (typeof claude === 'undefined') return status('이 기기에만 저장된다 (서버 없음)');
    db = await claude.use('db').catch(() => null);
    if (!db) return status('이 기기에만 저장된다 (서버 없음)');
    try { const d = await db.doc('fx/pets-editor').get(); if (d.exists && load(d.data()?.json)) { draw(); status('서버에 저장된 편집 값을 불러왔다'); } else status('게임 값에서 시작'); } catch { status('서버를 못 읽었다 — 게임 값에서 시작'); }
  })();
}
