// 세이브 백업 화면 (Q-1, C.29): 설정에서 연다. 왼쪽 = 내보내기(파일·복사), 오른쪽 = 불러오기(파일·붙여넣기 → 확인 → 적용 후 새로고침).
// 검증·직렬화는 src/saveBackup.ts. 모든 조작은 버튼이라 위/아래/확정/취소로 할 수 있다 (붙여넣기 칸은 손가락 보조).
import { getFaction } from '../data/factions';
import type { SaveData } from '../game';
import {
  applyImport, BACKUP_REASON_TEXT, backupFileName, hasBackup, IMPORT_FAILURE_TEXT, parseImport, serializeSave, swapWithBackup, type ImportResult,
} from '../saveBackup';
import { formatPlayedAt, readBackupMeta } from '../saveSlots';
import { button, el, info, mountApp, notice, panel, type NoticeKind } from './bha/dom';
import { lcdHead, lcdPageParts } from './bha/lcdpage';

type Status = { kind: NoticeKind; text: string } | null;
type Pending = Extract<ImportResult, { ok: true }>;

function storageOrNull(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export interface BackupViewOptions {
  /** 대상 슬롯 (기본 1). 불러오기·되돌리기는 이 슬롯의 키에 쓴다 */
  slot?: number;
  /** true 면 내보내기 칸을 숨기고 불러오기만 (시작 화면의 [불러오기]) */
  importOnly?: boolean;
  /** 가져오기·되돌리기가 저장소에 반영된 뒤 부른다. 없으면 페이지를 새로 연다 */
  onApplied?: () => void;
}

export function backupView(root: HTMLElement, current: SaveData | null, persist: () => void, opts: BackupViewOptions = {}): void {
  const slot = opts.slot ?? 1;
  const applied = () => {
    if (opts.onApplied) opts.onApplied();
    else location.reload();
  };
  const storage = storageOrNull();
  let status: Status = null;
  let pending: Pending | null = null;
  /** 붙여넣기·복사를 손으로 해야 할 때 보이는 칸 */
  let manual: { mode: 'paste' | 'copy'; text: string } | null = null;

  const say = (kind: NoticeKind, text: string) => {
    status = { kind, text };
    render();
  };

  const download = () => {
    if (!current) return say('warn', '내보낼 세이브가 없다. 먼저 종족을 고르고 시작해야 한다.');
    persist();
    const name = backupFileName(current);
    try {
      const url = URL.createObjectURL(new Blob([serializeSave(current)], { type: 'application/json' }));
      const a = el('a');
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      say('good', `파일로 저장했다: ${name}`);
    } catch {
      say('danger', '파일 저장이 막혀 있다. [복사]를 써 본다.');
    }
  };

  const copy = async () => {
    if (!current) return say('warn', '내보낼 세이브가 없다. 먼저 종족을 고르고 시작해야 한다.');
    persist();
    const text = serializeSave(current);
    try {
      await navigator.clipboard.writeText(text);
      manual = null;
      say('good', `클립보드에 복사했다 (${text.length.toLocaleString()}자). 메모 등에 붙여넣어 보관한다.`);
    } catch {
      manual = { mode: 'copy', text };
      say('warn', '자동 복사가 막혀 있다. 아래 칸의 글을 직접 전체 선택해 복사한다.');
    }
  };

  const consider = (text: string) => {
    const r = parseImport(text);
    manual = null;
    if (r.ok) {
      pending = r;
      status = null;
      render();
    } else {
      say('danger', IMPORT_FAILURE_TEXT[r.reason]);
    }
  };

  const pickFile = () => {
    const input = el('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/plain';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        consider(await f.text());
      } catch {
        say('danger', '파일을 읽지 못했다.');
      }
    };
    input.click();
  };

  const paste = async () => {
    try {
      consider(await navigator.clipboard.readText());
    } catch {
      manual = { mode: 'paste', text: '' };
      say('info', '자동 붙여넣기가 막혀 있다. 아래 칸에 직접 붙여넣고 [확인]을 누른다.');
    }
  };

  const apply = () => {
    if (!pending) return;
    if (!storage || !applyImport(storage, pending.save, slot)) {
      pending = null;
      return say('danger', '저장 공간이 막혀 있어 가져오지 못했다. 현재 세이브는 그대로다.');
    }
    pending = null;
    say('good', '가져왔다. 화면을 새로 연다…');
    setTimeout(applied, 700);
  };

  const revert = () => {
    if (!storage || !swapWithBackup(storage, slot)) return say('danger', '되돌릴 백업이 없다.');
    say('good', '이전 세이브로 되돌렸다. 화면을 새로 연다…');
    setTimeout(applied, 700);
  };

  const textArea = (): HTMLElement | null => {
    if (!manual) return null;
    const ta = el('textarea', 'bha-backup__text');
    ta.rows = 3;
    ta.value = manual.text;
    ta.readOnly = manual.mode === 'copy';
    ta.setAttribute('aria-label', manual.mode === 'copy' ? '복사할 세이브 글' : '붙여넣을 세이브 글');
    ta.addEventListener('focus', () => manual?.mode === 'copy' && ta.select());
    const wrap = el('div', 'bha-backup__manual');
    wrap.append(ta);
    if (manual.mode === 'paste') wrap.append(button({ label: '확인', icon: 'i-check', onClick: () => consider(ta.value) }));
    return wrap;
  };

  const confirmPanel = (p: Pending): HTMLElement => {
    const f = getFaction(p.save.factionId);
    const rows = [
      { label: '슬롯', value: `슬롯 ${slot}` },
      { label: '종족', value: f.name },
      { label: '단계', value: `${p.save.evolution.tierIndex + 1}단계 ${f.tierNames[p.save.evolution.tierIndex] ?? ''}` },
      { label: '원정', value: `${p.save.runLog.runs.length}회` },
      ...(p.migrated ? [{ label: '형식', value: `v${p.fromFormat} → 현재 형식으로 올림` }] : []),
    ];
    const act = el('div', 'bha-backup__row');
    act.append(
      button({ label: '덮어쓰기', icon: 'i-check', variant: 'danger', onClick: apply }),
      button({ label: '취소', variant: 'ghost', onClick: () => { pending = null; render(); } }),
    );
    return panel({ title: '이 세이브를 불러올까?' }, info(rows), notice('warn', '현재 세이브를 덮어씁니다. 덮어쓰기 전의 세이브는 한 번 보관되어 설정에서 되돌릴 수 있다.'), act);
  };

  const render = () => {
    const exportP = panel({ title: '내보내기', aside: current ? `형식 v${current.meta.format}` : undefined });
    const row = el('div', 'bha-backup__row');
    row.append(button({ label: '파일로 저장', icon: 'i-deck', onClick: download }), button({ label: '복사', icon: 'i-deck', onClick: () => void copy() }));
    exportP.append(row, el('p', 'bha-faint', '세이브 전체를 .json 파일이나 글로 보관한다. 조작 판정 설정은 기기마다 달라 담지 않는다.'));
    if (manual?.mode === 'copy') exportP.append(textArea()!);

    let right: HTMLElement;
    if (pending) {
      right = confirmPanel(pending);
    } else {
      right = panel({ title: '불러오기' });
      const r2 = el('div', 'bha-backup__row');
      r2.append(button({ label: '파일 선택', icon: 'i-deck', onClick: pickFile }), button({ label: '붙여넣기', icon: 'i-deck', onClick: () => void paste() }));
      right.append(r2, el('p', 'bha-faint', '형식을 확인한 뒤 덮어쓰기 전에 한 번 묻는다. 새 버전·손상된 세이브는 거부한다.'));
      if (manual?.mode === 'paste') right.append(textArea()!);
    }

    const foot: Node[] = [];
    if (hasBackup(storage, slot)) {
      foot.push(button({ label: '이전 세이브로 되돌리기', icon: 'i-loop', onClick: revert }));
      // 자동 백업 (GDD 24-5): 언제 무엇 직전에 보관했는지
      const meta = readBackupMeta(storage, slot);
      if (meta) foot.push(el('p', 'bha-faint', `보관된 세이브: ${BACKUP_REASON_TEXT[meta.reason]} · ${formatPlayedAt(meta.at)}`));
    }
    if (status) foot.push(notice(status.kind, status.text));
    const head = lcdHead({ title: opts.importOnly ? '불러오기' : '세이브 백업', sub: opts.importOnly ? `슬롯 ${slot}에 넣는다` : `슬롯 ${slot} · 내보내기 · 불러오기` });
    const p = opts.importOnly
      ? lcdPageParts({ cls: 'bha-backup-page', foot }, head, [right], [])
      : lcdPageParts({ cls: 'bha-backup-page', foot }, head, [exportP], [right]);
    mountApp(root, { cls: p.cls }, ...p.nodes);
  };
  render();
}
