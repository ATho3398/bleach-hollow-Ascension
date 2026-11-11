// 클라우드 세이브 화면 조각 (GDD 196장, C.323 · 199장, C.325): 처음 로그인 창 · 설정 > 기타 '로그인' 줄의 글·버튼 · 이메일 창(로그인/연동) · 계정 연동 고르기·거절 창 ·
// [이 기기 / 클라우드] 고르기 창 · '다른 기기에서 로그인했다' 막기 창.
// 문구는 text-style '~다' 체, 모양은 기존 bha- 부품(button·info·notice·confirmDialog)만 — 새 CSS 는 창 폭·버튼 세로 쌓기 두 줄(screens-lcd.css). 종족 이름·단계 이름은 종족 설정에서 읽는다.
import { cloudErrorText, LINK_TAKEN_TEXT, type ActiveDevice, type CloudConflict, type CloudState, type CloudSummary, type EmailAction, type LinkKind, type LinkOutcome } from '../cloudSave';
import { FACTIONS } from '../data/factions';
import { fixParticles } from '../engine/josa';
import { formatPlayedAt } from '../saveSlots';
import { confirmDialog } from './confirmDialog';
import { button, el, info, notice } from './bha/dom';
import { trapModalFocus } from './bha/modalFocus';
import { coverTutorials, getOverlayHost, registerLayer } from './bha/overlayHost';

/** 설정 화면·처음 로그인 창·막기 창이 쓰는 조작 묶음 (app.ts 가 CloudSync 로 만든다) */
export interface CloudUi {
  state(): CloudState;
  /** Google 팝업 로그인. 실패 문구(없으면 null). quiet = 토스트 없이 문구만 */
  signIn(o?: { quiet?: boolean }): Promise<string | null>;
  /** 게스트(익명) 로그인 (GDD 199장 3) */
  signInGuest(o?: { quiet?: boolean }): Promise<string | null>;
  signOut(): void;
  /** 이메일 로그인·가입·비밀번호 재설정 (GDD 196장 결정 7): 실패 문구를 돌려준다(없으면 null) */
  email(kind: EmailAction, email: string, password: string): Promise<string | null>;
  /** 게스트에 계정 연동 (GDD 199장 3) */
  link(kind: LinkKind, email?: string, password?: string): Promise<LinkOutcome>;
  /** [다시 이 기기에서 하기] (GDD 199장 4): 실패 문구(없으면 null) */
  reclaim(): Promise<string | null>;
  /** 로그인 창이 보일 때 SDK 를 미리 받는다 (GDD 199장 1) */
  warm(): void;
  /** [다시 올리기] (GDD 232장 2): 재시도 대기를 무시하고 지금 한 번 */
  retry(): Promise<void>;
  /** 짧은 알림 (토스트) */
  notify(title: string, meta?: string): void;
  /** 상태가 바뀌면 부른다. 해제 함수 */
  onChange(cb: () => void): () => void;
}

export const EMAIL_DIALOG_TEXT = {
  title: '이메일 로그인',
  linkTitle: '이메일 연동',
  email: '이메일',
  password: '비밀번호 (6자 이상)',
  sent: '비밀번호 재설정 메일을 보냈다. 메일함을 확인한다.',
  signedUp: '가입했다. 로그인됐다.',
} as const;

/** 공용: 겹친 층 + 창 틀. close 는 한 번만 닫는다. onCancel = 뒤로·Esc(없으면 아무 일도 안 한다 — 막기 창) */
function modalLayer(cls: string, title: string, role: 'dialog' | 'alertdialog', onCancel: (() => void) | null): { layer: HTMLElement; modal: HTMLElement; mount: () => void; close: () => void; isClosed: () => boolean } {
  const layer = el('div', `bha-overlay bha-overlay--in-app bha-confirm ${cls}`);
  layer.setAttribute('role', role);
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', title);
  const modal = el('div', 'bha-modal');
  modal.append(el('h2', 'bha-modal__title', title));
  layer.append(modal);
  let closed = false;
  let unregister: () => void = () => {};
  let untrap: () => void = () => {};
  let uncover: () => void = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    unregister();
    layer.remove();
    uncover();
    untrap();
  };
  const mount = () => {
    getOverlayHost().append(layer);
    uncover = coverTutorials(layer); // GDD 222장 1
    untrap = trapModalFocus(layer);
    unregister = registerLayer(layer, onCancel ?? (() => {}));
  };
  return { layer, modal, mount, close, isClosed: () => closed };
}

