#!/usr/bin/env python3
"""기획서 v6 압축 검증 (docs/GDD.md ↔ docs/GDD-archive-v5.md).

확인하는 것
 1. 보관본의 `[미정]` 줄을 하나도 빠짐없이 분류했는가(아래 OLD 표) — 보관본에 표에 없는 `[미정]` 줄이 있거나 표의 줄이 사라지면 실패.
 2. '열림'으로 분류한 항목(U-nn)이 새 기획서 18절에 `[미정]` 표시와 함께 있는가.
 3. 새 기획서 줄 수가 1,500줄 이하인가, 절 머리(1~20·부록 A)가 다 있는가.
 4. CLAUDE.md·docs/automation.md 가 가리키는 기획서 절(6-8·7-15·16-2·16-3·16-4·2-3·7절·17절·18절·19절·20절·1-4·U-01·U-02)이 실제로 있는가.
 5. 부록 A 대응표가 옛 장 0~245 를 모두 덮는가.
쓰는 법: python3 scripts/gdd-v6-check.py  (실패하면 종료 코드 1)
"""
import re, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
new = (ROOT / 'docs/GDD.md').read_text(encoding='utf-8')
arc = (ROOT / 'docs/GDD-archive-v5.md').read_text(encoding='utf-8').split('\n')
fails = []

# 보관본의 [미정] 줄: (줄에 들어 있는 고유 조각, 분류). 분류 = 'U-nn'(18절에 열려 있음) / '해소' / '언급'(다른 미정을 가리키기만 함)
OLD = [
 ('표시가 붙은 항목은 아직 결정되지 않은 것이다', '언급'),
 ('계통마다 해방 변주 규칙 1개씩만 정의', 'U-03'),
 ('- [미정] 계통 종류와 개수, 특성 풀', 'U-01'),
 ('몇 종으로 할지는 [미정]이라 임시', '해소'),
 ('[미정] 실제 수치, 상승·하락량, 한계값', 'U-02'),
 ('[미정] 등급전 실제 룰, 전투 형태', 'U-08'),
 ('[미정] 모든 히든 조건', 'U-04'),
 ('230장 4: [미정] 강공2', '해소'),
 ('오른손 치기(`rpunch`)·어퍼컷(`uppercut`)', '해소'),
 ('100장 신설: UI/UX 전수 점검', 'U-04'),
 ('확정된 히든 조건이 없으므로(11-7 [미정])', 'U-04'),
 ('C.14 구현 결과(v1.2 보충)', 'U-04'),
 ('후속 1~7번(P7) 전체 완료', 'U-02'),
 ('C.38(S-1) 구현 결과(보충)', '해소'),
 ('5장의 [미정] "실제 수치, 상승·하락량, 한계값"은 이 절로 대체', '해소'),
 ('얻는 곳·쓰는 곳·수치는 **[미정]**', '해소'),
 ('판매 목록·가격은 **[미정]**', '해소'),
 ('자유 원정 등장 타이밍은 [미정](나중에 사용자와 정함)', '해소'),
 ('자유 원정 등장 타이밍은 [미정](사용자와 나중에)', '해소'),
 ('## 37. 보스 자유 원정 등장', '해소'),
 ('**칭호 조건(#75)**: 11-7 [미정] 그대로', 'U-04'),
 ('C.171 구현 완료 (코딩117', 'U-04'),
 ('사신 단계별 외형(1단계 \'혼백\' 등)은 **[미정]**', 'U-05'),
 ('구현 완료 (C.189, v5.263, 코딩135)', 'U-05'),
 ('63. **동작 쓰임새 · 박치기', '해소'),
 ('게임 데이터에 있으나 연결 없음(쓰임새 [', 'U-06'),
 ('정한 것(마스터): **보고만**(코드 수정 없음)', '언급'),
 ('**20 적 이름**: 기획서에 적 정식 이름이 정해졌는지 확인', '해소'),
 ('7. 설정 > 기타에 [이름·성별 바꾸기]', 'U-07'),
 ('C.326', 'U-07'),
 ('specialBlockName', '해소'),
]
old_lines = [(i + 1, l) for i, l in enumerate(arc) if '[미정]' in l]
used = set()
for no, line in old_lines:
    hit = [k for k, (frag, _) in enumerate(OLD) if frag in line and k not in used]
    if not hit:
        fails.append(f'보관본 {no}줄의 [미정]이 분류표에 없다: {line[:80]}')
    else:
        used.add(hit[0])
for k, (frag, cls) in enumerate(OLD):
    if k not in used:
        fails.append(f'분류표 항목이 보관본에서 사라졌다: {frag}')
