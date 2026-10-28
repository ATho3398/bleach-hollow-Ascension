"""종이인형 파일 자리 (GDD 96장 36): 작업본(고정) ↔ 게임본 분리.

작업본 = 사용자가 고정한 값·새 시트·동작 수정이 먼저 들어가는 곳. 편집기·시험 페이지·가이드가 이것을 쓴다.
  docs/design/rig-draft/humanoid.json · motions.json · humanoid/<부위 그림>
게임본 = 게임이 쓰는 것. 사용자가 "게임 넣어"라고 할 때만 promote.py 가 작업본을 통째로 옮긴다.
  src/data/art/rig/humanoid.json · motions.json · public/art/rig/humanoid/<부위 그림> (+ still/ 정지 그림, 고정 파일)
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DRAFT_DIR = os.path.join(ROOT, 'docs', 'design', 'rig-draft')
DRAFT_RIG_JSON = os.path.join(DRAFT_DIR, 'humanoid.json')
DRAFT_MOTIONS = os.path.join(DRAFT_DIR, 'motions.json')
DRAFT_ART = os.path.join(DRAFT_DIR, 'humanoid')
GAME_RIG_JSON = os.path.join(ROOT, 'src', 'data', 'art', 'rig', 'humanoid.json')
GAME_MOTIONS = os.path.join(ROOT, 'src', 'data', 'art', 'rig', 'motions.json')
GAME_ART = os.path.join(ROOT, 'public', 'art', 'rig', 'humanoid')
