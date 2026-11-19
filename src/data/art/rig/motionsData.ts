// 종이인형 동작 데이터 (C.509, 점검B 5): 동작 JSON 은 합쳐 약 750KB 라 메인 번들에서 떼어 따로 받는다.
// pose.ts 의 loadRigMotions() 가 동적 import 로 불러 RIG_PACKS 에 채운다(앱은 첫 화면 전에 기다린다 — main.ts).
// 서비스 워커가 미리 캐시하는 assets/*.js 에 들어가므로 오프라인에서도 그대로 열린다.
import humanoid from './motions.json';
import serpent from './serpent-motions.json';
import beast from './beast-motions.json';
import spider from './spider-motions.json';
import wraith from './wraith-motions.json';
import ichigo from './ichigo-motions.json';
import mugetsu from './mugetsu-motions.json';

/** 뼈대 id(RIG_PACKS) → 동작 JSON 원본 */
export const RIG_MOTIONS_RAW: Record<string, unknown> = { humanoid, serpent, beast, spider, wraith, ichigo, mugetsu };
