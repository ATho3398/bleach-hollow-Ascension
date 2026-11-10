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


def look_art(look, art):
    """외형의 몸 부위 그림 경로 — artFolder(색 외형, GDD 115-A 85)가 있으면 그 폴더의 같은 이름 그림 (pose.ts lookArt 와 같음)"""
    f = look.get('artFolder')
    return f'{f}/{art.rsplit("/", 1)[-1]}' if isinstance(f, str) else art


def rig_paths(rid):
    """뼈대 id → (작업본 뼈대, 작업본 동작, 작업본 그림 폴더, 게임 뼈대, 게임 동작, 게임 그림 폴더). 사람형 = 위 이름들, 그 밖(serpent 등) = <id>.json·<id>-motions.json·<id>/ (GDD 115-A 100)"""
    if rid == 'humanoid':
        return DRAFT_RIG_JSON, DRAFT_MOTIONS, DRAFT_ART, GAME_RIG_JSON, GAME_MOTIONS, GAME_ART
    gd = os.path.join(ROOT, 'src', 'data', 'art', 'rig')
    return (os.path.join(DRAFT_DIR, f'{rid}.json'), os.path.join(DRAFT_DIR, f'{rid}-motions.json'), os.path.join(DRAFT_DIR, rid),
            os.path.join(gd, f'{rid}.json'), os.path.join(gd, f'{rid}-motions.json'), os.path.join(ROOT, 'public', 'art', 'rig', rid))


# 게임에 넣는 뼈대 (promote.py·still.py). 짐승형(beast)도 게임에 넣는다(GDD 228장)
GAME_RIGS = ('humanoid', 'serpent', 'beast', 'spider')  # 거미형도(GDD 231장)
