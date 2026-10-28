# sprite-rig — 도트 그림 한 장 → 걷기·공격 프레임

게임 코드와 무관한 개발용 도구. 그림을 부위로 나눠(종이인형 방식) 동작 틀대로 돌리고 옮겨 프레임 PNG·가로 시트를 뽑는다.

```
python3 scripts/sprite-rig/rig.py scripts/sprite-rig/rigs/skin-brute.json --debug
python3 scripts/sprite-rig/rig.py scripts/sprite-rig/rigs/skin-brute.json --motion move --frames 3   # 걷기만 3장
```

출력 `scripts/sprite-rig/out/<그림 키>/`: `move-1~5.png`, `attack-1~5.png`(기획서 26-2 이름 규칙), `anim.json`(ms·hit),
확인용 `<동작>-sheet.png`, `<동작>-preview.gif`, `rig-debug.png`(부위 색칠·관절점). 맞으면 프레임과 anim.json 을 `public/art/<그림 키>/`로 옮긴다.

## 리그 파일 (`rigs/<그림 키>.json`)
| 항목 | 뜻 |
|---|---|
| `image` | 원본 그림(리그 파일 기준 상대 경로) |
| `template` | 동작 틀: `biped`(두 발), `float`(다리 없는 부유) — `motions.py` |
| `rootPivot` | 몸통(나머지 전부)이 도는 점, 보통 두 발 사이 바닥 |
| `parts[]` | `name`(head·armF·armB·legF·legB·tail), `poly`(부위 다각형, 먼저 적힌 것이 우선), `pivot`(관절), `z`(앞뒤, 클수록 앞), `parent`(기본 root), `backfill`(관절 틈 메우는 칸 수) |
| `amp` | 동작별 각도 배율, 예 `{"attack": 0.7}` |

부위 다각형·관절은 Claude가 그림을 보고 초안을 쓰고 `--debug` 그림으로 확인·수정한다.
캔버스 가장자리에 닿으면 경고가 뜬다(256 캔버스를 꽉 채운 그림은 공격 때 팔이 잘릴 수 있음).