/**
 * 이메일 창 (GDD 196장 결정 7 · 199장 3): 이메일·비밀번호 칸 + [취소][가입][로그인], 칸 아래 [비밀번호 잊음]. mode 'link' 면(게스트 계정 연동) 제목 '이메일 연동'·버튼 [취소][연동]만.
 * 실패 문구는 창 안에 남고 창은 열려 있다. 폰(796 터치)에서 키보드가 올라오면 기기 틀이 줄어든다(device.ts visualViewport) — 칸은 창 맨 위, 창 본문은 스크롤, 초점 칸은 보이게 민다.
 * 연동 거절(그 계정에 세이브 있음)은 창을 닫고 onRefused 로 넘긴다(거절 창)
 */
export function emailLoginDialog(ui: CloudUi, mode: 'login' | 'link' = 'login', onRefused?: (text: string, switchTo: () => Promise<void>) => void): () => void {
  const title = mode === 'link' ? EMAIL_DIALOG_TEXT.linkTitle : EMAIL_DIALOG_TEXT.title;
  const m = modalLayer('bha-cloud-email', title, 'dialog', () => m.close());
  const form = el('form', 'bha-cloud-email__form');
  form.noValidate = true;
  const field = (type: string, name: string, placeholder: string, autocomplete: string): HTMLInputElement => {
    const i = el('input', 'bha-cloud-email__input');
    i.type = type;
    i.name = name;
    i.placeholder = placeholder;
    i.setAttribute('autocomplete', autocomplete);
    i.setAttribute('aria-label', placeholder);
    i.addEventListener('focus', () => i.scrollIntoView({ block: 'nearest' }));
    return i;
  };
  const emailIn = field('email', 'email', EMAIL_DIALOG_TEXT.email, 'email');
  const pwIn = field('password', 'password', EMAIL_DIALOG_TEXT.password, mode === 'link' ? 'new-password' : 'current-password');
  const status = el('div', 'bha-cloud-email__status');
  const forgot = button({ label: '비밀번호 잊음', size: 'small', variant: 'ghost' });
  forgot.dataset.set = 'cloud-email-reset';
  form.append(emailIn, pwIn);
  if (mode === 'login') form.append(forgot);
  form.append(status);
  m.modal.append(form);
  let busy = false;
  const cancel = button({ label: '취소', variant: 'ghost', onClick: m.close });
  const signup = button({ label: '가입' });
  signup.dataset.set = 'cloud-email-signup';
  const login = button({ label: mode === 'link' ? '연동' : '로그인', variant: 'primary' });
  login.dataset.set = mode === 'link' ? 'cloud-email-link' : 'cloud-email-login';
  const all = mode === 'link' ? [login] : [signup, login, forgot];
  const say = (kind: 'warn' | 'good', text: string) => status.replaceChildren(notice(kind, text));
  const run = async (kind: EmailAction | 'link') => {
    if (busy) return;
    busy = true;
    for (const b of all) b.disabled = true;
    try {
      if (kind === 'link') {
        const r = await ui.link('email', emailIn.value, pwIn.value);
        if (m.isClosed()) return;
        if (r.ok) m.close();
        else if (r.switchTo) {
          m.close();
          onRefused?.(r.text, r.switchTo);
        } else say('warn', r.text);
        return;
      }
      const err = await ui.email(kind, emailIn.value, pwIn.value);
      if (m.isClosed()) return;
      if (err) say('warn', err);
      else if (kind === 'reset') say('good', EMAIL_DIALOG_TEXT.sent);
      else m.close();
    } finally {
      busy = false;
      for (const b of all) b.disabled = false;
    }
  };
  forgot.onclick = () => void run('reset');
  signup.onclick = () => void run('signup');
  login.onclick = () => void run(mode === 'link' ? 'link' : 'login');
  form.onsubmit = (e) => {
    e.preventDefault();
    void run(mode === 'link' ? 'link' : 'login');
  };
  const actions = el('div', mode === 'link' ? 'bha-modal__actions' : 'bha-modal__actions bha-modal__actions--three');
  if (mode === 'link') actions.append(cancel, login);
  else actions.append(cancel, signup, login);
  m.modal.append(actions);
  m.mount();
  emailIn.focus({ preventScroll: true });
  return m.close;
}

