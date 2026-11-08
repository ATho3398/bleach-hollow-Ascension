// 클라우드 세이브 화면 조각 (GDD 196장, C.323): 설정 > 기타 '로그인' 줄의 글·버튼과 [이 기기 / 클라우드] 고르기 창.
// 문구는 text-style '~다' 체, 모양은 기존 bha- 부품(button·info·confirmDialog)만 — 새 CSS 없음. 종족 이름·단계 이름은 종족 설정에서 읽는다.
import type { CloudConflict, CloudState, CloudSummary, EmailAction } from '../cloudSave';
import { FACTIONS } from '../data/factions';
import { fixParticles } from '../engine/josa';
import { formatPlayedAt } from '../saveSlots';
import { confirmDialog } from './confirmDialog';
import { button, el, info, notice } from './bha/dom';
import { trapModalFocus } from './bha/modalFocus';
import { getOverlayHost, registerLayer } from './bha/overlayHost';

/** 설정 화면이 쓰는 조작 묶음 (app.ts 가 CloudSync 로 만든다) */
export interface CloudUi {
  state(): CloudState;
  signIn(): void;
  signOut(): void;
  /** 이메일 로그인·가입·비밀번호 재설정 (GDD 196장 결정 7): 실패 문구를 돌려준다(없으면 null) */
  email(kind: EmailAction, email: string, password: string): Promise<string | null>;
  /** 상태가 바뀌면 부른다. 해제 함수 */
  onChange(cb: () => void): () => void;
}

export const EMAIL_DIALOG_TEXT = {
  title: '이메일 로그인',
  email: '이메일',
  password: '비밀번호 (6자 이상)',
  sent: '비밀번호 재설정 메일을 보냈다. 메일함을 확인한다.',
  signedUp: '가입했다. 로그인됐다.',
} as const;

/** 이메일 로그인 창 (GDD 196장 결정 7): 이메일·비밀번호 칸 + [취소][가입][로그인], 칸 아래 [비밀번호 잊음]. 실패 문구는 창 안에 남고 창은 열려 있다.
 *  폰(796 터치)에서 키보드가 올라오면 기기 틀이 줄어든다(device.ts visualViewport) — 칸은 창 맨 위, 창 본문은 스크롤, 초점 칸은 보이게 민다 */
export function emailLoginDialog(ui: CloudUi): () => void {
  const layer = el('div', 'bha-overlay bha-overlay--in-app bha-confirm bha-cloud-email');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', EMAIL_DIALOG_TEXT.title);
  const modal = el('div', 'bha-modal');
  modal.append(el('h2', 'bha-modal__title', EMAIL_DIALOG_TEXT.title));
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
  const pwIn = field('password', 'password', EMAIL_DIALOG_TEXT.password, 'current-password');
  const status = el('div', 'bha-cloud-email__status');
  const forgot = button({ label: '비밀번호 잊음', size: 'small', variant: 'ghost' });
  forgot.dataset.set = 'cloud-email-reset';
  form.append(emailIn, pwIn, forgot, status);
  modal.append(form);
  let closed = false;
  let busy = false;
  let unregister: () => void = () => {};
  let untrap: () => void = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    unregister();
    layer.remove();
    untrap();
  };
  const cancel = button({ label: '취소', variant: 'ghost', onClick: close });
  const signup = button({ label: '가입' });
  signup.dataset.set = 'cloud-email-signup';
  const login = button({ label: '로그인', variant: 'primary' });
  login.dataset.set = 'cloud-email-login';
  const say = (kind: 'warn' | 'good', text: string) => status.replaceChildren(notice(kind, text));
  const run = async (kind: EmailAction) => {
    if (busy) return;
    busy = true;
    for (const b of [signup, login, forgot]) b.disabled = true;
    try {
      const err = await ui.email(kind, emailIn.value, pwIn.value);
      if (closed) return;
      if (err) say('warn', err);
      else if (kind === 'reset') say('good', EMAIL_DIALOG_TEXT.sent);
      else close();
    } finally {
      busy = false;
      for (const b of [signup, login, forgot]) b.disabled = false;
    }
  };
  forgot.onclick = () => void run('reset');
  signup.onclick = () => void run('signup');
  login.onclick = () => void run('login');
  form.onsubmit = (e) => {
    e.preventDefault();
    void run('login');
  };
  const actions = el('div', 'bha-modal__actions bha-modal__actions--three');
  actions.append(cancel, signup, login);
  modal.append(actions);
  layer.append(modal);
  getOverlayHost().append(layer);
  untrap = trapModalFocus(layer);
  emailIn.focus({ preventScroll: true });
  unregister = registerLayer(layer, close);
  return close;
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
};

/** 설정 줄 설명 글 */
export function cloudHintText(s: CloudState): string {
  if (!s.user) return CLOUD_STATUS_TEXT[s.status === 'loading' ? 'loading' : 'signed-out'];
  const who = s.user.name ?? s.user.email ?? '계정';
  const head = `${who} 계정으로 로그인했다.`; // 이메일(영문)로 끝나면 조사를 못 붙여 '계정으로'
  const tail = s.status === 'synced' && s.savedAt !== null ? `클라우드 저장 ${formatPlayedAt(s.savedAt)}.` : CLOUD_STATUS_TEXT[s.status];
  return `${head} ${tail}`;
}

/** 버튼 이름: 로그인 전 [Google 로그인] · 로그인 뒤 [로그아웃] — 같은 자리 한 버튼 (173장 2 버튼 자리 고정) */
export const cloudButtonLabel = (s: CloudState): string => (s.user ? '로그아웃' : 'Google 로그인');

/** 설정 '로그인' 줄의 버튼 둘(Google 로그인/로그아웃 · 이메일 로그인)과 설명. paint 를 부르면 지금 상태로 글을 바꾼다 */
export function cloudPanelNodes(ui: CloudUi): { button: HTMLButtonElement; emailButton: HTMLButtonElement; hint: HTMLElement; paint: () => void } {
  const b = button({ label: cloudButtonLabel(ui.state()), icon: 'i-cloud', size: 'small' });
  b.dataset.set = 'cloud-login';
  b.classList.add('bha-settings__cloud-btn'); // 로그인 전·후 글자 길이가 달라도 같은 폭·자리 (173장 2)
  // 이메일 로그인 (GDD 196장 결정 7): 로그인 뒤에는 자리만 남기고 숨긴다(위 버튼 자리 고정)
  const eb = button({ label: '이메일 로그인', icon: 'i-key', size: 'small', onClick: () => void emailLoginDialog(ui) });
  eb.dataset.set = 'cloud-email';
  eb.classList.add('bha-settings__cloud-btn');
  const hint = el('p', 'bha-faint bha-settings__hint', cloudHintText(ui.state()));
  b.onclick = () => {
    const s = ui.state();
    if (s.status === 'loading') return;
    if (s.user) confirmDialog({
      title: '로그아웃',
      body: '로그아웃해도 이 기기의 세이브는 그대로 남는다. 클라우드 저장만 멈춘다.',
      yes: '로그아웃', no: '아니오',
      onYes: () => ui.signOut(),
    });
    else ui.signIn();
  };
  const paint = () => {
    const s = ui.state();
    b.replaceChildren(...[...b.childNodes].filter((n) => n.nodeType !== Node.TEXT_NODE), cloudButtonLabel(s));
    b.disabled = s.status === 'loading';
    eb.disabled = s.status === 'loading';
    eb.classList.toggle('bha-settings__cloud-btn--hidden', !!s.user);
    hint.textContent = cloudHintText(s);
  };
  paint();
  return { button: b, emailButton: eb, hint, paint };
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