m = re.search(r'^## 18\..*?(?=^## 19\.)', new, re.S | re.M)
sec18 = m.group(0) if m else ''
if not sec18:
    fails.append('새 기획서에 18절이 없다')
open_ids = sorted({c for _, c in OLD if c.startswith('U-')})
for uid in open_ids:
    if not re.search(rf'^- \*\*{uid} \[미정\]\*\*', sec18, re.M):
        fails.append(f'열린 미정 {uid} 가 18절에 [미정] 표시로 없다')
n_open18 = len(re.findall(r'^- \*\*U-\d+ \[미정\]\*\*', sec18, re.M))
cnt = {c: sum(1 for _, x in OLD if (x if not x.startswith('U-') else '열림') == c) for c in ('열림', '해소', '언급')}

lines = new.split('\n')
if len(lines) > 1500:
    fails.append(f'새 기획서가 {len(lines)}줄 — 1,500줄을 넘는다')
for n in range(1, 21):
    if not re.search(rf'^## {n}\. ', new, re.M):
        fails.append(f'{n}절 머리가 없다')
if not re.search(r'^## 부록 A', new, re.M):
    fails.append('부록 A 가 없다')
if not re.match(r'# .*기획서 v6\.\d{3}', lines[0]):
    fails.append('첫 줄에 v6 버전이 없다')

# CLAUDE.md·automation.md 가 가리키는 곳
need = {'6-8': r'^### 6-8 난이도와 권장 단계', '7-15': r'^### 7-15 전투 시간 목표', '16-2': r'^### 16-2 런 로그',
        '16-3': r'^### 16-3 마이그레이션 원칙', '16-4': r'^### 16-4 로그인·클라우드 저장', '2-3': r'^### 2-3 폴더 구조',
        '1-4': r'^### 1-4 대화용 용어', '19-1': r'^### 19-1 로드맵 표', '19-2': r'^### 19-2 현재 상태'}
for k, pat in need.items():
    if not re.search(pat, new, re.M):
        fails.append(f'CLAUDE.md/automation.md 가 가리키는 {k} 소절이 없다')
for word, where in [('hpInAttacks', '6-8'), ('MIN_LOADABLE_SAVE_FORMAT', '16-3'), ('runLog.ts', '16-2'), ('Firestore', '16-4'),
                    ('STAGE_LABEL', '19절'), ('임시값 허용', '18절'), ('배속 없음', '7-15'), ('S-23', '19-1')]:
    if word not in new:
        fails.append(f'{where} 에 있어야 할 낱말 "{word}" 이 없다')
docs = (ROOT / 'CLAUDE.md').read_text(encoding='utf-8') + (ROOT / 'docs/automation.md').read_text(encoding='utf-8')
for ref in re.findall(r'(?:기획서|GDD) (\d+-\d+)', docs):
    if not re.search(rf'^### {ref} ', new, re.M):
        fails.append(f'문서가 가리키는 기획서 {ref} 소절이 없다')
for ref in re.findall(r'(?:기획서|GDD) (\d+)절', docs):
    if not re.search(rf'^## {ref}\. ', new, re.M):
        fails.append(f'문서가 가리키는 기획서 {ref}절이 없다')
stale = re.findall(r'기획서 \d+장', (ROOT / 'CLAUDE.md').read_text(encoding='utf-8'))
if stale:
    fails.append(f'CLAUDE.md 에 옛 장 번호 참조가 남았다: {stale}')

# 부록 A 범위
m = re.search(r'^## 부록 A.*', new, re.S | re.M)
covered = set()
for a, b in re.findall(r'(?:^- |\| )(\d+)(?:~(\d+))?→', m.group(0) if m else '', re.M):
    covered.update(range(int(a), int(b or a) + 1))
miss = [n for n in range(0, 246) if n not in covered]
if miss:
    fails.append(f'부록 A 에 없는 옛 장: {miss[:20]}')

print(f'보관본 [미정] 줄 {len(old_lines)}개 = 열림 {cnt["열림"]}(항목 {len(open_ids)}개: {", ".join(open_ids)}) + 해소 {cnt["해소"]} + 언급만 {cnt["언급"]}')
print(f'새 기획서: {len(lines)}줄, 18절의 열린 미정 {n_open18}개(옛 표시 {len(open_ids)}개 + 표시 없던 결정 대기 {n_open18 - len(open_ids)}개), 본문 전체 [미정] 표시 줄 {sum(1 for l in lines if "[미정]" in l)}개')
if fails:
    print('실패 %d건' % len(fails)); [print(' -', f) for f in fails]; sys.exit(1)
print('통과')