/** 진행 요약 한 줄: "호로 3단계 · 모험 12회" (종족 이름은 종족 설정, 단계는 번호 — 1단계 이름이 종족 이름과 같아 '호로 호로'가 되는 것을 피한다) */
export function summaryLine(s: CloudSummary, factions: readonly { id: string; name: string }[] = FACTIONS): string {
  const f = factions.find((x) => x.id === s.factionId);
  return `${f?.name ?? s.factionId} ${s.tierIndex + 1}단계 · 모험 ${s.expeditions}회`;
}

export const CLOUD_STATUS_TEXT: Record<CloudState['status'], string> = {
  'signed-out': '로그인하면 세이브가 클라우드에도 저장된다. 다른 기기에서 같은 계정으로 로그인하면 이어 할 수 있다. 로그인하지 않아도 이 기기에는 그대로 저장된다.',
  loading: '로그인을 확인하는 중이다.',
  synced: '클라우드와 맞다.',
  pending: '잠시 뒤 클라우드에 올린다.',
  saving: '클라우드에 올리는 중이다.',
  offline: '오프라인이라 연결되면 올린다.',
  error: '클라우드 저장에 실패했다. 잠시 뒤 다시 올린다.',
  blocked: '클라우드 세이브가 더 새 버전이라 올리지 않는다. 앱을 새 버전으로 올린 뒤 이어 한다.',
  'too-big': '세이브가 너무 커 클라우드에 올리지 못했다. 이 기기에는 저장됐다.',
  'other-device': '다른 기기에서 로그인해 이 기기는 막혔다. 클라우드에 올리지 않는다.',
};

/** 게스트 상태 설명 (GDD 199장 3) */
export const GUEST_HINT = '게스트로 로그인했다. 계정을 연동하면 다른 기기에서도 이어 할 수 있다. 로그아웃하면 게스트 계정에는 다시 들어올 수 없다.';

/** 실패 줄 (GDD 232장 1): "클라우드 저장에 실패했다: 권한 없음(규칙 확인) · permission-denied. 잠시 뒤 다시 올린다." */
export function cloudErrorLine(s: CloudState): string {
  return s.lastError ? `클라우드 저장에 실패했다: ${cloudErrorText(s.lastError)}. 잠시 뒤 다시 올린다.` : CLOUD_STATUS_TEXT.error;
}

/** [다시 올리기] 버튼이 보이는가 (GDD 232장 2): 실패 상태이거나 다시 올리는 중 */
export const cloudRetryShown = (s: CloudState): boolean => !!s.user && (s.status === 'error' || s.retrying);

/** 설정 줄 설명 글 */
export function cloudHintText(s: CloudState): string {
  if (!s.user) return CLOUD_STATUS_TEXT[s.status === 'loading' ? 'loading' : 'signed-out'];
  const tail = s.status === 'synced' && s.savedAt !== null ? `클라우드 저장 ${formatPlayedAt(s.savedAt)}.` : s.status === 'error' && s.lastError ? cloudErrorLine(s) : CLOUD_STATUS_TEXT[s.status];
  if (s.user.anonymous) return `${GUEST_HINT} ${tail}`;
  const who = s.user.name ?? s.user.email ?? '계정';
  const head = `${who} 계정으로 로그인했다.`; // 이메일(영문)로 끝나면 조사를 못 붙여 '계정으로'
  return `${head} ${tail}`;
}

