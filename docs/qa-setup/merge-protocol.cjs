// 검수 프로토콜 합치기 — 프로토콜 폴더(.claude/ · CLAUDE.md · project.yaml)를 이 게임 폴더에 덮어쓰지 않고 합친다.
// 실행: node docs/qa-setup/merge-protocol.cjs <프로토콜 폴더 경로>   (윈도우는 qa-setup.bat 에 폴더를 끌어다 놓기)
// 하는 일: ① 새 브랜치 qa-review 로 옮김(백업) ② .claude/ 파일 복사 — 없는 파일은 그대로 복사, 같은 이름 json 은 합침
//   (객체는 합치고 배열은 중복 없이 더하고 값이 다르면 프로토콜 값), 같은 이름 다른 파일은 원본을 <이름>.game-backup 으로 남기고 프로토콜 것을 씀
//   ③ 프로토콜 CLAUDE.md → QA-PROTOCOL.md 로 복사하고 게임 CLAUDE.md 끝에 불러오기 줄(@QA-PROTOCOL.md) 추가
//   ④ project.yaml 복사(있으면 원본을 project.yaml.game-backup 으로) ⑤ 커밋
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const GAME = path.resolve(__dirname, '../..');
const SRC = process.argv[2] ? path.resolve(process.argv[2].replace(/^"|"$/g, '')) : '';
const log = (m) => console.log(m);
const die = (m) => { console.error('\n[멈춤] ' + m); process.exit(1); };

if (!SRC || !fs.existsSync(SRC)) die('프로토콜 폴더를 찾지 못했다. 사용법: node docs/qa-setup/merge-protocol.cjs <프로토콜 폴더>');
const has = (p) => fs.existsSync(path.join(SRC, p));
if (!has('.claude') && !has('CLAUDE.md') && !has('project.yaml')) die(`${SRC} 안에 .claude/ · CLAUDE.md · project.yaml 이 하나도 없다. 프로토콜 폴더 맞는지 확인.`);

const git = (c) => execSync(`git ${c}`, { cwd: GAME, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
// ① 백업 브랜치
try {
  if (git('status --porcelain')) die('게임 폴더에 커밋 안 된 변경이 있다. 먼저 커밋하거나 되돌린 뒤 다시 실행.');
  const cur = git('rev-parse --abbrev-ref HEAD');
  if (cur !== 'qa-review') {
    const exists = git('branch --list qa-review');
    git(exists ? 'checkout qa-review' : 'checkout -b qa-review');
  }
  log(`① 브랜치 qa-review (원래 ${cur} 는 그대로 남음)`);
} catch (e) { die('git 실행 실패: ' + (e.stderr?.toString() || e.message)); }

const report = [];
function mergeJson(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    const out = [...a];
    for (const x of b) if (!out.some((y) => JSON.stringify(y) === JSON.stringify(x))) out.push(x);
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = k in a ? mergeJson(a[k], b[k]) : b[k];
    return out;
  }
  return b;
}
function copyTree(rel) {
  const s = path.join(SRC, rel), d = path.join(GAME, rel);
  if (fs.statSync(s).isDirectory()) {
    fs.mkdirSync(d, { recursive: true });
    for (const n of fs.readdirSync(s)) copyTree(path.join(rel, n));
    return;
  }
  if (!fs.existsSync(d)) { fs.copyFileSync(s, d); report.push(`  새로 복사: ${rel}`); return; }
  const sb = fs.readFileSync(s), db = fs.readFileSync(d);
  if (sb.equals(db)) return;
  if (rel.endsWith('.json')) {
    try {
      const merged = mergeJson(JSON.parse(db.toString()), JSON.parse(sb.toString()));
      fs.writeFileSync(d, JSON.stringify(merged, null, 2) + '\n');
      report.push(`  합침(json): ${rel}`);
      return;
    } catch { /* 아래로 */ }
  }
  if (!fs.existsSync(d + '.game-backup')) fs.copyFileSync(d, d + '.game-backup');
  fs.copyFileSync(s, d);
  report.push(`  교체(원본은 ${rel}.game-backup): ${rel}`);
}
// ② .claude/
if (has('.claude')) { copyTree('.claude'); log('② .claude/ 합침'); } else log('② .claude/ 없음 — 건너뜀');
// ③ CLAUDE.md
if (has('CLAUDE.md')) {
  fs.copyFileSync(path.join(SRC, 'CLAUDE.md'), path.join(GAME, 'QA-PROTOCOL.md'));
  const cm = path.join(GAME, 'CLAUDE.md');
  const body = fs.readFileSync(cm, 'utf8');
  if (!body.includes('@QA-PROTOCOL.md')) {
    fs.writeFileSync(cm, body.replace(/\s*$/, '\n') + '\n# 검수 프로토콜 (qa-review 브랜치 전용)\n\n아래 문서의 검수 절차를 따른다. 게임 규칙(위 내용)과 부딪히면 게임 규칙이 먼저다.\n\n@QA-PROTOCOL.md\n');
  }
  report.push('  CLAUDE.md: 프로토콜 → QA-PROTOCOL.md, 게임 CLAUDE.md 끝에 불러오기 줄');
  log('③ CLAUDE.md 합침');
} else log('③ CLAUDE.md 없음 — 건너뜀');
// ④ project.yaml
if (has('project.yaml')) {
  const d = path.join(GAME, 'project.yaml');
  if (fs.existsSync(d) && !fs.existsSync(d + '.game-backup') && !fs.readFileSync(d).equals(fs.readFileSync(path.join(SRC, 'project.yaml')))) fs.copyFileSync(d, d + '.game-backup');
  fs.copyFileSync(path.join(SRC, 'project.yaml'), d);
  report.push('  project.yaml 복사');
  log('④ project.yaml 복사');
} else log('④ project.yaml 없음 — 건너뜀');
// ⑤ 커밋
try {
  git('add -A');
  if (git('status --porcelain')) git('commit -q -m "qa-review: 검수 프로토콜 합침 (.claude/ · QA-PROTOCOL.md · project.yaml)"');
  log('⑤ 커밋 완료 (qa-review 브랜치)');
} catch (e) { die('커밋 실패: ' + (e.stderr?.toString() || e.message)); }
log('\n바뀐 파일:\n' + (report.join('\n') || '  없음'));
log('\n끝. 이제 이 게임 폴더에서 Claude Code 를 새로 켜면 된다. 원래대로 돌아가려면: git checkout main');
