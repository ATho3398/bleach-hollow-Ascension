// 이름·성별 정하기 (GDD 199장 6~8, C.326 → 241-A 3: 두 화면을 한 화면으로 — 이름 아래 빈 자리에 성별 버튼): 새 게임은 종족 고르기 다음, 옛 세이브(이름 없음)는 이어할 때 한 번, 설정 > 기타 [이름·성별 바꾸기]도 같은 화면.
// 폰 가상 키보드가 아래 절반을 덮어도 보이게 입력 칸·주 버튼은 머리 바로 아래 첫 줄(자리 고정).
// 기기 버튼: ▲▼ = 입력 칸·주 버튼·남성·여성·[이전] 사이, ✓ = 누름. 종족 차이는 넘겨받은 종족 이름·로고뿐 (종족 id 분기 없음).
import type { FactionConfig } from '../engine/faction';
import { GENDER_LABEL, GENDERS, type Gender } from '../engine/gender';
import { checkName, IDENTITY_LATER_LINE, NAME_RULE, NAME_RULE_LINE, type NameCheck } from '../engine/playerName';
import { button, el, icon, mountApp } from './bha/dom';
import { lcdHead } from './bha/lcdpage';
import { logoMark } from './bha/logo';

/** new = 새 게임 · old = 옛 세이브 처음 정함(뒤로 없음) · edit = 설정에서 바꿈 */
export type IdentityMode = 'new' | 'old' | 'edit';

const MODE_TITLE: Record<IdentityMode, { title: string; done: string }> = {
  new: { title: '이름·성별 정하기', done: '시작' },
  old: { title: '이름·성별 정하기', done: '확인' },
  edit: { title: '이름·성별 바꾸기', done: '저장' },
};

/** 입력 칸 아래 안내 한 줄: 문제가 있으면 그 까닭(위험 색), 없으면 남은 칸 */
function paintMsg(msg: HTMLElement, count: HTMLElement, c: NameCheck, composing: boolean): void {
  // 분모는 늘 같은 값 (GDD 243장 9-8: 빈칸 '0/12' → 한글을 치면 '4/14'로 바뀌던 것) — 영어만 12자 한도는 안내 줄이 알린다
  count.textContent = `${c.width}/${NAME_RULE.widthMax}`;
  count.classList.toggle('is-over', !c.ok && c.problem === 'long');
  // 한글 조합 중(자음만 친 순간)에는 '자음·모음' 안내를 띄우지 않는다 — 다 치면 다시 본다
  const quiet = c.ok || (composing && c.problem === 'jamo') || (c.problem === 'empty');
  msg.classList.toggle('is-bad', !quiet);
  msg.textContent = c.ok ? '쓸 수 있는 이름이다' : quiet ? (c.problem === 'empty' ? '이름을 정한다' : '') : c.message;
}

export interface IdentityScreenOpts {
  mode: IdentityMode;
  initialName: string;
  /** 처음 고른 성별 (새 게임은 없음 → 고를 때까지 주 버튼 흐림) */
  initialGender: Gender | null;
  onDone: (name: string, gender: Gender) => void;
  /** 없으면 [이전] 자리를 흐리게 비워 둔다 (버튼 자리 고정, GDD 173장 2) */
  onBack?: () => void;
}

/** 이름·성별 한 화면 (GDD 241-A 3): 첫 줄 = 이름 칸 + 주 버튼(키보드에 안 가림), 안내 줄, 그 아래 빈 자리에 성별 버튼(남성·여성).
 *  성별 외형 안내 문구('○○ 뒤부터 모습이 달라진다')는 뺐다. 주 버튼은 이름이 맞고 성별을 골랐을 때만 */
export function identityScreen(root: HTMLElement, f: FactionConfig, o: IdentityScreenOpts): void {
  const t = MODE_TITLE[o.mode];
  const head = lcdHead({ title: t.title, sub: f.name, logo: logoMark(f, 'bha-logo--sm') ?? undefined });
  const input = el('input', 'bha-ident__input');
  input.type = 'text';
  input.value = o.initialName;
  input.maxLength = NAME_RULE.widthMax; // 붙여넣기 상한 (영어 13~14자·한글 8자 이상은 안내로 막는다)
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('enterkeyhint', 'done');
  input.setAttribute('aria-label', '이름');
  input.placeholder = '이름';
  input.dataset.ident = 'name';
  const count = el('span', 'bha-ident__count bha-num');
  let picked: Gender | null = o.initialGender;
  const done = button({ label: t.done, icon: 'i-check', variant: 'primary', onClick: () => go() });
  done.classList.add('bha-ident__main');
  done.dataset.ident = 'done';
  const msg = el('p', 'bha-ident__msg');
  const field = el('div', 'bha-ident__field');
  msg.setAttribute('role', 'status');
  msg.setAttribute('aria-live', 'polite');
  let composing = false;
  const check = (): NameCheck => {
    const c = checkName(input.value);
    paintMsg(msg, count, c, composing);
    if (c.ok && picked === null) msg.textContent = '아래에서 성별을 고른다';
    field.classList.toggle('is-bad', msg.classList.contains('is-bad')); // 오류면 바깥 박스 하나만 빨강 (C.327)
    done.disabled = !c.ok || picked === null;
    return c;
  };
  const list = el('div', 'bha-ident__genders');
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', '성별');
  list.dataset.scList = '';
  const cards = GENDERS.map((g) => {
    const b = el('button', 'bha-ident__gender');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.gender = g;
    b.append(icon('i-check', undefined, 'bha-ident__tick'), el('span', '', GENDER_LABEL[g]));
    b.onclick = () => {
      picked = g;
      paint();
    };
    return b;
  });
  const paint = () => {
    for (const b of cards) {
      const on = b.dataset.gender === picked;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    }
    check();
  };
  const go = () => {
    const c = check();
    if (!c.ok) return;
    if (picked === null) {
      cards[0]?.focus({ preventScroll: true });
      return;
    }
    o.onDone(c.name, picked);
  };
  input.addEventListener('input', check);
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; check(); });
  // Enter = 주 버튼(성별을 아직 안 골랐으면 성별 칸으로), Esc = 입력 칸에서 나감(기기 뒤로까지 번지지 않게) — 조합 중 Enter 는 글자 확정이라 넘기지 않는다
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      go();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      input.blur();
    }
  });
  field.append(input, count);
  const row = el('div', 'bha-ident__row');
  row.append(field, done);
  list.append(...cards);
  const body = el('div', 'bha-ident__body');
  body.append(row, msg, list, el('p', 'bha-ident__rule', NAME_RULE_LINE), el('p', 'bha-ident__later', IDENTITY_LATER_LINE));
  mountApp(root, { cls: 'bha-lcdpage bha-ident bha-ident--one' }, head, body, backFoot(o.onBack));
  paint();
  queueMicrotask(() => input.focus({ preventScroll: true }));
}

/** 아래 줄 [이전] — 없으면 같은 자리에 흐린 버튼 (다른 버튼이 당겨 오지 않게, GDD 173장 2) */
function backFoot(onBack?: () => void): HTMLElement {
  const foot = el('footer', 'bha-lcdpage__foot bha-ident__foot');
  const back = button({ label: '이전', icon: 'i-chevron-left', variant: 'ghost', size: 'small', disabled: !onBack, onClick: onBack });
  back.dataset.ident = 'back';
  if (!onBack) back.setAttribute('data-dev-skip', '');
  foot.append(back);
  return foot;
}