/** 첫 버튼 이름: 로그인 전 [Google 로그인] · 게스트 [계정 연동] · 로그인 뒤 [로그아웃] — 같은 자리 한 버튼 (173장 2 버튼 자리 고정) */
export const cloudButtonLabel = (s: CloudState): string => (s.user ? (s.user.anonymous ? '계정 연동' : '로그아웃') : 'Google 로그인');
/** 둘째 버튼 이름: 로그인 전 [이메일 로그인] · 게스트 [로그아웃] · 로그인 뒤 자리만 */
export const cloudSecondLabel = (s: CloudState): string => (s.user?.anonymous ? '로그아웃' : '이메일 로그인');

export const LINK_DIALOG_TEXT = {
  title: '계정 연동',
  body: '연동하면 이 세이브를 그 계정으로 이어 간다. 세이브가 이미 있는 계정에는 연동하지 못한다.',
  refusedTitle: '이 계정에는 이미 세이브가 있다',
  refusedBody: '게스트 세이브는 그 계정으로 옮기지 못한다. 그 계정으로 로그인하면 이 기기 세이브와 클라우드 세이브 중 하나를 고른다.',
  switchYes: '그 계정으로 로그인',
} as const;

/** 연동 거절 창 (GDD 199장 3): [취소] · [그 계정으로 로그인](게스트를 버리고 그 계정으로 — 기기 세이브는 고르기 창으로) */
export function linkRefusedDialog(text: string, switchTo: () => Promise<void>): () => void {
  return confirmDialog({
    title: LINK_DIALOG_TEXT.refusedTitle,
    body: text === LINK_TAKEN_TEXT ? LINK_DIALOG_TEXT.refusedBody : `${text} ${LINK_DIALOG_TEXT.refusedBody}`, // 제목과 같은 문구는 되풀이하지 않는다
    no: '취소', yes: LINK_DIALOG_TEXT.switchYes,
    focusNo: true,
    onYes: () => void switchTo().catch(() => { /* 실패는 CloudSync 가 다음 로그인 상태로 보여 준다 */ }),
  });
}

/** 계정 연동 고르기 (GDD 199장 3): [취소][이메일][Google]. Google 은 바로 팝업, 이메일은 연동 모드 이메일 창 */
export function linkPickerDialog(ui: CloudUi, onResult: (r: LinkOutcome) => void): () => void {
  return confirmDialog({
    title: LINK_DIALOG_TEXT.title,
    body: LINK_DIALOG_TEXT.body,
    no: '취소',
    alt: { label: '이메일', onClick: () => void emailLoginDialog(ui, 'link', (text, switchTo) => onResult({ ok: false, text, switchTo })) },
    yes: 'Google',
    onYes: () => void ui.link('google').then(onResult),
  });
}

/** 연동 결과 처리(설정 줄·처음 창 공용): 거절이면 거절 창, 실패 문구는 토스트(notify), 성공은 CloudSync 가 토스트 */
export function handleLinkOutcome(r: LinkOutcome, notify: (title: string, meta?: string) => void): void {
  if (r.ok) return;
  if (r.switchTo) linkRefusedDialog(r.text, r.switchTo);
  else notify('연동하지 못했다', r.text);
}

