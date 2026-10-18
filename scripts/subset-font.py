#!/usr/bin/env python3
"""Pretendard Variable 서브셋 만들기 (U-5, C.24).

원본(docs/design/bha-design/fonts/PretendardVariable.woff2, 약 2MB)에서
  - 가중치 축을 400~800 으로 줄이고 (게임이 쓰는 굵기: 400/500/700/800)
  - 글자를 ASCII + 한글 KS X 1001 2,350자 + 게임 소스에서 쓰는 기호로 줄여
src/ui/bha/fonts/PretendardSubset.woff2 (약 300KB)를 만든다.
새 글자(KS X 1001 밖의 한글)를 문구에 쓰면 이 스크립트를 다시 돌린다.
필요: pip install fonttools brotli
사용: python3 scripts/subset-font.py
"""
import glob
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs/design/bha-design/fonts/PretendardVariable.woff2')
OUT = os.path.join(ROOT, 'src/ui/bha/fonts/PretendardSubset.woff2')

chars = set(chr(i) for i in range(32, 127))
for hi in range(0xB0, 0xC9):  # KS X 1001 한글 2,350자
    for lo in range(0xA1, 0xFF):
        try:
            chars.add(bytes([hi, lo]).decode('euc-kr'))
        except UnicodeDecodeError:
            pass
for pattern in ('src/**/*.ts', 'src/**/*.json', 'src/**/*.css', 'index.html'):
    for p in glob.glob(os.path.join(ROOT, pattern), recursive=True):
        chars |= set(open(p, encoding='utf8').read())
chars = {c for c in chars if not c.isspace() or c == ' '}

with tempfile.TemporaryDirectory() as tmp:
    text = os.path.join(tmp, 'chars.txt')
    open(text, 'w', encoding='utf8').write(''.join(sorted(chars)))
    inst = os.path.join(tmp, 'inst.woff2')
    subprocess.run(['fonttools', 'varLib.instancer', SRC, 'wght=400:800', '-o', inst], check=True)
    subprocess.run(['pyftsubset', inst, f'--text-file={text}', '--flavor=woff2', '--layout-features=*', f'--output-file={OUT}'], check=True)
print(f'{OUT}: {os.path.getsize(OUT) / 1024:.0f}KB, {len(chars)}자', file=sys.stderr)
