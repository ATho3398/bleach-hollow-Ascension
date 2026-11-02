# AI 검수 결과 JSON → 엑셀 (GDD 167장 5). 지난 UI 검수(docs/drafts/블리치_UI검수_1031.xlsx)와 같은 열·모양, 캡처 썸네일.
# 사용: python3 scripts/ai-tools/make-xlsx.py <결과.json> <출력.xlsx>
#   결과.json = { "title": str, "sub": str, "header": [...], "rows": [[...]], "shots": [절대 경로 or ""], "summary": [str, ...] }
import json, os, sys
from openpyxl import Workbook
from openpyxl.drawing.image import Image as XlImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from PIL import Image as PILImage

data = json.load(open(sys.argv[1], encoding='utf-8'))
out = sys.argv[2]

FONT = 'Malgun Gothic'
thin = Side(style='thin', color='BFBFBF')
border = Border(left=thin, right=thin, top=thin, bottom=thin)
head_fill = PatternFill('solid', fgColor='1F3864')
memo_fill = PatternFill('solid', fgColor='FFF2CC')
sev_fill = {'상': PatternFill('solid', fgColor='F8CBAD'), '중': PatternFill('solid', fgColor='FFE699'), '하': PatternFill('solid', fgColor='E2EFDA')}
wrap = Alignment(wrap_text=True, vertical='top')

WIDTH = {'번호': 5, '심각도': 6, '묶음': 14, '화면': 22, '걸음': 10, '종족': 7, '관점': 12, '문제': 48, '추천 수정': 42, '마스터 메모': 30, '고칠까(O/X)': 10, '캡처': 46}
THUMB_W = 340

wb = Workbook()
ws = wb.active
ws.title = data.get('sheet', 'AI 검수')
header = data['header']
for i, h in enumerate(header, 1):
    c = ws.cell(row=1, column=i, value=h)
    c.font = Font(name=FONT, size=10, bold=True, color='FFFFFF')
    c.fill = head_fill
    c.alignment = Alignment(wrap_text=True, vertical='center')
    c.border = border
    ws.column_dimensions[get_column_letter(i)].width = WIDTH.get(h, 12)
ws.freeze_panes = 'A2'

shot_col = header.index('캡처') + 1
sev_col = header.index('심각도') + 1
memo_cols = {header.index('마스터 메모') + 1, header.index('고칠까(O/X)') + 1}
tmp = []
for r, (vals, shot) in enumerate(zip(data['rows'], data['shots']), 2):
    for i, v in enumerate(vals, 1):
        c = ws.cell(row=r, column=i, value=v)
        c.font = Font(name=FONT, size=10)
        c.alignment = wrap
        c.border = border
        if i in memo_cols:
            c.fill = memo_fill
        if i == sev_col and v in sev_fill:
            c.fill = sev_fill[v]
    ws.row_dimensions[r].height = 135
    if shot and os.path.exists(shot):
        im = PILImage.open(shot)
        w, h = im.size
        th = int(h * THUMB_W / w)
        small = im.resize((THUMB_W, th))
        p = os.path.join(os.path.dirname(out) or '.', f'.thumb_{os.getpid()}_{r}.png')
        small.save(p)
        tmp.append(p)
        x = XlImage(p)
        x.width, x.height = THUMB_W, th
        ws.add_image(x, f'{get_column_letter(shot_col)}{r}')
        ws.row_dimensions[r].height = max(135, th * 0.78)

sm = wb.create_sheet('요약')
sm.column_dimensions['A'].width = 120
sm['A1'] = data.get('title', '')
sm['A1'].font = Font(name=FONT, size=14, bold=True)
sm['A2'] = data.get('sub', '')
sm['A2'].font = Font(name=FONT, size=9, color='595959')
for i, line in enumerate(data.get('summary', []), 4):
    c = sm.cell(row=i, column=1, value=line)
    c.font = Font(name=FONT, size=10)
    c.alignment = Alignment(wrap_text=True, vertical='top')

wb.save(out)
for p in tmp:
    os.remove(p)
print(f'엑셀 저장: {out} ({len(data["rows"])}행)')