/** 설정 '로그인' 줄의 버튼 둘(Google 로그인/계정 연동/로그아웃 · 이메일 로그인/로그아웃)과 설명. paint 를 부르면 지금 상태로 글을 바꾼다 */
export function cloudPanelNodes(ui: CloudUi): { button: HTMLButtonElement; emailButton: HTMLButtonElement; retryButton: HTMLButtonElement; hint: HTMLElement; paint: () => void } {
  const b = button({ label: cloudButtonLabel(ui.state()), icon: 'i-cloud', size: 'small' });
  b.dataset.set = 'cloud-login';
  b.classList.add('bha-settings__cloud-btn'); // 로그인 전·후 글자 길이가 달라도 같은 폭·자리 (173장 2)
  // 둘째 버튼: 로그인 전 [이메일 로그인](196장 결정 7) · 게스트 [로그아웃](199장 3) · 로그인 뒤에는 자리만 남기고 숨긴다(위 버튼 자리 고정)
  const eb = button({ label: cloudSecondLabel(ui.state()), icon: 'i-key', size: 'small' });
  eb.dataset.set = 'cloud-email';
  eb.classList.add('bha-settings__cloud-btn');
  // [다시 올리기] (GDD 232장 2): 실패했을 때만 둘째 버튼 아래에 보인다 — 누르면 재시도 대기 없이 한 번, 진행 중이면 흐림
  const rb = button({ label: '다시 올리기', icon: 'i-cloud', size: 'small' });
  rb.dataset.set = 'cloud-retry';
  rb.classList.add('bha-settings__cloud-btn');
  rb.onclick = () => {
    if (rb.disabled) return;
    void ui.retry();
  };
  const hint = el('p', 'bha-faint bha-settings__hint', cloudHintText(ui.state()));
  const askSignOut = (s: CloudState) => confirmDialog({
    title: '로그아웃',
    body: s.user?.anonymous
      ? '게스트 계정은 로그아웃하면 다시 들어올 수 없다. 이 기기의 세이브는 그대로 남고, 클라우드 저장만 멈춘다.'
      : '로그아웃해도 이 기기의 세이브는 그대로 남는다. 클라우드 저장만 멈춘다.',
    yes: '로그아웃', no: '아니오',
    danger: !!s.user?.anonymous,
    onYes: () => ui.signOut(),
  });
  b.onclick = () => {
    const s = ui.state();
    if (s.status === 'loading') return;
    if (!s.user) {
      ui.warm();
      void ui.signIn();
    } else if (s.user.anonymous) linkPickerDialog(ui, (r) => handleLinkOutcome(r, ui.notify));
    else askSignOut(s);
  };
  eb.onclick = () => {
    const s = ui.state();
    if (s.status === 'loading') return;
    if (!s.user) {
      ui.warm();
      emailLoginDialog(ui);
    } else if (s.user.anonymous) askSignOut(s);
  };
  const relabel = (btn: HTMLButtonElement, label: string) => btn.replaceChildren(...[...btn.childNodes].filter((n) => n.nodeType !== Node.TEXT_NODE), label);
  const paint = () => {
    const s = ui.state();
    relabel(b, cloudButtonLabel(s));
    relabel(eb, cloudSecondLabel(s));
    b.disabled = s.status === 'loading';
    eb.disabled = s.status === 'loading';
    eb.classList.toggle('bha-settings__cloud-btn--hidden', !!s.user && !s.user.anonymous);
    rb.hidden = !cloudRetryShown(s);
    rb.disabled = s.retrying || s.status === 'saving';
    hint.textContent = cloudHintText(s);
  };
  paint();
  return { button: b, emailButton: eb, retryButton: rb, hint, paint };
}

/** [이 기기 / 클라우드] 고르기 창 (GDD 196장 4). 뒤로·Esc = 이 기기(클라우드 복사본은 슬롯 백업에 남아 되돌릴 수 있다) */
export function showCloudConflict(c: CloudConflict): () => void {
  const rows = info([
    { label: '이 기기', value: `${summaryLine(c.device.summary)}${c.device.playedAt !== null ? ` · ${formatPlayedAt(c.device.playedAt)}` : ''}`, mod: c.suggested === 'device' ? 'em' : undefined },
    { label: '클라우드', value: `${summaryLine(c.cloud.summary)} · ${formatPlayedAt(c.cloud.savedAt)}`, mod: c.suggested === 'cloud' ? 'em' : undefined },
  ]);
  rows.classList.add('bha-cloud-pick');
  return confirmDialog({
    title: `슬롯 ${c.slot} 세이브 고르기`,
    body: '이 기기와 클라우드의 세이브가 다르다. 고르지 않은 쪽은 슬롯 백업에 한 벌 남는다.',
    content: rows,
    no: '이 기기', yes: '클라우드',
    focusNo: c.suggested === 'device',
    onYes: () => c.choose('cloud'),
    onNo: () => c.choose('device'),
  });
}

