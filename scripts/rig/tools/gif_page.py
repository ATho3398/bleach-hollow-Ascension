#!/usr/bin/env python3
"""GIF 보기 페이지 (사용자 2026-11-15 "앞으로 gif면 무조건 내가 볼 수 있게 아티팩트에 넣어서 띄워", GDD 115-A 139).
GIF·PNG 를 페이지 안에 통째로 넣은 .rig-pages/gif-viewer.html 을 만든다(맨 위가 가장 새 것, 최근 14개까지 — 목록은 .rig-pages/gifs/list.json).
사용: python3 scripts/rig/tools/gif_page.py "<묶음 제목>" "<설명>=<파일>" ["<설명>=<파일>" …]   → 만든 뒤 Artifact 로 올린다(같은 주소).
"""
import base64
import datetime
import html
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
D = os.path.join(ROOT, '.rig-pages', 'gifs')
KEEP = 14


def main():
    os.makedirs(D, exist_ok=True)
    lp = os.path.join(D, 'list.json')
    items = json.load(open(lp, encoding='utf-8')) if os.path.exists(lp) else []
    group, now = sys.argv[1], datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime('%m-%d %H:%M')
    new = []
    for i, a in enumerate(sys.argv[2:]):
        cap, f = a.rsplit('=', 1)
        name = f'{datetime.datetime.now().strftime("%m%d%H%M%S")}-{i}{os.path.splitext(f)[1]}'
        shutil.copy(f, os.path.join(D, name))
        new.append({'group': group, 'time': now, 'cap': cap, 'file': name})
    items = (new + items)[:KEEP]
    for f in os.listdir(D):
        if f != 'list.json' and f not in {x['file'] for x in items}:
            os.remove(os.path.join(D, f))
    json.dump(items, open(lp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    cards, last = [], None
    for x in items:
        key = (x['group'], x['time'])
        if key != last:
            cards.append(f'<h2>{html.escape(x["group"])} <small>{x["time"]} KST</small></h2>')
            last = key
        b = base64.b64encode(open(os.path.join(D, x['file']), 'rb').read()).decode()
        mime = 'image/gif' if x['file'].endswith('.gif') else 'image/png'
        cards.append(f'<figure><img alt="{html.escape(x["cap"])}" src="data:{mime};base64,{b}"><figcaption>{html.escape(x["cap"])}</figcaption></figure>')
    page = '''<title>도트 움직임 보기</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* 한 줄로 쌓인 그림 카드 — 맨 위가 가장 새 것. 그림은 도트라 또렷하게(pixelated) */
:root { --bg: #f3f4f1; --panel: #ffffff; --fg: #1f2421; --mute: #66706a; --line: #d6dbd5; --stage: #9db09a;
  --font: "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #171a18; --panel: #202522; --fg: #e8ece8; --mute: #98a39b; --line: #343b36; --stage: #4c5a4f; color-scheme: dark } }
:root[data-theme="dark"] { --bg: #171a18; --panel: #202522; --fg: #e8ece8; --mute: #98a39b; --line: #343b36; --stage: #4c5a4f; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font-family: var(--font); padding-block: 20px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)) }
main { max-width: 760px; margin: 0 auto; display: grid; gap: 12px }
h1 { font-size: 20px; margin: 0 }
p.note { margin: 0; color: var(--mute); font-size: 13px }
h2 { font-size: 15px; margin: 14px 0 0; text-wrap: balance }
h2 small { color: var(--mute); font-weight: 400; font-size: 12px; margin-left: 6px }
figure { margin: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden }
figure img { display: block; margin: 0 auto; max-width: 100%; image-rendering: pixelated; background: var(--stage) }
figcaption { padding: 8px 12px; font-size: 13px; border-top: 1px solid var(--line) }
</style>
<main>
<h1>도트 움직임 보기</h1>
<p class="note">새로 만든 GIF·그림이 맨 위에 쌓입니다(최근 ''' + str(KEEP) + '''개).</p>
''' + '\n'.join(cards) + '\n</main>\n'
    out = os.path.join(ROOT, '.rig-pages', 'gif-viewer.html')
    open(out, 'w', encoding='utf-8').write(page)
    print(out, len(items), '개', os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main()