export const GATE_TEXT = {
  title: '로그인',
  body: '로그인하면 세이브가 클라우드에 저장되고 다른 기기에서 이어 할 수 있다. 게스트로 시작해도 나중에 설정에서 계정을 연동할 수 있다.',
  google: 'Google 로그인',
  email: '이메일 로그인',
  guest: '게스트로 시작',
  /** 로그인 없이 하기 (GDD 222장 2): 고르면 기억해 다시 안 띄운다 */
  offline: '로그인 없이 하기',
  skipped: '이 기기에만 저장한다. 설정 > 기타에서 언제든 로그인할 수 있다.',
  /** 게스트 실패 (222장 2): 쉬운 말 + 로그인 없이 계속 */
  guestFailed: '로그인 없이 하기로 계속한다. 설정 > 기타에서 언제든 로그인할 수 있다.',
} as const;

/**
 * 처음 로그인 창 (GDD 199장 2): 로그인 안 된 채 켜면 처음 화면 위에. [Google 로그인]·[이메일 로그인]·[게스트로 시작]. 열리면 SDK 를 미리 받는다(199장 1).
 * 로그인되면(어느 방법이든 onChange 로) 닫고 onDone('signed-in'). 뒤로·Esc = 로그인 없이 기기 저장으로(onDone('skipped') — 기억하지 않아 다음에 다시 뜬다). 실패 문구는 창 안
 * GDD 222장 2: [로그인 없이 하기] = onDone('declined')(기억해 다시 안 띄움). [게스트로 시작] 이 실패하면 창을 닫고 onDone('guest-failed', 까닭) — 로그인 없이 계속
 */
export type GateOutcome = 'signed-in' | 'skipped' | 'declined' | 'guest-failed';
export function loginGateDialog(ui: CloudUi, onDone: (how: GateOutcome, why?: string) => void): () => void {
  let done = false;
  const finish = (how: GateOutcome, why?: string) => {
    if (done) return;
    done = true;
    off();
    m.close();
    onDone(how, why);
  };
  const m = modalLayer('bha-cloud-gate', GATE_TEXT.title, 'dialog', () => finish('skipped'));
  m.modal.append(el('p', 'bha-modal__body', GATE_TEXT.body));
  const status = el('div', 'bha-cloud-email__status');
  m.modal.append(status);
  const say = (text: string) => status.replaceChildren(notice('warn', text));
  const google = button({ label: GATE_TEXT.google, icon: 'i-cloud', variant: 'primary' });
  google.dataset.set = 'gate-google';
  const email = button({ label: GATE_TEXT.email, icon: 'i-key' });
  email.dataset.set = 'gate-email';
  const guest = button({ label: GATE_TEXT.guest, variant: 'ghost' });
  guest.dataset.set = 'gate-guest';
  const offline = button({ label: GATE_TEXT.offline, variant: 'ghost', onClick: () => finish('declined') });
  offline.dataset.set = 'gate-offline';
  const all = [google, email, guest]; // [로그인 없이 하기]는 늘 눌린다 (SDK 받는 중에도)
  let busy = false;
  const run = async (fn: () => Promise<string | null>) => {
    if (busy) return;
    busy = true;
    for (const b of all) b.disabled = true;
    try {
      const err = await fn();
      if (m.isClosed()) return;
      if (err) say(err);
    } finally {
      busy = false;
      if (!m.isClosed()) paint();
    }
  };
  google.onclick = () => void run(() => ui.signIn({ quiet: true }));
  // 게스트 실패(익명 로그인 꺼짐 등)는 창 안에 남기지 않고 로그인 없이 계속한다 (222장 2) — 그만둠(팝업 닫음 등)이 아니면
  guest.onclick = () =>
    void run(async () => {
      const err = await ui.signInGuest({ quiet: true });
      if (err && !ui.state().user) finish('guest-failed', err);
      return null;
    });
  email.onclick = () => void emailLoginDialog(ui); // 로그인되면 onChange 가 이 창도 닫는다
  const actions = el('div', 'bha-modal__actions bha-modal__actions--three');
  actions.append(google, email, guest);
  m.modal.append(actions);
  const skipRow = el('div', 'bha-modal__actions');
  skipRow.append(offline);
  m.modal.append(skipRow);
  const paint = () => {
    const s = ui.state();
    if (s.user) return finish('signed-in');
    const loading = s.status === 'loading' || busy;
    for (const b of all) b.disabled = loading;
  };
  const off = ui.onChange(paint);
  m.mount();
  ui.warm();
  paint();
  return () => finish('skipped');
}

export const BLOCKED_TEXT = {
  title: '다른 기기에서 로그인했다',
  body: '이 계정을 다른 기기에서 켰다. 이 기기의 진행은 저장했다. 여기서 이어 하면 그 기기가 막힌다.',
  retake: '다시 이 기기에서 하기',
  signOut: '로그아웃',
  signOutBody: '로그아웃하면 이 기기는 기기 저장으로만 이어 한다. 세이브는 그대로 남는다.',
} as const;

/**
 * 막기 창 (GDD 199장 4): 다른 기기가 이 계정을 차지했다. 뒤로·Esc 는 아무 일도 하지 않는다(플레이 막기). [로그아웃](기기 저장으로) · [다시 이 기기에서 하기](차지 → 저쪽이 막힘).
 * 닫기는 app.ts 가 onUnblocked 에서 부른다(차지 성공·로그아웃). 실패 문구는 창 안
 */
export function otherDeviceDialog(ui: CloudUi, by: ActiveDevice): () => void {
  const m = modalLayer('bha-cloud-blocked', BLOCKED_TEXT.title, 'alertdialog', null);
  m.modal.append(el('p', 'bha-modal__body', BLOCKED_TEXT.body));
  const rows = info([
    { label: '그 기기', value: by.name || '다른 기기', mod: 'em' },
    { label: '켠 시각', value: formatPlayedAt(by.at) },
  ]);
  rows.classList.add('bha-cloud-pick');
  m.modal.append(rows);
  const status = el('div', 'bha-cloud-email__status');
  m.modal.append(status);
  const out = button({ label: BLOCKED_TEXT.signOut, variant: 'ghost' });
  out.dataset.set = 'blocked-signout';
  const retake = button({ label: BLOCKED_TEXT.retake, variant: 'primary' });
  retake.dataset.set = 'blocked-retake';
  let busy = false;
  retake.onclick = async () => {
    if (busy) return;
    busy = true;
    retake.disabled = true;
    out.disabled = true;
    try {
      const err = await ui.reclaim();
      if (m.isClosed()) return;
      if (err) status.replaceChildren(notice('warn', err));
    } finally {
      busy = false;
      retake.disabled = false;
      out.disabled = false;
    }
  };
  out.onclick = () => confirmDialog({ title: BLOCKED_TEXT.signOut, body: BLOCKED_TEXT.signOutBody, yes: BLOCKED_TEXT.signOut, no: '아니오', focusNo: true, onYes: () => ui.signOut() });
  const actions = el('div', 'bha-modal__actions');
  actions.append(out, retake);
  m.modal.append(actions);
  m.mount();
  retake.focus({ preventScroll: true });
  return m.close;
}

/** 이름 줄 (설정·토스트): "○○ 계정" / "게스트" — 조사는 fixParticles 로 */
export const accountName = (s: CloudState): string => (s.user ? (s.user.anonymous ? '게스트' : fixParticles(`${s.user.name ?? s.user.email ?? '계정'}`)) : '');
